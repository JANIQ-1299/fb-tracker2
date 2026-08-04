"use client";

import { useEffect, useState } from "react";
import { workspaceApiFetch } from "../../../../lib/workspaceApi";

interface Status {
  enabled: boolean;
  pageId: string | null;
  pageName: string | null;
  enabledAt: string | null;
  retentionDays: number;
  matchWindowHours: number;
  conversationsCount: number;
  matchedCount: number;
  needsReviewCount: number;
  disclaimer: string;
}

interface PageOption {
  id: string;
  name: string;
}

interface ConversationRow {
  id: string;
  platform: string;
  normalizedPhoneExtracted: string | null;
  referralAdNameSnapshot: string | null;
  referralCampaignNameSnapshot: string | null;
  matchStatus: "MATCHED" | "NEEDS_REVIEW" | "UNMATCHED";
  matchedOrder: { id: string; externalOrderId: string | null; customerName: string | null; price: number | null } | null;
  firstMessageAt: string;
  lastMessageAt: string;
}

const MATCH_LABEL: Record<string, string> = {
  MATCHED: "مطابَق",
  NEEDS_REVIEW: "يحتاج مراجعة",
  UNMATCHED: "غير مطابَق بعد",
};
const MATCH_BADGE: Record<string, string> = {
  MATCHED: "success",
  NEEDS_REVIEW: "warning",
  UNMATCHED: "danger",
};

export default function MessagingPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [pages, setPages] = useState<PageOption[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [matchWindowHours, setMatchWindowHours] = useState(48);

  async function loadStatus() {
    const res = await workspaceApiFetch<Status>("/api/messaging/status");
    setStatus(res);
    setRetentionDays(res.retentionDays);
    setMatchWindowHours(res.matchWindowHours);
    if (res.pageId) setSelectedPageId(res.pageId);
  }

  async function loadPages() {
    const res = await workspaceApiFetch<{ pages: PageOption[] }>("/api/messaging/available-pages");
    setPages(res.pages);
  }

  async function loadConversations() {
    const res = await workspaceApiFetch<{ conversations: ConversationRow[] }>("/api/messaging/conversations");
    setConversations(res.conversations);
  }

  useEffect(() => {
    loadStatus();
    loadPages();
    loadConversations();
  }, []);

  async function enable() {
    if (!selectedPageId) {
      setBanner("اختر صفحة أولًا");
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      await workspaceApiFetch("/api/messaging/enable", {
        method: "POST",
        body: JSON.stringify({ pageId: selectedPageId }),
      });
      setBanner("تم التفعيل - سيبدأ استقبال الرسائل الجديدة من الآن");
      await loadStatus();
    } catch (err: any) {
      setBanner(err.message ?? "فشل التفعيل");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setBanner(null);
    try {
      await workspaceApiFetch("/api/messaging/disable", { method: "POST" });
      setBanner("تم إيقاف استقبال الرسائل");
      await loadStatus();
    } catch (err: any) {
      setBanner(err.message ?? "فشل الإيقاف");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setBusy(true);
    setBanner(null);
    try {
      await workspaceApiFetch("/api/messaging/settings", {
        method: "PATCH",
        body: JSON.stringify({ retentionDays, matchWindowHours }),
      });
      setBanner("تم حفظ الإعدادات");
      await loadStatus();
    } catch (err: any) {
      setBanner(err.message ?? "فشل حفظ الإعدادات");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="main">
      <h1 className="page-title">رسائل إنستغرام</h1>

      <div
        className="card"
        style={{ marginBottom: 20, borderColor: "var(--warning)", fontSize: 14, fontWeight: 600 }}
      >
        {status?.disclaimer ??
          "استقبال الرسائل التلقائي يعمل على الرسائل الجديدة من لحظة التفعيل. يمكن رفع ملفات طلبات قديمة ومحاولة مطابقتها مع البيانات المتوفرة، لكن لا يمكن ضمان معرفة مصدر كل طلب قديم إذا لم تكن بيانات المحادثة أو مرجع الإعلان متاحة."}
      </div>

      {banner && <div className="card" style={{ marginBottom: 16 }}>{banner}</div>}

      {status && (
        <div className="cards" style={{ marginBottom: 20 }}>
          <div className="card">
            <div className="label">الحالة</div>
            <div className="value">
              <span className={`badge ${status.enabled ? "success" : "danger"}`}>
                {status.enabled ? "مفعَّل" : "غير مفعَّل"}
              </span>
            </div>
          </div>
          <div className="card">
            <div className="label">الصفحة</div>
            <div className="value" style={{ fontSize: 14 }}>{status.pageName ?? "-"}</div>
          </div>
          <div className="card">
            <div className="label">محادثات مُلتقَطة</div>
            <div className="value">{status.conversationsCount}</div>
          </div>
          <div className="card">
            <div className="label">مطابَقة</div>
            <div className="value">{status.matchedCount}</div>
          </div>
          <div className="card">
            <div className="label">تحتاج مراجعة</div>
            <div className="value">{status.needsReviewCount}</div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label">التفعيل/الإيقاف</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <select value={selectedPageId} onChange={(e) => setSelectedPageId(e.target.value)}>
            <option value="">اختر الصفحة</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {!status?.enabled ? (
            <button className="btn" onClick={enable} disabled={busy}>
              تفعيل الاستقبال
            </button>
          ) : (
            <button className="btn secondary" onClick={disable} disabled={busy}>
              إيقاف الاستقبال
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label">الإعدادات</div>
        <div style={{ display: "flex", gap: 20, marginTop: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            مدة الاحتفاظ بنص الرسالة قبل الحذف التلقائي
            <select value={retentionDays} onChange={(e) => setRetentionDays(Number(e.target.value))}>
              <option value={7}>7 أيام</option>
              <option value={30}>30 يومًا</option>
              <option value={90}>90 يومًا</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            نافذة المطابقة الزمنية
            <select value={matchWindowHours} onChange={(e) => setMatchWindowHours(Number(e.target.value))}>
              <option value={48}>48 ساعة (افتراضي)</option>
              <option value={168}>7 أيام</option>
              <option value={24}>24 ساعة</option>
            </select>
          </label>
          <button className="btn" style={{ alignSelf: "flex-end" }} onClick={saveSettings} disabled={busy}>
            حفظ الإعدادات
          </button>
        </div>
      </div>

      <h2 className="page-title" style={{ fontSize: 18 }}>
        آخر المحادثات المُلتقَطة
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الهاتف المستخرج</th>
              <th>الإعلان المرجعي</th>
              <th>الحالة</th>
              <th>الطلب المطابَق</th>
              <th>أول رسالة</th>
              <th>آخر رسالة</th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((c) => (
              <tr key={c.id}>
                <td>{c.normalizedPhoneExtracted ?? "-"}</td>
                <td>{c.referralAdNameSnapshot ?? "-"}</td>
                <td>
                  <span className={`badge ${MATCH_BADGE[c.matchStatus]}`}>{MATCH_LABEL[c.matchStatus]}</span>
                </td>
                <td>{c.matchedOrder ? c.matchedOrder.externalOrderId ?? c.matchedOrder.id.slice(0, 8) : "-"}</td>
                <td>{new Date(c.firstMessageAt).toLocaleString("ar")}</td>
                <td>{new Date(c.lastMessageAt).toLocaleString("ar")}</td>
              </tr>
            ))}
            {conversations.length === 0 && (
              <tr>
                <td colSpan={6}>لا توجد محادثات مُلتقَطة بعد.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
