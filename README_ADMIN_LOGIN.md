# Admin login (Debest Academy)

## Architecture

```text
Public site (debest.html)  →  Staff login (/admin/login.html)
                                      │
          ┌───────────────┬───────────┼───────────┬────────────────┐
          ▼               ▼           ▼           ▼                ▼
      Secretary       Manager    Headmaster   SuperAdmin
      dashboard       dashboard  dashboard    dashboard (IT only)
```

One host PC runs `npm start`. Secretary, Manager, Headmaster, and Super Admin computers open the **same** site URL in a browser and sign in with their own accounts. All data is shared in `data.json` on the host.

**SuperAdmin** is for technical recovery only: reset the three school admins’ usernames/passwords, view server health, and download a `data.json` backup. SuperAdmin **cannot** edit calendar, news, proposals, or applications.

## URLs

| Page | Path |
|------|------|
| Public website | `/debest.html` |
| Staff login | `/admin/login.html` or `/admin/login` |
| Secretary dashboard | `/admin/secretary.html` |
| Manager dashboard | `/admin/manager.html` |
| Headmaster dashboard | `/admin/headmaster.html` |
| Super Admin dashboard | `/admin/superadmin.html` |

## Demo credentials (change in production)

| Username | Password | Role |
|----------|----------|------|
| `Secretary` | `Secretary123` | Secretary |
| `Manager` | `Manager123` | Manager |
| `Headmaster` | `Headmaster123` | Headmaster |
| `SuperAdmin` | `SuperAdmin123` | SuperAdmin (IT) |
| `admin` | `Admin123` | Headmaster (legacy) |
| `Comma` | `comma4711` | Headmaster (legacy) |

Optional env overrides for Super Admin: `SUPERADMIN_USER`, `SUPERADMIN_PASS` (applied only when the account is first created).

Passwords are stored as bcrypt hashes in `data.json`. They are **not** embedded in the frontend.

## School LAN setup

1. On the **host** computer (always-on office PC):

   ```bash
   cd /path/to/debestacademy
   npm install
   npm start
   ```

2. Find the host LAN IP (example: `192.168.1.50`):

   ```bash
   hostname -I
   ```

3. Allow TCP port **5500** through the host firewall if needed.

4. On each admin PC browser, open:

   ```text
   http://192.168.1.50:5500/debest.html
   http://192.168.1.50:5500/admin/login.html
   ```

Do **not** run three separate servers on three PCs — data will not stay in sync.

## API

- `POST /api/admin/login` → `{ token, role, username, dashboard }`
- Protected admin routes require `Authorization: Bearer <token>`
- Optional `ADMIN_IP_ALLOWLIST` restricts admin API calls to listed IPs

### SuperAdmin-only

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/super/admins` | List Secretary / Manager / Headmaster accounts (no password hashes) |
| `PUT` | `/api/super/admins/:id` | Update `username` and/or `password` for a managed role account |
| `GET` | `/api/super/health` | Server uptime, host/port, record counts |
| `GET` | `/api/super/backup` | Download full `data.json` backup |

## Resetting a password

**Preferred:** sign in as SuperAdmin → Super Admin dashboard → set a new username/password for Secretary, Manager, or Headmaster.

**Manual (e.g. SuperAdmin itself locked out):**

1. Stop the server.
2. Generate a bcrypt hash (Node):

   ```bash
   node -e "console.log(require('bcryptjs').hashSync('YourNewPassword', 10))"
   ```

3. Put the hash in `data.json` under the admin’s `passwordHash`.
4. Restart the server.
