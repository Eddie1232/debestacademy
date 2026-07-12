# TODO: Fix admin login

- [x] Inspect server.js login route (/api/admin/login)
- [x] Inspect terms-calendar-admin.html login form JS
- [x] Inspect data.json admins
- [ ] Make login usable without DevTools by adding a visible error + show which request endpoint failed
- [ ] Add a “Test backend” button that calls /health and /api/terms-calendar to confirm connectivity
- [ ] Add fallback: if localStorage has an old token, verify it by calling /api/terms-calendar (and clear token on 401)

