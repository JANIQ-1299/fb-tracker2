import { normalizeHeader } from "./importColumns.js";

// حقول ملف "Historical Conversation Import" - بيانات محادثة مجرَّدة فقط (بلا نص رسائل ولا أسماء
// مستخدمين). المستخدم يُعِدّ هذا الملف بنفسه خارج هذا المشروع تمامًا؛ لا يوجد هنا أي استدعاء لأي
// Conversations/Messages API. راجع DECISIONS.md.
export type ConversationCanonicalField =
  | "conversationId"
  | "customerPsid"
  | "normalizedPhone"
  | "messageTimestamp"
  | "referralAdId"
  | "pageId";

export interface ConversationFieldDef {
  key: ConversationCanonicalField;
  label: string;
  aliases: string[];
  identity?: boolean;
}

export const CONVERSATION_CANONICAL_FIELDS: ConversationFieldDef[] = [
  {
    key: "conversationId",
    label: "معرّف المحادثة",
    identity: true,
    aliases: ["conversation_id", "conversationid", "conversation id", "thread_id", "معرف المحادثة", "معرّف المحادثة"],
  },
  {
    key: "customerPsid",
    label: "معرّف العميل (PSID/IGSID)",
    identity: true,
    aliases: ["customer_psid", "ig_scoped_id", "psid", "igsid", "customer psid", "معرف العميل"],
  },
  {
    key: "normalizedPhone",
    label: "رقم الهاتف الموحّد",
    aliases: ["normalized_phone", "phone", "normalized phone", "رقم الهاتف الموحد", "رقم الهاتف"],
  },
  {
    key: "messageTimestamp",
    label: "توقيت الرسالة",
    aliases: ["message_timestamp", "timestamp", "message timestamp", "التوقيت", "توقيت الرسالة"],
  },
  {
    key: "referralAdId",
    label: "معرّف الإعلان المرجعي",
    aliases: ["referral_ad_id", "ad_id", "referral ad id", "معرف الاعلان المرجعي", "معرف الإعلان المرجعي"],
  },
  {
    key: "pageId",
    label: "معرّف الصفحة",
    identity: true,
    aliases: ["page_id", "pageid", "page id", "معرف الصفحة"],
  },
];

const ALIAS_LOOKUP: Map<string, ConversationCanonicalField> = new Map();
for (const field of CONVERSATION_CANONICAL_FIELDS) {
  for (const alias of field.aliases) {
    ALIAS_LOOKUP.set(normalizeHeader(alias), field.key);
  }
}

export function detectConversationColumnMapping(headers: string[]): Partial<Record<ConversationCanonicalField, number>> {
  const mapping: Partial<Record<ConversationCanonicalField, number>> = {};
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const field = ALIAS_LOOKUP.get(normalized);
    if (field && mapping[field] === undefined) mapping[field] = index;
  });
  return mapping;
}
