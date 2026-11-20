"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface EvidenceRow {
  evidence_id: number;
  evidence_name: string;
  status: string;
  file_hash: string;
  collection_date: string;
  case_no: string;
  type_name: string;
  holder_name: string;
}
interface CaseOption { case_id: number; case_no: string }
interface TypeOption { evidence_type_id: number; type_name: string }

const EMPTY_FORM = {
  caseId: "",
  evidenceTypeId: "",
  evidenceName: "",
  source: "",
  description: "",
  metadata: "",
};

export default function EvidencePage() {
  const router = useRouter();
  const [rows, setRows] = useState<EvidenceRow[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [transfer, setTransfer] = useState({ evidenceId: "", toUserId: "", location: "", remarks: "" });
  const [transferMsg, setTransferMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [transferring, setTransferring] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/evidence");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) {
      setMsg({ ok: false, text: "Could not load evidence" });
      return;
    }
    const body = await res.json();
    setRows(body.evidence);
    setCases(body.cases);
    setTypes(body.types);
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/evidence", { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401) { router.push("/login"); return; }
        if (!res.ok) { setMsg({ ok: false, text: "Could not load evidence" }); return; }
        const body = await res.json();
        if (!controller.signal.aborted) {
          setRows(body.evidence);
          setCases(body.cases);
          setTypes(body.types);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setMsg({ ok: false, text: "Could not load evidence" });
      });
    return () => controller.abort();
  }, [router]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Keep a reference to the form now. React clears e.currentTarget
    // after the first await, so reading it later returns null.
    const formEl = e.currentTarget;

    if (!file) {
      setMsg({ ok: false, text: "Choose a file to register" });
      return;
    }

    const data = new FormData();
    data.append("file", file);
    Object.entries(form).forEach(([key, value]) => data.append(key, value));

    const res = await fetch("/api/evidence", { method: "POST", body: data });
    const body = await res.json();

    if (res.ok) {
      setMsg({
        ok: true,
        text: `Registered evidence #${body.evidenceId}. SHA-256: ${body.fileHash.slice(0, 16)}…`,
      });
      setForm(EMPTY_FORM);
      setFile(null);
      formEl.reset();
      void load();
    } else {
      setMsg({
        ok: false,
        text: body.error + (body.details ? ": " + body.details.join("; ") : ""),
      });
    }
  }

  async function submitTransfer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTransferring(true);
    setTransferMsg(null);
    try {
      const res = await fetch("/api/custody/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceId: Number(transfer.evidenceId), toUserId: Number(transfer.toUserId), location: transfer.location, remarks: transfer.remarks }),
      });
      const body = await res.json();
      if (!res.ok) {
        setTransferMsg({ ok: false, text: body.error ?? "Transfer failed" });
        return;
      }
      setTransferMsg({ ok: true, text: `Transfer recorded (custody #${body.custodyId}).` });
      setTransfer({ evidenceId: "", toUserId: "", location: "", remarks: "" });
      await load();
    } catch {
      setTransferMsg({ ok: false, text: "Could not complete transfer. Check the connection and try again." });
    } finally {
      setTransferring(false);
    }
  }
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex items-center justify-between border-b border-zinc-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold">Evidence</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Register evidence and review who holds it.
            </p>
          </div>
          <Link href="/" className="text-sm text-blue-400 underline">
            Home
          </Link>
        </header>

        {msg && (
          <p
            className={`rounded-lg border p-3 text-sm ${
              msg.ok
                ? "border-green-800 bg-green-950 text-green-300"
                : "border-red-800 bg-red-950 text-red-300"
            }`}
          >
            {msg.text}
          </p>
        )}

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-4 text-lg font-semibold">Register evidence</h2>
          <p className="mb-4 text-xs text-zinc-500">
            Only custodians can register evidence. The server computes the SHA-256
            hash and stores the file in the vault.
          </p>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <select
              required
              className="rounded-md border border-zinc-700 bg-zinc-950 p-2"
              value={form.caseId}
              onChange={(e) => setForm({ ...form, caseId: e.target.value })}
            >
              <option value="">Select case</option>
              {cases.map((c) => (
                <option key={c.case_id} value={c.case_id}>
                  {c.case_no}
                </option>
              ))}
            </select>

            <select
              required
              className="rounded-md border border-zinc-700 bg-zinc-950 p-2"
              value={form.evidenceTypeId}
              onChange={(e) => setForm({ ...form, evidenceTypeId: e.target.value })}
            >
              <option value="">Select evidence type</option>
              {types.map((t) => (
                <option key={t.evidence_type_id} value={t.evidence_type_id}>
                  {t.type_name}
                </option>
              ))}
            </select>

            <input
              required
              placeholder="Evidence name"
              className="rounded-md border border-zinc-700 bg-zinc-950 p-2"
              value={form.evidenceName}
              onChange={(e) => setForm({ ...form, evidenceName: e.target.value })}
            />
            <input
              placeholder="Source (for example, FIN-SRV-02)"
              className="rounded-md border border-zinc-700 bg-zinc-950 p-2"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />

            <textarea
              placeholder="Description"
              rows={2}
              className="rounded-md border border-zinc-700 bg-zinc-950 p-2 sm:col-span-2"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <textarea
              placeholder='Metadata as JSON, for example {"file_type":"disk_image"}'
              rows={2}
              className="rounded-md border border-zinc-700 bg-zinc-950 p-2 font-mono text-sm sm:col-span-2"
              value={form.metadata}
              onChange={(e) => setForm({ ...form, metadata: e.target.value })}
            />

            <input
              type="file"
              required
              className="text-sm text-zinc-300 sm:col-span-1"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500 sm:col-span-1"
            >
              Register evidence
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-2 text-lg font-semibold">Transfer custody</h2>
          <p className="mb-4 text-sm text-zinc-400">Only the current holder can transfer evidence. Enter the recipient&apos;s user ID.</p>
          {transferMsg && <p role="status" className={`mb-4 rounded border p-3 text-sm ${transferMsg.ok ? "border-green-800 text-green-300" : "border-red-800 text-red-300"}`}>{transferMsg.text}</p>}
          <form onSubmit={submitTransfer} className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Evidence
              <select required value={transfer.evidenceId} onChange={e => setTransfer({ ...transfer, evidenceId: e.target.value })} className="rounded-md border border-zinc-700 bg-zinc-950 p-2">
                <option value="">Select evidence</option>
                {rows.map(row => <option key={row.evidence_id} value={row.evidence_id}>#{row.evidence_id} - {row.evidence_name} (holder: {row.holder_name})</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">Recipient user ID
              <input required type="number" min="1" step="1" value={transfer.toUserId} onChange={e => setTransfer({ ...transfer, toUserId: e.target.value })} className="rounded-md border border-zinc-700 bg-zinc-950 p-2" />
            </label>
            <label className="grid gap-1 text-sm">Location (optional)
              <input maxLength={150} value={transfer.location} onChange={e => setTransfer({ ...transfer, location: e.target.value })} className="rounded-md border border-zinc-700 bg-zinc-950 p-2" />
            </label>
            <label className="grid gap-1 text-sm">Remarks (optional)
              <input maxLength={1000} value={transfer.remarks} onChange={e => setTransfer({ ...transfer, remarks: e.target.value })} className="rounded-md border border-zinc-700 bg-zinc-950 p-2" />
            </label>
            <button disabled={transferring} className="rounded-md bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500 disabled:opacity-50">{transferring ? "Transferring..." : "Transfer custody"}</button>
          </form>
        </section>
        <section className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 text-zinc-400">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Evidence</th>
                <th className="p-3">Case</th>
                <th className="p-3">Type</th>
                <th className="p-3">Holder</th>
                <th className="p-3">Status</th>
                <th className="p-3">SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.evidence_id} className="border-b border-zinc-800">
                  <td className="p-3">{r.evidence_id}</td>
                  <td className="p-3">{r.evidence_name}</td>
                  <td className="p-3">{r.case_no}</td>
                  <td className="p-3">{r.type_name}</td>
                  <td className="p-3">{r.holder_name}</td>
                  <td className="p-3">{r.status}</td>
                  <td className="p-3 font-mono text-xs text-zinc-500">
                    {r.file_hash.slice(0, 12)}…
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="p-3 text-zinc-500" colSpan={7}>
                    No evidence yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}