import crypto from "node:crypto";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

/**
 * Conversions API (خادم-لخادم) لحدث Purchase الفعلي لبكسل نضارة - منفصل تمامًا عن
 * services/capi.ts (الذي يخدم "Conversion Leads Integration" لعملاء Meta Lead Ads عبر
 * Dataset مختلف). هذا الملف يرسل لنفس البكسل المثبّت بصفحة الهبوط (web/lib/pixel.ts) حتى
 * تتوحّد البيانات بـEvents Manager. يُستدعى فقط بعد ما صاحبة المتجر تؤكد البيع الفعلي عبر
 * زر التأكيد بتليجرام - راجع services/telegramOrders.ts.
 */

// يجب أن يطابق META_PIXEL_ID الثابت في web/lib/pixel.ts
const PIXEL_ID = "1409019547733349";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export interface PurchaseEventInput {
  orderId: string;
  phone: string;
  value: number;
  quantity: number;
  eventTime: Date;
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  userAgent?: string;
}

export async function sendPurchaseEvent(evt: PurchaseEventInput): Promise<{ sent: boolean; reason?: string }> {
  if (!env.metaPageAccessToken) {
    return { sent: false, reason: "META_PAGE_ACCESS_TOKEN غير موجود" };
  }

  const userData: Record<string, unknown> = {
    ph: [sha256(evt.phone.replace(/\D/g, ""))],
  };
  if (evt.fbp) userData.fbp = evt.fbp;
  if (evt.fbc) userData.fbc = evt.fbc;
  if (evt.clientIp) userData.client_ip_address = evt.clientIp;
  if (evt.userAgent) userData.client_user_agent = evt.userAgent;

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(evt.eventTime.getTime() / 1000),
        event_id: evt.orderId,
        // البيع يُؤكَّد فعليًا عبر مكالمة هاتفية بعد إرسال الفورم، وليس لحظة تصفح الموقع
        action_source: "phone_call",
        user_data: userData,
        custom_data: {
          currency: "IQD",
          value: evt.value,
          num_items: evt.quantity,
          content_name: "بكج نضارة",
        },
      },
    ],
  };

  const url = `https://graph.facebook.com/${env.metaGraphApiVersion}/${PIXEL_ID}/events`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, access_token: env.metaPageAccessToken }),
    });
    const data = (await res.json()) as { error?: { message?: string } };
    if (!res.ok || data.error) {
      logger.error({ fbError: data.error }, "فشل إرسال حدث Purchase لـMeta Conversions API");
      return { sent: false, reason: data.error?.message ?? "خطأ غير معروف من Meta" };
    }
    return { sent: true };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "خطأ شبكة أثناء إرسال حدث Purchase لـMeta");
    return { sent: false, reason: (err as Error).message };
  }
}
