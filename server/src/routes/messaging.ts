import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { requireUser, type WorkspaceAuthedRequest } from "../middleware/workspaceAuth.js";
import { requireActiveWorkspace, requireSystemActive } from "../middleware/workspaceGuard.js";

export const messagingRouter = Router();
messagingRouter.use(requireUser, requireSystemActive, requireActiveWorkspace);

// نص التحذير الدقيق كما طلب المستخدم - يجب أن يظل ظاهرًا وغير قابل للإغلاق في واجهة هذه الصفحة.
export const MESSAGING_DISCLAIMER =
  "استقبال الرسائل التلقائي يعمل على الرسائل الجديدة من لحظة التفعيل. يمكن رفع ملفات طلبات قديمة " +
  "ومحاولة مطابقتها مع البيانات المتوفرة، لكن لا يمكن ضمان معرفة مصدر كل طلب قديم إذا لم تكن بيانات " +
  "المحادثة أو مرجع الإعلان متاحة.";

messagingRouter.get("/status", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  const integration = await prisma.messagingIntegration.findUnique({ where: { workspaceId } });

  const [conversationsCount, matchedCount, needsReviewCount] = await Promise.all([
    prisma.conversation.count({ where: { workspaceId } }),
    prisma.conversation.count({ where: { workspaceId, matchStatus: "MATCHED" } }),
    prisma.conversation.count({ where: { workspaceId, matchStatus: "NEEDS_REVIEW" } }),
  ]);

  let pageName: string | null = null;
  if (integration?.pageId) {
    const page = await prisma.page.findUnique({ where: { id: integration.pageId } });
    pageName = page?.name ?? null;
  }

  res.json({
    enabled: integration?.enabled ?? false,
    pageId: integration?.pageId ?? null,
    pageName,
    enabledAt: integration?.enabledAt ?? null,
    retentionDays: integration?.retentionDays ?? 30,
    matchWindowHours: integration?.matchWindowHours ?? 48,
    conversationsCount,
    matchedCount,
    needsReviewCount,
    disclaimer: MESSAGING_DISCLAIMER,
  });
});

messagingRouter.get("/available-pages", async (req: WorkspaceAuthedRequest, res) => {
  const pages = await prisma.page.findMany({
    where: { workspaceId: req.user!.workspaceId },
    select: { id: true, name: true },
  });
  res.json({ pages });
});

const enableSchema = z.object({ pageId: z.string().min(1) });

messagingRouter.post("/enable", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  const parsed = enableSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "يجب اختيار صفحة" });

  const page = await prisma.page.findUnique({ where: { id: parsed.data.pageId } });
  if (!page || page.workspaceId !== workspaceId) {
    return res.status(404).json({ error: "الصفحة غير موجودة ضمن هذا الـWorkspace" });
  }

  const integration = await prisma.messagingIntegration.upsert({
    where: { workspaceId },
    update: { enabled: true, pageId: page.id, enabledAt: new Date(), enabledBy: req.user!.id, disabledAt: null },
    create: { workspaceId, enabled: true, pageId: page.id, enabledAt: new Date(), enabledBy: req.user!.id },
  });

  logger.info({ workspaceId, pageId: page.id }, "تم تفعيل استقبال رسائل إنستغرام (رسائل جديدة فقط من الآن)");
  res.json({ integration, disclaimer: MESSAGING_DISCLAIMER });
});

messagingRouter.post("/disable", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  const existing = await prisma.messagingIntegration.findUnique({ where: { workspaceId } });
  if (!existing) return res.status(404).json({ error: "لم يُفعَّل استقبال الرسائل مسبقًا" });

  const integration = await prisma.messagingIntegration.update({
    where: { workspaceId },
    data: { enabled: false, disabledAt: new Date() },
  });
  logger.info({ workspaceId }, "تم إيقاف استقبال رسائل إنستغرام");
  res.json({ integration });
});

// retentionDays: 7 أو 30 أو 90 (أو أي قيمة موجبة أخرى إن احتاج المستخدم لاحقًا لضبط دقيق أكثر)
const settingsSchema = z.object({
  retentionDays: z.number().int().min(1).max(365).optional(),
  matchWindowHours: z.number().int().min(1).max(24 * 60).optional(),
});

messagingRouter.patch("/settings", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success || (parsed.data.retentionDays === undefined && parsed.data.matchWindowHours === undefined)) {
    return res.status(400).json({ error: "قيم إعدادات غير صالحة" });
  }

  const integration = await prisma.messagingIntegration.upsert({
    where: { workspaceId },
    update: parsed.data,
    create: { workspaceId, ...parsed.data },
  });
  res.json({ integration });
});

const conversationsQuerySchema = z.object({
  matchStatus: z.enum(["MATCHED", "NEEDS_REVIEW", "UNMATCHED"]).optional(),
});

// لا يُعاد نص أي رسالة أبدًا لهذه الواجهة - فقط الرقم المستخرج ونتيجة المطابقة، طبقًا لمبدأ
// تقليل البيانات المحتفَظ بها (Data Minimization) المتفق عليه.
messagingRouter.get("/conversations", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  const parsed = conversationsQuerySchema.safeParse(req.query);
  const where: any = { workspaceId };
  if (parsed.success && parsed.data.matchStatus) where.matchStatus = parsed.data.matchStatus;

  const conversations = await prisma.conversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: 200,
    include: { matchedOrder: { select: { id: true, externalOrderId: true, customerName: true, price: true } } },
  });

  res.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      platform: c.platform,
      normalizedPhoneExtracted: c.normalizedPhoneExtracted,
      referralAdNameSnapshot: c.referralAdNameSnapshot,
      referralCampaignNameSnapshot: c.referralCampaignNameSnapshot,
      matchStatus: c.matchStatus,
      matchedOrder: c.matchedOrder,
      candidateOrdersJson: c.candidateOrdersJson,
      firstMessageAt: c.firstMessageAt,
      lastMessageAt: c.lastMessageAt,
    })),
  });
});
