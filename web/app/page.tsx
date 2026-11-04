import "./landing.css";

export default function Home() {
  return (
    <main className="nadhara-page">
      <header className="n-topbar">
        <span className="n-logo">نضارة</span>
        <a className="n-topbar-link" href="https://www.instagram.com/nadhara.official/">إنستقرام</a>
      </header>
      <section className="n-intro n-home-intro" aria-labelledby="home-title">
        <img className="n-intro-photo" src="/images/nadhara-routine.jpg" alt="مجموعة نضارة للعناية" fetchPriority="high" />
        <div className="n-home-copy">
          <span className="n-hero-badge">نضارة للعناية</span>
          <h1 id="home-title">روتين عناية يبدأ مع نضارة</h1>
          <p>غسول ومقشر وكريم للعناية بالمناطق الحساسة، في بكج واحد.</p>
          <a className="n-home-order" href="/order#order">اختاري باقتك واطلبي</a>
          <p>الأسعار تبدأ من ٣٣٬٠٠٠ د.ع مع توصيل مجاني.</p>
        </div>
      </section>
      <footer className="n-footer">
        <a href="/legal/privacy">سياسة الخصوصية</a>
      </footer>
    </main>
  );
}
