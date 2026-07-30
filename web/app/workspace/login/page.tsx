"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { workspaceApiFetch, setWorkspaceToken } from "../../../lib/workspaceApi";

export default function WorkspaceLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await workspaceApiFetch<{ token: string }>("/api/auth/user/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setWorkspaceToken(res.token);
      router.replace("/workspace");
    } catch (err: any) {
      // رسالة الإيقاف/الحظر/انتهاء الاشتراك تأتي كما هي من الخادم (requireActiveWorkspace) —
      // تُعرض للمستخدم حرفيًا بدل استبدالها برسالة عامة.
      setError(err.message ?? "فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={onSubmit}>
        <h1>تسجيل الدخول</h1>
        <div className="field">
          <label>البريد الإلكتروني</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>كلمة المرور</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "جارٍ الدخول..." : "دخول"}
        </button>
      </form>
    </div>
  );
}
