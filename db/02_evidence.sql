-- db/02_evidence.sql
-- Owner: Yashwitha
-- Tables: EVIDENCE_TYPE, EVIDENCE, CHAIN_OF_CUSTODY
-- Requires USERS (user_id) and CASES (case_id) to exist first.

-- ---------------------------------------------------------------
-- EVIDENCE_TYPE
-- ---------------------------------------------------------------
CREATE TABLE evidence_type (
    evidence_type_id  SERIAL PRIMARY KEY,
    type_name         VARCHAR(60)  NOT NULL UNIQUE,
    description       TEXT
);

-- ---------------------------------------------------------------
-- EVIDENCE
-- file_hash is the SHA-256 of the stored file (64 hex characters).
-- UNIQUE on file_hash also creates a B-tree index automatically.
-- current_holder_id is a deliberate denormalisation: it is kept in
-- sync by transfer_evidence() so the holder can be read without
-- finding the latest custody row.
-- ---------------------------------------------------------------
CREATE TABLE evidence (
    evidence_id       SERIAL PRIMARY KEY,
    case_id           INTEGER      NOT NULL
                      REFERENCES cases(case_id) ON DELETE RESTRICT,
    evidence_type_id  INTEGER      NOT NULL
                      REFERENCES evidence_type(evidence_type_id) ON DELETE RESTRICT,
    evidence_name     VARCHAR(150) NOT NULL,
    description       TEXT,
    source            VARCHAR(150),
    collection_date   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    file_hash         CHAR(64)     NOT NULL UNIQUE,
    storage_location  VARCHAR(255) NOT NULL,
    status            VARCHAR(20)  NOT NULL DEFAULT 'COLLECTED'
                      CHECK (status IN ('COLLECTED', 'IN_CUSTODY', 'ANALYZED', 'RELEASED')),
    collected_by      INTEGER      NOT NULL
                      REFERENCES users(user_id) ON DELETE RESTRICT,
    current_holder_id INTEGER      NOT NULL
                      REFERENCES users(user_id) ON DELETE RESTRICT
);

-- ---------------------------------------------------------------
-- CHAIN_OF_CUSTODY (append-only)
-- from_user_id is NULL only for the first record (intake).
-- ---------------------------------------------------------------
CREATE TABLE chain_of_custody (
    custody_id     SERIAL PRIMARY KEY,
    evidence_id    INTEGER      NOT NULL
                   REFERENCES evidence(evidence_id) ON DELETE RESTRICT,
    from_user_id   INTEGER
                   REFERENCES users(user_id) ON DELETE RESTRICT,
    to_user_id     INTEGER      NOT NULL
                   REFERENCES users(user_id) ON DELETE RESTRICT,
    action         VARCHAR(20)  NOT NULL
                   CHECK (action IN ('INTAKE', 'TRANSFER')),
    transfer_time  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    location       VARCHAR(150),
    remarks        TEXT,
    CONSTRAINT chk_custody_not_self CHECK (from_user_id <> to_user_id)
);

-- Timeline query: custody rows for one evidence item, in order.
CREATE INDEX idx_custody_evidence_time
    ON chain_of_custody (evidence_id, transfer_time);

-- ---------------------------------------------------------------
-- Append-only guard: custody rows can never be changed or removed.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION block_custody_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'chain_of_custody is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_custody_append_only
    BEFORE UPDATE OR DELETE ON chain_of_custody
    FOR EACH ROW EXECUTE FUNCTION block_custody_change();

-- ---------------------------------------------------------------
-- Audit triggers (function defined in 01_core.sql by Chaithanya)
-- ---------------------------------------------------------------
CREATE TRIGGER trg_evidence_audit
    AFTER INSERT OR UPDATE OR DELETE ON evidence
    FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE TRIGGER trg_custody_audit
    AFTER INSERT OR UPDATE OR DELETE ON chain_of_custody
    FOR EACH ROW EXECUTE FUNCTION audit_row_change();