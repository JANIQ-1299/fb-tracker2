import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/auth.js";
import { env, isMetaConfigured } from "../lib/env.js";
import { metaGet } from "../lib/meta.js";
import { logger } from "../lib/logger.js";

export const settingsRouter = Router();
settingsRouter.use(requireAdmin);

settingsRouter.get("/", async (_req, res) => {
  const rows = await prisma.appSetting.findMany();
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({
    timezone: settings.timezone ?? env.tz,
    currency: settings.currency ?? env.defaultCurrency,
    orderSubmittedStatusLabel: settings.orderSubmittedStatusLabel ?? "تم تقديم الطلب",
    metaConfigured: isMetaConfigured(),
    googleSheetsEnabled: env.googleSheetsEnabled,
  });
});

settingsRouter.put("/", async (req, res) => {
  const updates: Record<string, string> = req.body ?? {};
  for (const [key, value] of Object.entries(updates)) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
  }
  res.json({ ok: true });
});

settingsRouter.get("/test-meta", async (_req, res) => {
  if (!isMetaConfigured()) {
    return res.json({ ok: false, message: "لم يتم إعداد META_APP_ID / META_APP_SECRET / META_PAGE_ACCESS_TOKEN بعد" });
  }
  try {
    const page = await metaGet<any>(env.metaPageId, { fields: "id,name" });
    res.json({ ok: true, page });
  } catch (err: any) {
    res.json({ ok: false, message: err.message });
  }
});

settingsRouter.get("/test-sheets", async (_req, res) => {
  if (!env.googleSheetsEnabled) {
    return res.json({ ok: false, message: "مزامنة Google Sheets غير مفعّلة (GOOGLE_SHEETS_ENABLED=false)" });
  }
  try {
    const { testConnection } = await import("../services/sheets.js");
    const result = await testConnection();
    res.json(result);
  } catch (err: any) {
    res.json({ ok: false, message: err.message });
  }
});

settingsRouter.get("/last-webhook", async (_req, res) => {
  const last = await prisma.webhookEvent.findFirst({ orderBy: { receivedAt: "desc" } });
  res.json(last ?? null);
});

settingsRouter.post("/resync", async (_req, res) => {
  const log = await prisma.syncLog.create({ data: { source: "manual_resync", status: "RUNNING" } });
  try {
    const { runInsightsSync } = await import("../jobs/insights.js");
    await runInsightsSync();
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "SUCCESS", completedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err.message }, "فشلت إعادة المزامنة اليدوية");
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", completedAt: new Date(), details: err.message },
    });
    res.status(500).json({ ok: false, message: err.message });
  }
});
