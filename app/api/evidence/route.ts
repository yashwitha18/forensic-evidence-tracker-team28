// app/api/evidence/route.ts
// Owner: Yashwitha
// GET: list evidence for the intake page.
// POST: hash the uploaded file, store it in the vault, then insert the
// evidence row and its INTAKE custody row in one transaction. The metadata
// document goes to MongoDB with the same evidence_id.

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { z } from "zod";
import { pool, withTx } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { json, dbError } from "@/lib/http";
import { sha256Hex } from "@/lib/hash";
import { getMongoDb, EVIDENCE_METADATA } from "@/lib/mongo";

const VAULT_DIR = path.join(process.cwd(), "vault");

const intakeSchema = z.object({
  caseId: z.number().int().positive(),
  evidenceTypeId: z.number().int().positive(),
  evidenceName: z.string().min(1).max(150),
  description: z.string().max(1000).optional(),
  source: z.string().max(150).optional(),
});

// Lists evidence with case, type and current holder, plus the dropdown
// options the intake form needs. Readable by any logged-in role.
export async function GET(request: Request) {
  const auth = requireRole(request, ["ADMIN", "INVESTIGATOR", "CUSTODIAN"]);
  if (!auth.ok) return auth.res;

  try {
    const [evidence, cases, types] = await Promise.all([
      pool.query(
        `SELECT e.evidence_id, e.evidence_name, e.status, e.file_hash,
                e.collection_date, c.case_no, t.type_name,
                h.name AS holder_name
           FROM evidence e
           JOIN cases c         ON c.case_id = e.case_id
           JOIN evidence_type t ON t.evidence_type_id = e.evidence_type_id
           JOIN users h         ON h.user_id = e.current_holder_id
          ORDER BY e.evidence_id DESC`
      ),
      pool.query(`SELECT case_id, case_no FROM cases ORDER BY case_no`),
      pool.query(
        `SELECT evidence_type_id, type_name FROM evidence_type ORDER BY type_name`
      ),
    ]);

    return json({
      evidence: evidence.rows,
      cases: cases.rows,
      types: types.rows,
    });
  } catch (error) {
    return dbError(error);
  }
}

export async function POST(request: Request) {
  const auth = requireRole(request, ["CUSTODIAN"]);
  if (!auth.ok) return auth.res;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart form data" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return json({ error: "A non-empty file is required" }, 400);
  }

  const parsed = intakeSchema.safeParse({
    caseId: Number(form.get("caseId")),
    evidenceTypeId: Number(form.get("evidenceTypeId")),
    evidenceName: form.get("evidenceName") ?? "",
    description: form.get("description") ?? undefined,
    source: form.get("source") ?? undefined,
  });
  if (!parsed.success) {
    return json(
      { error: "Validation failed", details: parsed.error.issues.map((i) => i.message) },
      400
    );
  }

  // Metadata is optional free-form JSON that varies by evidence type.
  let metadata: Record<string, unknown> = {};
  const rawMetadata = form.get("metadata");
  if (typeof rawMetadata === "string" && rawMetadata.trim() !== "") {
    try {
      metadata = JSON.parse(rawMetadata);
    } catch {
      return json({ error: "metadata must be valid JSON" }, 400);
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const fileHash = sha256Hex(bytes);

  // Name the stored file by its hash, so the path is unique per content.
  await mkdir(VAULT_DIR, { recursive: true });
  const storagePath = path.join(VAULT_DIR, `${fileHash}.bin`);
  await writeFile(storagePath, bytes);

  const actorId = auth.s.userId;
  const d = parsed.data;

  try {
    const evidenceId = await withTx(actorId, async (client) => {
      const { rows } = await client.query<{ evidence_id: number }>(
        `INSERT INTO evidence
           (case_id, evidence_type_id, evidence_name, description, source,
            file_hash, storage_location, status, collected_by, current_holder_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'COLLECTED', $8, $8)
         RETURNING evidence_id`,
        [
          d.caseId,
          d.evidenceTypeId,
          d.evidenceName,
          d.description ?? null,
          d.source ?? null,
          fileHash,
          storagePath,
          actorId,
        ]
      );
      const id = rows[0].evidence_id;

      await client.query(
        `INSERT INTO chain_of_custody
           (evidence_id, from_user_id, to_user_id, action, location, remarks)
         VALUES ($1, NULL, $2, 'INTAKE', $3, 'Intake')`,
        [id, actorId, storagePath]
      );

      return id;
    });

    // Written after the SQL commit. If this fails, the evidence exists without
    // metadata, and the upsert below can be retried.
    const db = await getMongoDb();
    await db.collection(EVIDENCE_METADATA).updateOne(
      { evidence_id: evidenceId },
      {
        $set: {
          ...metadata,
          evidence_id: evidenceId,
          file_type: typeof metadata.file_type === "string" ? metadata.file_type : "unknown",
        },
      },
      { upsert: true }
    );

    return json({ evidenceId, fileHash }, 201);
  } catch (error) {
    return dbError(error);
  }
}