-- Safe, repeatable DDL demonstration. All objects are TEMPORARY and disappear
-- when this session ends. No project tables are dropped or altered.
BEGIN;

CREATE TEMP TABLE ddl_demo_case (
    case_code VARCHAR(20) PRIMARY KEY,
    title VARCHAR(80) NOT NULL,
    severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5)
) ON COMMIT DROP;

CREATE TEMP TABLE ddl_demo_evidence (
    item_id SERIAL PRIMARY KEY,
    case_code VARCHAR(20) NOT NULL,
    file_name VARCHAR(100) NOT NULL,
    CONSTRAINT fk_demo_case FOREIGN KEY (case_code)
        REFERENCES ddl_demo_case(case_code)
        ON UPDATE CASCADE ON DELETE CASCADE
) ON COMMIT DROP;

-- DML solely to prove referential actions.
INSERT INTO ddl_demo_case VALUES ('CASE-DEMO-1', 'Demo ransomware case', 5);
INSERT INTO ddl_demo_evidence(case_code, file_name) VALUES ('CASE-DEMO-1', 'disk-image.E01');

-- CHECK constraint: invalid severity is rejected (caught here so the demo continues).
DO $$
BEGIN
    BEGIN
        INSERT INTO ddl_demo_case VALUES ('CASE-BAD', 'Invalid severity example', 9);
        RAISE EXCEPTION 'CHECK constraint failed to reject invalid severity';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS: CHECK rejected severity=9 (allowed range is 1..5)';
    END;
END;
$$;

-- ALTER + CREATE INDEX.
ALTER TABLE ddl_demo_evidence ADD COLUMN collected_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX idx_demo_evidence_case ON ddl_demo_evidence(case_code);

-- ON UPDATE CASCADE: updating the parent PK propagates to the child FK.
UPDATE ddl_demo_case SET case_code = 'CASE-DEMO-2' WHERE case_code = 'CASE-DEMO-1';
SELECT 'ON UPDATE CASCADE' AS demonstration, case_code, file_name FROM ddl_demo_evidence;

-- ON DELETE CASCADE: deleting the parent removes its dependent child row.
DELETE FROM ddl_demo_case WHERE case_code = 'CASE-DEMO-2';
SELECT 'ON DELETE CASCADE (expected 0)' AS demonstration, count(*) AS child_rows
FROM ddl_demo_evidence;

-- DROP index and scratch tables (transaction rollback also protects the session).
DROP INDEX idx_demo_evidence_case;
DROP TABLE ddl_demo_evidence;
DROP TABLE ddl_demo_case;
ROLLBACK;
