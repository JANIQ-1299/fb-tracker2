import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { getSystemState } from "../lib/systemState.js";
import { getEffectiveSubscription, SUSPENSION_MESSAGES } from "../lib/subscription.js";
import { requireUser, type WorkspaceAuthedRequest } from "../middleware/workspaceAuth.js";
import { requireActiveWorkspace, requireSystemActive } from "../middleware/workspaceGuard.js";

export const workspaceAuthRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// دخول مستخدمي الـWorkspaces (النظام الجديد). الحسابات تُنشأ يدويًا فقط حاليًا (لا تسجيل عام) -
// راجع server/prisma/seedWorkspace.ts. التحقق من حالة النظام والاشتراك يتم هنا **قبل** إصدار
// الجلسة مباشرة بعد التحقق من كلمة المرور، وليس فقط عند فتح لوحة التحكم لاحقًا.
workspaceAuthRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات دخول غير صالحة" });
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });

  const systemState = await getSystemState();
  if (systemState === "MAINTENANCE_MODE") {
    return res.status(503).json({ error: "النظام في وضع الصيانة حاليًا. يرجى المحاولة لاحقًا." });
  }

  const { status } = await getEffectiveSubscription(user.workspaceId);
  if (status !== "ACTIVE") {
    return res.status(403).json({
      error: SUSPENSION_MESSAGES[status] ?? SUSPENSION_MESSAGES.SUSPENDED,
      workspaceStatus: status,
    });
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await prisma.licenseDevice.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      deviceInfo: req.headers["user-agent"]?.slice(0, 255),
      ipAddress: req.ip,
    },
  });

  const token = jwt.sign(
    { typ: "user", id: user.id, email: user.email, workspaceId: user.workspaceId, role: user.role },
    env.jwtSecret,
    { expiresIn: "12h" },
  );
  logger.info({ userId: user.id, workspaceId: user.workspaceId }, "Workspace user login succeeded");

  res.cookie("workspaceSession", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
  });
  res.json({ token, email: user.email, workspaceId: user.workspaceId, role: user.role });
});

workspaceAuthRouter.post("/logout", (_req, res) => {
  res.clearCookie("workspaceSession");
  res.json({ ok: true });
});

// معلومات الجلسة الحالية + حالة الاشتراك - تُستخدم من الواجهة عند فتح لوحة التحكم للتأكد أن
// الحساب ما زال ACTIVE حتى لو كان التوكن نفسه صالحًا (مثلًا أُوقف الحساب أثناء الجلسة).
workspaceAuthRouter.get(
  "/me",
  requireUser,
  requireSystemActive,
  requireActiveWorkspace,
  async (req: WorkspaceAuthedRequest, res) => {
    const workspace = await prisma.workspace.findUnique({
      where: { id: req.user!.workspaceId },
      include: { subscription: { include: { plan: true } } },
    });
    res.json({ user: req.user, workspace });
  },
);
