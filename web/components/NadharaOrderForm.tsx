"use client";

import { packagePrice } from "../lib/nadharaPackages";
import { useEffect, useState, type FormEvent } from "react";
import { submitNadharaOrder } from "../lib/publicApi";
import { trackPurchase, getFacebookCookies, getSnapCookies } from "../lib/pixel";
import { DURATION_SECONDS, STORAGE_KEY } from "./PromoTimer";

const GOVERNORATES = [
  "بغداد",
  "البصرة",
  "نينوى",
  "أربيل",
  "كركوك",
  "النجف",
  "كربلاء",
  "الأنبار",
  "بابل",
  "ذي قار",
  "ديالى",
  "واسط",
  "ميسان",
  "صلاح الدين",
  "القادسية",
  "المثنى",
  "دهوك",
  "السليمانية",
];
const COUPON_CODE = "NADHARA10";

type Status = "idle" | "submitting" | "success" | "error";



export default function NadharaOrderForm({ initialQuantity }: { initialQuantity: number }) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedQty] = useState(Math.min(20, Math.max(1, initialQuantity || 1)));
  const [couponCode, setCouponCode] = useState(COUPON_CODE);

  useEffect(() => {
    const now = Date.now();
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    const start = stored > 0 && now - stored < DURATION_SECONDS * 1000 ? stored : now;
    window.localStorage.setItem(STORAGE_KEY, String(start));
    const expiry = window.setTimeout(() => setCouponCode(""), Math.max(0, DURATION_SECONDS * 1000 - (now - start)));
    return () => window.clearTimeout(expiry);
  }, []);

  const basePrice = packagePrice(selectedQty);
  const hasDiscount = couponCode.trim().toUpperCase() === COUPON_CODE;
  const displayedPrice = Math.round(basePrice * (hasDiscount ? 0.9 : 1));
  const displayedPriceLabel = `${displayedPrice.toLocaleString("en-US")} د.ع`;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    // حقل الفخ (honeypot) - مخفي عن المستخدم الحقيقي بالـCSS، إن امتلأ فهو سلوك بوت
    if ((data.get("website") as string)?.length) {
      setStatus("success");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");
    try {
      const { fbp, fbc } = getFacebookCookies();
      const { scid, scclid } = getSnapCookies();
      const adId = new URLSearchParams(window.location.search).get("ad_id") ?? "";
      const result = await submitNadharaOrder({
        adId: /^\d{1,25}$/.test(adId) ? adId : undefined,
        name: String(data.get("name") ?? ""),
        phone: String(data.get("phone") ?? ""),
        city: String(data.get("city") ?? ""),
        address: String(data.get("address") ?? ""),
        quantity: Number(data.get("quantity") ?? 1),
        couponCode: String(data.get("couponCode") ?? "").trim() || undefined,
        fbp,
        fbc,
        scid,
        scclid,
      });
      setStatus("success");
      trackPurchase(result.orderId, result.price);
      form.reset();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "حدث خطأ أثناء إرسال الطلب");
    }
  }

  if (status === "success") {
    return (
      <div className="n-success">
        <div className="n-success-icon">🌸</div>
        <h3>تم استلام طلبك بنجاح!</h3>
        <p>سنتواصل معك هاتفيًا قريبًا لتأكيد الطلب وتفاصيل التوصيل.</p>
        <button type="button" className="n-btn n-btn-outline" onClick={() => setStatus("idle")}>
          إرسال طلب آخر
        </button>
      </div>
    );
  }

  return (
    <form className="n-form" onSubmit={handleSubmit}>
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="n-hp"
      />

      <div className="n-price-line n-field-wide" aria-live="polite">
        <span>السعر الإجمالي</span>
        <strong>{displayedPriceLabel}</strong>
      </div>

      {hasDiscount && <p className="n-coupon-ok n-field-wide">تم تطبيق خصم 10٪ تلقائيًا على طلبك</p>}

      <label className="n-field">
        <span>الاسم الكامل</span>
        <input type="text" name="name" required minLength={2} maxLength={100} placeholder="مثال: زهراء أحمد" />
      </label>

      <label className="n-field">
        <span>رقم الهاتف</span>
        <input
          type="tel"
          name="phone"
          required
          minLength={7}
          maxLength={20}
          placeholder="07xxxxxxxxx"
          dir="ltr"
        />
      </label>

      <label className="n-field">
        <span>المحافظة</span>
        <select name="city" required defaultValue="">
          <option value="" disabled>
            اختاري المحافظة
          </option>
          {GOVERNORATES.map((gov) => (
            <option key={gov} value={gov}>
              {gov}
            </option>
          ))}
        </select>
      </label>

      <label className="n-field n-field-wide">
        <span>العنوان بالتفصيل (المنطقة، أقرب نقطة دالة)</span>
        <textarea name="address" required minLength={5} maxLength={500} rows={2} />
      </label>

      <input type="hidden" name="quantity" value={1} />

      {status === "error" && <p className="n-form-error">{errorMessage}</p>}

      <button type="submit" className="n-btn n-btn-primary n-field-wide" disabled={status === "submitting"}>
        {status === "submitting" ? "جارِ الإرسال..." : "إرسال الطلب"}
      </button>

      <p className="n-form-note">سنتصل بك لتأكيد الطلب وتفاصيل التوصيل.</p>
    </form>
  );
}
