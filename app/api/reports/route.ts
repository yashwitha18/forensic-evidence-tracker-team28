import { requireRole } from "@/lib/auth";
import { z } from "zod";
import { pool, withTx } from "@/lib/db";
import { dbError, json, parse } from "@/lib/http";

const bad = (message: string, httpStatus = 409) =>
  Object.assign(new Error(message), { code: "P0001", httpStatus });

// GET /api/reports?q=ransomware&status=SUBMITTED
// q uses PostgreSQL FULL-TEXT SEARCH (GIN expression index idx_reports_fts) with ranking + highlighted snippet.
export async function GET(req: Request) {
  const g = requireRole(req, []); if (!g.ok) return g.res;
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim(), status = sp.get("status");
  const args: unknown[] = []; const where: string[] = [];
  const tsv = "to_tsvector('english', coalesce(r.report_title,'') || ' ' || coalesce(r.report_content,''))";
  let rank = "0::real", snippet = "left(r.report_content, 160)";
  if (q) {
    args.push(q);
    where.push(`${tsv} @@ websearch_to_tsquery('english', $${args.length})`);
    rank = `ts_rank(${tsv}, websearch_to_tsquery('english', $${args.length}))`;
    snippet = `ts_headline('english', coalesce(r.report_content,''), websearch_to_tsquery('english', $${args.length}), 'MaxWords=25,MinWords=10')`;
  }
  if (status) { args.push(status); where.push(`r.report_status = $${args.length}`); }
  if (g.s.role === "INVESTIGATOR") { args.push(g.s.userId); where.push(`i.investigator_id = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT r.report_id, r.investigation_id, r.report_title, r.report_status, r.created_at, r.updated_at,
              c.case_no, u.name AS investigator_name, ${rank} AS rank, ${snippet} AS snippet
         FROM forensic_reports r
         JOIN investigations i ON i.investigation_id = r.investigation_id
         JOIN cases c ON c.case_id = i.case_id
         JOIN users u ON u.user_id = i.investigator_id
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY rank DESC, r.updated_at DESC LIMIT 50`, args);
    return json(rows);
  } catch (e) { return dbError(e); }
}

const Body = z.object({
  investigation_id: z.number().int().positive(),
  report_title: z.string().trim().min(3).max(200),
  report_content: z.string().max(100000).optional(),
  report_file: z.string().max(255).optional(),
});

export async function POST(req: Request) {
  const g = requireRole(req, ["ADMIN", "INVESTIGATOR"]); if (!g.ok) return g.res;
  const p = await parse(req, Body); if (!p.ok) return p.res;
  try {
    const row = await withTx(g.s.userId, async c => {
      const r = await c.query("SELECT investigator_id FROM investigations WHERE investigation_id = $1", [p.data.investigation_id]);
      if (!r.rows[0]) throw bad("Investigation not found", 404);
      if (g.s.role !== "ADMIN" && r.rows[0].investigator_id !== g.s.userId)
        throw bad("Not your investigation", 403);
      return (await c.query(
        `INSERT INTO forensic_reports(investigation_id, report_title, report_content, report_file) VALUES ($1,$2,$3,$4) RETURNING *`,
        [p.data.investigation_id, p.data.report_title, p.data.report_content ?? null, p.data.report_file ?? null])).rows[0];
    });
    return json(row, 201);
  } catch (e) { return dbError(e); }
}
