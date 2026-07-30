"use client";

import { useEffect, useState } from "react";
import { superAdminApiFetch } from "../../../lib/superAdminApi";

interface WorkspaceRow {
  id: string;
  name: string;
  createdAt: string;
  subscription: {
    status: string;
    expiresAt: string | null;
    suspensionReason: string | null;
    maxPages: number;
    maxAdAccounts: number;
    maxUsers: number;
    plan: { name: string } | null;
  } | null;
  users: { id: string; email: string; lastLoginAt: string | null; role: string }[];
  metaConnections: { lastSyncAt: string | null; status: string }[];
  _count: { pages: number; adAccounts: number; users: number };
}

interface AdminActionRow {
  id: string;
  action: string;
  targetWorkspaceId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
  superAdmin: { email: string };
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "نشط",
  SUSPENDED: "موقوف",
  EXPIRED: "منتهي",
  BLOCKED: "محظور",
};

export default function SuperAdminHome() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [actions, setActions] = useState<AdminActionRow[]>([]);
  const [systemState, setSystemState] = useState<string>("SYSTEM_ACTIVE");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [wsRes, actionsRes, stateRes] = await Promise.all([
        superAdminApiFetch<{ workspaces: WorkspaceRow[] }>("/api/superadmin/workspaces"),
        superAdminApiFetch<{ actions: AdminActionRow[] }>("/api/superadmin/audit-log"),
        superAdminApiFetch<{ state: string }>("/api/superadmin/system-state"),
      ]);
      setWorkspaces(wsRes.workspaces);
      setActions(actionsRes.actions);
      setSystemState(stateRes.state);
    } catch (err: any) {
      setError(err.message ?? "فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function activate(id: string) {
    await superAdminApiFetch(`/api/superadmin/workspaces/${id}/activate`, { method: "POST" });
    loadAll();
  }

  async function suspend(id: string) {
    const reason = window.prompt("سبب الإيقاف (إلزامي):");
    if (!reason) return;
    await superAdminApiFetch(`/api/superadmin/workspaces/${id}/suspend`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    loadAll();
  }

  async function block(id: string) {
    const reason = window.prompt("سبب الحظر (إلزامي):");
    if (!reason) return;
    await superAdminApiFetch(`/api/superadmin/workspaces/${id}/block`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    loadAll();
  }

  async function extend(id: string) {
    const daysStr = window.prompt("مدّد الاشتراك كم يومًا؟");
    const days = Number(daysStr);
    if (!daysStr || !Number.isFinite(days) || days <= 0) return;
    await superAdminApiFetch(`/api/superadmin/workspaces/${id}/extend`, {
      method: "POST",
      body: JSON.stringify({ days }),
    });
    loadAll();
  }

  async function editLimits(ws: WorkspaceRow) {
    const maxPages = Number(window.prompt("الحد الأقصى للصفحات:", String(ws.subscription?.maxPages ?? 1)));
    const maxAdAccounts = Number(
      window.prompt("الحد الأقصى للحسابات الإعلانية:", String(ws.subscription?.maxAdAccounts ?? 1)),
    );
    const maxUsers = Number(window.prompt("الحد الأقصى للمستخدمين:", String(ws.subscription?.maxUsers ?? 1)));
    if (![maxPages, maxAdAccounts, maxUsers].every((n) => Number.isFinite(n) && n >= 0)) return;
    await superAdminApiFetch(`/api/superadmin/workspaces/${ws.id}/limits`, {
      method: "POST",
      body: JSON.stringify({ maxPages, maxAdAccounts, maxUsers }),
    });
    loadAll();
  }

  async function toggleMaintenance() {
    const goingToMaintenance = systemState === "SYSTEM_ACTIVE";
    if (goingToMaintenance) {
      const confirmText = window.prompt(
        'إيقاف طارئ للنظام بالكامل لكل المستخدمين (عدا Super Admin). اكتب "MAINTENANCE" للتأكيد:',
      );
      if (confirmText !== "MAINTENANCE") return;
      await superAdminApiFetch("/api/superadmin/system-state", {
        method: "POST",
        body: JSON.stringify({ state: "MAINTENANCE_MODE", confirmText }),
      });
    } else {
      if (!window.confirm("إعادة تفعيل النظام لكل المستخدمين؟")) return;
      await superAdminApiFetch("/api/superadmin/system-state", {
        method: "POST",
        body: JSON.stringify({ state: "SYSTEM_ACTIVE", confirmText: "SYSTEM_ACTIVE" }),
      });
    }
    loadAll();
  }

  if (loading) return <p>جارٍ التحميل...</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          إدارة الـWorkspaces
        </h1>
        <div>
          <span className={`badge ${systemState === "SYSTEM_ACTIVE" ? "success" : "danger"}`} style={{ marginLeft: 10 }}>
            {systemState === "SYSTEM_ACTIVE" ? "النظام يعمل" : "وضع الصيانة مفعّل"}
          </span>
          <button className="btn" style={{ background: "var(--danger)" }} onClick={toggleMaintenance}>
            {systemState === "SYSTEM_ACTIVE" ? "إيقاف طارئ (وضع الصيانة)" : "إعادة تفعيل النظام"}
          </button>
        </div>
      </div>

      {error && <div className="error-text" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="table-wrap" style={{ marginBottom: 32 }}>
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الحالة</th>
              <th>الخطة</th>
              <th>تاريخ الانتهاء</th>
              <th>آخر دخول</th>
              <th>آخر مزامنة</th>
              <th>صفحات/حسابات/مستخدمون</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {workspaces.map((ws) => {
              const lastLogin = ws.users
                .map((u) => u.lastLoginAt)
                .filter(Boolean)
                .sort()
                .reverse()[0];
              const lastSync = ws.metaConnections[0]?.lastSyncAt;
              const status = ws.subscription?.status ?? "SUSPENDED";
              return (
                <tr key={ws.id}>
                  <td>{ws.name}</td>
                  <td>
                    <span
                      className={`badge ${status === "ACTIVE" ? "success" : status === "EXPIRED" ? "warning" : "danger"}`}
                    >
                      {STATUS_LABEL[status] ?? status}
                    </span>
                    {ws.subscription?.suspensionReason && (
                      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                        {ws.subscription.suspensionReason}
                      </div>
                    )}
                  </td>
                  <td>{ws.subscription?.plan?.name ?? "-"}</td>
                  <td>{ws.subscription?.expiresAt ? new Date(ws.subscription.expiresAt).toLocaleDateString("ar") : "بلا انتهاء"}</td>
                  <td>{lastLogin ? new Date(lastLogin).toLocaleString("ar") : "-"}</td>
                  <td>{lastSync ? new Date(lastSync).toLocaleString("ar") : "لم تُزامن بعد"}</td>
                  <td>
                    {ws._count.pages}/{ws.subscription?.maxPages ?? "-"} · {ws._count.adAccounts}/
                    {ws.subscription?.maxAdAccounts ?? "-"} · {ws._count.users}/{ws.subscription?.maxUsers ?? "-"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {status !== "ACTIVE" && (
                        <button className="btn secondary" onClick={() => activate(ws.id)}>
                          تفعيل
                        </button>
                      )}
                      {status === "ACTIVE" && (
                        <button className="btn secondary" onClick={() => suspend(ws.id)}>
                          إيقاف
                        </button>
                      )}
                      <button className="btn secondary" onClick={() => block(ws.id)}>
                        حظر
                      </button>
                      <button className="btn secondary" onClick={() => extend(ws.id)}>
                        تمديد
                      </button>
                      <button className="btn secondary" onClick={() => editLimits(ws)}>
                        الحدود
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {workspaces.length === 0 && (
              <tr>
                <td colSpan={8}>لا يوجد أي Workspace بعد</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="page-title" style={{ fontSize: 18 }}>
        سجل التدقيق (آخر 200 عملية)
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>Super Admin</th>
              <th>العملية</th>
              <th>Workspace</th>
              <th>التفاصيل</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.createdAt).toLocaleString("ar")}</td>
                <td>{a.superAdmin.email}</td>
                <td>{a.action}</td>
                <td>{a.targetWorkspaceId ?? "-"}</td>
                <td>{a.details}</td>
                <td>{a.ipAddress ?? "-"}</td>
              </tr>
            ))}
            {actions.length === 0 && (
              <tr>
                <td colSpan={6}>لا يوجد سجل بعد</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
