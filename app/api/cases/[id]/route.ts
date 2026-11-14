import { requireRole } from "@/lib/auth";
import { z } from "zod";
import { pool, withTx } from "@/lib/db";
import { dbError, json, parse, parseId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Case detail = case + its evidence + its investigations (JOINs)
export async function GET(req: Request, { params }: Ctx) {
  const g = requireRole(req, []); if (!g.ok) return g.res;
  const id = parseId((await params).id); if (!id) return json({ error: "Bad id" }, 400);
  try {
    const c = await pool.query(
      `SELECT c.*, u.name AS created_by_name FROM cases c JOIN users u ON u.user_id = c.created_by WHERE c.case_id = $1`, [id]);
    if (!c.rows[0]) return json({ error: "Case not found" }, 404);
    const ev = await pool.query(
      `SELECT e.evidence_id, e.evidence_name, e.status, t.type_name, h.name AS holder_name
         FROM evidence e JOIN evidence_type t ON t.evidence_type_id = e.evidence_type_id
         JOIN users h ON h.user_id = e.current_holder_id
        WHERE e.case_id = $1 ORDER BY e.evidence_id`, [id]);
    const inv = await pool.query(
      `SELECT i.investigation_id, i.status, i.start_time, i.end_time, u.name AS investigator_name,
              (SELECT count(*) FROM investigation_evidence ie WHERE ie.investigation_id = i.investigation_id) AS evidence_count
         FROM investigations i JOIN users u ON u.user_id = i.investigator_id
        WHERE i.case_id = $1 ORDER BY i.investigation_id`, [id]);
    return json({ ...c.rows[0], evidence: ev.rows, investigations: inv.rows });
  } catch (e) { return dbError(e); }
}

// Edit title / description / priority only. Closing goes through POST /close (stored function with checks).
const Patch = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().max(5000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
}).refine(o => Object.keys(o).length > 0, "Nothing to update");

export async function PATCH(req: Request, { params }: Ctx) {
  const g = requireRole(req, ["ADMIN", "INVESTIGATOR"]); if (!g.ok) return g.res;
  const id = parseId((await params).id); if (!id) return json({ error: "Bad id" }, 400);
  const p = await parse(req, Patch); if (!p.ok) return p.res;
  try {
    const row = await withTx(g.s.userId, async c => (await c.query(
      `UPDATE cases SET title = COALESCE($2, title), description = COALESCE($3, description), priority = COALESCE($4, priority)
        WHERE case_id = $1 AND status <> 'CLOSED' RETURNING *`,
      [id, p.data.title ?? null, p.data.description ?? null, p.data.priority ?? null])).rows[0]);
    return row ? json(row) : json({ error: "Case not found or already closed" }, 404);
  } catch (e) { return dbError(e); }
}
