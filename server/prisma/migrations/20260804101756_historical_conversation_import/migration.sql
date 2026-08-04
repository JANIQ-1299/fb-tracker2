-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'WEBHOOK';

-- CreateTable
CREATE TABLE "ConversationImportBatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "errorSummary" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ConversationImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationImportBatch_workspaceId_idx" ON "ConversationImportBatch"("workspaceId");

-- CreateIndex
CREATE INDEX "Conversation_importBatchId_idx" ON "Conversation"("importBatchId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ConversationImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationImportBatch" ADD CONSTRAINT "ConversationImportBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
