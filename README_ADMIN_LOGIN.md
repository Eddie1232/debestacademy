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

One host PC runs `npm start`. Secretary, Manager, Headmaster, and Super Admin computers open the same site URL in a browser and sign in with their own accounts. All data is shared in PostgreSQL on the host.

**SuperAdmin** is for technical recovery only: reset the three school admins’ usernames/passwords, view server health, and download a PostgreSQL data backup. SuperAdmin cannot edit calendar, news, proposals, or applications.

## URLs

| Page                  | Path                                  |
| --------------------- | ------------------------------------- |
| Public website        | `/debest.html`                        |
| Staff login           | `/admin/login.html` or `/admin/login` |
| Secretary dashboard   | `/admin/secretary.html`               |
| Manager dashboard     | `/admin/manager.html`                 |
| Headmaster dashboard  | `/admin/headmaster.html`              |
| Super Admin dashboard | `/admin/superadmin.html`              |

## Required credentials

Set strong credentials in `.env` before starting the server. Do not use demo or default passwords in a production environment.

| Variable | Role |
| --- | --- |
| `SECRETARY_PASS` | Secretary |
| `MANAGER_PASS` | Manager |
| `HEADMASTER_PASS` | Headmaster |
| `SUPERADMIN_USER` | SuperAdmin username |
| `SUPERADMIN_PASS` | SuperAdmin password |
| `ADMIN_USER` | Legacy admin username |
| `ADMIN_PASS` | Legacy admin password |
| `COMMA_PASS` | Legacy/alternate admin password |

The app creates these accounts only when the matching environment variables are provided. Passwords are stored as bcrypt hashes in PostgreSQL and are not embedded in the frontend.

## School LAN setup

1. On the host computer (always-on office PC):

   ```bash
   cd /path/to/debestacademy
   npm install
   npm start
   ```

2. Find the host LAN IP (example: `192.168.1.50`):

   ```bash
   hostname -I
   ```

3. Allow TCP port `5501` through the host firewall if needed.

4. On each admin PC browser, open:

   ```text
   http://192.168.1.50:5501/debest.html
   http://192.168.1.50:5501/admin/login.html
   ```

Do not run three separate servers on three PCs; data will not stay in sync.

## API

- `POST /api/admin/login` → `{ token, role, username, dashboard }`
- Protected admin routes require `Authorization: Bearer <token>`
- Optional `ADMIN_IP_ALLOWLIST` restricts admin API calls to listed IPs

### SuperAdmin-only

| Method | Path                    | Purpose                                                             |
| ------ | ----------------------- | ------------------------------------------------------------------- |
| `GET`  | `/api/super/admins`     | List managed role accounts (without password hashes) |
| `PUT`  | `/api/super/admins/:id` | Update username and/or password for a managed role account      |
| `GET`  | `/api/super/health`     | Server uptime, host/port, record counts                             |
| `GET`  | `/api/super/backup`     | Download full `data.json` backup                                    |

## Resetting a password

Preferred: sign in as SuperAdmin and use the Super Admin dashboard to set a new username/password.

Manual recovery (for example, if SuperAdmin is locked out):

1. Stop the server.
2. Generate a bcrypt hash (Node):

   ```bash
   node -e "console.log(require('bcryptjs').hashSync('YourNewPassword', 10))"
   ```

3. Put the hash in `data.json` under the admin's `passwordHash`.
4. Restart the server.
