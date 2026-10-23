# DEBEST ACADEMY Website

DEBEST Academy is a school website project with a public-facing front end and a lightweight admin backend for managing calendar events, news updates, and proposal approvals.

## Overview

The project combines:

- static school pages such as the home page, admissions, gallery, PTA, parent/student platforms, and contact information
- an Express server for serving those pages and exposing JSON APIs
- a simple admin workflow for managing term-calendar updates and proposal review

## Tech Stack

- HTML, CSS, and JavaScript for the website UI
- Node.js, Express, and TypeScript for the local server and APIs
- JWT, bcrypt, and cookie support for admin authentication
- PostgreSQL for persistent shared school data

## Prerequisites

- Node.js 18+ recommended
- npm
- PostgreSQL 16+ (or Docker Desktop)

## Getting Started

1. Clone the repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start PostgreSQL. With Docker:

   ```bash
   docker compose up -d postgres
   ```

4. Copy `.env.example` to `.env`, then set a secure `JWT_SECRET` and the PostgreSQL password.

5. Import the existing school data once (new installations can skip this):

   ```bash
   DATABASE_URL=postgresql://debest:change-this-password@localhost:5432/debest_academy npm run db:migrate-json
   ```

6. Start the TypeScript server:

   ```bash
   npm start
   ```

7. Open the site in your browser at:

   ```text
   http://localhost:5501/debest.html
   ```

You can also run the server in development mode with:

```bash
npm run dev
```

## Website assistant

Public pages include a floating **DEBEST Assistant** for admissions, hours, contact details, and other school questions.

- The widget posts to `/api/assistant`. The API key stays on the server.
- Set `OPENAI_API_KEY` on the server to enable AI-generated answers through OpenAI. Optional: set `OPENAI_MODEL` to choose a model (default: `gpt-5.6-luna`).
- If no key is set, or the model is unreachable, the assistant still answers from the school FAQ knowledge on this site.

## Project Structure

```text
.
├── admin/                  # Admin dashboard pages
├── student/                # Student and parent-facing pages
├── tests/                  # Node.js test files
├── scripts/                # PostgreSQL migration utilities
├── debest.html             # Main public homepage
├── debest.css              # Main stylesheet
├── debest.js               # Frontend scripts
├── assistant.js            # Public AI assistant chat widget
├── assistant-service.js    # Assistant API, school knowledge, and FAQ fallback
├── proposal-workflow.js    # Proposal status and calendar update logic
├── server.ts               # TypeScript Express server and REST API
├── docker-compose.yml      # Local PostgreSQL service
├── package.json            # npm scripts and dependencies
└── README.md               # Project documentation
```

## Public site + three admin dashboards (school LAN)

```text
                School Website
                      │
        ┌─────────────┴─────────────┐
        │                           │
   Public Website              Admin Login
(Home, About, Contact)      (/admin/login)
                                      │
                  ┌───────────┬────────────┬────────────┐
                  │           │            │
             Secretary     Manager    Headmaster
              Dashboard    Dashboard   Dashboard
```

**One host computer** runs the Node server and PostgreSQL. The other two admin PCs only use a browser. Everyone opens the same host URL so applications, proposals, and calendar data stay shared in PostgreSQL.

### Staff URLs

| Page             | Path                     |
| ---------------- | ------------------------ |
| Public site      | `/debest.html`           |
| Staff login      | `/admin/login.html`      |
| Secretary        | `/admin/secretary.html`  |
| Manager          | `/admin/manager.html`    |
| Headmaster       | `/admin/headmaster.html` |
| Super Admin (IT) | `/admin/superadmin.html` |

### Demo login credentials

| Username     | Password        | Role                                          |
| ------------ | --------------- | --------------------------------------------- |
| `Secretary`  | `Secretary123`  | Secretary                                     |
| `Manager`    | `Manager123`    | Manager                                       |
| `Headmaster` | `Headmaster123` | Headmaster                                    |
| `SuperAdmin` | `SuperAdmin123` | SuperAdmin (IT — credentials + tech ops only) |
| `admin`      | `Admin123`      | Headmaster (legacy)                           |

Passwords are bcrypt-hashed in PostgreSQL (not stored in the frontend). See [README_ADMIN_LOGIN.md](README_ADMIN_LOGIN.md) for LAN setup and password resets.

### Admin API (summary)

- `POST /api/admin/login` → `{ token, role, username, dashboard }`
- `GET /api/terms-calendar` and `PUT /api/terms-calendar` (direct PUT: Headmaster)
- `GET/POST/PUT /api/proposals` — Secretary → Manager → Headmaster workflow
- `GET/PUT /api/applications` — public submit; admin inbox
- `GET /api/dashboard` — role summary cards
- SuperAdmin: `GET/PUT /api/super/admins`, `GET /api/super/health`, `GET /api/super/backup`

