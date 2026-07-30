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
          ربط الصفحات والحسابات الإعلانية عبر Meta OAuth، ومزامنة الحملات والإعلانات، ورفع ملفات
          الطلبات — كل ذلك ضمن المرحلة القادمة من التنفيذ.
        </p>
        <button className="btn" disabled>
          ربط حساب Meta (قريبًا)
        </button>
      </div>
    </main>
  );
}
