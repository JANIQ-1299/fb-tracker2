import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

// يعمل سواء تم تشغيل السيرفر من مجلد server/ أو من جذر المشروع (Docker).
const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
];
for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

function required(name: string, fallback = ""): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

export const env = {
  nodeEnv: required("NODE_ENV", "development"),
  port: Number(required("PORT", "4000")),
  tz: required("APP_TIMEZONE", required("TZ", "Asia/Baghdad")),
  defaultCurrency: required("DEFAULT_CURRENCY", "IQD"),
  publicBaseUrl: required("PUBLIC_BASE_URL", "http://localhost:4000"),
  // عنوان لوحة تحكم الـWorkspace (Next.js) — يُستخدم فقط لإعادة توجيه المتصفح إليها بعد
  // اكتمال Meta OAuth (الخادم لا يعرف عنوان الواجهة تلقائيًا لأنه أصل منفصل تمامًا محليًا).
  webPublicBaseUrl: required("WEB_PUBLIC_BASE_URL", "http://localhost:3000"),

  autoSyncEnabled: required("AUTO_SYNC_ENABLED", "true") === "true",
  autoSyncCron: required("AUTO_SYNC_CRON", "0 * * * *"),
  rollingWindowHours: Number(required("ROLLING_WINDOW_HOURS", "24")),

  // مفتاح Anthropic محجوز لمرحلة مستقبلية (تحليل محادثات) — غير مستخدم حاليًا لأن صلاحية
  // pages_messaging/instagram_manage_messages غير ممنوحة بعد. راجع DECISIONS.md.
  anthropicApiKey: required("ANTHROPIC_API_KEY"),

  databaseUrl: required("DATABASE_URL"),

  metaGraphApiVersion: required("META_GRAPH_API_VERSION", "v25.0"),
  metaAppId: required("META_APP_ID"),
  metaAppSecret: required("META_APP_SECRET"),
  metaWebhookVerifyToken: required("META_WEBHOOK_VERIFY_TOKEN"),
  metaPageAccessToken: required("META_PAGE_ACCESS_TOKEN"),
  metaBusinessId: required("META_BUSINESS_ID"),
  metaPageId: required("META_PAGE_ID"),
  metaAdAccountId: required("META_AD_ACCOUNT_ID"),
  metaConversionsDatasetId: required("META_CONVERSIONS_DATASET_ID"),

  adminEmail: required("ADMIN_EMAIL"),
  adminPasswordHash: required("ADMIN_PASSWORD_HASH"),
  jwtSecret: required("JWT_SECRET", "dev-insecure-secret-change-me"),

  // ---- Multi-Tenant: تراخيص/اشتراكات + تشفير اتصال Meta ----
  encryptionKey: required("ENCRYPTION_KEY"),
  superAdminJwtSecret: required("SUPERADMIN_JWT_SECRET", "dev-insecure-superadmin-secret-change-me"),

  // الـWorkspace الذي يستمر خط Webhook/Insights/Sheets القديم (أحادي المستأجر عبر .env) بالكتابة
  // إليه بعد الانتقال لـPostgres. يُملأ بمعرّف الـWorkspace الناتج من seed:workspace ثم
  // migrate:sqlite-to-postgres. راجع DECISIONS.md.
  legacyWorkspaceId: required("LEGACY_WORKSPACE_ID"),

  googleSheetsEnabled: required("GOOGLE_SHEETS_ENABLED", "false") === "true",
  googleSheetId: required("GOOGLE_SHEET_ID"),
  googleServiceAccountEmail: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
  googleServiceAccountKeyFile: required("GOOGLE_SERVICE_ACCOUNT_KEY_FILE"),
};

export const isMetaConfigured = () =>
  Boolean(env.metaAppId && env.metaAppSecret && env.metaPageAccessToken);
