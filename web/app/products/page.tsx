import "../landing.css";
import ProductCollection from "../../components/ProductCollection";

export const metadata = { title: "منتجات نضارة" };

export default function ProductsPage() {
  return (
    <main className="nadhara-page">
      <header className="n-topbar">
        <a className="n-logo" href="/">نضارة</a>
        <a className="n-topbar-link" href="/">الرئيسية</a>
      </header>
      <ProductCollection titleLevel="h1" />
      <section className="n-section" aria-labelledby="gallery-title">
        <div className="n-section-title">
          <h2 id="gallery-title">صور بكج نضارة</h2>
        </div>
        <div className="n-product-gallery">
          <figure>
            <img src="/images/nadhara-khtwat.jpg" alt="الصورة الرسمية لبكج نضارة" />
            <figcaption>بكج نضارة الكامل</figcaption>
          </figure>
          <figure>
            <img src="/images/nadhara-lifestyle.jpg" alt="عبوات الغسول والمقشر والكريم ومسك الرمان" loading="lazy" />
            <figcaption>تفاصيل العبوات</figcaption>
          </figure>
        </div>
      </section>
    </main>
  );
}
