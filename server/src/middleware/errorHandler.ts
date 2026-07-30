import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: "المسار غير موجود" });
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  logger.error({ err: { message: err?.message, stack: err?.stack }, path: req.path }, "Unhandled error");
  const status = err?.status ?? 500;
  res.status(status).json({ error: err?.publicMessage ?? "حدث خطأ غير متوقع في الخادم" });
}
