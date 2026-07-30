"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getWorkspaceToken, clearWorkspaceToken, workspaceApiFetch, ApiError } from "../../../lib/workspaceApi";

export default function WorkspaceAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ready" | "blocked">("loading");
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!getWorkspaceToken()) {
      router.replace("/workspace/login");
      return;
    }
    workspaceApiFetch("/api/auth/user/me")
      .then(() => setState("ready"))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          // الحساب كان مسجَّلًا دخوله لكن أُوقف/انتهى بعد ذلك - نعرض الرسالة بدل إعادة توجيه صامتة
          setBlockedMessage(err.message);
          setState("blocked");
        } else if (err instanceof ApiError && err.status === 401) {
          router.replace("/workspace/login");
        }
      });
  }, [router]);

  if (state === "loading") return null;

  if (state === "blocked") {
    return (
      <div className="login-wrap">
        <div className="login-box" style={{ textAlign: "center" }}>
          <h1>تعذّر الوصول</h1>
          <p className="error-text" style={{ fontSize: 15 }}>
            {blockedMessage}
          </p>
          <button
            className="btn secondary"
            style={{ width: "100%", marginTop: 16 }}
            onClick={() => {
              clearWorkspaceToken();
              router.replace("/workspace/login");
            }}
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  return <div className="layout">{children}</div>;
}
