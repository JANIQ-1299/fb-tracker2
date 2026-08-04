import { prisma } from "../lib/prisma.js";
import { cleanText } from "../lib/textNormalize.js";
import { normalizeIraqiPhone } from "../lib/phone.js";
import type { ConversationCanonicalField } from "./conversationImportColumns.js";

export interface GroupedConversation {
  conversationId: string; // مفتاح التجميع (platformThreadId) - conversation_id إن وُجد، وإلا customer_psid
  customerPsid: string;
  pageMetaId: string;
  normalizedPhone: string | null;
  referralAdId: string | null;
  firstMessageAt: Date;
  lastMessageAt: Date;
  rowCount: number;
  conflicts: string[]; // تعارض بين صفوف نفس المحادثة (رقم/referral مختلف) - يُحتفَظ بأول قيمة فقط
}

export interface RowIssue {
  rowNumber: number;
  reason: string;
}

export interface ConversationProcessResult {
  totalRows: number;
  grouped: GroupedConversation[];
  missing: RowIssue[];
  errors: RowIssue[];
}

function isRowEmpty(row: unknown[]): boolean {
  return row.every((cell) => cell === null || cell === undefined || String(cell).trim() === "");
}

/** يحلّل توقيت الرسالة من كائن Date، رقم Unix epoch (ثوانٍ أو ميلي ثانية)، أو نص تاريخ شائع. */
function parseTimestamp(raw: unknown): { value: Date | null; error: string | null } {
  if (raw === null || raw === undefined || raw === "") return { value: null, error: null };

  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? { value: null, error: "توقيت غير صالح" } : { value: raw, error: null };
  }

  function fromEpochLike(num: number): { value: Date | null; error: string | null } {
    const ms = num > 1_000_000_000_000 ? num : num * 1000; // ثوانٍ مقابل ميلي ثانية
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? { value: null, error: `توقيت غير صالح: ${num}` } : { value: d, error: null };
  }

  if (typeof raw === "number") {
    if (raw > 1_000_000_000) return fromEpochLike(raw); // يشبه Unix epoch وليس رقم تاريخ Excel التسلسلي
  }

  const cleaned = cleanText(raw);
  if (cleaned === null) return { value: null, error: null };
  if (/^\d{10,13}$/.test(cleaned)) return fromEpochLike(Number(cleaned));

  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) return { value: parsed, error: null };
  return { value: null, error: `تعذّر تحليل توقيت الرسالة: "${cleaned}"` };
}

/**
 * يحوّل صفوف ملف "بيانات محادثة مجرَّدة" (بلا نص رسائل) إلى محادثات مُجمَّعة حسب conversation_id.
 * كل صف قد يمثّل رسالة واحدة رصدت رقمًا/referral - يُجمَّع كل صفوف نفس المحادثة في سجل واحد،
 * والقيمة الأولى المرصودة لكل حقل (هاتف/referral) هي المعتمدة؛ أي قيمة لاحقة مختلفة تُسجَّل
 * كتعارض بدل الكتابة فوق الأولى بصمت.
 */
export async function processConversationImportRows(
  headers: string[],
  rawRows: unknown[][],
  columnMapping: Partial<Record<ConversationCanonicalField, number>>,
  workspaceId: string,
): Promise<ConversationProcessResult> {
  const result: ConversationProcessResult = { totalRows: 0, grouped: [], missing: [], errors: [] };
  const groups = new Map<string, GroupedConversation>();

  function readField(row: unknown[], field: ConversationCanonicalField): unknown {
    const index = columnMapping[field];
    return index === undefined ? null : row[index];
  }

  const pages = await prisma.page.findMany({ where: { workspaceId }, select: { metaPageId: true } });
  const knownPageIds = new Set(pages.map((p) => p.metaPageId));

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNumber = i + 2; // +1 لصف العناوين، +1 لأن i يبدأ من صفر
    if (isRowEmpty(row)) continue;
    result.totalRows++;

    const conversationIdRaw = cleanText(readField(row, "conversationId"));
    const customerPsidRaw = cleanText(readField(row, "customerPsid"));
    const pageIdRaw = cleanText(readField(row, "pageId"));
    const phoneRaw = cleanText(readField(row, "normalizedPhone"));
    const referralAdIdRaw = cleanText(readField(row, "referralAdId"));
    const tsResult = parseTimestamp(readField(row, "messageTimestamp"));

    if (!conversationIdRaw && !customerPsidRaw) {
      result.missing.push({ rowNumber, reason: "لا يوجد معرّف محادثة (conversation_id) ولا معرّف عميل (customer_psid) لتحديد هذا الصف" });
      continue;
    }
    if (!pageIdRaw) {
      result.missing.push({ rowNumber, reason: "لا يوجد معرّف صفحة (page_id)" });
      continue;
    }
    if (!knownPageIds.has(pageIdRaw)) {
      result.errors.push({ rowNumber, reason: `معرّف الصفحة "${pageIdRaw}" غير معروف ضمن صفحات هذا الـWorkspace المُزامنة مسبقًا` });
      continue;
    }
    if (tsResult.error) {
      result.errors.push({ rowNumber, reason: tsResult.error });
      continue;
    }

    let normalizedPhone: string | null = null;
    if (phoneRaw) {
      const { normalized, confident } = normalizeIraqiPhone(phoneRaw);
      if (!confident || !normalized) {
        result.errors.push({ rowNumber, reason: `رقم هاتف غير قابل للتوحيد بثقة: "${phoneRaw}"` });
        continue;
      }
      normalizedPhone = normalized;
    }

    const groupKey = conversationIdRaw ?? customerPsidRaw!;
    const timestamp = tsResult.value ?? new Date(0);
    const existing = groups.get(groupKey);

    if (!existing) {
      groups.set(groupKey, {
        conversationId: groupKey,
        customerPsid: customerPsidRaw ?? groupKey,
        pageMetaId: pageIdRaw,
        normalizedPhone,
        referralAdId: referralAdIdRaw,
        firstMessageAt: timestamp,
        lastMessageAt: timestamp,
        rowCount: 1,
        conflicts: [],
      });
      continue;
    }

    existing.rowCount++;
    if (timestamp < existing.firstMessageAt) existing.firstMessageAt = timestamp;
    if (timestamp > existing.lastMessageAt) existing.lastMessageAt = timestamp;

    if (normalizedPhone && existing.normalizedPhone && normalizedPhone !== existing.normalizedPhone) {
      existing.conflicts.push(`رقم هاتف مختلف في الصف ${rowNumber} (${normalizedPhone}) عن الرقم المعتمد (${existing.normalizedPhone}) - تم تجاهل الجديد`);
    } else if (normalizedPhone && !existing.normalizedPhone) {
      existing.normalizedPhone = normalizedPhone;
    }

    if (referralAdIdRaw && existing.referralAdId && referralAdIdRaw !== existing.referralAdId) {
      existing.conflicts.push(`referral_ad_id مختلف في الصف ${rowNumber} (${referralAdIdRaw}) عن المعتمد (${existing.referralAdId}) - تم تجاهل الجديد`);
    } else if (referralAdIdRaw && !existing.referralAdId) {
      existing.referralAdId = referralAdIdRaw;
    }
  }

  result.grouped = [...groups.values()];
  return result;
}
