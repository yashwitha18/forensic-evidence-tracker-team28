-- Test cases for Chaithanya's part.  Run: psql -d forensics -f db/tests_core.sql
-- Needs db/01_core.sql, 02_evidence.sql (or the local stub), 03_investigation.sql and seed_core.sql loaded (cases 1 and 2, users 1-5).
-- Everything is rolled back at the end.
BEGIN;
SELECT set_config('app.user_id','2',true);   -- act as user 2 (Ravi)
CREATE FUNCTION pg_temp.expect_fail(label TEXT, stmt TEXT) RETURNS void AS $$
BEGIN
    BEGIN EXECUTE stmt; RAISE NOTICE 'FAIL  % (statement succeeded but should have been rejected)', label;
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PASS  % -> %', label, left(SQLERRM, 90); END;
END $$ LANGUAGE plpgsql;
CREATE FUNCTION pg_temp.expect(label TEXT, cond BOOLEAN) RETURNS void AS $$
BEGIN RAISE NOTICE '%  %', CASE WHEN cond THEN 'PASS' ELSE 'FAIL' END, label; END $$ LANGUAGE plpgsql;

-- test fixtures (rolled back at the end): one evidence type, two evidence items in case 1, one in case 2
INSERT INTO evidence_type(type_name) VALUES ('TEST-TYPE') RETURNING evidence_type_id AS et \gset
INSERT INTO evidence(case_id,evidence_type_id,evidence_name,file_hash,storage_location,collected_by,current_holder_id)
  VALUES (1,:et,'T-A',repeat('d',64),'Vault',4,4) RETURNING evidence_id AS ev1 \gset
INSERT INTO evidence(case_id,evidence_type_id,evidence_name,file_hash,storage_location,collected_by,current_holder_id)
  VALUES (1,:et,'T-B',repeat('e',64),'Vault',4,4) RETURNING evidence_id AS ev2 \gset
INSERT INTO evidence(case_id,evidence_type_id,evidence_name,file_hash,storage_location,collected_by,current_holder_id)
  VALUES (2,:et,'T-C',repeat('f',64),'Vault',5,5) RETURNING evidence_id AS ev_other \gset

SELECT pg_temp.expect_fail('T01 invalid role rejected',          $$INSERT INTO users(name,email,password_hash,role) VALUES('x','x1@a.com','h','HACKER')$$);
SELECT pg_temp.expect_fail('T02 duplicate e-mail rejected',      $$INSERT INTO users(name,email,password_hash,role) VALUES('x','admin@forensics.local','h','ADMIN')$$);
SELECT pg_temp.expect_fail('T03 bad e-mail format rejected',     $$INSERT INTO users(name,email,password_hash,role) VALUES('x','not-an-email','h','ADMIN')$$);
SELECT pg_temp.expect_fail('T04 closed_date before opened_date', $$INSERT INTO cases(title,case_type,status,opened_date,closed_date,created_by) VALUES('t','FRAUD','CLOSED','2026-10-10','2026-10-01',2)$$);
SELECT pg_temp.expect_fail('T05 CLOSED case needs closed_date',  $$INSERT INTO cases(title,case_type,status,created_by) VALUES('t','FRAUD','CLOSED',2)$$);
SELECT pg_temp.expect_fail('T06 invalid case status rejected',   $$INSERT INTO cases(title,case_type,status,created_by) VALUES('t','FRAUD','UNDER_INVESTIGATION',2)$$);
SELECT pg_temp.expect_fail('T07 case needs created_by (NOT NULL)',$$INSERT INTO cases(title,case_type) VALUES('t','FRAUD')$$);
SELECT pg_temp.expect('T08 case_no auto-generated', (SELECT case_no ~ '^CASE-[0-9]{4}-[0-9]{4}$' FROM cases WHERE case_id = 1));

