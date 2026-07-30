"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

interface VideoRow {
  videoId: string | null;
  videoName: string | null;
  thumbnailUrl: string | null;
  adNames: string[];
  campaignNames: string[];
  spend: number;
  metaRecordedOrders: number;
  metaCostPerOrder: number | null;
  reconciliationStatus: string;
  lastOrderAt: string | null;
}

interface Report {
  generatedAt: string;
  timezone: string;
  windowStart: string;
  windowEnd: string;
  summary: {
    totalSpend: number;
    metaRecordedOrders: number;
    averageMetaCostPerOrder: number | null;
    lastSuccessfulSync: string | null;
    lastSyncStatus: string;
  };
  videos: VideoRow[];
  dataLimitations: string[];
}

export default function Last24HoursPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  function load() {
    setLoading(true);
    apiFetch<Report>("/api/dashboard/last-24-hours")
      .then(setReport)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function refreshNow() {
    setRefreshing(true);
    try {
      await apiFetch("/api/settings/resync", { method: "POST" });
      load();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <h2 className="page-title">آخر 24 ساعة (نافذة متحركة حقيقية)</h2>

      <div className="filters">
        <button className="btn" onClick={refreshNow} disabled={refreshing}>
          {refreshing ? "جارٍ التحديث..." : "تحديث الآن"}
        </button>
      </div>

      {loading || !report ? (
        <p>جارٍ التحميل...</p>
      ) : (
        <>
          <div className="cards">
            <Card label="الطلبات المسجّلة من Meta" value={report.summary.metaRecordedOrders} />
            <Card label="الإنفاق" value={report.summary.totalSpend.toLocaleString("ar-IQ")} />
            <Card label="متوسط تكلفة الطلب" value={report.summary.averageMetaCostPerOrder ?? "لا توجد طلبات"} />
            <Card
              label="آخر مزامنة ناجحة"
              value={report.summary.lastSuccessfulSync ? new Date(report.summary.lastSuccessfulSync).toLocaleString("ar-IQ") : "-"}
            />
          </div>

          {report.dataLimitations.length > 0 && (
            <div className="card" style={{ marginBottom: 20, borderRight: "3px solid var(--warning)" }}>
              <div className="label">قيود بيانات مهمة</div>
              {report.dataLimitations.map((l, i) => (
                <p key={i} style={{ fontSize: 13, color: "var(--text-dim)", margin: "6px 0" }}>
                  {l}
                </p>
              ))}
            </div>
          )}

          <h3 style={{ fontSize: 16, marginBottom: 12 }}>أداء الفيديوهات خلال آخر 24 ساعة</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>صورة</th>
                  <th>الفيديو</th>
                  <th>الإعلان(ات)</th>
                  <th>الحملة</th>
                  <th>الإنفاق</th>
                  <th>طلبات Meta</th>
                  <th>تكلفة الطلب</th>
                  <th>حالة المطابقة</th>
                  <th>آخر طلب</th>
                </tr>
              </thead>
              <tbody>
                {report.videos.map((v, i) => (
                  <tr key={i}>
                    <td>{v.thumbnailUrl ? <img src={v.thumbnailUrl} className="thumb" alt="" /> : <div className="thumb" />}</td>
                    <td>{v.videoId ?? v.videoName ?? "-"}</td>
                    <td>{v.adNames.join("، ")}</td>
                    <td>{v.campaignNames.join("، ")}</td>
                    <td>{v.spend.toLocaleString("ar-IQ")}</td>
                    <td>{v.metaRecordedOrders}</td>
                    <td>{v.metaRecordedOrders === 0 ? "لا توجد طلبات" : (v.metaCostPerOrder ?? "-")}</td>
                    <td>
                      <span className={`badge ${v.reconciliationStatus === "mixed_creative" ? "warning" : "success"}`}>
                        {v.reconciliationStatus === "mixed_creative" ? "إعلان متعدد الفيديوهات" : "من Meta فقط"}
                      </span>
                    </td>
                    <td>{v.lastOrderAt ? new Date(v.lastOrderAt).toLocaleString("ar-IQ") : "-"}</td>
                  </tr>
                ))}
                {report.videos.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", color: "var(--text-dim)" }}>
                      لا يوجد نشاط مسجَّل خلال آخر 24 ساعة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
