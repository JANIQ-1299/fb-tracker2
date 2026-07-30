import { beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";

// معرّف Workspace ثابت يُعاد إنشاؤه قبل كل اختبار — كل الاختبارات القديمة (أحادية المستأجر
// أصلًا) تعمل ضمن هذا الـWorkspace الوحيد بعد إضافة workspaceId لكل الجداول.
export const TEST_WORKSPACE_ID = "test-workspace-1";

// ترتيب الحذف يراعي القيود الأجنبية (foreign keys)
beforeEach(async () => {
  await prisma.orderAttribution.deleteMany();
  await prisma.order.deleteMany();
  await prisma.importedFile.deleteMany();
  await prisma.mappingRule.deleteMany();
  await prisma.licenseDevice.deleteMany();
  await prisma.leadStatusHistory.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.insightSnapshot.deleteMany();
  await prisma.detectedOrderIncrement.deleteMany();
  await prisma.adPerformanceSnapshot.deleteMany();
  await prisma.syncRun.deleteMany();
  await prisma.ad.deleteMany();
  await prisma.creative.deleteMany();
  await prisma.adSet.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.adAccount.deleteMany();
  await prisma.page.deleteMany();
  await prisma.business.deleteMany();
  await prisma.metaConnection.deleteMany();
  await prisma.syncLog.deleteMany();
  await prisma.dailyReport.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspaceSubscription.deleteMany();
  await prisma.adminAction.deleteMany();
  await prisma.superAdmin.deleteMany();
  await prisma.workspace.deleteMany();

  await prisma.workspace.create({ data: { id: TEST_WORKSPACE_ID, name: "Test Workspace" } });
  await prisma.workspaceSubscription.create({
    data: { workspaceId: TEST_WORKSPACE_ID, status: "ACTIVE" },
  });
});
