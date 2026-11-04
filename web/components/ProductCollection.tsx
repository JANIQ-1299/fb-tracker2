export default function ProductCollection({ titleLevel: Title }: { titleLevel: "h1" | "h2" }) {
  return (
    <section className="n-section" aria-labelledby="collection-title">
      <div className="n-section-title">
        <Title id="collection-title">منتجات نضارة</Title>
      </div>
      <article className="n-catalog-card n-catalog-single">
        <img src="/images/nadhara-khtwat.jpg" alt="مجموعة نضارة للعناية" loading="lazy" />
        <div>
          <h3>بكج نضارة الكامل</h3>
          <p>غسول ومقشر وكريم. توصيل مجاني.</p>
          <p><strong>يبدأ من ٣٣٬٠٠٠ د.ع</strong></p>
          <a className="n-home-order" href="/order">اطلبي البكج</a>
        </div>
      </article>
    </section>
  );
}
