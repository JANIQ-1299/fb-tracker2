import crypto from "node:crypto";
import { env } from "./env.js";

// تشفير توكنات Meta المخزّنة في MetaConnection بـ AES-256-GCM. المفتاح (32 بايت) يأتي من
// ENCRYPTION_KEY (env)، مُشفَّر كـhex. لا يُعاد فك التشفير أو إرسال الناتج للواجهة أبدًا —
// فقط يُستخدم داخل الخادم عند الحاجة لاستدعاء Graph API نيابة عن المستخدم.

function getKey(): Buffer {
  const key = Buffer.from(env.encryptionKey, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY يجب أن يكون 32 بايت (64 حرف hex) بالضبط");
  }
  return key;
}

export interface EncryptedToken {
  ciphertext: string; // base64
  iv: string; // base64
  tag: string; // base64
}

export function encryptToken(plaintext: string): EncryptedToken {
  const iv = crypto.randomBytes(12); // GCM القياسي
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptToken(encrypted: EncryptedToken): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(encrypted.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
