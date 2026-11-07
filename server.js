// ---- Bootstrap role admins ----
// Ensures Secretary / Manager / Headmaster / SuperAdmin accounts exist (bcrypt hashes).
// Requires explicit environment variables; no hard-coded demo credentials are allowed.
async function ensureDefaultAdmins() {
  const d = await getDB();
  if (!Array.isArray(d.data.admins)) d.data.admins = [];

  const seed = [
    {
      id: 'sec-1',
      username: 'Secretary',
      role: 'Secretary',
      password: process.env.SECRETARY_PASS,
    },
    {
      id: 'mgr-1',
      username: 'Manager',
      role: 'Manager',
      password: process.env.MANAGER_PASS,
    },
    {
      id: 'hm-1',
      username: 'Headmaster',
      role: 'Headmaster',
      password: process.env.HEADMASTER_PASS,
    },
    {
      id: 'super-1',
      username: process.env.SUPERADMIN_USER || 'SuperAdmin',
      role: 'SuperAdmin',
      password: process.env.SUPERADMIN_PASS,
    },
    {
      id: 'admin-1',
      username: process.env.ADMIN_USER || 'admin',
      role: 'Headmaster',
      password: process.env.ADMIN_PASS,
    },
    {
      id: 'hm-comma',
      username: 'Comma',
      role: 'Headmaster',
      password: process.env.COMMA_PASS,
    },
  ];

  const missing = seed
    .filter((account) => !account.password || !String(account.password).trim())
    .map((account) => account.username);

  if (missing.length) {
    console.warn(
      'Skipping default admin bootstrap. Set the required admin credentials in .env before starting the server: ' +
        missing.join(', ')
    );
    return;
  }

  let changed = false;
  for (const account of seed) {
    const existing = d.data.admins.find((a) => a.username === account.username);
    if (!existing) {
      d.data.admins.push({
        id: account.id,
        username: account.username,
        role: account.role,
        passwordHash: bcrypt.hashSync(account.password, 10),
      });
      changed = true;
      console.log(`Admin account ready: ${account.username} (${account.role})`);
    } else {
      if (!existing.role) {
        existing.role = account.role;
        changed = true;
      }
      if (!existing.passwordHash) {
        existing.passwordHash = bcrypt.hashSync(account.password, 10);
        changed = true;
      }
    }
  }

  if (changed) await d.write();
}

// ---- Routes ----
