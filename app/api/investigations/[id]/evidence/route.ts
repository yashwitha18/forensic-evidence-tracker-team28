import { requireRole } from "@/lib/auth";
import { z } from "zod";
import { pool, withTx } from "@/lib/db";
import { dbError, json, parse, parseId } from "@/lib/http";
import { Session } from "@/lib/auth";
import { PoolClient } from "pg";

type Ctx = { params: Promise<{ id: string }> };

/** Only the owning investigator (or ADMIN) may modify an IN_PROGRESS investigation. Locks the row. */
async function assertOwner(c: PoolClient, invId: number, s: Session) {
  const r = await c.query("SELECT investigator_id, status FROM investigations WHERE investigation_id = $1 FOR UPDATE", [invId]);
  const row = r.rows[0];
  if (!row) throw Object.assign(new Error("Investigation not found"), { code: "P0001" });
  if (s.role !== "ADMIN" && row.investigator_id !== s.userId) throw Object.assign(new Error("Not your investigation"), { code: "P0001" });
  if (row.status !== "IN_PROGRESS") throw Object.assign(new Error("Investigation is " + row.status), { code: "P0001" });
}

export async function GET(req: Request, { params }: Ctx) {
  const g = requireRole(req, []); if (!g.ok) return g.res;
  const id = parseId((await params).id); if (!id) return json({ error: "Bad id" }, 400);
  const { rows } = await pool.query(
    `SELECT e.evidence_id, e.evidence_name, e.status, t.type_name
       FROM investigation_evidence ie JOIN evidence e ON e.evidence_id = ie.evidence_id
       JOIN evidence_type t ON t.evidence_type_id = e.evidence_type_id
      WHERE ie.investigation_id = $1 ORDER BY e.evidence_id`, [id]);
  return json(rows);
}

const Body = z.object({ evidence_id: z.number().int().positive() });

// trigger trg_inv_evidence_same_case rejects evidence from another case
export async function POST(req: Request, { params }: Ctx) {
  const g = requireRole(req, ["ADMIN", "INVESTIGATOR"]); if (!g.ok) return g.res;
  const id = parseId((await params).id); if (!id) return json({ error: "Bad id" }, 400);
  const p = await parse(req, Body); if (!p.ok) return p.res;
  try {
    await withTx(g.s.userId, async c => {
      await assertOwner(c, id, g.s);
      await c.query("INSERT INTO investigation_evidence(investigation_id, evidence_id) VALUES ($1,$2)", [id, p.data.evidence_id]);
    });
    return json({ ok: true }, 201);
  } catch (e) { return dbError(e); }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const g = requireRole(req, ["ADMIN", "INVESTIGATOR"]); if (!g.ok) return g.res;
  const id = parseId((await params).id); if (!id) return json({ error: "Bad id" }, 400);
  const p = await parse(req, Body); if (!p.ok) return p.res;
  try {
    const n = await withTx(g.s.userId, async c => {
      await assertOwner(c, id, g.s);
      return (await c.query("DELETE FROM investigation_evidence WHERE investigation_id=$1 AND evidence_id=$2", [id, p.data.evidence_id])).rowCount;
    });
    return n ? json({ ok: true }) : json({ error: "Not attached" }, 404);
  } catch (e) { return dbError(e); }
}
