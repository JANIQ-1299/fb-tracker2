import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { env, isMetaConfigured } from "../lib/env.js";
import { metaGet } from "../lib/meta.js";
import { logger } from "../lib/logger.js";
import { fetchAndExtractCreative } from "../services/attribution.js";

const ORDER_ACTION_TYPE = "onsite_conversion.messaging_order_created_v2";

// قفل مزامنة داخل نفس العملية (single Node process) لمنع تشغيل مزامنتين معًا — سواء المُجدولة
// أو "تحديث الآن" اليدوي من لوحة التحكم أو استعادة بعد إقلاع الجهاز، كلها تمر من هنا.
let syncInProgress = false;

/**
 * يجلب Insights (spend, impressions, reach, clicks, leads, cost_per_result) من Meta
 * على مستوى campaign/adset/ad لحساب ادخل CPL/CPA/ROAS. يتعامل مع تأخر بيانات Meta:
 * نطلب آخر 3 أيام في كل مرة حتى تكتمل Insights المتأخرة (Meta تُحدّثها بأثر رجعي أحيانًا).
 *
 * بالإضافة لذلك يحسب "الطلبات الجديدة منذ آخر فحص" (Delta) لكل إعلان: قيمة
 * onsite_conversion.messaging_order_created_v2 التي تعيدها Meta ليوم معيّن هي تراكمية طوال ذلك
 * اليوم (ترتفع كل ساعة كلما وقعت طلبات جديدة)، فلحساب "كم طلبًا جديدًا خلال آخر ساعة/24 ساعة"
 * يجب مقارنتها بآخر لقطة محفوظة لنفس الإعلان + نفس اليوم، وليس أخذها كما هي. راجع DECISIONS.md.
 */
