# Data dictionary: evidence tables

Owner: Ch Yashwitha. Tables defined in `db/02_evidence.sql`.

## evidence_type

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| evidence_type_id | SERIAL | PRIMARY KEY | Unique identifier |
| type_name | VARCHAR(60) | NOT NULL, UNIQUE | Category, such as Disk image |
| description | TEXT | | Optional explanation |

## evidence

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| evidence_id | SERIAL | PRIMARY KEY | Unique identifier |
| case_id | INTEGER | NOT NULL, FK to cases | Case the item belongs to |
| evidence_type_id | INTEGER | NOT NULL, FK to evidence_type | Classification |
| evidence_name | VARCHAR(150) | NOT NULL | Short label |
| description | TEXT | | Optional detail |
| source | VARCHAR(150) | | Where it was obtained |
| collection_date | TIMESTAMP | NOT NULL, default now | When it was collected |
| file_hash | CHAR(64) | NOT NULL, UNIQUE | SHA-256 of the stored file |
| storage_location | VARCHAR(255) | NOT NULL | Path of the stored file |
| status | VARCHAR(20) | NOT NULL, default COLLECTED, CHECK | COLLECTED, IN_CUSTODY, ANALYZED, or RELEASED |
| collected_by | INTEGER | NOT NULL, FK to users | Who collected it |
| current_holder_id | INTEGER | NOT NULL, FK to users | Who holds it now (kept in sync by transfer_evidence) |

## chain_of_custody (append-only)

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| custody_id | SERIAL | PRIMARY KEY | Unique identifier |
| evidence_id | INTEGER | NOT NULL, FK to evidence | Item being tracked |
| from_user_id | INTEGER | FK to users, nullable | Previous holder; NULL only for INTAKE |
| to_user_id | INTEGER | NOT NULL, FK to users | New holder |
| action | VARCHAR(20) | NOT NULL, CHECK | INTAKE or TRANSFER |
| transfer_time | TIMESTAMP | NOT NULL, default now | When the event happened |
| location | VARCHAR(150) | | Where the item was handed over |
| remarks | TEXT | | Free-text note |

Constraints on this table: `from_user_id <> to_user_id`, and UPDATE and DELETE are blocked by a trigger. An index on (evidence_id, transfer_time) supports the custody timeline.

## Design notes

- `current_holder_id` is a deliberate denormalisation. The holder can be derived from the latest custody row, but storing it lets the transfer lock one row with `SELECT ... FOR UPDATE`. Query Q7 in `db/queries_evidence.sql` checks that the two always agree.
- `file_hash` is unique, so the same content cannot be registered twice as separate evidence.