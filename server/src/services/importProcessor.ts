import { normalizeIraqiPhone } from "../lib/phone.js";
import { cleanText, combineDateAndTime, parseOrderDate, parsePrice, parseTimeOfDay } from "../lib/textNormalize.js";
import { detectOrderDuplicate } from "./dedup.js";
import type { CanonicalField } from "./importColumns.js";

export interface OrderDraft {
  customerName: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  governorate: string | null;
  address: string | null;
  product: string | null;
  price: number | null;
  orderStatus: string | null;
  orderDate: Date | null;
  adNameRaw: string | null;
  videoNameRaw: string | null;
  campaignNameRaw: string | null;
  adIdRaw: string | null;
  adSetIdRaw: string | null;
  campaignIdRaw: string | null;
  leadIdRaw: string | null;
  sourceRaw: string | null;
  externalOrderId: string | null;
  employeeName: string | null;
}

export interface ProcessedRow {
  rowNumber: number; // رقم الصف في ملف Excel كما يراه المستخدم (يشمل صف العناوين = 1)
  data: OrderDraft;
  rawRow: Record<string, unknown>;
}

export interface RowIssue {
  rowNumber: number;
  reason: string;
}

export interface DuplicateRow {
  row: ProcessedRow;
  reason: string;
  /** رقم صف الأصل داخل نفس الملف (إن كان التكرار داخليًا) - يُستخدم لربط duplicateOfId
   * بمعرّف Order الحقيقي بعد إدراج الصف الأصلي فعليًا في قاعدة البيانات. */
  duplicateOfRowNumber?: number;
  /** معرّف Order حقيقي موجود مسبقًا في قاعدة البيانات (إن كان التكرار مقابل طلب سابق محفوظ). */
  duplicateOfOrderId?: string;
}

export interface ProcessResult {
  totalRows: number;
  valid: ProcessedRow[];
  missing: RowIssue[];
  errors: RowIssue[];
  duplicates: DuplicateRow[];
}

function isRowEmpty(row: unknown[]): boolean {
  return row.every((cell) => cell === null || cell === undefined || String(cell).trim() === "");
}

/**
 * يحوّل صفوف Excel/CSV الخام إلى طلبات منظّفة، مع تصنيف كل صف: صحيح، ناقص (بلا هوية زبون)،
 * به خطأ (سعر/تاريخ غير قابل للتحليل)، أو مكرر (داخل نفس الملف أو مقابل طلبات سابقة محفوظة
 * فعليًا في نفس الـWorkspace عبر detectOrderDuplicate من dedup.ts). لا يحذف أي صف بصمت - كل
 * صف غير فارغ يظهر في إحدى الفئات الأربع.
 */
export async function processImportRows(
  headers: string[],
  rawRows: unknown[][],
  columnMapping: Partial<Record<CanonicalField, number>>,
  workspaceId: string,
): Promise<ProcessResult> {
  const result: ProcessResult = { totalRows: 0, valid: [], missing: [], errors: [], duplicates: [] };
  const seenPhonesInFile = new Map<string, number>(); // normalizedPhone -> أول رقم صف رآه
  const now = new Date();

  function readField(row: unknown[], field: CanonicalField): unknown {
    const index = columnMapping[field];
    return index === undefined ? null : row[index];
  }

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNumber = i + 2; // +1 لصف العناوين، +1 لأن i يبدأ من صفر

    if (isRowEmpty(row)) continue; // تجاهل الصفوف الفارغة تمامًا - لا تُحتسب إطلاقًا

    result.totalRows++;

    const rawRowObject: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      rawRowObject[h || `عمود_${idx + 1}`] = row[idx] ?? null;
    });

    const customerName = cleanText(readField(row, "customerName"));
    const phoneRaw = cleanText(readField(row, "phone"));
    const { normalized: normalizedPhone } = normalizeIraqiPhone(phoneRaw);

    const priceResult = parsePrice(readField(row, "price"));
    const dateResult = parseOrderDate(readField(row, "orderDate"));
    const timeRaw = readField(row, "orderTime");
    const timeResult = parseTimeOfDay(timeRaw);

    const rowErrors: string[] = [];
    if (priceResult.error) rowErrors.push(priceResult.error);
    if (dateResult.error) rowErrors.push(dateResult.error);
    // لا نتجاهل الوقت بصمت: خلية وقت موجودة لكن يتعذّر تحليلها تُعامَل كخطأ صريح، لأن الوقت
    // مهم لمطابقة الطلبات لاحقًا (راجع طلب المستخدم).
    if (timeResult.error) rowErrors.push(timeResult.error);

    if (rowErrors.length > 0) {
      result.errors.push({ rowNumber, reason: rowErrors.join(" | ") });
      continue;
    }

    // دمج التاريخ+الوقت في حقل orderDate واحد بدل تجاهل الوقت
    const combinedOrderDate =
      dateResult.value && timeResult.value ? combineDateAndTime(dateResult.value, timeResult.value) : dateResult.value;

    if (!customerName && !phoneRaw) {
      result.missing.push({ rowNumber, reason: "لا يوجد اسم زبون أو رقم هاتف لتحديد الطلب" });
      continue;
    }

    const data: OrderDraft = {
      customerName,
      phone: phoneRaw,
      normalizedPhone,
      governorate: cleanText(readField(row, "governorate")),
      address: cleanText(readField(row, "address")),
      product: cleanText(readField(row, "product")),
      price: priceResult.value,
      orderStatus: cleanText(readField(row, "orderStatus")),
      orderDate: combinedOrderDate,
      adNameRaw: cleanText(readField(row, "adNameRaw")),
      videoNameRaw: cleanText(readField(row, "videoNameRaw")),
      campaignNameRaw: cleanText(readField(row, "campaignNameRaw")),
      adIdRaw: cleanText(readField(row, "adIdRaw")),
      adSetIdRaw: cleanText(readField(row, "adSetIdRaw")),
      campaignIdRaw: cleanText(readField(row, "campaignIdRaw")),
      leadIdRaw: cleanText(readField(row, "leadIdRaw")),
      externalOrderId: cleanText(readField(row, "externalOrderId")),
      employeeName: cleanText(readField(row, "employeeName")),
      sourceRaw: cleanText(readField(row, "sourceRaw")),
    };

    const processedRow: ProcessedRow = { rowNumber, data, rawRow: rawRowObject };

    if (normalizedPhone) {
      const firstSeenRow = seenPhonesInFile.get(normalizedPhone);
      if (firstSeenRow !== undefined) {
        result.duplicates.push({
          row: processedRow,
          reason: `نفس رقم الهاتف مكرر مع الصف رقم ${firstSeenRow} داخل نفس الملف`,
          duplicateOfRowNumber: firstSeenRow,
        });
        continue;
      }
      seenPhonesInFile.set(normalizedPhone, rowNumber);

      const dbDuplicate = await detectOrderDuplicate({ workspaceId, normalizedPhone, createdAt: now });
      if (dbDuplicate.isDuplicate) {
        result.duplicates.push({
          row: processedRow,
          reason: dbDuplicate.reason ?? "طلب مكرر",
          duplicateOfOrderId: dbDuplicate.duplicateOfId,
        });
        continue;
      }
    }

    result.valid.push(processedRow);
  }

  return result;
}
