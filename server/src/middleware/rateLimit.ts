import rateLimit from "express-rate-limit";

export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات كثيرة جدًا، الرجاء المحاولة بعد قليل" },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات دخول كثيرة، الرجاء المحاولة بعد 15 دقيقة" },
});

// سطح مصادقة منفصل لمستخدمي الـWorkspaces، بعداد مستقل تمامًا عن `authRateLimiter` القديم -
// كانا في السابق يتشاركان نفس الكائن (نفس العداد) عبر عدة app.use()، فكانت محاولات الدخول على
// أي سطح تستهلك حصة الأسطح الأخرى جميعًا. راجع DECISIONS.md.
export const workspaceAuthRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات دخول كثيرة، الرجاء المحاولة بعد 15 دقيقة" },
});

// دخول Super Admin يتطلب طلبين على الأقل لكل محاولة ناجحة (بريد+كلمة مرور ثم رمز 2FA)، لذا سقف
// أعلى قليلًا لتفادي استهلاك الحصة بمحاولة واحدة فاشلة + تصحيح صغير.
export const superAdminAuthRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات دخول كثيرة، الرجاء المحاولة بعد 15 دقيقة" },
});

// Webhook من Meta فقط — سقف أعلى لأن الأحداث قد تصل بشكل مفاجئ
export const webhookRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

// نموذج طلب نضارة العام (بلا مصادقة) - سقف صارم لكل IP لمنع السبام على نقطة نهاية مفتوحة للعامة
export const publicFormRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات كثيرة جدًا، الرجاء المحاولة بعد قليل" },
});
