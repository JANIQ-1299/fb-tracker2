import ProductCollection from "../components/ProductCollection";
import "./landing.css";

export default function Home() {
  return (
    <main className="nadhara-page">
      <header className="n-topbar">
        <span className="n-logo">نضارة</span>
        <a className="n-topbar-link" href="/products">المنتجات</a>
      </header>
      <section className="n-intro n-home-intro" aria-labelledby="home-title">
        <img className="n-intro-photo" src="/images/nadhara-home-hero.png?v=2" alt="مجموعة نضارة للعناية" fetchPriority="high" />
        <div className="n-home-copy">
          <span className="n-hero-badge">نضارة للعناية</span>
          <h1 id="home-title">روتين عناية يبدأ مع نضارة</h1>
          <p>غسول ومقشر وكريم للعناية بالمناطق الحساسة، في بكج واحد.</p>
          <a className="n-home-order" href="/order">اختاري باقتك واطلبي</a>
          <p>الأسعار تبدأ من ٣٥٬٠٠٠ د.ع مع توصيل مجاني.</p>
        </div>
      </section>
      <ProductCollection titleLevel="h2" />
      <footer className="n-footer">
        <a href="/legal/privacy">سياسة الخصوصية</a>
      </footer>
    </main>
  );
}
