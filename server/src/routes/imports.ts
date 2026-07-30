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
import { CANONICAL_FIELDS, detectColumnMapping, type CanonicalField } from "../services/importColumns.js";
import { createStaging, deleteStaging, getStaging } from "../services/importStaging.js";
import { processImportRows, type ProcessResult } from "../services/importProcessor.js";

export const importsRouter = Router();
importsRouter.use(requireUser, requireSystemActive, requireActiveWorkspace);

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

// ---- 1) رفع الملف: لا تحليل مطابقة هنا إطلاقًا، فقط تخزين مؤقت + قائمة الأوراق ----
importsRouter.post("/upload", (req: WorkspaceAuthedRequest, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message ?? "فشل رفع الملف" });
    if (!req.file) return res.status(400).json({ error: "لم يتم إرفاق أي ملف" });

    try {
      const filename = fixUploadedFilenameEncoding(req.file.originalname);
      const sheetNames = listSheetNames(req.file.buffer, filename);
      const staging = createStaging(req.user!.workspaceId, req.user!.id, filename, req.file.buffer);
      res.json({ stagingId: staging.id, filename: staging.filename, sheetNames });
    } catch (parseErr) {
      logger.warn({ err: (parseErr as Error).message }, "فشل قراءة ملف الاستيراد");
      res.status(400).json({ error: "تعذّر قراءة الملف - تأكد أنه ملف Excel/CSV صالح" });
    }
  });
});

