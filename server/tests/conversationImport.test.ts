import { describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import * as XLSX from "xlsx";

const { buildApp } = await import("../src/app.js");
const { prisma } = await import("../src/lib/prisma.js");
const { env } = await import("../src/lib/env.js");
const { normalizeIraqiPhone } = await import("../src/lib/phone.js");
const { TEST_WORKSPACE_ID } = await import("./setup.js");

const WORKSPACE_B_ID = "test-workspace-convimport-b";

function signUserToken(userId: string, email: string, workspaceId: string, role = "OWNER") {
  return jwt.sign({ typ: "user", id: userId, email, workspaceId, role }, env.jwtSecret, { expiresIn: "1h" });
}

function buildXlsxBuffer(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const HEADER = ["conversation_id", "customer_psid", "normalized_phone", "message_timestamp", "referral_ad_id", "page_id"];

async function uploadAndMap(app: any, token: string, rows: unknown[][]) {
  const buffer = buildXlsxBuffer([HEADER, ...rows]);
  const uploadRes = await request(app)
    .post("/api/conversation-import/upload")
    .set("Authorization", `Bearer ${token}`)
    .attach("file", buffer, "conversations.xlsx");
  expect(uploadRes.status).toBe(200);
  const { stagingId } = uploadRes.body;

  const sheetRes = await request(app)
    .get(`/api/conversation-import/${stagingId}/sheets/Sheet1`)
    .set("Authorization", `Bearer ${token}`);
  expect(sheetRes.status).toBe(200);
  return { stagingId, columnMapping: sheetRes.body.suggestedMapping };
}

async function seedPage(workspaceId: string, suffix: string) {
  return prisma.page.create({ data: { workspaceId, metaPageId: `page_${suffix}`, name: `صفحة ${suffix}` } });
}

async function seedMetaTree(workspaceId: string, suffix: string) {
  const adAccount = await prisma.adAccount.create({ data: { workspaceId, metaAdAccountId: `acc_${suffix}`, name: `Account ${suffix}` } });
  const campaign = await prisma.campaign.create({ data: { workspaceId, metaCampaignId: `camp_${suffix}`, name: `حملة ${suffix}`, adAccountId: adAccount.id } });
  const adSet = await prisma.adSet.create({ data: { workspaceId, metaAdSetId: `adset_${suffix}`, name: `مجموعة ${suffix}`, campaignId: campaign.id } });
  const creative = await prisma.creative.create({ data: { workspaceId, metaCreativeId: `cre_${suffix}`, videoId: `vid_${suffix}`, sourceType: "VIDEO" } });
  const ad = await prisma.ad.create({ data: { workspaceId, metaAdId: `ad_${suffix}`, name: `إعلان ${suffix}`, adSetId: adSet.id, creativeId: creative.id } });
  return { adAccount, campaign, adSet, ad, creative };
}

async function createOrder(workspaceId: string, overrides: Record<string, any> = {}) {
  const importedFile = await prisma.importedFile.create({ data: { workspaceId, filename: "test.xlsx", uploadedBy: "tester" } });
  return prisma.order.create({ data: { workspaceId, importedFileId: importedFile.id, ...overrides } });
}

describe("Historical Conversation Import - المسار الأساسي (هاتف)", () => {
  it("يستورد صفًا، يطابقه بالهاتف مع طلب موجود، ويحدّث OrderAttribution و Conversation", async () => {
    const page = await seedPage(TEST_WORKSPACE_ID, "basic");
    const normalizedPhone = normalizeIraqiPhone("07712345678").normalized!;
    const order = await createOrder(TEST_WORKSPACE_ID, { normalizedPhone, orderDate: new Date("2026-07-29T09:00:00Z") });

    const app = buildApp();
    const token = signUserToken("user-basic", "basic@example.com", TEST_WORKSPACE_ID);

    const { stagingId, columnMapping } = await uploadAndMap(app, token, [
      ["conv_basic_1", "psid_basic_1", "07712345678", "2026-07-29T10:00:00Z", "", page.metaPageId],
    ]);

    const validateRes = await request(app)
      .post(`/api/conversation-import/${stagingId}/validate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping });
    expect(validateRes.status).toBe(200);
    expect(validateRes.body.groupedCount).toBe(1);
    expect(validateRes.body.errorCount).toBe(0);

    // بدون confirm:true يُرفض
    const rejectedConfirm = await request(app)
      .post(`/api/conversation-import/${stagingId}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping });
    expect(rejectedConfirm.status).toBe(400);

    const confirmRes = await request(app)
      .post(`/api/conversation-import/${stagingId}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping, confirm: true });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.batch.acceptedCount).toBe(1);

    const attribution = await prisma.orderAttribution.findUnique({ where: { orderId: order.id } });
    expect(attribution?.matchMethod).toBe("MESSAGE_PHONE");
    expect(attribution?.confidence).toBe(0.7);

    const conversation = await prisma.conversation.findFirst({ where: { workspaceId: TEST_WORKSPACE_ID, platformThreadId: "conv_basic_1" } });
    expect(conversation?.source).toBe("HISTORICAL_IMPORT");
    expect(conversation?.matchStatus).toBe("MATCHED");
    expect(conversation?.matchedOrderId).toBe(order.id);
    expect(conversation?.importBatchId).toBe(confirmRes.body.batch.id);
  });
});

describe("Historical Conversation Import - الإعلان المرجعي", () => {
  it("يحلّ referral_ad_id إلى الإعلان الداخلي مع Snapshot، وتكون الثقة أعلى (MESSAGE_REFERRAL_AD_ID)", async () => {
    const page = await seedPage(TEST_WORKSPACE_ID, "ref");
    const { ad, campaign } = await seedMetaTree(TEST_WORKSPACE_ID, "ref");
    const normalizedPhone = normalizeIraqiPhone("07799991111").normalized!;
    const order = await createOrder(TEST_WORKSPACE_ID, { normalizedPhone, orderDate: new Date("2026-07-29T09:00:00Z") });

    const app = buildApp();
    const token = signUserToken("user-ref", "ref@example.com", TEST_WORKSPACE_ID);

    const { stagingId, columnMapping } = await uploadAndMap(app, token, [
      ["conv_ref_1", "psid_ref_1", "07799991111", "2026-07-29T10:00:00Z", "ad_ref", page.metaPageId],
    ]);
    await request(app)
      .post(`/api/conversation-import/${stagingId}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping, confirm: true });

    const attribution = await prisma.orderAttribution.findUnique({ where: { orderId: order.id } });
    expect(attribution?.matchMethod).toBe("MESSAGE_REFERRAL_AD_ID");
    expect(attribution?.confidence).toBe(0.85);
    expect(attribution?.adId).toBe(ad.id);
    expect(attribution?.campaignId).toBe(campaign.id);

    const conversation = await prisma.conversation.findFirst({ where: { workspaceId: TEST_WORKSPACE_ID, platformThreadId: "conv_ref_1" } });
    expect(conversation?.referralAdInternalId).toBe(ad.id);
    expect(conversation?.referralAdNameSnapshot).toBe(ad.name);
  });
});

