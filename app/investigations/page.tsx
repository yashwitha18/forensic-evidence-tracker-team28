"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Inv = { investigation_id:number; case_id:number; case_no:string; case_title:string; status:string; investigator_name:string; evidence_count:number; start_time:string };
type CaseRow = { case_id:number; case_no:string; title:string };
export default function InvestigationsPage() {
  const router = useRouter();
  const [rows,setRows] = useState<Inv[]>([]); const [cases,setCases] = useState<CaseRow[]>([]);
  const [caseId,setCaseId] = useState(""); const [method,setMethod] = useState("Disk and file-system forensics");
  const [selected,setSelected] = useState(""); const [evidenceId,setEvidenceId] = useState(""); const [findings,setFindings] = useState("");
  const [msg,setMsg] = useState("");
  const load = useCallback(async()=>{
    const [a,b] = await Promise.all([fetch("/api/investigations"),fetch("/api/cases")]);
    if (a.status===401 || b.status===401) { router.push("/login"); return; }
    if (a.ok) setRows(await a.json()); if (b.ok) setCases(await b.json());
  },[router]);
  // Fetch both lists on mount. State updates happen in promise callbacks,
  // not synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/investigations"), fetch("/api/cases")])
      .then(async ([invRes, caseRes]) => {
        if (invRes.status === 401 || caseRes.status === 401) {
          router.push("/login");
          return null;
        }
        if (!invRes.ok || !caseRes.ok) throw new Error("Failed to load investigations or cases");
        const [invRows, caseRows] = await Promise.all([
          invRes.json() as Promise<Inv[]>,
          caseRes.json() as Promise<CaseRow[]>,
        ]);
        return { invRows, caseRows };
      })
      .then((data) => {
        if (!cancelled && data) { setRows(data.invRows); setCases(data.caseRows); }
      })
      .catch((error: unknown) => {
        if (!cancelled) setMsg(error instanceof Error ? error.message : "Failed to load data");
      });
    return () => { cancelled = true; };
  }, [router]);
  async function create(e:React.FormEvent) { e.preventDefault(); const r=await fetch("/api/investigations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({case_id:Number(caseId),methodology:method})}); const d=await r.json(); setMsg(r.ok?`Created investigation #${d.investigation_id}`:d.error); if(r.ok) await load(); }
  async function attach(methodName:"POST"|"DELETE") { const r=await fetch(`/api/investigations/${selected}/evidence`,{method:methodName,headers:{"Content-Type":"application/json"},body:JSON.stringify({evidence_id:Number(evidenceId)})}); const d=await r.json(); setMsg(r.ok?(methodName==="POST"?"Evidence attached":"Evidence link removed"):d.error); if(r.ok) await load(); }
  async function finish(e:React.FormEvent) { e.preventDefault(); const r=await fetch(`/api/investigations/${selected}/finish`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({findings})}); const d=await r.json(); setMsg(r.ok?"Investigation completed":d.error); if(r.ok){setFindings("");await load();} }
  return <main className="mx-auto max-w-6xl space-y-6 p-6"><header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Investigations</h1><nav className="flex gap-4 text-sm underline"><a href="/cases">Cases</a><a href="/reports">Reports</a><a href="/dashboard">Dashboard</a><a href="/audit">Audit</a></nav></header>
    {msg&&<p className="rounded border p-2 text-sm">{msg}</p>}
    <form onSubmit={create} className="grid gap-2 rounded border p-4 md:grid-cols-3"><h2 className="font-semibold md:col-span-3">Open investigation</h2><select className="border p-2" value={caseId} onChange={e=>setCaseId(e.target.value)} required><option value="">Select case</option>{cases.map(c=><option key={c.case_id} value={c.case_id}>{c.case_no} — {c.title}</option>)}</select><input className="border p-2 md:col-span-1" value={method} onChange={e=>setMethod(e.target.value)} placeholder="Methodology"/><button className="rounded bg-slate-800 p-2 text-white">Create</button></form>
    <section className="overflow-x-auto"><table className="w-full border text-sm"><thead className="bg-slate-100"><tr>{["ID","Case","Investigator","Status","Evidence","Started"].map(x=><th key={x} className="p-2 text-left">{x}</th>)}</tr></thead><tbody>{rows.map(x=><tr key={x.investigation_id} className="border-t"><td className="p-2">{x.investigation_id}</td><td className="p-2">{x.case_no} — {x.case_title}</td><td className="p-2">{x.investigator_name}</td><td className="p-2">{x.status}</td><td className="p-2">{x.evidence_count}</td><td className="p-2">{new Date(x.start_time).toLocaleString()}</td></tr>)}{!rows.length&&<tr><td colSpan={6} className="p-4 text-center">No investigations yet</td></tr>}</tbody></table></section>
    <section className="grid gap-4 rounded border p-4 md:grid-cols-2"><div className="space-y-2"><h2 className="font-semibold">Attach / remove evidence</h2><select className="w-full border p-2" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select investigation</option>{rows.filter(x=>x.status==="IN_PROGRESS").map(x=><option key={x.investigation_id} value={x.investigation_id}>#{x.investigation_id} — {x.case_no}</option>)}</select><input className="w-full border p-2" type="number" min="1" value={evidenceId} onChange={e=>setEvidenceId(e.target.value)} placeholder="Evidence ID"/><div className="flex gap-2"><button type="button" disabled={!selected||!evidenceId} onClick={()=>attach("POST")} className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-40">Attach</button><button type="button" disabled={!selected||!evidenceId} onClick={()=>attach("DELETE")} className="rounded border px-3 py-2 disabled:opacity-40">Remove link</button></div><p className="text-xs text-slate-600">Removal deletes only the investigation-evidence link, not the evidence record.</p></div>
    <form onSubmit={finish} className="space-y-2"><h2 className="font-semibold">Complete investigation</h2><select className="w-full border p-2" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select investigation</option>{rows.filter(x=>x.status==="IN_PROGRESS").map(x=><option key={x.investigation_id} value={x.investigation_id}>#{x.investigation_id} — {x.case_no}</option>)}</select><textarea className="min-h-24 w-full border p-2" value={findings} onChange={e=>setFindings(e.target.value)} placeholder="Findings (minimum 10 characters)"/><button disabled={!selected||findings.trim().length<10} className="rounded bg-slate-800 px-3 py-2 text-white disabled:opacity-40">Finish</button></form></section>
  </main>;
}
