// lib/hash.ts
// Owner: Yashwitha
// SHA-256 of an uploaded file. Stored in evidence.file_hash (CHAR(64)).
// Pure function: no database or network access.

import { createHash } from "crypto";

export function sha256Hex(data: Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}