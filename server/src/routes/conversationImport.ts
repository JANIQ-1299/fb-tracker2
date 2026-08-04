import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { requireUser, type WorkspaceAuthedRequest } from "../middleware/workspaceAuth.js";
import { requireActiveWorkspace, requireSystemActive } from "../middleware/workspaceGuard.js";
import {
  fixUploadedFilenameEncoding,
  isSupportedFile,
  listSheetNames,
  readSheet,
  SUPPORTED_EXTENSIONS,
} from "../services/importParser.js";
import {
  CONVERSATION_CANONICAL_FIELDS,
  detectConversationColumnMapping,
  type ConversationCanonicalField,
} from "../services/conversationImportColumns.js";
import { createStaging, deleteStaging, getStaging } from "../services/importStaging.js";
import { processConversationImportRows, type GroupedConversation } from "../services/conversationImportProcessor.js";
import { resolveReferralAd, type ResolvedReferral } from "../services/referralResolver.js";
import { matchConversationToOrder } from "../services/conversationAttribution.js";
import { runAttributionForWorkspace } from "../services/attributionEngine.js";

// ============================================================
// Historical Conversation Import - مستورد بيانات محادثة مجرَّدة (بلا نص رسائل ولا أسماء مستخدمين)
// يرفعه مالك الـWorkspace بنفسه من ملف يُعِدّه هو خارج هذا المشروع. لا يوجد هنا أي استدعاء لأي
// Instagram Conversations/Messages API - راجع DECISIONS.md.
// ============================================================

export const conversationImportRouter = Router();
conversationImportRouter.use(requireUser, requireSystemActive, requireActiveWorkspace);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    if (!isSupportedFile(file.originalname)) {
      cb(new Error(`نوع ملف غير مدعوم. الأنواع المسموحة: ${SUPPORTED_EXTENSIONS.join(", ")}`));
      return;
    }
    cb(null, true);
  },
});

// ---- 1) رفع الملف: تخزين مؤقت + قائمة الأوراق فقط ----
conversationImportRouter.post("/upload", (req: WorkspaceAuthedRequest, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message ?? "فشل رفع الملف" });
    if (!req.file) return res.status(400).json({ error: "لم يتم إرفاق أي ملف" });

    try {
      const filename = fixUploadedFilenameEncoding(req.file.originalname);
      const sheetNames = listSheetNames(req.file.buffer, filename);
      const staging = createStaging(req.user!.workspaceId, req.user!.id, filename, req.file.buffer);
      res.json({ stagingId: staging.id, filename: staging.filename, sheetNames });
    } catch (parseErr) {
      logger.warn({ err: (parseErr as Error).message }, "فشل قراءة ملف استيراد المحادثات");
      res.status(400).json({ error: "تعذّر قراءة الملف - تأكد أنه ملف Excel/CSV صالح" });
    }
  });
});

