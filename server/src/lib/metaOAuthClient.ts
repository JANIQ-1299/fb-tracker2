import axios from "axios";
import { env } from "./env.js";
import { metaGet } from "./meta.js";

const GRAPH_BASE = "https://graph.facebook.com";
const DIALOG_BASE = "https://www.facebook.com";

// Facebook Login الكلاسيكي (scope-based) - وليس Facebook Login for Business بـConfiguration ID،
// لأننا في وضع Development/Test مع أصولنا الخاصة فقط، ولا حاجة لإعداد "Login Configuration"
// إضافي في لوحة تحكم Meta الآن. راجع DECISIONS.md.
export const META_OAUTH_SCOPES =
  "public_profile,pages_show_list,pages_read_engagement,ads_read,business_management";

export function getOAuthRedirectUri(): string {
  return `${env.publicBaseUrl}/api/meta/oauth/callback`;
}

export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.metaAppId,
    redirect_uri: getOAuthRedirectUri(),
    state,
    scope: META_OAUTH_SCOPES,
    response_type: "code",
  });
  return `${DIALOG_BASE}/${env.metaGraphApiVersion}/dialog/oauth?${params.toString()}`;
}

interface OAuthTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

/**
 * تبادل code القادم من Facebook بتوكن قصير الأمد. نداء مباشر (ليس عبر metaGet) عمدًا: نقاط
 * oauth/access_token لا تقبل ولا تحتاج access_token ضمن الـquery، وmetaGet يُرفقه دائمًا من env
 * بشكل غير مناسب هنا.
 */
export async function exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
  const res = await axios.get<OAuthTokenResponse>(
    `${GRAPH_BASE}/${env.metaGraphApiVersion}/oauth/access_token`,
    {
      params: {
        client_id: env.metaAppId,
        client_secret: env.metaAppSecret,
        redirect_uri: getOAuthRedirectUri(),
        code,
      },
      timeout: 15_000,
    },
  );
  return res.data;
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<OAuthTokenResponse> {
  const res = await axios.get<OAuthTokenResponse>(
    `${GRAPH_BASE}/${env.metaGraphApiVersion}/oauth/access_token`,
    {
      params: {
        grant_type: "fb_exchange_token",
        client_id: env.metaAppId,
        client_secret: env.metaAppSecret,
        fb_exchange_token: shortLivedToken,
      },
      timeout: 15_000,
    },
  );
  return res.data;
}

export interface MetaUserProfile {
  id: string;
  name?: string;
}

export async function fetchMetaUserProfile(accessToken: string): Promise<MetaUserProfile> {
  return metaGet<MetaUserProfile>("me", { fields: "id,name" }, { accessToken });
}

export interface MetaPageAsset {
  id: string;
  name: string;
}

export interface MetaAdAccountAsset {
  id: string; // بصيغة act_XXXXXXXXXX من Graph API
  account_id: string; // الرقم الخام بدون بادئة act_
  name: string;
  currency?: string;
}

export async function fetchUserPages(accessToken: string): Promise<MetaPageAsset[]> {
  const res = await metaGet<{ data: MetaPageAsset[] }>(
    "me/accounts",
    { fields: "id,name", limit: "200" },
    { accessToken },
  );
  return res.data ?? [];
}

export async function fetchUserAdAccounts(accessToken: string): Promise<MetaAdAccountAsset[]> {
  const res = await metaGet<{ data: MetaAdAccountAsset[] }>(
    "me/adaccounts",
    { fields: "account_id,name,currency", limit: "200" },
    { accessToken },
  );
  return res.data ?? [];
}

/** يتحقق من صلاحية التوكن الحالي فعليًا مقابل Graph API - يُستخدم في زر "اختبار الاتصال". */
export async function verifyTokenIsValid(accessToken: string): Promise<boolean> {
  try {
    await fetchMetaUserProfile(accessToken);
    return true;
  } catch {
    return false;
  }
}
