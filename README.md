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

4. Copy `.env.example` to `.env`, then set strong admin credentials and a secure `JWT_SECRET`.

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

Public pages include a floating DEBEST Assistant for admissions, hours, contact details, and other school questions.

- The widget posts to `/api/assistant`. The API key stays on the server.
- Set `OPENAI_API_KEY` on the server to enable AI-generated answers through OpenAI. Optional: set `OPENAI_MODEL` to choose a model (default: `grok-4.5`).
- If no key is set, or the model is unreachable, the assistant still answers from the school FAQ knowledge on this site.

## Admin credentials and environment

Do not use default or demo credentials in production. Configure strong, unique values in `.env` before starting the server.

| Variable | Purpose |
| --- | --- |
| `SECRETARY_PASS` | Secretary account password |
| `MANAGER_PASS` | Manager account password |
| `HEADMASTER_PASS` | Headmaster account password |
| `SUPERADMIN_USER` | SuperAdmin username |
| `SUPERADMIN_PASS` | SuperAdmin password |
| `ADMIN_USER` | Legacy admin username |
| `ADMIN_PASS` | Legacy admin password |
| `COMMA_PASS` | Legacy/alternate admin password |
| `JWT_SECRET` | JWT signing secret |

The server creates these admin accounts only if the relevant environment variables are set. Never commit real credentials to GitHub or store them in public files.

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

### Admin API (summary)

- `POST /api/admin/login` → `{ token, role, username, dashboard }`
- `GET /api/terms-calendar` and `PUT /api/terms-calendar` (direct PUT: Headmaster)
- `GET/POST/PUT /api/proposals` — Secretary → Manager → Headmaster workflow
- `GET/PUT /api/applications` — public submit; admin inbox
- `GET /api/dashboard` — role summary cards
- SuperAdmin: `GET /api/super/admins`, `GET /api/super/health`, `GET /api/super/backup`

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
