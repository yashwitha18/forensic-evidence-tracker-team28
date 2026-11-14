-- Team 28 | selected demo queries. Run after 03_investigation.sql and seed data.

-- Q1: Multi-table JOIN + aggregation: investigator, case and evidence count.
SELECT i.investigation_id, c.case_no, c.title, u.name AS investigator,
       count(ie.evidence_id) AS evidence_examined
FROM investigations i
JOIN cases c ON c.case_id = i.case_id
JOIN users u ON u.user_id = i.investigator_id
LEFT JOIN investigation_evidence ie ON ie.investigation_id = i.investigation_id
GROUP BY i.investigation_id, c.case_no, c.title, u.name
ORDER BY c.case_no, i.investigation_id;

-- Q2: GROUP BY + HAVING: cases with at least two evidence items.
SELECT c.case_no, c.title, count(e.evidence_id) AS evidence_items
FROM cases c JOIN evidence e ON e.case_id = c.case_id
GROUP BY c.case_id
HAVING count(e.evidence_id) >= 2
ORDER BY evidence_items DESC, c.case_no;

-- Q3: Correlated subquery: cases whose latest investigation is still active.
SELECT c.case_no, c.title
FROM cases c
WHERE (SELECT i.status FROM investigations i
       WHERE i.case_id = c.case_id
       ORDER BY i.start_time DESC, i.investigation_id DESC LIMIT 1) = 'IN_PROGRESS';

-- Q4: Full-text report search; rank and highlight useful terms (GIN expression index).
SELECT report_id, report_title,
       ts_rank(to_tsvector('english', coalesce(report_title, '') || ' ' || coalesce(report_content, '')), q) AS relevance,
       ts_headline('english', coalesce(report_content, ''), q, 'MaxWords=24,MinWords=8') AS excerpt
FROM forensic_reports,
     websearch_to_tsquery('english', 'ransomware') AS q
WHERE to_tsvector('english', coalesce(report_title, '') || ' ' || coalesce(report_content, '')) @@ q
ORDER BY relevance DESC;

-- Q5: Audit history for one case, including actor name (user_id may be NULL).
SELECT a."timestamp", coalesce(u.name, 'system') AS actor, a.action,
       a.details->'new'->>'status' AS new_status
FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id
WHERE a.entity_type = 'cases' AND a.entity_id = 1
ORDER BY a."timestamp", a.audit_id;

-- Q6: Dashboard view (pre-aggregated case/evidence/investigation counts).
SELECT * FROM case_summary
ORDER BY CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2
                       WHEN 'MEDIUM' THEN 3 ELSE 4 END, opened_date DESC;

-- Q7: Compare plan for case status/priority filter; run after ANALYZE cases.
EXPLAIN (ANALYZE, BUFFERS)
SELECT case_id, case_no, title FROM cases
WHERE status = 'IN_PROGRESS' AND priority IN ('HIGH', 'CRITICAL');

-- Q8: Show the report GIN index is eligible for the text-search predicate.
EXPLAIN (ANALYZE, BUFFERS)
SELECT report_id FROM forensic_reports
WHERE to_tsvector('english', coalesce(report_title, '') || ' ' || coalesce(report_content, ''))
      @@ websearch_to_tsquery('english', 'ransomware encrypted files');
