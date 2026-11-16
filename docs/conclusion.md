# Conclusion

The Digital Forensic Evidence Tracking and Case Management System records evidence from intake to report. Custodians register evidence with a server-computed SHA-256 hash, transfer it between handlers, and every change is written to an audit log. Investigators open cases, link evidence to investigations, and file forensic reports. Administrators review the audit trail.

The system uses two databases, each chosen for the data it holds. PostgreSQL stores records that must follow strict rules: foreign keys, CHECK constraints, unique file hashes, and an append-only chain of custody. MongoDB stores evidence metadata whose fields vary by evidence type, which a fixed SQL table would handle poorly.

The integrity guarantees were tested rather than assumed. Constraints rejected a self-transfer and an INTAKE with a sender. An update or delete on custody rows was blocked by a trigger, and by role privileges before the trigger ran. Concurrent transfers were serialised by `SELECT ... FOR UPDATE`, and uncommitted transfers were invisible to other sessions. Role checks in the API returned 401 and 403 where required.

For production, the system would need TLS on database connections, scheduled backups, an encrypted evidence vault, key management for the file store, and the application connecting with the restricted role rather than the superuser.