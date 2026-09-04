import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./lib/env.js";
import { webhookRouter } from "./routes/webhook.js";
import { authRouter } from "./routes/auth.js";
import { leadsRouter } from "./routes/leads.js";
import { reportsRouter } from "./routes/reports.js";
import { settingsRouter } from "./routes/settings.js";
import { healthRouter } from "./routes/health.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { dataDeletionRouter } from "./routes/dataDeletion.js";
import { workspaceAuthRouter } from "./routes/workspaceAuth.js";
import { superAdminAuthRouter } from "./routes/superAdminAuth.js";
import { superAdminRouter } from "./routes/superAdmin.js";
import { metaOAuthRouter } from "./routes/metaOAuth.js";
import { metaConnectionsRouter } from "./routes/metaConnections.js";
import { metaSyncRouter } from "./routes/metaSync.js";
import { importsRouter } from "./routes/imports.js";
import { attributionRouter } from "./routes/attribution.js";
import { messagingRouter } from "./routes/messaging.js";
import { conversationImportRouter } from "./routes/conversationImport.js";
import { facebookComplianceRouter } from "./routes/facebookCompliance.js";
import { nadharaOrdersRouter } from "./routes/nadharaOrders.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import {
  apiRateLimiter,
  authRateLimiter,
  webhookRateLimiter,
  superAdminAuthRateLimiter,
  publicFormRateLimiter,
} from "./middleware/rateLimit.js";

// بُني كدالة منفصلة عن index.ts حتى يمكن استيراده في الاختبارات (supertest)
// بدون تشغيل app.listen() أو جدولة cron jobs الفعلية.
export function buildApp() {
  const app = express();

  // Render يمرّر الطلبات عبر بروكسي واحد على الأقل - بدون هذا يرجع req.ip عنوان البروكسي بدل
  // الزائر الفعلي (يفسد جودة مطابقة Conversions API لاحقًا). ثبّتناها على "1" تحديدًا (وليس
  // true) لأن true تعني الثقة بسلسلة بروكسيات غير محدودة الطول، وهذا يسمح لأي عميل بتزوير
  // X-Forwarded-For وتجاوز تحديد المعدل (rate limiting) - express-rate-limit يرفضها صراحةً.
  app.set("trust proxy", 1);

  app.use(helmet());
  // يدعم عدة نطاقات مفصولة بفاصلة (رابط onrender.com الافتراضي + الدومين المخصص) حتى لا ينكسر
  // الموقع القديم أثناء انتقال الزبائن تدريجيًا للدومين الجديد.
  const allowedWebOrigins = env.webPublicBaseUrl.split(",").map((o) => o.trim());
  app.use(
    cors({
      origin: env.nodeEnv === "production" ? allowedWebOrigins : true,
      credentials: true,
    }),
  );
  app.use(cookieParser());

  app.use("/webhook/meta/leads", webhookRateLimiter, express.raw({ type: "application/json" }));
  app.use("/webhook/meta/messaging", webhookRateLimiter, express.raw({ type: "application/json" }));
  app.use("/webhook", webhookRouter);

  app.use(express.json({ limit: "1mb" }));
  app.use("/api", dataDeletionRouter);
  app.use("/api", healthRouter);
  app.use("/api/auth", authRateLimiter, authRouter);
  app.use("/api/leads", apiRateLimiter, leadsRouter);
  app.use("/api/reports", apiRateLimiter, reportsRouter);
  app.use("/api/settings", apiRateLimiter, settingsRouter);
  app.use("/api/dashboard", apiRateLimiter, dashboardRouter);

  // ---- Multi-Tenant: دخول مستخدمي الـWorkspaces + طبقة Super Admin (منفصلة تمامًا) ----
  // الحد الصارم لمحاولات الدخول مطبَّق داخل workspaceAuthRouter نفسه على POST /login فقط -
  // هنا نستخدم الحد العام الأكثر تساهلًا لأن GET /me يُستدعى في كل تحميل صفحة.
  app.use("/api/auth/user", apiRateLimiter, workspaceAuthRouter);
  app.use("/api/superadmin/auth", superAdminAuthRateLimiter, superAdminAuthRouter);
  app.use("/api/superadmin", apiRateLimiter, superAdminRouter);

  // ---- Meta OAuth (نقطة التوقف 1): ربط الحساب، اختيار الأصول، والمزامنة - كلها مربوطة بـ
  // workspaceId من الجلسة فقط. لا علاقة لها بخط Webhook/Insights القديم في jobs/insights.ts. ----
  app.use("/api/meta/oauth", apiRateLimiter, metaOAuthRouter);
  app.use("/api/meta/connections", apiRateLimiter, metaConnectionsRouter);
  app.use("/api/meta/sync", apiRateLimiter, metaSyncRouter);

  // ---- استيراد ملفات الطلبات (Excel/CSV) - لا يُنشئ OrderAttribution إطلاقًا في هذه المرحلة ----
  app.use("/api/imports", apiRateLimiter, importsRouter);

  // ---- محرك مطابقة مصادر الطلبات (نقطة التوقف 3) ----
  app.use("/api/attribution", apiRateLimiter, attributionRouter);

  // ---- رسائل إنستغرام (Forward-Looking فقط) - راجع MessagingIntegration في schema.prisma ----
  app.use("/api/messaging", apiRateLimiter, messagingRouter);

  // ---- Historical Conversation Import: استيراد بيانات محادثة مجرَّدة (بلا نصوص) يرفعها مالك
  // الـWorkspace بنفسه - لا يوجد هنا أي استدعاء لـConversations/Messages API. راجع DECISIONS.md ----
  app.use("/api/conversation-import", apiRateLimiter, conversationImportRouter);

  // ---- استدعاءات داخلية من web/app/facebook/* بعد تحقّقها هي نفسها من توقيع Meta - راجع
  // server/src/routes/facebookCompliance.ts للتفاصيل (Deauthorize + Data Deletion Callback) ----
  app.use("/api/facebook", apiRateLimiter, facebookComplianceRouter);

  // ---- نموذج طلب صفحة هبوط نضارة (بلا مصادقة) - يرسل كل طلب لبوت تليجرام صاحب المتجر
  // ويحتفظ بنسخة CSV احتياطية. راجع services/telegramOrders.ts ----
  app.use("/api/public/nadhara-orders", publicFormRateLimiter, nadharaOrdersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
