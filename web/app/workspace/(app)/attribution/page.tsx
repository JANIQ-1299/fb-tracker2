"use client";

import { useEffect, useState } from "react";
import { workspaceApiFetch, workspaceApiDownload } from "../../../../lib/workspaceApi";

interface Summary {
  total: number;
  exact: number;
  probable: number;
  manual: number;
  needsReview: number;
  unmatched: number;
  tiers: { confirmed: number; strong: number; approximate: number; unknown: number };
}

interface OrderRow {
  id: string;
  externalOrderId: string | null;
  customerName: string | null;
  phone: string | null;
  orderDate: string | null;
  matchStatus: "EXACT" | "PROBABLE" | "MANUAL" | "NEEDS_REVIEW" | "UNMATCHED";
  matchMethod: string | null;
  confidence: number;
  reason: string;
  campaignName: string | null;
  adSetName: string | null;
  adName: string | null;
  videoId: string | null;
  videoUrl: string | null;
  tier: string;
  tierLabel: string;
}

interface MetaOption {
  id: string;
  name: string;
  campaignId?: string;
  adSetId?: string;
}

interface MetaOptions {
  campaigns: MetaOption[];
  adSets: MetaOption[];
  ads: MetaOption[];
}

interface DashboardRow {
  key: string;
  adName: string | null;
  campaignName: string | null;
  videoId: string | null;
  videoUrl: string | null;
  orderCount: number;
  revenue: number;
  spend: number;
  costPerOrder: number | null;
}

interface Dashboard {
  byVideo: DashboardRow[];
  unattributed: { orderCount: number; revenue: number };
}

const STATUS_LABEL: Record<string, string> = {
  EXACT: "دقيق",
  PROBABLE: "محتمل",
  MANUAL: "يدوي",
  NEEDS_REVIEW: "يحتاج مراجعة",
  UNMATCHED: "غير مطابق",
};
const STATUS_BADGE: Record<string, string> = {
  EXACT: "success",
  PROBABLE: "warning",
  MANUAL: "success",
  NEEDS_REVIEW: "warning",
  UNMATCHED: "danger",
};

const TIER_BADGE: Record<string, string> = {
  CONFIRMED: "success",
  STRONG: "success",
  APPROXIMATE: "warning",
  NEEDS_REVIEW: "warning",
  UNKNOWN: "danger",
};

const METHOD_LABEL: Record<string, string> = {
  AD_ID: "معرّف الإعلان",
  LEAD_ID: "معرّف العميل المحتمل",
  CAMPAIGN_ADSET: "معرّف الحملة/المجموعة",
  NAME: "اسم مطابق",
  PHONE: "رقم الهاتف",
  MAPPING_RULE: "قاعدة محفوظة",
  MESSAGE_REFERRAL_AD_ID: "محادثة إنستغرام (إعلان مرجعي)",
  MESSAGE_PHONE: "محادثة إنستغرام (هاتف)",
  MANUAL: "يدوي",
};

