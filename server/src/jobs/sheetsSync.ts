import cron from "node-cron";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { syncSystemToSheet, syncSheetToSystem } from "../services/sheets.js";

export async function runSheetsSync() {
  if (!env.googleSheetsEnabled) {
    logger.info("تخطي مزامنة Google Sheets: غير مفعّلة");
    return { skipped: true };
  }
  // أولًا نسحب تحديثات الحالة من الشيت، ثم نكتب أحدث نسخة كاملة من النظام إلى الشيت
  const fromSheet = await syncSheetToSystem();
  const toSheet = await syncSystemToSheet();
  return { fromSheet, toSheet };
}

export function scheduleSheetsSync() {
  cron.schedule("*/15 * * * *", () => runSheetsSync().catch((e) => logger.error({ err: e.message }, "فشل جدولة مزامنة Sheets")), {
    timezone: env.tz,
  });
  logger.info("تمت جدولة مزامنة Google Sheets كل 15 دقيقة");
}

if (process.argv.includes("--once")) {
  runSheetsSync()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
