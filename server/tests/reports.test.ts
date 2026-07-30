import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

const { buildApp } = await import("../src/app.js");
const { prisma } = await import("../src/lib/prisma.js");
const { TEST_WORKSPACE_ID } = await import("./setup.js");

async function loginAndGetToken(app: any) {
  await prisma.adminUser.create({
    data: { email: "reports@example.com", passwordHash: await bcrypt.hash("Passw0rd!", 10) },
  });
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "reports@example.com", password: "Passw0rd!" });
  return res.body.token as string;
}

async function seedAdWithLeadsAndSpend() {
  const adAccount = await prisma.adAccount.create({
    data: { workspaceId: TEST_WORKSPACE_ID, metaAdAccountId: "acc1", name: "acc1" },
  });
  const campaign = await prisma.campaign.create({
    data: { workspaceId: TEST_WORKSPACE_ID, metaCampaignId: "c1", name: "حملة 1", adAccountId: adAccount.id },
  });
  const adSet = await prisma.adSet.create({
    data: { workspaceId: TEST_WORKSPACE_ID, metaAdSetId: "as1", name: "مجموعة 1", campaignId: campaign.id },
  });
  const ad = await prisma.ad.create({
    data: { workspaceId: TEST_WORKSPACE_ID, metaAdId: "ad1", name: "إعلان 1", adSetId: adSet.id },
  });

  // 4 عملاء محتملين، عميلان أصبحا "تم تقديم الطلب"
  for (let i = 0; i < 4; i++) {
    await prisma.lead.create({
      data: {
        workspaceId: TEST_WORKSPACE_ID,
        metaLeadId: `lead-report-${i}`,
        adId: ad.id,
        campaignId: campaign.id,
        adSetId: adSet.id,
        status: i < 2 ? "تم تقديم الطلب" : "جديد",
        orderValue: i < 2 ? 20000 : null,
      },
    });
  }

  // إنفاق 40000 (سيُقسم على 4 عملاء = CPL=10000, وعلى طلبين = CPA=20000)
  await prisma.insightSnapshot.create({
    data: { date: new Date(), level: "ad", adId: ad.id, spend: 40000, impressions: 1000, reach: 900, clicks: 50, leadsCount: 4 },
  });

  return { ad, campaign };
}

describe("تقارير الإعلانات - Conversion Rate و Cost per Order", () => {
  it("يحسب نسبة التحويل وCPL وCPA بشكل صحيح", async () => {
    const app = buildApp();
    const token = await loginAndGetToken(app);
    await seedAdWithLeadsAndSpend();

    const res = await request(app).get("/api/reports/ads").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const row = res.body[0];
    expect(row.leadsCount).toBe(4);
    expect(row.ordersCount).toBe(2);
    expect(row.conversionRate).toBe(50); // 2/4 = 50%
    expect(row.cpl).toBe(10000); // 40000 / 4
    expect(row.cpa).toBe(20000); // 40000 / 2
    expect(row.orderValue).toBe(40000); // 20000 * 2
  });

  it("ملخص الصفحة الرئيسية يحسب إجمالي الطلبات ونسبة التحويل", async () => {
    const app = buildApp();
    const token = await loginAndGetToken(app);
    await seedAdWithLeadsAndSpend();

    const res = await request(app).get("/api/reports/summary").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalLeads).toBe(4);
    expect(res.body.ordersCount).toBe(2);
    expect(res.body.conversionRate).toBe(50);
  });
});
