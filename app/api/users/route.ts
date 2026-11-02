
import { requireRole } from "@/lib/auth";
import { pool } from "@/lib/db";
import { dbError, json } from "@/lib/http";

export async function GET(req: Request) {
  const auth = requireRole(req, ["ADMIN"]);

  if (!auth.ok) return auth.res;

  try {
    const result = await pool.query(
      `SELECT
         user_id,
         name,
         email,
         role,
         phone,
         created_at
       FROM users
       ORDER BY user_id`
    );

    return json({
      users: result.rows,
      count: result.rowCount ?? result.rows.length,
    });
  } catch (error) {
    return dbError(error);
  }
}
