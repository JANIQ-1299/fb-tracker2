import pino from "pino";
import { env } from "./env.js";

// ملاحظة أمان: لا تمرّر أبدًا كائن يحتوي access token أو app secret لهذا الـlogger.
// جميع نقاط الاتصال بـMeta تستخدم redactedMetaLog() أدناه لإخفاء الأسرار.
export const logger = pino({
  level: env.nodeEnv === "production" ? "info" : "debug",
  redact: {
    paths: [
      "*.access_token",
      "*.accessToken",
      "*.app_secret",
      "*.appSecret",
      "req.headers.authorization",
      "*.META_PAGE_ACCESS_TOKEN",
      "*.accessTokenEncrypted",
      "*.tokenIv",
      "*.tokenTag",
      "*.passwordHash",
      "*.totpSecret",
      "*.password",
    ],
    censor: "[REDACTED]",
  },
  transport:
    env.nodeEnv === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});

export function redactedMetaLog(obj: Record<string, unknown>) {
  const clone = { ...obj };
  for (const key of Object.keys(clone)) {
    if (/token|secret/i.test(key)) clone[key] = "[REDACTED]";
  }
  return clone;
}
