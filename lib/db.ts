
import { Pool } from "pg";
import type { PoolClient } from "pg";

// Reuse one PostgreSQL connection pool during Next.js development hot reloads.
const globalForPg = globalThis as typeof globalThis & {
  __pgPool?: Pool;
};

export const pool: Pool =
  globalForPg.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.__pgPool = pool;
}

/**
 * Executes database writes inside one transaction.
 *
 * Sets app.user_id for the duration of the transaction.
 * The audit_row_change() trigger reads this setting to
 * identify the user responsible for database changes.
 *
 * Pass null for system-level operations.
 */
export async function withTx<T>(
  userId: number | null,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    await client.query(
      "SELECT set_config('app.user_id', $1, true)",
      [userId === null ? "" : String(userId)]
    );

    const result = await fn(client);

    await client.query("COMMIT");
    transactionStarted = false;

    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original transaction error.
      }
    }

    throw error;
  } finally {
    client.release();
  }
}
