-- Demo data for USERS and CASES.  Demo password for every account: Passw0rd!
-- (crypt(...,gen_salt('bf')) makes bcrypt hashes that the Node "bcrypt" package verifies.)
INSERT INTO users(name,email,password_hash,role,phone) VALUES
 ('Asha Admin',        'admin@forensics.local', crypt('Passw0rd!', gen_salt('bf',10)), 'ADMIN',        '9000000001'),
 ('Ravi Investigator', 'ravi@forensics.local',  crypt('Passw0rd!', gen_salt('bf',10)), 'INVESTIGATOR', '9000000002'),
 ('Meera Investigator','meera@forensics.local', crypt('Passw0rd!', gen_salt('bf',10)), 'INVESTIGATOR', '9000000003'),
 ('Kiran Custodian',   'kiran@forensics.local', crypt('Passw0rd!', gen_salt('bf',10)), 'CUSTODIAN',    '9000000004'),
 ('Divya Custodian',   'divya@forensics.local', crypt('Passw0rd!', gen_salt('bf',10)), 'CUSTODIAN',    '9000000005');

INSERT INTO cases(title, description, case_type, priority, created_by) VALUES
 ('Ransomware at Finance Dept', 'Encrypted file servers, ransom note found', 'MALWARE', 'CRITICAL', 2),
 ('Payroll fraud suspicion',    'Unauthorised changes to payroll database',   'FRAUD',   'HIGH',     3),
 ('Phishing campaign analysis', 'Credential harvesting e-mails to staff',     'DATA_BREACH','MEDIUM', 2);
