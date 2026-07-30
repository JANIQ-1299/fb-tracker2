import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../lib/env.js";

export interface WorkspaceUserClaims {
  typ: "user";
  id: string;
  email: string;
  workspaceId: string;
  role: string;
}

export interface WorkspaceAuthedRequest extends Request {
  user?: WorkspaceUserClaims;
}

// مصادقة مستخدمي الـWorkspaces (النظام الجديد Multi-Tenant) — منفصلة تمامًا عن `requireAdmin`
// القديم (نظام Admin واحد عبر .env) الذي يبقى كما هو لخدمة لوحة التحكم الحالية دون تعديل.
export function requireUser(req: WorkspaceAuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.workspaceSession;
  if (!token) return res.status(401).json({ error: "غير مصرح - يلزم تسجيل الدخول" });
  try {
    const payload = jwt.verify(token, env.jwtSecret) as WorkspaceUserClaims;
    if (payload?.typ !== "user" || !payload.workspaceId) {
      throw new Error("invalid token type");
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "جلسة غير صالحة أو منتهية" });
  }
}
