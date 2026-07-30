import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** استعادة نسخة احتياطية من مجلد backups/ إلى قاعدة بيانات SQLite المحلية. الاستخدام: npm run restore -- <اسم-الملف> */
function runRestore() {
  const isSqlite = env.databaseUrl.startsWith("file:");
  if (!isSqlite) {
    logger.warn("قاعدة البيانات ليست SQLite - استخدم pg_restore للاستعادة (راجع DEPLOYMENT.md)");
    return;
  }

  const fileArg = process.argv[2];
  const backupDir = path.resolve(__dirname, "../../../backups");

  if (!fileArg) {
    const files = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).sort().reverse() : [];
    logger.info({ files }, "حدد اسم ملف النسخة الاحتياطية: npm run restore -- <filename>");
    return;
  }

  const src = path.join(backupDir, fileArg);
  if (!fs.existsSync(src)) {
    logger.error({ src }, "ملف النسخة الاحتياطية غير موجود");
    return;
  }

  const dbRelativePath = env.databaseUrl.replace("file:", "");
  const dbPath = path.resolve(__dirname, "../../prisma", dbRelativePath);

  // احتياط إضافي: احفظ نسخة من القاعدة الحالية قبل الاستبدال بلاحقة .before-restore
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, `${dbPath}.before-restore-${Date.now()}`);
  }

  fs.copyFileSync(src, dbPath);
  logger.info({ src, dbPath }, "تمت الاستعادة بنجاح");
}

runRestore();
