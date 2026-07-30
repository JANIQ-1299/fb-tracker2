import { prisma } from "../lib/prisma.js";

const DEFAULT_WINDOW_HOURS = 72;

/**
 * يكتشف التكرار الاحتمالي بترتيب أولوية:
 *  1) نفس metaLeadId (تكرار Webhook حقيقي - يُمنع بالكامل عبر unique constraint في مكان آخر)
 *  2) نفس رقم الهاتف الموحّد خلال نافذة زمنية
 *  3) نفس البريد الإلكتروني خلال نافذة زمنية
 * لا يُحذف أي عميل مكرر؛ يُعلَّم فقط isDuplicate=true مع duplicateOfId وسبب واضح،
 * ويبقى قابلًا للمراجعة اليدوية من لوحة التحكم.
 */
export async function detectDuplicate(params: {
  normalizedPhone: string | null;
  email: string | null;
  createdAt: Date;
  windowHours?: number;
}): Promise<{ isDuplicate: boolean; duplicateOfId?: string; reason?: string }> {
  const windowHours = params.windowHours ?? DEFAULT_WINDOW_HOURS;
  const windowStart = new Date(params.createdAt.getTime() - windowHours * 60 * 60 * 1000);

  if (params.normalizedPhone) {
    const existing = await prisma.lead.findFirst({
      where: {
        normalizedPhone: params.normalizedPhone,
        isDuplicate: false,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "asc" },
    });
    if (existing) {
      return {
        isDuplicate: true,
        duplicateOfId: existing.id,
        reason: `نفس رقم الهاتف الموحّد (${params.normalizedPhone}) خلال ${windowHours} ساعة`,
      };
    }
  }

  if (params.email) {
    const existing = await prisma.lead.findFirst({
      where: {
        email: params.email,
        isDuplicate: false,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "asc" },
    });
    if (existing) {
      return {
        isDuplicate: true,
        duplicateOfId: existing.id,
        reason: `نفس البريد الإلكتروني (${params.email}) خلال ${windowHours} ساعة`,
      };
    }
  }

  return { isDuplicate: false };
}
