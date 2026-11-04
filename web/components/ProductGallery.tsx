"use client";

import { useRef } from "react";

export default function ProductGallery() {
  const track = useRef<HTMLDivElement>(null);

  function move(direction: number) {
    const element = track.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth, behavior: "smooth" });
  }

  return (
    <figure className="n-hero-gallery" aria-label="صور بكج نضارة">
      <div className="n-hero-gallery-track" ref={track} dir="ltr" tabIndex={0} aria-label="اسحبي يمينًا أو يسارًا لتصفح الصور">
        <img className="n-intro-photo" src="/images/nadhara-khtwat.jpg" alt="بكج نضارة الكامل" fetchPriority="high" />
        <img className="n-intro-photo" src="/images/nadhara-lifestyle.jpg" alt="تفاصيل عبوات بكج نضارة" loading="lazy" />
      </div>
      <button type="button" className="n-gallery-prev" aria-label="الصورة السابقة" onClick={() => move(-1)}>‹</button>
      <button type="button" className="n-gallery-next" aria-label="الصورة التالية" onClick={() => move(1)}>›</button>
    </figure>
  );
}
