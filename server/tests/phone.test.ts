import { describe, it, expect } from "vitest";
import { normalizeIraqiPhone } from "../src/lib/phone.js";

describe("normalizeIraqiPhone", () => {
  it("يوحّد رقمًا محليًا يبدأ بـ 07", () => {
    const { normalized, confident } = normalizeIraqiPhone("07701234567");
    expect(normalized).toBe("+9647701234567");
    expect(confident).toBe(true);
  });

  it("يوحّد رقمًا بصيغة دولية كاملة", () => {
    const { normalized } = normalizeIraqiPhone("+9647701234567");
    expect(normalized).toBe("+9647701234567");
  });

  it("يوحّد رقمًا بصيغة 00964", () => {
    const { normalized } = normalizeIraqiPhone("009647701234567");
    expect(normalized).toBe("+9647701234567");
  });

  it("يوحّد رقمًا بدون صفر بادئ", () => {
    const { normalized } = normalizeIraqiPhone("7701234567");
    expect(normalized).toBe("+9647701234567");
  });

  it("رقمان بصيغتين مختلفتين ينتجان نفس الرقم الموحّد (لاكتشاف التكرار)", () => {
    const a = normalizeIraqiPhone("07701234567");
    const b = normalizeIraqiPhone("+9647701234567");
    expect(a.normalized).toBe(b.normalized);
  });

  it("يرجع null لمدخل فارغ", () => {
    expect(normalizeIraqiPhone(null).normalized).toBeNull();
    expect(normalizeIraqiPhone("").normalized).toBeNull();
  });
});
