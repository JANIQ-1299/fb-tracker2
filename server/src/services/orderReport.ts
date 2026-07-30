import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * يبني تقرير طلبات لأي نافذة زمنية [windowStart, windowEnd) اعتمادًا على DetectedOrderIncrement
 * الحقيقية (فروقات onsite_conversion.messaging_order_created_v2). يُستخدم من كل من
 * /api/dashboard/last-24-hours ومهمة التقرير اليومي، لتفادي ازدواج المنطق.
 */
export async function buildOrderReport(windowStart: Date, windowEnd: Date) {
  const increments = await prisma.detectedOrderIncrement.findMany({
    where: { detectedAt: { gte: windowStart, lte: windowEnd } },
    include: { ad: { include: { adSet: { include: { campaign: true } }, creative: true } } },
  });

  const lastSync = await prisma.syncRun.findFirst({
    where: { status: { in: ["success", "partial"] } },
    orderBy: { startedAt: "desc" },
  });
  const lastAnySync = await prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } });

  const totalOrders = increments.reduce((s, i) => s + i.newMetaOrders, 0);
  const totalSpend = increments.reduce((s, i) => s + i.spendDelta, 0);

  const videoMap = new Map<
    string,
    {
      videoId: string | null;
      thumbnailUrl: string | null;
      spend: number;
      metaRecordedOrders: number;
      adNames: Set<string>;
      campaignNames: Set<string>;
      lastOrderAt: Date | null;
      mixedCreative: boolean;
    }
  >();

  for (const inc of increments) {
    const creative = inc.ad.creative;
    const key = inc.videoId ? `v:${inc.videoId}` : `ad:${inc.adId}`;
    if (!videoMap.has(key)) {
      videoMap.set(key, {
        videoId: inc.videoId,
        thumbnailUrl: creative?.thumbnailUrl ?? null,
        spend: 0,
        metaRecordedOrders: 0,
        adNames: new Set(),
        campaignNames: new Set(),
        lastOrderAt: null,
        mixedCreative: creative?.sourceType === "ASSET_FEED",
      });
    }
    const v = videoMap.get(key)!;
    v.spend += inc.spendDelta;
    v.metaRecordedOrders += inc.newMetaOrders;
    v.adNames.add(inc.ad.name);
    v.campaignNames.add(inc.ad.adSet.campaign.name);
    if (inc.newMetaOrders > 0 && (!v.lastOrderAt || inc.detectedAt > v.lastOrderAt)) v.lastOrderAt = inc.detectedAt;
  }

  const videos = [...videoMap.values()]
    .map((v) => ({
      videoId: v.videoId,
      videoName: v.adNames.size === 1 ? [...v.adNames][0] : null,
      thumbnailUrl: v.thumbnailUrl,
      adNames: [...v.adNames],
      campaignNames: [...v.campaignNames],
      spend: round(v.spend),
      metaRecordedOrders: v.metaRecordedOrders,
      conversationConfirmedOrders: null,
      cancelledOrders: null,
      metaCostPerOrder: v.metaRecordedOrders > 0 ? round(v.spend / v.metaRecordedOrders) : null,
      conversationCostPerOrder: null,
      coverageRate: null,
      reconciliationStatus: v.mixedCreative ? "mixed_creative" : "meta_only_no_conversation_data",
      lastOrderAt: v.lastOrderAt?.toISOString() ?? null,
    }))
    .sort((a, b) => b.metaRecordedOrders - a.metaRecordedOrders || b.spend - a.spend);

  const adMap = new Map<string, { adName: string; campaignName: string; spend: number; orders: number }>();
  for (const inc of increments) {
    if (!adMap.has(inc.adId)) {
      adMap.set(inc.adId, { adName: inc.ad.name, campaignName: inc.ad.adSet.campaign.name, spend: 0, orders: 0 });
    }
    const a = adMap.get(inc.adId)!;
    a.spend += inc.spendDelta;
    a.orders += inc.newMetaOrders;
  }
  const ads = [...adMap.entries()]
    .map(([adId, a]) => ({
      adId,
      adName: a.adName,
      campaignName: a.campaignName,
      spend: round(a.spend),
      metaRecordedOrders: a.orders,
      metaCostPerOrder: a.orders > 0 ? round(a.spend / a.orders) : null,
    }))
    .sort((a, b) => b.metaRecordedOrders - a.metaRecordedOrders);

  return {
    generatedAt: new Date().toISOString(),
    timezone: env.tz,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    summary: {
      totalSpend: round(totalSpend),
      metaRecordedOrders: totalOrders,
      averageMetaCostPerOrder: totalOrders > 0 ? round(totalSpend / totalOrders) : null,
      lastSuccessfulSync: lastSync?.completedAt?.toISOString() ?? null,
      lastSyncStatus: lastAnySync?.status ?? "never_run",
      conversationConfirmedOrders: null,
      pendingOrders: null,
      cancelledOrders: null,
      organicOrders: null,
      unattributedOrders: null,
      averageConversationCostPerOrder: null,
      coverageRate: null,
    },
    videos,
    ads,
    pendingReview: [] as unknown[],
    dataLimitations: [
      "conversationConfirmedOrders / pendingOrders / cancelledOrders / organicOrders / unattributedOrders / coverageRate: " +
        "غير متاحة لأن صلاحيتي Meta (pages_messaging و instagram_manage_messages) غير ممنوحتين لهذا التطبيق. " +
        "جميع أرقام metaRecordedOrders/spend/cost per order مصدرها حقيقي 100% من Marketing API.",
    ],
  };
}
