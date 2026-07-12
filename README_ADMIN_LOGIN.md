# Admin login (Debest Academy)

## Architecture

```text
Public site (debest.html)  →  Staff login (/admin/login.html)
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              Secretary          Manager          Headmaster
              dashboard          dashboard        dashboard
```

One host PC runs `npm start`. Secretary, Manager, and Headmaster computers open the **same** site URL in a browser and sign in with their own accounts. All data is shared in `data.json` on the host.

## URLs

| Page | Path |
|------|------|
| Public website | `/debest.html` |
| Staff login | `/admin/login.html` or `/admin/login` |
| Secretary dashboard | `/admin/secretary.html` |
| Manager dashboard | `/admin/manager.html` |
| Headmaster dashboard | `/admin/headmaster.html` |

## Demo credentials (change in production)

| Username | Password | Role |
|----------|----------|------|
| `Secretary` | `Secretary123` | Secretary |
| `Manager` | `Manager123` | Manager |
| `Headmaster` | `Headmaster123` | Headmaster |
| `admin` | `Admin123` | Headmaster (legacy) |
| `Comma` | `comma4711` | Headmaster (legacy) |

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

## Resetting a password

1. Stop the server.
2. Generate a bcrypt hash (Node):

   ```bash
   node -e "console.log(require('bcryptjs').hashSync('YourNewPassword', 10))"
   ```

3. Put the hash in `data.json` under the admin’s `passwordHash`.
4. Restart the server.
