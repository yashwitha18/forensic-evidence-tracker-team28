import { requireRole } from "@/lib/auth";
import { withTx } from "@/lib/db";
import { dbError, json, parseId } from "@/lib/http";

// Calls the stored function close_case(): locks the case row, verifies every investigation is COMPLETED
// and has an APPROVED report, then closes it - all in one transaction.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = requireRole(req, ["ADMIN", "INVESTIGATOR"]); if (!g.ok) return g.res;
  const id = parseId((await params).id); if (!id) return json({ error: "Bad id" }, 400);
  try {
    await withTx(g.s.userId, c => c.query("SELECT close_case($1)", [id]));
    return json({ ok: true });
  } catch (e) { return dbError(e); }
}
