/** حسابات حدود اليوم (منتصف الليل إلى منتصف الليل التالي) بتوقيت منطقة زمنية معيّنة (مثل Asia/Baghdad)، بغض النظر عن توقيت الخادم نفسه. */

function timezoneOffsetMs(date: Date, timeZone: string): number {
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzDate = new Date(date.toLocaleString("en-US", { timeZone }));
  return tzDate.getTime() - utcDate.getTime();
}

export function startOfDayInTz(date: Date, timeZone: string): Date {
  const offsetMs = timezoneOffsetMs(date, timeZone);
  const shifted = new Date(date.getTime() + offsetMs);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - offsetMs);
}

export function endOfDayInTz(date: Date, timeZone: string): Date {
  const start = startOfDayInTz(date, timeZone);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}
