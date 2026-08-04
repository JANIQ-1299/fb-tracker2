const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// جلسة مستخدمي الـWorkspaces (النظام الجديد Multi-Tenant) - منفصلة عن جلسة لوحة التحكم القديمة
// (session_token) وعن جلسة Super Admin (superadmin_token).
export function getWorkspaceToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("workspace_token");
}

export function setWorkspaceToken(token: string) {
  localStorage.setItem("workspace_token", token);
}

export function clearWorkspaceToken() {
  localStorage.removeItem("workspace_token");
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public workspaceStatus?: string,
  ) {
    super(message);
  }
}

export async function workspaceApiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getWorkspaceToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    clearWorkspaceToken();
    if (typeof window !== "undefined") window.location.href = "/workspace/login";
    throw new ApiError(data?.error ?? "غير مصرح", 401);
  }
  // 403 من requireActiveWorkspace/requireSystemActive يحمل رسالة صريحة يجب عرضها كما هي،
  // وليس معاملتها كخطأ عام - راجع server/src/middleware/workspaceGuard.ts
  if (!res.ok) throw new ApiError(data?.error ?? "حدث خطأ", res.status, data?.workspaceStatus);
  return data as T;
}

/** لتنزيل ملفات (مثل تصدير Excel) - يستخدم fetch + Authorization header وليس <a href> مباشرة،
 * لأن التوثيق هنا عبر Bearer token في localStorage وليس كوكي جلسة. */
export async function workspaceApiDownload(path: string, suggestedFilename: string): Promise<void> {
  const token = getWorkspaceToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data?.error ?? "فشل تصدير الملف", res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
