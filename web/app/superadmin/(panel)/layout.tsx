"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSuperAdminToken, clearSuperAdminToken } from "../../../lib/superAdminApi";

export default function SuperAdminPanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getSuperAdminToken()) {
      router.replace("/superadmin/login");
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) return null;

  return (
    <div className="layout">
      <aside className="sidebar" style={{ borderColor: "var(--danger)" }}>
        <h1 style={{ color: "var(--danger)" }}>Super Admin</h1>
        <nav>
          <a href="/superadmin">الـWorkspaces</a>
        </nav>
        <button
          className="btn secondary"
          style={{ marginTop: 24, width: "100%" }}
          onClick={() => {
            clearSuperAdminToken();
            router.replace("/superadmin/login");
          }}
        >
          تسجيل الخروج
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
