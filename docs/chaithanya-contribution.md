# Team 28 — Chaithanya N: Database and Application Contribution

> Complete the verification fields and add screenshots after running the project locally. Do not record passwords, JWTs, database URLs, or other secrets in this document.

## 1. Project objective

The Digital Forensic Evidence Tracking and Case Management System supports controlled case creation, evidence examination, investigation lifecycle management, forensic report review, and accountable audit history. Its purpose is to preserve data integrity and traceability during forensic work, rather than provide generic CRUD alone.

## 2. Chaithanya's implementation scope

- PostgreSQL core schema: `users`, `cases`, `audit_logs` and the `audit_row_change()` trigger function.
- Investigation schema: `investigations`, `investigation_evidence`, and `forensic_reports`.
- Investigation/case lifecycle checks, report workflow, summary view, indexes, and search.
- Next.js authentication integration, cases/investigations/reports/audit APIs, and dashboard API/UI.
- SQL DDL/query/test demonstrations and this documentation section.

## 3. Relational database choice

PostgreSQL stores records that require relational constraints and transactional consistency: users, cases, evidence references, custody events, investigations, reports, and audit events. Foreign keys, CHECK constraints, transactions, row locks, triggers, and indexes enforce integrity close to the data. `DATABASE_URL` is supplied through `.env.local`, not hard-coded.

## 4. Investigation data dictionary

| Table | Attribute | Purpose / constraint |
|---|---|---|
| investigations | investigation_id | Primary key |
| investigations | case_id | Required FK to cases; RESTRICT on delete |
| investigations | investigator_id | Required FK to users; RESTRICT on delete |
| investigations | methodology | Investigation technique/approach |
| investigations | findings | Outcome/findings recorded at completion |
| investigations | start_time, end_time | Timestamps; end cannot precede start |
| investigations | status | IN_PROGRESS / COMPLETED / SUSPENDED |
| investigation_evidence | investigation_id, evidence_id | Composite PK and M:N links; investigation FK cascades on delete, evidence FK restricts delete |
| forensic_reports | report_id | Primary key |
| forensic_reports | investigation_id | Required FK to investigations; RESTRICT on delete |
| forensic_reports | report_title, report_file, report_content | Report metadata and content/location |
| forensic_reports | report_status | DRAFT / SUBMITTED / APPROVED / REJECTED |
| forensic_reports | created_at, updated_at | Creation and trigger-maintained modification timestamps |

## 5. Project-specific integrity rules

- An investigation cannot be opened for a CLOSED case.
- The first investigation changes its case from OPEN to IN_PROGRESS.
- Evidence linked to an investigation must belong to that investigation's case.
- An investigation can be completed only after evidence is attached and findings are supplied.
- A case can be closed only when it has investigations, every investigation is completed, and each has an APPROVED report.
- Report content is editable only while DRAFT or REJECTED. Only an ADMIN can approve/reject a submitted report.
- Audit triggers record INSERT/UPDATE/DELETE and omit password hashes.
- Integration check for Yashwitha: ensure `INTAKE` rows require `from_user_id IS NULL` and `TRANSFER` rows require `from_user_id IS NOT NULL`; confirm historic rows satisfy this before adding the CHECK constraint to `02_evidence.sql`.

## 6. Advanced SQL features

1. Transactions and row locks: application writes use `withTx(userId, callback)`; lifecycle operations lock relevant case/investigation/report rows.
2. Triggers: case lifecycle, same-case evidence validation, updated timestamp, and audit logging.
3. Functions: `finish_investigation()` and `close_case()` implement domain rules.
4. Stored procedure: `review_forensic_report()` enforces the submitted-report review transition.
5. View: `case_summary` aggregates evidence and investigation counts for dashboards.
6. Indexing/full-text search: B-tree indexes support joins/filters; a GIN expression index supports ranked report-text search.

## 7. Important queries to explain

See `db/queries_cases.sql`: multi-table JOIN with aggregation; GROUP BY/HAVING; correlated subquery; full-text search using `websearch_to_tsquery`, `ts_rank`, and `ts_headline`; audit history; dashboard view; EXPLAIN ANALYZE.

## 8. Application and authorization

Next.js route handlers validate request bodies with Zod, enforce roles with `requireRole`, parameterize SQL queries, and use `withTx` for writes so audit triggers receive the acting user ID. ADMIN can review reports and inspect audit history. INVESTIGATOR access is limited to assigned investigations/reports for relevant operations.

## 9. Testing record — fill after execution

| Test suite | Command / evidence | Result |
|---|---|---|
| SQL integrity tests | `psql -X -v ON_ERROR_STOP=1 -d forensics_test -f db/tests_core.sql` | Pending local run |
| DDL demonstration | `psql -X -v ON_ERROR_STOP=1 -d forensics_test -f db/ddl_demo.sql` | Pending local run |
| TypeScript | `npx tsc --noEmit` | Pending local run |
| Lint | `npm run lint` | Pending local run |
| Production build | `npm run build` | Pending local run |
| API / role tests | Record HTTP status and expected/actual output | Pending local run |

## 10. Screenshots to add

- Login as ADMIN and show admin-only audit/review controls.
- Login as INVESTIGATOR and show investigation/report ownership restrictions.
- Cases page: create and modify a case.
- Investigations page: create, attach/remove evidence, and finish.
- Reports page: create, update, submit, approve/reject, and delete a DRAFT.
- Dashboard and audit log.
- PostgreSQL query output for constraints, triggers, procedure, view, and selected queries.

## 11. Limitations / integration notes

MongoDB evidence metadata, hash calculation, evidence intake, custody transfer UI/API, and evidence charts are Yashwitha's assigned integration. Verify those modules in the merged repository and document the actual collection, indexes, aggregation, and test results before the final submission. PostgreSQL and MongoDB do not share a normal ACID transaction; the application must handle/retry metadata-write failure after a successful relational insert.

## 12. Conclusion

The relational layer enforces forensic workflow integrity: evidence links must match the case under investigation, lifecycle transitions are validated in the database, report approval is controlled, and writes are attributable through audit logs. PostgreSQL provides the transactional and referential guarantees needed for these records; MongoDB is used by the evidence subsystem for flexible metadata.
