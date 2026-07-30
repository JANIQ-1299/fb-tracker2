import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { decryptToken } from "../lib/crypto.js";
import { requireUser, type WorkspaceAuthedRequest } from "../middleware/workspaceAuth.js";
import { requireActiveWorkspace, requireSystemActive } from "../middleware/workspaceGuard.js";
import { fetchUserAdAccounts, fetchUserPages, verifyTokenIsValid } from "../lib/metaOAuthClient.js";

export const metaConnectionsRouter = Router();
metaConnectionsRouter.use(requireUser, requireSystemActive, requireActiveWorkspace);

// select فقط - لا يُرسَل أي حقل توكن للواجهة أبدًا مهما كان السياق.
const CONNECTION_SAFE_SELECT = {
  id: true,
  metaUserId: true,
  status: true,
  scopes: true,
  connectedAt: true,
  tokenExpiresAt: true,
  lastCheckedAt: true,
  lastSyncAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * يحمّل الاتصال ويتأكد أنه يخص Workspace المستخدم الحالي حصرًا - أي طلب لاتصال يخص Workspace
 * آخر يُرفض بـ404 (وليس 403) حتى لا يُسرَّب حتى وجوده لمستخدم لا يملك صلاحية عليه.
 */
async function loadOwnedConnection(req: WorkspaceAuthedRequest, connectionId: string) {
  const connection = await prisma.metaConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.workspaceId !== req.user!.workspaceId) return null;
  return connection;
}

metaConnectionsRouter.get("/", async (req: WorkspaceAuthedRequest, res) => {
  const connections = await prisma.metaConnection.findMany({
    where: { workspaceId: req.user!.workspaceId },
    select: CONNECTION_SAFE_SELECT,
    orderBy: { connectedAt: "desc" },
  });
  res.json({ connections });
});

metaConnectionsRouter.get("/:id/assets", async (req: WorkspaceAuthedRequest, res) => {
  const connection = await loadOwnedConnection(req, req.params.id);
  if (!connection) return res.status(404).json({ error: "الاتصال غير موجود" });

  const [subscription, currentPages, currentAdAccounts] = await Promise.all([
    prisma.workspaceSubscription.findUnique({ where: { workspaceId: req.user!.workspaceId } }),
    prisma.page.findMany({ where: { workspaceId: req.user!.workspaceId } }),
    prisma.adAccount.findMany({ where: { workspaceId: req.user!.workspaceId } }),
  ]);

  try {
    const token = decryptToken({
      ciphertext: connection.accessTokenEncrypted,
      iv: connection.tokenIv,
      tag: connection.tokenTag,
    });
    const [pages, adAccounts] = await Promise.all([fetchUserPages(token), fetchUserAdAccounts(token)]);

    res.json({
      connection: { id: connection.id, status: connection.status, scopes: connection.scopes },
      pages,
      adAccounts,
      selectedPageIds: currentPages.filter((p) => p.metaConnectionId === connection.id).map((p) => p.metaPageId),
      selectedAdAccountIds: currentAdAccounts
        .filter((a) => a.metaConnectionId === connection.id)
        .map((a) => a.metaAdAccountId),
      limits: {
        maxPages: subscription?.maxPages ?? 0,
        maxAdAccounts: subscription?.maxAdAccounts ?? 0,
        currentPages: currentPages.length,
        currentAdAccounts: currentAdAccounts.length,
      },
    });
  } catch (err) {
    logger.error({ err: (err as Error).message, connectionId: connection.id }, "فشل جلب أصول Meta");
    await prisma.metaConnection.update({
      where: { id: connection.id },
      data: { status: "EXPIRED", lastCheckedAt: new Date() },
    });
    res.status(502).json({ error: "تعذّر جلب الصفحات/الحسابات من Meta - قد يكون التوكن منتهيًا", requiresReauth: true });
  }
});

const selectSchema = z.object({
  pageId: z.string().optional(),
  adAccountId: z.string().optional(),
});

