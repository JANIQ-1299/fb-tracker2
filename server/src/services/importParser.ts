import * as XLSX from "xlsx";
import { scoreHeaderRow } from "./importColumns.js";

export const SUPPORTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

export function getExtension(filename: string): string {
  const match = filename.toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : "";
}

export function isSupportedFile(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.includes(getExtension(filename));
}

/**
 * multer/busboy يفكّان ترميز اسم الملف القادم من multipart/form-data كـlatin1 افتراضيًا (سلوك
 * قديم موروث من RFC 2388)، بينما المتصفحات ترسل بايتات UTF-8 فعلية دون ترميز RFC 2231 الصريح.
 * النتيجة: أي اسم ملف عربي (أو أي لغة غير لاتينية) يصل مشوَّهًا (mojibake) رغم أن محتوى الملف
 * نفسه سليم تمامًا. إعادة تفسير النص كـUTF-8 بعد قراءته كـlatin1 يُصلح ذلك دون تغيير الملف.
 */
export function fixUploadedFilenameEncoding(rawName: string): string {
  const fixed = Buffer.from(rawName, "latin1").toString("utf8");
  // إن أنتج التحويل حرف استبدال (U+FFFD) فهذا يعني أن الاسم لم يكن latin1 بالأصل (كان UTF-8
  // سليمًا مسبقًا) - نُبقي الاسم الأصلي كما هو بدل تشويهه بالتحويل المزدوج.
  return fixed.includes("�") ? rawName : fixed;
}

function readWorkbook(buffer: Buffer, filename: string): XLSX.WorkBook {
  const ext = getExtension(filename);
  if (ext === ".csv") {
    // CSV دائمًا نصوص بلا تواريخ/أرقام Excel تسلسلية، لذا يُقرأ كنص UTF-8 مباشرة.
    return XLSX.read(buffer.toString("utf8"), { type: "string" });
  }
  // cellDates:true يحوّل خلايا التاريخ في xlsx/xls إلى كائنات Date مباشرة بدل أرقام تسلسلية،
  // ما يبسّط تحليل تاريخ الطلب لاحقًا في textNormalize.parseOrderDate.
  return XLSX.read(buffer, { type: "buffer", cellDates: true });
}

export function listSheetNames(buffer: Buffer, filename: string): string[] {
  return readWorkbook(buffer, filename).SheetNames;
}

export interface RawSheet {
  headers: string[];
  rows: unknown[][];
  headerRowIndex: number;
}

/**
 * يفحص أول 10 صفوف ويختار الصف الذي يحتوي أكبر عدد من أسماء الأعمدة المعروفة (عربية/إنجليزية)
 * كصف عناوين حقيقي، بدل افتراض أن الصف الأول دائمًا هو صف العناوين. هذا يتعامل تلقائيًا مع
 * صفوف عنوان عام أو صفوف مدمجة/فارغة تسبق صف العناوين الحقيقي (تسجّل صفرًا لأنها لا تحتوي أي
 * اسم عمود معروف)، دون أي منطق خاص إضافي لاكتشاف الدمج بحد ذاته.
 */
function detectHeaderRowIndex(aoa: unknown[][]): number {
  const scanLimit = Math.min(10, aoa.length);
  let bestIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < scanLimit; i++) {
    const score = scoreHeaderRow(aoa[i] ?? []);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

export function readSheet(buffer: Buffer, filename: string, sheetName: string): RawSheet {
  const workbook = readWorkbook(buffer, filename);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`الورقة "${sheetName}" غير موجودة في الملف`);

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  if (aoa.length === 0) return { headers: [], rows: [], headerRowIndex: 0 };

  const headerRowIndex = detectHeaderRowIndex(aoa);
  const headerRow = aoa[headerRowIndex] ?? [];
  const headers = headerRow.map((h) => (h === null || h === undefined ? "" : String(h)));
  const rows = aoa.slice(headerRowIndex + 1);
  return { headers, rows, headerRowIndex };
}
