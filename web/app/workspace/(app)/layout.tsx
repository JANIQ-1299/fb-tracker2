"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getWorkspaceToken, clearWorkspaceToken, workspaceApiFetch, ApiError } from "../../../lib/workspaceApi";

export default function WorkspaceAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ready" | "blocked" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  function checkSession() {
    setState("loading");
    workspaceApiFetch("/api/auth/user/me")
      .then(() => setState("ready"))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          // الحساب كان مسجَّلًا دخوله لكن أُوقف/انتهى بعد ذلك - نعرض الرسالة بدل إعادة توجيه صامتة
          setMessage(err.message);
          setState("blocked");
        } else if (err instanceof ApiError && err.status === 401) {
          router.replace("/workspace/login");
        } else {
          // أي خطأ آخر (429 كثرة الطلبات، انقطاع شبكة مؤقت، ...) - رسالة قابلة لإعادة المحاولة
          // بدل ترك الصفحة فارغة بصمت إلى الأبد.
          setMessage(err instanceof ApiError ? err.message : "تعذّر الاتصال بالخادم");
          setState("error");
        }
      });
  }

  useEffect(() => {
    if (!getWorkspaceToken()) {
      router.replace("/workspace/login");
      return;
    }
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (state === "loading") return null;

  if (state === "blocked" || state === "error") {
    return (
      <div className="login-wrap">
        <div className="login-box" style={{ textAlign: "center" }}>
          <h1>{state === "blocked" ? "تعذّر الوصول" : "حدث خطأ مؤقت"}</h1>
          <p className="error-text" style={{ fontSize: 15 }}>
            {message}
          </p>
          {state === "error" && (
            <button className="btn" style={{ width: "100%", marginTop: 16 }} onClick={checkSession}>
              إعادة المحاولة
            </button>
          )}
          <button
            className="btn secondary"
            style={{ width: "100%", marginTop: 10 }}
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