metaConnectionsRouter.post("/:id/select", async (req: WorkspaceAuthedRequest, res) => {
  const connection = await loadOwnedConnection(req, req.params.id);
  if (!connection) return res.status(404).json({ error: "الاتصال غير موجود" });

  const parsed = selectSchema.safeParse(req.body);
  if (!parsed.success || (!parsed.data.pageId && !parsed.data.adAccountId)) {
    return res.status(400).json({ error: "يجب اختيار صفحة أو حساب إعلاني واحد على الأقل" });
  }
  const { pageId, adAccountId } = parsed.data;
  const workspaceId = req.user!.workspaceId; // لا نثق بأي workspaceId من الطلب - فقط من الجلسة

  const token = decryptToken({
    ciphertext: connection.accessTokenEncrypted,
    iv: connection.tokenIv,
    tag: connection.tokenTag,
  });

  const [availablePages, availableAdAccounts, subscription] = await Promise.all([
    fetchUserPages(token),
    fetchUserAdAccounts(token),
    prisma.workspaceSubscription.findUnique({ where: { workspaceId } }),
  ]);

  if (pageId) {
    const match = availablePages.find((p) => p.id === pageId);
    if (!match) {
      return res.status(403).json({ error: "لا تملك صلاحية على هذه الصفحة في حساب Meta المرتبط" });
    }
    const existing = await prisma.page.findUnique({ where: { workspaceId_metaPageId: { workspaceId, metaPageId: pageId } } });
    if (!existing) {
      const currentCount = await prisma.page.count({ where: { workspaceId } });
      if (currentCount >= (subscription?.maxPages ?? 0)) {
        return res.status(403).json({
          error: `وصلت للحد الأقصى المسموح من الصفحات (${subscription?.maxPages ?? 0}) لخطتك الحالية`,
        });
      }
    }
    await prisma.page.upsert({
      where: { workspaceId_metaPageId: { workspaceId, metaPageId: pageId } },
      update: { name: match.name, metaConnectionId: connection.id },
      create: { workspaceId, metaPageId: pageId, name: match.name, metaConnectionId: connection.id },
    });
  }

  if (adAccountId) {
    const match = availableAdAccounts.find((a) => a.account_id === adAccountId);
    if (!match) {
      return res.status(403).json({ error: "لا تملك صلاحية على هذا الحساب الإعلاني في حساب Meta المرتبط" });
    }
    const existing = await prisma.adAccount.findUnique({
      where: { workspaceId_metaAdAccountId: { workspaceId, metaAdAccountId: adAccountId } },
    });
    if (!existing) {
      const currentCount = await prisma.adAccount.count({ where: { workspaceId } });
      if (currentCount >= (subscription?.maxAdAccounts ?? 0)) {
        return res.status(403).json({
          error: `وصلت للحد الأقصى المسموح من الحسابات الإعلانية (${subscription?.maxAdAccounts ?? 0}) لخطتك الحالية`,
        });
      }
    }
    await prisma.adAccount.upsert({
      where: { workspaceId_metaAdAccountId: { workspaceId, metaAdAccountId: adAccountId } },
      update: { name: match.name, currency: match.currency ?? "USD", metaConnectionId: connection.id },
      create: {
        workspaceId,
        metaAdAccountId: adAccountId,
        name: match.name,
        currency: match.currency ?? "USD",
        metaConnectionId: connection.id,
      },
    });
  }

  logger.info({ workspaceId, connectionId: connection.id, pageId, adAccountId }, "تم اختيار أصول Meta");
  res.json({ ok: true });
});

metaConnectionsRouter.post("/:id/test", async (req: WorkspaceAuthedRequest, res) => {
  const connection = await loadOwnedConnection(req, req.params.id);
  if (!connection) return res.status(404).json({ error: "الاتصال غير موجود" });

  const token = decryptToken({
    ciphertext: connection.accessTokenEncrypted,
    iv: connection.tokenIv,
    tag: connection.tokenTag,
  });
  const valid = await verifyTokenIsValid(token);
  const updated = await prisma.metaConnection.update({
    where: { id: connection.id },
    data: { status: valid ? "CONNECTED" : "EXPIRED", lastCheckedAt: new Date() },
    select: CONNECTION_SAFE_SELECT,
  });
  res.json({ valid, connection: updated });
});

metaConnectionsRouter.delete("/:id", async (req: WorkspaceAuthedRequest, res) => {
  const connection = await loadOwnedConnection(req, req.params.id);
  if (!connection) return res.status(404).json({ error: "الاتصال غير موجود" });

  // إلغاء الربط لا يحذف Page/AdAccount/Campaign أو أي بيانات تاريخية - فقط يُبطل التوكن المخزَّن.
  await prisma.metaConnection.update({
    where: { id: connection.id },
    data: { status: "REVOKED", accessTokenEncrypted: "", tokenIv: "", tokenTag: "", tokenExpiresAt: null },
  });
  logger.info({ workspaceId: req.user!.workspaceId, connectionId: connection.id }, "تم إلغاء ربط اتصال Meta");
  res.json({ ok: true });
});
