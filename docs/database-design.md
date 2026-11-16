# Database design

Owner: Ch Yashwitha. Covers the database choice, ER and relational schema, and the custody and transfer design. Schema source: `db/01_core.sql`, `db/02_evidence.sql`, `db/02b_transfer.sql`, `db/03_investigation.sql`.

## 1. Database choice and justification

The system uses two databases, each chosen for the kind of data it holds.

**PostgreSQL (SQL, mandatory).** Used for data that must follow strict rules:
- Evidence records and custody history must be consistent. Foreign keys stop a custody row pointing at a missing evidence item or user.
- Custody transfers must be atomic. A transfer inserts a custody row and updates the holder in one transaction, so the record can't show half a change.
- Integrity rules belong in the database. CHECK constraints reject a self-transfer, an INTAKE with a sender, and a TRANSFER without one. UNIQUE stops the same file being registered twice.
- The custody trail must be append-only. A trigger blocks UPDATE and DELETE on `chain_of_custody`.

**MongoDB (NoSQL).** Used for `evidence_metadata`, which holds descriptive data that varies by evidence type. A disk image has a sector size and imaging tool, a phone has an IMEI and OS version, and a network capture has a packet count. A fixed SQL table would need many nullable columns. Documents fit this data, and the collection is read as a whole. Custody and status stay in PostgreSQL, so MongoDB is not used for anything that needs integrity rules.

The split is deliberate: the data decided the choice, not the technology list. Evidence rows and their metadata share the same `evidence_id`. MongoDB has no foreign key, so the intake route writes the SQL row first, then the metadata. If the metadata write fails, the evidence still exists and the metadata can be retried. This is the main trade-off between the two stores.

## 2. ER model

Entities: USERS, CASES, EVIDENCE_TYPE, EVIDENCE, CHAIN_OF_CUSTODY, INVESTIGATIONS, INVESTIGATION_EVIDENCE, FORENSIC_REPORTS, AUDIT_LOGS.

Relationships (cardinality as drawn in the printed ER diagram):
- Creates: USERS 1 to n CASES (total on CASES, via `created_by`).
- Collects: USERS 1 to n EVIDENCE (via `collected_by`).
- Currently Holds: USERS 1 to n EVIDENCE (via `current_holder_id`).
- Contains: CASES 1 to n EVIDENCE (via `case_id`).
- Classifies: EVIDENCE_TYPE 1 to n EVIDENCE (via `evidence_type_id`).
- Records: EVIDENCE 1 to n CHAIN_OF_CUSTODY.
- Transferred From / Transferred To: USERS 1 to n CHAIN_OF_CUSTODY (via `from_user_id`, `to_user_id`).
- Opens: CASES 1 to n INVESTIGATIONS.
- Conducts: USERS 1 to n INVESTIGATIONS (via `investigator_id`).
- Examines: INVESTIGATIONS m to n EVIDENCE, implemented by the junction table INVESTIGATION_EVIDENCE.
- Produces: INVESTIGATIONS 1 to n FORENSIC_REPORTS.
- Generates: USERS 1 to n AUDIT_LOGS (via `user_id`, nullable, so system actions are logged).

Total participation (double lines) is drawn where a NOT NULL foreign key requires it. Transferred From is partial, because the INTAKE record has no sender.

## 3. Relational schema

Primary keys are underlined; foreign keys are noted.

- **USERS** (user_id PK, name, email UNIQUE, password_hash, role CHECK in ADMIN/INVESTIGATOR/CUSTODIAN, phone, created_at)
- **CASES** (case_id PK, case_no UNIQUE, title, description, case_type, status, priority, opened_date, closed_date CHECK closed_date >= opened_date, created_by FK to USERS NOT NULL)
- **EVIDENCE_TYPE** (evidence_type_id PK, type_name UNIQUE, description)
- **EVIDENCE** (evidence_id PK, case_id FK NOT NULL, evidence_type_id FK NOT NULL, evidence_name, description, source, collection_date, file_hash CHAR(64) UNIQUE, storage_location, status CHECK in COLLECTED/IN_CUSTODY/ANALYZED/RELEASED, collected_by FK NOT NULL, current_holder_id FK NOT NULL)
- **CHAIN_OF_CUSTODY** (custody_id PK, evidence_id FK NOT NULL, from_user_id FK nullable, to_user_id FK NOT NULL, action CHECK in INTAKE/TRANSFER, transfer_time, location, remarks; CHECKs: no self-transfer, and sender NULL exactly for INTAKE)
- **INVESTIGATIONS** (investigation_id PK, case_id FK, investigator_id FK, methodology, findings, start_time, end_time, status)
- **INVESTIGATION_EVIDENCE** (investigation_id FK, evidence_id FK; composite PK)
- **FORENSIC_REPORTS** (report_id PK, investigation_id FK, report_title, report_file, report_content, report_status, created_at, updated_at)
- **AUDIT_LOGS** (audit_id PK, user_id FK nullable, action, entity_type, entity_id, details, timestamp)

Every foreign key uses ON DELETE RESTRICT and the default ON UPDATE NO ACTION. The schema is in 3NF except for one deliberate denormalisation: `evidence.current_holder_id` can be derived from the latest custody row. It is kept so that a transfer can lock one row with `SELECT ... FOR UPDATE`, and query Q7 checks that the two always agree.

## 4. Custody and transfer design

**Intake.** The uploaded file is hashed on the server with SHA-256 and stored in the vault under its hash. In one transaction, the route inserts the evidence row with the collector as holder, and an INTAKE custody row with a NULL sender. The actor is taken from the verified session, not from the request.

**Transfer.** `transfer_evidence(evidence, to_user, location, remarks, actor)` runs as one transaction:
1. Lock the evidence row with `SELECT ... FOR UPDATE`. A second transfer of the same item waits here until the first commits.
2. Check the evidence exists (error otherwise).
3. Check the actor is the current holder (error otherwise, mapped to HTTP 403).
4. Insert a TRANSFER custody row, with `from_user_id` set to the current holder. This keeps the chain continuous.
5. Update `current_holder_id` and set status to IN_CUSTODY.

The CHECK constraints reject a self-transfer, even if the other checks pass.

**Protection of the trail.**
- The trigger `block_custody_change` blocks UPDATE and DELETE on `chain_of_custody`.
- Role privileges block UPDATE and DELETE for the application role, before the trigger runs.
- `custody_chain_intact(evidence_id)` checks that each TRANSFER starts from the previous recipient. It returns true for valid data and false after an invalid row is inserted.

**Who did it.** The app writes through `withTx`, which sets `app.user_id` for the transaction. The audit trigger reads it, so each change records the real user. Changes made directly in psql record no user, which the demo notes explain.

**Editing.** The description and source of evidence can be changed through PATCH, by the current holder only. Holder, status, hash, and custody fields cannot be changed through this route, and unknown fields are rejected.