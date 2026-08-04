import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import request from "supertest";

const { buildApp } = await import("../src/app.js");
const { prisma } = await import("../src/lib/prisma.js");
const { normalizeIraqiPhone } = await import("../src/lib/phone.js");
const { purgeExpiredMessageText } = await import("../src/jobs/purgeMessageText.js");
const { TEST_WORKSPACE_ID } = await import("./setup.js");

const APP_SECRET = "test_app_secret";
const WORKSPACE_B_ID = "test-workspace-messaging-b";

function sign(rawBody: string) {
  return "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");
}

function messagingPayload(
  pageId: string,
  senderId: string,
  mid: string,
  text: string,
  referralAdId?: string,
  timestamp = Date.now(),
) {
  return {
    object: "instagram",
    entry: [
      {
        id: pageId,
        messaging: [
          {
            sender: { id: senderId },
            timestamp,
            message: { mid, text, ...(referralAdId ? { referral: { ad_id: referralAdId } } : {}) },
          },
        ],
      },
    ],
  };
}

async function seedPage(workspaceId: string, suffix: string) {
  return prisma.page.create({ data: { workspaceId, metaPageId: `page_${suffix}`, name: `صفحة ${suffix}` } });
}

async function enableMessaging(workspaceId: string, pageId: string, overrides: Record<string, any> = {}) {
  return prisma.messagingIntegration.create({
    data: { workspaceId, pageId, enabled: true, enabledAt: new Date(), ...overrides },
  });
}

async function seedMetaTree(workspaceId: string, suffix: string) {
  const adAccount = await prisma.adAccount.create({
    data: { workspaceId, metaAdAccountId: `acc_${suffix}`, name: `Account ${suffix}` },
  });
  const campaign = await prisma.campaign.create({
    data: { workspaceId, metaCampaignId: `camp_${suffix}`, name: `حملة ${suffix}`, adAccountId: adAccount.id },
  });
  const adSet = await prisma.adSet.create({
    data: { workspaceId, metaAdSetId: `adset_${suffix}`, name: `مجموعة ${suffix}`, campaignId: campaign.id },
  });
  const ad = await prisma.ad.create({
    data: { workspaceId, metaAdId: `ad_${suffix}`, name: `إعلان ${suffix}`, adSetId: adSet.id },
  });
  return { adAccount, campaign, adSet, ad };
}

async function createOrder(workspaceId: string, overrides: Record<string, any> = {}) {
  const importedFile = await prisma.importedFile.create({
    data: { workspaceId, filename: "test.xlsx", uploadedBy: "tester" },
  });
  return prisma.order.create({ data: { workspaceId, importedFileId: importedFile.id, ...overrides } });
}

describe("GET /webhook/meta/messaging - Handshake", () => {
  it("ينجح مع verify_token صحيح ويعيد challenge", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/webhook/meta/messaging")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "test_verify_token", "hub.challenge": "999" });
    expect(res.status).toBe(200);
    expect(res.text).toBe("999");
  });

  it("يرفض verify_token خاطئ", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/webhook/meta/messaging")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "999" });
    expect(res.status).toBe(403);
  });
});

describe("POST /webhook/meta/messaging - بوابة التفعيل الصريحة", () => {
  it("لا يُنشئ أي Conversation/Message عندما لا يكون الاستقبال مفعَّلًا لهذا Workspace", async () => {
    const page = await seedPage(TEST_WORKSPACE_ID, "gate");
    // لا MessagingIntegration مُنشَأة أصلًا - يجب تجاهل الرسالة تمامًا
    const app = buildApp();
    const body = JSON.stringify(messagingPayload(page.metaPageId, "sender_gate", "mid_gate_1", "مرحبا"));
    const res = await request(app)
      .post("/webhook/meta/messaging")
      .set("Content-Type", "application/json")
      .set("x-hub-signature-256", sign(body))
      .send(body);
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 100));
    const conversations = await prisma.conversation.findMany({ where: { workspaceId: TEST_WORKSPACE_ID } });
    expect(conversations.length).toBe(0);
  });
});

