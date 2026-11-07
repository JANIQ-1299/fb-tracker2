"use client";

import { PACKAGE_OPTIONS } from "../lib/nadharaPackages";
import { useState, type FormEvent } from "react";
import { submitNadharaOrder } from "../lib/publicApi";
import { trackPurchase, getFacebookCookies, getSnapCookies } from "../lib/pixel";

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
  const [selectedQty, setSelectedQty] = useState(PACKAGE_OPTIONS.find(({ qty }) => qty === initialQuantity)?.qty ?? 1);
  const [couponCode, setCouponCode] = useState("");

  const selectedPrice = PACKAGE_OPTIONS.find((o) => o.qty === selectedQty)?.price ?? "";
  const basePrice = Number(selectedPrice.replace(/[^0-9]/g, "")) || 0;
  const hasDiscount = couponCode.trim().toUpperCase() === COUPON_CODE;
  const displayedPrice = Math.round(basePrice * (hasDiscount ? 0.9 : 1));
  const displayedPriceLabel = displayedPrice ? `${displayedPrice.toLocaleString("en-US")} د.ع` : selectedPrice;

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
        notes: String(data.get("notes") ?? "") || undefined,
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

      <label className="n-field n-field-wide">
        <span>اختاري الكمية</span>
        <select
          name="quantity"
          required
          value={selectedQty}
          onChange={(e) => setSelectedQty(Number(e.target.value))}
        >
          {PACKAGE_OPTIONS.map((opt) => (
            <option key={opt.qty} value={opt.qty}>
              {opt.label} — {opt.price}
            </option>
          ))}
        </select>
      </label>

      <div className="n-price-line n-field-wide" aria-live="polite">
        <span>السعر الإجمالي</span>
        <strong>{displayedPriceLabel}</strong>
      </div>

      <label className="n-field n-field-wide">
        <span>كود الخصم (اختياري)</span>
        <input
          type="text"
          name="couponCode"
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value)}
          placeholder="NADHARA10"
          maxLength={40}
          dir="ltr"
          autoCapitalize="characters"
        />
        {couponCode.trim() && (
          <small className={hasDiscount ? "n-coupon-ok" : "n-coupon-hint"}>
            {hasDiscount ? "تم تطبيق خصم 10٪" : "استخدمي الكود NADHARA10 للحصول على خصم 10٪"}
          </small>
        )}
      </label>

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

      <label className="n-field n-field-wide">
        <span>ملاحظات (اختياري)</span>
        <textarea name="notes" maxLength={500} rows={2} />
      </label>

      {status === "error" && <p className="n-form-error">{errorMessage}</p>}

      <button type="submit" className="n-btn n-btn-primary n-field-wide" disabled={status === "submitting"}>
        {status === "submitting" ? "جارِ الإرسال..." : "إرسال الطلب"}
      </button>

      <p className="n-form-note">سنتصل بك لتأكيد الطلب وتفاصيل التوصيل.</p>
    </form>
  );
}
