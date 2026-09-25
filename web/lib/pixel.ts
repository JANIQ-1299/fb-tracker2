export const META_PIXEL_ID = "2023190068308366";
export const SNAP_PIXEL_ID = "813791b7-c0f0-4f20-b092-ad4ba5e8234c";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    snaptr?: (...args: unknown[]) => void;
  }
}

// يُستدعى فورًا بعد نجاح إرسال نموذج الطلب - كل زبونة تعبّي الفورم تُحتسب Purchase مباشرة.
// orderId هو نفسه event_id اللي يرسله السيرفر لاحقًا بحدث Purchase عبر Conversions API عند
// ضغط زر التأكيد بتليجرام (metaPixelEvents.ts) - نفس الـevent_id يخلي Meta تدمج الحدثين
// بحدث واحد بدل عدّهم مرتين، مع الاستفادة من دقة الطرفين معًا (توصية Meta الرسمية).
export function trackPurchase(orderId: string, value: number) {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq("track", "Purchase", { value, currency: "IQD" }, { eventID: orderId });
  }
  if (typeof window !== "undefined" && typeof window.snaptr === "function") {
    window.snaptr("track", "PURCHASE", { price: value, currency: "IQD", transaction_id: orderId });
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
