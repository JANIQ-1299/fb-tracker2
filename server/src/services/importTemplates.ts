import { prisma } from "../lib/prisma.js";
import { normalizeHeader, type CanonicalField } from "./importColumns.js";

export interface SavedTemplate {
  id: string;
  name: string;
  createdAt: Date;
  mapping: Record<string, CanonicalField>; // normalizedHeaderText -> canonicalField
}

function toTemplate(row: { id: string; name: string; createdAt: Date; mappingJson: string }): SavedTemplate {
  return { id: row.id, name: row.name, createdAt: row.createdAt, mapping: JSON.parse(row.mappingJson) };
}

/** يحفظ قالب ربط أعمدة قابل لإعادة الاستخدام على أي ملف Excel/CSV مستقبلي - المفتاح نص العنوان
 * الموحَّد (normalizeHeader) وليس رقم الفهرس، حتى يعمل حتى لو تغيّر ترتيب الأعمدة بين ملف وآخر. */
export async function saveImportTemplate(
  workspaceId: string,
  name: string,
  headers: string[],
  columnMapping: Partial<Record<CanonicalField, number>>,
): Promise<SavedTemplate> {
  const mapping: Record<string, CanonicalField> = {};
  for (const [field, index] of Object.entries(columnMapping)) {
    const header = headers[index as number];
    if (!header) continue;
    const key = normalizeHeader(header);
    if (key) mapping[key] = field as CanonicalField;
  }

  const saved = await prisma.importColumnTemplate.upsert({
    where: { workspaceId_name: { workspaceId, name } },
    update: { mappingJson: JSON.stringify(mapping) },
    create: { workspaceId, name, mappingJson: JSON.stringify(mapping) },
  });
  return toTemplate(saved);
}

export async function listImportTemplates(workspaceId: string): Promise<SavedTemplate[]> {
  const templates = await prisma.importColumnTemplate.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
  });
  return templates.map(toTemplate);
}

/** يطبّق قالبًا محفوظًا على عناوين ملف جديد - يطابق حسب نص العنوان الموحَّد وليس رقم العمود. */
export function applyTemplateToHeaders(
  mapping: Record<string, CanonicalField>,
  headers: string[],
): Partial<Record<CanonicalField, number>> {
  const result: Partial<Record<CanonicalField, number>> = {};
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    const field = mapping[key];
    if (field && result[field] === undefined) result[field] = index;
  });
  return result;
}
