import crypto from "node:crypto";

// تحقّق ذاتي من signed_request (نمط Deauthorize/Data Deletion Callback من Meta) - نفس منطق
// HMAC-SHA256 المستخدم في server/src/lib/meta.ts::verifyWebhookSignature، لكن مطبَّق هنا مباشرة
// داخل تطبيق الويب لأن هذين المسارين يجب أن يكونا على نطاق nadhara-web (وليس نطاق الـAPI).

export interface VerifiedSignedRequest {
  userId: string;
  payload: Record<string, unknown>;
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** يُعيد null عند أي فشل تحقّق (توقيع غير صالح، تنسيق غير متوقَّع، user_id مفقود) - لا يرمي أبدًا. */
export function verifySignedRequest(signedRequest: string, appSecret: string): VerifiedSignedRequest | null {
  if (!appSecret) return null;
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;
  const [encodedSig, encodedPayload] = parts;

  let providedSig: Buffer;
  try {
    providedSig = base64UrlDecode(encodedSig);
  } catch {
    return null;
  }
  const expectedSig = crypto.createHmac("sha256", appSecret).update(encodedPayload).digest();
  if (expectedSig.length !== providedSig.length || !crypto.timingSafeEqual(expectedSig, providedSig)) {
    return null;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  } catch {
    return null;
  }
  const userId = payload.user_id;
  if (!userId || typeof userId !== "string") return null;

  return { userId, payload };
}

/** يستخرج signed_request من جسم الطلب - يقبل application/x-www-form-urlencoded (الصيغة الرسمية
 * التي ترسلها Meta) و multipart/form-data و JSON (للاختبار اليدوي)، دون تسجيل أي محتوى خام. */
export async function extractSignedRequest(req: Request): Promise<string | null> {
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = await req.json();
      return typeof body?.signed_request === "string" ? body.signed_request : null;
    }
    const form = await req.formData();
    const value = form.get("signed_request");
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
