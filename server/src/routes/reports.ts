import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/auth.js";
import { ORDER_SUBMITTED_STATUS } from "./leads.js";

export const reportsRouter = Router();
reportsRouter.use(requireAdmin);

function dateRange(query: any): { gte?: Date; lte?: Date } {
  const range: { gte?: Date; lte?: Date } = {};
  if (query.dateFrom) range.gte = new Date(String(query.dateFrom));
  if (query.dateTo) range.lte = new Date(String(query.dateTo));
  return range;
}

// ---- ملخص الصفحة الرئيسية ----
reportsRouter.get("/summary", async (req, res) => {
  const range = dateRange(req.query);
  const where: any = { isDuplicate: false };
  if (range.gte || range.lte) where.createdAt = range;

  const [totalLeads, ordersCount, orderValueAgg, spendAgg, duplicateCount] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.count({ where: { ...where, status: ORDER_SUBMITTED_STATUS } }),
    prisma.lead.aggregate({ where: { ...where, status: ORDER_SUBMITTED_STATUS }, _sum: { orderValue: true } }),
    prisma.insightSnapshot.aggregate({
      where: range.gte || range.lte ? { date: range } : undefined,
      _sum: { spend: true },
    }),
    prisma.lead.count({ where: { isDuplicate: true, ...(range.gte || range.lte ? { createdAt: range } : {}) } }),
  ]);

  const spend = spendAgg._sum.spend ?? 0;
  const orderValue = orderValueAgg._sum.orderValue ?? 0;

  // إجمالي "الطلبات" الحقيقي لهذا النوع من الأعمال يشمل أيضًا طلبات محادثات المراسلة
  // (onsite_conversion.messaging_order_created_v2)، وليس فقط عملاء Lead Ads عبر الـWebhook —
  // راجع DECISIONS.md #14. نجمع المصدرين لأنهما لا يتداخلان (نوعا حملات مختلفان).
  const insightOrdersAgg = await prisma.insightSnapshot.aggregate({
    where: range.gte || range.lte ? { date: range } : undefined,
    _sum: { ordersCount: true },
  });
  const totalOrdersCount = ordersCount + (insightOrdersAgg._sum.ordersCount ?? 0);

  const conversionRate = totalLeads > 0 ? (totalOrdersCount / totalLeads) * 100 : 0;
  const cpl = totalLeads > 0 ? spend / totalLeads : null;
  const cpa = totalOrdersCount > 0 ? spend / totalOrdersCount : null;

  // "أفضل/أسوأ إعلان" يُرتَّبان بحسب الطلبات الفعلية (وليس Leads فقط)، لأن حملات المراسلة
  // (messaging orders) لا تُنتج Leads إطلاقًا رغم كونها تجلب طلبات حقيقية.
  const byAd = await adPerformance(where, range);
  const adsWithActivity = byAd.filter((a) => a.spend > 0 || a.leadsCount > 0);
  const bestAd = adsWithActivity.reduce(
    (a, b) => ((b.ordersCount ?? 0) > (a?.ordersCount ?? -1) ? b : a),
    adsWithActivity[0] ?? byAd[0] ?? null,
  );
  const adsWithSpend = adsWithActivity.filter((a) => a.spend > 0);
  const worstAd = adsWithSpend.reduce(
    (a, b) => ((b.cpa ?? Infinity) > (a?.cpa ?? -Infinity) ? b : a),
    adsWithSpend[0] ?? null,
  );

  const byVideo = await videoPerformance(where, range);
  const bestVideo = byVideo[0] ?? null;

  res.json({
    totalLeads,
    ordersCount: totalOrdersCount,
    conversionRate: round(conversionRate),
    orderValue,
    spend,
    cpl: cpl !== null ? round(cpl) : null,
    cpa: cpa !== null ? round(cpa) : null,
    duplicateCount,
    bestAd,
    worstAd,
    bestVideo,
  });
});

