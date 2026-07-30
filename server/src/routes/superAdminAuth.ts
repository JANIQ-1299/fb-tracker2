import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import { z } from "zod";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

export const superAdminAuthRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// الخطوة 1: بريد + كلمة مرور فقط. لا تُصدر جلسة كاملة أبدًا في هذه الخطوة - فقط توكن مؤقت
// (5 دقائق) يُستخدم لإكمال التحقق الثنائي (TOTP) في الخطوة 2.
superAdminAuthRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات دخول غير صالحة" });
  const { email, password } = parsed.data;

  const superAdmin = await prisma.superAdmin.findUnique({ where: { email } });
  if (!superAdmin || !superAdmin.isActive) {
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  }
  const valid = await bcrypt.compare(password, superAdmin.passwordHash);
  if (!valid) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });

  const pendingToken = jwt.sign(
    { typ: "superadmin_pending", id: superAdmin.id, email: superAdmin.email },
    env.superAdminJwtSecret,
    { expiresIn: "5m" },
  );
  res.json({ pendingToken, requiresTwoFactor: true });
});

const verify2faSchema = z.object({
  pendingToken: z.string(),
  code: z.string().min(6).max(6),
});

// الخطوة 2: التحقق من رمز TOTP (تطبيق مصادقة مثل Google Authenticator) قبل إصدار جلسة فعلية.
superAdminAuthRouter.post("/verify-2fa", async (req, res) => {
  const parsed = verify2faSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  const { pendingToken, code } = parsed.data;

  let claims: { typ: string; id: string; email: string };
  try {
    claims = jwt.verify(pendingToken, env.superAdminJwtSecret) as typeof claims;
    if (claims.typ !== "superadmin_pending") throw new Error("invalid");
  } catch {
    return res.status(401).json({ error: "انتهت صلاحية جلسة الدخول المؤقتة، أعد المحاولة" });
  }

  const superAdmin = await prisma.superAdmin.findUnique({ where: { id: claims.id } });
  if (!superAdmin || !superAdmin.isActive) {
    return res.status(401).json({ error: "الحساب غير موجود أو معطّل" });
  }

  const validCode = authenticator.check(code, superAdmin.totpSecret);
  if (!validCode) return res.status(401).json({ error: "رمز التحقق الثنائي غير صحيح" });

  const token = jwt.sign(
    { typ: "superadmin", id: superAdmin.id, email: superAdmin.email },
    env.superAdminJwtSecret,
    { expiresIn: "8h" },
  );
  await prisma.superAdmin.update({ where: { id: superAdmin.id }, data: { lastLoginAt: new Date() } });
  logger.info({ superAdminId: superAdmin.id }, "Super Admin login succeeded");

  res.cookie("superAdminSession", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
  });
  res.json({ token, email: superAdmin.email });
});

superAdminAuthRouter.post("/logout", (_req, res) => {
  res.clearCookie("superAdminSession");
  res.json({ ok: true });
});
