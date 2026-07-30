import { parsePhoneNumberWithError } from "libphonenumber-js";

/**
 * توحيد أرقام الهاتف العراقية إلى صيغة E.164 (+964...) قدر الإمكان.
 * يتعامل مع الصيغ الشائعة محليًا:
 *  - 07XXXXXXXXX  (محلي، 11 رقمًا يبدأ بـ 0)
 *  - 7XXXXXXXXX   (بدون الصفر البادئ)
 *  - 9647XXXXXXXXX / +9647XXXXXXXXX / 009647XXXXXXXXX
 * إن تعذّر التوحيد يُعاد الرقم بعد إزالة الفراغات والرموز فقط، مع علامة عدم يقين
 * عبر إرجاع confident=false ليستخدمها المستدعي في اتخاذ القرار.
 */
export function normalizeIraqiPhone(raw: string | null | undefined): {
  normalized: string | null;
  confident: boolean;
} {
  if (!raw) return { normalized: null, confident: false };

  let digits = raw.trim().replace(/[^\d+]/g, "");
  if (!digits) return { normalized: null, confident: false };

  // 00964... -> +964...
  if (digits.startsWith("00964")) digits = "+" + digits.slice(2);
  // 964XXXXXXXXXX (بدون +) -> +964...
  else if (digits.startsWith("964") && !digits.startsWith("+")) digits = "+" + digits;
  // 07XXXXXXXXX (محلي، 11 رقم) -> +9647XXXXXXXXX
  else if (/^07\d{9}$/.test(digits)) digits = "+964" + digits.slice(1);
  // 7XXXXXXXXX (10 أرقام تبدأ بـ7 بدون صفر) -> +9647XXXXXXXXX
  else if (/^7\d{9}$/.test(digits)) digits = "+964" + digits;
  else if (!digits.startsWith("+")) digits = "+" + digits;

  try {
    const parsed = parsePhoneNumberWithError(digits, "IQ");
    if (parsed.isValid()) {
      return { normalized: parsed.number, confident: true };
    }
    return { normalized: digits, confident: false };
  } catch {
    return { normalized: digits, confident: false };
  }
}
