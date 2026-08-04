import { prisma } from "../lib/prisma.js";
import { getMatchTier } from "./matchTier.js";

export interface DashboardRow {
  key: string; // adId الداخلي أو videoId - يُستخدم كمفتاح تجميع
  adId: string | null;
  adName: string | null;
  campaignName: string | null;
  videoId: string | null;
  videoUrl: string | null;
  orderCount: number;
  revenue: number;
  spend: number;
  costPerOrder: number | null;
  tiers: { confirmed: number; strong: number; approximate: number; needsReview: number; unknown: number };
}

export interface AttributionDashboard {
  byAd: DashboardRow[];
  byVideo: DashboardRow[];
  unattributed: { orderCount: number; revenue: number };
}

function videoUrlOf(videoId: string | null | undefined): string | null {
  return videoId ? `https://www.facebook.com/watch/?v=${videoId}` : null;
}

function emptyTiers() {
  return { confirmed: 0, strong: 0, approximate: 0, needsReview: 0, unknown: 0 };
}

function bumpTier(tiers: ReturnType<typeof emptyTiers>, matchStatus: string | null, confidence: number) {
  const tier = getMatchTier(matchStatus, confidence);
  if (tier.key === "CONFIRMED") tiers.confirmed++;
  else if (tier.key === "STRONG") tiers.strong++;
  else if (tier.key === "APPROXIMATE") tiers.approximate++;
  else if (tier.key === "NEEDS_REVIEW") tiers.needsReview++;
  else tiers.unknown++;
}

/**
 * يُجمّع الطلبات المستوردة (Order + OrderAttribution) حسب الإعلان وحسب الفيديو - نظام منفصل
 * تمامًا عن orderReport.ts (الذي يتتبع إشارة messaging_order_created_v2 من مزامنة Meta التلقائية،
 * وليس الطلبات المستوردة يدويًا من Excel).
 */
export async function buildAttributionDashboard(workspaceId: string): Promise<AttributionDashboard> {
  const orders = await prisma.order.findMany({
    where: { workspaceId },
    include: {
      attribution: {
        include: { ad: { include: { adSet: { include: { campaign: true } } } }, creative: true },
      },
    },
  });

  const spendByAdId = new Map<string, number>();
  const snapshots = await prisma.insightSnapshot.findMany({
    where: { level: "ad", ad: { workspaceId } },
    select: { adId: true, spend: true },
  });
  for (const s of snapshots) {
    if (!s.adId) continue;
    spendByAdId.set(s.adId, (spendByAdId.get(s.adId) ?? 0) + s.spend);
  }

  const byAdMap = new Map<string, DashboardRow>();
  const byVideoMap = new Map<string, DashboardRow>();
  const adIdsPerVideo = new Map<string, Set<string>>(); // videoId -> مجموعة adId فريدة (لجمع الصرف مرة واحدة لكل إعلان)
  let unattributedCount = 0;
  let unattributedRevenue = 0;

  for (const order of orders) {
    const attribution = order.attribution;
    const revenue = order.price ?? 0;
    const adId = attribution?.adId ?? null;
    const videoId = attribution?.creative?.videoId ?? null;

    if (!adId && !videoId) {
      unattributedCount++;
      unattributedRevenue += revenue;
      continue;
    }

    if (adId) {
      let row = byAdMap.get(adId);
      if (!row) {
        row = {
          key: adId,
          adId,
          adName: attribution?.ad?.name ?? null,
          campaignName: attribution?.ad?.adSet?.campaign?.name ?? null,
          videoId,
          videoUrl: videoUrlOf(videoId),
          orderCount: 0,
          revenue: 0,
          spend: spendByAdId.get(adId) ?? 0,
          costPerOrder: null,
          tiers: emptyTiers(),
        };
        byAdMap.set(adId, row);
      }
      row.orderCount++;
      row.revenue += revenue;
      bumpTier(row.tiers, attribution?.matchStatus ?? null, attribution?.confidence ?? 0);
    }

    if (videoId) {
      let row = byVideoMap.get(videoId);
      if (!row) {
        row = {
          key: videoId,
          adId,
          adName: attribution?.ad?.name ?? null,
          campaignName: attribution?.ad?.adSet?.campaign?.name ?? null,
          videoId,
          videoUrl: videoUrlOf(videoId),
          orderCount: 0,
          revenue: 0,
          spend: 0,
          costPerOrder: null,
          tiers: emptyTiers(),
        };
        byVideoMap.set(videoId, row);
      }
      row.orderCount++;
      row.revenue += revenue;
      bumpTier(row.tiers, attribution?.matchStatus ?? null, attribution?.confidence ?? 0);
      if (adId) {
        let seen = adIdsPerVideo.get(videoId);
        if (!seen) {
          seen = new Set();
          adIdsPerVideo.set(videoId, seen);
        }
        seen.add(adId);
      }
    }
  }

  // الصرف لكل فيديو = مجموع صرف كل إعلان فريد يستخدم هذا الفيديو (مرة واحدة لكل إعلان، وليس لكل طلب)
  for (const [videoId, adIds] of adIdsPerVideo) {
    const row = byVideoMap.get(videoId);
    if (!row) continue;
    row.spend = [...adIds].reduce((sum, id) => sum + (spendByAdId.get(id) ?? 0), 0);
  }

  function finalize(rows: DashboardRow[]) {
    for (const row of rows) {
      row.costPerOrder = row.spend > 0 && row.orderCount > 0 ? row.spend / row.orderCount : null;
    }
    return rows.sort((a, b) => b.orderCount - a.orderCount);
  }

  return {
    byAd: finalize([...byAdMap.values()]),
    byVideo: finalize([...byVideoMap.values()]),
    unattributed: { orderCount: unattributedCount, revenue: unattributedRevenue },
  };
}
