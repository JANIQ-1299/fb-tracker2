import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";
import { encryptToken } from "../lib/crypto.js";
import { getEffectiveSubscription } from "../lib/subscription.js";
import { requireUser, type WorkspaceAuthedRequest } from "../middleware/workspaceAuth.js";
import { requireActiveWorkspace, requireSystemActive } from "../middleware/workspaceGuard.js";
import { signOAuthState, verifyOAuthState } from "../lib/metaOAuthState.js";
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchMetaUserProfile,
  META_OAUTH_SCOPES,
} from "../lib/metaOAuthClient.js";

export const metaOAuthRouter = Router();

// الخطوة 1: يطلبها المستخدم المسجَّل دخوله فقط (توكن Bearer)، تُعيد رابط Facebook فقط - التوجيه
// الفعلي (window.location.href) يتم من الواجهة، وليس من الخادم، حتى يبقى هذا نداء API عاديًا.
metaOAuthRouter.get(
  "/start",
  requireUser,
  requireSystemActive,
  requireActiveWorkspace,
  (req: WorkspaceAuthedRequest, res) => {
    const state = signOAuthState(req.user!.workspaceId, req.user!.id);
    res.json({ url: buildAuthorizationUrl(state) });
  },
);

// الخطوة 2: Facebook يُعيد توجيه المتصفح مباشرة إلى هذا المسار (GET عادي، بدون Authorization
// header). التحقق من الهوية هنا يتم عبر state الموقَّع، وليس عبر كوكي/توكن الجلسة.
metaOAuthRouter.get("/callback", async (req, res) => {
  const webBase = env.webPublicBaseUrl;
  const { code, state, error, error_description: errorDescription } = req.query as Record<string, string>;

  if (error) {
    logger.warn({ error, errorDescription }, "Meta OAuth: رفض المستخدم الموافقة أو حدث خطأ");
    return res.redirect(`${webBase}/workspace/meta?error=${encodeURIComponent(errorDescription ?? error)}`);
  }
  if (!code || !state) {
    return res.redirect(`${webBase}/workspace/meta?error=missing_code_or_state`);
  }

  let claims;
  try {
    claims = verifyOAuthState(state);
  } catch {
    return res.redirect(`${webBase}/workspace/meta?error=invalid_or_expired_state`);
  }

  const { status } = await getEffectiveSubscription(claims.workspaceId);
  if (status !== "ACTIVE") {
    return res.redirect(`${webBase}/workspace/meta?error=workspace_not_active`);
  }

  try {
    const shortLived = await exchangeCodeForToken(code);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    const profile = await fetchMetaUserProfile(longLived.access_token);
    const encrypted = encryptToken(longLived.access_token);

    const tokenExpiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000)
      : null;

    const connection = await prisma.metaConnection.upsert({
      where: { workspaceId_metaUserId: { workspaceId: claims.workspaceId, metaUserId: profile.id } },
      update: {
        accessTokenEncrypted: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenTag: encrypted.tag,
        tokenExpiresAt,
        scopes: META_OAUTH_SCOPES,
        status: "CONNECTED",
        lastCheckedAt: new Date(),
      },
      create: {
        workspaceId: claims.workspaceId,
        metaUserId: profile.id,
        accessTokenEncrypted: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenTag: encrypted.tag,
        tokenExpiresAt,
        scopes: META_OAUTH_SCOPES,
        status: "CONNECTED",
        createdBy: claims.userId,
      },
    });

    logger.info(
      { workspaceId: claims.workspaceId, connectionId: connection.id },
      "تم ربط حساب Meta بنجاح عبر OAuth",
    );
    return res.redirect(`${webBase}/workspace/meta?connectionId=${connection.id}`);
  } catch (err) {
    logger.error({ err: (err as Error).message }, "فشل تبادل توكن Meta OAuth");
    return res.redirect(`${webBase}/workspace/meta?error=token_exchange_failed`);
  }
});
