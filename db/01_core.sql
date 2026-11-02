-- =====================================================================
-- db/01_core.sql   (Chaithanya)   USERS, CASES, AUDIT_LOGS + audit_row_change()
-- Run order: 01_core.sql -> 02_evidence.sql (Yashwitha) -> 03_investigation.sql
-- Table/column names match the printed ER + schema diagrams exactly.
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;          -- seed_core.sql uses crypt() for bcrypt-compatible hashes
CREATE SEQUENCE IF NOT EXISTS case_no_seq START 1;

CREATE TABLE users (
    user_id        SERIAL       PRIMARY KEY,
    name           VARCHAR(100) NOT NULL,
    email          VARCHAR(150) NOT NULL UNIQUE,
    password_hash  VARCHAR(100) NOT NULL,                      -- bcrypt hash, never plaintext
    role           VARCHAR(20)  NOT NULL
                   CHECK (role IN ('ADMIN','INVESTIGATOR','CUSTODIAN')),
    phone          VARCHAR(20)  CHECK (phone ~ '^[0-9+() -]{7,20}$'),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

CREATE TABLE cases (
    case_id      SERIAL       PRIMARY KEY,
    case_no      VARCHAR(30)  NOT NULL UNIQUE
                 DEFAULT ('CASE-' || to_char(now(),'YYYY') || '-' || lpad(nextval('case_no_seq')::text, 4, '0')),
    title        VARCHAR(200) NOT NULL,
    description  TEXT,
    case_type    VARCHAR(30)  NOT NULL
                 CHECK (case_type IN ('MALWARE','FRAUD','DATA_BREACH','HARASSMENT','INTELLECTUAL_PROPERTY','OTHER')),
    status       VARCHAR(20)  NOT NULL DEFAULT 'OPEN'
                 CHECK (status IN ('OPEN','IN_PROGRESS','CLOSED')),
    priority     VARCHAR(10)  NOT NULL DEFAULT 'MEDIUM'
                 CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    opened_date  DATE         NOT NULL DEFAULT CURRENT_DATE,
    closed_date  DATE,
    created_by   INT          NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    CONSTRAINT chk_case_dates  CHECK (closed_date IS NULL OR closed_date >= opened_date),
    CONSTRAINT chk_case_closed CHECK ((status = 'CLOSED') = (closed_date IS NOT NULL))
);

CREATE TABLE audit_logs (
    audit_id     BIGSERIAL    PRIMARY KEY,
    user_id      INT          REFERENCES users(user_id) ON DELETE SET NULL,   -- nullable: system / unauthenticated actions
    action       VARCHAR(20)  NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','LOGIN','LOGOUT')),
    entity_type  VARCHAR(40)  NOT NULL,
    entity_id    INT,
    details      JSONB,
    "timestamp"  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_cases_status_priority ON cases(status, priority);
CREATE INDEX idx_cases_created_by      ON cases(created_by);
CREATE INDEX idx_audit_entity          ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_time            ON audit_logs("timestamp" DESC);

-- ---------------------------------------------------------------------
-- audit_row_change(): generic AFTER ROW trigger.  Usage:
--   CREATE TRIGGER ... AFTER INSERT OR UPDATE OR DELETE ON <table>
--   FOR EACH ROW EXECUTE FUNCTION audit_row_change('<primary key column>');
-- The app sets  app.user_id  per transaction (lib/db.ts -> withTx), so the actor is recorded.
-- password_hash is never copied into the log.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger AS $$
DECLARE
    v_user INT  := NULLIF(current_setting('app.user_id', true), '')::int;
    v_pk   TEXT := TG_ARGV[0];
    v_id   INT;
    v_det  JSONB;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_id  := (to_jsonb(OLD) ->> v_pk)::int;
        v_det := jsonb_build_object('old', to_jsonb(OLD) - 'password_hash');
    ELSIF TG_OP = 'UPDATE' THEN
        v_id  := (to_jsonb(NEW) ->> v_pk)::int;
        v_det := jsonb_build_object('old', to_jsonb(OLD) - 'password_hash', 'new', to_jsonb(NEW) - 'password_hash');
    ELSE
        v_id  := (to_jsonb(NEW) ->> v_pk)::int;
        v_det := jsonb_build_object('new', to_jsonb(NEW) - 'password_hash');
    END IF;
    INSERT INTO audit_logs(user_id, action, entity_type, entity_id, details)
    VALUES (v_user, TG_OP, TG_TABLE_NAME, v_id, v_det);
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_cases AFTER INSERT OR UPDATE OR DELETE ON cases
    FOR EACH ROW EXECUTE FUNCTION audit_row_change('case_id');
