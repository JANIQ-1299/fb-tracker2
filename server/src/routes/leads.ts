import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAdmin, type AuthedRequest } from "../middleware/auth.js";
import { sendLeadStatusToMeta } from "../services/capi.js";
import { logger } from "../lib/logger.js";

export const leadsRouter = Router();
leadsRouter.use(requireAdmin);

export const ORDER_SUBMITTED_STATUS = "تم تقديم الطلب";

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  campaignId: z.string().optional(),
  adId: z.string().optional(),
  creativeId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  includeDuplicates: z.coerce.boolean().optional().default(false),
  page: z.coerce.number().min(1).optional().default(1),
  pageSize: z.coerce.number().min(1).max(200).optional().default(50),
});

leadsRouter.get("/", async (req, res) => {
  const q = listQuerySchema.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: "معاملات بحث غير صالحة" });
  const { search, status, campaignId, adId, creativeId, dateFrom, dateTo, includeDuplicates, page, pageSize } =
    q.data;

  const where: any = {};
  if (!includeDuplicates) where.isDuplicate = false;
  if (status) where.status = status;
  if (campaignId) where.campaignId = campaignId;
  if (adId) where.adId = adId;
  if (creativeId) where.creativeId = creativeId;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { phone: { contains: search } },
      { normalizedPhone: { contains: search } },
      { email: { contains: search } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: { campaign: true, adSet: true, ad: true, page: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lead.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
});

leadsRouter.get("/:id", async (req, res) => {
  const lead = await prisma.lead.findUnique({
    where: { id: req.params.id },
    include: {
      campaign: true,
      adSet: true,
      ad: { include: { creative: true } },
      page: true,
      statusHistory: { orderBy: { changedAt: "desc" } },
    },
  });
  if (!lead) return res.status(404).json({ error: "العميل غير موجود" });
  res.json(lead);
});

const updateStatusSchema = z.object({
  status: z.string().min(1),
  changedBy: z.string().optional(),
});

leadsRouter.patch("/:id/status", async (req: AuthedRequest, res) => {
  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "حالة غير صالحة" });

  const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!lead) return res.status(404).json({ error: "العميل غير موجود" });

  const newStatus = parsed.data.status;
  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: newStatus,
      submittedOrderAt: newStatus === ORDER_SUBMITTED_STATUS && !lead.submittedOrderAt ? new Date() : undefined,
    },
  });

  await prisma.leadStatusHistory.create({
    data: {
      leadId: lead.id,
      oldStatus: lead.status,
      newStatus,
      changedBy: req.admin?.email ?? parsed.data.changedBy ?? "dashboard",
      source: "dashboard",
    },
  });

  // محاولة إرسال إشارة الجودة إلى Meta عبر Conversions API for CRM إن كانت مُهيّأة (best-effort)
  if (newStatus === ORDER_SUBMITTED_STATUS) {
    sendLeadStatusToMeta({
      leadId: lead.metaLeadId,
      email: lead.email,
      phone: lead.normalizedPhone,
      eventName: "Purchase",
    })
      .then((r) => {
        if (!r.sent) logger.info({ leadId: lead.id, reason: r.reason }, "لم يُرسل حدث CAPI");
      })
      .catch((err) => logger.error({ err: err.message }, "خطأ غير متوقع أثناء إرسال CAPI"));
  }

  res.json(updated);
});

const updateLeadSchema = z.object({
  orderValue: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  isDuplicate: z.boolean().optional(),
});

leadsRouter.patch("/:id", async (req, res) => {
  const parsed = updateLeadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });

  const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!lead) return res.status(404).json({ error: "العميل غير موجود" });

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: parsed.data,
  });
  res.json(updated);
});

// سياسة حذف بيانات العميل عند الطلب (Data Deletion Policy)
leadsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!lead) return res.status(404).json({ error: "العميل غير موجود" });

  await prisma.leadStatusHistory.deleteMany({ where: { leadId: lead.id } });
  await prisma.lead.delete({ where: { id: lead.id } });
  logger.info({ leadId: req.params.id, by: req.admin?.email }, "تم حذف بيانات عميل بناءً على طلب");
  res.json({ ok: true });
});
