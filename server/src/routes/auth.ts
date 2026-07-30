import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات دخول غير صالحة" });
  const { email, password } = parsed.data;

  // مستخدم Admin واحد من .env (سريع للإعداد الأولي)، أو من جدول AdminUser إن وُجد
  let passwordHash = env.adminPasswordHash;
  let adminEmail = env.adminEmail;
  let adminId = "env-admin";

  if (email !== adminEmail) {
    const dbAdmin = await prisma.adminUser.findUnique({ where: { email } });
    if (!dbAdmin) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    passwordHash = dbAdmin.passwordHash;
    adminEmail = dbAdmin.email;
    adminId = dbAdmin.id;
  }

  if (!passwordHash) return res.status(401).json({ error: "لم يتم إعداد حساب Admin بعد" });
  const valid = await bcrypt.compare(password, passwordHash);
  if (!valid) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });

  const token = jwt.sign({ id: adminId, email: adminEmail, role: "admin" }, env.jwtSecret, {
    expiresIn: "12h",
  });
  res.cookie("session", token, { httpOnly: true, sameSite: "lax", secure: env.nodeEnv === "production" });
  res.json({ token, email: adminEmail });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});
