-- db/02b_transfer.sql
-- Owner: Yashwitha
-- Transfers evidence to a new holder. Runs in one transaction:
-- lock the evidence row, verify the actor holds it, append a custody
-- row, and update the holder and status.
-- Requires 02_evidence.sql to be loaded first.

CREATE OR REPLACE FUNCTION transfer_evidence(
    p_evidence_id  INTEGER,
    p_to_user_id   INTEGER,
    p_location     VARCHAR,
    p_remarks      TEXT,
    p_actor_id     INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_holder_id   INTEGER;
    v_custody_id  INTEGER;
BEGIN
    -- Lock the evidence row so two transfers can't run at the same time.
    SELECT current_holder_id
      INTO v_holder_id
      FROM evidence
     WHERE evidence_id = p_evidence_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'evidence % does not exist', p_evidence_id;
    END IF;

    -- Only the current holder can transfer the item.
    IF v_holder_id <> p_actor_id THEN
        RAISE EXCEPTION 'user % does not hold evidence % (current holder is %)',
            p_actor_id, p_evidence_id, v_holder_id;
    END IF;

    -- from_user_id is always the current holder, so the custody chain stays continuous.
    -- The CHECK constraint rejects a transfer to the same user.
    INSERT INTO chain_of_custody
        (evidence_id, from_user_id, to_user_id, action, location, remarks)
    VALUES
        (p_evidence_id, v_holder_id, p_to_user_id, 'TRANSFER', p_location, p_remarks)
    RETURNING custody_id INTO v_custody_id;

    UPDATE evidence
       SET current_holder_id = p_to_user_id,
           status            = 'IN_CUSTODY'
     WHERE evidence_id = p_evidence_id;

    RETURN v_custody_id;
END;
$$ LANGUAGE plpgsql;