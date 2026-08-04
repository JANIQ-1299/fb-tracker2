import { describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const { buildApp } = await import("../src/app.js");
const { prisma } = await import("../src/lib/prisma.js");
const { env } = await import("../src/lib/env.js");
const { computeAttributionForOrder, runAttributionForWorkspace } = await import(
  "../src/services/attributionEngine.js"
);
const { TEST_WORKSPACE_ID } = await import("./setup.js");

const WORKSPACE_B_ID = "test-workspace-attribution-b";

function signUserToken(userId: string, email: string, workspaceId: string, role = "OWNER") {
  return jwt.sign({ typ: "user", id: userId, email, workspaceId, role }, env.jwtSecret, { expiresIn: "1h" });
}

async function seedWorkspaceB() {
  await prisma.workspace.create({ data: { id: WORKSPACE_B_ID, name: "Workspace B" } });
  await prisma.workspaceSubscription.create({ data: { workspaceId: WORKSPACE_B_ID, status: "ACTIVE" } });
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
  return prisma.order.create({
    data: { workspaceId, importedFileId: importedFile.id, ...overrides },
  });
}

describe("محرك المطابقة - سلسلة الأولوية", () => {
  it("1) يطابق بدقة عبر ad_id مباشرة", async () => {
    const { ad } = await seedMetaTree(TEST_WORKSPACE_ID, "adid");
    const order = await createOrder(TEST_WORKSPACE_ID, { adIdRaw: "ad_adid" });

    const decision = await computeAttributionForOrder(order, TEST_WORKSPACE_ID);
    expect(decision.matchStatus).toBe("EXACT");
    expect(decision.matchMethod).toBe("AD_ID");
    expect(decision.confidence).toBe(1);
    expect(decision.adId).toBe(ad.id);
  });

  it("2) يطابق بدقة عبر lead_id مباشرة", async () => {
    const { campaign, adSet, ad } = await seedMetaTree(TEST_WORKSPACE_ID, "leadid");
    const lead = await prisma.lead.create({
      data: {
        workspaceId: TEST_WORKSPACE_ID,
        metaLeadId: "lead_x1",
        campaignId: campaign.id,
        adSetId: adSet.id,
        adId: ad.id,
      },
    });
    const order = await createOrder(TEST_WORKSPACE_ID, { leadIdRaw: "lead_x1" });

    const decision = await computeAttributionForOrder(order, TEST_WORKSPACE_ID);
    expect(decision.matchStatus).toBe("EXACT");
    expect(decision.matchMethod).toBe("LEAD_ID");
    expect(decision.adId).toBe(lead.adId);
  });

  it("3) يطابق احتماليًا عبر adset_id أو campaign_id عند غياب ad_id/lead_id", async () => {
    const { campaign, adSet } = await seedMetaTree(TEST_WORKSPACE_ID, "adset");
    const orderAdset = await createOrder(TEST_WORKSPACE_ID, { adSetIdRaw: "adset_adset" });
    const decisionAdset = await computeAttributionForOrder(orderAdset, TEST_WORKSPACE_ID);
    expect(decisionAdset.matchStatus).toBe("PROBABLE");
    expect(decisionAdset.matchMethod).toBe("CAMPAIGN_ADSET");
    expect(decisionAdset.adSetId).toBe(adSet.id);
    expect(decisionAdset.adId).toBeNull();

    const orderCampaign = await createOrder(TEST_WORKSPACE_ID, { campaignIdRaw: "camp_adset" });
    const decisionCampaign = await computeAttributionForOrder(orderCampaign, TEST_WORKSPACE_ID);
    expect(decisionCampaign.matchStatus).toBe("PROBABLE");
    expect(decisionCampaign.campaignId).toBe(campaign.id);
    expect(decisionCampaign.confidence).toBeLessThan(decisionAdset.confidence);
  });

  it("4) يطابق احتماليًا عبر اسم الإعلان أو الحملة", async () => {
    const { ad } = await seedMetaTree(TEST_WORKSPACE_ID, "name");
    const order = await createOrder(TEST_WORKSPACE_ID, { adNameRaw: "إعلان name" });
    const decision = await computeAttributionForOrder(order, TEST_WORKSPACE_ID);
    expect(decision.matchStatus).toBe("PROBABLE");
    expect(decision.matchMethod).toBe("NAME");
    expect(decision.adId).toBe(ad.id);
  });

  it("5) يطابق احتماليًا عبر رقم الهاتف مع Lead، ويستخدم الوقت كترجيح فقط عند التعادل", async () => {
    const { ad: farAd } = await seedMetaTree(TEST_WORKSPACE_ID, "phone1");
    const { ad: ad2 } = await seedMetaTree(TEST_WORKSPACE_ID, "phone2");

    const orderTime = new Date("2026-07-27T12:00:00Z");
    await prisma.lead.create({
      data: {
        workspaceId: TEST_WORKSPACE_ID,
        metaLeadId: "lead_far",
        normalizedPhone: "+9647700000001",
        adId: farAd.id,
        metaCreatedAt: new Date("2026-07-20T00:00:00Z"), // بعيد زمنيًا
      },
    });
    const closeLead = await prisma.lead.create({
      data: {
        workspaceId: TEST_WORKSPACE_ID,
        metaLeadId: "lead_close",
        normalizedPhone: "+9647700000001",
        adId: ad2.id,
        metaCreatedAt: new Date("2026-07-27T11:55:00Z"), // قريب جدًا من وقت الطلب
      },
    });

    const order = await createOrder(TEST_WORKSPACE_ID, {
      normalizedPhone: "+9647700000001",
      orderDate: orderTime,
    });
    const decision = await computeAttributionForOrder(order, TEST_WORKSPACE_ID);
    expect(decision.matchStatus).toBe("PROBABLE");
    expect(decision.matchMethod).toBe("PHONE");
    expect(decision.adId).toBe(closeLead.adId);
    expect(decision.reason).toContain("ترجيح");
  });

  it("6) يطبّق MappingRule محفوظة مسبقًا عند تطابق اسم الإعلان/المصدر (وليس الهاتف)", async () => {
    const { ad } = await seedMetaTree(TEST_WORKSPACE_ID, "rule");
    await prisma.mappingRule.create({
      data: {
        workspaceId: TEST_WORKSPACE_ID,
        ruleType: "SOURCE_ALIAS",
        matchKey: "فيسبوك مباشر", // normalizeHeader("فيسبوك مباشر") - نص بسيط بلا تشكيل، يبقى كما هو
        adId: ad.id,
      },
    });
    const order = await createOrder(TEST_WORKSPACE_ID, { sourceRaw: "فيسبوك مباشر" });
    const decision = await computeAttributionForOrder(order, TEST_WORKSPACE_ID);
    expect(decision.matchStatus).toBe("PROBABLE");
    expect(decision.matchMethod).toBe("MAPPING_RULE");
    expect(decision.adId).toBe(ad.id);
  });

  it("7) غير مطابق تمامًا عند غياب أي دليل - لا يخمّن من التاريخ/المحافظة/الموظف", async () => {
    const order = await createOrder(TEST_WORKSPACE_ID, {
      governorate: "بغداد",
      employeeName: "أحمد",
      orderDate: new Date(),
    });
    const decision = await computeAttributionForOrder(order, TEST_WORKSPACE_ID);
    expect(decision.matchStatus).toBe("UNMATCHED");
    expect(decision.confidence).toBe(0);
    expect(decision.adId).toBeNull();
    expect(decision.campaignId).toBeNull();
  });
});

describe("تشغيل المطابقة (Idempotent) والحفاظ على القرارات اليدوية", () => {
  it("لا ينشئ سجلات مكررة عند تكرار التشغيل، ولا يعيد حساب طلب مطابق يدويًا", async () => {
    const { ad, campaign } = await seedMetaTree(TEST_WORKSPACE_ID, "idem");
    const order = await createOrder(TEST_WORKSPACE_ID, { adIdRaw: "ad_idem" });

    const first = await runAttributionForWorkspace(TEST_WORKSPACE_ID);
    expect(first.exact).toBe(1);

    const attributionsAfterFirst = await prisma.orderAttribution.findMany({ where: { orderId: order.id } });
    expect(attributionsAfterFirst.length).toBe(1);

    // نُحوّل الطلب يدويًا لحملة مختلفة، ثم نُعيد تشغيل المطابقة التلقائية - يجب ألا تُغيَّر
    await prisma.orderAttribution.update({
      where: { orderId: order.id },
      data: { matchStatus: "MANUAL", matchMethod: "MANUAL", campaignId: campaign.id, adId: null, confidence: 1 },
    });

    const second = await runAttributionForWorkspace(TEST_WORKSPACE_ID);
    expect(second.manual).toBeGreaterThanOrEqual(1);

    const attributionsAfterSecond = await prisma.orderAttribution.findMany({ where: { orderId: order.id } });
    expect(attributionsAfterSecond.length).toBe(1); // لا تكرار
    expect(attributionsAfterSecond[0].matchStatus).toBe("MANUAL"); // لم تُستبدَل
    expect(attributionsAfterSecond[0].adId).toBeNull();

    // تشغيل ثالث متطابق - نفس النتيجة تمامًا، بلا أي تكرار
    await runAttributionForWorkspace(TEST_WORKSPACE_ID);
    const attributionsAfterThird = await prisma.orderAttribution.findMany({ where: { orderId: order.id } });
    expect(attributionsAfterThird.length).toBe(1);
  });

  it("dryRun لا يكتب أي شيء في قاعدة البيانات", async () => {
    await seedMetaTree(TEST_WORKSPACE_ID, "dry");
    const order = await createOrder(TEST_WORKSPACE_ID, { adIdRaw: "ad_dry" });

    const summary = await runAttributionForWorkspace(TEST_WORKSPACE_ID, { dryRun: true });
    expect(summary.exact).toBe(1);

    const attribution = await prisma.orderAttribution.findUnique({ where: { orderId: order.id } });
    expect(attribution).toBeNull();
  });
});

describe("المطابقة اليدوية عبر API + إنشاء MappingRule بشرط وجود قيمة مصدر واضحة", () => {
  it("ينشئ OrderAttribution بحالة MANUAL ويحفظ MappingRule عند وجود اسم إعلان على الطلب", async () => {
    const { ad, campaign } = await seedMetaTree(TEST_WORKSPACE_ID, "manual1");
    const order = await createOrder(TEST_WORKSPACE_ID, { adNameRaw: "حملة تجريبية يدوية غير معروفة" });

    const app = buildApp();
    const token = signUserToken("user-manual", "manual@example.com", TEST_WORKSPACE_ID);

    const res = await request(app)
      .post(`/api/attribution/orders/${order.id}/manual`)
      .set("Authorization", `Bearer ${token}`)
      .send({ campaignId: campaign.id, adId: ad.id });
    expect(res.status).toBe(200);
    expect(res.body.rulesCreated).toBe(1);

    const attribution = await prisma.orderAttribution.findUnique({ where: { orderId: order.id } });
    expect(attribution?.matchStatus).toBe("MANUAL");
    expect(attribution?.matchedBy).toBe("user-manual");

    const rule = await prisma.mappingRule.findFirst({ where: { workspaceId: TEST_WORKSPACE_ID, ruleType: "AD_NAME_ALIAS" } });
    expect(rule?.adId).toBe(ad.id);
  });

  it("لا ينشئ أي MappingRule عندما لا توجد قيمة مصدر واضحة (طلب بالهاتف فقط)", async () => {
    const { ad, campaign } = await seedMetaTree(TEST_WORKSPACE_ID, "manual2");
    const order = await createOrder(TEST_WORKSPACE_ID, { normalizedPhone: "+9647711112222" });

    const app = buildApp();
    const token = signUserToken("user-manual2", "manual2@example.com", TEST_WORKSPACE_ID);

    const res = await request(app)
      .post(`/api/attribution/orders/${order.id}/manual`)
      .set("Authorization", `Bearer ${token}`)
      .send({ campaignId: campaign.id, adId: ad.id });
    expect(res.status).toBe(200);
    expect(res.body.rulesCreated).toBe(0);

    const rulesCount = await prisma.mappingRule.count({ where: { workspaceId: TEST_WORKSPACE_ID } });
    expect(rulesCount).toBe(0);
  });

  it("القاعدة المحفوظة تُطبَّق تلقائيًا على طلب لاحق بنفس اسم الإعلان الخام", async () => {
    const { ad, campaign } = await seedMetaTree(TEST_WORKSPACE_ID, "manual3");
    const firstOrder = await createOrder(TEST_WORKSPACE_ID, { adNameRaw: "اسم غريب غير متطابق" });

    const app = buildApp();
    const token = signUserToken("user-manual3", "manual3@example.com", TEST_WORKSPACE_ID);
    await request(app)
      .post(`/api/attribution/orders/${firstOrder.id}/manual`)
      .set("Authorization", `Bearer ${token}`)
      .send({ campaignId: campaign.id, adId: ad.id });

    const secondOrder = await createOrder(TEST_WORKSPACE_ID, { adNameRaw: "اسم غريب غير متطابق" });
    const decision = await computeAttributionForOrder(secondOrder, TEST_WORKSPACE_ID);
    expect(decision.matchStatus).toBe("PROBABLE");
    expect(decision.matchMethod).toBe("MAPPING_RULE");
    expect(decision.adId).toBe(ad.id);
  });
});

describe("عزل المطابقة بين الـWorkspaces", () => {
  it("لا يستطيع Workspace B مطابقة طلب يدويًا يخص Workspace A، ولا رؤية ملخصه", async () => {
    await seedWorkspaceB();
    const { ad, campaign } = await seedMetaTree(TEST_WORKSPACE_ID, "isoA");
    const orderA = await createOrder(TEST_WORKSPACE_ID, { adIdRaw: "ad_isoA" });

    const app = buildApp();
    const tokenB = signUserToken("user-iso-b", "iso-b@example.com", WORKSPACE_B_ID);

    const manualRes = await request(app)
      .post(`/api/attribution/orders/${orderA.id}/manual`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ campaignId: campaign.id, adId: ad.id });
    expect(manualRes.status).toBe(404);

    await runAttributionForWorkspace(TEST_WORKSPACE_ID);

    const summaryB = await request(app).get("/api/attribution/summary").set("Authorization", `Bearer ${tokenB}`);
    expect(summaryB.body.total).toBe(0);

    const ordersB = await request(app).get("/api/attribution/orders").set("Authorization", `Bearer ${tokenB}`);
    expect(ordersB.body.orders.length).toBe(0);
  });
});
