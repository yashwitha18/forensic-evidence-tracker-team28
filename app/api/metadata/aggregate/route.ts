// app/api/metadata/aggregate/route.ts
// Owner: Yashwitha
// Counts evidence_metadata documents by file_type using a MongoDB $group stage.
// Restricted to authenticated users, since it reveals case-level counts.

import { requireRole } from "@/lib/auth";
import { json } from "@/lib/http";
import { getMongoDb, EVIDENCE_METADATA } from "@/lib/mongo";

export async function GET(request: Request) {
  const auth = requireRole(request, ["ADMIN", "INVESTIGATOR", "CUSTODIAN"]);
  if (!auth.ok) return auth.res;

  try {
    const db = await getMongoDb();
    const rows = await db
      .collection(EVIDENCE_METADATA)
      .aggregate([
        { $group: { _id: "$file_type", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $project: { _id: 0, fileType: "$_id", count: 1 } },
      ])
      .toArray();

    return json({ byFileType: rows });
  } catch (error) {
    console.error("Metadata aggregation failed:", error);
    return json({ error: "Could not load metadata summary" }, 500);
  }
}