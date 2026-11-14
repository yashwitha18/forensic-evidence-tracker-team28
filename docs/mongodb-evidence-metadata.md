# evidence_metadata: MongoDB data model

## Purpose

PostgreSQL stores evidence records that must follow strict rules: foreign keys, unique file hashes, and append-only custody. MongoDB stores the descriptive metadata for each evidence item, which varies by evidence type. A disk image has a sector size and a hashing tool. A phone has an IMEI and an OS version. A fixed SQL table would need many nullable columns, so the metadata lives in a document store.

## Collection

- **Database:** `forensic` (from `MONGODB_URI`)
- **Collection:** `evidence_metadata`
- **Key:** `evidence_id` (integer). It matches `evidence.evidence_id` in PostgreSQL. MongoDB has no foreign key, so the application keeps the two in step: the intake route inserts the PostgreSQL row first, then the metadata document with the same ID.

## Document example

```json
{
  "evidence_id": 1,
  "file_type": "disk_image",
  "device_info": { "make": "Dell", "model": "Latitude 5420", "serial": "SAMPLE-0001" },
  "tool_output": { "tool": "FTK Imager", "version": "4.7", "sector_size": 512 },
  "tags": ["malware", "finance"]
}
```

Fields other than `evidence_id` and `file_type` vary by evidence type. Phones carry `imei` and `os_version`. Network captures carry `capture_tool` and `packet_count`.

## Indexes

- Unique index on `evidence_id`, so each evidence item has one metadata document.
- Index on `file_type`, for the aggregation below.

## Retrieval strategy

- **Lookup by evidence:** find one document by `evidence_id`, shown on the evidence detail page next to the custody timeline.
- **Aggregation:** count evidence by `file_type` with a `$group` stage, used on the charts page.

```js
db.evidence_metadata.aggregate([
  { $group: { _id: "$file_type", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]);
```

## Why not SQL

Custody and status must be enforced, so they stay in PostgreSQL. Descriptive metadata changes shape per evidence type and is read as a whole document, so a document store fits it. Using MongoDB only for this one collection is deliberate: the data model, not the technology list, decided the choice.