"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { superAdminApiFetch, setSuperAdminToken } from "../../../lib/superAdminApi";

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "2fa">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await superAdminApiFetch<{ pendingToken: string }>("/api/superadmin/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setPendingToken(res.pendingToken);
      setStep("2fa");
    } catch (err: any) {
      setError(err.message ?? "فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit2fa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await superAdminApiFetch<{ token: string }>("/api/superadmin/auth/verify-2fa", {
        method: "POST",
        body: JSON.stringify({ pendingToken, code }),
      });
      setSuperAdminToken(res.token);
      router.replace("/superadmin");
    } catch (err: any) {
      setError(err.message ?? "رمز التحقق غير صحيح");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={step === "credentials" ? onSubmitCredentials : onSubmit2fa}>
        <h1>دخول Super Admin</h1>
        {step === "credentials" ? (
          <>
            <div className="field">
              <label>البريد الإلكتروني</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>كلمة المرور</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </>
        ) : (
          <div className="field">
            <label>رمز التحقق الثنائي (من تطبيق المصادقة)</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
          </div>
        )}
        {error && <div className="error-text">{error}</div>}
        <button className="btn" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "جارٍ التحقق..." : step === "credentials" ? "متابعة" : "دخول"}
        </button>
      </form>
    </div>
  );
}
