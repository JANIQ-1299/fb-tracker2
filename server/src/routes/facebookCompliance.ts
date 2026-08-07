import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { encryptToken } from "../lib/crypto.js";

// نقطتا نهاية داخليتان فقط (لا تُستدعيان مباشرة من Meta): تطبيق الويب (web/app/facebook/*)
// يتحقق من توقيع signed_request بنفسه أولًا (FACEBOOK_APP_SECRET، نفس قيمة META_APP_SECRET
// هنا فعليًا لأنه نفس تطبيق Meta)، ثم يستدعي هاتين النقطتين بمعرّف Facebook User ID المُتحقَّق منه
// فقط - لا signed_request ولا أي بيانات خام تصل هنا إطلاقًا. الحماية: ترويسة x-internal-secret
// يجب أن تطابق META_APP_SECRET (قيمة لا يعرفها إلا خادمانا).
export const facebookComplianceRouter = Router();

function requireInternalSecret(req: any, res: any): boolean {
  const provided = req.header("x-internal-secret") ?? "";
  const expected = env.metaAppSecret;
  if (!expected) {
    res.status(500).json({ error: "الخادم غير مهيأ" });
    return false;
  }
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  const valid =
    providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
  if (!valid) {
    res.status(401).json({ error: "غير مصرح" });
    return false;
  }
  return true;
}

/** يُبطل كل MetaConnection المرتبط بمعرّف مستخدم Facebook هذا: يضبط الحالة REVOKED ويستبدل
 * التوكن المشفَّر بقيمة فارغة مشفَّرة (بدل حذف الصف، تجنبًا لتعارض المفاتيح الأجنبية مع
 * Page/AdAccount التي قد تُشير إليه). لا تُسجَّل أي بيانات شخصية في الـlogger. */
async function revokeMetaConnectionsForFbUser(fbUserId: string): Promise<number> {
  const connections = await prisma.metaConnection.findMany({ where: { metaUserId: fbUserId } });
  if (connections.length === 0) return 0;

  const empty = encryptToken("");
  await prisma.metaConnection.updateMany({
    where: { metaUserId: fbUserId },
    data: {
      status: "REVOKED",
      accessTokenEncrypted: empty.ciphertext,
      tokenIv: empty.iv,
      tokenTag: empty.tag,
    },
  });
  return connections.length;
}

facebookComplianceRouter.post("/deauthorize", async (req, res) => {
  if (!requireInternalSecret(req, res)) return;
  const fbUserId = req.body?.fbUserId;
  if (!fbUserId || typeof fbUserId !== "string") {
    return res.status(400).json({ error: "fbUserId مفقود" });
  }

  try {
    const revokedCount = await revokeMetaConnectionsForFbUser(fbUserId);
    logger.info({ revokedCount }, "تم إلغاء تصريح مستخدم Facebook (deauthorize)");
    res.json({ ok: true, revokedCount });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "فشل إلغاء تصريح مستخدم Facebook");
    res.status(500).json({ error: "فشل تنفيذ الإلغاء" });
  }
});

facebookComplianceRouter.post("/data-deletion", async (req, res) => {
  if (!requireInternalSecret(req, res)) return;
  const fbUserId = req.body?.fbUserId;
  if (!fbUserId || typeof fbUserId !== "string") {
    return res.status(400).json({ error: "fbUserId مفقود" });
  }

  const confirmationCode = crypto.randomBytes(16).toString("hex");
  try {
    const revokedCount = await revokeMetaConnectionsForFbUser(fbUserId);
    await prisma.syncLog.create({
      data: {
        source: "meta_data_deletion_request",
        status: "SUCCESS",
        completedAt: new Date(),
        details: JSON.stringify({ confirmationCode, revokedCount }),
      },
    });
    logger.info({ revokedCount }, "تم تنفيذ طلب حذف بيانات مستخدم Facebook");
    res.json({ confirmationCode });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "فشل تنفيذ طلب حذف بيانات مستخدم Facebook");
    res.status(500).json({ error: "فشل تنفيذ الحذف" });
  }
});

// عام (بلا سر داخلي) - لا يُرجع أي بيانات شخصية، فقط حالة عامة قابلة للعرض في صفحة حالة الحذف.
facebookComplianceRouter.get("/data-deletion-status", async (req, res) => {
  const code = req.query.code;
  if (!code || typeof code !== "string") {
    return res.status(400).json({ found: false });
  }
  const log = await prisma.syncLog.findFirst({
    where: { source: "meta_data_deletion_request", details: { contains: code } },
  });
  res.json({ found: Boolean(log), completedAt: log?.completedAt ?? null });
});
