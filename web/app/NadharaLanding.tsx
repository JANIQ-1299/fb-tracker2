import ProductGallery from "../components/ProductGallery";
import Script from "next/script";
import "./landing.css";
import NadharaOrderForm from "../components/NadharaOrderForm";
import { META_PIXEL_ID, SNAP_PIXEL_ID } from "../lib/pixel";

// يمنع كاش طويل الأمد (سنة كاملة افتراضيًا لصفحات Next الثابتة) عند بروكسيات شركات
// الاتصالات على الموبايل - بدونه بعض الزبائن يبقون يشوفون نسخة قديمة من الصفحة بعد كل نشر جديد
export const dynamic = "force-dynamic";

export const metadata = {
  title: "نضارة | الأفضل لكِ - بكج العناية بالمناطق الحساسة",
  description:
    "بكج نضارة الكامل للعناية بالمناطق الحساسة: غسول، مقشر وكريم موحّد للون، بإشراف دكتورة صيدلانية. اطلبي الآن وسنتواصل معك لتأكيد الطلب والتوصيل.",
};

// يخلي المتصفح يعرض الصفحة بنفس الألوان الفاتحة دومًا، حتى لو الجهاز أو المتصفح
// (خصوصًا Chrome أندرويد بميزة التلوين الداكن التلقائي) بوضع الوضع الداكن.
export const viewport = {
  colorScheme: "light",
};

const CONTACT = {
  instagram: "https://www.instagram.com/nadhara.official/",
  facebook: "https://web.facebook.com/profile.php?id=61591709139686",
  location: "كركوك، شارع القدس سنتر كركوك، الطابق الثاني",
  whatsapp: "https://wa.me/9647714632981",
};

