import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifySignedRequest } from "../lib/facebookSignedRequest";

const APP_SECRET = "test_facebook_app_secret";

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildSignedRequest(payload: Record<string, unknown>, secret = APP_SECRET): string {
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac("sha256", secret).update(encodedPayload).digest();
  return `${base64UrlEncode(sig)}.${encodedPayload}`;
}

describe("verifySignedRequest", () => {
  it("يتحقق من توقيع صالح ويستخرج user_id", () => {
    const signed = buildSignedRequest({ user_id: "1234567890", algorithm: "HMAC-SHA256" });
    const result = verifySignedRequest(signed, APP_SECRET);
    expect(result?.userId).toBe("1234567890");
  });

  it("يرفض توقيعًا موقَّعًا بسرّ خاطئ", () => {
    const signed = buildSignedRequest({ user_id: "123" }, "wrong_secret");
    expect(verifySignedRequest(signed, APP_SECRET)).toBeNull();
  });

  it("يرفض توقيعًا تم التلاعب بحمولته بعد التوقيع", () => {
    const signed = buildSignedRequest({ user_id: "123" });
    const [sig, payload] = signed.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ user_id: "999" }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifySignedRequest(`${sig}.${tamperedPayload}`, APP_SECRET)).toBeNull();
  });

  it("يرفض نصًا لا يحتوي نقطة فاصلة بين التوقيع والحمولة", () => {
    expect(verifySignedRequest("not-a-valid-signed-request", APP_SECRET)).toBeNull();
  });

  it("يرفض حمولة بلا user_id", () => {
    const signed = buildSignedRequest({ algorithm: "HMAC-SHA256" });
    expect(verifySignedRequest(signed, APP_SECRET)).toBeNull();
  });

  it("يرفض عند عدم توفر App Secret", () => {
    const signed = buildSignedRequest({ user_id: "123" });
    expect(verifySignedRequest(signed, "")).toBeNull();
  });

  it("يرفض base64 غير صالح في جزء التوقيع", () => {
    expect(verifySignedRequest("###invalid###.eyJ1c2VyX2lkIjoiMSJ9", APP_SECRET)).toBeNull();
  });
});