describe("Historical Conversation Import - تعارضات وحماية بيانات Webhook", () => {
  it("صفان بنفس conversation_id برقمين مختلفين: الرقم الأول معتمد، والثاني يُسجَّل كتعارض", async () => {
    const page = await seedPage(TEST_WORKSPACE_ID, "conflict");
    const app = buildApp();
    const token = signUserToken("user-conflict", "conflict@example.com", TEST_WORKSPACE_ID);

    const { stagingId, columnMapping } = await uploadAndMap(app, token, [
      ["conv_conflict_1", "psid_conflict_1", "07711110000", "2026-07-29T10:00:00Z", "", page.metaPageId],
      ["conv_conflict_1", "psid_conflict_1", "07722220000", "2026-07-29T11:00:00Z", "", page.metaPageId],
    ]);

    const validateRes = await request(app)
      .post(`/api/conversation-import/${stagingId}/validate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping });
    expect(validateRes.body.groupedCount).toBe(1);
    expect(validateRes.body.conflictCount).toBe(1);

    const confirmRes = await request(app)
      .post(`/api/conversation-import/${stagingId}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping, confirm: true });
    expect(confirmRes.body.batch.duplicateCount).toBe(1);

    const conversation = await prisma.conversation.findFirst({ where: { workspaceId: TEST_WORKSPACE_ID, platformThreadId: "conv_conflict_1" } });
    expect(conversation?.normalizedPhoneExtracted).toBe(normalizeIraqiPhone("07711110000").normalized);
  });

  it("لا يستبدل بيانات محادثة موجودة مسبقًا من Webhook حي حتى لو تعارضت مع الملف المستورَد", async () => {
    const page = await seedPage(TEST_WORKSPACE_ID, "protect");
    const webhookPhone = normalizeIraqiPhone("07733330000").normalized!;
    const existingConversation = await prisma.conversation.create({
      data: {
        workspaceId: TEST_WORKSPACE_ID,
        pageId: page.id,
        platform: "INSTAGRAM",
        platformThreadId: "conv_protect_1",
        customerPsid: "psid_protect_1",
        normalizedPhoneExtracted: webhookPhone,
        firstMessageAt: new Date("2026-07-20T00:00:00Z"),
        lastMessageAt: new Date("2026-07-20T00:00:00Z"),
        source: "WEBHOOK",
      },
    });

    const app = buildApp();
    const token = signUserToken("user-protect", "protect@example.com", TEST_WORKSPACE_ID);
    const { stagingId, columnMapping } = await uploadAndMap(app, token, [
      ["conv_protect_1", "psid_protect_1", "07744440000", "2026-07-29T10:00:00Z", "", page.metaPageId],
    ]);
    const confirmRes = await request(app)
      .post(`/api/conversation-import/${stagingId}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping, confirm: true });
    expect(confirmRes.body.batch.duplicateCount).toBe(1);

    const after = await prisma.conversation.findUnique({ where: { id: existingConversation.id } });
    expect(after?.normalizedPhoneExtracted).toBe(webhookPhone); // لم يُستبدَل
    expect(after?.source).toBe("WEBHOOK"); // لم يتحوّل مصدره
  });

  it("page_id غير معروف يُرفض الصف بخطأ صريح", async () => {
    const app = buildApp();
    const token = signUserToken("user-unknownpage", "unknownpage@example.com", TEST_WORKSPACE_ID);
    const { stagingId, columnMapping } = await uploadAndMap(app, token, [
      ["conv_unknownpage_1", "psid_unknownpage_1", "07755550000", "2026-07-29T10:00:00Z", "", "page_does_not_exist"],
    ]);
    const validateRes = await request(app)
      .post(`/api/conversation-import/${stagingId}/validate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping });
    expect(validateRes.body.groupedCount).toBe(0);
    expect(validateRes.body.errorCount).toBe(1);
  });
});

