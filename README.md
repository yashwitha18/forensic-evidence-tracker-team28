# Digital Forensic Evidence Tracking and Case Management System

Team 28
- Ch Yashwitha (PES1UG24CS121)
- Chaithanya N (PES1UG24CS124)

DBMS Experiential Learning, Level 3 Project, PES University.

## Team Responsibilities

### Ch Yashwitha (PES1UG24CS121)
- Evidence management and evidence type classification.
- Chain of custody and evidence transfer.
- MongoDB evidence metadata and aggregation.
- Evidence intake and custody interface.

### Chaithanya N (PES1UG24CS124)
- Core database: USERS, CASES and AUDIT_LOGS.
- Authentication and role-based authorization.
- Case management and investigation workflows.
- Forensic reports and full-text search.
- Audit logging and case dashboard.

## Setup

Prerequisites: Node.js 20+, PostgreSQL (with psql on PATH), MongoDB running locally.

1. Clone and install:
   ```powershell
   git clone https://github.com/yashwitha18/forensic-evidence-tracker-team28.git
   cd forensic-evidence-tracker-team28
   npm install
   ```

2. Create `.env.local` in the project root (never commit it):
   ```
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/forensic_test
   MONGODB_URI=mongodb://localhost:27017/forensic
   JWT_SECRET=a-random-string-of-at-least-32-characters
   ```
   If your password contains special characters, URL-encode them (for example `@` becomes `%40`).

3. Build the database, in this order (set `PGPASSWORD` first to avoid repeated prompts):
   ```powershell
   $env:PGPASSWORD = "YOUR_PASSWORD"
   psql -U postgres -c "CREATE DATABASE forensic_test;"
   psql -U postgres -d forensic_test -f db/01_core.sql
   psql -U postgres -d forensic_test -f db/seed_core.sql
   psql -U postgres -d forensic_test -f db/02_evidence.sql
   psql -U postgres -d forensic_test -f db/seed_evidence.sql
   psql -U postgres -d forensic_test -f db/02b_transfer.sql
   psql -U postgres -d forensic_test -f db/03_investigation.sql
   psql -U postgres -d forensic_test -f db/seed_demo.sql
   ```
   `db/ddl_demo.sql` and `db/performance_demo.sql` are demos only. Don't run them during setup.

4. Start the app:
   ```powershell
   npm run dev
   ```
   Open http://localhost:3000.

Demo accounts (password `Passw0rd!`): admin@forensics.local (ADMIN), ravi@forensics.local and meera@forensics.local (INVESTIGATOR), kiran@forensics.local and divya@forensics.local (CUSTODIAN).

Custody transfers and evidence intake require CUSTODIAN. Evidence files are stored in `vault/`, which is git-ignored.