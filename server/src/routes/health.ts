import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { env, isMetaConfigured } from "../lib/env.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  let dbStatus = "connected";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    return res.status(503).json({ status: "error", database: "disconnected", message: (err as Error).message });
  }

  const lastSyncRun = await prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } });
  const lastWebhookEvent = await prisma.webhookEvent.findFirst({ orderBy: { receivedAt: "desc" } });

  const alerts: string[] = [];
  const now = Date.now();

  if (env.autoSyncEnabled) {
    if (!lastSyncRun) {
      alerts.push("لم تُنفَّذ أي مزامنة بعد منذ تشغيل النظام");
    } else if (lastSyncRun.status === "failed") {
      alerts.push(`آخر مزامنة فشلت: ${lastSyncRun.errorMessage ?? "سبب غير معروف"}`);
    } else if (now - lastSyncRun.startedAt.getTime() > 2 * 60 * 60 * 1000) {
      alerts.push("لم تنجح المزامنة منذ أكثر من ساعتين");
    }
  }

  if (!isMetaConfigured()) {
    alerts.push("Meta غير مهيأة بالكامل (App ID / App Secret / Access Token)");
  }

  res.json({
    status: alerts.length > 0 ? "degraded" : "ok",
    database: dbStatus,
    scheduler: env.autoSyncEnabled ? "running" : "disabled",
    webhook: env.metaAppSecret ? "active" : "inactive",
    // مفتاح Anthropic محفوظ للمستقبل فقط - لا خدمة تحليل محادثات فعلية تستخدمه حاليًا
    anthropic: env.anthropicApiKey ? "configured_unused" : "not_configured",
    lastMetaSync: lastSyncRun?.completedAt ?? lastSyncRun?.startedAt ?? null,
    lastMetaSyncStatus: lastSyncRun?.status ?? "never_run",
    lastWebhookEventAt: lastWebhookEvent?.receivedAt ?? null,
    lastConversationAnalysis: null, // غير مطبَّق - راجع dataLimitations في /api/dashboard/last-24-hours
    pendingConversationCount: 0,
    alerts,
    time: new Date().toISOString(),
  });
});
