-- Demo fixtures: run after 01_core, 02_evidence, 02b_transfer, 03_investigation, seed_core.
-- digest() is provided by pgcrypto; enable it explicitly for a reproducible fresh-database run.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Idempotent by deterministic SHA-256 / title keys. Uses seeded IDs 1..5 and cases 1..3.

INSERT INTO evidence_type(type_name, description) VALUES
 ('Disk Image', 'Forensic disk image'),
 ('Network Capture', 'Packet capture or network trace'),
 ('Email Archive', 'Mailbox or email evidence'),
 ('System Log', 'Operating-system or application log')
ON CONFLICT (type_name) DO NOTHING;

WITH demo(evidence_name, case_id, type_name, source, holder_id, storage_location, description) AS (
 VALUES
 ('Finance Server Image A',1,'Disk Image','Finance file server',4,'vault://case-1/disk-a','Bit-for-bit image of the affected finance server'),
 ('Finance Server Image B',1,'Disk Image','Backup server',4,'vault://case-1/disk-b','Backup disk image for comparison'),
 ('Ransom Note File',1,'System Log','Finance workstation',4,'vault://case-1/ransom-note','Ransom note recovered from endpoint'),
 ('C2 Network Capture',1,'Network Capture','Firewall export',4,'vault://case-1/pcap','Traffic capture showing suspicious command-and-control activity'),
 ('Payroll Audit Export',2,'System Log','Payroll database',5,'vault://case-2/audit','Database audit export around suspected changes'),
 ('Payroll Email Thread',2,'Email Archive','Finance mailbox',5,'vault://case-2/mail','Email archive related to payroll approvals'),
 ('Payroll Workstation Image',2,'Disk Image','Payroll workstation',5,'vault://case-2/disk','Workstation image for timeline review'),
 ('Phishing Sample 01',3,'Email Archive','Staff mailbox',4,'vault://case-3/mail-1','Suspected credential harvesting email'),
 ('Phishing Header Trace',3,'Network Capture','Mail gateway',4,'vault://case-3/headers','Mail gateway header and routing trace'),
 ('Endpoint Event Log',3,'System Log','Staff laptop',4,'vault://case-3/log','Endpoint event log during phishing campaign')
)
INSERT INTO evidence(case_id,evidence_type_id,evidence_name,description,source,collection_date,file_hash,storage_location,status,collected_by,current_holder_id)
SELECT d.case_id,t.evidence_type_id,d.evidence_name,d.description,d.source,now() - (row_number() over (order by d.evidence_name) * interval '1 hour'),
       encode(digest('team28-demo:' || d.evidence_name,'sha256'),'hex'),d.storage_location,'COLLECTED',d.holder_id,d.holder_id
FROM demo d JOIN evidence_type t ON t.type_name=d.type_name
ON CONFLICT (file_hash) DO NOTHING;

-- Add one intake custody event per demo evidence item if it has no history yet.
INSERT INTO chain_of_custody(evidence_id,from_user_id,to_user_id,action,location,remarks)
SELECT e.evidence_id,NULL,e.collected_by,'INTAKE',e.storage_location,'Initial demo intake; SHA-256 recorded'
FROM evidence e
WHERE e.file_hash IN (
 SELECT encode(digest('team28-demo:' || n,'sha256'),'hex') FROM (VALUES
 ('Finance Server Image A'),('Finance Server Image B'),('Ransom Note File'),('C2 Network Capture'),
 ('Payroll Audit Export'),('Payroll Email Thread'),('Payroll Workstation Image'),
 ('Phishing Sample 01'),('Phishing Header Trace'),('Endpoint Event Log')) AS x(n)
)
AND NOT EXISTS (SELECT 1 FROM chain_of_custody c WHERE c.evidence_id=e.evidence_id);

-- One investigation per seeded case.
INSERT INTO investigations(case_id,investigator_id,methodology)
SELECT x.case_id,x.investigator_id,x.methodology
FROM (VALUES
 (1,2,'DEMO: ransomware disk and network forensics'),
 (2,3,'DEMO: payroll database and email analysis'),
 (3,2,'DEMO: phishing email and endpoint triage')
) AS x(case_id,investigator_id,methodology)
WHERE NOT EXISTS (SELECT 1 FROM investigations i WHERE i.case_id=x.case_id AND i.methodology=x.methodology);

-- Attach two case-matched evidence items to each demo investigation.
INSERT INTO investigation_evidence(investigation_id,evidence_id)
SELECT i.investigation_id,e.evidence_id
FROM investigations i JOIN evidence e ON e.case_id=i.case_id
WHERE i.methodology LIKE 'DEMO:%'
  AND e.file_hash IN (
    encode(digest('team28-demo:' || CASE e.case_id WHEN 1 THEN 'Finance Server Image A' WHEN 2 THEN 'Payroll Audit Export' ELSE 'Phishing Sample 01' END,'sha256'),'hex'),
    encode(digest('team28-demo:' || CASE e.case_id WHEN 1 THEN 'C2 Network Capture' WHEN 2 THEN 'Payroll Email Thread' ELSE 'Phishing Header Trace' END,'sha256'),'hex')
  )
ON CONFLICT DO NOTHING;

INSERT INTO forensic_reports(investigation_id,report_title,report_content)
SELECT i.investigation_id,
       CASE i.case_id WHEN 1 THEN 'Ransomware preliminary analysis' WHEN 2 THEN 'Payroll fraud evidence review' ELSE 'Phishing campaign triage' END,
       CASE i.case_id
         WHEN 1 THEN 'Analysis of encrypted files, ransom note and network traffic identified indicators consistent with ransomware activity.'
         WHEN 2 THEN 'Review of payroll database audit events and email records identified suspicious changes requiring verification.'
         ELSE 'Email headers and endpoint events show a coordinated credential harvesting attempt.'
       END
FROM investigations i
WHERE i.methodology LIKE 'DEMO:%'
AND NOT EXISTS (SELECT 1 FROM forensic_reports r WHERE r.investigation_id=i.investigation_id);
