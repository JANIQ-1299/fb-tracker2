import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const metaGetMock = vi.fn();
vi.mock("../src/lib/meta.js", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/meta.js")>("../src/lib/meta.js");
  return { ...actual, metaGet: (...args: any[]) => metaGetMock(...args) };
});

const { buildApp } = await import("../src/app.js");
const { prisma } = await import("../src/lib/prisma.js");
const { env } = await import("../src/lib/env.js");
const { encryptToken } = await import("../src/lib/crypto.js");
const { TEST_WORKSPACE_ID } = await import("./setup.js");

const WORKSPACE_B_ID = "test-workspace-2";

const ALLOWED_PAGES = [{ id: "page_allowed_1", name: "صفحة مسموحة 1" }];
const ALLOWED_AD_ACCOUNTS = [{ account_id: "acc_allowed_1", name: "حساب مسموح 1", currency: "USD" }];
const ALLOWED_PAGES_2 = [
  { id: "page_allowed_1", name: "صفحة مسموحة 1" },
  { id: "page_allowed_2", name: "صفحة مسموحة 2" },
];

function mockGraphAssets(pages = ALLOWED_PAGES, adAccounts = ALLOWED_AD_ACCOUNTS) {
  metaGetMock.mockImplementation(async (path: string) => {
    if (path === "me/accounts") return { data: pages };
    if (path === "me/adaccounts") return { data: adAccounts };
    if (path === "me") return { id: "fb_user_1", name: "Test FB User" };
    return { data: [] };
  });
}

function signUserToken(userId: string, email: string, workspaceId: string, role = "OWNER") {
  return jwt.sign({ typ: "user", id: userId, email, workspaceId, role }, env.jwtSecret, { expiresIn: "1h" });
}

async function seedWorkspaceB() {
  await prisma.workspace.create({ data: { id: WORKSPACE_B_ID, name: "Workspace B" } });
  await prisma.workspaceSubscription.create({ data: { workspaceId: WORKSPACE_B_ID, status: "ACTIVE" } });
}

async function createConnection(workspaceId: string, metaUserId: string) {
  const encrypted = encryptToken(`fake-long-lived-token-for-${metaUserId}`);
  return prisma.metaConnection.create({
    data: {
      workspaceId,
      metaUserId,
      accessTokenEncrypted: encrypted.ciphertext,
      tokenIv: encrypted.iv,
      tokenTag: encrypted.tag,
      status: "CONNECTED",
    },
  });
}

beforeEach(() => {
  metaGetMock.mockReset();
  mockGraphAssets();
});

describe("عزل اتصالات Meta بين الـWorkspaces", () => {
  it("لا يرى Workspace B اتصالات Workspace A في GET /api/meta/connections", async () => {
    await seedWorkspaceB();
    await createConnection(TEST_WORKSPACE_ID, "fb_user_a");
    const app = buildApp();
    const tokenB = signUserToken("user-b", "b@example.com", WORKSPACE_B_ID);

    const res = await request(app).get("/api/meta/connections").set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    expect(res.body.connections).toEqual([]);
  });

  it("لا تحتوي استجابة GET /api/meta/connections أي حقل توكن", async () => {
    await createConnection(TEST_WORKSPACE_ID, "fb_user_a");
    const app = buildApp();
    const tokenA = signUserToken("user-a", "a@example.com", TEST_WORKSPACE_ID);

    const res = await request(app).get("/api/meta/connections").set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("accessTokenEncrypted");
    expect(raw).not.toContain("tokenIv");
    expect(raw).not.toContain("tokenTag");
  });

  it("يرفض Workspace B الوصول لأصول اتصال يخص Workspace A بـ404", async () => {
    await seedWorkspaceB();
    const connA = await createConnection(TEST_WORKSPACE_ID, "fb_user_a");
    const app = buildApp();
    const tokenB = signUserToken("user-b", "b@example.com", WORKSPACE_B_ID);

    const res = await request(app)
      .get(`/api/meta/connections/${connA.id}/assets`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it("يرفض Workspace B اختيار صفحة على اتصال يخص Workspace A بـ404", async () => {
    await seedWorkspaceB();
    const connA = await createConnection(TEST_WORKSPACE_ID, "fb_user_a");
    const app = buildApp();
    const tokenB = signUserToken("user-b", "b@example.com", WORKSPACE_B_ID);

    const res = await request(app)
      .post(`/api/meta/connections/${connA.id}/select`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ pageId: "page_allowed_1" });
    expect(res.status).toBe(404);
  });
});

describe("منع اختيار صفحة/حساب إعلاني بدون صلاحية فعلية عليه", () => {
  it("يرفض اختيار صفحة غير موجودة في قائمة Graph API الفعلية", async () => {
    const conn = await createConnection(TEST_WORKSPACE_ID, "fb_user_a");
    const app = buildApp();
    const tokenA = signUserToken("user-a", "a@example.com", TEST_WORKSPACE_ID);

    const res = await request(app)
      .post(`/api/meta/connections/${conn.id}/select`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ pageId: "page_NOT_permitted" });
    expect(res.status).toBe(403);

    const pages = await prisma.page.findMany({ where: { workspaceId: TEST_WORKSPACE_ID } });
    expect(pages.length).toBe(0);
  });

  it("يقبل اختيار صفحة موجودة فعليًا في قائمة Graph API", async () => {
    const conn = await createConnection(TEST_WORKSPACE_ID, "fb_user_a");
    const app = buildApp();
    const tokenA = signUserToken("user-a", "a@example.com", TEST_WORKSPACE_ID);

    const res = await request(app)
      .post(`/api/meta/connections/${conn.id}/select`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ pageId: "page_allowed_1" });
    expect(res.status).toBe(200);

    const page = await prisma.page.findUnique({
      where: { workspaceId_metaPageId: { workspaceId: TEST_WORKSPACE_ID, metaPageId: "page_allowed_1" } },
    });
    expect(page?.metaConnectionId).toBe(conn.id);
  });

  it("يرفض اختيار حساب إعلاني غير موجود في قائمة Graph API الفعلية", async () => {
    const conn = await createConnection(TEST_WORKSPACE_ID, "fb_user_a");
    const app = buildApp();
    const tokenA = signUserToken("user-a", "a@example.com", TEST_WORKSPACE_ID);

    const res = await request(app)
      .post(`/api/meta/connections/${conn.id}/select`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ adAccountId: "acc_NOT_permitted" });
    expect(res.status).toBe(403);
  });
});

