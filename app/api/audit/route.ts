import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";
import { dbError, json } from "@/lib/http";

// ADMIN only. GET /api/audit?entity_type=cases&user_id=2&page=1   (LEFT JOIN because user_id is nullable)
export async function GET(req: Request) {
  const g = requireRole(req, ["ADMIN"]); if (!g.ok) return g.res;
  const sp = new URL(req.url).searchParams;
  const where: string[] = []; const args: unknown[] = [];
  if (sp.get("entity_type")) { args.push(sp.get("entity_type")); where.push(`a.entity_type = $${args.length}`); }
  if (sp.get("user_id"))     { args.push(Number(sp.get("user_id"))); where.push(`a.user_id = $${args.length}`); }
  if (sp.get("action"))      { args.push(sp.get("action"));       where.push(`a.action = $${args.length}`); }
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1), size = 50;
  args.push(size, (page - 1) * size);
  try {
    const { rows } = await pool.query(
      `SELECT a.audit_id, a.action, a.entity_type, a.entity_id, a."timestamp", a.details,
              COALESCE(u.name, 'system') AS user_name
         FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY a."timestamp" DESC, a.audit_id DESC LIMIT $${args.length - 1} OFFSET $${args.length}`, args);
    return json(rows);
  } catch (e) { return dbError(e); }
}
