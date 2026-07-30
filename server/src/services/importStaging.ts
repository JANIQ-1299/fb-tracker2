import crypto from "node:crypto";

// تخزين مؤقت داخل ذاكرة العملية لملفات Excel/CSV المرفوعة أثناء تدفق المعاينة/الربط قبل
// التأكيد النهائي (اختيار الملف ← اختيار الورقة ← قراءة العناوين ← معاينة ← ربط الأعمدة ←
// تأكيد الاستيراد). لا يُكتب شيء في قاعدة البيانات قبل خطوة التأكيد. كل مُدخل مرتبط بـ
// workspaceId صراحة، ويُرفض أي وصول له من workspace آخر عند التحقق في الراوت.

export interface StagingEntry {
  id: string;
  workspaceId: string;
  uploadedBy: string;
  filename: string;
  buffer: Buffer;
  createdAt: number;
}

const STAGING_TTL_MS = 30 * 60 * 1000; // 30 دقيقة
const store = new Map<string, StagingEntry>();

function sweepExpired() {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now - entry.createdAt > STAGING_TTL_MS) store.delete(id);
  }
}

export function createStaging(workspaceId: string, uploadedBy: string, filename: string, buffer: Buffer): StagingEntry {
  sweepExpired();
  const entry: StagingEntry = {
    id: crypto.randomUUID(),
    workspaceId,
    uploadedBy,
    filename,
    buffer,
    createdAt: Date.now(),
  };
  store.set(entry.id, entry);
  return entry;
}

/** يُعيد الإدخال فقط إن كان يخص نفس الـWorkspace - أي طلب من workspace آخر يُعامَل كأنه غير موجود. */
export function getStaging(id: string, workspaceId: string): StagingEntry | undefined {
  sweepExpired();
  const entry = store.get(id);
  if (!entry || entry.workspaceId !== workspaceId) return undefined;
  return entry;
}

export function deleteStaging(id: string): void {
  store.delete(id);
}
