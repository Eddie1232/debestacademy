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

## Fees & payments and the Business Pulse tracker

Staff (Secretary, Manager, Headmaster) can open **Fees & payments** from the dashboard
(`/admin/fees.html`) to record fees received and expenses paid.

- Every entry gets a receipt number: `RCT-YYYYMMDD-NNN` for fees, `EXP-YYYYMMDD-NNN` for expenses.
- Entries are never deleted. A Manager or Headmaster can **void** an entry with a reason;
  the original stays visible and is excluded from totals.
- Search, filter by month or type, and download a CSV (safe to open in Excel).
- Entries are stored in the `ledger` list inside `data.json`. Back this file up regularly.

### Connecting the tracker

Set two environment variables before starting the server (Node does not read `.env`
automatically; use `node --env-file=.env server.js` or set them in your host's settings):

```bash
BUSINESS_PULSE_URL=https://<your-published-tracker>/api/ingest
BUSINESS_PULSE_KEY=<Website API key from the tracker's Connect page>
```

What is sent to the tracker:

| Website action | Sent as |
| --- | --- |
| Fee recorded | Money in, category = purpose, customer = payer, notes = student + class |
| Expense recorded | Money out, category = purpose, supplier = payee |
| Entry voided | An opposite movement tagged `void` (the tracker keeps both, so the books stay auditable) |
| Application submitted | Activity event with applicant name and class/position only |
| Application status change | Activity event with the new status and staff role |

No dates of birth, phone numbers, emails, addresses or health details leave the school server.
Each item carries a stable `eventId`, so retries never create duplicates. If the tracker is
offline, items wait in memory and are retried (5s, 30s, 2m, then every 10m). Items still
waiting when the server restarts are lost from the tracker but remain in `data.json`.
The fees page shows whether the tracker is connected.

### Private files

The server serves the project folder for the public pages, so `private-files.js` blocks
browsers from downloading `data.json`, backend `.js` files, `package.json`, `tests/`,
`node_modules/`, dotfiles and Markdown docs. If you add a new server-only file, list it there.

## Testing

The proposal workflow logic is covered by Node's built-in test runner.

Run all tests with:

```bash
npm test
```

## Notes

- The server serves the project root as static content, so pages such as `debest.html` and `photo.html` are available directly.
- If port `5501` is already in use, set a different port with `PORT=8080 npm start`.
- The app stores its shared data in PostgreSQL. `data.json` is retained only as a one-time migration source.

## Contributing

Contributions are welcome. If you make changes, please keep the documentation updated and make sure any new behavior is covered by tests where possible.
