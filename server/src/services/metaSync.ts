import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { metaGet, MetaApiError } from "../lib/meta.js";
import { decryptToken } from "../lib/crypto.js";
import { fetchAndExtractCreative } from "./attribution.js";

export interface SyncSummary {
  adAccountsSynced: number;
  campaigns: number;
  adSets: number;
  ads: number;
  creatives: number;
  insightRows: number;
  reauthRequired: string[]; // معرّفات اتصالات تحتاج إعادة تسجيل دخول
}

interface GraphCampaign {
  id: string;
  name: string;
  status?: string;
}
interface GraphAdSet {
  id: string;
  name: string;
  campaign_id: string;
  status?: string;
}
interface GraphAd {
  id: string;
  name: string;
  adset_id: string;
  status?: string;
}

/**
 * يزامن Campaigns/AdSets/Ads/Creatives/Insights لكل الحسابات الإعلانية المربوطة عبر OAuth
 * (metaConnectionId != null) ضمن هذا الـWorkspace فقط. لا علاقة له بخط Webhook/Insights القديم
 * (jobs/insights.ts) الذي يستمر بخدمة الاتصال القديم عبر env.metaAdAccountId كما هو تمامًا.
 */
export async function syncWorkspaceMeta(workspaceId: string): Promise<SyncSummary> {
  const summary: SyncSummary = {
    adAccountsSynced: 0,
    campaigns: 0,
    adSets: 0,
    ads: 0,
    creatives: 0,
    insightRows: 0,
    reauthRequired: [],
  };

  const adAccounts = await prisma.adAccount.findMany({
    where: { workspaceId, metaConnectionId: { not: null } },
    include: { metaConnection: true },
  });

  for (const adAccount of adAccounts) {
    const connection = adAccount.metaConnection;
    if (!connection || connection.status === "REVOKED") continue;

    let token: string;
    try {
      token = decryptToken({
        ciphertext: connection.accessTokenEncrypted,
        iv: connection.tokenIv,
        tag: connection.tokenTag,
      });
    } catch {
      summary.reauthRequired.push(connection.id);
      continue;
    }

    try {
      await syncOneAdAccount(workspaceId, adAccount.id, adAccount.metaAdAccountId, token, summary);
      summary.adAccountsSynced++;
      await prisma.metaConnection.update({
        where: { id: connection.id },
        data: { lastSyncAt: new Date(), status: "CONNECTED" },
      });
    } catch (err) {
      if (err instanceof MetaApiError && (err.code === 190 || err.code === 102)) {
        logger.warn({ connectionId: connection.id }, "توكن Meta منتهي أثناء المزامنة - يتطلب إعادة تسجيل دخول");
        await prisma.metaConnection.update({
          where: { id: connection.id },
          data: { status: "EXPIRED" },
        });
        summary.reauthRequired.push(connection.id);
      } else {
        logger.error(
          { err: (err as Error).message, adAccountId: adAccount.id },
          "فشلت مزامنة حساب إعلاني",
        );
        throw err;
      }
    }
  }

  return summary;
}

