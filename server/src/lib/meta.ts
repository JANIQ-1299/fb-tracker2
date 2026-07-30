import axios, { AxiosError } from "axios";
import crypto from "node:crypto";
import { env } from "./env.js";
import { logger } from "./logger.js";

const GRAPH_BASE = "https://graph.facebook.com";

export class MetaApiError extends Error {
  constructor(
    message: string,
    public code?: number,
    public subcode?: number,
    public fbtraceId?: string,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * استدعاء Graph API مع إعادة محاولة (exponential backoff) عند أخطاء rate-limit (code 4/17/32/613)
 * أو أخطاء شبكة مؤقتة (5xx). لا يُعاد المحاولة عند أخطاء صلاحيات أو مدخلات غير صالحة.
 */
export async function metaGet<T = any>(
  pathAndQuery: string,
  params: Record<string, string | number | undefined> = {},
  opts: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 500 } = opts;
  const url = `${GRAPH_BASE}/${env.metaGraphApiVersion}/${pathAndQuery}`;

  let attempt = 0;
  // access_token يُرفق دائمًا هنا، وليس في أي مكان آخر يمكن أن يُسجَّل.
  const query = { ...params, access_token: env.metaPageAccessToken };

  for (;;) {
    try {
      const res = await axios.get<T>(url, { params: query, timeout: 15_000 });
      return res.data;
    } catch (err) {
      const axErr = err as AxiosError<any>;
      const fbError = axErr.response?.data?.error;
      const status = axErr.response?.status ?? 0;
      const retryableRateLimit = fbError && [4, 17, 32, 613].includes(fbError.code);
      const retryableServer = status >= 500;

      attempt++;
      if ((retryableRateLimit || retryableServer) && attempt <= maxRetries) {
        const delay = baseDelayMs * 2 ** (attempt - 1);
        logger.warn(
          { path: pathAndQuery, attempt, delay, fbCode: fbError?.code },
          "Meta API retry",
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (fbError) {
        logger.error(
          { path: pathAndQuery, code: fbError.code, subcode: fbError.error_subcode, msg: fbError.message },
          "Meta API error",
        );
        throw new MetaApiError(fbError.message, fbError.code, fbError.error_subcode, fbError.fbtrace_id);
      }
      logger.error({ path: pathAndQuery, status, message: axErr.message }, "Meta API network error");
      throw err;
    }
  }
}

export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader || !env.metaAppSecret) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", env.metaAppSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}
