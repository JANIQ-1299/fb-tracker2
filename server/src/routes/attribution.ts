import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { requireUser, type WorkspaceAuthedRequest } from "../middleware/workspaceAuth.js";
import { requireActiveWorkspace, requireSystemActive } from "../middleware/workspaceGuard.js";
import { runAttributionForWorkspace, writeOrderAttribution } from "../services/attributionEngine.js";
import { normalizeHeader } from "../services/importColumns.js";
import { getMatchTier } from "../services/matchTier.js";
import { buildAttributionDashboard } from "../services/attributionDashboard.js";
import { buildAttributionWorkbook } from "../services/attributionExport.js";

export const attributionRouter = Router();
attributionRouter.use(requireUser, requireSystemActive, requireActiveWorkspace);

// workspaceId يُؤخَذ حصرًا من الجلسة في كل مسار هنا - لا يُقرأ أبدًا من body/query الطلب.

const runSchema = z.object({ dryRun: z.boolean().optional() });

// Idempotent: تكرار الاستدعاء لا يُنشئ أي صفوف مكررة (upsert بمفتاح orderId الفريد)، ولا يمسّ
// أي طلب مطابق يدويًا مسبقًا (MANUAL) - راجع runAttributionForWorkspace.
attributionRouter.post("/run", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  const parsed = runSchema.safeParse(req.body ?? {});
  const dryRun = parsed.success ? Boolean(parsed.data.dryRun) : false;

  try {
    const summary = await runAttributionForWorkspace(workspaceId, { dryRun });
    logger.info({ workspaceId, dryRun, summary }, "اكتملت مطابقة مصادر الطلبات");
    res.json(summary);
  } catch (err) {
    logger.error({ workspaceId, err: (err as Error).message }, "فشلت مطابقة مصادر الطلبات");
    res.status(500).json({ error: "فشل تشغيل محرك المطابقة، حاول لاحقًا" });
  }
});

attributionRouter.get("/summary", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  const [total, exact, probable, manual, needsReview, unmatchedExplicit, noAttribution] = await Promise.all([
    prisma.order.count({ where: { workspaceId } }),
    prisma.orderAttribution.count({ where: { workspaceId, matchStatus: "EXACT" } }),
    prisma.orderAttribution.count({ where: { workspaceId, matchStatus: "PROBABLE" } }),
    prisma.orderAttribution.count({ where: { workspaceId, matchStatus: "MANUAL" } }),
    prisma.orderAttribution.count({ where: { workspaceId, matchStatus: "NEEDS_REVIEW" } }),
    prisma.orderAttribution.count({ where: { workspaceId, matchStatus: "UNMATCHED" } }),
    prisma.order.count({ where: { workspaceId, attribution: null } }),
  ]);

  // تصنيف رباعي (مؤكد/قوي/تقريبي/غير معروف) - عرضي فوق matchStatus/confidence الحقيقيين
  const attributions = await prisma.orderAttribution.findMany({
    where: { workspaceId },
    select: { matchStatus: true, confidence: true },
  });
  const tiers = { confirmed: 0, strong: 0, approximate: 0, unknown: 0 };
  for (const a of attributions) {
    const tier = getMatchTier(a.matchStatus, a.confidence);
    if (tier.key === "CONFIRMED") tiers.confirmed++;
    else if (tier.key === "STRONG") tiers.strong++;
    else if (tier.key === "APPROXIMATE") tiers.approximate++;
    else tiers.unknown++;
  }
  tiers.unknown += noAttribution; // طلبات لم تُشغَّل عليها المطابقة بعد تُحسَب "غير معروف"

  res.json({
    total,
    exact,
    probable,
    manual,
    needsReview,
    unmatched: unmatchedExplicit + noAttribution,
    tiers,
  });
});

const listQuerySchema = z.object({
  status: z.enum(["EXACT", "PROBABLE", "MANUAL", "NEEDS_REVIEW", "UNMATCHED"]).optional(),
});

attributionRouter.get("/orders", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  const parsed = listQuerySchema.safeParse(req.query);
  const status = parsed.success ? parsed.data.status : undefined;

  const where: any = { workspaceId };
  if (status === "UNMATCHED") {
    where.OR = [{ attribution: null }, { attribution: { matchStatus: "UNMATCHED" } }];
  } else if (status) {
    where.attribution = { matchStatus: status };
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      attribution: { include: { campaign: true, adSet: true, ad: true, creative: true } },
    },
    orderBy: { orderDate: "asc" },
    take: 500,
  });

  res.json({
    orders: orders.map((o) => {
      const tier = getMatchTier(o.attribution?.matchStatus ?? null, o.attribution?.confidence ?? 0);
      const videoId = o.attribution?.creative?.videoId ?? null;
      return {
        id: o.id,
        externalOrderId: o.externalOrderId,
        customerName: o.customerName,
        phone: o.phone,
        normalizedPhone: o.normalizedPhone,
        orderDate: o.orderDate,
        matchStatus: o.attribution?.matchStatus ?? "UNMATCHED",
        matchMethod: o.attribution?.matchMethod ?? null,
        confidence: o.attribution?.confidence ?? 0,
        reason: o.attribution?.reason ?? "لم تُشغَّل المطابقة بعد لهذا الطلب",
        campaignName: o.attribution?.campaign?.name ?? null,
        adSetName: o.attribution?.adSet?.name ?? null,
        adName: o.attribution?.ad?.name ?? null,
        videoId,
        videoUrl: videoId ? `https://www.facebook.com/watch/?v=${videoId}` : null,
        tier: tier.key,
        tierLabel: tier.label,
      };
    }),
  });
});

