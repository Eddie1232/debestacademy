# Debest Academy / DataPulse AI implementation stages

This roadmap extends the existing website and admin workflows rather than replacing them.

## Stage 1 — Preserve current website and admin security
Keep existing public pages, admissions, role login, calendar/news/proposal workflows, and the server-side assistant.

## Stage 2 — Academic CSV import
- Staff page: /admin/academic-tools.html.
- CSV preview, 2 MB limit, required-value validation, and section/year/term defaults.
- Server validates before writing and imports within a PostgreSQL transaction.
- Import batches provide an audit history.
- Tables are defined in sql-academic-schema.sql.

## Stage 3 — KPI comparison
- Compare academic terms by KG/Primary/JHS and academic year.
- Compare subject average percentages and pass rates, plus percentage-point changes.
- Pass-rate threshold currently means scores at or above 50% of maximum; confirm this against the school's approved grading policy before live use.

## Stage 4 — Student records and attendance
Extend the academic student register with admission status, class, guardians, attendance sessions, and attendance marks. Add role-scoped APIs and resolve duplicate IDs before migration.

## Stage 5 — Examination, fees, and bursar workflows
Normalize assessments, grading rules, report cards, fee schedules, invoices, payments, balances, and receipts. Keep payment audit records immutable and limit financial write access to authorized bursar roles.

## Stage 6 — Analytics and DataPulse AI
Add verified attendance, fee, class/subject, and learner progress KPIs. Send only minimum necessary, appropriately de-identified aggregates to the server-side AI service. Keep recommendations advisory and traceable to source metrics.

## Stage 7 — Deployment and quality gates
Configure PostgreSQL, secrets, firewall, backups and restoration tests. Run automated tests and synthetic staging imports before real student data. Document LAN access, upgrades, and incident response.

## Scope boundary
This change adds academic CSV import and term comparison only. Attendance, fee accounting, full student management, and the complete DataPulse AI suite remain future stages.
