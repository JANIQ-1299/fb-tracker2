"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

interface AdRow {
  adId: string;
  adName: string;
  campaignName: string;
  adSetName: string;
  leadsCount: number;
  ordersCount: number;
  conversionRate: number;
  spend: number;
  cpl: number | null;
  cpa: number | null;
  orderValue: number;
  roas: number | null;
}

export default function AdsReportPage() {
  const [rows, setRows] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<AdRow[]>("/api/reports/ads")
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 className="page-title">تقرير الإعلانات</h2>
      {loading ? (
        <p>جارٍ التحميل...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الإعلان</th>
                <th>الحملة</th>
                <th>مجموعة الإعلانات</th>
                <th>العملاء</th>
                <th>الطلبات</th>
                <th>نسبة التحويل</th>
                <th>الإنفاق</th>
                <th>CPL</th>
                <th>CPA</th>
                <th>قيمة الطلبات</th>
                <th>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.adId}>
                  <td>{r.adName}</td>
                  <td>{r.campaignName}</td>
                  <td>{r.adSetName}</td>
                  <td>{r.leadsCount}</td>
                  <td>{r.ordersCount}</td>
                  <td>{r.conversionRate}%</td>
                  <td>{r.spend.toLocaleString("ar-IQ")}</td>
                  <td>{r.cpl ?? "-"}</td>
                  <td>{r.cpa ?? "-"}</td>
                  <td>{r.orderValue.toLocaleString("ar-IQ")}</td>
                  <td>{r.roas ?? "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", color: "var(--text-dim)" }}>
                    لا توجد بيانات إعلانات بعد
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
