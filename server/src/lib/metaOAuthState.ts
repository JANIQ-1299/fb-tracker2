import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "./env.js";

// حالة OAuth موقّعة قصيرة العمر (10 دقائق) تحمل هوية المستخدم/الـWorkspace عبر إعادة توجيه
// المتصفح كاملة إلى Facebook والعودة - لا يمكن الاعتماد على كوكي الجلسة وحده هنا لأن Facebook
// قد يعيد التوجيه إلى نطاق مختلف مؤقتًا أثناء الموافقة، وهذا يوفر تحققًا صريحًا ومقاومًا للتلاعب
// بدل الوثوق بأي معرّف يُرسله العميل ضمن الـquery.
export interface MetaOAuthStateClaims {
  typ: "meta_oauth_state";
  workspaceId: string;
  userId: string;
  nonce: string;
}

export function signOAuthState(workspaceId: string, userId: string): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  return jwt.sign({ typ: "meta_oauth_state", workspaceId, userId, nonce }, env.jwtSecret, {
    expiresIn: "10m",
  });
}

export function verifyOAuthState(state: string): MetaOAuthStateClaims {
  const payload = jwt.verify(state, env.jwtSecret) as MetaOAuthStateClaims;
  if (payload?.typ !== "meta_oauth_state" || !payload.workspaceId || !payload.userId) {
    throw new Error("invalid oauth state");
  }
  return payload;
}
