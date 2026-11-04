import { PACKAGE_OPTIONS } from "../lib/nadharaPackages";

export default function ProductCollection({ titleLevel: Title }: { titleLevel: "h1" | "h2" }) {
  return (
    <section className="n-section" aria-labelledby="collection-title">
      <div className="n-section-title">
        <Title id="collection-title">باقات نضارة</Title>
        <p>غسول ومقشر وكريم في كل بكج. التوصيل مجاني لجميع الباقات.</p>
      </div>
      <div className="n-catalog">
        {PACKAGE_OPTIONS.map(({ qty, label, price }) => (
          <article key={qty} className="n-catalog-card">
            <img src="/images/nadhara-khtwat.jpg" alt="مجموعة نضارة للعناية" loading="lazy" />
            <div>
              <h3>{label}</h3>
              <p><strong>{price}</strong></p>
              <a className="n-home-order" href={`/order?package=${qty}#order`}>اطلبي {label}</a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
