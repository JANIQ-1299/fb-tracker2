import "./landing.css";
import NadharaOrderForm from "../components/NadharaOrderForm";

export const metadata = {
  title: "نضارة | الأفضل لكِ - بكج العناية بالبشرة",
  description:
    "بكج نضارة الكامل للعناية بالبشرة: غسول، مقشر وكريم موحّد للون، بإشراف دكتورة صيدلانية. اطلبي الآن وسنتواصل معك لتأكيد الطلب والتوصيل.",
};

const CONTACT = {
  instagram: "https://www.instagram.com/nadhara.official/",
  facebook: "https://web.facebook.com/profile.php?id=61591709139686",
  location: "كركوك، شارع القدس سنتر كركوك، الطابق الثاني",
};

export default function LandingPage() {
  return (
    <main className="nadhara-page">
      <div className="n-topbar">
        <span className="n-logo">نضارة</span>
        <a className="n-topbar-link" href={CONTACT.instagram} target="_blank" rel="noopener noreferrer">
          تابعينا على إنستقرام
        </a>
      </div>

      <section className="n-hero">
        <span className="n-hero-badge">🌸 الأفضل لكِ</span>
        <h1>
          بكج <span>نضارة</span> الكامل للعناية ببشرتك
        </h1>
        <p>
          نظافة، نعومة، وإشراقة — مجموعة عناية متكاملة بإشراف دكتورة صيدلانية، تساعد بشرتك على
          التخلص من الجلد الميت وتوحيد لونها بلطف واستمرارية.
        </p>
        <div className="n-hero-cta">
          <a className="n-btn n-btn-primary" href="#order">
            اطلبي الآن
          </a>
          <a
            className="n-btn n-btn-outline"
            href={CONTACT.instagram}
            target="_blank"
            rel="noopener noreferrer"
          >
            شاهدي تجارب الزبونات
          </a>
        </div>
        <img className="n-hero-img" src="/images/nadhara-routine.jpg" alt="بكج نضارة: غسول، مقشر وكريم موحّد للون" />
      </section>

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
          <h2>شنو يحتوي البكج؟</h2>
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
          <h2>الأسعار والعروض</h2>
          <p>اختاري العرض المناسب لچ</p>
        </div>
        <div className="n-pricing-grid">
          <div className="n-price-card">
            <h3>بكج واحد</h3>
            <div className="n-price-amount">33,000 د.ع</div>
            <p>غسول + مقشر + كريم موحّد للون، مع هدية مسك الرمان</p>
          </div>
          <div className="n-price-card n-price-highlight">
            <span className="n-price-tag">الأكثر توفيرًا</span>
            <h3>بكجين + بكج هدية 🎁</h3>
            <div className="n-price-amount">65,000 د.ع</div>
            <div className="n-price-save">توفري 34,000 د.ع</div>
            <p>٣ بكجات كاملة (بسعر بكجين فقط)، مع هدية مسك الرمان</p>
          </div>
        </div>
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
          <h2>تجارب زبوناتنا 💬</h2>
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

      <section className="n-order" id="order">
        <p className="n-order-warning">
          حبيبتي رجاءًا، إذا ما تنوين تحجزين لا تعبّي معلوماتچ بالاستمارة 💔
        </p>
        <div className="n-order-card">
          <div className="n-section-title">
            <h2>إرسال طلب</h2>
            <p>عبّي بياناتك وراح نتواصل معك لتأكيد الطلب والتوصيل</p>
          </div>
          <NadharaOrderForm />
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
    </main>
  );
}
