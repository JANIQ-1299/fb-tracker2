import { checkDataDeletionStatus } from "../../../../lib/facebookServerApi";

export const metadata = {
  title: "حالة طلب حذف البيانات - نضارة",
};

// صفحة عامة (بلا تسجيل دخول) يفتحها Meta أو المستخدم عبر الرابط الذي أعدناه في استجابة
// POST /facebook/data-deletion. تعرض حالة عامة فقط (تم الاستلام / لم يُعثر على الرمز) -
// لا تكشف رقم الهاتف أو معرّف المستخدم أو أي بيانات شخصية أخرى إطلاقًا.
export default async function DataDeletionStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const found = code ? await checkDataDeletionStatus(code) : false;

  return (
    <main className="main" style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 className="page-title">حالة طلب حذف البيانات</h1>
      {!code && <p>لم يُرسَل رمز تأكيد. تأكد من استخدام الرابط الذي استلمته بالضبط.</p>}
      {code && found && (
        <div className="card" style={{ borderColor: "var(--success)" }}>
          <p>✅ تم استلام طلب حذف بياناتك وتنفيذه. لم يعد اتصال حسابك بتطبيق "نضارة" فعّالًا.</p>
        </div>
      )}
      {code && !found && (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <p>لم يُعثر على طلب مطابق لهذا الرمز. تحقق من الرابط، أو راسلنا على
            {" "}<a href="mailto:qamerhussein24@gmail.com">qamerhussein24@gmail.com</a>.</p>
        </div>
      )}
    </main>
  );
}