// لوحة تجميع حسب الإعلان/الفيديو - نظام منفصل تمامًا عن orderReport.ts (messaging_order_created_v2)
attributionRouter.get("/dashboard", async (req: WorkspaceAuthedRequest, res) => {
  const dashboard = await buildAttributionDashboard(req.user!.workspaceId);
  res.json(dashboard);
});

// تصدير كامل نتائج المطابقة كملف Excel (ورقتا تفاصيل + ملخص)
attributionRouter.get("/export", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  try {
    const buffer = await buildAttributionWorkbook(workspaceId);
    const filename = `attribution-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    logger.error({ workspaceId, err: (err as Error).message }, "فشل تصدير ملف مطابقة الطلبات");
    res.status(500).json({ error: "فشل إنشاء ملف التصدير، حاول لاحقًا" });
  }
});

// خيارات الحملات/المجموعات/الإعلانات المُزامنة - لتعبئة قوائم الاختيار في شاشة المطابقة اليدوية
attributionRouter.get("/meta-options", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  const [campaigns, adSets, ads] = await Promise.all([
    prisma.campaign.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
    prisma.adSet.findMany({ where: { workspaceId }, select: { id: true, name: true, campaignId: true } }),
    prisma.ad.findMany({ where: { workspaceId }, select: { id: true, name: true, adSetId: true } }),
  ]);
  res.json({ campaigns, adSets, ads });
});

const manualSchema = z.object({
  campaignId: z.string().min(1),
  adSetId: z.string().optional(),
  adId: z.string().optional(),
});

attributionRouter.post("/orders/:orderId/manual", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });
  if (!order || order.workspaceId !== workspaceId) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }

  const parsed = manualSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "يجب اختيار الحملة على الأقل" });
  const { campaignId, adSetId, adId } = parsed.data;

  // تحقّق أن كل ما اختاره المستخدم ينتمي فعليًا لهذا الـWorkspace - لا نثق بأي معرّف من الواجهة
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.workspaceId !== workspaceId) {
    return res.status(400).json({ error: "الحملة المختارة غير صالحة" });
  }
  let adSet = null;
  if (adSetId) {
    adSet = await prisma.adSet.findUnique({ where: { id: adSetId } });
    if (!adSet || adSet.workspaceId !== workspaceId || adSet.campaignId !== campaignId) {
      return res.status(400).json({ error: "مجموعة الإعلانات المختارة غير صالحة" });
    }
  }
  let ad = null;
  if (adId) {
    ad = await prisma.ad.findUnique({ where: { id: adId } });
    if (!ad || ad.workspaceId !== workspaceId || (adSetId && ad.adSetId !== adSetId)) {
      return res.status(400).json({ error: "الإعلان المختار غير صالح" });
    }
  }

  await writeOrderAttribution(
    order.id,
    workspaceId,
    {
      matchStatus: "MANUAL",
      matchMethod: "MANUAL",
      confidence: 1,
      pageId: null,
      adAccountId: campaign.adAccountId,
      campaignId,
      adSetId: adSet?.id ?? null,
      adId: ad?.id ?? null,
      creativeId: ad?.creativeId ?? null,
      reason: "اختيار يدوي من المستخدم",
    },
    { changeSource: "MANUAL", changedBy: req.user!.id },
  );
  const attribution = await prisma.orderAttribution.findUnique({ where: { orderId: order.id } });

  // حفظ MappingRule فقط عندما تتوفر قيمة مصدر واضحة على الطلب نفسه (اسم إعلان/فيديو/مصدر) -
  // لا تُنشأ أي قاعدة تعتمد على رقم الهاتف إطلاقًا، حتى لا تُطبَّق خطأً على عملاء آخرين لاحقًا.
  const ruleCandidates: { ruleType: string; raw: string }[] = [];
  if (order.adNameRaw) ruleCandidates.push({ ruleType: "AD_NAME_ALIAS", raw: order.adNameRaw });
  if (order.videoNameRaw) ruleCandidates.push({ ruleType: "VIDEO_NAME_ALIAS", raw: order.videoNameRaw });
  if (order.sourceRaw) ruleCandidates.push({ ruleType: "SOURCE_ALIAS", raw: order.sourceRaw });

  for (const candidate of ruleCandidates) {
    const matchKey = normalizeHeader(candidate.raw);
    if (!matchKey) continue;
    await prisma.mappingRule.upsert({
      where: { workspaceId_ruleType_matchKey: { workspaceId, ruleType: candidate.ruleType, matchKey } },
      update: { adId: ad?.id ?? null, campaignId, createdFromOrderId: order.id },
      create: {
        workspaceId,
        ruleType: candidate.ruleType,
        matchKey,
        adId: ad?.id ?? null,
        campaignId,
        createdFromOrderId: order.id,
      },
    });
  }

  logger.info(
    { workspaceId, orderId: order.id, campaignId, adId, rulesCreated: ruleCandidates.length },
    "تمت مطابقة طلب يدويًا",
  );
  res.json({ attribution, rulesCreated: ruleCandidates.length });
});

// سجل كامل لكل تغيير طرأ على مطابقة طلب واحد - تلقائي أو يدوي
attributionRouter.get("/orders/:orderId/history", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });
  if (!order || order.workspaceId !== workspaceId) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  const history = await prisma.orderAttributionHistory.findMany({
    where: { orderId: order.id, workspaceId },
    orderBy: { changedAt: "desc" },
  });
  res.json({ history });
});
