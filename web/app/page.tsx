export const metadata = {
  title: "نضارة - منتجات العناية بالبشرة والتجميل",
  description:
    "نضارة، صفحة متخصصة بمنتجات العناية بالبشرة والتجميل في بغداد، العراق. تابعونا على إنستغرام وفيسبوك لأحدث المنتجات والعروض.",
};

const CONTACT = {
  instagram: "https://www.instagram.com/nadhara.official/",
  facebook: "https://web.facebook.com/profile.php?id=61591709139686",
  location: "بغداد، العراق",
  hours: "يوميًا من 10:00 صباحًا حتى 8:00 مساءً",
  email: "qamerhussein24@gmail.com",
};

export default function LandingPage() {
  return (
    <main className="landing">
      <section className="landing-hero">
        <span className="landing-badge">نضارة</span>
        <h1>نضارة لمنتجات العناية بالبشرة والتجميل</h1>
        <p>
          نقدّم مجموعة مختارة من منتجات العناية بالبشرة ومستحضرات التجميل، مع متابعة وتواصل مباشر
          عبر صفحاتنا على إنستغرام وفيسبوك.
        </p>
        <div className="landing-cta">
          <a className="btn" href={CONTACT.instagram} target="_blank" rel="noopener noreferrer">
            تابعونا على إنستغرام
          </a>
          <a className="btn secondary" href={CONTACT.facebook} target="_blank" rel="noopener noreferrer">
            صفحتنا على فيسبوك
          </a>
        </div>
      </section>

      <section className="landing-info">
        <div className="card">
          <div className="label">الموقع</div>
          <div className="value" style={{ fontSize: 16 }}>{CONTACT.location}</div>
        </div>
        <div className="card">
          <div className="label">ساعات العمل</div>
          <div className="value" style={{ fontSize: 16 }}>{CONTACT.hours}</div>
        </div>
        <div className="card">
          <div className="label">التواصل</div>
          <div className="value" style={{ fontSize: 16 }}>{CONTACT.email}</div>
        </div>
      </section>

      <p className="landing-followup">
        تابعوا «نضارة» على منصات التواصل للاطلاع على أحدث المنتجات والعروض، أو تواصلوا معنا مباشرة
        للحصول على المزيد من المعلومات.
      </p>

      <footer className="landing-footer">
        <a href="/legal/privacy">سياسة الخصوصية</a>
        <span>·</span>
        <a href="/legal/terms">الشروط والأحكام</a>
        <span>·</span>
        <a href="/legal/data-deletion">حذف البيانات</a>
      </footer>
    </main>
  );
}
