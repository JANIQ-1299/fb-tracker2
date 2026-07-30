import { describe, it, expect } from "vitest";
import { startOfDayInTz, endOfDayInTz } from "../src/lib/timezone.js";

describe("startOfDayInTz / endOfDayInTz - حدود اليوم بتوقيت Asia/Baghdad", () => {
  it("يحسب بداية اليوم الصحيحة بغض النظر عن الساعة المُمرَّرة", () => {
    // 2026-07-25 04:20 بتوقيت بغداد (+3) = 2026-07-25T01:20:00Z
    const now = new Date("2026-07-25T01:20:00.000Z");
    const start = startOfDayInTz(now, "Asia/Baghdad");
    // بداية اليوم ببغداد = 2026-07-25T00:00:00+03:00 = 2026-07-24T21:00:00Z
    expect(start.toISOString()).toBe("2026-07-24T21:00:00.000Z");
  });

  it("نهاية اليوم = بداية اليوم + 24 ساعة إلا ملّي ثانية", () => {
    const now = new Date("2026-07-25T01:20:00.000Z");
    const start = startOfDayInTz(now, "Asia/Baghdad");
    const end = endOfDayInTz(now, "Asia/Baghdad");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it("لحظة قريبة من منتصف الليل ببغداد تُعطي نفس اليوم المحلي الصحيح", () => {
    // 2026-07-24T21:30:00Z = 2026-07-25T00:30:00 ببغداد -> يجب أن يكون ضمن يوم 25، لا 24
    const nearMidnight = new Date("2026-07-24T21:30:00.000Z");
    const start = startOfDayInTz(nearMidnight, "Asia/Baghdad");
    expect(start.toISOString()).toBe("2026-07-24T21:00:00.000Z");
  });
});
