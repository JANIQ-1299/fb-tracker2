import { verifySignedRequest, extractSignedRequest } from "../../../lib/facebookSignedRequest";
import { notifyDeauthorize } from "../../../lib/facebookServerApi";
import { renderFacebookInfoPage } from "../../../lib/facebookInfoPage";

// Deauthorize Callback الرسمي من Meta (Facebook Login / إعدادات التطبيق الأساسية). يُستدعى عندما
// يُلغي مستخدم تصريح تطبيقنا من إعدادات فيسبوك الخاصة به. لا نُسجّل signed_request أو أي بيانات
// شخصية أبدًا - فقط نتحقق من التوقيع محليًا، ثم نُبلغ الخادم بمعرّف المستخدم المُتحقَّق منه فقط.

export async function GET() {
  const html = renderFacebookInfoPage(
    "إلغاء ربط حساب فيسبوك",
    `<p>هذا الرابط مخصص حصريًا لاستقبال إشعار Meta التلقائي (Deauthorize Callback) عند قيام
    مستخدم بإلغاء تصريح تطبيق "نضارة" من إعدادات حسابه على فيسبوك.</p>
    <p>عند وصول هذا الإشعار، نُلغي فورًا صلاحية اتصال Meta المرتبط بذلك الحساب ونُبطل رمز
    الوصول (Access Token) المحفوظ لديه.</p>
    <p>هذه الصفحة ليست مخصصة للتصفح المباشر من قِبل المستخدمين.</p>`,
  );
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(req: Request) {
  const signedRequest = await extractSignedRequest(req);
  if (!signedRequest) {
    return Response.json({ error: "signed_request مفقود" }, { status: 400 });
  }

  const appSecret = process.env.FACEBOOK_APP_SECRET ?? "";
  const verified = verifySignedRequest(signedRequest, appSecret);
  if (!verified) {
    return Response.json({ error: "توقيع غير صالح" }, { status: 401 });
  }

  await notifyDeauthorize(verified.userId);
  // Meta لا تتطلب جسم استجابة محددًا لهذا المسار - فقط HTTP 200
  return new Response(null, { status: 200 });
}
