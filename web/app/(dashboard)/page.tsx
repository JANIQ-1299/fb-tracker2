"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

interface Summary {
  totalLeads: number;
  ordersCount: number;
  conversionRate: number;
  orderValue: number;
  spend: number;
  cpl: number | null;
  cpa: number | null;
  duplicateCount: number;
  bestAd: any;
  worstAd: any;
  bestVideo: any;
}

const RANGES = [
  { key: "today", label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "7d", label: "آخر 7 أيام" },
  { key: "30d", label: "آخر 30 يومًا" },
  { key: "all", label: "الكل" },
];

function rangeToDates(key: string): { dateFrom?: string; dateTo?: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  if (key === "today") return { dateFrom: startOfDay(now) };
  if (key === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const start = startOfDay(y);
    const end = startOfDay(now);
    return { dateFrom: start, dateTo: end };
  }
  if (key === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { dateFrom: d.toISOString() };
  }
  if (key === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return { dateFrom: d.toISOString() };
  }
  return {};
}

export default function DashboardHome() {
  const [range, setRange] = useState("30d");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const { dateFrom, dateTo } = rangeToDates(range);
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    apiFetch<Summary>(`/api/reports/summary?${params.toString()}`)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [range]);

  return (
    <div>
      <h2 className="page-title">نظرة عامة</h2>
      <div className="filters">
        {RANGES.map((r) => (
          <button
            key={r.key}
            className={`btn ${range === r.key ? "" : "secondary"}`}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading || !summary ? (
        <p>جارٍ التحميل...</p>
      ) : (
        <>
          <div className="cards">
            <Card label="إجمالي العملاء المحتملين" value={summary.totalLeads} />
            <Card label="تم تقديم الطلب" value={summary.ordersCount} />
            <Card label="نسبة التحويل" value={`${summary.conversionRate}%`} />
            <Card label="قيمة الطلبات" value={summary.orderValue.toLocaleString("ar-IQ")} />
            <Card label="الإنفاق الإعلاني" value={summary.spend.toLocaleString("ar-IQ")} />
            <Card label="تكلفة العميل المحتمل (CPL)" value={summary.cpl ?? "-"} />
            <Card label="تكلفة الطلب (CPA)" value={summary.cpa ?? "-"} />
            <Card label="عملاء مكررون" value={summary.duplicateCount} />
          </div>

          <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <BestWorstCard title="أفضل إعلان" item={summary.bestAd} field="adName" />
            <BestWorstCard title="أسوأ إعلان" item={summary.worstAd} field="adName" />
            <BestWorstCard title="أفضل فيديو" item={summary.bestVideo} field="videoId" />
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function BestWorstCard({ title, item, field }: { title: string; item: any; field: string }) {
  return (
    <div className="card">
      <div className="label">{title}</div>
      {item ? (
        <>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{item[field] ?? "غير معروف"}</div>
          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
            عملاء: {item.leadsCount ?? 0} · طلبات: {item.ordersCount ?? 0}
          </div>
        </>
      ) : (
        <div style={{ color: "var(--text-dim)" }}>لا توجد بيانات بعد</div>
      )}
    </div>
  );
}
