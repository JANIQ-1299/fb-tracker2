import crypto from "node:crypto";
import ax from "axios";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

/**
 * Conversions API for CRM (Conversion Leads Integration) — الطريقة الرسمية الوحيدة
 * المتاحة حاليًا لإرسال مراحل تقدّم العميل (مثل "مؤهل"/"طلب مكتمل") مرة أخرى إلى Meta
 * لتحسين استهداف الحملة. توثيق Meta:
 * https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration
 *
 * ملاحظة مهمة: هذا لا علاقة له بقراءة مراحل Leads Center — Meta لا توفر API عامًا لقراءة
 * الحالة الداخلية لـLeads Center حاليًا. هذا فقط إرسال (write-only) لحدث تحسين الجودة.
 * يتطلب Dataset ID مُهيّأ مسبقًا من Events Manager (META_CONVERSIONS_DATASET_ID في .env).
 */

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export interface LeadQualityEvent {
  leadId: string; // metaLeadId (leadgen_id)
  email?: string | null;
  phone?: string | null; // بصيغة E.164 موحّدة
  eventName: "Lead" | "Contact" | "Application" | "Purchase" | "Schedule";
  eventTime?: Date;
}

export async function sendLeadStatusToMeta(evt: LeadQualityEvent): Promise<{ sent: boolean; reason?: string }> {
  if (!env.metaConversionsDatasetId || !env.metaPageAccessToken) {
    return {
      sent: false,
      reason:
        "غير مُهيّأ: META_CONVERSIONS_DATASET_ID أو META_PAGE_ACCESS_TOKEN غير موجودين. راجع README قسم Conversions API for CRM.",
    };
  }

  const userData: Record<string, string[]> = {};
  if (evt.email) userData.em = [sha256(evt.email)];
  if (evt.phone) userData.ph = [sha256(evt.phone.replace(/\D/g, ""))];
  userData.lead_id = [evt.leadId];

  const payload = {
    data: [
      {
        event_name: evt.eventName,
        event_time: Math.floor((evt.eventTime ?? new Date()).getTime() / 1000),
        action_source: "system_generated",
        user_data: userData,
      },
    ],
  };

  const url = `https://graph.facebook.com/${env.metaGraphApiVersion}/${env.metaConversionsDatasetId}/events`;

  try {
    await ax.post(url, payload, {
      params: { access_token: env.metaPageAccessToken },
      timeout: 15_000,
    });
    return { sent: true };
  } catch (err: any) {
    const fbError = err?.response?.data?.error;
    logger.error({ fbError: fbError ?? err?.message }, "فشل إرسال حدث Conversions API for CRM");
    return { sent: false, reason: fbError?.message ?? "خطأ شبكة غير معروف" };
  }
}
