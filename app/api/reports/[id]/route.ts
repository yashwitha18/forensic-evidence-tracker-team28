import { requireRole } from "@/lib/auth";
import { z } from "zod";
import { pool, withTx } from "@/lib/db";
import { dbError, json, parse, parseId } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };
const bad = (message: string, httpStatus = 409) =>
  Object.assign(new Error(message), { code: "P0001", httpStatus });

export async function GET(req: Request, { params }: Ctx) {
  const g = requireRole(req, []); if (!g.ok) return g.res;
  const id = parseId((await params).id); if (!id) return json({ error: "Bad id" }, 400);
  try {
    const { rows } = await pool.query(
      `SELECT r.*, i.investigator_id, c.case_no
         FROM forensic_reports r JOIN investigations i ON i.investigation_id = r.investigation_id
         JOIN cases c ON c.case_id = i.case_id WHERE r.report_id = $1`, [id]);
    if (!rows[0]) return json({ error: "Report not found" }, 404);
    if (g.s.role === "INVESTIGATOR" && rows[0].investigator_id !== g.s.userId) return json({ error: "Forbidden" }, 403);
    return json(rows[0]);
  } catch (e) { return dbError(e); }
}

const Patch = z.object({
  report_title: z.string().trim().min(3).max(200).optional(),
  report_content: z.string().max(100000).optional(),
  report_file: z.string().max(255).optional(),
  report_status: z.enum(["SUBMITTED", "APPROVED", "REJECTED"]).optional(),
}).refine(v => Object.keys(v).length > 0, "Nothing to update");

export async function PATCH(req: Request, { params }: Ctx) {
  const g = requireRole(req, ["ADMIN", "INVESTIGATOR"]); if (!g.ok) return g.res;
  const id = parseId((await params).id); if (!id) return json({ error: "Bad id" }, 400);
  const p = await parse(req, Patch); if (!p.ok) return p.res;
  try {
    const row = await withTx(g.s.userId, async c => {
      const r = await c.query(
        `SELECT r.report_status, i.investigator_id FROM forensic_reports r
         JOIN investigations i ON i.investigation_id = r.investigation_id
         WHERE r.report_id = $1 FOR UPDATE OF r`, [id]);
      const cur = r.rows[0]; if (!cur) throw bad("Report not found", 404);
      const owner = cur.investigator_id === g.s.userId;
      if (g.s.role !== "ADMIN" && !owner) throw bad("Not your report", 403);
      const next = p.data.report_status;
      const hasContentEdit = p.data.report_title !== undefined || p.data.report_content !== undefined || p.data.report_file !== undefined;
      if (hasContentEdit && !["DRAFT", "REJECTED"].includes(cur.report_status)) throw bad("Only DRAFT or REJECTED reports are editable");
      if (next === "SUBMITTED" && !["DRAFT", "REJECTED"].includes(cur.report_status)) throw bad("Only DRAFT or REJECTED reports can be submitted");
      if (next === "APPROVED" || next === "REJECTED") {
        if (g.s.role !== "ADMIN") throw bad("Only ADMIN can review reports", 403);
        if (hasContentEdit) throw bad("Submit/review status changes separately from content edits");
        await c.query("CALL review_forensic_report($1, $2)", [id, next]);
      } else {
        await c.query(
          `UPDATE forensic_reports SET report_title = COALESCE($2, report_title),
             report_content = COALESCE($3, report_content), report_file = COALESCE($4, report_file),
             report_status = COALESCE($5, report_status)
           WHERE report_id = $1`,
          [id, p.data.report_title ?? null, p.data.report_content ?? null, p.data.report_file ?? null, next ?? null]);
      }
      return (await c.query("SELECT * FROM forensic_reports WHERE report_id = $1", [id])).rows[0];
    });
    return json(row);
  } catch (e) { return dbError(e); }
}

// DELETE is intentionally limited to DRAFT reports. Submitted/approved reports are retained for auditability.
export async function DELETE(req: Request, { params }: Ctx) {
  const g = requireRole(req, ["ADMIN", "INVESTIGATOR"]); if (!g.ok) return g.res;
  const id = parseId((await params).id); if (!id) return json({ error: "Bad id" }, 400);
  try {
    await withTx(g.s.userId, async c => {
      const r = await c.query(
        `SELECT r.report_status, i.investigator_id FROM forensic_reports r
         JOIN investigations i ON i.investigation_id = r.investigation_id
         WHERE r.report_id = $1 FOR UPDATE OF r`, [id]);
      const cur = r.rows[0]; if (!cur) throw bad("Report not found", 404);
      if (g.s.role !== "ADMIN" && cur.investigator_id !== g.s.userId) throw bad("Not your report", 403);
      if (cur.report_status !== "DRAFT") throw bad("Only DRAFT reports can be deleted");
      await c.query("DELETE FROM forensic_reports WHERE report_id = $1", [id]);
    });
    return json({ ok: true });
  } catch (e) { return dbError(e); }
}
