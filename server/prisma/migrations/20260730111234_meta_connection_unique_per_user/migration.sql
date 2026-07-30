-- AlterTable
ALTER TABLE "MetaConnection" ALTER COLUMN "metaUserId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "MetaConnection_workspaceId_metaUserId_key" ON "MetaConnection"("workspaceId", "metaUserId");

