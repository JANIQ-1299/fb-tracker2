export const META_PIXEL_ID = "1409019547733349";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// يُستدعى بعد نجاح إرسال نموذج الطلب - يساعد إعلانات Meta تحسّن الاستهداف نحو زبونات حقيقيات
export function trackLead() {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq("track", "Lead");
  }
}

// كوكيز البكسل (_fbp دائمًا موجود بعد تحميل البكسل، _fbc فقط إذا وصلت الزائرة عبر رابط إعلان)
// تُرسَل مع الطلب لتحسين جودة مطابقة حدث Purchase لاحقًا عند التأكيد - راجع
// server/src/services/metaPixelEvents.ts
export function getFacebookCookies(): { fbp?: string; fbc?: string } {
  if (typeof document === "undefined") return {};
  const read = (name: string): string | undefined => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : undefined;
  };
  return { fbp: read("_fbp"), fbc: read("_fbc") };
}
