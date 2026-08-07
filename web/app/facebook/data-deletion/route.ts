import { verifySignedRequest, extractSignedRequest } from "../../../lib/facebookSignedRequest";
import { notifyDataDeletion } from "../../../lib/facebookServerApi";
import { renderFacebookInfoPage } from "../../../lib/facebookInfoPage";

// Data Deletion Request Callback الرسمي من Meta. التوثيق:
// https://developers.facebook.com/docs/development/create-an-app/data-deletion-callback
// نتحقق من signed_request محليًا، نُبلغ الخادم بحذف/تعطيل البيانات المرتبطة بمعرّف المستخدم
// المُتحقَّق منه فقط، ثم نُعيد JSON يحوي url وconfirmation_code كما تتطلب Meta بالضبط.

export async function GET() {
  const html = renderFacebookInfoPage(
    "حذف بيانات حساب فيسبوك",
    `<p>هذا الرابط مخصص لاستقبال طلبات حذف البيانات التلقائية من Meta (Data Deletion Request
    Callback) عند طلب مستخدم حذف بياناته المرتبطة بتطبيق "نضارة".</p>
    <h2 style="font-size:16px;color:#e7ecf7;">ما الذي نحذفه</h2>
    <ul>
      <li>اتصال Meta المرتبط بحساب المستخدم (رمز الوصول المحفوظ يُبطَل فورًا).</li>
      <li>أي بيانات إضافية غير مخوَّلين بالاحتفاظ بها بعد إلغاء الاتصال.</li>
    </ul>
    <p>لطلب حذف يدوي أو للاستفسار، راسلنا على
      <a href="mailto:qamerhussein24@gmail.com">qamerhussein24@gmail.com</a>.</p>
    <p>لمتابعة حالة طلب حذف سابق: <a href="/facebook/data-deletion/status">صفحة حالة الطلب</a>
    (تحتاج رمز التأكيد الذي استلمته Meta).</p>`,
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

  const confirmationCode = await notifyDataDeletion(verified.userId);
  if (!confirmationCode) {
    return Response.json({ error: "تعذَّر تنفيذ طلب الحذف حاليًا" }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  return Response.json({
    url: `${origin}/facebook/data-deletion/status?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
