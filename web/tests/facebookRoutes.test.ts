import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";

const APP_SECRET = "test_facebook_app_secret";
process.env.FACEBOOK_APP_SECRET = APP_SECRET;
process.env.NEXT_PUBLIC_API_BASE_URL = "http://internal-server.test";

// يجب استيراد المسارات بعد ضبط متغيرات البيئة أعلاه لأن facebookServerApi.ts يقرأها عند التحميل
const deauthorizeRoute = await import("../app/facebook/deauthorize/route");
const dataDeletionRoute = await import("../app/facebook/data-deletion/route");

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildSignedRequest(payload: Record<string, unknown>, secret = APP_SECRET): string {
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac("sha256", secret).update(encodedPayload).digest();
  return `${base64UrlEncode(sig)}.${encodedPayload}`;
}

function formPostRequest(url: string, signedRequest: string): Request {
  const body = new URLSearchParams({ signed_request: signedRequest });
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, confirmationCode: "abc123" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /facebook/deauthorize", () => {
  it("يعرض صفحة عربية بلا الحاجة لتوقيع", async () => {
    const res = await deauthorizeRoute.GET();
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("إلغاء ربط حساب فيسبوك");
  });
});

describe("POST /facebook/deauthorize", () => {
  it("يرفض 400 عند غياب signed_request", async () => {
    const req = new Request("http://test/facebook/deauthorize", { method: "POST" });
    const res = await deauthorizeRoute.POST(req);
    expect(res.status).toBe(400);
  });

  it("يرفض 401 عند توقيع غير صالح", async () => {
    const req = formPostRequest("http://test/facebook/deauthorize", buildSignedRequest({ user_id: "1" }, "wrong"));
    const res = await deauthorizeRoute.POST(req);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("يقبل 200 عند توقيع صالح ويستدعي الخادم الداخلي بمعرّف المستخدم فقط", async () => {
    const req = formPostRequest("http://test/facebook/deauthorize", buildSignedRequest({ user_id: "fb_42" }));
    const res = await deauthorizeRoute.POST(req);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://internal-server.test/api/facebook/deauthorize");
    expect(JSON.parse(options.body)).toEqual({ fbUserId: "fb_42" });
    expect(options.headers["x-internal-secret"]).toBe(APP_SECRET);
  });
});

describe("GET /facebook/data-deletion", () => {
  it("يعرض صفحة عربية توضّح البيانات المحذوفة", async () => {
    const res = await dataDeletionRoute.GET();
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("حذف بيانات حساب فيسبوك");
  });
});

describe("POST /facebook/data-deletion", () => {
  it("يرفض 400 عند غياب signed_request", async () => {
    const req = new Request("http://test/facebook/data-deletion", { method: "POST" });
    const res = await dataDeletionRoute.POST(req);
    expect(res.status).toBe(400);
  });

  it("يرفض 401 عند توقيع غير صالح", async () => {
    const req = formPostRequest("http://test/facebook/data-deletion", buildSignedRequest({ user_id: "1" }, "wrong"));
    const res = await dataDeletionRoute.POST(req);
    expect(res.status).toBe(401);
  });

  it("يُعيد url وconfirmation_code بصيغة Meta المطلوبة عند نجاح التحقق", async () => {
    const req = formPostRequest(
      "https://nadhara-web.onrender.com/facebook/data-deletion",
      buildSignedRequest({ user_id: "fb_99" }),
    );
    const res = await dataDeletionRoute.POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.confirmation_code).toBe("abc123");
    expect(json.url).toBe("https://nadhara-web.onrender.com/facebook/data-deletion/status?code=abc123");
  });

  it("يُعيد 500 إن فشل الخادم الداخلي في إنشاء رمز التأكيد", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 500 }));
    const req = formPostRequest("http://test/facebook/data-deletion", buildSignedRequest({ user_id: "fb_fail" }));
    const res = await dataDeletionRoute.POST(req);
    expect(res.status).toBe(500);
  });
});
