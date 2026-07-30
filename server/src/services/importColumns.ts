import { convertArabicDigits } from "../lib/textNormalize.js";

export type CanonicalField =
  | "customerName"
  | "phone"
  | "governorate"
  | "address"
  | "product"
  | "price"
  | "orderStatus"
  | "orderDate"
  | "orderTime" // يُدمَج مع orderDate فقط - لا يقابل عمود Order مستقلًا في قاعدة البيانات
  | "adNameRaw"
  | "videoNameRaw"
  | "campaignNameRaw"
  | "campaignIdRaw"
  | "adSetIdRaw"
  | "adIdRaw"
  | "leadIdRaw"
  | "sourceRaw"
  | "externalOrderId"
  | "employeeName";

export interface CanonicalFieldDef {
  key: CanonicalField;
  label: string;
  aliases: string[];
  /** حقول الهوية - يجب توفر واحد منها على الأقل حتى يُعتبر الصف "صحيحًا" وليس "ناقصًا". */
  identity?: boolean;
}

// راجع طلب المستخدم: "تتعرّف الأداة تلقائيًا على الأعمدة العربية والإنجليزية حتى لو تغيّر
// ترتيبها أو أسماؤها". القوائم أدناه تغطي الصيغ الشائعة؛ أي عمود لا يُتعرَّف عليه تلقائيًا
// يُترك للمستخدم لربطه يدويًا في شاشة Mapping.
export const CANONICAL_FIELDS: CanonicalFieldDef[] = [
  {
    key: "customerName",
    label: "اسم الزبون",
    identity: true,
    aliases: ["اسم الزبون", "اسم العميل", "الاسم", "اسم", "الزبون", "العميل", "customer name", "customer", "name", "client name", "full name"],
  },
  {
    key: "phone",
    label: "رقم الهاتف",
    identity: true,
    aliases: ["رقم الهاتف", "الهاتف", "رقم الجوال", "الجوال", "رقم الموبايل", "هاتف", "phone", "phone number", "mobile", "mobile number", "tel", "telephone"],
  },
  {
    key: "governorate",
    label: "المحافظة",
    aliases: ["المحافظة", "محافظة", "المدينة", "مدينة", "province", "governorate", "city"],
  },
  {
    key: "address",
    label: "العنوان",
    aliases: ["العنوان", "عنوان", "العنوان التفصيلي", "عنوان تفصيلي", "التفاصيل", "address", "location", "details"],
  },
  {
    key: "product",
    label: "المنتج",
    aliases: ["المنتج", "منتج", "اسم المنتج", "product", "product name", "item"],
  },
  {
    key: "price",
    label: "السعر",
    aliases: ["السعر", "سعر", "المبلغ", "مبلغ", "الكلفة", "price", "amount", "total", "cost"],
  },
  {
    key: "orderStatus",
    label: "حالة الطلب",
    aliases: ["حالة الطلب", "الحالة", "حالة", "status", "order status"],
  },
  {
    key: "orderDate",
    label: "تاريخ الطلب",
    aliases: ["تاريخ الطلب", "التاريخ", "تاريخ", "date", "order date"],
  },
  {
    key: "orderTime",
    label: "وقت الطلب",
    aliases: ["الوقت", "وقت", "وقت الطلب", "time", "order time"],
  },
  {
    key: "adNameRaw",
    label: "اسم الإعلان",
    aliases: ["اسم الإعلان", "الإعلان", "اسم الاعلان", "الاعلان", "ad name", "ad_name", "advertisement"],
  },
  {
    key: "videoNameRaw",
    label: "اسم الفيديو",
    aliases: ["اسم الفيديو", "الفيديو", "video name", "video_name", "video"],
  },
  {
    key: "campaignNameRaw",
    label: "اسم الحملة",
    aliases: ["اسم الحملة", "الحملة", "campaign name", "campaign_name", "campaign"],
  },
  {
    key: "campaignIdRaw",
    label: "campaign_id",
    aliases: ["campaign_id", "campaign id", "معرف الحملة", "رقم الحملة"],
  },
  {
    key: "adSetIdRaw",
    label: "adset_id",
    aliases: ["adset_id", "ad_set_id", "adset id", "ad set id", "معرف المجموعة الإعلانية", "معرف مجموعة الإعلانات"],
  },
  {
    key: "adIdRaw",
    label: "ad_id",
    aliases: ["ad_id", "ad id", "معرف الإعلان", "رقم الإعلان"],
  },
  {
    key: "leadIdRaw",
    label: "lead_id",
    aliases: ["lead_id", "lead id", "معرف العميل المحتمل", "معرف الليد"],
  },
  {
    key: "sourceRaw",
    label: "المصدر",
    aliases: ["المصدر", "مصدر", "مصدر الطلب", "source", "order source"],
  },
  {
    key: "externalOrderId",
    label: "رقم الطلب",
    aliases: ["رقم الطلب", "رقم طلب", "رقم الطلب الخارجي", "order number", "order no", "order_id", "order id"],
  },
  {
    key: "employeeName",
    label: "الموظف",
    aliases: ["الموظف", "اسم الموظف", "الموظفة", "employee", "employee name", "staff"],
  },
];

/** توحيد اسم العمود قبل المقارنة: أرقام إنجليزية، حروف صغيرة، إزالة التشكيل/التطويل،
 * توحيد أشكال الألف/التاء المربوطة، واستبدال الشرطات السفلية بمسافات. */
export function normalizeHeader(raw: string): string {
  let s = convertArabicDigits(String(raw ?? ""));
  s = s.trim().toLowerCase();
  s = s.replace(/[ً-ْـ]/g, ""); // تشكيل + تطويل
  s = s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
  s = s.replace(/[_\-]+/g, " ");
  s = s.replace(/[:؟?.]+$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

const ALIAS_LOOKUP: Map<string, CanonicalField> = new Map();
for (const field of CANONICAL_FIELDS) {
  for (const alias of field.aliases) {
    ALIAS_LOOKUP.set(normalizeHeader(alias), field.key);
  }
}

/** يحسب عدد الخلايا في صف ما تطابق اسم عمود معروف - يُستخدم لاكتشاف صف العناوين الحقيقي
 * وسط صفوف عنوان عام/فارغة قد تسبقه (راجع detectHeaderRowIndex في importParser.ts). */
export function scoreHeaderRow(row: unknown[]): number {
  let score = 0;
  for (const cell of row) {
    if (cell === null || cell === undefined) continue;
    const normalized = normalizeHeader(String(cell));
    if (normalized && ALIAS_LOOKUP.has(normalized)) score++;
  }
  return score;
}

/** يحاول مطابقة كل عمود في الملف بحقل قياسي، بغض النظر عن ترتيب الأعمدة أو لغتها. */
export function detectColumnMapping(headers: string[]): Partial<Record<CanonicalField, number>> {
  const mapping: Partial<Record<CanonicalField, number>> = {};
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const field = ALIAS_LOOKUP.get(normalized);
    if (field && mapping[field] === undefined) {
      mapping[field] = index;
    }
  });
  return mapping;
}
