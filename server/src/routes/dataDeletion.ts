import { Router } from "express";
import crypto from "node:crypto";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

/**
 * Data Deletion Request Callback — مطلوب من Meta App Review لأي تطبيق يعالج بيانات مستخدمين.
 * التوثيق الرسمي: https://developers.facebook.com/docs/development/create-an-app/data-deletion-callback
 * Meta ترسل POST بحقل signed_request (base64url payload + HMAC-SHA256 موقّع بـApp Secret).
 * يجب أن نرد بـ JSON يحتوي url وconfirmation_code خلال ثوانٍ معدودة، ثم ننفّذ الحذف الفعلي.
 */
export const dataDeletionRouter = Router();

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

dataDeletionRouter.post("/meta/data-deletion", async (req, res) => {
  const signedRequest = req.body?.signed_request;
  if (!signedRequest || typeof signedRequest !== "string" || !env.metaAppSecret) {
    return res.status(400).json({ error: "signed_request مفقود أو التطبيق غير مهيأ" });
  }

  const [encodedSig, encodedPayload] = signedRequest.split(".");
  const expectedSig = crypto
    .createHmac("sha256", env.metaAppSecret)
    .update(encodedPayload)
    .digest();
  const providedSig = base64UrlDecode(encodedSig);

  if (
    expectedSig.length !== providedSig.length ||
    !crypto.timingSafeEqual(expectedSig, providedSig)
  ) {
    logger.warn("توقيع Data Deletion Request غير صالح");
    return res.status(401).json({ error: "توقيع غير صالح" });
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  const fbUserId: string = payload.user_id;
  const confirmationCode = crypto.randomBytes(8).toString("hex");

  // لا نملك ربطًا مباشرًا بين fbUserId ومعرّف Lead لدينا (Lead Ads لا تُرجع هوية مستخدم فيسبوك)،
  // لذلك نسجّل الطلب في SyncLog للمراجعة اليدوية ونمنحه رمز تأكيد فوري كما يتطلب Meta.
  await prisma.syncLog.create({
    data: {
      source: "meta_data_deletion_request",
      status: "PARTIAL",
      details: JSON.stringify({ fbUserId, confirmationCode, note: "يتطلب مراجعة يدوية لعدم توفر ربط مباشر" }),
      completedAt: new Date(),
    },
  });

  logger.info({ fbUserId, confirmationCode }, "طلب حذف بيانات من Meta - تم تسجيله للمراجعة");

  res.json({
    url: `${env.publicBaseUrl}/data-deletion-status?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
});

dataDeletionRouter.get("/meta/data-deletion-status", (req, res) => {
  res.json({ code: req.query.code, status: "تم استلام الطلب وهو قيد المراجعة اليدوية" });
});
