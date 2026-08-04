"use client";

import { useEffect, useRef, useState } from "react";
import { workspaceApiFetch, getWorkspaceToken } from "../../../../lib/workspaceApi";

interface CanonicalFieldDef {
  key: string;
  label: string;
  identity: boolean;
}

interface SheetResponse {
  headers: string[];
  previewRows: unknown[][];
  totalRows: number;
  suggestedMapping: Record<string, number>;
  canonicalFields: CanonicalFieldDef[];
}

interface RowIssue {
  rowNumber: number;
  reason: string;
}

interface GroupedRow {
  conversationId: string;
  customerPsid: string;
  pageMetaId: string;
  normalizedPhone: string | null;
  referralAdId: string | null;
  firstMessageAt: string;
  lastMessageAt: string;
  rowCount: number;
  conflicts: string[];
}

interface ValidationResult {
  totalRows: number;
  groupedCount: number;
  missingCount: number;
  errorCount: number;
  conflictCount: number;
  missing: RowIssue[];
  errors: RowIssue[];
  sampleGrouped: GroupedRow[];
  conflicting: GroupedRow[];
}

interface AttributionSummary {
  total: number;
  exact: number;
  probable: number;
  manual: number;
  needsReview: number;
  unmatched: number;
}

interface ImportBatch {
  id: string;
  filename: string;
  uploadedAt: string;
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  duplicateCount: number;
  status: string;
  deletedAt: string | null;
}

