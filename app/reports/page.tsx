"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

type Report = {
  report_id: number;
  investigation_id: number;
  report_title: string;
  report_status: string;
  case_no: string;
  investigator_name: string;
  snippet?: string;
};

type Investigation = {
  investigation_id: number;
  case_no: string;
  case_title: string;
  status: string;
};

function errorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return fallback;
}

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(errorMessage(body, `${fallback} (${response.status})`));
  }
  return body as T;
}

export default function ReportsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Report[]>([]);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [searchText, setSearchText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [investigationId, setInvestigationId] = useState("");
  const [title, setTitle] = useState("Initial forensic findings");
  const [content, setContent] = useState(
    "The collected evidence was examined. The SHA-256 hash was verified and the observed indicators were documented."
  );
  const [message, setMessage] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [reportResponse, investigationResponse] = await Promise.all([
          fetch(`/api/reports?q=${encodeURIComponent(searchTerm)}`),
          fetch("/api/investigations"),
        ]);

        if (reportResponse.status === 401 || investigationResponse.status === 401) {
          router.push("/login");
          return;
        }

        const [reportRows, investigationRows] = await Promise.all([
          readResponse<Report[]>(reportResponse, "Could not load reports"),
          readResponse<Investigation[]>(investigationResponse, "Could not load investigations"),
        ]);

        if (!cancelled) {
          setRows(reportRows);
          setInvestigations(investigationRows);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load reports");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router, searchTerm, refreshVersion]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investigation_id: Number(investigationId),
          report_title: title,
          report_content: content,
        }),
      });
      const data = await readResponse<{ report_id: number }>(response, "Could not create report");
      setRefreshVersion((version) => version + 1);
      setMessage(`Created report #${data.report_id}`);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Could not create report");
    }
  }

  async function update(id: number, body: object) {
    try {
      const response = await fetch(`/api/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await readResponse<Report>(response, "Could not update report");
      setRefreshVersion((version) => version + 1);
      setMessage(`Report #${id} updated`);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Could not update report");
    }
  }

  async function edit(id: number, oldTitle: string) {
    const nextTitle = window.prompt("Report title", oldTitle);
    if (nextTitle === null) return;

    const nextContent = window.prompt(
      "Report content",
      "Update the forensic analysis findings."
    );
    if (nextContent === null) return;

    await update(id, { report_title: nextTitle, report_content: nextContent });
  }

  async function remove(id: number) {
    if (!window.confirm(`Delete draft report #${id}?`)) return;

    try {
      const response = await fetch(`/api/reports/${id}`, { method: "DELETE" });
      await readResponse<{ ok: boolean }>(response, "Could not delete report");
      setRefreshVersion((version) => version + 1);
      setMessage(`Deleted draft report #${id}`);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Could not delete report");
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-bold">Forensic reports</h1>
        <nav className="flex gap-4 text-sm underline">
          <a href="/cases">Cases</a>
          <a href="/investigations">Investigations</a>
          <a href="/dashboard">Dashboard</a>
          <a href="/audit">Audit</a>
        </nav>
      </header>

      {message && <p className="border p-2 text-sm">{message}</p>}

      <form onSubmit={create} className="grid gap-2 rounded border p-4">
        <h2 className="font-semibold">Create report (INSERT)</h2>
        <select
          className="border p-2"
          value={investigationId}
          onChange={(event) => setInvestigationId(event.target.value)}
          required
        >
          <option value="">Select investigation</option>
          {investigations.map((investigation) => (
            <option
              key={investigation.investigation_id}
              value={investigation.investigation_id}
            >
              #{investigation.investigation_id} — {investigation.case_no} — {investigation.case_title}
            </option>
          ))}
        </select>
        <input
          className="border p-2"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          minLength={3}
          maxLength={200}
          aria-label="Report title"
        />
        <textarea
          className="min-h-24 border p-2"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={100000}
          aria-label="Report content"
        />
        <button type="submit" className="w-fit rounded bg-slate-800 px-4 py-2 text-white">
          Create draft
        </button>
      </form>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSearchTerm(searchText.trim());
        }}
        className="flex gap-2"
      >
        <input
          className="flex-1 border p-2"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Full-text search report title/content (e.g. ransomware)"
          aria-label="Search reports"
        />
        <button type="submit" className="rounded border px-4">
          Search
        </button>
      </form>

      <div className="space-y-3">
        {rows.map((report) => (
          <article key={report.report_id} className="space-y-2 rounded border p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <h3 className="font-semibold">
                  #{report.report_id} — {report.report_title}
                </h3>
                <p className="text-xs text-slate-600">
                  {report.case_no} · {report.investigator_name} · {report.report_status}
                </p>
                {report.snippet && (
                  <p className="mt-1 text-sm">
                    {report.snippet.replace(/<[^>]*>/g, "")}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {(report.report_status === "DRAFT" || report.report_status === "REJECTED") && (
                  <button
                    type="button"
                    onClick={() => void edit(report.report_id, report.report_title)}
                    className="rounded border px-3 py-1"
                  >
                    Edit
                  </button>
                )}
                {(report.report_status === "DRAFT" || report.report_status === "REJECTED") && (
                  <button
                    type="button"
                    onClick={() => void update(report.report_id, { report_status: "SUBMITTED" })}
                    className="rounded bg-blue-700 px-3 py-1 text-white"
                  >
                    Submit
                  </button>
                )}
                {report.report_status === "SUBMITTED" && (
                  <>
                    <button
                      type="button"
                      onClick={() => void update(report.report_id, { report_status: "APPROVED" })}
                      className="rounded bg-green-700 px-3 py-1 text-white"
                    >
                      Approve (Admin)
                    </button>
                    <button
                      type="button"
                      onClick={() => void update(report.report_id, { report_status: "REJECTED" })}
                      className="rounded border px-3 py-1"
                    >
                      Reject (Admin)
                    </button>
                  </>
                )}
                {report.report_status === "DRAFT" && (
                  <button
                    type="button"
                    onClick={() => void remove(report.report_id)}
                    className="rounded border border-red-500 px-3 py-1 text-red-700"
                  >
                    Delete draft
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Content can be edited through PATCH while DRAFT/REJECTED; submitted reports are locked for content changes.
            </p>
          </article>
        ))}
        {!rows.length && (
          <p className="p-4 text-center text-slate-500">No reports match this search.</p>
        )}
      </div>
    </main>
  );
}
