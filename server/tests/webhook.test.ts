import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import request from "supertest";

const metaGetMock = vi.fn();
vi.mock("../src/lib/meta.js", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/meta.js")>("../src/lib/meta.js");
  return {
    ...actual,
    metaGet: (...args: any[]) => metaGetMock(...args),
  };
});

const { buildApp } = await import("../src/app.js");
const { prisma } = await import("../src/lib/prisma.js");

const APP_SECRET = "test_app_secret";
const VERIFY_TOKEN = "test_verify_token";

function sign(rawBody: string) {
  return "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");
}

function leadgenPayload(leadgenId: string, pageId = "1126970097176252") {
  return {
    object: "page",
    entry: [
      {
        id: pageId,
        changes: [{ field: "leadgen", value: { leadgen_id: leadgenId, page_id: pageId, form_id: "form_1" } }],
      },
    ],
  };
}

beforeEach(() => {
  metaGetMock.mockReset();
  metaGetMock.mockResolvedValue({
    id: "leadgen_x",
    created_time: "2026-07-20T10:00:00+0000",
    field_data: [{ name: "full_name", values: ["مستخدم تجريبي"] }],
  });
});

describe("GET /webhook/meta/leads - Webhook Verification", () => {
  it("ينجح مع verify_token صحيح ويعيد challenge", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/webhook/meta/leads")
      .query({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "12345" });
    expect(res.status).toBe(200);
    expect(res.text).toBe("12345");
  });

  it("يرفض verify_token خاطئ", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/webhook/meta/leads")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345" });
    expect(res.status).toBe(403);
  });
});

describe("POST /webhook/meta/leads - استقبال Lead والتحقق من التوقيع", () => {
  it("يرفض طلبًا بدون توقيع صالح", async () => {
    const app = buildApp();
    const body = JSON.stringify(leadgenPayload("leadgen_bad_sig"));
    const res = await request(app)
      .post("/webhook/meta/leads")
      .set("Content-Type", "application/json")
      .set("x-hub-signature-256", "sha256=invalid")
      .send(body);
    expect(res.status).toBe(401);
  });

  it("يستقبل Lead جديدًا ويخزّنه مع توقيع صالح", async () => {
    const app = buildApp();
    const body = JSON.stringify(leadgenPayload("leadgen_new_1"));
    const res = await request(app)
      .post("/webhook/meta/leads")
      .set("Content-Type", "application/json")
      .set("x-hub-signature-256", sign(body))
      .send(body);
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 100)); // المعالجة تتم بشكل غير متزامن بعد الرد
    const lead = await prisma.lead.findFirst({ where: { metaLeadId: "leadgen_new_1" } });
    expect(lead).toBeTruthy();
    expect(lead?.name).toBe("مستخدم تجريبي");

    const event = await prisma.webhookEvent.findFirst({ where: { eventType: "leadgen" } });
    expect(event?.status).toBe("PROCESSED");
  });

  it("لا يكرّر تخزين نفس leadgen_id عند وصول نفس الحدث مرتين (Idempotency)", async () => {
    const app = buildApp();
    const body = JSON.stringify(leadgenPayload("leadgen_dup_1"));
    const headers = { "x-hub-signature-256": sign(body) };

    await request(app).post("/webhook/meta/leads").set("Content-Type", "application/json").set(headers).send(body);
    await new Promise((r) => setTimeout(r, 100));
    await request(app).post("/webhook/meta/leads").set("Content-Type", "application/json").set(headers).send(body);
    await new Promise((r) => setTimeout(r, 100));

    const leads = await prisma.lead.findMany({ where: { metaLeadId: "leadgen_dup_1" } });
    expect(leads.length).toBe(1);
    const events = await prisma.webhookEvent.findMany({ where: { eventType: "leadgen" } });
    expect(events.length).toBe(1);
    expect(metaGetMock).toHaveBeenCalledTimes(1);
  });
});
