-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InsightSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "level" TEXT NOT NULL,
    "campaignId" TEXT,
    "adSetId" TEXT,
    "adId" TEXT,
    "spend" REAL NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "leadsCount" INTEGER NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "costPerResult" REAL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InsightSnapshot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InsightSnapshot_adSetId_fkey" FOREIGN KEY ("adSetId") REFERENCES "AdSet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InsightSnapshot_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InsightSnapshot" ("adId", "adSetId", "campaignId", "clicks", "costPerResult", "currency", "date", "fetchedAt", "id", "impressions", "leadsCount", "level", "reach", "spend") SELECT "adId", "adSetId", "campaignId", "clicks", "costPerResult", "currency", "date", "fetchedAt", "id", "impressions", "leadsCount", "level", "reach", "spend" FROM "InsightSnapshot";
DROP TABLE "InsightSnapshot";
ALTER TABLE "new_InsightSnapshot" RENAME TO "InsightSnapshot";
CREATE INDEX "InsightSnapshot_date_idx" ON "InsightSnapshot"("date");
CREATE UNIQUE INDEX "InsightSnapshot_date_level_campaignId_adSetId_adId_key" ON "InsightSnapshot"("date", "level", "campaignId", "adSetId", "adId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
