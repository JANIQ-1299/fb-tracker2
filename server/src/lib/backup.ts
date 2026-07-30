import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** نسخ احتياطي بسيط لملف SQLite المحلي. للإنتاج على PostgreSQL استخدم pg_dump (راجع DEPLOYMENT.md). */
function runBackup() {
  const isSqlite = env.databaseUrl.startsWith("file:");
  if (!isSqlite) {
    logger.warn("قاعدة البيانات ليست SQLite - استخدم pg_dump للنسخ الاحتياطي (راجع DEPLOYMENT.md)");
    return;
  }

  const dbRelativePath = env.databaseUrl.replace("file:", "");
  const dbPath = path.resolve(__dirname, "../../prisma", dbRelativePath);
  if (!fs.existsSync(dbPath)) {
    logger.error({ dbPath }, "ملف قاعدة البيانات غير موجود");
    return;
  }

  const backupDir = path.resolve(__dirname, "../../../backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(backupDir, `dev-${stamp}.db`);
  fs.copyFileSync(dbPath, dest);
  logger.info({ dest }, "تم إنشاء نسخة احتياطية");
}

runBackup();