type Step = "select-file" | "select-sheet" | "mapping" | "validation" | "done";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function ConversationImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("select-file");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [stagingId, setStagingId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");

  const [sheetData, setSheetData] = useState<SheetResponse | null>(null);
  const [headerToField, setHeaderToField] = useState<Record<number, string>>({});

  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [resultSummary, setResultSummary] = useState<{ batch: ImportBatch; attributionSummary: AttributionSummary } | null>(null);

  const [batches, setBatches] = useState<ImportBatch[]>([]);

  async function loadBatches() {
    const res = await workspaceApiFetch<{ batches: ImportBatch[] }>("/api/conversation-import/batches");
    setBatches(res.batches);
  }

  useEffect(() => {
    loadBatches();
  }, []);

  function resetWizard() {
    setStep("select-file");
    setStagingId(null);
    setFilename("");
    setSheetNames([]);
    setSelectedSheet("");
    setSheetData(null);
    setHeaderToField({});
    setValidation(null);
    setConfirmChecked(false);
    setResultSummary(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getWorkspaceToken();
      const res = await fetch(`${API_BASE}/api/conversation-import/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل رفع الملف");

      setStagingId(data.stagingId);
      setFilename(data.filename);
      setSheetNames(data.sheetNames);
      if (data.sheetNames.length === 1) {
        await chooseSheet(data.stagingId, data.sheetNames[0]);
      } else {
        setStep("select-sheet");
      }
    } catch (err: any) {
      setError(err.message ?? "فشل رفع الملف");
    } finally {
      setUploading(false);
    }
  }

  async function chooseSheet(stId: string, sheetName: string) {
    setError(null);
    try {
      const res = await workspaceApiFetch<SheetResponse>(
        `/api/conversation-import/${stId}/sheets/${encodeURIComponent(sheetName)}`,
      );
      setSelectedSheet(sheetName);
      setSheetData(res);
      const inverse: Record<number, string> = {};
      for (const [field, index] of Object.entries(res.suggestedMapping)) inverse[index] = field;
      setHeaderToField(inverse);
      setStep("mapping");
    } catch (err: any) {
      setError(err.message ?? "تعذّر قراءة الورقة");
    }
  }

  function buildColumnMapping(): Record<string, number> {
    const mapping: Record<string, number> = {};
    for (const [indexStr, field] of Object.entries(headerToField)) {
      if (field) mapping[field] = Number(indexStr);
    }
    return mapping;
  }

  async function runValidate() {
    if (!stagingId) return;
    setValidating(true);
    setError(null);
    try {
      const res = await workspaceApiFetch<ValidationResult>(`/api/conversation-import/${stagingId}/validate`, {
        method: "POST",
        body: JSON.stringify({ sheetName: selectedSheet, columnMapping: buildColumnMapping() }),
      });
      setValidation(res);
      setConfirmChecked(false);
      setStep("validation");
    } catch (err: any) {
      setError(err.message ?? "فشلت معاينة النتائج");
    } finally {
      setValidating(false);
    }
  }

  async function confirmImport() {
    if (!stagingId || !confirmChecked) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await workspaceApiFetch<{ batch: ImportBatch; attributionSummary: AttributionSummary }>(
        `/api/conversation-import/${stagingId}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({ sheetName: selectedSheet, columnMapping: buildColumnMapping(), confirm: true }),
        },
      );
      setResultSummary(res);
      setStep("done");
      loadBatches();
    } catch (err: any) {
      setError(err.message ?? "فشل تأكيد الاستيراد");
    } finally {
      setConfirming(false);
    }
  }

  async function deleteBatch(batchId: string) {
    if (!window.confirm("حذف كل بيانات هذه الدفعة نهائيًا؟ سيُعاد حساب مطابقة الطلبات تلقائيًا بعد الحذف.")) return;
    try {
      await workspaceApiFetch(`/api/conversation-import/batches/${batchId}`, { method: "DELETE" });
      await loadBatches();
    } catch (err: any) {
      setError(err.message ?? "فشل الحذف");
    }
  }

  async function deleteAll() {
    if (!window.confirm("حذف جميع بيانات الاستيراد التاريخي لكل الدفعات نهائيًا؟ سيُعاد حساب مطابقة الطلبات تلقائيًا بعد الحذف.")) return;
    try {
      await workspaceApiFetch("/api/conversation-import/all", { method: "DELETE" });
      await loadBatches();
    } catch (err: any) {
      setError(err.message ?? "فشل الحذف");
    }
  }

  return (
    <main className="main">
      <h1 className="page-title">Historical Conversation Import</h1>

      <div className="card" style={{ marginBottom: 16, fontSize: 13, color: "var(--text-dim)" }}>
        هذا مستورد بيانات عام لملف تُعِدّه أنت بنفسك خارج هذا النظام تمامًا (لا يستدعي هذا المشروع أي
        Instagram Conversations/Messages API إطلاقًا). يقبل فقط: معرّف المحادثة، معرّف العميل
        (PSID/IGSID)، رقم الهاتف الموحّد، توقيت الرسالة، معرّف الإعلان المرجعي (referral_ad_id) إن
        توفر، ومعرّف الصفحة - بلا أي نص رسائل أو أسماء مستخدمين. تُحذف نسخة الملف المرفوعة فور
        اكتمال المعالجة.
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--danger)" }}>
          <span className="error-text">{error}</span>
        </div>
      )}

      {step === "select-file" && (
        <div className="card">
          <div className="label">اختر ملف بيانات المحادثات (xlsx, xls, csv)</div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFileChosen} disabled={uploading} />
          {uploading && <p style={{ fontSize: 13, color: "var(--text-dim)" }}>جارٍ رفع الملف وقراءته...</p>}
        </div>
      )}

      {step === "select-sheet" && (
        <div className="card">
          <div className="label">اختر ورقة العمل (Sheet)</div>
          <p style={{ fontSize: 13, color: "var(--text-dim)" }}>الملف "{filename}" يحتوي أكثر من ورقة:</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {sheetNames.map((name) => (
              <button key={name} className="btn secondary" onClick={() => stagingId && chooseSheet(stagingId, name)}>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "mapping" && sheetData && (
        <div className="card">
          <div className="label">ربط الأعمدة ({filename} - {selectedSheet})</div>
          <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
            إجمالي الصفوف: {sheetData.totalRows}. اربط كل عمود بحقله المناسب - عمود المحادثة أو
            العميل واحد منهما على الأقل مطلوب، وكذلك معرّف الصفحة.
          </p>
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  {sheetData.headers.map((h, i) => (
                    <th key={i}>{h || `عمود ${i + 1}`}</th>
                  ))}
                </tr>
                <tr>
                  {sheetData.headers.map((_, i) => (
                    <th key={i}>
                      <select
                        value={headerToField[i] ?? ""}
                        onChange={(e) => setHeaderToField((prev) => ({ ...prev, [i]: e.target.value }))}
                      >
                        <option value="">تجاهل هذا العمود</option>
                        {sheetData.canonicalFields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                            {f.identity ? " *" : ""}
                          </option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheetData.previewRows.map((row, ri) => (
                  <tr key={ri}>
                    {sheetData.headers.map((_, ci) => (
                      <td key={ci}>{String((row as unknown[])[ci] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={resetWizard}>
              إلغاء
            </button>
            <button className="btn" onClick={runValidate} disabled={validating}>
              {validating ? "جارٍ المعاينة..." : "معاينة النتائج قبل الاستيراد"}
            </button>
          </div>
        </div>
      )}

      {step === "validation" && validation && (
        <div className="card">
          <div className="label">نتيجة المعاينة قبل الاستيراد</div>
          <div className="cards" style={{ marginTop: 10 }}>
            <div className="card">
              <div className="label">إجمالي الصفوف</div>
              <div className="value">{validation.totalRows}</div>
            </div>
            <div className="card">
              <div className="label">محادثات مُجمَّعة</div>
              <div className="value">{validation.groupedCount}</div>
            </div>
            <div className="card">
              <div className="label">صفوف ناقصة</div>
              <div className="value">{validation.missingCount}</div>
            </div>
            <div className="card">
              <div className="label">أخطاء</div>
              <div className="value">{validation.errorCount}</div>
            </div>
            <div className="card">
              <div className="label">تعارضات</div>
              <div className="value">{validation.conflictCount}</div>
            </div>
          </div>

          {(validation.errorCount > 0 || validation.missingCount > 0) && (
            <div className="table-wrap" style={{ marginTop: 16, maxHeight: 220, overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>رقم الصف</th>
                    <th>السبب</th>
                  </tr>
                </thead>
                <tbody>
                  {[...validation.errors, ...validation.missing]
                    .sort((a, b) => a.rowNumber - b.rowNumber)
                    .map((issue, i) => (
                      <tr key={i}>
                        <td>{issue.rowNumber}</td>
                        <td>{issue.reason}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <div className="label">معاينة المحادثات المُجمَّعة (أول 20)</div>
            <div className="table-wrap" style={{ maxHeight: 260, overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>معرّف المحادثة</th>
                    <th>الهاتف</th>
                    <th>الإعلان المرجعي</th>
                    <th>عدد الصفوف</th>
                    <th>تعارضات</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.sampleGrouped.map((g) => (
                    <tr key={g.conversationId}>
                      <td>{g.conversationId}</td>
                      <td>{g.normalizedPhone ?? "-"}</td>
                      <td>{g.referralAdId ?? "-"}</td>
                      <td>{g.rowCount}</td>
                      <td>{g.conflicts.length > 0 ? g.conflicts.join(" | ") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
              راجعت المعاينة أعلاه وأؤكد استيراد هذه البيانات وتشغيل المطابقة عليها.
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button className="btn secondary" onClick={() => setStep("mapping")}>
                رجوع لتعديل الربط
              </button>
              <button className="btn" onClick={confirmImport} disabled={confirming || !confirmChecked || validation.groupedCount === 0}>
                {confirming ? "جارٍ الاستيراد..." : "تأكيد الاستيراد وتشغيل المطابقة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "done" && resultSummary && (
        <div className="card" style={{ borderColor: "var(--success)" }}>
          <p style={{ fontSize: 15 }}>
            تم الاستيراد: {resultSummary.batch.acceptedCount} محادثة مقبولة، {resultSummary.batch.duplicateCount} تعارض/تكرار.
          </p>
          <p style={{ fontSize: 14, color: "var(--text-dim)" }}>
            بعد إعادة تشغيل المطابقة: {resultSummary.attributionSummary.exact} دقيق، {resultSummary.attributionSummary.probable} محتمل،{" "}
            {resultSummary.attributionSummary.needsReview} يحتاج مراجعة، {resultSummary.attributionSummary.unmatched} غير مطابق.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" onClick={resetWizard}>
              استيراد ملف آخر
            </button>
            <a className="btn secondary" href="/workspace/attribution" style={{ display: "inline-flex", alignItems: "center" }}>
              عرض نتائج المطابقة
            </a>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 32 }}>
        <h2 className="page-title" style={{ fontSize: 18, margin: 0 }}>
          سجل دفعات الاستيراد
        </h2>
        {batches.some((b) => !b.deletedAt) && (
          <button className="btn secondary" onClick={deleteAll}>
            حذف جميع البيانات المستوردة
          </button>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>اسم الملف</th>
              <th>تاريخ الرفع</th>
              <th>الإجمالي</th>
              <th>المقبول</th>
              <th>المرفوض</th>
              <th>التعارضات</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{b.filename}</td>
                <td>{new Date(b.uploadedAt).toLocaleString("ar")}</td>
                <td>{b.rowCount}</td>
                <td>{b.acceptedCount}</td>
                <td>{b.rejectedCount}</td>
                <td>{b.duplicateCount}</td>
                <td>
                  <span className={`badge ${b.status === "DONE" ? "success" : b.status === "DELETED" ? "danger" : "warning"}`}>
                    {b.status}
                  </span>
                </td>
                <td>
                  {!b.deletedAt && (
                    <button className="btn secondary" onClick={() => deleteBatch(b.id)}>
                      حذف
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr>
                <td colSpan={8}>لا يوجد أي استيراد بعد.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
