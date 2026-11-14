"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface CaseRow {
  case_id: number; case_no: string; title: string; case_type: string; status: string; priority: string;
  opened_date: string; created_by_name: string; evidence_count: number; investigation_count: number; open_investigations: number;
}
const TYPES = ["MALWARE", "FRAUD", "DATA_BREACH", "HARASSMENT", "INTELLECTUAL_PROPERTY", "OTHER"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED"];

export default function CasesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [filters, setFilters] = useState({ q: "", status: "", priority: "" });
  const [form, setForm] = useState({ title: "", description: "", case_type: "MALWARE", priority: "MEDIUM" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    const res = await fetch("/api/cases?" + p);
    if (res.status === 401) { router.push("/login"); return; }
    setRows(await res.json());
  }, [filters, router]);
  // Load on filter changes; update state only after the fetch promise resolves.
  useEffect(() => {
    let cancelled = false;
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    fetch("/api/cases?" + p)
      .then(async (res) => {
        if (res.status === 401) { router.push("/login"); return null; }
        if (!res.ok) throw new Error("Failed to load cases");
        return res.json() as Promise<CaseRow[]>;
      })
      .then((data) => { if (!cancelled && data) setRows(data); })
      .catch((error: unknown) => {
        if (!cancelled) setMsg({ ok: false, text: error instanceof Error ? error.message : "Failed to load cases" });
      });
    return () => { cancelled = true; };
  }, [filters, router]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await res.json();
    if (res.ok) { setMsg({ ok: true, text: "Created " + body.case_no }); setForm({ ...form, title: "", description: "" }); load(); }
    else setMsg({ ok: false, text: body.error + (body.details ? ": " + body.details.join("; ") : "") });
  }
  async function edit(id: number, oldTitle: string, oldPriority: string) {
    const title = window.prompt("Update case title", oldTitle);
    if (title === null) return;
    const priority = window.prompt("Priority: LOW, MEDIUM, HIGH, CRITICAL", oldPriority);
    if (priority === null) return;
    const res = await fetch(`/api/cases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, priority }) });
    const body = await res.json();
    setMsg({ ok: res.ok, text: res.ok ? "Case updated" : body.error });
    if (res.ok) load();
  }
  async function close(id: number) {
    const res = await fetch(`/api/cases/${id}/close`, { method: "POST" });
    const body = await res.json();
    setMsg({ ok: res.ok, text: res.ok ? "Case closed" : body.error }); load();
  }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="flex justify-between items-center">
        <div><h1 className="text-2xl font-bold">Cases</h1><nav className="mt-2 flex gap-4 text-sm underline"><a href="/investigations">Investigations</a><a href="/reports">Reports</a><a href="/dashboard">Dashboard</a><a href="/audit">Audit</a></nav></div>
        <button onClick={logout} className="text-sm underline">Log out</button>
      </header>

      {msg && <p className={msg.ok ? "text-green-700" : "text-red-700"}>{msg.text}</p>}

      <form onSubmit={create} className="grid grid-cols-6 gap-2 bg-gray-50 p-4 rounded border">
        <input className="col-span-2 border rounded p-2" placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required minLength={3} />
        <input className="col-span-2 border rounded p-2" placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <select className="border rounded p-2" value={form.case_type} onChange={e => setForm({ ...form, case_type: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
        <select className="border rounded p-2" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>{PRIORITIES.map(t => <option key={t}>{t}</option>)}</select>
        <button className="col-span-6 bg-blue-700 text-white rounded p-2">Create case</button>
      </form>

      <div className="flex gap-2">
        <input className="border rounded p-2 flex-1" placeholder="Search title / case no" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} />
        <select className="border rounded p-2" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">All status</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
        <select className="border rounded p-2" value={filters.priority} onChange={e => setFilters({ ...filters, priority: e.target.value })}><option value="">All priority</option>{PRIORITIES.map(s => <option key={s}>{s}</option>)}</select>
      </div>

      <table className="w-full text-sm border">
        <thead className="bg-gray-100 text-left"><tr>
          {["Case no", "Title", "Type", "Status", "Priority", "Evidence", "Open inv.", "Created by", ""].map(h => <th key={h} className="p-2">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.case_id} className="border-t">
              <td className="p-2 font-mono">{r.case_no}</td><td className="p-2">{r.title}</td><td className="p-2">{r.case_type}</td>
              <td className="p-2">{r.status}</td><td className="p-2">{r.priority}</td><td className="p-2">{r.evidence_count}</td>
              <td className="p-2">{r.open_investigations}</td><td className="p-2">{r.created_by_name}</td>
              <td className="p-2 whitespace-nowrap">{r.status !== "CLOSED" && <><button onClick={() => edit(r.case_id, r.title, r.priority)} className="mr-3 text-blue-700 underline">Edit</button><button onClick={() => close(r.case_id)} className="text-red-700 underline">Close</button></>}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-gray-500">No cases</td></tr>}
        </tbody>
      </table>
    </main>
  );
}
