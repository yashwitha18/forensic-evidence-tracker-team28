-- Team 28 | Chaithanya N
-- Run after db/01_core.sql and db/02_evidence.sql.
-- Provides investigations, evidence linkage, forensic reports, audit triggers,
-- lifecycle validation, stored functions, stored procedure, indexes and view.

CREATE TABLE investigations (
    investigation_id SERIAL PRIMARY KEY,
    case_id INTEGER NOT NULL REFERENCES cases(case_id) ON DELETE RESTRICT,
    investigator_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    methodology TEXT,
    findings TEXT,
    start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_time TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS'
        CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'SUSPENDED')),
    CONSTRAINT chk_inv_times CHECK (end_time IS NULL OR end_time >= start_time),
    CONSTRAINT chk_inv_done CHECK ((status = 'COMPLETED') = (end_time IS NOT NULL))
);

CREATE TABLE investigation_evidence (
    investigation_id INTEGER NOT NULL REFERENCES investigations(investigation_id) ON DELETE CASCADE,
    evidence_id INTEGER NOT NULL REFERENCES evidence(evidence_id) ON DELETE RESTRICT,
    PRIMARY KEY (investigation_id, evidence_id)
);

CREATE TABLE forensic_reports (
    report_id SERIAL PRIMARY KEY,
    investigation_id INTEGER NOT NULL REFERENCES investigations(investigation_id) ON DELETE RESTRICT,
    report_title VARCHAR(200) NOT NULL,
    report_file VARCHAR(255),
    report_content TEXT,
    report_status VARCHAR(15) NOT NULL DEFAULT 'DRAFT'
        CHECK (report_status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inv_case ON investigations(case_id);
CREATE INDEX idx_inv_investigator ON investigations(investigator_id);
CREATE INDEX idx_inv_ev_evidence ON investigation_evidence(evidence_id);
CREATE INDEX idx_reports_investigation ON forensic_reports(investigation_id);
CREATE INDEX idx_reports_fts ON forensic_reports USING GIN (
    to_tsvector('english', coalesce(report_title, '') || ' ' || coalesce(report_content, ''))
);

CREATE TRIGGER trg_audit_investigations
AFTER INSERT OR UPDATE OR DELETE ON investigations
FOR EACH ROW EXECUTE FUNCTION audit_row_change('investigation_id');
CREATE TRIGGER trg_audit_reports
AFTER INSERT OR UPDATE OR DELETE ON forensic_reports
FOR EACH ROW EXECUTE FUNCTION audit_row_change('report_id');

CREATE OR REPLACE FUNCTION fn_touch_report() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_touch_report BEFORE UPDATE ON forensic_reports
FOR EACH ROW EXECUTE FUNCTION fn_touch_report();

-- Prevent investigations from being opened on a closed case; lock case against a concurrent close.
CREATE OR REPLACE FUNCTION fn_inv_before_insert() RETURNS trigger AS $$
DECLARE v_status TEXT;
BEGIN
    SELECT status INTO v_status FROM cases WHERE case_id = NEW.case_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Case % does not exist', NEW.case_id; END IF;
    IF v_status = 'CLOSED' THEN
        RAISE EXCEPTION 'Case % is closed; cannot open a new investigation', NEW.case_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_inv_before_insert BEFORE INSERT ON investigations
FOR EACH ROW EXECUTE FUNCTION fn_inv_before_insert();

-- First investigation transitions the case from OPEN to IN_PROGRESS.
CREATE OR REPLACE FUNCTION fn_inv_after_insert() RETURNS trigger AS $$
BEGIN
    UPDATE cases SET status = 'IN_PROGRESS'
    WHERE case_id = NEW.case_id AND status = 'OPEN';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_inv_after_insert AFTER INSERT ON investigations
FOR EACH ROW EXECUTE FUNCTION fn_inv_after_insert();

-- Evidence must belong to the same case as the investigation examining it.
CREATE OR REPLACE FUNCTION fn_inv_evidence_same_case() RETURNS trigger AS $$
DECLARE v_inv_case INTEGER; v_ev_case INTEGER;
BEGIN
    SELECT case_id INTO v_inv_case FROM investigations WHERE investigation_id = NEW.investigation_id;
    SELECT case_id INTO v_ev_case FROM evidence WHERE evidence_id = NEW.evidence_id;
    IF v_inv_case IS DISTINCT FROM v_ev_case THEN
        RAISE EXCEPTION 'Evidence % belongs to case %, investigation % belongs to case %',
            NEW.evidence_id, v_ev_case, NEW.investigation_id, v_inv_case;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_inv_evidence_same_case BEFORE INSERT OR UPDATE ON investigation_evidence
FOR EACH ROW EXECUTE FUNCTION fn_inv_evidence_same_case();

-- Function: finish only after evidence is attached and findings are recorded.
CREATE OR REPLACE FUNCTION finish_investigation(p_investigation_id INTEGER, p_findings TEXT)
RETURNS void AS $$
DECLARE v_status TEXT; v_count INTEGER;
BEGIN
    SELECT status INTO v_status FROM investigations
    WHERE investigation_id = p_investigation_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Investigation % not found', p_investigation_id; END IF;
    IF v_status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'Investigation % is %', p_investigation_id, v_status; END IF;
    SELECT count(*) INTO v_count FROM investigation_evidence WHERE investigation_id = p_investigation_id;
    IF v_count = 0 THEN RAISE EXCEPTION 'Attach at least one evidence item before completion'; END IF;
    IF p_findings IS NULL OR length(btrim(p_findings)) < 10 THEN
        RAISE EXCEPTION 'Findings must contain at least 10 non-space characters';
    END IF;
    UPDATE investigations SET status = 'COMPLETED', end_time = now(), findings = p_findings
    WHERE investigation_id = p_investigation_id;
END;
$$ LANGUAGE plpgsql;

-- Function: close only when at least one investigation exists, all are completed,
-- and every investigation has an approved forensic report.
CREATE OR REPLACE FUNCTION close_case(p_case_id INTEGER) RETURNS void AS $$
DECLARE v_status TEXT; v_total INTEGER; v_unfinished INTEGER; v_unapproved INTEGER;
BEGIN
    SELECT status INTO v_status FROM cases WHERE case_id = p_case_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Case % not found', p_case_id; END IF;
    IF v_status = 'CLOSED' THEN RAISE EXCEPTION 'Case % is already closed', p_case_id; END IF;
    SELECT count(*) INTO v_total FROM investigations WHERE case_id = p_case_id;
    IF v_total = 0 THEN RAISE EXCEPTION 'Case % has no investigations', p_case_id; END IF;
    SELECT count(*) INTO v_unfinished FROM investigations
    WHERE case_id = p_case_id AND status <> 'COMPLETED';
    IF v_unfinished > 0 THEN RAISE EXCEPTION 'Case % has % unfinished investigation(s)', p_case_id, v_unfinished; END IF;
    SELECT count(*) INTO v_unapproved
    FROM investigations i
    WHERE i.case_id = p_case_id
      AND NOT EXISTS (SELECT 1 FROM forensic_reports r
                      WHERE r.investigation_id = i.investigation_id AND r.report_status = 'APPROVED');
    IF v_unapproved > 0 THEN RAISE EXCEPTION 'Case % has % investigation(s) without an APPROVED report', p_case_id, v_unapproved; END IF;
    UPDATE cases SET status = 'CLOSED', closed_date = CURRENT_DATE WHERE case_id = p_case_id;
END;
$$ LANGUAGE plpgsql;

-- Stored PROCEDURE: the administrator's review decision is a controlled DB operation.
-- The API enforces ADMIN role; this procedure enforces the report workflow state.
CREATE OR REPLACE PROCEDURE review_forensic_report(p_report_id INTEGER, p_decision VARCHAR)
LANGUAGE plpgsql AS $$
DECLARE v_status VARCHAR(15); v_content TEXT; v_file VARCHAR(255);
BEGIN
    IF p_decision IS NULL OR p_decision NOT IN ('APPROVED', 'REJECTED') THEN
        RAISE EXCEPTION 'Decision must be APPROVED or REJECTED';
    END IF;
    SELECT report_status, report_content, report_file
    INTO v_status, v_content, v_file
    FROM forensic_reports WHERE report_id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report % not found', p_report_id; END IF;
    IF v_status <> 'SUBMITTED' THEN
        RAISE EXCEPTION 'Only SUBMITTED reports can be reviewed (current status: %)', v_status;
    END IF;
    IF p_decision = 'APPROVED' AND nullif(btrim(coalesce(v_content, '')), '') IS NULL AND v_file IS NULL THEN
        RAISE EXCEPTION 'Cannot approve a report with no content or report file';
    END IF;
    UPDATE forensic_reports SET report_status = p_decision WHERE report_id = p_report_id;
END;
$$;

CREATE OR REPLACE VIEW case_summary AS
SELECT c.case_id, c.case_no, c.title, c.case_type, c.status, c.priority,
       c.opened_date, c.closed_date, u.name AS created_by_name,
       count(DISTINCT e.evidence_id) AS evidence_count,
       count(DISTINCT i.investigation_id) AS investigation_count,
       count(DISTINCT i.investigation_id) FILTER (WHERE i.status <> 'COMPLETED') AS open_investigations
FROM cases c
JOIN users u ON u.user_id = c.created_by
LEFT JOIN evidence e ON e.case_id = c.case_id
LEFT JOIN investigations i ON i.case_id = c.case_id
GROUP BY c.case_id, u.name;
