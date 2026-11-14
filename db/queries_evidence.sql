-- db/queries_evidence.sql
-- Owner: Yashwitha
-- Important queries on evidence and custody. Run against forensic_test.
-- Run with: psql -P pager=off -U postgres -d forensic_test -f db/queries_evidence.sql

-- Q1. JOIN across four tables: each evidence item with its case, type,
--     collector, and current holder.
SELECT e.evidence_id,
       e.evidence_name,
       c.case_no,
       t.type_name,
       collector.name AS collected_by,
       holder.name    AS current_holder,
       e.status
FROM evidence e
JOIN cases c             ON c.case_id = e.case_id
JOIN evidence_type t     ON t.evidence_type_id = e.evidence_type_id
JOIN users collector     ON collector.user_id = e.collected_by
JOIN users holder        ON holder.user_id = e.current_holder_id
ORDER BY c.case_no, e.evidence_id;

-- Q2. GROUP BY with HAVING: users who hold more than one evidence item.
SELECT holder.name AS holder_name,
       COUNT(*)    AS items_held
FROM evidence e
JOIN users holder ON holder.user_id = e.current_holder_id
GROUP BY holder.name
HAVING COUNT(*) > 1
ORDER BY items_held DESC, holder_name;

-- Q3. Subquery: users who have never collected any evidence.
SELECT u.user_id, u.name, u.role
FROM users u
WHERE u.user_id NOT IN (SELECT collected_by FROM evidence)
ORDER BY u.user_id;

-- Q4. Aggregates per case: evidence count and custody events.
SELECT c.case_no,
       COUNT(DISTINCT e.evidence_id)  AS evidence_count,
       COUNT(cc.custody_id)           AS custody_events
FROM cases c
LEFT JOIN evidence e          ON e.case_id = c.case_id
LEFT JOIN chain_of_custody cc ON cc.evidence_id = e.evidence_id
GROUP BY c.case_no
ORDER BY c.case_no;

-- Q5. Custody timeline for one evidence item, in order.
SELECT cc.custody_id,
       cc.action,
       src.name  AS from_user,
       dst.name  AS to_user,
       cc.location,
       cc.transfer_time
FROM chain_of_custody cc
LEFT JOIN users src ON src.user_id = cc.from_user_id
JOIN users dst      ON dst.user_id = cc.to_user_id
WHERE cc.evidence_id = 1
ORDER BY cc.transfer_time, cc.custody_id;

-- Q6. Evidence count by type, with the most common type first.
SELECT t.type_name,
       COUNT(e.evidence_id) AS evidence_count
FROM evidence_type t
LEFT JOIN evidence e ON e.evidence_type_id = t.evidence_type_id
GROUP BY t.type_name
ORDER BY evidence_count DESC, t.type_name;

-- Q7. Holder-chain check: evidence whose latest custody row
--     disagrees with current_holder_id. Should return zero rows.
SELECT e.evidence_id
FROM evidence e
WHERE e.current_holder_id <> (
    SELECT cc.to_user_id
    FROM chain_of_custody cc
    WHERE cc.evidence_id = e.evidence_id
    ORDER BY cc.transfer_time DESC, cc.custody_id DESC
    LIMIT 1
);
