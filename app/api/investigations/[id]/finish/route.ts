import { requireRole } from "@/lib/auth";
import { z } from "zod";
import { withTx } from "@/lib/db";
import { dbError, json, parse, parseId } from "@/lib/http";

const Body = z.object({ findings: z.string().trim().min(10).max(10000) });

// Stored function finish_investigation(): needs >= 1 attached evidence and non-empty findings.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = requireRole(req, ["ADMIN", "INVESTIGATOR"]); if (!g.ok) return g.res;
  const id = parseId((await params).id); if (!id) return json({ error: "Bad id" }, 400);
  const p = await parse(req, Body); if (!p.ok) return p.res;
  try {
    await withTx(g.s.userId, async c => {
      const r = await c.query("SELECT investigator_id FROM investigations WHERE investigation_id = $1 FOR UPDATE", [id]);
      if (!r.rows[0]) throw Object.assign(new Error("Investigation not found"), { code: "P0001" });
      if (g.s.role !== "ADMIN" && r.rows[0].investigator_id !== g.s.userId)
        throw Object.assign(new Error("Not your investigation"), { code: "P0001" });
      await c.query("SELECT finish_investigation($1, $2)", [id, p.data.findings]);
    });
    return json({ ok: true });
  } catch (e) { return dbError(e); }
}
