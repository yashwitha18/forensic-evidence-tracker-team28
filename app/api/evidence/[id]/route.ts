// app/api/evidence/[id]/route.ts
// Owner: Yashwitha
// PATCH: update description and source only. Holder, status, hash and custody
// fields are never editable here. They change only through transfer_evidence()
// and the custody trail. Only the current holder may edit.

import { z } from "zod";
import { withTx } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { json, parse, parseId, dbError } from "@/lib/http";

const patchSchema = z
  .object({
    description: z.string().max(1000).nullable().optional(),
    source: z.string().max(150).nullable().optional(),
  })
  .strict();

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = requireRole(request, ["CUSTODIAN"]);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const evidenceId = parseId(id);
  if (evidenceId === null) {
    return json({ error: "Invalid evidence id" }, 400);
  }

  const body = await parse(request, patchSchema);
  if (!body.ok) return body.res;

  const { description, source } = body.data;
  if (description === undefined && source === undefined) {
    return json({ error: "Nothing to update" }, 400);
  }

  try {
    const result = await withTx(auth.s.userId, async (client) => {
      // Lock the row so the holder check and the update see the same state.
      const current = await client.query<{ current_holder_id: number }>(
        `SELECT current_holder_id FROM evidence
          WHERE evidence_id = $1 FOR UPDATE`,
        [evidenceId]
      );

      if (current.rowCount === 0) return { status: 404 as const };
      if (current.rows[0].current_holder_id !== auth.s.userId) {
        return { status: 403 as const };
      }

      const { rows } = await client.query(
        `UPDATE evidence
            SET description = CASE WHEN $2::boolean THEN $3 ELSE description END,
                source      = CASE WHEN $4::boolean THEN $5 ELSE source END
          WHERE evidence_id = $1
          RETURNING evidence_id, evidence_name, description, source`,
        [
          evidenceId,
          description !== undefined,
          description ?? null,
          source !== undefined,
          source ?? null,
        ]
      );

      return { status: 200 as const, row: rows[0] };
    });

    if (result.status === 404) {
      return json({ error: "Evidence not found" }, 404);
    }
    if (result.status === 403) {
      return json({ error: "Only the current holder can edit this evidence" }, 403);
    }
    return json(result.row, 200);
  } catch (error) {
    return dbError(error);
  }
}