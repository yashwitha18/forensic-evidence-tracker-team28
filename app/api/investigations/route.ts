import { requireRole } from "@/lib/auth";
import { z } from "zod";
import { pool, withTx } from "@/lib/db";
import { dbError, json, parse } from "@/lib/http";

// GET /api/investigations?case_id=&status=   (JOIN cases + users, evidence count via LEFT JOIN + GROUP BY)
export async function GET(req: Request) {
  const g = requireRole(req, []); if (!g.ok) return g.res;
  const sp = new URL(req.url).searchParams;
  const where: string[] = []; const args: unknown[] = [];
  if (sp.get("case_id")) { args.push(Number(sp.get("case_id"))); where.push(`i.case_id = $${args.length}`); }
  if (sp.get("status"))  { args.push(sp.get("status"));          where.push(`i.status = $${args.length}`); }
  // investigators only see their own investigations; admins see all
  if (g.s.role === "INVESTIGATOR") { args.push(g.s.userId); where.push(`i.investigator_id = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT i.investigation_id, i.case_id, c.case_no, c.title AS case_title, i.status, i.start_time, i.end_time,
              u.name AS investigator_name, COUNT(ie.evidence_id)::int AS evidence_count
         FROM investigations i
         JOIN cases c ON c.case_id = i.case_id
         JOIN users u ON u.user_id = i.investigator_id
         LEFT JOIN investigation_evidence ie ON ie.investigation_id = i.investigation_id
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        GROUP BY i.investigation_id, c.case_no, c.title, u.name
        ORDER BY i.start_time DESC`, args);
    return json(rows);
  } catch (e) { return dbError(e); }
}

const Body = z.object({
  case_id: z.number().int().positive(),
  methodology: z.string().max(5000).optional(),
  investigator_id: z.number().int().positive().optional(),   // ADMIN may assign someone else
});

export async function POST(req: Request) {
  const g = requireRole(req, ["ADMIN", "INVESTIGATOR"]); if (!g.ok) return g.res;
  const p = await parse(req, Body); if (!p.ok) return p.res;
  const investigator = g.s.role === "ADMIN" ? (p.data.investigator_id ?? g.s.userId) : g.s.userId;
  try {
    const row = await withTx(g.s.userId, async c => {
      const who = await c.query("SELECT role FROM users WHERE user_id = $1", [investigator]);
      if (!who.rows[0] || !["INVESTIGATOR", "ADMIN"].includes(who.rows[0].role))
        throw Object.assign(new Error("Assigned user is not an investigator"), { code: "P0001" });
      return (await c.query(
        `INSERT INTO investigations(case_id, investigator_id, methodology) VALUES ($1,$2,$3) RETURNING *`,
        [p.data.case_id, investigator, p.data.methodology ?? null])).rows[0];
    });
    return json(row, 201);
  } catch (e) { return dbError(e); }
}
