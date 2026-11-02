
import bcrypt from "bcrypt";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { withTx } from "@/lib/db";
import { dbError, json, parse } from "@/lib/http";

const RegisterBody = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(150)
    .transform((email) => email.toLowerCase()),
  password: z.string().min(8).refine(
    (password) => Buffer.byteLength(password, "utf8") <= 72,
    "Password must not exceed 72 UTF-8 bytes"
  ),
  role: z.enum(["ADMIN", "INVESTIGATOR", "CUSTODIAN"]),
  phone: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().trim().regex(/^[0-9+() -]{7,20}$/).optional()
  ),
}).strict();

export async function POST(req: Request) {
  const auth = requireRole(req, ["ADMIN"]);

  if (!auth.ok) return auth.res;

  const parsed = await parse(req, RegisterBody);

  if (!parsed.ok) return parsed.res;

  try {
    const { name, email, password, role, phone } = parsed.data;

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await withTx(auth.s.userId, async (client) => {
      const result = await client.query(
        `INSERT INTO users
          (name, email, password_hash, role, phone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING user_id, name, email, role, phone, created_at`,
        [name, email, passwordHash, role, phone ?? null]
      );

      const created = result.rows[0];

      // INSERT is an allowed action in the current audit_logs constraint.
      await client.query(
        `INSERT INTO audit_logs
          (user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'INSERT', 'users', $2, $3::jsonb)`,
        [
          auth.s.userId,
          created.user_id,
          JSON.stringify({ email, role }),
        ]
      );

      return created;
    });

    return json({ user }, 201);
  } catch (error) {
    return dbError(error);
  }
}
