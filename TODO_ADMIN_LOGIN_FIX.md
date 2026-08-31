# TODO: Fix admin login

- [x] Inspect server.js login route (/api/admin/login)
- [x] Inspect terms-calendar-admin.html login form JS
- [x] Inspect data.json admins
- [x] Make login usable without DevTools by adding a visible error + show which request endpoint failed
- [x] Add a “Test backend” button that calls /health and /api/terms-calendar to confirm connectivity
- [x] Add fallback: if localStorage has an old token, verify it through an authenticated request and clear it on 401/403