describe("POST /webhook/meta/messaging - استقبال ومطابقة فورية عند التفعيل", () => {
  it("Idempotency: نفس mid مرتين ينتج رسالة/محادثة واحدة فقط", async () => {
    const page = await seedPage(TEST_WORKSPACE_ID, "idem");
    await enableMessaging(TEST_WORKSPACE_ID, page.id);

    const app = buildApp();
    const body = JSON.stringify(messagingPayload(page.metaPageId, "sender_idem", "mid_idem_1", "السلام عليكم"));
    const headers = { "x-hub-signature-256": sign(body) };

    await request(app).post("/webhook/meta/messaging").set("Content-Type", "application/json").set(headers).send(body);
    await new Promise((r) => setTimeout(r, 100));
    await request(app).post("/webhook/meta/messaging").set("Content-Type", "application/json").set(headers).send(body);
    await new Promise((r) => setTimeout(r, 100));

    const messages = await prisma.message.findMany({ where: { workspaceId: TEST_WORKSPACE_ID, metaMessageId: "mid_idem_1" } });
    expect(messages.length).toBe(1);
    const conversations = await prisma.conversation.findMany({ where: { workspaceId: TEST_WORKSPACE_ID, platformThreadId: "sender_idem" } });
    expect(conversations.length).toBe(1);
  });

  it("يستخرج رقم الهاتف من نص الرسالة ويطابق الطلب فورًا (MESSAGE_PHONE)", async () => {
    const page = await seedPage(TEST_WORKSPACE_ID, "phone");
    await enableMessaging(TEST_WORKSPACE_ID, page.id);
    const normalizedPhone = normalizeIraqiPhone("07712345678").normalized!;
    const order = await createOrder(TEST_WORKSPACE_ID, { normalizedPhone, orderDate: new Date() });

    const app = buildApp();
    const body = JSON.stringify(
      messagingPayload(page.metaPageId, "sender_phone", "mid_phone_1", "أريد الطلب، رقمي 07712345678"),
    );
    await request(app)
      .post("/webhook/meta/messaging")
      .set("Content-Type", "application/json")
      .set("x-hub-signature-256", sign(body))
      .send(body);
    await new Promise((r) => setTimeout(r, 150));

    const conversation = await prisma.conversation.findFirst({ where: { workspaceId: TEST_WORKSPACE_ID, platformThreadId: "sender_phone" } });
    expect(conversation?.normalizedPhoneExtracted).toBe(normalizedPhone);
    expect(conversation?.matchStatus).toBe("MATCHED");
    expect(conversation?.matchedOrderId).toBe(order.id);

    const attribution = await prisma.orderAttribution.findUnique({ where: { orderId: order.id } });
    expect(attribution?.matchMethod).toBe("MESSAGE_PHONE");
    expect(attribution?.matchStatus).toBe("PROBABLE");
    expect(attribution?.confidence).toBe(0.7);
  });

  it("يُعطي الأولوية لإعلان referral المحدَّد (MESSAGE_REFERRAL_AD_ID بثقة أعلى)", async () => {
    const page = await seedPage(TEST_WORKSPACE_ID, "ref");
    await enableMessaging(TEST_WORKSPACE_ID, page.id);
    const { ad } = await seedMetaTree(TEST_WORKSPACE_ID, "ref");
    const normalizedPhone = normalizeIraqiPhone("07799998888").normalized!;
    const order = await createOrder(TEST_WORKSPACE_ID, { normalizedPhone, orderDate: new Date() });

    const app = buildApp();
    const body = JSON.stringify(
      messagingPayload(page.metaPageId, "sender_ref", "mid_ref_1", "رقمي 07799998888", "ad_ref"),
    );
    await request(app)
      .post("/webhook/meta/messaging")
      .set("Content-Type", "application/json")
      .set("x-hub-signature-256", sign(body))
      .send(body);
    await new Promise((r) => setTimeout(r, 150));

    const conversation = await prisma.conversation.findFirst({ where: { workspaceId: TEST_WORKSPACE_ID, platformThreadId: "sender_ref" } });
    expect(conversation?.referralAdInternalId).toBe(ad.id);
    expect(conversation?.referralAdNameSnapshot).toBe(ad.name);

    const attribution = await prisma.orderAttribution.findUnique({ where: { orderId: order.id } });
    expect(attribution?.matchMethod).toBe("MESSAGE_REFERRAL_AD_ID");
    expect(attribution?.confidence).toBe(0.85);
    expect(attribution?.adId).toBe(ad.id);
  });

  it("لا يستبدل تطابقًا MANUAL محفوظًا مسبقًا حتى لو وصلت رسالة جديدة بنفس الهاتف", async () => {
    const page = await seedPage(TEST_WORKSPACE_ID, "man");
    await enableMessaging(TEST_WORKSPACE_ID, page.id);
    const { campaign } = await seedMetaTree(TEST_WORKSPACE_ID, "man");
    const normalizedPhone = normalizeIraqiPhone("07711112222").normalized!;
    const order = await createOrder(TEST_WORKSPACE_ID, { normalizedPhone, orderDate: new Date() });
    await prisma.orderAttribution.create({
      data: {
        orderId: order.id,
        workspaceId: TEST_WORKSPACE_ID,
        campaignId: campaign.id,
        matchStatus: "MANUAL",
        matchMethod: "MANUAL",
        confidence: 1,
      },
    });

    const app = buildApp();
    const body = JSON.stringify(messagingPayload(page.metaPageId, "sender_man", "mid_man_1", "07711112222"));
    await request(app)
      .post("/webhook/meta/messaging")
      .set("Content-Type", "application/json")
      .set("x-hub-signature-256", sign(body))
      .send(body);
    await new Promise((r) => setTimeout(r, 150));

    const attribution = await prisma.orderAttribution.findUnique({ where: { orderId: order.id } });
    expect(attribution?.matchStatus).toBe("MANUAL");
    expect(attribution?.matchMethod).toBe("MANUAL");
  });

  it("عند تعدد الطلبات المرشَّحة بنفس الهاتف دون فائز واضح تُوضع NEEDS_REVIEW بدل التخمين", async () => {
    const page = await seedPage(TEST_WORKSPACE_ID, "amb");
    await enableMessaging(TEST_WORKSPACE_ID, page.id);
    const normalizedPhone = normalizeIraqiPhone("07733334444").normalized!;
    // طلبان بنفس الهاتف، بلا أي إشارة مرجّحة (لا تاريخ قريب، لا حالة، لا اسم/محافظة في نص الرسالة)
    await createOrder(TEST_WORKSPACE_ID, { normalizedPhone });
    await createOrder(TEST_WORKSPACE_ID, { normalizedPhone });

    const app = buildApp();
    const body = JSON.stringify(messagingPayload(page.metaPageId, "sender_amb", "mid_amb_1", "07733334444"));
    await request(app)
      .post("/webhook/meta/messaging")
      .set("Content-Type", "application/json")
      .set("x-hub-signature-256", sign(body))
      .send(body);
    await new Promise((r) => setTimeout(r, 150));

    const conversation = await prisma.conversation.findFirst({ where: { workspaceId: TEST_WORKSPACE_ID, platformThreadId: "sender_amb" } });
    expect(conversation?.matchStatus).toBe("NEEDS_REVIEW");
    expect(conversation?.matchedOrderId).toBeNull();
  });
});