SELECT pg_temp.expect('T09 case 1 starts OPEN', (SELECT status = 'OPEN' FROM cases WHERE case_id = 1));
INSERT INTO investigations(case_id,investigator_id,methodology) VALUES (1,2,'Disk forensics') RETURNING investigation_id AS inv1 \gset
SELECT pg_temp.expect('T10 first investigation => case IN_PROGRESS', (SELECT status = 'IN_PROGRESS' FROM cases WHERE case_id = 1));
SELECT pg_temp.expect_fail('T11 evidence of another case rejected', format($$INSERT INTO investigation_evidence VALUES(%s,%s)$$, :inv1, :ev_other));
SELECT pg_temp.expect_fail('T12 finish with no evidence rejected',  format($$SELECT finish_investigation(%s,'findings')$$, :inv1));
INSERT INTO investigation_evidence VALUES (:inv1, :ev1), (:inv1, :ev2);
SELECT pg_temp.expect_fail('T13 same evidence twice (composite PK)', format($$INSERT INTO investigation_evidence VALUES(%s,%s)$$, :inv1, :ev1));
SELECT pg_temp.expect_fail('T14 close_case blocked: unfinished investigation', $$SELECT close_case(1)$$);
SELECT pg_temp.expect_fail('T15 finish needs findings', format($$SELECT finish_investigation(%s,'  ')$$, :inv1));
SELECT finish_investigation(:inv1, 'Ransomware binary found; C2 domain identified.');
SELECT pg_temp.expect('T16 finish => COMPLETED + end_time', (SELECT status='COMPLETED' AND end_time IS NOT NULL FROM investigations WHERE investigation_id=:inv1));
SELECT pg_temp.expect_fail('T17 finish twice rejected', format($$SELECT finish_investigation(%s,'again')$$, :inv1));
SELECT pg_temp.expect_fail('T18 close_case blocked: no APPROVED report', $$SELECT close_case(1)$$);

INSERT INTO forensic_reports(investigation_id,report_title,report_content)
  VALUES (:inv1,'Ransomware analysis','The binary encrypts files with AES and contacts a command and control server.') RETURNING report_id AS rep1 \gset
SELECT pg_temp.expect('T19 full-text search finds report', (SELECT count(*)=1 FROM forensic_reports WHERE to_tsvector('english', coalesce(report_title,'')||' '||coalesce(report_content,'')) @@ websearch_to_tsquery('english','encryption server')));
SELECT pg_temp.expect_fail('T20 invalid report status rejected', format($$UPDATE forensic_reports SET report_status='DONE' WHERE report_id=%s$$, :rep1));
SELECT pg_temp.expect_fail('T20b review procedure rejects a DRAFT report', format($$CALL review_forensic_report(%s, 'APPROVED')$$, :rep1));
UPDATE forensic_reports SET report_status='SUBMITTED' WHERE report_id=:rep1;
CALL review_forensic_report(:rep1, 'APPROVED');
SELECT pg_temp.expect('T21 procedure approves a SUBMITTED report', (SELECT report_status='APPROVED' FROM forensic_reports WHERE report_id=:rep1));
SELECT pg_temp.expect('T21b updated_at maintained', (SELECT updated_at >= created_at FROM forensic_reports WHERE report_id=:rep1));
SELECT close_case(1);
SELECT pg_temp.expect('T22 close_case succeeds when all done', (SELECT status='CLOSED' AND closed_date IS NOT NULL FROM cases WHERE case_id=1));
SELECT pg_temp.expect_fail('T23 no new investigation on CLOSED case', $$INSERT INTO investigations(case_id,investigator_id) VALUES(1,2)$$);
SELECT pg_temp.expect_fail('T24 closing a closed case rejected', $$SELECT close_case(1)$$);
SELECT pg_temp.expect_fail('T25 close_case on missing case rejected', $$SELECT close_case(99999)$$);
SELECT pg_temp.expect_fail('T26 cannot delete user who owns cases (RESTRICT)', $$DELETE FROM users WHERE user_id = 2$$);

SELECT pg_temp.expect('T27 audit rows carry the actor (user 2)', (SELECT count(*) >= 3 FROM audit_logs WHERE user_id = 2 AND entity_type IN ('cases','investigations','forensic_reports')));
SELECT pg_temp.expect('T28 audit never stores password_hash', (SELECT count(*) = 0 FROM audit_logs WHERE details::text ILIKE '%password_hash%'));
SELECT pg_temp.expect('T29 case_summary counts', (SELECT evidence_count=2 AND investigation_count=1 AND open_investigations=0 FROM case_summary WHERE case_id=1));
ROLLBACK;
