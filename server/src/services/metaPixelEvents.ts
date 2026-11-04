import crypto from "node:crypto";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

// Sends the same website Purchase event as the browser pixel.

// يجب أن يطابق META_PIXEL_ID الثابت في web/lib/pixel.ts
const PIXEL_ID = "2023190068308366";

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
  const token = process.env.NADHARA_META_CAPI_TOKEN?.trim();
  if (!token) {
    return { sent: false, reason: "NADHARA_META_CAPI_TOKEN غير موجود" };
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
        action_source: "website",
        event_source_url: "https://www.nadharaofficial.com/order",
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
      signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, access_token: token }),
    });
    const data = (await res.json()) as { events_received?: number; error?: { message?: string } };
    if (!res.ok || data.error || !data.events_received) {
      logger.error({ fbError: data.error }, "فشل إرسال حدث Purchase لـMeta Conversions API");
      return { sent: false, reason: data.error?.message ?? "خطأ غير معروف من Meta" };
    }
    return { sent: true };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "خطأ شبكة أثناء إرسال حدث Purchase لـMeta");
    return { sent: false, reason: (err as Error).message };
  }
}
