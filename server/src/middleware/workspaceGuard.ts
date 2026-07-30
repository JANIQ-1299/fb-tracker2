import type { Response, NextFunction } from "express";
import { getSystemState } from "../lib/systemState.js";
import { getEffectiveSubscription, SUSPENSION_MESSAGES } from "../lib/subscription.js";
import type { WorkspaceAuthedRequest } from "./workspaceAuth.js";

// حالة النظام العامة (وضع الصيانة) — تُفحص قبل أي شيء آخر لكل طلبات مستخدمي الـWorkspaces.
// مسارات Super Admin لا تمر عبر هذا الـMiddleware إطلاقًا (مُركَّبة على مسار منفصل تمامًا).
export async function requireSystemActive(
  _req: WorkspaceAuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const state = await getSystemState();
  if (state === "MAINTENANCE_MODE") {
    return res.status(503).json({
      error: "النظام في وضع الصيانة حاليًا. يرجى المحاولة لاحقًا.",
      systemState: state,
    });
  }
  next();
}

export interface SubscriptionAwareRequest extends WorkspaceAuthedRequest {
  subscriptionLimits?: { maxPages: number; maxAdAccounts: number; maxUsers: number };
}

// البوابة الأساسية: يجب أن يمر بها كل طلب API حسّاس (دخول، لوحة تحكم، رفع Excel، مزامنة Meta،
// تقارير) — وليس فقط إخفاء زر في الواجهة. أي حالة غير ACTIVE تُرفض هنا برسالة صريحة.
export async function requireActiveWorkspace(
  req: SubscriptionAwareRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) return res.status(401).json({ error: "غير مصرح - يلزم تسجيل الدخول" });

  const { status, subscription } = await getEffectiveSubscription(req.user.workspaceId);
  if (status !== "ACTIVE") {
    return res.status(403).json({
      error: SUSPENSION_MESSAGES[status] ?? SUSPENSION_MESSAGES.SUSPENDED,
      workspaceStatus: status,
    });
  }

  req.subscriptionLimits = {
    maxPages: subscription!.maxPages,
    maxAdAccounts: subscription!.maxAdAccounts,
    maxUsers: subscription!.maxUsers,
  };
  next();
}

// نفس تحقق `requireActiveWorkspace` لكن يُستخدم صراحةً عند نقاط إضافة موارد (ربط صفحة/حساب
// إعلاني/مستخدم جديد) حيث يحتاج الـhandler لاحقًا لـ`req.subscriptionLimits` لفرض الحدود
// (max_pages/max_ad_accounts/max_users) بمقارنتها بالعدد الحالي الفعلي في قاعدة البيانات.
export const requireActiveSubscription = requireActiveWorkspace;
