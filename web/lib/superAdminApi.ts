const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// جلسة Super Admin منفصلة تمامًا عن جلسة مستخدمي الـWorkspaces (مفتاح localStorage مختلف،
// مسار إعادة توجيه مختلف عند 401) - لا يوجد أي تقاطع بين الواجهتين.
export function getSuperAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("superadmin_token");
}

export function setSuperAdminToken(token: string) {
  localStorage.setItem("superadmin_token", token);
}

export function clearSuperAdminToken() {
  localStorage.removeItem("superadmin_token");
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function superAdminApiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getSuperAdminToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearSuperAdminToken();
    if (typeof window !== "undefined") window.location.href = "/superadmin/login";
    throw new ApiError("غير مصرح", 401);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error ?? "حدث خطأ", res.status);
  return data as T;
}
