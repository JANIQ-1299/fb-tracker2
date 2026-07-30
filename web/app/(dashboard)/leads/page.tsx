"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { apiFetch } from "../../../lib/api";

interface Lead {
  id: string;
  metaLeadId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  orderValue: number | null;
  isDuplicate: boolean;
  notes: string | null;
  createdAt: string;
  campaign?: { name: string } | null;
  ad?: { name: string } | null;
  page?: { name: string } | null;
}

const STATUSES = ["جديد", "تم التواصل", "مؤهل", "تم تقديم الطلب", "ملغي"];

export default function LeadsPage() {
  const [items, setItems] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    apiFetch<{ items: Lead[]; total: number }>(`/api/leads?${params.toString()}`)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [search, status]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function updateStatus(lead: Lead, newStatus: string) {
    await apiFetch(`/api/leads/${lead.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  }

  async function updateOrderValue(lead: Lead, value: string) {
    const orderValue = value === "" ? null : Number(value);
    await apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ orderValue }) });
    load();
  }

  return (
    <div>
      <h2 className="page-title">العملاء ({total})</h2>
      <div className="filters">
        <input placeholder="بحث بالاسم أو الهاتف أو البريد" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p>جارٍ التحميل...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الهاتف</th>
                <th>الإعلان</th>
                <th>الحالة</th>
                <th>قيمة الطلب</th>
                <th>مكرر؟</th>
                <th>التاريخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((lead) => (
                <Fragment key={lead.id}>
                  <tr>
                    <td>{lead.name ?? "-"}</td>
                    <td>{lead.phone ?? "-"}</td>
                    <td>{lead.ad?.name ?? "-"}</td>
                    <td>
                      <select value={lead.status} onChange={(e) => updateStatus(lead, e.target.value)}>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        defaultValue={lead.orderValue ?? ""}
                        style={{ width: 90 }}
                        onBlur={(e) => updateOrderValue(lead, e.target.value)}
                      />
                    </td>
                    <td>
                      {lead.isDuplicate ? <span className="badge danger">مكرر</span> : <span className="badge success">فريد</span>}
                    </td>
                    <td>{new Date(lead.createdAt).toLocaleDateString("ar-IQ")}</td>
                    <td>
                      <button className="btn secondary" onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}>
                        {expanded === lead.id ? "إخفاء" : "تفاصيل"}
                      </button>
                    </td>
                  </tr>
                  {expanded === lead.id && (
                    <tr>
                      <td colSpan={8}>
                        <LeadDetails leadId={lead.id} onSaved={load} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", color: "var(--text-dim)" }}>
                    لا يوجد عملاء مطابقون
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LeadDetails({ leadId, onSaved }: { leadId: string; onSaved: () => void }) {
  const [data, setData] = useState<any>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    apiFetch(`/api/leads/${leadId}`).then((d: any) => {
      setData(d);
      setNotes(d.notes ?? "");
    });
  }, [leadId]);

  async function saveNotes() {
    await apiFetch(`/api/leads/${leadId}`, { method: "PATCH", body: JSON.stringify({ notes }) });
    onSaved();
  }

  if (!data) return <p>جارٍ التحميل...</p>;

  return (
    <div style={{ padding: 12 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 6, color: "var(--text-dim)", fontSize: 13 }}>ملاحظات</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
        <button className="btn" style={{ marginTop: 8 }} onClick={saveNotes}>
          حفظ الملاحظات
        </button>
      </div>
      <div>
        <div style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 6 }}>سجل تغييرات الحالة</div>
        <ul style={{ margin: 0, paddingRight: 18 }}>
          {(data.statusHistory ?? []).map((h: any) => (
            <li key={h.id} style={{ fontSize: 13, marginBottom: 4 }}>
              {h.oldStatus ?? "—"} ← {h.newStatus} ({h.source}) بتاريخ {new Date(h.changedAt).toLocaleString("ar-IQ")}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
