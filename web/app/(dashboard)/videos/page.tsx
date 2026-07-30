"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

interface VideoRow {
  creativeId: string;
  videoId: string | null;
  postId: string | null;
  thumbnailUrl: string | null;
  adName: string | null;
  adNames?: string[];
  campaignName: string | null;
  leadsCount: number;
  ordersCount: number;
  conversionRate: number;
  spend: number;
  cpa: number | null;
  rank: number;
}

export default function VideosReportPage() {
  const [rows, setRows] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<VideoRow[]>("/api/reports/videos")
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 className="page-title">تقرير الفيديوهات</h2>
      {loading ? (
        <p>جارٍ التحميل...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الترتيب</th>
                <th>صورة مصغرة</th>
                <th>Video ID / Post ID</th>
                <th>الإعلان(ات)</th>
                <th>الحملة</th>
                <th>العملاء</th>
                <th>الطلبات</th>
                <th>نسبة التحويل</th>
                <th>الإنفاق</th>
                <th>تكلفة الطلب</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.creativeId}>
                  <td>#{r.rank}</td>
                  <td>
                    {r.thumbnailUrl ? (
                      <img src={r.thumbnailUrl} className="thumb" alt="" />
                    ) : (
                      <div className="thumb" />
                    )}
                  </td>
                  <td>{r.videoId ?? r.postId ?? "-"}</td>
                  <td>{r.adNames?.length ? r.adNames.join("، ") : (r.adName ?? "-")}</td>
                  <td>{r.campaignName ?? "-"}</td>
                  <td>{r.leadsCount}</td>
                  <td>{r.ordersCount}</td>
                  <td>{r.conversionRate}%</td>
                  <td>{r.spend.toLocaleString("ar-IQ")}</td>
                  <td>{r.ordersCount === 0 ? "لا توجد طلبات" : (r.cpa ?? "بيانات الإنفاق غير متوفرة")}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", color: "var(--text-dim)" }}>
                    لا توجد فيديوهات مرتبطة بعملاء بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
