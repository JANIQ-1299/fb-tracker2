const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export interface NadharaOrderInput {
  name: string;
  phone: string;
  city: string;
  address: string;
  quantity: number;
  notes?: string;
  // كوكيز بكسل Meta - لتحسين مطابقة حدث Purchase لاحقًا (راجع lib/pixel.ts)
  fbp?: string;
  fbc?: string;
  // حقل فخ مخفي لمكافحة السبام - يجب أن يبقى فارغًا (راجع server/src/routes/nadharaOrders.ts)
  website?: string;
}

// نقطة نهاية عامة بلا مصادقة، لذا لا نستخدم apiFetch (يُرفق توكن ويعيد التوجيه لصفحة الدخول عند 401)
export async function submitNadharaOrder(input: NadharaOrderInput): Promise<{ ok: true }> {
  const res = await fetch(`${API_BASE}/api/public/nadhara-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? "حدث خطأ أثناء إرسال الطلب، الرجاء المحاولة مرة أخرى");
  }
  return data;
}
