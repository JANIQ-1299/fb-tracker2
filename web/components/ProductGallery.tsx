"use client";

import { useEffect, useState } from "react";

const GALLERY_IMAGES = [
  ["/images/nadhara-khtwat.jpg", "بكج نضارة الكامل"],
  ["/images/nadhara-lifestyle.jpg", "تفاصيل عبوات بكج نضارة"],
  ["/images/nadhara-routine.jpg", "روتين العناية من نضارة"],
  ["/images/testimonials/t1.jpg", "تجربة زبونة مع بكج نضارة"],
  ["/images/testimonials/t2.jpg", "تجربة زبونة مع بكج نضارة"],
  ["/images/testimonials/t3.jpg", "تجربة زبونة مع بكج نضارة"],
  ["/images/testimonials/t4.jpg", "تجربة زبونة مع بكج نضارة"],
  ["/images/testimonials/t5.jpg", "تجربة زبونة مع بكج نضارة"],
] as const;

export default function ProductGallery() {
  const [active, setActive] = useState(0);

  function move(direction: number) {
    setActive((current) => (current + direction + GALLERY_IMAGES.length) % GALLERY_IMAGES.length);
  }

  useEffect(() => {
    const timer = window.setInterval(() => move(1), 4500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <figure className="n-hero-gallery" aria-label="صور المنتج وتجارب الزبائن">
      <div className="n-hero-gallery-track" dir="ltr" tabIndex={0} aria-label="اسحبي يمينًا أو يسارًا لتصفح صور المنتج والتجارب">
        {GALLERY_IMAGES.map(([src, alt], index) => (
          <button
            key={src}
            type="button"
            className={`n-gallery-image${index === active ? " is-active" : ""}`}
            onClick={() => { window.location.hash = "order-form"; }}
            aria-label={`${alt} - اطلبي الآن`}
          >
            <img
              className="n-intro-photo"
              src={src}
              alt={alt}
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "auto"}
            />
          </button>
        ))}
      </div>
      <button type="button" className="n-gallery-prev" aria-label="الصورة السابقة" onClick={() => move(-1)}>‹</button>
      <button type="button" className="n-gallery-next" aria-label="الصورة التالية" onClick={() => move(1)}>›</button>
      <div className="n-gallery-dots" aria-label="مؤشر الصور">
        {GALLERY_IMAGES.map(([, alt], index) => (
          <button key={alt + index} type="button" className={index === active ? "is-active" : ""} aria-label={`عرض ${alt}`} onClick={() => setActive(index)} />
        ))}
      </div>
      <div className="n-gallery-caption" aria-live="polite">{GALLERY_IMAGES[active][1]}</div>
      <div className="n-gallery-thumbs" aria-label="كل صور المنتج والتجارب">
        {GALLERY_IMAGES.map(([src, alt], index) => (
          <button key={`thumb-${src}`} type="button" className={index === active ? "is-active" : ""} onClick={() => setActive(index)} aria-label={`اختيار ${alt}`}>
            <img src={src} alt="" loading="eager" />
          </button>
        ))}
      </div>
    </figure>
  );
}