describe("purgeExpiredMessageText - تنظيف نص الرسائل بعد مدة الاحتفاظ", () => {
  it("يُصفّر textRaw للرسائل الأقدم من retentionDays فقط", async () => {
    const page = await seedPage(TEST_WORKSPACE_ID, "purge");
    const integration = await enableMessaging(TEST_WORKSPACE_ID, page.id, { retentionDays: 7 });
    const conversation = await prisma.conversation.create({
      data: {
        workspaceId: TEST_WORKSPACE_ID,
        pageId: page.id,
        platformThreadId: "sender_purge",
        customerPsid: "sender_purge",
        firstMessageAt: new Date(),
        lastMessageAt: new Date(),
      },
    });
    const oldMessage = await prisma.message.create({
      data: {
        workspaceId: TEST_WORKSPACE_ID,
        conversationId: conversation.id,
        direction: "INBOUND",
        textRaw: "نص قديم يجب حذفه",
        receivedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // منذ 10 أيام
      },
    });
    const recentMessage = await prisma.message.create({
      data: {
        workspaceId: TEST_WORKSPACE_ID,
        conversationId: conversation.id,
        direction: "INBOUND",
        textRaw: "نص حديث يجب أن يبقى",
        receivedAt: new Date(),
      },
    });

    await purgeExpiredMessageText();

    const oldAfter = await prisma.message.findUnique({ where: { id: oldMessage.id } });
    const recentAfter = await prisma.message.findUnique({ where: { id: recentMessage.id } });
    expect(oldAfter?.textRaw).toBeNull();
    expect(oldAfter?.textPurgedAt).toBeTruthy();
    expect(recentAfter?.textRaw).toBe("نص حديث يجب أن يبقى");
  });
});

describe("عزل رسائل إنستغرام بين الـWorkspaces", () => {
  it("رسالة لصفحة Workspace A لا تُنشئ أي سجل مرئي لـWorkspace B", async () => {
    await prisma.workspace.create({ data: { id: WORKSPACE_B_ID, name: "Workspace B" } });
    await prisma.workspaceSubscription.create({ data: { workspaceId: WORKSPACE_B_ID, status: "ACTIVE" } });

    const pageA = await seedPage(TEST_WORKSPACE_ID, "isoA");
    await enableMessaging(TEST_WORKSPACE_ID, pageA.id);

    const app = buildApp();
    const body = JSON.stringify(messagingPayload(pageA.metaPageId, "sender_isoA", "mid_isoA_1", "مرحبا"));
    await request(app)
      .post("/webhook/meta/messaging")
      .set("Content-Type", "application/json")
      .set("x-hub-signature-256", sign(body))
      .send(body);
    await new Promise((r) => setTimeout(r, 100));

    const conversationsB = await prisma.conversation.findMany({ where: { workspaceId: WORKSPACE_B_ID } });
    expect(conversationsB.length).toBe(0);
    const conversationsA = await prisma.conversation.findMany({ where: { workspaceId: TEST_WORKSPACE_ID } });
    expect(conversationsA.length).toBe(1);
  });
});
