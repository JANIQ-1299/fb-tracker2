import { describe, it, expect } from "vitest";
import request from "supertest";

const { buildApp } = await import("../src/app.js");
const { prisma } = await import("../src/lib/prisma.js");
const { encryptToken } = await import("../src/lib/crypto.js");
const { TEST_WORKSPACE_ID } = await import("./setup.js");

const INTERNAL_SECRET = "test_app_secret"; // يطابق META_APP_SECRET في .env.test

async function seedMetaConnection(fbUserId: string) {
  const token = encryptToken("real-token-value");
  return prisma.metaConnection.create({
    data: {
      workspaceId: TEST_WORKSPACE_ID,
      metaUserId: fbUserId,
      accessTokenEncrypted: token.ciphertext,
      tokenIv: token.iv,
      tokenTag: token.tag,
      status: "CONNECTED",
    },
  });
}

describe("POST /api/facebook/deauthorize", () => {
  it("يرفض الطلب بلا ترويسة x-internal-secret صحيحة", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/facebook/deauthorize").send({ fbUserId: "fb_1" });
    expect(res.status).toBe(401);
  });

  it("يرفض ترويسة خاطئة", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/facebook/deauthorize")
      .set("x-internal-secret", "wrong_secret")
      .send({ fbUserId: "fb_1" });
    expect(res.status).toBe(401);
  });

  it("يُبطل MetaConnection المطابق ويُصفّر التوكن المشفَّر", async () => {
    const app = buildApp();
    const connection = await seedMetaConnection("fb_deauth_1");

    const res = await request(app)
      .post("/api/facebook/deauthorize")
      .set("x-internal-secret", INTERNAL_SECRET)
      .send({ fbUserId: "fb_deauth_1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, revokedCount: 1 });

    const updated = await prisma.metaConnection.findUnique({ where: { id: connection.id } });
    expect(updated?.status).toBe("REVOKED");
    expect(updated?.accessTokenEncrypted).not.toBe(connection.accessTokenEncrypted);
  });

  it("لا ينهار عند عدم وجود أي MetaConnection مطابق - يُعيد revokedCount صفر", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/facebook/deauthorize")
      .set("x-internal-secret", INTERNAL_SECRET)
      .send({ fbUserId: "fb_not_found" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, revokedCount: 0 });
  });

  it("يرفض طلبًا بلا fbUserId", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/facebook/deauthorize")
      .set("x-internal-secret", INTERNAL_SECRET)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/facebook/data-deletion", () => {
  it("يرفض الطلب بلا ترويسة صحيحة", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/facebook/data-deletion").send({ fbUserId: "fb_1" });
    expect(res.status).toBe(401);
  });

  it("يُبطل الاتصال، وينشئ رمز تأكيد فريدًا، ويُسجّل الطلب", async () => {
    const app = buildApp();
    await seedMetaConnection("fb_del_1");

    const res = await request(app)
      .post("/api/facebook/data-deletion")
      .set("x-internal-secret", INTERNAL_SECRET)
      .send({ fbUserId: "fb_del_1" });

    expect(res.status).toBe(200);
    expect(typeof res.body.confirmationCode).toBe("string");
    expect(res.body.confirmationCode.length).toBeGreaterThanOrEqual(16);

    const updated = await prisma.metaConnection.findFirst({ where: { metaUserId: "fb_del_1" } });
    expect(updated?.status).toBe("REVOKED");

    const log = await prisma.syncLog.findFirst({ where: { source: "meta_data_deletion_request" } });
    expect(log).toBeTruthy();
    expect(log?.details).toContain(res.body.confirmationCode);
  });

  it("يُنشئ رموز تأكيد مختلفة لكل طلب", async () => {
    const app = buildApp();
    const res1 = await request(app)
      .post("/api/facebook/data-deletion")
      .set("x-internal-secret", INTERNAL_SECRET)
      .send({ fbUserId: "fb_del_a" });
    const res2 = await request(app)
      .post("/api/facebook/data-deletion")
      .set("x-internal-secret", INTERNAL_SECRET)
      .send({ fbUserId: "fb_del_b" });

    expect(res1.body.confirmationCode).not.toBe(res2.body.confirmationCode);
  });
});

describe("GET /api/facebook/data-deletion-status", () => {
  it("يُعيد found:false لرمز غير موجود", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/facebook/data-deletion-status").query({ code: "nonexistent" });
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(false);
  });

  it("يُعيد found:true لرمز حقيقي بعد طلب حذف، دون كشف أي بيانات شخصية", async () => {
    const app = buildApp();
    const createRes = await request(app)
      .post("/api/facebook/data-deletion")
      .set("x-internal-secret", INTERNAL_SECRET)
      .send({ fbUserId: "fb_status_check" });
    const code = createRes.body.confirmationCode;

    const statusRes = await request(app).get("/api/facebook/data-deletion-status").query({ code });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.found).toBe(true);
    expect(JSON.stringify(statusRes.body)).not.toContain("fb_status_check");
  });

  it("يرفض طلبًا بلا code", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/facebook/data-deletion-status");
    expect(res.status).toBe(400);
  });
});
