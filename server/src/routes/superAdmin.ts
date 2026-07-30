import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireSuperAdmin, type SuperAdminAuthedRequest } from "../middleware/superAdminAuth.js";
import { getSystemState, setSystemState } from "../lib/systemState.js";
import { logger } from "../lib/logger.js";

export const superAdminRouter = Router();
superAdminRouter.use(requireSuperAdmin);

async function logAdminAction(
  req: SuperAdminAuthedRequest,
  action: string,
  targetWorkspaceId: string | null,
  details: Record<string, unknown> = {},
) {
  await prisma.adminAction.create({
    data: {
      superAdminId: req.superAdmin!.id,
      action,
      targetWorkspaceId,
      details: JSON.stringify(details),
      ipAddress: req.ip,
    },
  });
  logger.info({ action, targetWorkspaceId, superAdminId: req.superAdmin!.id }, "Admin action");
}

// ---- قائمة الـWorkspaces مع الحالة/الحدود/آخر نشاط ----
superAdminRouter.get("/workspaces", async (_req, res) => {
  const workspaces = await prisma.workspace.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subscription: { include: { plan: true } },
      users: { select: { id: true, email: true, lastLoginAt: true, role: true } },
      metaConnections: { select: { lastSyncAt: true, status: true }, orderBy: { lastSyncAt: "desc" }, take: 1 },
      _count: { select: { pages: true, adAccounts: true, users: true } },
    },
  });
  res.json({ workspaces });
});

superAdminRouter.get("/workspaces/:id", async (req, res) => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: req.params.id },
    include: {
      subscription: { include: { plan: true } },
      users: true,
      metaConnections: true,
      pages: true,
      adAccounts: true,
      licenseDevices: { orderBy: { lastSeenAt: "desc" }, take: 20 },
    },
  });
  if (!workspace) return res.status(404).json({ error: "Workspace غير موجود" });
  res.json({ workspace });
});

const suspendSchema = z.object({ reason: z.string().min(1) });

superAdminRouter.post("/workspaces/:id/suspend", async (req: SuperAdminAuthedRequest, res) => {
  const parsed = suspendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "يجب إدخال سبب الإيقاف" });
  const { id } = req.params;
  const sub = await prisma.workspaceSubscription.update({
    where: { workspaceId: id },
    data: {
      status: "SUSPENDED",
      suspendedAt: new Date(),
      suspensionReason: parsed.data.reason,
      updatedBy: req.superAdmin!.id,
    },
  });
  await logAdminAction(req, "SUSPEND_WORKSPACE", id, { reason: parsed.data.reason });
  res.json({ subscription: sub });
});

superAdminRouter.post("/workspaces/:id/block", async (req: SuperAdminAuthedRequest, res) => {
  const parsed = suspendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "يجب إدخال سبب الحظر" });
  const { id } = req.params;
  const sub = await prisma.workspaceSubscription.update({
    where: { workspaceId: id },
    data: {
      status: "BLOCKED",
      suspendedAt: new Date(),
      suspensionReason: parsed.data.reason,
      updatedBy: req.superAdmin!.id,
    },
  });
  await logAdminAction(req, "BLOCK_WORKSPACE", id, { reason: parsed.data.reason });
  res.json({ subscription: sub });
});

superAdminRouter.post("/workspaces/:id/activate", async (req: SuperAdminAuthedRequest, res) => {
  const { id } = req.params;
  const sub = await prisma.workspaceSubscription.update({
    where: { workspaceId: id },
    data: {
      status: "ACTIVE",
      suspendedAt: null,
      suspensionReason: null,
      updatedBy: req.superAdmin!.id,
    },
  });
  await logAdminAction(req, "ACTIVATE_WORKSPACE", id, {});
  res.json({ subscription: sub });
});

const extendSchema = z.object({ days: z.number().int().positive() });

superAdminRouter.post("/workspaces/:id/extend", async (req: SuperAdminAuthedRequest, res) => {
  const parsed = extendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "عدد أيام غير صالح" });
  const { id } = req.params;
  const current = await prisma.workspaceSubscription.findUnique({ where: { workspaceId: id } });
  if (!current) return res.status(404).json({ error: "لا يوجد اشتراك لهذا الـWorkspace" });

  const base = current.expiresAt && current.expiresAt.getTime() > Date.now() ? current.expiresAt : new Date();
  const newExpiry = new Date(base.getTime() + parsed.data.days * 24 * 60 * 60 * 1000);

  const sub = await prisma.workspaceSubscription.update({
    where: { workspaceId: id },
    data: { expiresAt: newExpiry, updatedBy: req.superAdmin!.id },
  });
  await logAdminAction(req, "EXTEND_SUBSCRIPTION", id, { days: parsed.data.days, newExpiry });
  res.json({ subscription: sub });
});

const setExpirySchema = z.object({ expiresAt: z.string().datetime().nullable() });

superAdminRouter.post("/workspaces/:id/set-expiry", async (req: SuperAdminAuthedRequest, res) => {
  const parsed = setExpirySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "تاريخ غير صالح" });
  const { id } = req.params;
  const sub = await prisma.workspaceSubscription.update({
    where: { workspaceId: id },
    data: {
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      updatedBy: req.superAdmin!.id,
    },
  });
  await logAdminAction(req, "SET_EXPIRY", id, { expiresAt: parsed.data.expiresAt });
  res.json({ subscription: sub });
});

const limitsSchema = z.object({
  maxPages: z.number().int().min(0).optional(),
  maxAdAccounts: z.number().int().min(0).optional(),
  maxUsers: z.number().int().min(0).optional(),
});

superAdminRouter.post("/workspaces/:id/limits", async (req: SuperAdminAuthedRequest, res) => {
  const parsed = limitsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "قيم حدود غير صالحة" });
  const { id } = req.params;
  const sub = await prisma.workspaceSubscription.update({
    where: { workspaceId: id },
    data: { ...parsed.data, updatedBy: req.superAdmin!.id },
  });
  await logAdminAction(req, "SET_LIMITS", id, parsed.data);
  res.json({ subscription: sub });
});

// ---- سجل التدقيق ----
superAdminRouter.get("/audit-log", async (req, res) => {
  const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
  const actions = await prisma.adminAction.findMany({
    where: workspaceId ? { targetWorkspaceId: workspaceId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { superAdmin: { select: { email: true } } },
  });
  res.json({ actions });
});

// ---- حالة النظام العامة (وضع الصيانة) ----
superAdminRouter.get("/system-state", async (_req, res) => {
  const state = await getSystemState();
  res.json({ state });
});

const systemStateSchema = z.object({
  state: z.enum(["SYSTEM_ACTIVE", "MAINTENANCE_MODE"]),
  confirmText: z.string(),
});

// يتطلب كتابة "MAINTENANCE" حرفيًا لتفعيل وضع الصيانة (زر إيقاف طارئ) - حماية إضافية ضد
// الضغط بالخطأ، بجانب أي نافذة تأكيد في الواجهة.
superAdminRouter.post("/system-state", async (req: SuperAdminAuthedRequest, res) => {
  const parsed = systemStateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  const { state, confirmText } = parsed.data;
  if (state === "MAINTENANCE_MODE" && confirmText !== "MAINTENANCE") {
    return res.status(400).json({ error: 'يجب كتابة "MAINTENANCE" لتأكيد وضع الصيانة' });
  }
  await setSystemState(state);
  await logAdminAction(req, "TOGGLE_MAINTENANCE", null, { state });
  res.json({ state });
});