export async function runInsightsSync() {
  if (!isMetaConfigured()) {
    logger.warn("تخطي مزامنة Insights: Meta غير مهيأة بعد");
    return { skipped: true };
  }

  if (syncInProgress) {
    logger.warn("مزامنة أخرى قيد التنفيذ بالفعل - تم تخطي هذا الاستدعاء (sync lock)");
    return { skipped: true, reason: "sync_in_progress" };
  }
  syncInProgress = true;
  const workspaceId = env.legacyWorkspaceId;

  const log = await prisma.syncLog.create({ data: { source: "meta_insights", status: "RUNNING" } });
  const syncRun = await prisma.syncRun.create({ data: { status: "running" } });

  try {
    const since = new Date();
    since.setDate(since.getDate() - 3);
    const sinceStr = since.toISOString().slice(0, 10);
    const untilStr = new Date().toISOString().slice(0, 10);

    const insights = await metaGet<any>(`act_${env.metaAdAccountId}/insights`, {
      level: "ad",
      time_range: JSON.stringify({ since: sinceStr, until: untilStr }),
      time_increment: "1",
      fields: "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,clicks,actions,cost_per_action_type,date_start",
      limit: "500",
    });

    const adAccount = await prisma.adAccount.upsert({
      where: { workspaceId_metaAdAccountId: { workspaceId, metaAdAccountId: env.metaAdAccountId } },
      update: {},
      create: { workspaceId, metaAdAccountId: env.metaAdAccountId, name: "نضارة" },
    });

    let count = 0;
    let totalNewOrders = 0;
    let hadNegativeDelta = false;

    for (const row of insights.data ?? []) {
      if (!row.campaign_id || !row.adset_id || !row.ad_id) continue; // صف بلا هيكل إعلاني كامل - نتخطاه
      const leadsAction = (row.actions ?? []).find((a: any) => a.action_type === "lead");
      const ordersAction = (row.actions ?? []).find((a: any) => a.action_type === ORDER_ACTION_TYPE);
      const spend = Number(row.spend ?? 0);
      const metaOrderCount = Number(ordersAction?.value ?? 0);
      const metaDate = new Date(row.date_start);

      // نُنشئ سجلات الحملة/المجموعة/الإعلان من بيانات Insights نفسها إن لم تكن موجودة بعد
      // (بدل انتظار وصول Lead أولًا) حتى لا يبقى الإنفاق بلا مرجع صالح.
      const campaign = await prisma.campaign.upsert({
        where: { workspaceId_metaCampaignId: { workspaceId, metaCampaignId: row.campaign_id } },
        update: { name: row.campaign_name ?? undefined },
        create: {
          workspaceId,
          metaCampaignId: row.campaign_id,
          name: row.campaign_name ?? row.campaign_id,
          adAccountId: adAccount.id,
        },
      });
      const adSet = await prisma.adSet.upsert({
        where: { workspaceId_metaAdSetId: { workspaceId, metaAdSetId: row.adset_id } },
        update: { name: row.adset_name ?? undefined },
        create: {
          workspaceId,
          metaAdSetId: row.adset_id,
          name: row.adset_name ?? row.adset_id,
          campaignId: campaign.id,
        },
      });
      let ad = await prisma.ad.upsert({
        where: { workspaceId_metaAdId: { workspaceId, metaAdId: row.ad_id } },
        update: { name: row.ad_name ?? undefined },
        create: { workspaceId, metaAdId: row.ad_id, name: row.ad_name ?? row.ad_id, adSetId: adSet.id },
      });

      // إثراء الإعلان بالفيديو/الـCreative عند اكتشافه أول مرة عبر Insights (حملات مراسلة لا
      // تصل عبرها Leads إطلاقًا، لذا لا يمكن الاعتماد على مسار الـWebhook لهذا الربط).
      if (!ad.creativeId) {
        try {
          const extracted = await fetchAndExtractCreative(row.ad_id);
          const creative = await prisma.creative.upsert({
            where: { workspaceId_metaCreativeId: { workspaceId, metaCreativeId: extracted.metaCreativeId } },
            update: {
              videoId: extracted.videoId ?? undefined,
              postId: extracted.postId ?? undefined,
              thumbnailUrl: extracted.thumbnailUrl ?? undefined,
              sourceType: extracted.sourceType,
              extractionNote: extracted.extractionNote ?? undefined,
            },
            create: {
              workspaceId,
              metaCreativeId: extracted.metaCreativeId,
              videoId: extracted.videoId,
              postId: extracted.postId,
              reelId: extracted.reelId,
              thumbnailUrl: extracted.thumbnailUrl,
              sourceType: extracted.sourceType,
              extractionNote: extracted.extractionNote,
              rawMetadata: JSON.stringify(extracted.rawMetadata).slice(0, 20_000),
            },
          });
          ad = await prisma.ad.update({ where: { id: ad.id }, data: { creativeId: creative.id } });
        } catch (err) {
          logger.warn({ adId: row.ad_id, err: (err as Error).message }, "فشل إثراء الإعلان بالـCreative من Insights");
        }
      }

      await prisma.insightSnapshot.upsert({
        where: {
          date_level_campaignId_adSetId_adId: {
            date: metaDate,
            level: "ad",
            campaignId: campaign.id,
            adSetId: adSet.id,
            adId: ad.id,
          } as any,
        },
        update: {
          spend,
          impressions: Number(row.impressions ?? 0),
          reach: Number(row.reach ?? 0),
          clicks: Number(row.clicks ?? 0),
          leadsCount: Number(leadsAction?.value ?? 0),
          ordersCount: metaOrderCount,
        },
        create: {
          date: metaDate,
          level: "ad",
          campaignId: campaign.id,
          adSetId: adSet.id,
          adId: ad.id,
          spend,
          impressions: Number(row.impressions ?? 0),
          reach: Number(row.reach ?? 0),
          clicks: Number(row.clicks ?? 0),
          leadsCount: Number(leadsAction?.value ?? 0),
          ordersCount: metaOrderCount,
        },
      });

      // ---- Delta tracking: مقارنة هذه اللقطة بآخر لقطة سابقة لنفس الإعلان + نفس اليوم ----
      const previousSnapshot = await prisma.adPerformanceSnapshot.findFirst({
        where: { adId: ad.id, metaDate },
        orderBy: { snapshotTime: "desc" },
      });

      const adCreative = ad.creativeId ? await prisma.creative.findUnique({ where: { id: ad.creativeId } }) : null;

      const newSnapshot = await prisma.adPerformanceSnapshot.create({
        data: {
          adId: ad.id,
          campaignId: campaign.id,
          adSetId: adSet.id,
          creativeId: ad.creativeId,
          videoId: adCreative?.videoId ?? null,
          metaDate,
          spend,
          metaOrderCount,
          actionsRaw: JSON.stringify(row.actions ?? []).slice(0, 10_000),
          syncRunId: syncRun.id,
          isBaseline: !previousSnapshot,
        },
      });

      if (previousSnapshot) {
        const rawDelta = metaOrderCount - previousSnapshot.metaOrderCount;
        const newMetaOrders = Math.max(0, rawDelta);
        if (rawDelta < 0) {
          hadNegativeDelta = true;
          logger.warn(
            { adId: row.ad_id, previous: previousSnapshot.metaOrderCount, current: metaOrderCount },
            "meta_order_count_decreased - تم تجاهل القيمة السالبة (احُتسبت صفرًا)",
          );
        }
        const spendDelta = Math.max(0, spend - previousSnapshot.spend);

        await prisma.detectedOrderIncrement.upsert({
          where: { adId_snapshotId: { adId: ad.id, snapshotId: newSnapshot.id } },
          update: {},
          create: {
            adId: ad.id,
            campaignId: campaign.id,
            adSetId: adSet.id,
            creativeId: ad.creativeId,
            videoId: adCreative?.videoId ?? null,
            windowStart: previousSnapshot.snapshotTime,
            windowEnd: newSnapshot.snapshotTime,
            previousCount: previousSnapshot.metaOrderCount,
            currentCount: metaOrderCount,
            newMetaOrders,
            spendDelta,
            snapshotId: newSnapshot.id,
            syncRunId: syncRun.id,
          },
        });
        totalNewOrders += newMetaOrders;
      }
      // لا نُنشئ DetectedOrderIncrement لأول لقطة (Baseline) — لا يوجد أساس صالح للمقارنة بعد.

      count++;
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "SUCCESS", completedAt: new Date(), details: `تمت مزامنة ${count} صف Insights` },
    });
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: hadNegativeDelta ? "partial" : "success",
        completedAt: new Date(),
        adsProcessed: count,
        metaOrdersDetected: totalNewOrders,
      },
    });
    logger.info({ count, totalNewOrders }, "اكتملت مزامنة Insights");
    return { count, totalNewOrders };
  } catch (err: any) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", completedAt: new Date(), details: err.message },
    });
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: { status: "failed", completedAt: new Date(), errorMessage: String(err.message).slice(0, 2000) },
    });
    logger.error({ err: err.message }, "فشلت مزامنة Insights");
    throw err;
  } finally {
    syncInProgress = false;
  }
}

