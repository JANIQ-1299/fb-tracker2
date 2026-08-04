import { convertArabicDigits } from "../lib/textNormalize.js";
import { normalizeIraqiPhone } from "../lib/phone.js";

// يعمل فقط على نص الرسالة الجديدة الحالية التي وصلت للتو عبر Webhook - لا يُستدعى أبدًا على أي
// نص محادثة قديم محفوظ مسبقًا. استخراج رقم فقط، وليس اسمًا أو عنوانًا (لا تحليل ذكاء اصطناعي هنا).

const IRAQI_MOBILE_CANDIDATE = /(?:\+?964|00964)?0?7[0-9](?:[\s.\-]?\d){8}/g;

/** يبحث عن أول رقم هاتف عراقي محتمل داخل نص رسالة واحدة ويُعيده موحَّدًا، أو null إن لم يوجد شيء
 * قابل للتوحيد بثقة. */
export function extractPhoneFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const normalizedText = convertArabicDigits(text);
  const matches = normalizedText.match(IRAQI_MOBILE_CANDIDATE);
  if (!matches) return null;

  for (const raw of matches) {
    const digitsOnly = raw.replace(/[^\d+]/g, "");
    const { normalized, confident } = normalizeIraqiPhone(digitsOnly);
    if (confident && normalized) return normalized;
  }
  return null;
}
