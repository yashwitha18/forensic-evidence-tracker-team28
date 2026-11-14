// app/api/custody/transfer/route.ts
// Owner: Yashwitha
// Transfers evidence through transfer_evidence(). The actor is the logged-in
// user from the verified JWT, never a value sent by the browser.

import { z } from "zod";
import { withTx } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { json, parse, dbError } from "@/lib/http";

const transferSchema = z.object({
  evidenceId: z.number().int().positive(),
  toUserId: z.number().int().positive(),
  location: z.string().max(150).optional(),
  remarks: z.string().max(1000).optional(),
});

export async function POST(request: Request) {
  // Only custodians may transfer. The database still checks that the
  // actor is the current holder.
  const auth = requireRole(request, ["CUSTODIAN"]);
  if (!auth.ok) return auth.res;

  const body = await parse(request, transferSchema);
  if (!body.ok) return body.res;

  const { evidenceId, toUserId, location, remarks } = body.data;

  try {
    const custodyId = await withTx(auth.s.userId, async (client) => {
      const { rows } = await client.query<{ custody_id: number }>(
        "SELECT transfer_evidence($1, $2, $3, $4, $5) AS custody_id",
        [evidenceId, toUserId, location ?? null, remarks ?? null, auth.s.userId]
      );
      return rows[0].custody_id;
    });

    return json({ custodyId }, 201);
  } catch (error) {
    // Our RAISE EXCEPTION messages arrive with code P0001, so map them
    // by text before falling back to the generic database mapping.
    const message = error instanceof Error ? error.message : "";

    if (message.includes("does not hold")) {
      return json({ error: message }, 403);
    }
    if (message.includes("does not exist")) {
      return json({ error: message }, 404);
    }

    return dbError(error);
  }
}