export default function AttributionPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [filter, setFilter] = useState<"ALL" | "EXACT" | "PROBABLE" | "MANUAL" | "NEEDS_REVIEW" | "UNMATCHED">("ALL");
  const [options, setOptions] = useState<MetaOptions | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [picker, setPicker] = useState<Record<string, { campaignId: string; adSetId: string; adId: string }>>({});

  async function loadSummary() {
    const res = await workspaceApiFetch<Summary>("/api/attribution/summary");
    setSummary(res);
  }

  async function loadOrders() {
    const qs = filter === "ALL" ? "" : `?status=${filter}`;
    const res = await workspaceApiFetch<{ orders: OrderRow[] }>(`/api/attribution/orders${qs}`);
    setOrders(res.orders);
  }

  async function loadOptions() {
    const res = await workspaceApiFetch<MetaOptions>("/api/attribution/meta-options");
    setOptions(res);
  }

  async function loadDashboard() {
    const res = await workspaceApiFetch<Dashboard>("/api/attribution/dashboard");
    setDashboard(res);
  }

  useEffect(() => {
    loadSummary();
    loadOptions();
    loadDashboard();
  }, []);

  useEffect(() => {
    loadOrders();
  }, [filter]);

  async function runMatching() {
    setRunning(true);
    setBanner(null);
    try {
      const res = await workspaceApiFetch<{ total: number; exact: number; probable: number; manual: number; needsReview: number; unmatched: number }>(
        "/api/attribution/run",
        { method: "POST", body: JSON.stringify({}) },
      );
      setBanner(
        `اكتملت المطابقة: ${res.exact} دقيق، ${res.probable} محتمل، ${res.manual} يدوي (محفوظ سابقًا)، ${res.needsReview} يحتاج مراجعة، ${res.unmatched} غير مطابق.`,
      );
      await Promise.all([loadSummary(), loadOrders(), loadDashboard()]);
    } catch (err: any) {
      setBanner(err.message ?? "فشل تشغيل المطابقة");
    } finally {
      setRunning(false);
    }
  }

  async function exportExcel() {
    setExporting(true);
    setBanner(null);
    try {
      await workspaceApiDownload("/api/attribution/export", `attribution-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err: any) {
      setBanner(err.message ?? "فشل تصدير الملف");
    } finally {
      setExporting(false);
    }
  }

  const emptyChoice = { campaignId: "", adSetId: "", adId: "" };

  function updatePicker(orderId: string, patch: Partial<{ campaignId: string; adSetId: string; adId: string }>) {
    setPicker((prev) => {
      const current = prev[orderId] ?? emptyChoice;
      return { ...prev, [orderId]: { ...current, ...patch } };
    });
  }

  async function saveManual(orderId: string) {
    const choice = picker[orderId];
    if (!choice?.campaignId) {
      setBanner("اختر الحملة على الأقل قبل الحفظ");
      return;
    }
    try {
      await workspaceApiFetch(`/api/attribution/orders/${orderId}/manual`, {
        method: "POST",
        body: JSON.stringify({
          campaignId: choice.campaignId,
          adSetId: choice.adSetId || undefined,
          adId: choice.adId || undefined,
        }),
      });
      setBanner("تم حفظ المطابقة اليدوية بنجاح");
      await Promise.all([loadSummary(), loadOrders(), loadDashboard()]);
    } catch (err: any) {
      setBanner(err.message ?? "فشل حفظ المطابقة اليدوية");
    }
  }

  const showManualPicker = filter === "UNMATCHED" || filter === "NEEDS_REVIEW";

  return (
    <main className="main">
      <h1 className="page-title">مطابقة مصادر الطلبات</h1>

      {banner && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--warning)" }}>
          {banner}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button className="btn" onClick={runMatching} disabled={running}>
          {running ? "جارٍ تشغيل المطابقة..." : "تشغيل المطابقة"}
        </button>
        <button className="btn secondary" onClick={exportExcel} disabled={exporting}>
          {exporting ? "جارٍ التصدير..." : "تصدير Excel"}
        </button>
      </div>

      {summary && (
        <>
          <div className="cards">
            <div className="card">
              <div className="label">إجمالي الطلبات</div>
              <div className="value">{summary.total}</div>
            </div>
            <div className="card">
              <div className="label">مطابق بدقة</div>
              <div className="value">{summary.exact}</div>
            </div>
            <div className="card">
              <div className="label">مطابق محتمل</div>
              <div className="value">{summary.probable}</div>
            </div>
            <div className="card">
              <div className="label">مطابق يدويًا</div>
              <div className="value">{summary.manual}</div>
            </div>
            <div className="card">
              <div className="label">يحتاج مراجعة</div>
              <div className="value">{summary.needsReview}</div>
            </div>
            <div className="card">
              <div className="label">غير مطابق</div>
              <div className="value">{summary.unmatched}</div>
            </div>
          </div>

          <div className="cards" style={{ marginTop: 10 }}>
            <div className="card">
              <div className="label">مؤكد</div>
              <div className="value">{summary.tiers.confirmed}</div>
            </div>
            <div className="card">
              <div className="label">قوي</div>
              <div className="value">{summary.tiers.strong}</div>
            </div>
            <div className="card">
              <div className="label">تقريبي</div>
              <div className="value">{summary.tiers.approximate}</div>
            </div>
            <div className="card">
              <div className="label">غير معروف</div>
              <div className="value">{summary.tiers.unknown}</div>
            </div>
          </div>
        </>
      )}

      <div className="filters" style={{ marginTop: 20 }}>
        {(["ALL", "EXACT", "PROBABLE", "MANUAL", "NEEDS_REVIEW", "UNMATCHED"] as const).map((s) => (
          <button
            key={s}
            className={`btn ${filter === s ? "" : "secondary"}`}
            onClick={() => setFilter(s)}
          >
            {s === "ALL" ? "الكل" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>رقم الطلب</th>
              <th>الهاتف</th>
              <th>تاريخ ووقت الطلب</th>
              <th>الحملة</th>
              <th>مجموعة الإعلانات</th>
              <th>الإعلان/الفيديو</th>
              <th>طريقة المطابقة</th>
              <th>الحالة</th>
              <th>التصنيف</th>
              <th>السبب</th>
              {showManualPicker && <th>مطابقة يدوية</th>}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const choice = picker[o.id] ?? { campaignId: "", adSetId: "", adId: "" };
              const filteredAdSets = options?.adSets.filter((a) => a.campaignId === choice.campaignId) ?? [];
              const filteredAds = options?.ads.filter((a) => a.adSetId === choice.adSetId) ?? [];
              return (
                <tr key={o.id}>
                  <td>{o.externalOrderId ?? o.id.slice(0, 8)}</td>
                  <td>{o.phone ?? "-"}</td>
                  <td>{o.orderDate ? new Date(o.orderDate).toLocaleString("ar") : "-"}</td>
                  <td>{o.campaignName ?? "-"}</td>
                  <td>{o.adSetName ?? "-"}</td>
                  <td>
                    {o.adName ?? o.videoId ?? "-"}
                    {o.videoUrl && (
                      <>
                        {" "}
                        <a href={o.videoUrl} target="_blank" rel="noreferrer">
                          (رابط)
                        </a>
                      </>
                    )}
                  </td>
                  <td>{o.matchMethod ? METHOD_LABEL[o.matchMethod] ?? o.matchMethod : "-"}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[o.matchStatus]}`}>
                      {STATUS_LABEL[o.matchStatus]} ({Math.round(o.confidence * 100)}%)
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${TIER_BADGE[o.tier] ?? "danger"}`}>{o.tierLabel}</span>
                  </td>
                  <td style={{ maxWidth: 320, whiteSpace: "normal" }}>{o.reason}</td>
                  {showManualPicker && (
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 160 }}>
                        <select
                          value={choice.campaignId}
                          onChange={(e) => updatePicker(o.id, { campaignId: e.target.value, adSetId: "", adId: "" })}
                        >
                          <option value="">اختر الحملة</option>
                          {options?.campaigns.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={choice.adSetId}
                          disabled={!choice.campaignId}
                          onChange={(e) => updatePicker(o.id, { adSetId: e.target.value, adId: "" })}
                        >
                          <option value="">مجموعة الإعلانات (اختياري)</option>
                          {filteredAdSets.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={choice.adId}
                          disabled={!choice.adSetId}
                          onChange={(e) => updatePicker(o.id, { adId: e.target.value })}
                        >
                          <option value="">الإعلان (اختياري)</option>
                          {filteredAds.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        <button className="btn secondary" onClick={() => saveManual(o.id)}>
                          حفظ المطابقة
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={showManualPicker ? 11 : 10}>لا توجد طلبات ضمن هذا التصنيف.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="page-title" style={{ fontSize: 18, marginTop: 32 }}>
        لوحة الفيديوهات/الإعلانات
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الإعلان/الفيديو</th>
              <th>الحملة</th>
              <th>عدد الطلبات</th>
              <th>الإيراد</th>
              <th>الصرف الإعلاني</th>
              <th>تكلفة الطلب</th>
              <th>الفيديو</th>
            </tr>
          </thead>
          <tbody>
            {dashboard?.byVideo.map((r) => (
              <tr key={r.key}>
                <td>{r.adName ?? r.videoId ?? "-"}</td>
                <td>{r.campaignName ?? "-"}</td>
                <td>{r.orderCount}</td>
                <td>{r.revenue.toLocaleString("ar")}</td>
                <td>{r.spend.toLocaleString("ar")}</td>
                <td>{r.costPerOrder !== null ? Math.round(r.costPerOrder).toLocaleString("ar") : "-"}</td>
                <td>
                  {r.videoUrl && (
                    <a href={r.videoUrl} target="_blank" rel="noreferrer">
                      رابط
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {dashboard && dashboard.unattributed.orderCount > 0 && (
              <tr>
                <td>غير مطابق لأي إعلان/فيديو</td>
                <td>-</td>
                <td>{dashboard.unattributed.orderCount}</td>
                <td>{dashboard.unattributed.revenue.toLocaleString("ar")}</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
              </tr>
            )}
            {(!dashboard || dashboard.byVideo.length === 0) && (
              <tr>
                <td colSpan={7}>لا توجد بيانات كافية بعد - شغّل المطابقة أولًا.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
