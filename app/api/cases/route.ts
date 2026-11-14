import { requireRole } from "@/lib/auth";
import { z } from "zod";
import { pool, withTx } from "@/lib/db";
import { dbError, json, parse } from "@/lib/http";

// GET /api/cases?status=&priority=&q=&page=   (reads the case_summary VIEW)
export async function GET(req: Request) {
  const g = requireRole(req, []); if (!g.ok) return g.res;
  const sp = new URL(req.url).searchParams;
  const where: string[] = []; const args: unknown[] = [];
  const status = sp.get("status"), priority = sp.get("priority"), q = sp.get("q");
  if (status)   { args.push(status);   where.push(`status = $${args.length}`); }
  if (priority) { args.push(priority); where.push(`priority = $${args.length}`); }
  if (q)        { args.push(`%${q}%`); where.push(`(title ILIKE $${args.length} OR case_no ILIKE $${args.length})`); }
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1), size = 20;
  args.push(size, (page - 1) * size);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM case_summary ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END, opened_date DESC
       LIMIT $${args.length - 1} OFFSET $${args.length}`, args);
    return json(rows);
  } catch (e) { return dbError(e); }
}

const Body = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(5000).optional(),
  case_type: z.enum(["MALWARE", "FRAUD", "DATA_BREACH", "HARASSMENT", "INTELLECTUAL_PROPERTY", "OTHER"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
});

export async function POST(req: Request) {
  const g = requireRole(req, ["ADMIN", "INVESTIGATOR"]); if (!g.ok) return g.res;
  const p = await parse(req, Body); if (!p.ok) return p.res;
  try {
    const row = await withTx(g.s.userId, async c => (await c.query(
      `INSERT INTO cases(title, description, case_type, priority, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [p.data.title, p.data.description ?? null, p.data.case_type, p.data.priority, g.s.userId])).rows[0]);
    return json(row, 201);
  } catch (e) { return dbError(e); }
}
