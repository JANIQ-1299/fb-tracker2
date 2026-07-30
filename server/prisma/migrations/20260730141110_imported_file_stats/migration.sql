-- AlterTable
ALTER TABLE "ImportedFile" ADD COLUMN     "acceptedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "duplicateCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rejectedCount" INTEGER NOT NULL DEFAULT 0;

