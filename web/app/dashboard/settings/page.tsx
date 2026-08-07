"use client";

import { useEffect, useState } from "react";
import { apiFetch, clearToken } from "../../../lib/api";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<any>(null);
  const [metaTest, setMetaTest] = useState<any>(null);
  const [sheetsTest, setSheetsTest] = useState<any>(null);
  const [lastWebhook, setLastWebhook] = useState<any>(null);
  const [resyncing, setResyncing] = useState(false);

  function refresh() {
    apiFetch("/api/settings").then(setSettings);
    apiFetch("/api/settings/last-webhook").then(setLastWebhook);
  }

  useEffect(refresh, []);

  async function testMeta() {
    setMetaTest({ loading: true });
    setMetaTest(await apiFetch("/api/settings/test-meta"));
  }

  async function testSheets() {
    setSheetsTest({ loading: true });
    setSheetsTest(await apiFetch("/api/settings/test-sheets"));
  }

  async function resync() {
    setResyncing(true);
    try {
      await apiFetch("/api/settings/resync", { method: "POST" });
      refresh();
    } finally {
      setResyncing(false);
    }
  }

  function logout() {
    clearToken();
    router.replace("/login");
  }

  return (
    <div>
      <h2 className="page-title">الإعدادات</h2>

      <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div className="card">
          <div className="label">اختبار اتصال Meta</div>
          <button className="btn" onClick={testMeta} style={{ marginBottom: 8 }}>
            اختبار الآن
          </button>
          {metaTest && (
            <div style={{ fontSize: 13 }}>
              {metaTest.loading ? "جارٍ الاختبار..." : metaTest.ok ? `متصل ✅ (${metaTest.page?.name ?? ""})` : `فشل: ${metaTest.message}`}
            </div>
          )}
        </div>

        <div className="card">
          <div className="label">اختبار Google Sheets</div>
          <button className="btn" onClick={testSheets} style={{ marginBottom: 8 }}>
            اختبار الآن
          </button>
          {sheetsTest && (
            <div style={{ fontSize: 13 }}>
              {sheetsTest.loading ? "جارٍ الاختبار..." : sheetsTest.ok ? `متصل ✅ (${sheetsTest.title ?? ""})` : `${sheetsTest.message}`}
            </div>
          )}
        </div>

        <div className="card">
          <div className="label">آخر Webhook مستلم</div>
          {lastWebhook ? (
            <div style={{ fontSize: 13 }}>
              {lastWebhook.eventType} - {lastWebhook.status} <br />
              {new Date(lastWebhook.receivedAt).toLocaleString("ar-IQ")}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-dim)" }}>لا يوجد بعد</div>
          )}
        </div>

        <div className="card">
          <div className="label">إعادة مزامنة البيانات من Meta</div>
          <button className="btn" onClick={resync} disabled={resyncing}>
            {resyncing ? "جارٍ المزامنة..." : "إعادة مزامنة الآن"}
          </button>
        </div>

        <div className="card">
          <div className="label">إعدادات عامة</div>
          {settings && (
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              المنطقة الزمنية: {settings.timezone} <br />
              العملة: {settings.currency} <br />
              حالة "تم تقديم الطلب": {settings.orderSubmittedStatusLabel} <br />
              Meta مهيأة: {settings.metaConfigured ? "نعم" : "لا"} <br />
              Google Sheets مفعّلة: {settings.googleSheetsEnabled ? "نعم" : "لا"}
            </div>
          )}
        </div>

        <div className="card">
          <div className="label">الجلسة</div>
          <button className="btn secondary" onClick={logout}>
            تسجيل الخروج
          </button>
        </div>
      </div>
    </div>
  );
}
