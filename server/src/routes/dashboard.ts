import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { buildOrderReport } from "../services/orderReport.js";
import { startOfDayInTz } from "../lib/timezone.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAdmin);

/**
 * تقرير نافذة متحركة (Rolling Window)، افتراضيًا آخر 24 ساعة (env.rollingWindowHours).
 * راجع server/src/services/orderReport.ts لتفاصيل المصدر والقيود.
 */
dashboardRouter.get("/last-24-hours", async (req, res) => {
  const hours = Number(req.query.hours) || env.rollingWindowHours;
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - hours * 60 * 60 * 1000);
  const report = await buildOrderReport(windowStart, windowEnd);
  res.json(report);
});

/** تقرير يوم محدد (محفوظ مسبقًا عبر مهمة 23:59/09:00)، أو ?date=YYYY-MM-DD. افتراضيًا اليوم الحالي. */
dashboardRouter.get("/daily-report", async (req, res) => {
  const dateParam = req.query.date ? new Date(String(req.query.date)) : new Date();
  const reportDate = startOfDayInTz(dateParam, env.tz);
  const saved = await prisma.dailyReport.findUnique({ where: { reportDate } });
  if (!saved) {
    return res.status(404).json({ error: "لا يوجد تقرير محفوظ لهذا اليوم بعد" });
  }
  res.json({
    reportDate: saved.reportDate,
    generatedAt: saved.generatedAt,
    reconciledAt: saved.reconciledAt,
    report: JSON.parse(saved.payload),
  });
});

/** قائمة آخر N تقرير يومي محفوظ */
dashboardRouter.get("/daily-reports", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 14, 60);
  const reports = await prisma.dailyReport.findMany({
    orderBy: { reportDate: "desc" },
    take: limit,
    select: { reportDate: true, generatedAt: true, reconciledAt: true },
  });
  res.json(reports);
});
