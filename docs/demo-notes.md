# Demo notes

## Analysis: full table scan vs index

Test table: 200,000 rows in a scratch copy of chain_of_custody.

| Query | Plan | Rows read | Execution time |
|---|---|---|---|
| remarks = 'needle', no index | Seq Scan | 200,000 | 27.9 ms |
| remarks = 'needle', with index | Index Scan on idx_scan_remarks | 1 | 0.06 ms |

A sequential scan reads every row, so its cost grows with table size. Adding a B-tree index let PostgreSQL go straight to the matching row. Indexes are not free: each insert, update, and delete must also maintain the index, and the index uses disk space. The custody timeline query (evidence_id, transfer_time) is read on every case review while writes are infrequent, so that index is worth its cost.

Note: a low-selectivity filter such as evidence_id = 1 (one third of rows) may not benefit from an index, because the planner correctly chooses a bitmap or sequential scan.

## Demo: transactions, isolation, and locking

Setup: Window 1 is the admin session (postgres), Window 2 is a second session.

**Atomicity and isolation.** Window 1 opened a transaction and transferred evidence 4 from user 5 to user 3 without committing. Window 2 read the same row and saw the committed holder, 5. After Window 1 committed, Window 2 saw holder 3. The uncommitted change was invisible to the other session until commit.

**Locking.** Window 1 transferred evidence 4 inside an open transaction, which takes a row lock through `SELECT ... FOR UPDATE` in `transfer_evidence`. Window 2 ran a second transfer of the same item and was held back until Window 1 committed. After the commit, Window 2 read the new holder (3) and completed its transfer, returning custody ID 400025. Without the lock, the second transfer could have read the stale holder and created an invalid custody chain.

Final state: evidence 4 is held by user 5.

## Demo: role-based privileges

Two sessions: Window 1 as the admin (postgres), Window 2 as the restricted role `custodian_app`.

**Privileges (Window 1, `\dp`):**
- `evidence`: `custodian_app=rw` (SELECT and UPDATE)
- `chain_of_custody`: `custodian_app=ar` (SELECT and INSERT only, no UPDATE or DELETE)

**Blocked action (Window 2):**

```sql
UPDATE chain_of_custody SET remarks = 'x' WHERE custody_id = 1;
```

Result: `ERROR: permission denied for table chain_of_custody`.

The privilege check runs before any row is touched, so the append-only trigger never fires. Privileges are the first layer of protection, and the trigger is the second.

Note: the application connects as `postgres` in development, which bypasses these grants. In production, the app should connect with the restricted role.

## DDL: constraints and referential actions

Primary and foreign keys:
- Every table has a SERIAL primary key.
- `evidence.case_id`, `evidence.evidence_type_id`, `evidence.collected_by`, and `evidence.current_holder_id` are NOT NULL foreign keys.
- `chain_of_custody.from_user_id` is nullable, because the INTAKE record has no sender.

Referential actions:
- All foreign keys use `ON DELETE RESTRICT`. Evidence and custody records must never disappear because a case or user was removed. `CASCADE` would silently destroy custody history.
- `ON UPDATE` uses the default `NO ACTION`. Updating a referenced user ID is rejected, which protects the custody trail.

CHECK constraints:
- `chain_of_custody`: `from_user_id IS NULL OR from_user_id <> to_user_id` (no self-transfer).
- `chain_of_custody`: INTAKE must have a NULL sender, and TRANSFER must have a non-NULL sender.
- `evidence.status` is limited to COLLECTED, IN_CUSTODY, ANALYZED, RELEASED.

UNIQUE constraints:
- `evidence.file_hash` (the same content cannot be registered twice).

Demonstrations: the custody-sender CHECK rejected an INTAKE with a sender, and a TRANSFER with no sender. Both errors were recorded in testing.