describe("فرض حدود الاشتراك (maxPages/maxAdAccounts)", () => {
  it("يرفض إضافة صفحة ثانية عند بلوغ الحد الأقصى (maxPages الافتراضي = 1)", async () => {
    mockGraphAssets(ALLOWED_PAGES_2);
    const conn = await createConnection(TEST_WORKSPACE_ID, "fb_user_a");
    const app = buildApp();
    const tokenA = signUserToken("user-a", "a@example.com", TEST_WORKSPACE_ID);

    const first = await request(app)
      .post(`/api/meta/connections/${conn.id}/select`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ pageId: "page_allowed_1" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/meta/connections/${conn.id}/select`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ pageId: "page_allowed_2" });
    expect(second.status).toBe(403);
    expect(typeof second.body.error).toBe("string");
    expect(second.body.error.length).toBeGreaterThan(0);

    const pages = await prisma.page.findMany({ where: { workspaceId: TEST_WORKSPACE_ID } });
    expect(pages.length).toBe(1);
  });

  it("لا يُحتسب إعادة اختيار نفس الصفحة كإضافة جديدة (لا يتجاوز الحد)", async () => {
    const conn = await createConnection(TEST_WORKSPACE_ID, "fb_user_a");
    const app = buildApp();
    const tokenA = signUserToken("user-a", "a@example.com", TEST_WORKSPACE_ID);

    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post(`/api/meta/connections/${conn.id}/select`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ pageId: "page_allowed_1" });
      expect(res.status).toBe(200);
    }
    const pages = await prisma.page.findMany({ where: { workspaceId: TEST_WORKSPACE_ID } });
    expect(pages.length).toBe(1);
  });
});

describe("مزامنة Meta لا تثق بأي workspaceId من الطلب", () => {
  it("تتجاهل POST /api/meta/sync أي workspaceId في body وتعمل فقط على workspace الجلسة", async () => {
    await seedWorkspaceB();
    const app = buildApp();
    const tokenB = signUserToken("user-b", "b@example.com", WORKSPACE_B_ID);

    // Workspace B لا يملك أي AdAccount مربوط بعد، لذا يجب أن تُرجع المزامنة صفرًا دون أي خطأ،
    // بغض النظر عن workspaceId مزوَّر في body يشير لـWorkspace A.
    const res = await request(app)
      .post("/api/meta/sync")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ workspaceId: TEST_WORKSPACE_ID });
    expect(res.status).toBe(200);
    expect(res.body.adAccountsSynced).toBe(0);

    const campaignsForA = await prisma.campaign.findMany({ where: { workspaceId: TEST_WORKSPACE_ID } });
    expect(campaignsForA.length).toBe(0);
  });
});
