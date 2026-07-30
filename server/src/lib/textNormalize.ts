// أدوات تنظيف نصوص/أرقام/تواريخ عامة تُستخدم في استيراد ملفات Excel/CSV (وقابلة لإعادة
// الاستخدام في أي مكان آخر يحتاج تنظيف مدخلات عربية/إنجليزية مختلطة).

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** يحوّل الأرقام العربية والفارسية (٠١٢٣.. / ۰۱۲۳..) إلى أرقام إنجليزية عادية. */
export function convertArabicDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(ch);
    if (arabicIndex !== -1) return String(arabicIndex);
    const persianIndex = PERSIAN_DIGITS.indexOf(ch);
    if (persianIndex !== -1) return String(persianIndex);
    return ch;
  });
}

/** يزيل المسافات الزائدة (بداية/نهاية/متكررة) والرموز غير المرئية الشائعة، مع تحويل الأرقام. */
export function cleanText(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  let s = String(input);
  s = convertArabicDigits(s);
  // إزالة علامات الاتجاه الخفية والمسافات غير المتقطعة التي تتسلل أحيانًا من Excel
  s = s.replace(/[‎‏ ﻿]/g, " ");
  s = s.trim().replace(/\s+/g, " ");
  return s.length > 0 ? s : null;
}

/** يزيل رموز العملة والفواصل الشائعة قبل تحليل السعر كرقم. */
export function parsePrice(input: unknown): { value: number | null; error: string | null } {
  const cleaned = cleanText(input);
  if (cleaned === null) return { value: null, error: null };
  const stripped = cleaned.replace(/[^\d.\-]/g, "");
  if (!stripped) return { value: null, error: `قيمة سعر غير قابلة للقراءة: "${cleaned}"` };
  const value = Number(stripped);
  if (!Number.isFinite(value)) return { value: null, error: `قيمة سعر غير صالحة: "${cleaned}"` };
  return { value, error: null };
}

const DATE_FORMATS = [
  // YYYY-MM-DD أو YYYY/MM/DD
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/,
  // DD-MM-YYYY أو DD/MM/YYYY
  /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/,
];

/** يحلّل تاريخ الطلب من كائن Date (تحوّله xlsx تلقائيًا)، رقم Excel التسلسلي، أو نص شائع الصيغة. */
export function parseOrderDate(input: unknown): { value: Date | null; error: string | null } {
  if (input === null || input === undefined || input === "") return { value: null, error: null };

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return { value: null, error: "تاريخ غير صالح" };
    return { value: input, error: null };
  }

  if (typeof input === "number") {
    // رقم Excel التسلسلي للتاريخ (منذ 1899-12-30)
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const value = new Date(epoch.getTime() + input * 86400000);
    if (Number.isNaN(value.getTime())) return { value: null, error: `رقم تاريخ Excel غير صالح: ${input}` };
    return { value, error: null };
  }

  const cleaned = cleanText(input);
  if (cleaned === null) return { value: null, error: null };

  for (const pattern of DATE_FORMATS) {
    const match = cleaned.match(pattern);
    if (match) {
      const [, a, b, c] = match;
      // النمط الأول: YYYY-MM-DD | النمط الثاني: DD-MM-YYYY
      const isYearFirst = a.length === 4;
      const year = Number(isYearFirst ? a : c);
      const month = Number(isYearFirst ? b : b);
      const day = Number(isYearFirst ? c : a);
      const value = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(value.getTime()) && value.getUTCMonth() === month - 1) {
        return { value, error: null };
      }
      return { value: null, error: `تاريخ غير صالح: "${cleaned}"` };
    }
  }

  const fallback = new Date(cleaned);
  if (!Number.isNaN(fallback.getTime())) return { value: fallback, error: null };

  return { value: null, error: `تعذّر تحليل التاريخ: "${cleaned}"` };
}

export interface TimeOfDay {
  hours: number;
  minutes: number;
  seconds: number;
}

/** يحلّل وقت الطلب من كائن Date (خلية وقت في Excel)، كسر يوم Excel التسلسلي، أو نص شائع
 * الصيغة (بما فيها صباحًا/مساءً بالعربية). يُستخدم لدمج التاريخ+الوقت في حقل orderDate واحد. */
export function parseTimeOfDay(input: unknown): { value: TimeOfDay | null; error: string | null } {
  if (input === null || input === undefined || input === "") return { value: null, error: null };

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return { value: null, error: "وقت غير صالح" };
    return {
      value: { hours: input.getUTCHours(), minutes: input.getUTCMinutes(), seconds: input.getUTCSeconds() },
      error: null,
    };
  }

  if (typeof input === "number") {
    // كسر يوم Excel التسلسلي لوقت اليوم (0.5 = الساعة 12:00 ظهرًا)
    const totalSeconds = Math.round(input * 86400);
    return {
      value: {
        hours: Math.floor(totalSeconds / 3600) % 24,
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60,
      },
      error: null,
    };
  }

  const cleaned = cleanText(input);
  if (cleaned === null) return { value: null, error: null };

  const match = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(ص|م|صباحا|مساء|am|pm)?$/i);
  if (!match) return { value: null, error: `تعذّر تحليل وقت الطلب: "${cleaned}"` };

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;
  const meridiem = match[4]?.toLowerCase();

  if (meridiem) {
    const isPM = meridiem === "م" || meridiem === "مساء" || meridiem === "pm";
    const isAM = meridiem === "ص" || meridiem === "صباحا" || meridiem === "am";
    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;
  }

  if (hours > 23 || minutes > 59 || seconds > 59) {
    return { value: null, error: `وقت غير صالح: "${cleaned}"` };
  }

  return { value: { hours, minutes, seconds }, error: null };
}

/** يدمج توقيت (ساعة/دقيقة/ثانية) داخل تاريخ موجود، محافظًا على السنة/الشهر/اليوم من `date`. */
export function combineDateAndTime(date: Date, time: TimeOfDay): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), time.hours, time.minutes, time.seconds),
  );
}
