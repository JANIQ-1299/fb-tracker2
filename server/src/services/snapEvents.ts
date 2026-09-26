import crypto from "node:crypto";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

// يجب أن يطابق SNAP_PIXEL_ID في web/lib/pixel.ts
const SNAP_PIXEL_ID = "813791b7-c0f0-4f20-b092-ad4ba5e8234c";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

// سناب يتطلب الرقم بصيغة دولية بدون + أو أصفار بادئة (العراق 964)
function normalizeIraqPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `964${digits.slice(1)}`;
  return digits;
}

export const isSnapConfigured = () => Boolean(env.snapCapiToken);

export interface SnapPurchaseInput {
  orderId: string;
  phone: string;
  value: number;
  eventTime: Date;
  scCookie1?: string;
  scClickId?: string;
  clientIp?: string;
  userAgent?: string;
}

export async function sendSnapPurchaseEvent(evt: SnapPurchaseInput): Promise<{ sent: boolean; reason?: string }> {
  if (!env.snapCapiToken) return { sent: false, reason: "SNAP_CAPI_TOKEN غير موجود" };

  const userData: Record<string, unknown> = { ph: [sha256(normalizeIraqPhone(evt.phone))] };
  if (evt.scCookie1) userData.sc_cookie1 = evt.scCookie1;
  if (evt.scClickId) userData.sc_click_id = evt.scClickId;
  if (evt.clientIp) userData.client_ip_address = evt.clientIp;
  if (evt.userAgent) userData.client_user_agent = evt.userAgent;

  const body = {
    data: [
      {
        event_name: "PURCHASE",
        event_time: Math.floor(evt.eventTime.getTime() / 1000),
        event_id: evt.orderId,
        action_source: "WEB",
        event_source_url: env.webPublicBaseUrl.split(",")[0]?.trim() || "https://www.nadharaofficial.com",
        user_data: userData,
        custom_data: { currency: "IQD", value: evt.value, order_id: evt.orderId },
      },
    ],
  };

  const url = `https://tr.snapchat.com/v3/${SNAP_PIXEL_ID}/events?access_token=${encodeURIComponent(env.snapCapiToken)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      logger.error({ status: res.status, snapError: text }, "فشل إرسال حدث Purchase لـSnap Conversions API");
      return { sent: false, reason: `Snap ${res.status}: ${text}` };
    }
    return { sent: true };
  } catch (err) {
    logger.error({ err: (err as Error).message }, "خطأ شبكة أثناء إرسال حدث Purchase لـSnap");
    return { sent: false, reason: (err as Error).message };
  }
}
