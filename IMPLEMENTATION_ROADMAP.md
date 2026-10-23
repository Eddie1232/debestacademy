# Debest Academy / DataPulse AI implementation roadmap

This branch extends the existing public website and admin workflows rather than replacing them.

## Stage 1 — Preserve the current website and admin security
Implemented: existing public pages, admissions, role login, calendar/news/proposal workflows, and the server-side assistant remain in place.

## Stage 2 — CSV and Excel academic import
Implemented:
- Protected page: `/admin/academic-tools.html`.
- CSV and XLSX (first worksheet) support, up to 2 MB.
- Server-side preview, column/period validation, duplicate result detection, and import history.
- Transactional PostgreSQL writes.
- Schema in `sql-academic-schema.sql`.

## Stage 3 — KPI comparison and report cards
Implemented:
- Compare KG/Primary/JHS terms by academic year.
- Compare subject average percentages, pass rates, and percentage-point changes.
- Printable student report card with subject scores and percentages.
- The current pass-rate threshold is provisional at 50% of maximum score. Confirm the school's official grading policy before official reporting.

## Stage 4 — Student records and attendance
Implemented baseline:
- Student register, section/class, admission date, guardian contact, and active/inactive status.
- Daily class attendance for present, absent, late, and excused, saved transactionally.
- Staff permissions separate student/attendance access from finance-only access.

## Stage 5 — Fees and bursar workflows
Implemented baseline:
- Fee invoices, partial payments, receipt numbers, outstanding balances, and a fee ledger.
- Manager/Headmaster/Bursar can create invoices and record payments.
- Bursar role is seeded for development; set a strong `BURSAR_PASS` in `.env` before use.
- Still needed for a full accounting system: fee schedules, reversals/refunds, cashbook reconciliation, audited receipt reprints, and accounting exports. Payment rows should not be edited or deleted directly in production.

## Stage 6 — Analytics and DataPulse AI
Implemented baseline:
- Overview metrics for active students, results, attendance, and (for finance-authorized roles) outstanding fees.
- Aggregate subject, attendance, and fee metrics are sent server-side to OpenAI only when `OPENAI_API_KEY` is configured.
- A rules-based summary is used when AI is unavailable. AI output is advisory; it does not receive individual learner names or guardian details.
- Still needed: trend-aware recommendations by class/term, model evaluation, audit logs for AI recommendations, and school-approved grading rules.

## Stage 7 — Deployment and quality gates
Added:
- PostgreSQL schema command: `npm run db:academic-schema`.
- Automated tests and a GitHub Actions workflow.
- Setup and security notes in `README.md`.

Before production:
1. Run `npm install` to synchronize the PostgreSQL dependency and lockfile.
2. Configure a dedicated PostgreSQL database and strong unique secrets/passwords in `.env`.
3. Run `npm run db:academic-schema` and `npm test`.
4. Test CSV/XLSX imports, attendance, report cards, invoices, partial payments, role permissions, and backup restoration using synthetic data.
5. Back up both the existing lowdb JSON store and PostgreSQL; these are separate stores.
6. Review deployment logs and GitHub Actions status. The branch's automated workflow has not yet produced a successful run in the current environment.

## Current architecture boundary
Existing website/admin workflow data remains in the original lowdb JSON store. Academic results, student profile fields, attendance, and fee records use PostgreSQL. This is an incremental integration, not yet a single unified database. Do not import real student data until staging tests and backups are verified.
