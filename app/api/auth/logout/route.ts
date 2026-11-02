
import {
  clearSessionCookie,
  getSessionFromRequest,
} from "@/lib/auth";
import { withTx } from "@/lib/db";
import { dbError, json } from "@/lib/http";

export async function POST(req: Request) {
  const session = getSessionFromRequest(req);

  try {
    // Record logout only when the incoming session is valid.
    if (session) {
      await withTx(session.userId, async (client) => {
        await client.query(
          `INSERT INTO audit_logs
            (user_id, action, entity_type, entity_id)
           VALUES ($1, 'LOGOUT', 'users', $1)`,
          [session.userId]
        );
      });
    }
  } catch (error) {
    // Clear the browser session even if audit logging fails.
    await clearSessionCookie();
    return dbError(error);
  }

  await clearSessionCookie();

  return json({
    message: "Logged out successfully",
  });
}