export default function LandingPage({ searchParams }: { searchParams?: { package?: string | string[] } }) {
  return (
    <main className="nadhara-page">
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${META_PIXEL_ID}');
          fbq('track', 'PageView');
        `}
      </Script>
      <Script id="snap-pixel" strategy="afterInteractive">
        {`
          (function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function()
          {a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};
          a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;
          r.src=n;var u=t.getElementsByTagName(s)[0];
          u.parentNode.insertBefore(r,u);})(window,document,
          'https://sc-static.net/scevent.min.js');
          snaptr('init', '${SNAP_PIXEL_ID}');
          snaptr('track', 'PAGE_VIEW');
        `}
      </Script>
      <noscript>
        <img
          height={1}
          width={1}
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>

      <div className="n-topbar">
        <span className="n-logo">نضارة</span>
        <a className="n-topbar-link" href={CONTACT.instagram} target="_blank" rel="noopener noreferrer">
          تابعينا على إنستقرام
        </a>
      </div>

      <nav className="n-product-nav" aria-label="مسار الصفحة">
        <a href="/">الرئيسية</a><span aria-hidden="true">‹</span>
        <a href="/products">المنتجات</a><span aria-hidden="true">‹</span>
        <span aria-current="page">بكج نضارة الكامل</span>
      </nav>

      <div className="n-intro n-product-layout">
        <section className="n-intro-product" aria-labelledby="product-title">
          <ProductGallery />
          <div>
            <span className="n-hero-badge">نضارة للعناية</span>
            <h1 id="product-title">بكج نضارة للعناية بالمناطق الحساسة</h1>
            <p>غسول، مقشر وكريم في بكج واحد.</p>
            <div className="n-offer"><strong>٣٣٬٠٠٠ د.ع</strong><span>توصيل مجاني</span></div>
            <div className="n-product-links"><a className="n-home-order" href="#order">اطلبي الآن</a><a href="#reviews">تجارب الزبونات</a></div>
          </div>
        </section>
        <section className="n-order" id="order" aria-labelledby="order-title">
          <div className="n-order-card">
            <div className="n-section-title">
              <h2 id="order-title">اطلبي بكج نضارة</h2>
              <p>عبّي بياناتك وراح نتواصل وياچ لتأكيد الطلب.</p>
            </div>
            <NadharaOrderForm initialQuantity={Number(searchParams?.package)} />
          </div>
        </section>
      </div>

      <section className="n-trust">
        <div className="n-trust-item">
          <div className="n-trust-icon">💊</div>
          <span>بإشراف دكتورة صيدلانية</span>
        </div>
        <div className="n-trust-item">
          <div className="n-trust-icon">🚚</div>
          <span>توصيل لجميع المحافظات</span>
        </div>
        <div className="n-trust-item">
          <div className="n-trust-icon">⏰</div>
          <span>الحجز قبل الساعة 12 ليلاً = توصيل ثاني يوم</span>
        </div>
        <div className="n-trust-item">
          <div className="n-trust-icon">💬</div>
          <span>تواصل مباشر وتأكيد سريع</span>
        </div>
      </section>

      <section className="n-section">
        <div className="n-section-title">
          <h2>تفاصيل البكج</h2>
          <p>ثلاث خطوات بسيطة لروتين عناية يومي</p>
        </div>
        <div className="n-package-grid">
          <div className="n-product-card">
            <div className="n-product-icon">🧴</div>
            <h3>غسول</h3>
            <p>ينظف بعمق ويعتني بالاسمرار والالتهابات وروائح المنطقة.</p>
            <span className="n-ingredients">نياسيناميد، حمض غليكوليك، فيتامين سي</span>
          </div>
          <div className="n-product-card">
            <div className="n-product-icon">🫧</div>
            <h3>مقشر</h3>
            <p>مائي جيلاتيني لطيف يزيل الجلد الميت بدون خدوش أو تهيّج.</p>
            <span className="n-ingredients">أحماض فواكه من الفراولة، بذور الريحان، فيتامين سي</span>
          </div>
          <div className="n-product-card">
            <div className="n-product-icon">✨</div>
            <h3>كريم موحّد للون</h3>
            <p>يعالج التصبغات والاسمرار من أول استخدام، وقوامه مرطب.</p>
            <span className="n-ingredients">نياسيناميد، غلوتاثيون، ألفا أربيوتين، فيتامين سي</span>
          </div>
        </div>
        <p className="n-price-gift">🎁 مع كل بكج هدية مسك الرمان</p>
      </section>

      <section className="n-section">
        <div className="n-section-title">
          <h2>طريقة الاستخدام</h2>
          <p>المقشر والغسول 3 أيام بالأسبوع فقط - جربي البداية على منطقة واحدة لتلاحظي الفرق</p>
        </div>
        <ol className="n-instructions">
          <li>
            <span className="n-instr-num">1</span>
            <span>كمية بسيطة من المقشر على المنطقة، تدليك لطيف لمدة 10 دقائق، ثم غسل وتجفيف.</span>
          </li>
          <li>
            <span className="n-instr-num">2</span>
            <span>غسل المنطقة بالغسول وتجفيفها.</span>
          </li>
          <li>
            <span className="n-instr-num">3</span>
            <span>
              كمية قليلة جدًا من الكريم الموحّد للون، يوميًا قبل النوم، ويُمنع غسل المنطقة بعد
              وضعه.
            </span>
          </li>
        </ol>

        <div className="n-video-grid">
          <div className="n-video-card">
            <video src="/videos/scrub-usage.mp4" controls playsInline preload="none" />
            <span>طريقة استخدام المقشر</span>
          </div>
          <div className="n-video-card">
            <video src="/videos/cream-usage.mp4" controls playsInline preload="none" />
            <span>طريقة استخدام الكريم الموحّد</span>
          </div>
        </div>

        <div className="n-section-title" style={{ marginTop: 32 }}>
          <h2>نصائح مهمة</h2>
        </div>
        <ol className="n-instructions">
          <li>
            <span className="n-instr-num">•</span>
            <span>
              يفضّل إزالة الشعر بالشمع أو الليزر، أو شفرة فينوس البنفسجية إذا كانت الإزالة
              بالشفرة.
            </span>
          </li>
          <li>
            <span className="n-instr-num">•</span>
            <span>الملابس الداخلية قطنية حصرًا وترتديها دائمًا لتجنب الاحتكاك المسبب للاسمرار.</span>
          </li>
          <li>
            <span className="n-instr-num">•</span>
            <span>تجنّبي منتجات العناية الأخرى (خاصة المعطّرة) ومقشرات الجسم الأخرى أثناء الاستخدام.</span>
          </li>
        </ol>
      </section>

      <section className="n-section">
        <div className="n-guarantee">
          <img className="n-guarantee-img" src="/images/nadhara-guarantee.jpg" alt="كرت ضمان المنتج والخدمة - نضارة" />
          <div className="n-guarantee-icon">🛡️</div>
          <h3>كرت الضمان</h3>
          <p>يصل كرت الضمان مع كل بكج - يرجى الاحتفاظ فيه لضمان حقچ كزبونة.</p>
          <p>
            استجابة الأجسام تختلف من شخص لآخر - اكو زبونات يشوفن فرق من أول بكج واكو من الثاني.
            لهذا: لو خلّصتي البكج الأول وما شفتي نتيجة، نرسلّچ بكج ثاني تعويض مجانًا ونكون وياچ
            خطوة بخطوة. ولو برضو ما شفتي فرق (وهذا نادر جدًا)، نرجّعلچ فلوسچ كاملة.
          </p>
        </div>
      </section>

      <section className="n-section">
        <div className="n-section-title">
          <h2>شوفي الفرق بعينچ 👀</h2>
          <p>قبل وبعد استخدام بكج نضارة</p>
        </div>
        <div className="n-before-after">
          <video src="/videos/before-after.mp4" controls playsInline preload="none" />
        </div>
      </section>

      <section className="n-section">
        <div className="n-section-title">
          <h2 id="reviews">آراء وتجارب الزبونات</h2>
          <p>آراء حقيقية من زبونات استخدمن بكج نضارة</p>
        </div>
        <div className="n-testimonials n-testimonials-img">
          <img src="/images/testimonials/t1.jpg" alt="تجربة زبونة مع بكج نضارة" loading="lazy" />
          <img src="/images/testimonials/t2.jpg" alt="تجربة زبونة مع بكج نضارة" loading="lazy" />
          <img src="/images/testimonials/t3.jpg" alt="تجربة زبونة مع بكج نضارة" loading="lazy" />
          <img src="/images/testimonials/t4.jpg" alt="تجربة زبونة مع بكج نضارة" loading="lazy" />
          <img src="/images/testimonials/t5.jpg" alt="تجربة زبونة مع بكج نضارة" loading="lazy" />
        </div>
      </section>

      <footer className="n-footer">
        <div className="n-footer-social">
          <a className="n-topbar-link" href={CONTACT.instagram} target="_blank" rel="noopener noreferrer">
            إنستقرام
          </a>
          <a className="n-topbar-link" href={CONTACT.facebook} target="_blank" rel="noopener noreferrer">
            فيسبوك
          </a>
        </div>
        <p style={{ fontSize: 13, color: "var(--n-text-dim)", marginBottom: 14 }}>{CONTACT.location}</p>
        <div className="n-footer-legal">
          <a href="/legal/privacy">سياسة الخصوصية</a>
          <span>·</span>
          <a href="/legal/terms">الشروط والأحكام</a>
          <span>·</span>
          <a href="/legal/data-deletion">حذف البيانات</a>
        </div>
      </footer>

      <a
        className="n-whatsapp-float"
        href={CONTACT.whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="تواصلي معنا عبر واتساب"
      >
        <svg viewBox="0 0 32 32" width="30" height="30" fill="currentColor" aria-hidden="true">
          <path d="M16.004 3C9.377 3 4 8.373 4 15c0 2.323.664 4.49 1.813 6.328L4 29l7.86-1.77A11.94 11.94 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3Zm6.99 16.87c-.298.837-1.47 1.58-2.02 1.66-.55.08-1.148.26-3.86-.8-3.24-1.29-5.36-4.51-5.52-4.72-.16-.21-1.31-1.74-1.31-3.33 0-1.58.83-2.36 1.13-2.69.3-.33.65-.41.87-.41.22 0 .44 0 .63.01.2.01.47-.08.74.56.28.66.94 2.29 1.02 2.46.08.16.14.36.02.58-.12.22-.18.36-.36.55-.18.2-.38.44-.54.6-.18.17-.37.36-.16.7.21.34.94 1.55 2.02 2.51 1.39 1.24 2.56 1.62 2.9 1.8.34.18.54.15.74-.08.2-.24.85-.99 1.08-1.33.23-.34.46-.28.77-.17.31.11 1.97.93 2.31 1.1.34.17.56.25.65.4.09.15.09.85-.19 1.68Z" />
        </svg>
      </a>
    </main>
  );
}
