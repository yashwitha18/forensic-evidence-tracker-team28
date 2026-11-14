# Demo notes

## Analysis: full table scan vs index

Test table: 200,000 rows in a scratch copy of chain_of_custody.

| Query | Plan | Rows read | Execution time |
|---|---|---|---|
| remarks = 'needle', no index | Seq Scan | 200,000 | 27.9 ms |
| remarks = 'needle', with index | Index Scan on idx_scan_remarks | 1 | 0.06 ms |

A sequential scan reads every row, so its cost grows with table size. Adding a B-tree index let PostgreSQL go straight to the matching row. Indexes are not free: each insert, update, and delete must also maintain the index, and the index uses disk space. The custody timeline query (evidence_id, transfer_time) is read on every case review while writes are infrequent, so that index is worth its cost.

Note: a low-selectivity filter such as evidence_id = 1 (one third of rows) may not benefit from an index, because the planner correctly chooses a bitmap or sequential scan.