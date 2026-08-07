// استدعاءات من طرف الخادم فقط (Route Handlers) نحو الخادم الحقيقي (server/) بعد التحقق من
// signed_request محليًا هنا في تطبيق الويب. يُرسَل فقط fbUserId المُتحقَّق منه - لا signed_request
// خامًا ولا أي بيانات شخصية أخرى. الحماية: ترويسة x-internal-secret يجب أن تطابق META_APP_SECRET
// في الخادم - نستخدم هنا نفس القيمة الحقيقية المخزَّنة باسم FACEBOOK_APP_SECRET (نفس سر تطبيق
// Meta نفسه، بمتغيّر بيئة منفصل خاص بخدمة الويب).

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function callInternal<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!secret) return null;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function notifyDeauthorize(fbUserId: string): Promise<boolean> {
  const result = await callInternal<{ ok: boolean }>("/api/facebook/deauthorize", { fbUserId });
  return result?.ok === true;
}

export async function notifyDataDeletion(fbUserId: string): Promise<string | null> {
  const result = await callInternal<{ confirmationCode: string }>("/api/facebook/data-deletion", { fbUserId });
  return result?.confirmationCode ?? null;
}

export async function checkDataDeletionStatus(code: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/facebook/data-deletion-status?code=${encodeURIComponent(code)}`);
    if (!res.ok) return false;
    const data = await res.json();
    return data?.found === true;
  } catch {
    return false;
  }
}
