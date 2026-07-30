// سكربت هجرة لمرة واحدة: ينقل كل البيانات الحقيقية من قاعدة SQLite القديمة (أحادية المستأجر)
// إلى Postgres الجديد (Multi-Tenant)، ويربطها بأول Workspace حقيقي (الذي أنشأه seedWorkspace.ts).
//
// الاستخدام:
//   npm run migrate:sqlite-to-postgres --workspace=server -- --workspace-id=<id>
// إن لم تُمرَّر --workspace-id وكان هناك Workspace واحد فقط في Postgres، سيُستخدم تلقائيًا.
//
// **مهم**: شغّله على نسخة من ملف dev.db القديم (وليس الأصلي مباشرة) للتأكد من عدم الكتابة فوقه
// بالخطأ، ثم تحقق من النتيجة في Postgres قبل اعتماد الأصل.

import "dotenv/config";
import { PrismaClient as LegacyClient } from "../node_modules/.legacy-sqlite-client/index.js";
import { PrismaClient as PgClient } from "@prisma/client";

const legacy = new LegacyClient();
const pg = new PgClient();

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function resolveWorkspaceId(): Promise<string> {
  const explicit = arg("workspace-id");
  if (explicit) return explicit;

  const workspaces = await pg.workspace.findMany({ select: { id: true, name: true } });
  if (workspaces.length === 1) return workspaces[0].id;
  if (workspaces.length === 0) {
    throw new Error(
      "لا يوجد أي Workspace في Postgres بعد. شغّل أولًا: npm run seed:workspace --workspace=server",
    );
  }
  throw new Error(
    `يوجد أكثر من Workspace واحد (${workspaces.map((w) => `${w.name}:${w.id}`).join(", ")}). ` +
      "مرّر --workspace-id=<id> لتحديد الوجهة الصحيحة.",
  );
}

