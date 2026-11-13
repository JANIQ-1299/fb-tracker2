"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

type Order = { orderId: string; name: string; phone: string; city: string; quantity: number; price: number; receivedAt: string; confirmed: boolean; couponApplied?: boolean };

export default function OrdersPage() {
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiFetch<{ items: Order[] }>("/api/public/nadhara-orders").then((r) => setItems(r.items)).finally(() => setLoading(false)); }, []);
  return <div>
    <div className="dashboard-heading"><div><p className="eyebrow">طلبات الموقع</p><h2 className="page-title">طلبات نضارة ({items.length})</h2><p className="page-subtitle">كل الطلبات التي وصلت من صفحة الهبوط.</p></div></div>
    {loading ? <p>جارٍ التحميل...</p> : items.length === 0 ? <div className="card">لا توجد طلبات مسجلة بعد.</div> : <div className="table-wrap"><table><thead><tr><th>الاسم</th><th>الهاتف</th><th>المحافظة</th><th>الكمية</th><th>السعر</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>{items.map((o) => <tr key={o.orderId}><td>{o.name}</td><td dir="ltr">{o.phone}</td><td>{o.city}</td><td>{o.quantity}</td><td>{o.price.toLocaleString("ar-IQ")} د.ع</td><td><span className={`badge ${o.confirmed ? "success" : "warning"}`}>{o.confirmed ? "مؤكد" : "جديد"}</span></td><td>{new Date(o.receivedAt).toLocaleString("ar-IQ")}</td></tr>)}</tbody></table></div>}
  </div>;
}
