-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'running',
    "adsProcessed" INTEGER NOT NULL DEFAULT 0,
    "metaOrdersDetected" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AdPerformanceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adId" TEXT NOT NULL,
    "campaignId" TEXT,
    "adSetId" TEXT,
    "creativeId" TEXT,
    "videoId" TEXT,
    "snapshotTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metaDate" DATETIME NOT NULL,
    "spend" REAL NOT NULL,
    "metaOrderCount" INTEGER NOT NULL,
    "actionsRaw" TEXT,
    "syncRunId" TEXT NOT NULL,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdPerformanceSnapshot_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AdPerformanceSnapshot_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "SyncRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DetectedOrderIncrement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adId" TEXT NOT NULL,
    "campaignId" TEXT,
    "adSetId" TEXT,
    "creativeId" TEXT,
    "videoId" TEXT,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowStart" DATETIME NOT NULL,
    "windowEnd" DATETIME NOT NULL,
    "previousCount" INTEGER NOT NULL,
    "currentCount" INTEGER NOT NULL,
    "newMetaOrders" INTEGER NOT NULL,
    "spendDelta" REAL NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "syncRunId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DetectedOrderIncrement_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DetectedOrderIncrement_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "SyncRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SyncRun_startedAt_idx" ON "SyncRun"("startedAt");

-- CreateIndex
CREATE INDEX "AdPerformanceSnapshot_adId_metaDate_idx" ON "AdPerformanceSnapshot"("adId", "metaDate");

-- CreateIndex
CREATE INDEX "AdPerformanceSnapshot_syncRunId_idx" ON "AdPerformanceSnapshot"("syncRunId");

-- CreateIndex
CREATE INDEX "DetectedOrderIncrement_detectedAt_idx" ON "DetectedOrderIncrement"("detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DetectedOrderIncrement_adId_snapshotId_key" ON "DetectedOrderIncrement"("adId", "snapshotId");