async function main() {
  const workspaceId = await resolveWorkspaceId();
  console.log(`سيتم نقل البيانات إلى Workspace: ${workspaceId}`);

  await pg.$transaction(
    async (tx) => {
      // ---- Business ----
      const businesses = await legacy.business.findMany();
      for (const b of businesses) {
        await tx.business.create({
          data: { id: b.id, workspaceId, metaBusinessId: b.metaBusinessId, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt },
        });
      }

      // ---- Page ----
      const pages = await legacy.page.findMany();
      for (const p of pages) {
        await tx.page.create({
          data: {
            id: p.id, workspaceId, metaPageId: p.metaPageId, name: p.name, businessId: p.businessId,
            createdAt: p.createdAt, updatedAt: p.updatedAt,
          },
        });
      }

      // ---- AdAccount ----
      const adAccounts = await legacy.adAccount.findMany();
      for (const a of adAccounts) {
        await tx.adAccount.create({
          data: {
            id: a.id, workspaceId, metaAdAccountId: a.metaAdAccountId, name: a.name, currency: a.currency,
            businessId: a.businessId, createdAt: a.createdAt, updatedAt: a.updatedAt,
          },
        });
      }

      // ---- Campaign ----
      const campaigns = await legacy.campaign.findMany();
      for (const c of campaigns) {
        await tx.campaign.create({
          data: {
            id: c.id, workspaceId, metaCampaignId: c.metaCampaignId, name: c.name, adAccountId: c.adAccountId,
            createdAt: c.createdAt, updatedAt: c.updatedAt,
          },
        });
      }

      // ---- AdSet ----
      const adSets = await legacy.adSet.findMany();
      for (const s of adSets) {
        await tx.adSet.create({
          data: {
            id: s.id, workspaceId, metaAdSetId: s.metaAdSetId, name: s.name, campaignId: s.campaignId,
            createdAt: s.createdAt, updatedAt: s.updatedAt,
          },
        });
      }

      // ---- Creative (قبل Ad لأن Ad قد يشير لها) ----
      const creatives = await legacy.creative.findMany();
      for (const c of creatives) {
        await tx.creative.create({
          data: {
            id: c.id, workspaceId, metaCreativeId: c.metaCreativeId, videoId: c.videoId, postId: c.postId,
            reelId: c.reelId, thumbnailUrl: c.thumbnailUrl, sourceType: c.sourceType,
            extractionNote: c.extractionNote, rawMetadata: c.rawMetadata,
            createdAt: c.createdAt, updatedAt: c.updatedAt,
          },
        });
      }

      // ---- Ad ----
      const ads = await legacy.ad.findMany();
      for (const a of ads) {
        await tx.ad.create({
          data: {
            id: a.id, workspaceId, metaAdId: a.metaAdId, name: a.name, adSetId: a.adSetId,
            creativeId: a.creativeId, status: a.status, createdAt: a.createdAt, updatedAt: a.updatedAt,
          },
        });
      }

      // ---- Lead + LeadStatusHistory ----
      const leads = await legacy.lead.findMany();
      for (const l of leads) {
        await tx.lead.create({
          data: {
            id: l.id, workspaceId, metaLeadId: l.metaLeadId, name: l.name, phone: l.phone,
            normalizedPhone: l.normalizedPhone, email: l.email, createdAt: l.createdAt,
            metaCreatedAt: l.metaCreatedAt, pageId: l.pageId, campaignId: l.campaignId, adSetId: l.adSetId,
            adId: l.adId, creativeId: l.creativeId, formId: l.formId, formName: l.formName, status: l.status,
            orderValue: l.orderValue, submittedOrderAt: l.submittedOrderAt, isDuplicate: l.isDuplicate,
            duplicateOfId: l.duplicateOfId, duplicateReason: l.duplicateReason, notes: l.notes,
            rawData: l.rawData, updatedAt: l.updatedAt,
          },
        });
      }
      const statusHistory = await legacy.leadStatusHistory.findMany();
      for (const h of statusHistory) {
        await tx.leadStatusHistory.create({
          data: {
            id: h.id, leadId: h.leadId, oldStatus: h.oldStatus, newStatus: h.newStatus,
            changedAt: h.changedAt, changedBy: h.changedBy, source: h.source,
          },
        });
      }

      // ---- WebhookEvent ----
      const webhookEvents = await legacy.webhookEvent.findMany();
      for (const w of webhookEvents) {
        await tx.webhookEvent.create({
          data: {
            id: w.id, workspaceId, eventKey: w.eventKey, eventType: w.eventType, receivedAt: w.receivedAt,
            processedAt: w.processedAt, status: w.status, rawPayload: w.rawPayload,
            errorMessage: w.errorMessage, retryCount: w.retryCount,
          },
        });
      }

      // ---- SyncLog (عام، بدون workspaceId) ----
      const syncLogs = await legacy.syncLog.findMany();
      for (const s of syncLogs) {
        await tx.syncLog.create({
          data: { id: s.id, source: s.source, startedAt: s.startedAt, completedAt: s.completedAt, status: s.status, details: s.details },
        });
      }

      // ---- InsightSnapshot ----
      const insightSnapshots = await legacy.insightSnapshot.findMany();
      for (const i of insightSnapshots) {
        await tx.insightSnapshot.create({
          data: {
            id: i.id, date: i.date, level: i.level, campaignId: i.campaignId, adSetId: i.adSetId, adId: i.adId,
            spend: i.spend, impressions: i.impressions, reach: i.reach, clicks: i.clicks, leadsCount: i.leadsCount,
            ordersCount: i.ordersCount, costPerResult: i.costPerResult, currency: i.currency, fetchedAt: i.fetchedAt,
          },
        });
      }

      // ---- SyncRun -> AdPerformanceSnapshot / DetectedOrderIncrement ----
      const syncRuns = await legacy.syncRun.findMany();
      for (const r of syncRuns) {
        await tx.syncRun.create({
          data: {
            id: r.id, startedAt: r.startedAt, completedAt: r.completedAt, status: r.status,
            adsProcessed: r.adsProcessed, metaOrdersDetected: r.metaOrdersDetected,
            errorMessage: r.errorMessage, createdAt: r.createdAt,
          },
        });
      }
      const perfSnapshots = await legacy.adPerformanceSnapshot.findMany();
      for (const p of perfSnapshots) {
        await tx.adPerformanceSnapshot.create({
          data: {
            id: p.id, adId: p.adId, campaignId: p.campaignId, adSetId: p.adSetId, creativeId: p.creativeId,
            videoId: p.videoId, snapshotTime: p.snapshotTime, metaDate: p.metaDate, spend: p.spend,
            metaOrderCount: p.metaOrderCount, actionsRaw: p.actionsRaw, syncRunId: p.syncRunId,
            isBaseline: p.isBaseline, createdAt: p.createdAt,
          },
        });
      }
      const increments = await legacy.detectedOrderIncrement.findMany();
      for (const d of increments) {
        await tx.detectedOrderIncrement.create({
          data: {
            id: d.id, adId: d.adId, campaignId: d.campaignId, adSetId: d.adSetId, creativeId: d.creativeId,
            videoId: d.videoId, detectedAt: d.detectedAt, windowStart: d.windowStart, windowEnd: d.windowEnd,
            previousCount: d.previousCount, currentCount: d.currentCount, newMetaOrders: d.newMetaOrders,
            spendDelta: d.spendDelta, snapshotId: d.snapshotId, syncRunId: d.syncRunId, createdAt: d.createdAt,
          },
        });
      }

      // ---- AdminUser / AppSetting / DailyReport (عامة، بدون workspaceId) ----
      const adminUsers = await legacy.adminUser.findMany();
      for (const a of adminUsers) {
        await tx.adminUser.create({
          data: { id: a.id, email: a.email, passwordHash: a.passwordHash, role: a.role, createdAt: a.createdAt },
        });
      }
      const appSettings = await legacy.appSetting.findMany();
      for (const s of appSettings) {
        await tx.appSetting.upsert({
          where: { key: s.key },
          create: { key: s.key, value: s.value },
          update: { value: s.value },
        });
      }
      const dailyReports = await legacy.dailyReport.findMany();
      for (const d of dailyReports) {
        await tx.dailyReport.create({
          data: {
            id: d.id, reportDate: d.reportDate, generatedAt: d.generatedAt, reconciledAt: d.reconciledAt,
            payload: d.payload, createdAt: d.createdAt,
          },
        });
      }

      console.log(
        `تم نقل: ${businesses.length} Business, ${pages.length} Page, ${adAccounts.length} AdAccount, ` +
          `${campaigns.length} Campaign, ${adSets.length} AdSet, ${ads.length} Ad, ${creatives.length} Creative, ` +
          `${leads.length} Lead, ${statusHistory.length} LeadStatusHistory, ${webhookEvents.length} WebhookEvent, ` +
          `${insightSnapshots.length} InsightSnapshot, ${syncRuns.length} SyncRun, ${perfSnapshots.length} AdPerformanceSnapshot, ` +
          `${increments.length} DetectedOrderIncrement, ${adminUsers.length} AdminUser, ${appSettings.length} AppSetting, ` +
          `${dailyReports.length} DailyReport`,
      );
    },
    { timeout: 120_000 },
  );

  console.log("✅ اكتملت الهجرة بنجاح.");
}

main()
  .catch((err) => {
    console.error("❌ فشلت الهجرة:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await legacy.$disconnect();
    await pg.$disconnect();
  });
