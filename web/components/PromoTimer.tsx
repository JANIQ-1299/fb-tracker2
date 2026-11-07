"use client";

import { useEffect, useState } from "react";

const DURATION_SECONDS = 24 * 60 * 60;
const STORAGE_KEY = "nadhara-promo-start";

function formatPart(value: number) {
  return String(value).padStart(2, "0");
}

export default function PromoTimer() {
  const [remaining, setRemaining] = useState(DURATION_SECONDS);

  useEffect(() => {
    const now = Date.now();
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    const start = stored > 0 && now - stored < DURATION_SECONDS * 1000 ? stored : now;
    window.localStorage.setItem(STORAGE_KEY, String(start));

    const tick = () => {
      const seconds = Math.max(0, DURATION_SECONDS - Math.floor((Date.now() - start) / 1000));
      setRemaining(seconds);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  return (
    <div className="n-promo-timer" aria-label="عرض خصم عشرة بالمئة لمدة محدودة">
      <strong>خصم ١٠٪ لفترة محدودة</strong>
      <span className="n-promo-clock" dir="ltr">
        {formatPart(hours)}:{formatPart(minutes)}:{formatPart(seconds)}
      </span>
      <span>استخدمي الكود <b dir="ltr">NADHARA10</b> عند الطلب</span>
    </div>
  );
}
