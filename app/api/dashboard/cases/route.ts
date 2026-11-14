import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";
import { dbError, json } from "@/lib/http";

export async function GET(req: Request) {
  const g = requireRole(req, []); if (!g.ok) return g.res;
  try {
    const [totals, priorities, recent] = await Promise.all([
      pool.query(`SELECT status, count(*)::int AS count FROM cases GROUP BY status ORDER BY status`),
      pool.query(`SELECT priority, count(*)::int AS count FROM cases GROUP BY priority ORDER BY
        CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END`),
      pool.query(`SELECT case_id, case_no, title, status, priority, evidence_count, investigation_count
                  FROM case_summary ORDER BY opened_date DESC, case_id DESC LIMIT 8`),
    ]);
    return json({ byStatus: totals.rows, byPriority: priorities.rows, recent: recent.rows });
  } catch (e) { return dbError(e); }
}
