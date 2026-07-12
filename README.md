# DEBEST ACADEMY Website

DEBEST Academy is a school website project with a public-facing front end and a lightweight admin backend for managing calendar events, news updates, and proposal approvals.

## Overview

The project combines:

- static school pages such as the home page, admissions, gallery, PTA, parent/student platforms, and contact information
- an Express server for serving those pages and exposing JSON APIs
- a simple admin workflow for managing term-calendar updates and proposal review

## Tech Stack

- HTML, CSS, and JavaScript for the website UI
- Node.js and Express for the local server and APIs
- JWT, bcrypt, and cookie support for admin authentication
- lowdb for file-based JSON storage

## Prerequisites

- Node.js 18+ recommended
- npm

## Getting Started

1. Clone the repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the server:

   ```bash
   npm start
   ```

4. Open the site in your browser at:

   ```text
   http://localhost:5500/debest.html
   ```

You can also run the server in development mode with:

```bash
npm run dev
```

## Project Structure

```text
.
├── admin/                  # Admin dashboard pages
├── student/                # Student and parent-facing pages
├── tests/                  # Node.js test files
├── data.json               # File-based app data store
├── debest.html             # Main public homepage
├── debest.css              # Main stylesheet
├── debest.js               # Frontend scripts
├── proposal-workflow.js    # Proposal status and calendar update logic
├── server.js               # Express server and REST API
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

**One host computer** runs the Node server. The other two admin PCs only use a browser. Everyone opens the same host URL so applications, proposals, and calendar data stay shared in `data.json`.

### Staff URLs

| Page | Path |
|------|------|
| Public site | `/debest.html` |
| Staff login | `/admin/login.html` |
| Secretary | `/admin/secretary.html` |
| Manager | `/admin/manager.html` |
| Headmaster | `/admin/headmaster.html` |

### Demo login credentials

| Username | Password | Role |
|----------|----------|------|
| `Secretary` | `Secretary123` | Secretary |
| `Manager` | `Manager123` | Manager |
| `Headmaster` | `Headmaster123` | Headmaster |
| `admin` | `Admin123` | Headmaster (legacy) |

Passwords are bcrypt-hashed in `data.json` (not stored in the frontend). See [README_ADMIN_LOGIN.md](README_ADMIN_LOGIN.md) for LAN setup and password resets.

### Admin API (summary)

- `POST /api/admin/login` → `{ token, role, username, dashboard }`
- `GET /api/terms-calendar` and `PUT /api/terms-calendar` (direct PUT: Headmaster)
- `GET/POST/PUT /api/proposals` — Secretary → Manager → Headmaster workflow
- `GET/PUT /api/applications` — public submit; admin inbox
- `GET /api/dashboard` — role summary cards

### School network checklist

1. Host PC: `npm start` (listens on `0.0.0.0:5500` by default).
2. Note host IP: `hostname -I`.
3. Open firewall TCP **5500** on the host if needed.
4. From each admin PC: `http://HOST_IP:5500/admin/login.html`
5. Optional: set `JWT_SECRET` and `ADMIN_IP_ALLOWLIST` (see `.env.example`).

## Testing

The proposal workflow logic is covered by Node's built-in test runner.

Run the tests with:

```bash
node --test tests/proposal-workflow.test.js
```

## Notes

- The server serves the project root as static content, so pages such as `debest.html` and `photo.html` are available directly.
- If port `5500` is already in use, set a different port with `PORT=8080 npm start`.
- The app uses a JSON file as its data store, so changes made through the UI are stored locally in `data.json`.

## Contributing

Contributions are welcome. If you make changes, please keep the documentation updated and make sure any new behavior is covered by tests where possible.
