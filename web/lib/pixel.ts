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
