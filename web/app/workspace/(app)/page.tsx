"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { workspaceApiFetch, clearWorkspaceToken } from "../../../lib/workspaceApi";

interface MeResponse {
  user: { email: string; role: string };
  workspace: {
    name: string;
    subscription: {
      status: string;
      expiresAt: string | null;
      plan: { name: string } | null;
      maxPages: number;
      maxAdAccounts: number;
      maxUsers: number;
    } | null;
  };
}

export default function WorkspaceHome() {
  const router = useRouter();
  const [data, setData] = useState<MeResponse | null>(null);

  useEffect(() => {
    workspaceApiFetch<MeResponse>("/api/auth/user/me").then(setData);
  }, []);

  if (!data) return null;

  return (
    <main className="main">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {data.workspace.name}
        </h1>
        <button
          className="btn secondary"
          onClick={() => {
            clearWorkspaceToken();
            router.replace("/workspace/login");
          }}
        >
          تسجيل الخروج ({data.user.email})
        </button>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">حالة الاشتراك</div>
          <div className="value">
            <span className="badge success">{data.workspace.subscription?.status ?? "-"}</span>
          </div>
        </div>
        <div className="card">
          <div className="label">الخطة</div>
          <div className="value">{data.workspace.subscription?.plan?.name ?? "-"}</div>
        </div>
        <div className="card">
          <div className="label">تاريخ انتهاء الاشتراك</div>
          <div className="value">
            {data.workspace.subscription?.expiresAt
              ? new Date(data.workspace.subscription.expiresAt).toLocaleDateString("ar")
              : "بلا انتهاء"}
          </div>
        </div>
        <div className="card">
          <div className="label">الحدود</div>
          <div className="value" style={{ fontSize: 14 }}>
            {data.workspace.subscription?.maxPages} صفحة · {data.workspace.subscription?.maxAdAccounts} حساب
            إعلاني · {data.workspace.subscription?.maxUsers} مستخدم
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 8 }}>
        <div className="label">ربط حساب Meta</div>
        <p style={{ color: "var(--text-dim)", fontSize: 14 }}>
          اربط صفحتك وحسابك الإعلاني عبر Meta، وزامن الحملات والإعلانات والفيديوهات.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={connectMeta}>
            ربط حساب Meta
          </button>
          <a className="btn secondary" href="/workspace/meta" style={{ display: "inline-flex", alignItems: "center" }}>
            إدارة اتصالات Meta الحالية
          </a>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="label">استيراد الطلبات</div>
        <p style={{ color: "var(--text-dim)", fontSize: 14 }}>
          ارفع ملف Excel/CSV يحتوي طلباتك، وعاين واربط الأعمدة قبل الاستيراد.
        </p>
        <a className="btn" href="/workspace/imports" style={{ display: "inline-flex", alignItems: "center" }}>
          استيراد الطلبات
        </a>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="label">مطابقة مصادر الطلبات</div>
        <p style={{ color: "var(--text-dim)", fontSize: 14 }}>
          حدّد مصدر كل طلب (الحملة/المجموعة/الإعلان) تلقائيًا عند توفر دليل حقيقي، وطابق ما تبقّى يدويًا.
        </p>
        <a className="btn" href="/workspace/attribution" style={{ display: "inline-flex", alignItems: "center" }}>
          مطابقة مصادر الطلبات
        </a>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="label">رسائل إنستغرام</div>
        <p style={{ color: "var(--text-dim)", fontSize: 14 }}>
          استقبال تلقائي للرسائل الجديدة فقط من لحظة التفعيل، لربطها بطلباتها عند توفر رقم هاتف أو
          إعلان مرجعي.
        </p>
        <a className="btn" href="/workspace/messaging" style={{ display: "inline-flex", alignItems: "center" }}>
          إعدادات رسائل إنستغرام
        </a>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="label">Historical Conversation Import</div>
        <p style={{ color: "var(--text-dim)", fontSize: 14 }}>
          استيراد بيانات محادثة مجرَّدة (بلا نصوص) من ملف تُعِدّه بنفسك، لمطابقة طلبات قديمة بأرقام
          الهاتف أو الإعلان المرجعي.
        </p>
        <a className="btn" href="/workspace/conversation-import" style={{ display: "inline-flex", alignItems: "center" }}>
          استيراد بيانات محادثة تاريخية
        </a>
      </div>
    </main>
  );

  async function connectMeta() {
    const res = await workspaceApiFetch<{ url: string }>("/api/meta/oauth/start");
    window.location.href = res.url;
  }
}