async function adPerformance(baseWhere: any, range: { gte?: Date; lte?: Date } = {}) {
  const insightsWhere = range.gte || range.lte ? { date: range } : undefined;
  const ads = await prisma.ad.findMany({
    include: {
      adSet: { include: { campaign: true } },
      leads: { where: baseWhere },
      insights: { where: insightsWhere },
    },
  });

  return ads.map((ad) => {
    const leadsCount = ad.leads.length;
    // "الطلبات" = عملاء Lead Ads بحالة "تم تقديم الطلب" + أحداث طلب المراسلة الرسمية من Meta
    // (onsite_conversion.messaging_order_created_v2) — راجع DECISIONS.md #14.
    const leadOrders = ad.leads.filter((l) => l.status === ORDER_SUBMITTED_STATUS).length;
    const insightOrders = ad.insights.reduce((s, i) => s + i.ordersCount, 0);
    const ordersCount = leadOrders + insightOrders;
    const spend = ad.insights.reduce((s, i) => s + i.spend, 0);
    const orderValue = ad.leads
      .filter((l) => l.status === ORDER_SUBMITTED_STATUS)
      .reduce((s, l) => s + (l.orderValue ?? 0), 0);
    return {
      adId: ad.id,
      adName: ad.name,
      campaignName: ad.adSet.campaign.name,
      adSetName: ad.adSet.name,
      leadsCount,
      ordersCount,
      conversionRate: leadsCount > 0 ? round((ordersCount / leadsCount) * 100) : 0,
      spend: round(spend),
      cpl: leadsCount > 0 ? round(spend / leadsCount) : null,
      cpa: ordersCount > 0 ? round(spend / ordersCount) : null,
      orderValue: round(orderValue),
      roas: spend > 0 && orderValue > 0 ? round(orderValue / spend) : null,
    };
  });
}

async function videoPerformance(baseWhere: any, range: { gte?: Date; lte?: Date } = {}) {
  const insightsWhere = range.gte || range.lte ? { date: range } : undefined;
  const creatives = await prisma.creative.findMany({
    include: {
      ads: {
        include: {
          leads: { where: baseWhere },
          insights: { where: insightsWhere },
          adSet: { include: { campaign: true } },
        },
      },
    },
  });

  const rows = creatives
    .filter((c) => c.videoId || c.reelId || c.postId)
    .map((c) => {
      const leads = c.ads.flatMap((a) => a.leads);
      const leadsCount = leads.length;
      const leadOrders = leads.filter((l) => l.status === ORDER_SUBMITTED_STATUS).length;
      const insightOrders = c.ads.reduce((s, a) => s + a.insights.reduce((s2, i) => s2 + i.ordersCount, 0), 0);
      const ordersCount = leadOrders + insightOrders;
      const spend = c.ads.reduce((s, a) => s + a.insights.reduce((s2, i) => s2 + i.spend, 0), 0);
      return {
        creativeId: c.id,
        videoId: c.videoId,
        postId: c.postId,
        thumbnailUrl: c.thumbnailUrl,
        adNames: c.ads.map((a) => a.name),
        adName: c.ads[0]?.name ?? null,
        campaignName: c.ads[0]?.adSet?.campaign?.name ?? null,
        leadsCount,
        ordersCount,
        conversionRate: leadsCount > 0 ? round((ordersCount / leadsCount) * 100) : 0,
        spend: round(spend),
        cpl: leadsCount > 0 ? round(spend / leadsCount) : null,
        cpa: ordersCount > 0 ? round(spend / ordersCount) : null,
      };
    })
    .sort((a, b) => b.ordersCount - a.ordersCount || b.leadsCount - a.leadsCount);

  return rows;
}

reportsRouter.get("/ads", async (req, res) => {
  const range = dateRange(req.query);
  const where: any = { isDuplicate: false };
  if (range.gte || range.lte) where.createdAt = range;
  res.json(await adPerformance(where, range));
});

reportsRouter.get("/videos", async (req, res) => {
  const range = dateRange(req.query);
  const where: any = { isDuplicate: false };
  if (range.gte || range.lte) where.createdAt = range;
  const rows = await videoPerformance(where, range);
  res.json(rows.map((r, idx) => ({ ...r, rank: idx + 1 })));
});

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
