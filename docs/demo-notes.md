# Demo notes

## Analysis: full table scan vs index

Test table: 200,000 rows in a scratch copy of chain_of_custody.

| Query | Plan | Rows read | Execution time |
|---|---|---|---|
| remarks = 'needle', no index | Seq Scan | 200,000 | 27.9 ms |
| remarks = 'needle', with index | Index Scan on idx_scan_remarks | 1 | 0.06 ms |

A sequential scan reads every row, so its cost grows with table size. Adding a B-tree index let PostgreSQL go straight to the matching row. Indexes are not free: each insert, update, and delete must also maintain the index, and the index uses disk space. The custody timeline query (evidence_id, transfer_time) is read on every case review while writes are infrequent, so that index is worth its cost.

Note: a low-selectivity filter such as evidence_id = 1 (one third of rows) may not benefit from an index, because the planner correctly chooses a bitmap or sequential scan.

## Demo: DML inserts

Five evidence rows (IDs 16 to 20) were inserted through the intake route (`POST /api/evidence`) using the `/evidence` page: Demo laptop notes, Demo phone export, Demo payroll records, Demo email export, and Demo firewall log. Each upload was hashed on the server with SHA-256, stored in the vault under its hash, and recorded with an INTAKE custody row in one transaction. The metadata document was written to MongoDB after the SQL commit.

Verified with: `SELECT evidence_id, evidence_name FROM evidence WHERE evidence_name LIKE 'Demo %' ORDER BY evidence_id;` (5 rows).

## Demo: transactions, isolation, and locking

Setup: Window 1 is the admin session (postgres), Window 2 is a second session.

**Atomicity and isolation.** Window 1 opened a transaction and transferred evidence 4 from user 5 to user 3 without committing. Window 2 read the same row and saw the committed holder, 5. After Window 1 committed, Window 2 saw holder 3. The uncommitted change was invisible to the other session until commit.

**Locking.** Window 1 transferred evidence 4 inside an open transaction, which takes a row lock through `SELECT ... FOR UPDATE` in `transfer_evidence`. Window 2 ran a second transfer of the same item. The `FOR UPDATE` lock is designed to hold it until Window 1 commits; the wait was not timed in this demo. After the commit, Window 2 read the new holder (3) and completed its transfer, returning custody ID 400025. Without the lock, the second transfer could have read the stale holder and created an invalid custody chain.

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

## Demo: DELETE is blocked by ON DELETE RESTRICT

Command (psql): `DELETE FROM evidence WHERE evidence_id = 1;`

Result: `ERROR: update or delete on table "evidence" violates RESTRICT setting of foreign key constraint "chain_of_custody_evidence_id_fkey" on table "chain_of_custody". DETAIL: Key (evidence_id)=(1) is referenced from table "chain_of_custody".`

This is the intended behaviour. Evidence with custody history cannot be deleted, so the chain of custody cannot be silently destroyed. The error is a feature of the design, not a fault.

## DDL: constraints and referential actions

Primary and foreign keys:
- Every table has a SERIAL primary key.
- `evidence.case_id`, `evidence.evidence_type_id`, `evidence.collected_by`, and `evidence.current_holder_id` are NOT NULL foreign keys.
- `chain_of_custody.from_user_id` is nullable, because the INTAKE record has no sender.

Referential actions:
- All foreign keys use `ON DELETE RESTRICT`. Evidence and custody records must never disappear because a case or user was removed. `CASCADE` would silently destroy custody history.
- `ON UPDATE` uses the default `NO ACTION`. Updating a referenced user ID is rejected. Tested: `UPDATE users SET user_id = 99 WHERE user_id = 1` failed with a foreign key violation (`audit_logs_user_id_fkey`), and the rollback left the data unchanged.

CHECK constraints:
- `chain_of_custody`: `from_user_id IS NULL OR from_user_id <> to_user_id` (no self-transfer).
- `chain_of_custody`: INTAKE must have a NULL sender, and TRANSFER must have a non-NULL sender.
- `evidence.status` is limited to COLLECTED, IN_CUSTODY, ANALYZED, RELEASED.

UNIQUE constraints:
- `evidence.file_hash` (the same content cannot be registered twice).

Demonstrations: the custody-sender CHECK rejected an INTAKE with a sender, and a TRANSFER with no sender. Both errors were recorded in testing.

## Queries: what they answer and how they work

**Q1. Four-table JOIN (evidence with case, type, collector and holder).** Answers "for each evidence item, which case is it in, what kind is it, who collected it and who holds it now?" It joins `evidence` to `cases`, `evidence_type`, and `users` twice, once for the collector and once for the holder, using the foreign keys. The two joins to `users` use aliases (`collector`, `holder`) because the same table appears twice. It matters for forensics because it shows the full ownership picture of each item in one result.

**Q2. GROUP BY with HAVING (holders with more than one item).** Answers "which users are currently responsible for more than one evidence item?" The query joins evidence to its current holder, groups by holder name, counts items per group, and keeps only groups where `COUNT(*) > 1`. `WHERE` filters rows before grouping, while `HAVING` filters the groups after counting, which is why the count condition belongs in `HAVING`. On the seed data it returns one row, Divya Custodian with 2 items.

**Q7. Holder-chain check (correlated subquery).** Answers "does the stored current holder match the most recent custody record?" For each evidence item, a correlated subquery finds the latest custody row, ordered by `transfer_time` and then `custody_id` as a tie-breaker, and takes its `to_user_id`. The outer query returns any evidence where that value differs from `current_holder_id`. It should return zero rows, and it does. It matters because it verifies the denormalised holder column against the custody trail using only the data, with no application code involved.

## Triggers, procedures and functions

**Trigger: `block_custody_change` (append-only custody).** Fires before any UPDATE or DELETE on `chain_of_custody` and raises an exception naming the operation. This is specific to the project: a custody record is evidence of who held an item and when, so altering or removing it would undermine the case. The trigger enforces that rule in the database, so it applies to every client, not only the web app. Demonstrated: an UPDATE and a DELETE on custody row 1 were both rejected with "chain_of_custody is append-only".

**Procedure: `transfer_evidence` (transactional transfer).** Runs one transfer as a single unit. It locks the evidence row with `SELECT ... FOR UPDATE`, checks the item exists and that the actor is the current holder, inserts a TRANSFER custody row with `from_user_id` set to the current holder, and updates `current_holder_id` and status. Because the whole sequence runs in one transaction, either all of these changes happen or none do. In PostgreSQL this is implemented as a function that returns the new custody ID. Demonstrated: a valid transfer returned a custody ID, and a transfer by a non-holder or of a missing item raised an error and changed nothing.

**Function: `custody_chain_intact(evidence_id)`.** Returns true if every TRANSFER in an item's custody history starts from the previous recipient. It uses `LAG` over the custody rows in order to compare each sender with the prior recipient, and returns false if any link is broken. It is the database-side check that the chain of custody is continuous. Demonstrated: it returned true on valid data, and false after a deliberately inserted transfer from the wrong user, which was then rolled back.