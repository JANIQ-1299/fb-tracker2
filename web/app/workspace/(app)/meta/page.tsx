"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { workspaceApiFetch } from "../../../../lib/workspaceApi";

interface ConnectionRow {
  id: string;
  metaUserId: string;
  status: string;
  scopes: string | null;
  connectedAt: string;
  tokenExpiresAt: string | null;
  lastCheckedAt: string | null;
  lastSyncAt: string | null;
}

interface AssetsResponse {
  connection: { id: string; status: string; scopes: string | null };
  pages: { id: string; name: string }[];
  adAccounts: { id: string; account_id: string; name: string; currency?: string }[];
  selectedPageIds: string[];
  selectedAdAccountIds: string[];
  limits: { maxPages: number; maxAdAccounts: number; currentPages: number; currentAdAccounts: number };
}

const STATUS_LABEL: Record<string, string> = {
  CONNECTED: "متصل",
  EXPIRED: "منتهي الصلاحية",
  REVOKED: "مُلغى",
};

export default function MetaConnectionsPage() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const urlConnectionId = searchParams.get("connectionId");

  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(
    urlError ? `تعذّر ربط حساب Meta: ${urlError}` : null,
  );
  const [pickerConnectionId, setPickerConnectionId] = useState<string | null>(urlConnectionId);
  const [assets, setAssets] = useState<AssetsResponse | null>(null);
  const [selectedPage, setSelectedPage] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [selectedAdAccount, setSelectedAdAccount] = useState<string>("");
  const [syncResult, setSyncResult] = useState<any>(null);

  async function loadConnections() {
    setLoading(true);
    try {
      const res = await workspaceApiFetch<{ connections: ConnectionRow[] }>("/api/meta/connections");
      setConnections(res.connections);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConnections();
  }, []);

  useEffect(() => {
    if (pickerConnectionId) openPicker(pickerConnectionId);
  }, [pickerConnectionId]);

  async function openPicker(connectionId: string) {
    setBanner(null);
    try {
      const res = await workspaceApiFetch<AssetsResponse>(`/api/meta/connections/${connectionId}/assets`);
      setAssets(res);
      setPickerConnectionId(connectionId);
      setSelectedPage(res.selectedPageIds[0] ?? "");
      setSelectedAdAccount(res.selectedAdAccountIds[0] ?? "");
    } catch (err: any) {
      setBanner(err.message ?? "تعذّر جلب الصفحات/الحسابات");
    }
  }

  async function confirmSelection() {
    if (!pickerConnectionId) return;
    try {
      await workspaceApiFetch(`/api/meta/connections/${pickerConnectionId}/select`, {
        method: "POST",
        body: JSON.stringify({ pageId: selectedPage || undefined, adAccountId: selectedAdAccount || undefined }),
      });
      setBanner("تم حفظ الاختيار بنجاح. جار مزامنة بيانات الإعلانات...");
      openPicker(pickerConnectionId);
      // تبدأ مزامنة بيانات الإعلانات (Campaigns/AdSets/Ads/Insights) تلقائيًا فور حفظ الاختيار،
      // دون انتظار ضغط المستخدم على زر "مزامنة الآن" - الزر يبقى متاحًا لإعادة المزامنة يدويًا.
      // هذه العملية لا تُنشئ أي Order أو OrderAttribution إطلاقًا - تلك تبدأ فقط بعد رفع Excel.
      await runSync(true);
    } catch (err: any) {
      setBanner(err.message ?? "فشل حفظ الاختيار");
    }
  }

  async function testConnection(id: string) {
    const res = await workspaceApiFetch<{ valid: boolean }>(`/api/meta/connections/${id}/test`, { method: "POST" });
    setBanner(res.valid ? "الاتصال يعمل بشكل صحيح." : "الاتصال منتهي الصلاحية - يلزم إعادة تسجيل الدخول.");
    loadConnections();
  }

  async function disconnect(id: string) {
    if (!window.confirm("إلغاء ربط هذا الاتصال؟ لن تُحذف أي بيانات سابقة.")) return;
    await workspaceApiFetch(`/api/meta/connections/${id}`, { method: "DELETE" });
    if (pickerConnectionId === id) {
      setPickerConnectionId(null);
      setAssets(null);
    }
    loadConnections();
  }

  async function reconnect() {
    const res = await workspaceApiFetch<{ url: string }>("/api/meta/oauth/start");
    window.location.href = res.url;
  }

  async function runSync(fromAutoSelect = false) {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await workspaceApiFetch("/api/meta/sync", { method: "POST" });
      setSyncResult(res);
      if (fromAutoSelect) setBanner("تم حفظ الاختيار، واكتملت مزامنة بيانات الإعلانات بنجاح.");
      loadConnections();
    } catch (err: any) {
      setBanner(err.message ?? "فشلت مزامنة بيانات الإعلانات");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="main">
      <h1 className="page-title">اتصالات Meta</h1>

      {banner && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--warning)" }}>
          {banner}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button className="btn" onClick={reconnect}>
          ربط حساب Meta جديد / إعادة تسجيل الدخول
        </button>
        <button className="btn secondary" onClick={() => runSync(false)} disabled={syncing}>
          {syncing ? "جار مزامنة بيانات الإعلانات..." : "مزامنة الآن"}
        </button>
      </div>

      {syncResult && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="label">نتيجة آخر مزامنة</div>
          <div style={{ fontSize: 14 }}>
            حسابات إعلانية: {syncResult.adAccountsSynced} · حملات: {syncResult.campaigns} · مجموعات إعلانات:{" "}
            {syncResult.adSets} · إعلانات: {syncResult.ads} · Creatives: {syncResult.creatives} · صفوف Insights:{" "}
            {syncResult.insightRows}
            {syncResult.reauthRequired?.length > 0 && (
              <div style={{ color: "var(--danger)", marginTop: 6 }}>
                يتطلب إعادة تسجيل دخول: {syncResult.reauthRequired.length} اتصال
              </div>
            )}
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 10, marginBottom: 0 }}>
            تمت مزامنة بيانات Meta. ارفع ملف Excel للطلبات لبدء الجرد والمطابقة.
          </p>
        </div>
      )}

      {!loading && (
        <div className="table-wrap" style={{ marginBottom: 24 }}>
          <table>
            <thead>
              <tr>
                <th>معرّف مستخدم Meta</th>
                <th>الحالة</th>
                <th>تاريخ الربط</th>
                <th>آخر فحص</th>
                <th>آخر مزامنة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id}>
                  <td>{c.metaUserId}</td>
                  <td>
                    <span
                      className={`badge ${c.status === "CONNECTED" ? "success" : c.status === "EXPIRED" ? "warning" : "danger"}`}
                    >
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td>{new Date(c.connectedAt).toLocaleString("ar")}</td>
                  <td>{c.lastCheckedAt ? new Date(c.lastCheckedAt).toLocaleString("ar") : "-"}</td>
                  <td>{c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString("ar") : "لم تُزامن بعد"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="btn secondary" onClick={() => openPicker(c.id)}>
                        اختيار الصفحة/الحساب
                      </button>
                      <button className="btn secondary" onClick={() => testConnection(c.id)}>
                        اختبار الاتصال
                      </button>
                      <button className="btn secondary" onClick={() => disconnect(c.id)}>
                        إلغاء الربط
                      </button>
                      {c.status === "EXPIRED" && (
                        <button className="btn" onClick={reconnect}>
                          إعادة تسجيل الدخول
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {connections.length === 0 && (
                <tr>
                  <td colSpan={6}>لا يوجد أي اتصال Meta بعد.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {assets && pickerConnectionId && (
        <div className="card">
          <h2 className="page-title" style={{ fontSize: 18 }}>
            اختيار الصفحة والحساب الإعلاني
          </h2>
          <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
            الحدود: {assets.limits.currentPages}/{assets.limits.maxPages} صفحة ·{" "}
            {assets.limits.currentAdAccounts}/{assets.limits.maxAdAccounts} حساب إعلاني
          </p>

          <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
            <div>
              <div className="label">الصفحة</div>
              {assets.pages.length === 0 && <p style={{ fontSize: 13 }}>لا توجد صفحات متاحة لهذا الحساب.</p>}
              {assets.pages.map((p) => (
                <label key={p.id} style={{ display: "block", margin: "6px 0", fontSize: 14 }}>
                  <input
                    type="radio"
                    name="page"
                    value={p.id}
                    checked={selectedPage === p.id}
                    onChange={() => setSelectedPage(p.id)}
                  />{" "}
                  {p.name}
                </label>
              ))}
            </div>
            <div>
              <div className="label">الحساب الإعلاني</div>
              {assets.adAccounts.length === 0 && <p style={{ fontSize: 13 }}>لا توجد حسابات إعلانية متاحة.</p>}
              {assets.adAccounts.map((a) => (
                <label key={a.account_id} style={{ display: "block", margin: "6px 0", fontSize: 14 }}>
                  <input
                    type="radio"
                    name="adAccount"
                    value={a.account_id}
                    checked={selectedAdAccount === a.account_id}
                    onChange={() => setSelectedAdAccount(a.account_id)}
                  />{" "}
                  {a.name} ({a.currency ?? "USD"})
                </label>
              ))}
            </div>
          </div>

          <button className="btn" style={{ marginTop: 16 }} onClick={confirmSelection}>
            حفظ الاختيار
          </button>
        </div>
      )}
    </main>
  );
}