// ---- 2) اختيار الورقة + قراءة العناوين + اقتراح الربط ----
conversationImportRouter.get("/:stagingId/sheets/:sheetName", (req: WorkspaceAuthedRequest, res) => {
  const staging = getStaging(req.params.stagingId, req.user!.workspaceId);
  if (!staging) return res.status(404).json({ error: "جلسة الاستيراد غير موجودة أو منتهية" });

  try {
    const { headers, rows, headerRowIndex } = readSheet(staging.buffer, staging.filename, req.params.sheetName);
    const suggestedMapping = detectConversationColumnMapping(headers);
    res.json({
      headers,
      headerRowIndex,
      previewRows: rows.slice(0, 15),
      totalRows: rows.length,
      suggestedMapping,
      canonicalFields: CONVERSATION_CANONICAL_FIELDS.map((f) => ({ key: f.key, label: f.label, identity: Boolean(f.identity) })),
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const mappingSchema = z.record(z.string(), z.number().int().min(0));

function toColumnMapping(raw: Record<string, number>): Partial<Record<ConversationCanonicalField, number>> {
  const validKeys = new Set(CONVERSATION_CANONICAL_FIELDS.map((f) => f.key));
  const mapping: Partial<Record<ConversationCanonicalField, number>> = {};
  for (const [key, index] of Object.entries(raw)) {
    if (validKeys.has(key as ConversationCanonicalField)) mapping[key as ConversationCanonicalField] = index;
  }
  return mapping;
}

function summarizeGroup(g: GroupedConversation) {
  return {
    conversationId: g.conversationId,
    customerPsid: g.customerPsid,
    pageMetaId: g.pageMetaId,
    normalizedPhone: g.normalizedPhone,
    referralAdId: g.referralAdId,
    firstMessageAt: g.firstMessageAt,
    lastMessageAt: g.lastMessageAt,
    rowCount: g.rowCount,
    conflicts: g.conflicts,
  };
}

const validateSchema = z.object({ sheetName: z.string(), columnMapping: mappingSchema });

// ---- 3) معاينة النتائج قبل الاستيراد (بدون أي كتابة في قاعدة البيانات) ----
conversationImportRouter.post("/:stagingId/validate", async (req: WorkspaceAuthedRequest, res) => {
  const staging = getStaging(req.params.stagingId, req.user!.workspaceId);
  if (!staging) return res.status(404).json({ error: "جلسة الاستيراد غير موجودة أو منتهية" });

  const parsed = validateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });

  try {
    const { headers, rows } = readSheet(staging.buffer, staging.filename, parsed.data.sheetName);
    const mapping = toColumnMapping(parsed.data.columnMapping);
    const result = await processConversationImportRows(headers, rows, mapping, req.user!.workspaceId);
    const conflictCount = result.grouped.filter((g) => g.conflicts.length > 0).length;

    res.json({
      totalRows: result.totalRows,
      groupedCount: result.grouped.length,
      missingCount: result.missing.length,
      errorCount: result.errors.length,
      conflictCount,
      missing: result.missing.slice(0, 200),
      errors: result.errors.slice(0, 200),
      sampleGrouped: result.grouped.slice(0, 20).map(summarizeGroup),
      conflicting: result.grouped.filter((g) => g.conflicts.length > 0).slice(0, 50).map(summarizeGroup),
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// confirm يتطلب confirm:true صراحة - لا يوجد استيراد ضمني بدون تأكيد صريح من المستخدم بعد المعاينة
const confirmSchema = z.object({ sheetName: z.string(), columnMapping: mappingSchema, confirm: z.literal(true) });

// ---- 4) تأكيد الاستيراد: يُنشئ ConversationImportBatch + يُثري/يُنشئ Conversation، ثم يُشغّل
// المطابقة على الفور، ثم يحذف ملف الرفع نفسه. لا يُستبدَل أبدًا أي حقل موجود بالفعل من مصدر آخر
// (Webhook حي أو دفعة سابقة) - فقط إثراء الفراغات، وأي تعارض يُسجَّل بدل الكتابة فوقه بصمت.
conversationImportRouter.post("/:stagingId/confirm", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  const staging = getStaging(req.params.stagingId, workspaceId);
  if (!staging) return res.status(404).json({ error: "جلسة الاستيراد غير موجودة أو منتهية" });

  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "يجب تأكيد الاستيراد صراحةً (confirm=true) بعد مراجعة المعاينة" });
  }

  try {
    const { headers, rows } = readSheet(staging.buffer, staging.filename, parsed.data.sheetName);
    const mapping = toColumnMapping(parsed.data.columnMapping);
    const result = await processConversationImportRows(headers, rows, mapping, workspaceId);

    const pages = await prisma.page.findMany({ where: { workspaceId } });
    const pageByMetaId = new Map(pages.map((p) => [p.metaPageId, p]));

    const batch = await prisma.conversationImportBatch.create({
      data: {
        workspaceId,
        filename: staging.filename,
        uploadedBy: req.user!.id,
        rowCount: result.totalRows,
        rejectedCount: result.missing.length + result.errors.length,
        status: "PROCESSING",
        errorSummary: JSON.stringify({
          missing: result.missing.slice(0, 500),
          errors: result.errors.slice(0, 500),
        }).slice(0, 100_000),
      },
    });

    let accepted = 0;
    let conflicts = 0;
    const conversationIds: string[] = [];

    for (const group of result.grouped) {
      const page = pageByMetaId.get(group.pageMetaId);
      if (!page) continue; // تحقّق مسبقًا في processConversationImportRows، دفاع إضافي فقط

      const existing = await prisma.conversation.findUnique({
        where: { workspaceId_platform_platformThreadId: { workspaceId, platform: "INSTAGRAM", platformThreadId: group.conversationId } },
      });

      let referralPatch: Partial<ResolvedReferral> = {};
      if (group.referralAdId && !existing?.referralAdId) {
        referralPatch = await resolveReferralAd(workspaceId, group.referralAdId);
      }

      // تعارض داخل صفوف الملف نفسه لهذه المحادثة (اكتُشف في processConversationImportRows) يُحسَب
      // دائمًا، سواء كانت المحادثة جديدة أو موجودة مسبقًا.
      let hasConflict = group.conflicts.length > 0;
      let conversationId: string;

      if (!existing) {
        const created = await prisma.conversation.create({
          data: {
            workspaceId,
            pageId: page.id,
            platform: "INSTAGRAM",
            platformThreadId: group.conversationId,
            customerPsid: group.customerPsid,
            normalizedPhoneExtracted: group.normalizedPhone,
            firstMessageAt: group.firstMessageAt,
            lastMessageAt: group.lastMessageAt,
            source: "HISTORICAL_IMPORT",
            importBatchId: batch.id,
            ...referralPatch,
          },
        });
        conversationId = created.id;
      } else {
        const patch: Record<string, unknown> = { ...referralPatch };

        if (group.normalizedPhone && !existing.normalizedPhoneExtracted) {
          patch.normalizedPhoneExtracted = group.normalizedPhone;
        } else if (group.normalizedPhone && existing.normalizedPhoneExtracted && group.normalizedPhone !== existing.normalizedPhoneExtracted) {
          hasConflict = true; // لا نستبدل رقمًا موجودًا مسبقًا (من Webhook أو دفعة سابقة) برقم مختلف
        }
        if (group.firstMessageAt < existing.firstMessageAt) patch.firstMessageAt = group.firstMessageAt;
        if (group.lastMessageAt > existing.lastMessageAt) patch.lastMessageAt = group.lastMessageAt;

        if (Object.keys(patch).length > 0) {
          await prisma.conversation.update({ where: { id: existing.id }, data: patch });
        }
        conversationId = existing.id;
      }

      if (hasConflict) conflicts++;
      else accepted++;
      conversationIds.push(conversationId);
    }

    const integration = await prisma.messagingIntegration.findUnique({ where: { workspaceId } });
    const matchWindowHours = integration?.matchWindowHours ?? 48;
    for (const id of conversationIds) {
      const conv = await prisma.conversation.findUnique({ where: { id } });
      if (conv) await matchConversationToOrder(conv, workspaceId, matchWindowHours, null);
    }

    // إعادة تشغيل محرك المطابقة الكامل: أي طلب قديم (من ملفات Excel السابقة) قد يطابق الآن
    // إحدى المحادثات المستوردة للتو، عبر نفس منطق matchViaConversation الموجود مسبقًا.
    const attributionSummary = await runAttributionForWorkspace(workspaceId);

    const updatedBatch = await prisma.conversationImportBatch.update({
      where: { id: batch.id },
      data: { acceptedCount: accepted, duplicateCount: conflicts, status: "DONE" },
    });

    deleteStaging(staging.id); // حذف ملف الرفع فور اكتمال المعالجة

    logger.info(
      { workspaceId, batchId: batch.id, accepted, conflicts, attributionSummary },
      "اكتمل استيراد بيانات محادثة إنستغرام تاريخية",
    );
    res.json({ batch: updatedBatch, attributionSummary });
  } catch (err) {
    logger.error({ err: (err as Error).message, workspaceId }, "فشل تأكيد استيراد بيانات المحادثة التاريخية");
    res.status(500).json({ error: "فشل الاستيراد، حاول مرة أخرى" });
  }
});

// ---- سجل الدفعات ----
conversationImportRouter.get("/batches", async (req: WorkspaceAuthedRequest, res) => {
  const batches = await prisma.conversationImportBatch.findMany({
    where: { workspaceId: req.user!.workspaceId },
    orderBy: { uploadedAt: "desc" },
    take: 100,
  });
  res.json({ batches });
});

// ---- حذف كل بيانات دفعة استيراد واحدة ----
conversationImportRouter.delete("/batches/:batchId", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  const batch = await prisma.conversationImportBatch.findUnique({ where: { id: req.params.batchId } });
  if (!batch || batch.workspaceId !== workspaceId) return res.status(404).json({ error: "الدفعة غير موجودة" });

  const deleted = await prisma.conversation.deleteMany({
    where: { workspaceId, importBatchId: batch.id, source: "HISTORICAL_IMPORT" },
  });
  await prisma.conversationImportBatch.update({ where: { id: batch.id }, data: { deletedAt: new Date(), status: "DELETED" } });
  const attributionSummary = await runAttributionForWorkspace(workspaceId);

  logger.info({ workspaceId, batchId: batch.id, deletedConversations: deleted.count }, "تم حذف بيانات دفعة استيراد محادثة تاريخية");
  res.json({ deletedConversations: deleted.count, attributionSummary });
});

// ---- حذف جميع البيانات المستوردة تاريخيًا (كل الدفعات) دفعة واحدة ----
conversationImportRouter.delete("/all", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  const deleted = await prisma.conversation.deleteMany({ where: { workspaceId, source: "HISTORICAL_IMPORT" } });
  await prisma.conversationImportBatch.updateMany({
    where: { workspaceId, deletedAt: null },
    data: { deletedAt: new Date(), status: "DELETED" },
  });
  const attributionSummary = await runAttributionForWorkspace(workspaceId);

  logger.info({ workspaceId, deletedConversations: deleted.count }, "تم حذف كل بيانات الاستيراد التاريخي للمحادثات");
  res.json({ deletedConversations: deleted.count, attributionSummary });
});