### School network checklist

1. Host PC: `npm start` (listens on `0.0.0.0:5501` by default).
2. Note host IP: `hostname -I`.
3. Open firewall TCP **5501** on the host if needed.
4. From each admin PC: `http://HOST_IP:5501/admin/login.html`
5. Optional: set `JWT_SECRET` and `ADMIN_IP_ALLOWLIST` (see `.env.example`).

## Testing

The proposal workflow logic is covered by Node's built-in test runner.

Run the tests with:

```bash
node --test tests/proposal-workflow.test.js
```

## Notes

- The server serves the project root as static content, so pages such as `debest.html` and `photo.html` are available directly.
- If port `5501` is already in use, set a different port with `PORT=8080 npm start`.
- The app stores its shared data in PostgreSQL. `data.json` is retained only as a one-time migration source.

## Contributing

Contributions are welcome. If you make changes, please keep the documentation updated and make sure any new behavior is covered by tests where possible.



## School Operations, Attendance, Fees, and DataPulse Insights

The same feature branch also adds the staff workspace at `/admin/school-operations.html`. It provides:
- Student register with search, school section, class, guardian contact, admission date, and status.
- Daily class attendance marks (present, absent, late, excused) with transactional saves.
- Fee invoices, partial payments, receipt numbers, and outstanding-balance calculations.
- An aggregate insights endpoint. If `OPENAI_API_KEY` is configured, DataPulse AI generates a summary from aggregate school metrics only; otherwise a rules-based summary is shown.
- A dedicated Bursar login role. Set `BURSAR_USER` and a strong `BURSAR_PASS` in `.env` before use. The development fallback password is `Bursar123`; replace it immediately. Bursars can work with fee records but cannot access student guardian details or attendance pages.

### Database and setup

The schema file now includes academic results, student profile extensions, attendance, invoices, and payments. From Ubuntu, after configuring `DATABASE_URL` and installing PostgreSQL:
1. Run `npm install` to synchronize the new PostgreSQL dependency and lockfile.
2. Run `npm run db:academic-schema`.
3. Run `npm test`.
4. Start with `npm start` and sign in with an authorized staff account.

The app currently stores existing website/admin workflow data in its original lowdb JSON store while academic, attendance, and finance data use PostgreSQL. These stores are separate; plan and test backups for both. Do not use real student data until schema setup, access permissions, and backups have been validated.

### Security and operational boundaries

- Academic CSV import is restricted to Manager and Headmaster; Secretary can view comparisons.
- Student and attendance records are accessible to Secretary, Manager, and Headmaster.
- Invoice creation and payment recording are restricted to Manager, Headmaster, and Bursar.
- The current pass-rate KPI threshold is 50% of the assessment maximum and must be aligned with the school's official grading policy.
- DataPulse AI uses aggregate metrics, not individual learner records. Its recommendations are advisory and should be reviewed by school leadership.
- A bursar account is seeded for development. Configure a unique strong password before production and review all seeded admin credentials.

## DataPulse AI Academic Tools

A protected staff page is available at `/admin/academic-tools.html` for CSV assessment imports and term-to-term KPI comparisons. Access is limited to authorized Manager and Headmaster roles.

### Configure the academic database

1. Set `DATABASE_URL` in your local `.env` file to a PostgreSQL database. Never commit real credentials.
2. Install dependencies with `npm install` (this updates `package-lock.json` for the PostgreSQL driver).
3. Apply the schema: `npm run db:academic-schema`.
4. Start the app: `npm start`.
5. Sign in as an authorized staff member and open `http://localhost:5501/admin/academic-tools.html`.

The CSV must contain `student_id,student_name,subject,score`. Optional columns include `school_section,class_name,academic_year,term,max_score`. The maximum upload size is 2 MB. Imports are validated before writes and run in a PostgreSQL transaction. Existing results for the same student, year, term, and subject are updated.

### KPI calculation

The comparison reports subject average percentages, pass rates, and changes in percentage points for two selected terms. The current pass-rate threshold is 50% of the assessment maximum; confirm this policy with the school's approved grading scheme before using it for official reporting.

### Safety before production

Apply and test the schema in a staging database first. Back up PostgreSQL, run `npm test`, and test with synthetic student records before importing real learner data. These tools do not yet implement the separate attendance, fee accounting, or complete student-management stages; see `IMPLEMENTATION_ROADMAP.md`.