describe("Historical Conversation Import - الحذف وإعادة حساب المطابقة", () => {
  it("حذف دفعة يزيل محادثاتها ويُعيد الطلب إلى UNMATCHED عند غياب أي دليل آخر", async () => {
    const page = await seedPage(TEST_WORKSPACE_ID, "del");
    const normalizedPhone = normalizeIraqiPhone("07766660000").normalized!;
    const order = await createOrder(TEST_WORKSPACE_ID, { normalizedPhone, orderDate: new Date("2026-07-29T09:00:00Z") });

    const app = buildApp();
    const token = signUserToken("user-del", "del@example.com", TEST_WORKSPACE_ID);
    const { stagingId, columnMapping } = await uploadAndMap(app, token, [
      ["conv_del_1", "psid_del_1", "07766660000", "2026-07-29T10:00:00Z", "", page.metaPageId],
    ]);
    const confirmRes = await request(app)
      .post(`/api/conversation-import/${stagingId}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sheetName: "Sheet1", columnMapping, confirm: true });
    const batchId = confirmRes.body.batch.id;

    const beforeDelete = await prisma.orderAttribution.findUnique({ where: { orderId: order.id } });
    expect(beforeDelete?.matchMethod).toBe("MESSAGE_PHONE");

    const deleteRes = await request(app)
      .delete(`/api/conversation-import/batches/${batchId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deletedConversations).toBe(1);

    const remaining = await prisma.conversation.findFirst({ where: { workspaceId: TEST_WORKSPACE_ID, platformThreadId: "conv_del_1" } });
    expect(remaining).toBeNull();

    const afterDelete = await prisma.orderAttribution.findUnique({ where: { orderId: order.id } });
    expect(afterDelete?.matchStatus).toBe("UNMATCHED");
  });
});

describe("عزل الاستيراد بين الـWorkspaces", () => {
  it("page_id يخص Workspace A لا يُقبَل عند الاستيراد إلى Workspace B", async () => {
    await prisma.workspace.create({ data: { id: WORKSPACE_B_ID, name: "Workspace B" } });
    await prisma.workspaceSubscription.create({ data: { workspaceId: WORKSPACE_B_ID, status: "ACTIVE" } });
    const pageA = await seedPage(TEST_WORKSPACE_ID, "isoA");

    const app = buildApp();
    const tokenB = signUserToken("user-iso-b", "iso-b@example.com", WORKSPACE_B_ID);
    const { stagingId, columnMapping } = await uploadAndMap(app, tokenB, [
      ["conv_isoB_1", "psid_isoB_1", "07777770000", "2026-07-29T10:00:00Z", "", pageA.metaPageId],
    ]);
    const validateRes = await request(app)
      .post(`/api/conversation-import/${stagingId}/validate`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ sheetName: "Sheet1", columnMapping });
    expect(validateRes.body.groupedCount).toBe(0);
    expect(validateRes.body.errorCount).toBe(1);
  });
});
