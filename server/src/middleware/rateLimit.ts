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

// Webhook من Meta فقط — سقف أعلى لأن الأحداث قد تصل بشكل مفاجئ
export const webhookRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