async function syncOneAdAccount(
  workspaceId: string,
  adAccountRecordId: string,
  metaAdAccountId: string,
  token: string,
  summary: SyncSummary,
) {
  const campaignIdMap = new Map<string, string>(); // metaCampaignId -> our id
  const adSetIdMap = new Map<string, string>(); // metaAdSetId -> our id

  // ---- Campaigns ----
  const campaignsRes = await metaGet<{ data: GraphCampaign[] }>(
    `act_${metaAdAccountId}/campaigns`,
    { fields: "id,name,status", limit: "200" },
    { accessToken: token },
  );
  for (const c of campaignsRes.data ?? []) {
    const campaign = await prisma.campaign.upsert({
      where: { workspaceId_metaCampaignId: { workspaceId, metaCampaignId: c.id } },
      update: { name: c.name },
      create: { workspaceId, metaCampaignId: c.id, name: c.name, adAccountId: adAccountRecordId },
    });
    campaignIdMap.set(c.id, campaign.id);
    summary.campaigns++;
  }

  // ---- AdSets ----
  const adSetsRes = await metaGet<{ data: GraphAdSet[] }>(
    `act_${metaAdAccountId}/adsets`,
    { fields: "id,name,campaign_id,status", limit: "200" },
    { accessToken: token },
  );
  for (const s of adSetsRes.data ?? []) {
    const campaignRecordId = campaignIdMap.get(s.campaign_id);
    if (!campaignRecordId) continue; // حملة غير مُزامنة (نادر) - نتخطاها بدل الفشل الكامل
    const adSet = await prisma.adSet.upsert({
      where: { workspaceId_metaAdSetId: { workspaceId, metaAdSetId: s.id } },
      update: { name: s.name },
      create: { workspaceId, metaAdSetId: s.id, name: s.name, campaignId: campaignRecordId },
    });
    adSetIdMap.set(s.id, adSet.id);
    summary.adSets++;
  }

  // ---- Ads + Creatives ----
  const adsRes = await metaGet<{ data: GraphAd[] }>(
    `act_${metaAdAccountId}/ads`,
    { fields: "id,name,adset_id,status", limit: "200" },
    { accessToken: token },
  );
  for (const a of adsRes.data ?? []) {
    const adSetRecordId = adSetIdMap.get(a.adset_id);
    if (!adSetRecordId) continue;

    let creativeRecordId: string | undefined;
    try {
      const extracted = await fetchAndExtractCreative(a.id, token);
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
      creativeRecordId = creative.id;
      summary.creatives++;
    } catch (err) {
      logger.warn({ adId: a.id, err: (err as Error).message }, "فشل استخراج creative أثناء المزامنة");
    }

    await prisma.ad.upsert({
      where: { workspaceId_metaAdId: { workspaceId, metaAdId: a.id } },
      update: { name: a.name, status: a.status, creativeId: creativeRecordId },
      create: {
        workspaceId,
        metaAdId: a.id,
        name: a.name,
        status: a.status,
        adSetId: adSetRecordId,
        creativeId: creativeRecordId,
      },
    });
    summary.ads++;
  }

  // ---- Insights (آخر 7 أيام، على مستوى الإعلان) ----
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const insightsRes = await metaGet<{ data: any[] }>(
    `act_${metaAdAccountId}/insights`,
    {
      level: "ad",
      time_range: JSON.stringify({ since: since.toISOString().slice(0, 10), until: new Date().toISOString().slice(0, 10) }),
      time_increment: "1",
      fields: "campaign_id,adset_id,ad_id,spend,impressions,reach,clicks,actions,date_start",
      limit: "500",
    },
    { accessToken: token },
  );

  for (const row of insightsRes.data ?? []) {
    if (!row.campaign_id || !row.adset_id || !row.ad_id || !row.date_start) continue;
    const ad = await prisma.ad.findUnique({
      where: { workspaceId_metaAdId: { workspaceId, metaAdId: row.ad_id } },
    });
    if (!ad) continue;
    const campaignRecordId = campaignIdMap.get(row.campaign_id);
    const adSetRecordId = adSetIdMap.get(row.adset_id);
    const leadsAction = (row.actions ?? []).find((a: any) => a.action_type === "lead");

    await prisma.insightSnapshot.upsert({
      where: {
        date_level_campaignId_adSetId_adId: {
          date: new Date(row.date_start),
          level: "ad",
          campaignId: campaignRecordId ?? null,
          adSetId: adSetRecordId ?? null,
          adId: ad.id,
        } as any,
      },
      update: {
        spend: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
        reach: Number(row.reach ?? 0),
        clicks: Number(row.clicks ?? 0),
        leadsCount: Number(leadsAction?.value ?? 0),
      },
      create: {
        date: new Date(row.date_start),
        level: "ad",
        campaignId: campaignRecordId,
        adSetId: adSetRecordId,
        adId: ad.id,
        spend: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
        reach: Number(row.reach ?? 0),
        clicks: Number(row.clicks ?? 0),
        leadsCount: Number(leadsAction?.value ?? 0),
      },
    });
    summary.insightRows++;
  }
}
