import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../lib/env.js";

export interface AuthedRequest extends Request {
  admin?: { id: string; email: string; role: string };
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.session;
  if (!token) return res.status(401).json({ error: "غير مصرح - يلزم تسجيل الدخول" });
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthedRequest["admin"];
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: "جلسة غير صالحة أو منتهية" });
  }
}
