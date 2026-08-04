import { describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import * as XLSX from "xlsx";

const { buildApp } = await import("../src/app.js");
const { prisma } = await import("../src/lib/prisma.js");
const { env } = await import("../src/lib/env.js");
const { getMatchTier } = await import("../src/services/matchTier.js");
const { buildAttributionDashboard } = await import("../src/services/attributionDashboard.js");
const { buildAttributionWorkbook } = await import("../src/services/attributionExport.js");
const { runAttributionForWorkspace } = await import("../src/services/attributionEngine.js");
const { TEST_WORKSPACE_ID } = await import("./setup.js");

const WORKSPACE_B_ID = "test-workspace-export-b";

function signUserToken(userId: string, email: string, workspaceId: string, role = "OWNER") {
  return jwt.sign({ typ: "user", id: userId, email, workspaceId, role }, env.jwtSecret, { expiresIn: "1h" });
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
  const creative = await prisma.creative.create({
    data: { workspaceId, metaCreativeId: `cre_${suffix}`, videoId: `vid_${suffix}`, sourceType: "VIDEO" },
  });
  const ad = await prisma.ad.create({
    data: { workspaceId, metaAdId: `ad_${suffix}`, name: `إعلان ${suffix}`, adSetId: adSet.id, creativeId: creative.id },
  });
  return { adAccount, campaign, adSet, ad, creative };
}

async function createOrder(workspaceId: string, overrides: Record<string, any> = {}) {
  const importedFile = await prisma.importedFile.create({
    data: { workspaceId, filename: "test.xlsx", uploadedBy: "tester" },
  });
  return prisma.order.create({
    data: { workspaceId, importedFileId: importedFile.id, ...overrides },
  });
}

describe("getMatchTier - حدود التصنيف الرباعي", () => {
  it("EXACT دائمًا مؤكد", () => {
    expect(getMatchTier("EXACT", 1).key).toBe("CONFIRMED");
  });
  it("MANUAL بثقة 0.9 فأعلى مؤكد، وأقل من ذلك قوي", () => {
    expect(getMatchTier("MANUAL", 0.9).key).toBe("CONFIRMED");
    expect(getMatchTier("MANUAL", 0.89).key).toBe("STRONG");
  });
  it("PROBABLE بثقة 0.6 فأعلى قوي، وأقل من ذلك تقريبي", () => {
    expect(getMatchTier("PROBABLE", 0.6).key).toBe("STRONG");
    expect(getMatchTier("PROBABLE", 0.59).key).toBe("APPROXIMATE");
  });
  it("UNMATCHED غير معروف، وNEEDS_REVIEW يحتاج مراجعة", () => {
    expect(getMatchTier("UNMATCHED", 0).key).toBe("UNKNOWN");
    expect(getMatchTier("NEEDS_REVIEW", 0).key).toBe("NEEDS_REVIEW");
  });
});

describe("GET /api/attribution/export - تصدير Excel", () => {
  it("المسار يرد 200 برأس Content-Type/Content-Disposition صحيح", async () => {
    const app = buildApp();
    const token = signUserToken("user-exp-http", "exp-http@example.com", TEST_WORKSPACE_ID);
    const res = await request(app).get("/api/attribution/export").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain("attachment");
  });

  it("buildAttributionWorkbook يُنتج ملفًا صالحًا بورقتين وبيانات صحيحة (تحقّق مباشر عبر إعادة القراءة بـ XLSX)", async () => {
    await seedMetaTree(TEST_WORKSPACE_ID, "exp");
    await createOrder(TEST_WORKSPACE_ID, { adIdRaw: "ad_exp", price: 25000, customerName: "زبون تجريبي" });
    await runAttributionForWorkspace(TEST_WORKSPACE_ID);

    const buffer = await buildAttributionWorkbook(TEST_WORKSPACE_ID);
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = XLSX.read(buffer, { type: "buffer" });
    expect(workbook.SheetNames).toContain("تفاصيل الطلبات");
    expect(workbook.SheetNames).toContain("ملخص Dashboard");

    const detailSheet = XLSX.utils.sheet_to_json(workbook.Sheets["تفاصيل الطلبات"], { header: 1 }) as unknown[][];
    expect(detailSheet.length).toBe(2); // عنوان + صف واحد
    expect(detailSheet[1]).toContain("زبون تجريبي");
  });
});

describe("GET /api/attribution/dashboard - تجميع حسب الفيديو/الإعلان", () => {
  it("يحسب عدد الطلبات والإيراد لكل فيديو، وcostPerOrder يكون null بلا بيانات صرف", async () => {
    const { ad } = await seedMetaTree(TEST_WORKSPACE_ID, "dash");
    await createOrder(TEST_WORKSPACE_ID, { adIdRaw: "ad_dash", price: 10000 });
    await createOrder(TEST_WORKSPACE_ID, { adIdRaw: "ad_dash", price: 15000 });
    await runAttributionForWorkspace(TEST_WORKSPACE_ID);

    const dashboard = await buildAttributionDashboard(TEST_WORKSPACE_ID);
    const row = dashboard.byVideo.find((r) => r.videoId === "vid_dash");
    expect(row).toBeTruthy();
    expect(row!.orderCount).toBe(2);
    expect(row!.revenue).toBe(25000);
    expect(row!.costPerOrder).toBeNull();
  });

  it("يحسب تكلفة الطلب عند توفر InsightSnapshot، ولا يُنتج NaN/Infinity", async () => {
    const { ad } = await seedMetaTree(TEST_WORKSPACE_ID, "cost");
    await prisma.insightSnapshot.create({
      data: { date: new Date(), level: "ad", adId: ad.id, spend: 50000 },
    });
    await createOrder(TEST_WORKSPACE_ID, { adIdRaw: "ad_cost", price: 10000 });
    await createOrder(TEST_WORKSPACE_ID, { adIdRaw: "ad_cost", price: 10000 });
    await runAttributionForWorkspace(TEST_WORKSPACE_ID);

    const dashboard = await buildAttributionDashboard(TEST_WORKSPACE_ID);
    const row = dashboard.byAd.find((r) => r.adId === ad.id);
    expect(row!.spend).toBe(50000);
    expect(row!.costPerOrder).toBe(25000);
    expect(Number.isFinite(row!.costPerOrder!)).toBe(true);
  });
});

describe("عزل التصدير/اللوحة بين الـWorkspaces", () => {
  it("تصدير Workspace B لا يتضمن أي طلب من Workspace A", async () => {
    await prisma.workspace.create({ data: { id: WORKSPACE_B_ID, name: "Workspace B" } });
    await prisma.workspaceSubscription.create({ data: { workspaceId: WORKSPACE_B_ID, status: "ACTIVE" } });

    await seedMetaTree(TEST_WORKSPACE_ID, "isoExp");
    await createOrder(TEST_WORKSPACE_ID, { adIdRaw: "ad_isoExp", customerName: "زبون أ" });
    await runAttributionForWorkspace(TEST_WORKSPACE_ID);

    const bufferB = await buildAttributionWorkbook(WORKSPACE_B_ID);
    const workbook = XLSX.read(bufferB, { type: "buffer" });
    const detailSheet = XLSX.utils.sheet_to_json(workbook.Sheets["تفاصيل الطلبات"], { header: 1 }) as unknown[][];
    expect(detailSheet.length).toBe(1); // عنوان فقط، بلا صفوف

    const app = buildApp();
    const tokenB = signUserToken("user-iso-exp-b", "iso-exp-b@example.com", WORKSPACE_B_ID);
    const dashboardRes = await request(app).get("/api/attribution/dashboard").set("Authorization", `Bearer ${tokenB}`);
    expect(dashboardRes.body.byAd.length).toBe(0);
  });
});
