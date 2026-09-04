import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { pollTelegramUpdates } from "../services/telegramOrders.js";

const POLL_INTERVAL_MS = 4000;

// Long polling بسيط لبوت طلبات نضارة (بدل Webhook عام) - كافٍ لحجم استخدام صفحة هبوط واحدة،
// ولا يتطلب عنوان HTTPS عام يستقبل تحديثات Telegram. راجع services/telegramOrders.ts.
export function scheduleTelegramPolling() {
  if (!env.telegramBotToken) {
    logger.info("TELEGRAM_BOT_TOKEN غير مهيأ - تخطي بوت تليجرام لطلبات نضارة");
    return;
  }

  setInterval(() => {
    pollTelegramUpdates().catch((err) =>
      logger.error({ err: (err as Error).message }, "فشل استطلاع تحديثات Telegram"),
    );
  }, POLL_INTERVAL_MS);

  logger.info("تم تشغيل بوت تليجرام لطلبات نضارة (استطلاع كل 4 ثوانٍ)");
}
