
import bcrypt from "bcrypt";
import { z } from "zod";

import { pool, withTx } from "@/lib/db";
import { setSessionCookie, type Role } from "@/lib/auth";
import { dbError, json, parse } from "@/lib/http";


// Used for unknown accounts to reduce email-enumeration timing differences.
const DUMMY_HASH_PROMISE = bcrypt.hash(
  "dummy-password-that-is-never-valid",
  10
);

const LoginBody = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(150)
    .transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(200),
}).strict();

type UserRow = {
  user_id: number;
  name: string;
  role: Role;
  password_hash: string;
};

export async function POST(req: Request) {
  const parsed = await parse(req, LoginBody);

  if (!parsed.ok) {
    return parsed.res;
  }

  try {
    const { email, password } = parsed.data;

    const result = await pool.query<UserRow>(
      `SELECT user_id, name, role, password_hash
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    const user = result.rows[0];

    // Compare even when the email does not exist.
    const hash = user
      ? user.password_hash
      : await DUMMY_HASH_PROMISE;

    const passwordMatches = await bcrypt.compare(password, hash);

    if (!user || !passwordMatches) {
      return json(
        { error: "Invalid email or password" },
        401
      );
    }

    // Record successful authentication before issuing the session.
    await withTx(user.user_id, async (client) => {
      await client.query(
        `INSERT INTO audit_logs
          (user_id, action, entity_type, entity_id)
         VALUES ($1, 'LOGIN', 'users', $1)`,
        [user.user_id]
      );
    });

    await setSessionCookie({
      userId: user.user_id,
      name: user.name,
      role: user.role,
    });

    return json({
      userId: user.user_id,
      name: user.name,
      role: user.role,
    });
  } catch (error) {
    return dbError(error);
  }
}