/** يتحقق هل تأخّرت آخر مزامنة أكثر من الفاصل الزمني المتوقع، وينفّذ واحدة فورًا إن كان كذلك. يُستدعى عند إقلاع الخادم (مثلًا بعد إغلاق الجهاز وإعادة تشغيله لاحقًا). */
export async function catchUpIfOverdue() {
  if (!env.autoSyncEnabled || !isMetaConfigured()) return;
  const last = await prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } });
  const overdueThresholdMs = 65 * 60 * 1000; // ساعة + هامش 5 دقائق
  if (!last || Date.now() - last.startedAt.getTime() > overdueThresholdMs) {
    logger.info("لم تُنفَّذ مزامنة حديثة (أو لا توجد سابقة) - تشغيل مزامنة فورية عند الإقلاع");
    runInsightsSync().catch((err) => logger.error({ err: err.message }, "فشلت مزامنة الإقلاع الفورية"));
  }
}

export function scheduleInsightsJob() {
  if (!env.autoSyncEnabled) {
    logger.warn("AUTO_SYNC_ENABLED=false - تم تعطيل جدولة مزامنة Insights التلقائية");
    return;
  }
  cron.schedule(env.autoSyncCron, () => runInsightsSync().catch(() => {}), { timezone: env.tz });
  logger.info({ cron: env.autoSyncCron, tz: env.tz }, "تمت جدولة مهمة Insights");
  catchUpIfOverdue();
}

if (process.argv.includes("--once")) {
  runInsightsSync()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
