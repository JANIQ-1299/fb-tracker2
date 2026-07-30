import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../lib/env.js";

export interface SuperAdminClaims {
  typ: "superadmin";
  id: string;
  email: string;
}

export interface SuperAdminAuthedRequest extends Request {
  superAdmin?: SuperAdminClaims;
}

// واقع منفصل تمامًا عن مصادقة المستخدمين/Workspaces: سرّ JWT مختلف (SUPERADMIN_JWT_SECRET)،
// كوكي مختلف، ولا يقبل توكن مستخدم عادي إطلاقًا حتى لو استُخدم نفس المفتاح بالخطأ.
export function requireSuperAdmin(
  req: SuperAdminAuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.superAdminSession;
  if (!token) return res.status(401).json({ error: "غير مصرح - يلزم تسجيل دخول Super Admin" });
  try {
    const payload = jwt.verify(token, env.superAdminJwtSecret) as SuperAdminClaims;
    if (payload?.typ !== "superadmin") throw new Error("invalid token type");
    req.superAdmin = payload;
    next();
  } catch {
    return res.status(401).json({ error: "جلسة غير صالحة أو منتهية" });
  }
}
