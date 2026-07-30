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

interface ValidationResult {
  totalRows: number;
  validCount: number;
  missingCount: number;
  errorCount: number;
  duplicateCount: number;
  missing: RowIssue[];
  errors: RowIssue[];
  duplicates: RowIssue[];
  sampleValid: { rowNumber: number; data: Record<string, unknown> }[];
}

interface ImportFileRow {
  id: string;
  filename: string;
  uploadedAt: string;
  uploadedByEmail: string;
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  duplicateCount: number;
  status: string;
}

type Step = "select-file" | "select-sheet" | "mapping" | "validation" | "done";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function ImportsPage() {
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
  const [duplicateStrategy, setDuplicateStrategy] = useState<"skip" | "import_flagged">("skip");

  const [confirming, setConfirming] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [history, setHistory] = useState<ImportFileRow[]>([]);

  async function loadHistory() {
    const res = await workspaceApiFetch<{ files: ImportFileRow[] }>("/api/imports");
    setHistory(res.files);
  }

  useEffect(() => {
    loadHistory();
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
    setSuccessMessage(null);
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
      const res = await fetch(`${API_BASE}/api/imports/upload`, {
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
        `/api/imports/${stId}/sheets/${encodeURIComponent(sheetName)}`,
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
      const res = await workspaceApiFetch<ValidationResult>(`/api/imports/${stagingId}/validate`, {
        method: "POST",
        body: JSON.stringify({ sheetName: selectedSheet, columnMapping: buildColumnMapping() }),
      });
      setValidation(res);
      setStep("validation");
    } catch (err: any) {
      setError(err.message ?? "فشلت معاينة النتائج");
    } finally {
      setValidating(false);
    }
  }

  async function confirmImport() {
    if (!stagingId) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await workspaceApiFetch<{ message: string }>(`/api/imports/${stagingId}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          sheetName: selectedSheet,
          columnMapping: buildColumnMapping(),
          duplicateStrategy,
        }),
      });
      setSuccessMessage(res.message);
      setStep("done");
      loadHistory();
    } catch (err: any) {
      setError(err.message ?? "فشل تأكيد الاستيراد");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <main className="main">
      <h1 className="page-title">استيراد الطلبات</h1>

      {error && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--danger)" }}>
          <span className="error-text">{error}</span>
        </div>
      )}

      {step === "select-file" && (
        <div className="card">
          <div className="label">اختر ملف الطلبات (xlsx, xls, csv)</div>
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
            إجمالي الصفوف: {sheetData.totalRows}. تم التعرّف التلقائي على الأعمدة الممكنة - عدّل أي
            عمود لم يُتعرَّف عليه بشكل صحيح.
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
          <p style={{ fontSize: 12, color: "var(--text-dim)" }}>* يلزم توفر واحد على الأقل من الحقول المعلَّمة بنجمة (اسم الزبون أو رقم الهاتف) لاعتبار الصف صحيحًا.</p>
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
              <div className="label">صفوف صحيحة</div>
              <div className="value">{validation.validCount}</div>
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
              <div className="label">مكرّرة محتملة</div>
              <div className="value">{validation.duplicateCount}</div>
            </div>
          </div>

          {validation.errorCount + validation.missingCount > 0 && (
            <div className="table-wrap" style={{ marginTop: 16, maxHeight: 240, overflowY: "auto" }}>
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

          {validation.duplicateCount > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="label">كيف تريد التعامل مع الصفوف المكرّرة؟</div>
              <label style={{ display: "block", margin: "6px 0" }}>
                <input
                  type="radio"
                  name="dupStrategy"
                  checked={duplicateStrategy === "skip"}
                  onChange={() => setDuplicateStrategy("skip")}
                />{" "}
                تجاهل المكرر (لا يُستورد)
              </label>
              <label style={{ display: "block", margin: "6px 0" }}>
                <input
                  type="radio"
                  name="dupStrategy"
                  checked={duplicateStrategy === "import_flagged"}
                  onChange={() => setDuplicateStrategy("import_flagged")}
                />{" "}
                استيراده مع علامة مكرر
              </label>
              <div className="table-wrap" style={{ marginTop: 8, maxHeight: 180, overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>رقم الصف</th>
                      <th>السبب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.duplicates.map((d, i) => (
                      <tr key={i}>
                        <td>{d.rowNumber}</td>
                        <td>{d.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button className="btn secondary" onClick={() => setStep("mapping")}>
              رجوع لتعديل الربط
            </button>
            <button className="btn" onClick={confirmImport} disabled={confirming || validation.validCount === 0}>
              {confirming ? "جارٍ الاستيراد..." : "تأكيد الاستيراد"}
            </button>
          </div>
        </div>
      )}

      {step === "done" && successMessage && (
        <div className="card" style={{ borderColor: "var(--success)" }}>
          <p style={{ fontSize: 15 }}>{successMessage}</p>
          <button className="btn" onClick={resetWizard}>
            استيراد ملف آخر
          </button>
        </div>
      )}

      <h2 className="page-title" style={{ fontSize: 18, marginTop: 32 }}>
        سجل ملفات الاستيراد
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>اسم الملف</th>
              <th>تاريخ الرفع</th>
              <th>رفعه</th>
              <th>الإجمالي</th>
              <th>المقبول</th>
              <th>المرفوض</th>
              <th>المكرر</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {history.map((f) => (
              <tr key={f.id}>
                <td>{f.filename}</td>
                <td>{new Date(f.uploadedAt).toLocaleString("ar")}</td>
                <td>{f.uploadedByEmail}</td>
                <td>{f.rowCount}</td>
                <td>{f.acceptedCount}</td>
                <td>{f.rejectedCount}</td>
                <td>{f.duplicateCount}</td>
                <td>
                  <span className={`badge ${f.status === "DONE" ? "success" : f.status === "FAILED" ? "danger" : "warning"}`}>
                    {f.status}
                  </span>
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={8}>لا يوجد أي ملف مستورد بعد.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
