import { prisma } from "./prisma.js";
import type { WorkspaceSubscription } from "@prisma/client";

export type EffectiveStatus = "ACTIVE" | "SUSPENDED" | "EXPIRED" | "BLOCKED";

export const SUSPENSION_MESSAGES: Record<EffectiveStatus, string | null> = {
  ACTIVE: null,
  SUSPENDED: "تم إيقاف حسابك مؤقتاً. يرجى التواصل مع إدارة النظام.",
  BLOCKED: "تم حظر هذا الحساب. يرجى التواصل مع إدارة النظام.",
  EXPIRED: "انتهت صلاحية اشتراكك. يرجى التواصل مع إدارة النظام لتجديده.",
};

/**
 * يحسب الحالة الفعلية للاشتراك، مع ترقية ACTIVE تلقائيًا إلى EXPIRED إن مرّ `expiresAt` -
 * ويحدّث الصف في قاعدة البيانات ليعكس ذلك (بدل الاعتماد على تشغيل مجدول منفصل).
 */
export async function getEffectiveSubscription(
  workspaceId: string,
): Promise<{ subscription: WorkspaceSubscription | null; status: EffectiveStatus }> {
  const subscription = await prisma.workspaceSubscription.findUnique({ where: { workspaceId } });
  if (!subscription) return { subscription: null, status: "SUSPENDED" };

  if (
    subscription.status === "ACTIVE" &&
    subscription.expiresAt &&
    subscription.expiresAt.getTime() < Date.now()
  ) {
    const updated = await prisma.workspaceSubscription.update({
      where: { workspaceId },
      data: { status: "EXPIRED" },
    });
    return { subscription: updated, status: "EXPIRED" };
  }

  return { subscription, status: subscription.status as EffectiveStatus };
}
