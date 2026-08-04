import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma.js";
import { readSheet } from "../src/services/importParser.js";
import { detectColumnMapping, type CanonicalField } from "../src/services/importColumns.js";
import { processImportRows } from "../src/services/importProcessor.js";
import { runAttributionForWorkspace } from "../src/services/attributionEngine.js";
import { buildAttributionWorkbook } from "../src/services/attributionExport.js";
import { getMatchTier } from "../src/services/matchTier.js";

const WORKSPACE_ID = "cms7dy8tn0001uqf4i2btq3kx"; // نضارة
const FILE_PATH = path.resolve("data-imports/orders_raw_phones.xlsx");
const SHEET_NAME = "الطلبات";

async function main() {
  const buffer = fs.readFileSync(FILE_PATH);
  const { headers, rows } = readSheet(buffer, "orders_raw_phones.xlsx", SHEET_NAME);

  const mapping = detectColumnMapping(headers);
  // "المندوبة" (اسم المندوبة) لم يُتعرَّف عليه تلقائيًا - إضافة يدوية لأنه يقابل عمود الموظف
  const repIndex = headers.findIndex((h) => h.trim() === "المندوبة");
  if (repIndex !== -1) mapping.employeeName = repIndex;

  console.log("column mapping:", mapping);

  const result = await processImportRows(headers, rows, mapping as Partial<Record<CanonicalField, number>>, WORKSPACE_ID);
  console.log(
    `total=${result.totalRows} valid=${result.valid.length} missing=${result.missing.length} errors=${result.errors.length} duplicates=${result.duplicates.length}`,
  );
  if (result.errors.length) console.log("errors sample:", result.errors.slice(0, 10));
  if (result.missing.length) console.log("missing sample:", result.missing.slice(0, 10));

  const importedFile = await prisma.$transaction(
    async (tx) => {
      const file = await tx.importedFile.create({
        data: {
          workspaceId: WORKSPACE_ID,
          filename: "orders_raw_phones.xlsx",
          uploadedBy: "system-import-script",
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

      let acceptedCount = 0;
      for (const row of result.valid) {
        await tx.order.create({
          data: {
            workspaceId: WORKSPACE_ID,
            importedFileId: file.id,
            ...row.data,
            rawRow: JSON.stringify(row.rawRow).slice(0, 20_000),
          },
        });
        acceptedCount++;
      }

      return tx.importedFile.update({ where: { id: file.id }, data: { acceptedCount, status: "DONE" } });
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  console.log("importedFile:", importedFile.id, "accepted:", importedFile.acceptedCount, "rejected:", importedFile.rejectedCount, "duplicates:", importedFile.duplicateCount);

  const summary = await runAttributionForWorkspace(WORKSPACE_ID);
  console.log("attribution summary:", summary);

  // تصنيف رباعي على مستوى كل الـWorkspace (وليس فقط هذا الاستيراد) للتقرير النهائي للمستخدم
  const attributions = await prisma.orderAttribution.findMany({ where: { workspaceId: WORKSPACE_ID } });
  const tiers = { confirmed: 0, strong: 0, approximate: 0, needsReview: 0, unknown: 0 };
  for (const a of attributions) {
    const tier = getMatchTier(a.matchStatus, a.confidence);
    if (tier.key === "CONFIRMED") tiers.confirmed++;
    else if (tier.key === "STRONG") tiers.strong++;
    else if (tier.key === "APPROXIMATE") tiers.approximate++;
    else if (tier.key === "NEEDS_REVIEW") tiers.needsReview++;
    else tiers.unknown++;
  }
  const totalOrders = await prisma.order.count({ where: { workspaceId: WORKSPACE_ID } });
  const noAttributionYet = await prisma.order.count({ where: { workspaceId: WORKSPACE_ID, attribution: null } });
  tiers.unknown += noAttributionYet;
  console.log("tiers (كل الـWorkspace):", tiers, "totalOrders:", totalOrders);

  const workbook = await buildAttributionWorkbook(WORKSPACE_ID);
  const outPath = path.resolve("data-imports/attribution-export-303.xlsx");
  fs.writeFileSync(outPath, workbook);
  console.log("exported:", outPath);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
