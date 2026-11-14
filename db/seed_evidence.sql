-- db/seed_evidence.sql
-- Owner: Yashwitha
-- Sample evidence types, evidence items, and their INTAKE custody rows.
-- Run after 01_core.sql, seed_core.sql, and 02_evidence.sql.

INSERT INTO evidence_type (type_name, description) VALUES
    ('Disk image',   'Bit-for-bit copy of a storage device'),
    ('Mobile device', 'Phone or tablet extraction'),
    ('Document',     'Scanned or exported documents'),
    ('Network capture', 'Packet capture (PCAP) files')
ON CONFLICT (type_name) DO NOTHING;

INSERT INTO evidence
    (case_id, evidence_type_id, evidence_name, description, source,
     file_hash, storage_location, collected_by, current_holder_id)
VALUES
    (1, (SELECT evidence_type_id FROM evidence_type WHERE type_name = 'Disk image'),
     'Finance server disk', 'Imaged after ransomware encryption', 'FIN-SRV-01',
     '3b5d5c3712955042212316173ccf37be800b4a3c24d1a1d2b8f0f0b0e5d4c3b2',
     '/vault/case1/fin-srv-01.dd', 4, 4),

    (1, (SELECT evidence_type_id FROM evidence_type WHERE type_name = 'Mobile device'),
     'Employee phone', 'Logical extraction of messages', 'EMP-PHONE-07',
     '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
     '/vault/case1/emp-phone-07.zip', 5, 5),

    (2, (SELECT evidence_type_id FROM evidence_type WHERE type_name = 'Document'),
     'Payroll change log', 'Exported audit trail from payroll system', 'HR-PAY-LOG',
     'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
     '/vault/case2/payroll-log.pdf', 5, 5);

-- Every evidence row needs its first custody record (INTAKE, no sender).
INSERT INTO chain_of_custody (evidence_id, from_user_id, to_user_id, action, location, remarks)
SELECT evidence_id, NULL, current_holder_id, 'INTAKE', storage_location, 'Seeded intake record'
FROM evidence
WHERE NOT EXISTS (
    SELECT 1 FROM chain_of_custody c WHERE c.evidence_id = evidence.evidence_id
);