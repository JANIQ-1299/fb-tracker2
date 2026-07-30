import { google } from "googleapis";
import fs from "node:fs";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { ORDER_SUBMITTED_STATUS } from "../routes/leads.js";

const SHEET_NAME = "Leads";
const HEADERS = [
  "Lead ID",
  "التاريخ",
  "اسم العميل",
  "رقم الهاتف",
  "البريد الإلكتروني",
  "الحالة",
  "تم تقديم الطلب؟",
  "تاريخ تقديم الطلب",
  "قيمة الطلب",
  "Campaign ID",
  "اسم الحملة",
  "Ad Set ID",
  "اسم مجموعة الإعلانات",
  "Ad ID",
  "اسم الإعلان",
  "Creative ID",
  "Video ID",
  "اسم أو رابط الفيديو",
  "المصدر",
  "ملاحظات",
];

function getAuth() {
  if (!env.googleServiceAccountKeyFile || !fs.existsSync(env.googleServiceAccountKeyFile)) {
    throw new Error(
      `ملف Service Account غير موجود في المسار: ${env.googleServiceAccountKeyFile}. راجع SETUP_AR.md.`,
    );
  }
  return new google.auth.GoogleAuth({
    keyFile: env.googleServiceAccountKeyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function sheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

export async function testConnection(): Promise<{ ok: boolean; message?: string; title?: string }> {
  if (!env.googleSheetId) return { ok: false, message: "GOOGLE_SHEET_ID غير مهيأ" };
  const sheets = sheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.googleSheetId });
  return { ok: true, title: meta.data.properties?.title ?? undefined };
}

async function ensureHeaders(sheets: ReturnType<typeof sheetsClient>) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `${SHEET_NAME}!A1:T1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADERS] },
  });
}

/** مزامنة النظام -> Google Sheet: يكتب صفًا واحدًا لكل Lead (Lead ID هو المفتاح، يُعاد كتابة الصف بالكامل). */
export async function syncSystemToSheet() {
  if (!env.googleSheetsEnabled) return { synced: 0, skipped: "disabled" };
  const sheets = sheetsClient();
  await ensureHeaders(sheets);

  const leads = await prisma.lead.findMany({
    include: { campaign: true, adSet: true, ad: { include: { creative: true } } },
    orderBy: { createdAt: "asc" },
  });

  const rows = leads.map((l) => [
    l.metaLeadId,
    l.createdAt.toISOString(),
    l.name ?? "",
    l.phone ?? "",
    l.email ?? "",
    l.status,
    l.status === ORDER_SUBMITTED_STATUS ? "نعم" : "لا",
    l.submittedOrderAt?.toISOString() ?? "",
    l.orderValue ?? "",
    l.campaign?.metaCampaignId ?? "",
    l.campaign?.name ?? "",
    l.adSet?.metaAdSetId ?? "",
    l.adSet?.name ?? "",
    l.ad?.metaAdId ?? "",
    l.ad?.name ?? "",
    l.ad?.creative?.metaCreativeId ?? "",
    l.ad?.creative?.videoId ?? "",
    l.ad?.creative?.videoId ? `https://www.facebook.com/watch/?v=${l.ad.creative.videoId}` : "",
    l.isDuplicate ? "مكرر" : "webhook",
    l.notes ?? "",
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: `${SHEET_NAME}!A2`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });

  return { synced: rows.length };
}

/**
 * مزامنة Google Sheet -> النظام: تقرأ عمود الحالة فقط (العمود F) لكل صف وتحدّث الحالة
 * إن اختلفت عمّا في قاعدة البيانات. لمنع حلقات التحديث المتكررة نعتمد Lead ID كمفتاح
 * ونقارن القيمة الحالية قبل الكتابة (لا نكتب إن كانت متطابقة أصلًا).
 */
export async function syncSheetToSystem() {
  if (!env.googleSheetsEnabled) return { updated: 0, skipped: "disabled" };
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range: `${SHEET_NAME}!A2:F`,
  });
  const rows = res.data.values ?? [];
  let updated = 0;

  for (const row of rows) {
    const [metaLeadId, , , , , status] = row;
    if (!metaLeadId || !status) continue;
    const lead = await prisma.lead.findUnique({
      where: { workspaceId_metaLeadId: { workspaceId: env.legacyWorkspaceId, metaLeadId } },
    });
    if (!lead || lead.status === status) continue;

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status,
        submittedOrderAt: status === ORDER_SUBMITTED_STATUS && !lead.submittedOrderAt ? new Date() : undefined,
      },
    });
    await prisma.leadStatusHistory.create({
      data: { leadId: lead.id, oldStatus: lead.status, newStatus: status, changedBy: "google_sheets", source: "sheets" },
    });
    updated++;
  }

  logger.info({ updated }, "مزامنة Sheet -> النظام اكتملت");
  return { updated };
}
