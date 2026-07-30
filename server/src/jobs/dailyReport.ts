import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { startOfDayInTz } from "../lib/timezone.js";
import { buildOrderReport } from "../services/orderReport.js";

/**
 * يولّد ويحفظ تقرير اليوم الحالي (بتوقيت Asia/Baghdad) الساعة 23:59، ثم يعيد المطابقة الساعة
 * 09:00 من اليوم التالي لتحديث نفس السجل ببيانات Meta المتأخرة (Meta أحيانًا تُحدّث الأرقام
 * بأثر رجعي لبضع ساعات). لا يحذف السجل القديم أبدًا - upsert فقط بمفتاح reportDate.
 */
export async function generateDailyReport(forDate: Date = new Date(), markReconciled = false) {
  const dayStart = startOfDayInTz(forDate, env.tz);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const report = await buildOrderReport(dayStart, dayEnd);

  const saved = await prisma.dailyReport.upsert({
    where: { reportDate: dayStart },
    update: {
      payload: JSON.stringify(report),
      ...(markReconciled ? { reconciledAt: new Date() } : {}),
    },
    create: {
      reportDate: dayStart,
      payload: JSON.stringify(report),
    },
  });

  logger.info(
    { reportDate: dayStart.toISOString(), orders: report.summary.metaRecordedOrders, reconciled: markReconciled },
    "تم توليد/تحديث تقرير اليوم",
  );
  return saved;
}

export function scheduleDailyReportJob() {
  if (!env.autoSyncEnabled) return;

  // 23:59 بتوقيت Asia/Baghdad - تقرير اليوم الحالي عند اكتماله تقريبًا
  cron.schedule(
    "59 23 * * *",
    () => generateDailyReport(new Date(), false).catch((err) => logger.error({ err: err.message }, "فشل تقرير 23:59")),
    { timezone: env.tz },
  );

  // 09:00 صباحًا بتوقيت Asia/Baghdad - إعادة مطابقة تقرير أمس (Meta قد تُحدّث الأرقام بأثر رجعي)
  cron.schedule(
    "0 9 * * *",
    () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      generateDailyReport(yesterday, true).catch((err) => logger.error({ err: err.message }, "فشلت إعادة مطابقة 09:00"));
    },
    { timezone: env.tz },
  );

  logger.info("تمت جدولة تقرير نهاية اليوم (23:59) وإعادة المطابقة الصباحية (09:00)");
}
