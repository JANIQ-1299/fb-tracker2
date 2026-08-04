import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

/** يُصفّر Message.textRaw لكل رسالة تجاوزت مدة الاحتفاظ المحدَّدة لكل Workspace (retentionDays في
 * MessagingIntegration - 7/30/90 يومًا، افتراضي 30). بعد الحذف يبقى فقط: الرقم المستخرج + معرّف
 * الرسالة/المحادثة/الإعلان + وقت الرسالة + نتيجة المطابقة وسجل التغييرات - دفاع إضافي حتى لو لم
 * يُحذف النص فورًا وقت الاستقبال. */
export async function purgeExpiredMessageText(now: Date = new Date()) {
  const integrations = await prisma.messagingIntegration.findMany();
  let totalPurged = 0;

  for (const integration of integrations) {
    const cutoff = new Date(now.getTime() - integration.retentionDays * 24 * 60 * 60 * 1000);
    const result = await prisma.message.updateMany({
      where: { workspaceId: integration.workspaceId, textRaw: { not: null }, receivedAt: { lt: cutoff } },
      data: { textRaw: null, textPurgedAt: now },
    });
    totalPurged += result.count;
  }

  if (totalPurged > 0) logger.info({ totalPurged }, "تم حذف نص الرسائل المنتهية مدة احتفاظها");
  return totalPurged;
}

export function scheduleMessagePurgeJob() {
  if (!env.autoSyncEnabled) return;
  cron.schedule(
    "30 3 * * *", // 03:30 بتوقيت Asia/Baghdad يوميًا - خارج ساعات الذروة
    () => purgeExpiredMessageText().catch((err) => logger.error({ err: err.message }, "فشلت مهمة حذف نصوص الرسائل")),
    { timezone: env.tz },
  );
  logger.info("تمت جدولة مهمة حذف نص الرسائل المنتهية (يوميًا 03:30)");
}