// ---- 2) اختيار الورقة + قراءة العناوين + اقتراح الربط التلقائي ----
importsRouter.get("/:stagingId/sheets/:sheetName", (req: WorkspaceAuthedRequest, res) => {
  const staging = getStaging(req.params.stagingId, req.user!.workspaceId);
  if (!staging) return res.status(404).json({ error: "جلسة الاستيراد غير موجودة أو منتهية" });

  try {
    const { headers, rows, headerRowIndex } = readSheet(staging.buffer, staging.filename, req.params.sheetName);
    const suggestedMapping = detectColumnMapping(headers);
    res.json({
      headers,
      headerRowIndex,
      previewRows: rows.slice(0, 15),
      totalRows: rows.length,
      suggestedMapping,
      canonicalFields: CANONICAL_FIELDS.map((f) => ({ key: f.key, label: f.label, identity: Boolean(f.identity) })),
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const mappingSchema = z.record(z.string(), z.number().int().min(0));

const validateSchema = z.object({
  sheetName: z.string(),
  columnMapping: mappingSchema,
});

function toColumnMapping(raw: Record<string, number>): Partial<Record<CanonicalField, number>> {
  const validKeys = new Set(CANONICAL_FIELDS.map((f) => f.key));
  const mapping: Partial<Record<CanonicalField, number>> = {};
  for (const [key, index] of Object.entries(raw)) {
    if (validKeys.has(key as CanonicalField)) mapping[key as CanonicalField] = index;
  }
  return mapping;
}

function summarize(result: ProcessResult) {
  return {
    totalRows: result.totalRows,
    validCount: result.valid.length,
    missingCount: result.missing.length,
    errorCount: result.errors.length,
    duplicateCount: result.duplicates.length,
    missing: result.missing.slice(0, 200),
    errors: result.errors.slice(0, 200),
    duplicates: result.duplicates.slice(0, 200).map((d) => ({ rowNumber: d.row.rowNumber, reason: d.reason })),
    sampleValid: result.valid.slice(0, 10).map((r) => ({ rowNumber: r.rowNumber, data: r.data })),
  };
}

// ---- 3) معاينة النتائج قبل الاستيراد (بدون أي كتابة في قاعدة البيانات) ----
importsRouter.post("/:stagingId/validate", async (req: WorkspaceAuthedRequest, res) => {
  const staging = getStaging(req.params.stagingId, req.user!.workspaceId);
  if (!staging) return res.status(404).json({ error: "جلسة الاستيراد غير موجودة أو منتهية" });

  const parsed = validateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });

  try {
    const { headers, rows } = readSheet(staging.buffer, staging.filename, parsed.data.sheetName);
    const mapping = toColumnMapping(parsed.data.columnMapping);
    const result = await processImportRows(headers, rows, mapping, req.user!.workspaceId);
    res.json(summarize(result));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const confirmSchema = z.object({
  sheetName: z.string(),
  columnMapping: mappingSchema,
  duplicateStrategy: z.enum(["skip", "import_flagged"]),
});

// ---- 4) تأكيد الاستيراد: يُنشئ ImportedFile + Order داخل Transaction واحدة ----
// workspaceId يُؤخَذ حصرًا من الجلسة (req.user.workspaceId) - لا يُقرأ أبدًا من body الطلب.
// لا يُنشأ أي OrderAttribution هنا - مطابقة المصادر مؤجَّلة لمرحلة لاحقة بالكامل.
importsRouter.post("/:stagingId/confirm", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  const staging = getStaging(req.params.stagingId, workspaceId);
  if (!staging) return res.status(404).json({ error: "جلسة الاستيراد غير موجودة أو منتهية" });

  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  const { sheetName, duplicateStrategy } = parsed.data;

  try {
    const { headers, rows } = readSheet(staging.buffer, staging.filename, sheetName);
    const mapping = toColumnMapping(parsed.data.columnMapping);
    const result = await processImportRows(headers, rows, mapping, workspaceId);

    const importedFile = await prisma.$transaction(
      async (tx) => {
        const file = await tx.importedFile.create({
          data: {
            workspaceId,
            filename: staging.filename,
            uploadedBy: req.user!.id,
            rowCount: result.totalRows,
            acceptedCount: 0,
            rejectedCount: result.missing.length + result.errors.length,
            duplicateCount: result.duplicates.length,
            status: "PROCESSING",
            errorSummary: JSON.stringify({
              missing: result.missing.slice(0, 500),
              errors: result.errors.slice(0, 500),
              duplicates: result.duplicates.slice(0, 500).map((d) => ({ rowNumber: d.row.rowNumber, reason: d.reason })),
            }).slice(0, 100_000),
          },
        });

        const rowNumberToOrderId = new Map<number, string>();
        let acceptedCount = 0;

        for (const row of result.valid) {
          const created = await tx.order.create({
            data: {
              workspaceId,
              importedFileId: file.id,
              ...row.data,
              rawRow: JSON.stringify(row.rawRow).slice(0, 20_000),
            },
          });
          rowNumberToOrderId.set(row.rowNumber, created.id);
          acceptedCount++;
        }

        if (duplicateStrategy === "import_flagged") {
          for (const dup of result.duplicates) {
            const duplicateOfId = dup.duplicateOfOrderId ?? (dup.duplicateOfRowNumber ? rowNumberToOrderId.get(dup.duplicateOfRowNumber) : undefined);
            await tx.order.create({
              data: {
                workspaceId,
                importedFileId: file.id,
                ...dup.row.data,
                rawRow: JSON.stringify(dup.row.rawRow).slice(0, 20_000),
                isDuplicate: true,
                duplicateOfId: duplicateOfId ?? null,
                duplicateReason: dup.reason,
              },
            });
            acceptedCount++;
          }
        }

        return tx.importedFile.update({
          where: { id: file.id },
          data: { acceptedCount, status: "DONE" },
        });
      },
      // ملفات Excel حقيقية قد تحتوي مئات الصفوف، وكل صف يُنشأ بنداء create منفصل داخل نفس
      // المعاملة لضمان معرّف حقيقي عند الحاجة لربط duplicateOfId - المهلة الافتراضية لـPrisma
      // (5 ثوانٍ) قد لا تكفي، فرُفعت صراحةً لتفادي فشل الاستيراد لمجرد بطء نسبي.
      { timeout: 60_000, maxWait: 10_000 },
    );

    deleteStaging(staging.id);
    logger.info(
      { workspaceId, importedFileId: importedFile.id, accepted: importedFile.acceptedCount, rejected: importedFile.rejectedCount },
      "اكتمل استيراد ملف الطلبات",
    );
    res.json({
      importedFile,
      message: "تم استيراد الطلبات بنجاح، وستبدأ مطابقة مصادرها في المرحلة التالية.",
    });
  } catch (err) {
    logger.error({ err: (err as Error).message, workspaceId }, "فشل تأكيد استيراد الطلبات");
    res.status(500).json({ error: "فشل استيراد الملف، حاول مرة أخرى" });
  }
});

// ---- سجل ملفات الاستيراد ----
importsRouter.get("/", async (req: WorkspaceAuthedRequest, res) => {
  const files = await prisma.importedFile.findMany({
    where: { workspaceId: req.user!.workspaceId },
    orderBy: { uploadedAt: "desc" },
    take: 100,
  });

  const uploaderIds = [...new Set(files.map((f) => f.uploadedBy))];
  const uploaders = await prisma.user.findMany({
    where: { id: { in: uploaderIds } },
    select: { id: true, email: true },
  });
  const uploaderEmailById = new Map(uploaders.map((u) => [u.id, u.email]));

  res.json({
    files: files.map((f) => ({
      id: f.id,
      filename: f.filename,
      uploadedAt: f.uploadedAt,
      uploadedByEmail: uploaderEmailById.get(f.uploadedBy) ?? f.uploadedBy,
      rowCount: f.rowCount,
      acceptedCount: f.acceptedCount,
      rejectedCount: f.rejectedCount,
      duplicateCount: f.duplicateCount,
      status: f.status,
    })),
  });
});
