const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {
  PROPOSAL_STATUSES,
  getNextStatus,
  applyProposalToEvents,
  applyProposalToNews,
  syncApprovedCalendarEvents,
  calendarEventsEqual
} = require('./proposal-workflow');

const app = express();

// Helmet defaults break this school site on plain HTTP LAN:
// - CSP script-src 'self' blocks inline <script> used by login/admin pages
// - upgrade-insecure-requests forces HTTPS (no TLS on typical school host)
// - HSTS is inappropriate without HTTPS
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      frameSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
      connectSrc: ["'self'"],
      // Do NOT set upgradeInsecureRequests — host is HTTP on the school LAN
    }
  },
  hsts: false
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ---- Config ----
const PORT = Number(process.env.PORT) || 5500;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PROD';
const ADMIN_IP_ALLOWLIST = (process.env.ADMIN_IP_ALLOWLIST || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (JWT_SECRET === 'CHANGE_ME_IN_PROD') {
  console.warn('[security] JWT_SECRET is using the default value. Set JWT_SECRET in the environment for production/LAN use.');
}

// Simple file-based storage using lowdb
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// Ensure lowdb has a default dataset to avoid startup errors
// (the JSON file may not exist on first run)
const DEFAULT_DB_DATA = {
  admins: [],
  termCalendar: { events: {} },
  news: { items: [] },
  proposals: [],
  applications: [],
  messages: []
};

const dbFile = path.join(__dirname, 'data.json');
const adapter = new JSONFile(dbFile);
const db = new Low(adapter, DEFAULT_DB_DATA);



/**
 * Ensure finally-approved calendar proposals are present in the shared term calendar
 * that every site calendar (student, parent, news embed, admin) reads.
 * Returns true when the stored calendar was updated.
 */
function ensureApprovedCalendarPublished(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.termCalendar) data.termCalendar = { events: {} };
  if (!data.termCalendar.events || typeof data.termCalendar.events !== 'object') {
    data.termCalendar.events = {};
  }

  const merged = syncApprovedCalendarEvents(data.termCalendar.events, data.proposals || []);
  if (calendarEventsEqual(data.termCalendar.events, merged)) return false;

  data.termCalendar = { events: merged };
  return true;
}

async function getDB() {
  await db.read();
  if (!db.data) db.data = structuredClone(DEFAULT_DB_DATA);
  if (!db.data.termCalendar) db.data.termCalendar = { events: {} };
  if (!db.data.news) db.data.news = { items: [] };
  if (!db.data.admins) db.data.admins = [];
  if (!db.data.proposals) db.data.proposals = [];
  if (!Array.isArray(db.data.applications)) db.data.applications = [];
  if (!Array.isArray(db.data.messages)) db.data.messages = [];

  if (Array.isArray(db.data.proposals)) {
    db.data.proposals.forEach((proposal) => normalizeProposal(proposal));
  }

  // Heal drift: past final approvals that never landed in termCalendar
  // (or were wiped by a later direct calendar edit) are re-published here.
  if (ensureApprovedCalendarPublished(db.data)) {
    await db.write();
  }

  return db;
}


function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function roleRequired(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not allowed for your role' });
    }
    return next();
  };
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '';
}

function adminIpAllowed(req, res, next) {
  if (!ADMIN_IP_ALLOWLIST.length) return next();
  const ip = clientIp(req).replace(/^::ffff:/, '');
  if (ADMIN_IP_ALLOWLIST.includes(ip) || ADMIN_IP_ALLOWLIST.includes(clientIp(req))) {
    return next();
  }
  return res.status(403).json({ error: 'Admin access not allowed from this network address' });
}

// Simple in-memory login rate limit: 10 attempts / 15 minutes per IP
const loginAttempts = new Map();
function loginRateLimit(req, res, next) {
  const ip = clientIp(req);
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 10;
  const entry = loginAttempts.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  loginAttempts.set(ip, entry);
  if (entry.count > maxAttempts) {
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }
  return next();
}

const ROLE_DASHBOARD = {
  Secretary: '/admin/secretary.html',
  Manager: '/admin/manager.html',
  Headmaster: '/admin/headmaster.html',
  SuperAdmin: '/admin/superadmin.html'
};

/** Operational school staff roles (not SuperAdmin / IT). */
const SCHOOL_STAFF_ROLES = ['Secretary', 'Manager', 'Headmaster'];
const MANAGED_ADMIN_ROLES = ['Secretary', 'Manager', 'Headmaster'];

function schoolStaffRequired(req, res, next) {
  if (!req.user || !SCHOOL_STAFF_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Not allowed for your role' });
  }
  return next();
}

function addProposalHistoryEntry(proposal, actor, action, message) {
  const history = Array.isArray(proposal.history) ? proposal.history : [];
  history.push({
    action,
    actor: actor || 'System',
    message,
    at: new Date().toISOString()
  });
  proposal.history = history;
}

function summarizeProposal(proposal) {
  return {
    id: proposal.id,
    title: proposal.event?.title || 'Untitled item',
    category: proposal.category || 'calendar',
    status: proposal.status,
    createdBy: proposal.createdBy,
    reviewedBy: proposal.reviewedBy,
    assignedTo: proposal.assignedTo || 'Manager',
    priority: proposal.priority || 'Medium',
    notes: proposal.notes || '',
    event: proposal.event,
    updatedAt: proposal.updatedAt || proposal.createdAt,
    comments: Array.isArray(proposal.comments) ? proposal.comments.slice(-4) : [],
    history: Array.isArray(proposal.history) ? proposal.history.slice(-4) : []
  };
}

function normalizeProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') return;

  const validCategories = ['news', 'policy', 'communication', 'resource', 'calendar'];
  if (!validCategories.includes(proposal.category)) {
    proposal.category = 'calendar';
  }

  const validAssignees = ['Manager', 'Headmaster', 'Secretary', 'Completed'];
  if (!validAssignees.includes(proposal.assignedTo)) {
    proposal.assignedTo = proposal.status === PROPOSAL_STATUSES.FINAL_APPROVED ? 'Completed' : 'Manager';
  }

  if (!['Low', 'Medium', 'High'].includes(proposal.priority)) {
    proposal.priority = 'Medium';
  }

  if (!Array.isArray(proposal.comments)) {
    proposal.comments = [];
  }

  if (!Array.isArray(proposal.history)) {
    proposal.history = [];
  }

  if (!proposal.createdAt) {
    proposal.createdAt = new Date().toISOString();
  }

  if (!proposal.updatedAt) {
    proposal.updatedAt = proposal.createdAt;
  }
}

// ---- Bootstrap role admins ----
// Ensures Secretary / Manager / Headmaster / SuperAdmin accounts exist (bcrypt hashes).
// CHANGE passwords via env vars for production.
async function ensureDefaultAdmins() {
  const d = await getDB();
  if (!Array.isArray(d.data.admins)) d.data.admins = [];

  const seed = [
    {
      id: 'sec-1',
      username: 'Secretary',
      role: 'Secretary',
      password: process.env.SECRETARY_PASS || 'Secretary123'
    },
    {
      id: 'mgr-1',
      username: 'Manager',
      role: 'Manager',
      password: process.env.MANAGER_PASS || 'Manager123'
    },
    {
      id: 'hm-1',
      username: 'Headmaster',
      role: 'Headmaster',
      password: process.env.HEADMASTER_PASS || 'Headmaster123'
    },
    {
      id: 'super-1',
      username: process.env.SUPERADMIN_USER || 'SuperAdmin',
      role: 'SuperAdmin',
      password: process.env.SUPERADMIN_PASS || 'SuperAdmin123'
    },
    // Legacy / alternate headmaster accounts (still hashed)
    {
      id: 'admin-1',
      username: process.env.ADMIN_USER || 'admin',
      role: 'Headmaster',
      password: process.env.ADMIN_PASS || 'Admin123'
    },
    {
      id: 'hm-comma',
      username: 'Comma',
      role: 'Headmaster',
      password: process.env.COMMA_PASS || 'comma4711'
    }
  ];

  let changed = false;
  for (const account of seed) {
    const existing = d.data.admins.find((a) => a.username === account.username);
    if (!existing) {
      d.data.admins.push({
        id: account.id,
        username: account.username,
        role: account.role,
        passwordHash: bcrypt.hashSync(account.password, 10)
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
app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/api/admin/login', adminIpAllowed, loginRateLimit, async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const d = await getDB();
  const wanted = String(username).trim();
  const admin = (d.data.admins || []).find(
    (a) => a.username && a.username.toLowerCase() === wanted.toLowerCase()
  );
  if (!admin || !admin.passwordHash) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const ok = bcrypt.compareSync(password, admin.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const role = admin.role || 'Headmaster';
  const token = signToken({ sub: admin.id, username: admin.username, role });
  return res.json({
    token,
    role,
    username: admin.username,
    dashboard: ROLE_DASHBOARD[role] || '/admin/login.html'
  });
});

// Convenience routes matching the public architecture diagram
app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});


app.get('/api/terms-calendar', async (req, res) => {
  const d = await getDB();
  // Calendars on the public site poll this shared endpoint after an approval.
  // Do not let an intermediary reuse an older calendar response.
  res.set('Cache-Control', 'no-store');
  return res.json(d.data.termCalendar || { events: {} });
});

app.put('/api/terms-calendar', authRequired, adminIpAllowed, schoolStaffRequired, roleRequired('Headmaster'), async (req, res) => {
  const d = await getDB();
  const body = req.body || {};
  if (!body.events || typeof body.events !== 'object') {
    return res.status(400).json({ error: 'events must be an object keyed by ISO date' });
  }

  // Replace (direct edit restricted to Headmaster; normal flow uses proposal final approval)
  d.data.termCalendar = { events: body.events };
  await d.write();
  return res.json({ ok: true });
});

app.get('/api/proposals', authRequired, adminIpAllowed, schoolStaffRequired, async (req, res) => {
  const d = await getDB();
  const role = req.user?.role;
  const proposals = (d.data.proposals || [])
    .filter((proposal) => {
      if (role === 'Headmaster') return true;
      if (role === 'Manager') return ['pending_manager_review', 'awaiting_headmaster_approval', 'revisions_requested'].includes(proposal.status);
      if (role === 'Secretary') return ['draft', 'pending_manager_review', 'revisions_requested'].includes(proposal.status);
      return false;
    })
    .map(summarizeProposal)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  return res.json({ proposals });
});

app.get('/api/dashboard', authRequired, adminIpAllowed, schoolStaffRequired, async (req, res) => {
  const d = await getDB();
  const role = req.user?.role;
  const proposals = (d.data.proposals || [])
    .filter((proposal) => {
      if (role === 'Headmaster') return true;
      if (role === 'Manager') return ['pending_manager_review', 'awaiting_headmaster_approval', 'revisions_requested'].includes(proposal.status);
      if (role === 'Secretary') return ['draft', 'pending_manager_review', 'revisions_requested'].includes(proposal.status);
      return false;
    })
    .map(summarizeProposal)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

  const pendingProposals = proposals.filter((proposal) => ['draft', 'pending_manager_review', 'awaiting_headmaster_approval', 'revisions_requested'].includes(proposal.status)).length;
  const itemsNeedingReview = proposals.filter((proposal) => {
    if (role === 'Manager') return proposal.status === 'pending_manager_review';
    if (role === 'Headmaster') return proposal.status === 'awaiting_headmaster_approval';
    return ['pending_manager_review', 'awaiting_headmaster_approval', 'revisions_requested'].includes(proposal.status);
  }).length;
  const recentApprovals = proposals.filter((proposal) => ['final_approved', 'approved'].includes(proposal.status)).slice(0, 6);
  const inbox = proposals.filter((proposal) => ['draft', 'pending_manager_review', 'awaiting_headmaster_approval', 'revisions_requested'].includes(proposal.status)).slice(0, 8);
  const recentActivity = proposals.slice(0, 8);
  const newApplications = (d.data.applications || []).filter((app) => (app.status || 'new') === 'new').length;
  const unreadMessages = (d.data.messages || []).filter((message) => (
    messageBelongsToRecipient(message, req.user) && !message.readAt
  )).length;

  return res.json({
    summary: {
      pendingProposals,
      itemsNeedingReview,
      recentApprovals: recentApprovals.length,
      newApplications,
      unreadMessages
    },
    inbox,
    recentApprovals,
    recentActivity
  });
});

app.post('/api/proposals', authRequired, adminIpAllowed, schoolStaffRequired, async (req, res) => {
  const d = await getDB();
  const body = req.body || {};
  const role = req.user?.role;

  if (role !== 'Secretary') {
    return res.status(403).json({ error: 'Only Secretaries can create proposals' });
  }

  const proposal = {
    id: `${Date.now()}`,
    createdBy: req.user?.username || 'Secretary',
    role,
    category: ['news', 'policy', 'communication', 'resource'].includes(body.category) ? body.category : 'calendar',
    status: PROPOSAL_STATUSES.DRAFT,
    assignedTo: ['Manager', 'Headmaster', 'Secretary'].includes(body.assignedTo) ? body.assignedTo : 'Manager',
    priority: ['Low', 'Medium', 'High'].includes(body.priority) ? body.priority : 'Medium',
    event: body.event,
    notes: body.notes || '',
    comments: [],
    history: [],
    createdAt: new Date().toISOString()
  };

  addProposalHistoryEntry(proposal, req.user?.username, 'created', 'Draft created');
  d.data.proposals.push(proposal);
  await d.write();
  return res.json({ proposal });
});

app.put('/api/proposals/:id', authRequired, adminIpAllowed, schoolStaffRequired, async (req, res) => {
  const d = await getDB();
  const role = req.user?.role;
  const proposal = (d.data.proposals || []).find((item) => item.id === req.params.id);

  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

  const action = req.body?.action;
  const currentStatus = proposal.status;
  const nextStatus = getNextStatus(role, action, currentStatus);

  if (role === 'Secretary' && action === 'submit') {
    proposal.status = nextStatus;
    proposal.assignedTo = 'Manager';
    proposal.updatedAt = new Date().toISOString();
    addProposalHistoryEntry(proposal, req.user?.username, 'submit', 'Submitted for manager review');
    await d.write();
    return res.json({ proposal: summarizeProposal(proposal) });
  }

  if (role === 'Manager' && ['approve', 'reject', 'request-revisions'].includes(action)) {
    proposal.status = nextStatus;
    proposal.reviewedBy = req.user?.username;
    proposal.assignedTo = action === 'approve' ? 'Headmaster' : 'Secretary';
    proposal.updatedAt = new Date().toISOString();
    const msg = action === 'approve'
      ? 'Approved and sent to the Headmaster'
      : action === 'reject'
        ? 'Rejected by Manager'
        : 'Revision requested by Manager';
    addProposalHistoryEntry(proposal, req.user?.username, action, msg);
    await d.write();
    return res.json({ proposal: summarizeProposal(proposal) });
  }

  if (role === 'Headmaster' && ['approve', 'reject', 'request-revisions'].includes(action)) {
    proposal.status = nextStatus;
    proposal.reviewedBy = req.user?.username;
    proposal.assignedTo = action === 'approve' && nextStatus === PROPOSAL_STATUSES.FINAL_APPROVED ? 'Completed' : 'Secretary';
    proposal.updatedAt = new Date().toISOString();

    const msg = action === 'approve'
      ? 'Final approval granted'
      : action === 'reject'
        ? 'Rejected by Headmaster'
        : 'Revision requested by Headmaster';
    addProposalHistoryEntry(proposal, req.user?.username, action, msg);

    let payload = { proposal: summarizeProposal(proposal) };

    if (action === 'approve' && nextStatus === PROPOSAL_STATUSES.FINAL_APPROVED) {
      const category = ['news', 'policy', 'communication', 'resource', 'calendar'].includes(proposal.category)
        ? proposal.category
        : 'calendar';

      if (category === 'calendar') {
        // Publish onto the shared term calendar used by every public + admin calendar.
        d.data.termCalendar = {
          events: applyProposalToEvents(d.data.termCalendar?.events || {}, proposal)
        };
        // Also re-merge any other final approvals so the public store stays complete.
        ensureApprovedCalendarPublished(d.data);
        payload.termCalendar = d.data.termCalendar;
      } else {
        d.data.news = { items: applyProposalToNews(d.data.news?.items || [], proposal) };
        payload.news = d.data.news;
      }
    }

    await d.write();
    return res.json(payload);
  }

  return res.status(403).json({ error: 'Action not allowed for your role' });
});

app.post('/api/proposals/:id/comments', authRequired, adminIpAllowed, schoolStaffRequired, async (req, res) => {
  const d = await getDB();
  const proposal = (d.data.proposals || []).find((item) => item.id === req.params.id);

  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

  const message = `${req.body?.message || ''}`.trim();
  if (!message) return res.status(400).json({ error: 'message is required' });

  proposal.comments = Array.isArray(proposal.comments) ? proposal.comments : [];
  const comment = {
    id: `${Date.now()}`,
    author: req.user?.username || 'Admin',
    role: req.user?.role || 'Admin',
    message,
    createdAt: new Date().toISOString()
  };

  proposal.comments.push(comment);
  addProposalHistoryEntry(proposal, req.user?.username, 'comment', message);
  proposal.updatedAt = new Date().toISOString();
  await d.write();
  return res.json({ proposal: summarizeProposal(proposal), comment });
});

app.get('/api/news', async (req, res) => {
  const d = await getDB();
  return res.json(d.data.news || { items: [] });
});

app.put('/api/news', authRequired, adminIpAllowed, schoolStaffRequired, roleRequired('Headmaster'), async (req, res) => {
  const d = await getDB();
  const body = req.body || {};
  const items = body.items;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

  d.data.news = { items };
  await d.write();
  return res.json({ ok: true });
});

// ---- Application forms (student + staff; public submit; secretary/admin inbox) ----
const APPLICATION_TYPES = new Set(['student', 'teaching-staff', 'non-teaching-staff']);

function resolveApplicationType(body, forms) {
  const raw = `${body?.type || body?.applicationType || ''}`.trim().toLowerCase();
  if (APPLICATION_TYPES.has(raw)) return raw;
  if (forms?.teaching) return 'teaching-staff';
  if (forms?.nonTeaching) return 'non-teaching-staff';
  return 'student';
}

function applicantDisplayName(app) {
  const forms = app.forms || {};
  const type = app.type || 'student';
  if (type === 'teaching-staff') {
    return forms.teaching?.fullName || 'Unknown teaching applicant';
  }
  if (type === 'non-teaching-staff') {
    return forms.nonTeaching?.fullName || 'Unknown staff applicant';
  }
  return forms.student?.fullName || forms.student?.['student-full-name'] || 'Unknown student';
}

function summarizeApplication(app) {
  const forms = app.forms || {};
  const student = forms.student || {};
  const parent = forms.parent || {};
  const teaching = forms.teaching || {};
  const nonTeaching = forms.nonTeaching || {};
  const type = app.type || 'student';

  let contactName = '';
  let contactPhone = '';
  if (type === 'teaching-staff') {
    contactName = teaching.fullName || '';
    contactPhone = teaching.phone || '';
  } else if (type === 'non-teaching-staff') {
    contactName = nonTeaching.fullName || '';
    contactPhone = nonTeaching.phone || '';
  } else {
    contactName = parent.fullName || parent['parent-full-name'] || '';
    contactPhone = parent.phone || parent['parent-phone'] || '';
  }

  return {
    id: app.id,
    type,
    status: app.status || 'new',
    submittedAt: app.submittedAt,
    applicantName: applicantDisplayName(app),
    studentName: student.fullName || student['student-full-name'] || applicantDisplayName(app),
    parentName: contactName,
    parentPhone: contactPhone,
    position: teaching.position || nonTeaching.position || student.currentGrade || '',
    which: app.which || 'all-3'
  };
}

app.post('/api/applications', async (req, res) => {
  const d = await getDB();
  const body = req.body || {};
  const forms = body.forms;

  if (!forms || typeof forms !== 'object') {
    return res.status(400).json({ error: 'forms object is required' });
  }

  const type = resolveApplicationType(body, forms);

  if (type === 'teaching-staff') {
    const name = `${forms.teaching?.fullName || ''}`.trim();
    if (!name) {
      return res.status(400).json({ error: 'Teaching applicant full name is required' });
    }
  } else if (type === 'non-teaching-staff') {
    const name = `${forms.nonTeaching?.fullName || ''}`.trim();
    if (!name) {
      return res.status(400).json({ error: 'Non-teaching applicant full name is required' });
    }
  } else {
    const student = forms.student || {};
    const studentName = `${student.fullName || student['student-full-name'] || ''}`.trim();
    if (!studentName) {
      return res.status(400).json({ error: 'Student full name is required' });
    }
  }

  const application = {
    id: `app-${Date.now()}`,
    type,
    which: body.which || (type === 'student' ? 'all-3' : `${type}-all`),
    status: 'new',
    submittedAt: new Date().toISOString(),
    forms: { ...forms },
    // Assigned to secretary inbox by default
    assignedTo: 'Secretary',
    notes: body.notes || ''
  };

  d.data.applications = Array.isArray(d.data.applications) ? d.data.applications : [];
  d.data.applications.push(application);
  await d.write();

  return res.status(201).json({
    ok: true,
    application: summarizeApplication(application)
  });
});

app.get('/api/applications', authRequired, adminIpAllowed, schoolStaffRequired, async (req, res) => {
  const d = await getDB();

  const applications = (d.data.applications || [])
    .slice()
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

  return res.json({ applications });
});

app.get('/api/applications/:id', authRequired, adminIpAllowed, schoolStaffRequired, async (req, res) => {
  const d = await getDB();

  const application = (d.data.applications || []).find((item) => item.id === req.params.id);
  if (!application) return res.status(404).json({ error: 'Application not found' });
  return res.json({ application });
});

app.put('/api/applications/:id', authRequired, adminIpAllowed, schoolStaffRequired, async (req, res) => {
  const d = await getDB();
  const role = req.user?.role;

  const application = (d.data.applications || []).find((item) => item.id === req.params.id);
  if (!application) return res.status(404).json({ error: 'Application not found' });

  const nextStatus = req.body?.status;
  if (nextStatus && ['new', 'reviewed', 'archived'].includes(nextStatus)) {
    application.status = nextStatus;
    application.reviewedBy = req.user?.username || role;
    application.reviewedAt = new Date().toISOString();
  }

  if (typeof req.body?.notes === 'string') {
    application.notes = req.body.notes;
  }

  await d.write();
  return res.json({ application });
});

// ---- Private admin messaging ----
// Messages are intentionally direct (one sender, one recipient). The API, not
// the client, prevents a user from selecting themselves as the recipient.
function messageAdminSummary(admin) {
  return {
    id: admin.id,
    username: admin.username,
    role: admin.role
  };
}

function isMessageParticipant(message, adminId) {
  return message && (message.senderId === adminId || message.recipientId === adminId);
}

// The extra Headmaster logins are legacy/recovery accounts. Keep direct staff
// messaging focused on the official role account rather than showing duplicates.
function isMessageDirectoryAdmin(admin) {
  return admin && admin.id && admin.username && (
    admin.role !== 'Headmaster' || admin.id === 'hm-1'
  );
}

// The official Headmaster account and its legacy recovery logins represent the
// same staff role. A shared message identity keeps its inbox consistent.
function messageIdentityId(user) {
  return user?.role === 'Headmaster' ? 'hm-1' : user?.sub;
}

function messageBelongsToRecipient(message, user) {
  if (!message || !user) return false;
  if (message.recipientId === user.sub) return true;
  // Legacy Headmaster IDs share the official Headmaster inbox.
  return user.role === 'Headmaster' && message.recipientRole === 'Headmaster';
}

function messageBelongsToSender(message, user) {
  if (!message || !user) return false;
  if (message.senderId === user.sub) return true;
  return user.role === 'Headmaster' && message.senderRole === 'Headmaster';
}

app.get('/api/messages', authRequired, adminIpAllowed, async (req, res) => {
  const d = await getDB();
  const currentId = messageIdentityId(req.user);
  const admins = (d.data.admins || []).filter(isMessageDirectoryAdmin);
  const otherAdmins = admins
    .filter((admin) => admin.id !== currentId)
    .map(messageAdminSummary)
    .sort((a, b) => `${a.role} ${a.username}`.localeCompare(`${b.role} ${b.username}`));

  const requestedPeer = String(req.query.with || '').trim();
  if (requestedPeer && requestedPeer === currentId) {
    return res.status(400).json({ error: 'You cannot open a conversation with yourself' });
  }
  if (requestedPeer && !otherAdmins.some((admin) => admin.id === requestedPeer)) {
    return res.status(404).json({ error: 'Recipient admin not found' });
  }

  // Normalize legacy Headmaster IDs so the Headmaster role appears under
  // a single canonical identity (hm-1) for inbox and conversation lookups.
  const rawMessages = Array.isArray(d.data.messages) ? d.data.messages : [];
  const normalizedMessages = rawMessages.map((m) => {
    const copy = Object.assign({}, m);
    if (copy.senderRole === 'Headmaster') copy.senderId = 'hm-1';
    if (copy.recipientRole === 'Headmaster') copy.recipientId = 'hm-1';
    return copy;
  });

  let messages = normalizedMessages.filter((message) => (
    messageBelongsToSender(message, req.user) || messageBelongsToRecipient(message, req.user)
  ));
  if (requestedPeer) {
    messages = messages.filter((message) => (
      (messageBelongsToSender(message, req.user) && message.recipientId === requestedPeer) ||
      (messageBelongsToRecipient(message, req.user) && message.senderId === requestedPeer)
    ));
  }

  messages.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  const unreadCount = normalizedMessages.filter((message) => message.recipientId === currentId && !message.readAt).length;
  return res.json({
    recipients: otherAdmins,
    messages: messages.slice(-150),
    unreadCount
  });
});

app.post('/api/messages', authRequired, adminIpAllowed, async (req, res) => {
  const d = await getDB();
  const currentId = messageIdentityId(req.user);
  const body = req.body || {};
  const recipientId = String(body.recipientId || '').trim();
  const subject = String(body.subject || '').trim();
  const messageText = String(body.message || '').trim();

  if (!recipientId) return res.status(400).json({ error: 'Choose a recipient' });
  if (recipientId === currentId) return res.status(400).json({ error: 'You cannot send a message to yourself' });
  if (!messageText) return res.status(400).json({ error: 'Message text is required' });
  if (subject.length > 140) return res.status(400).json({ error: 'Subject must be 140 characters or fewer' });
  if (messageText.length > 5000) return res.status(400).json({ error: 'Message must be 5,000 characters or fewer' });

  const allAdmins = d.data.admins || [];
  const sender = allAdmins.find((admin) => admin.id === currentId);
  const recipient = allAdmins.find((admin) => admin.id === recipientId && isMessageDirectoryAdmin(admin));
  if (!sender || !recipient) return res.status(404).json({ error: 'Recipient admin not found' });

  const priority = ['normal', 'high', 'urgent'].includes(body.priority) ? body.priority : 'normal';
  const suppliedThread = String(body.threadId || '').trim();
  const threadExists = suppliedThread && (d.data.messages || []).some((item) => (
    item.threadId === suppliedThread && isMessageParticipant(item, currentId) && isMessageParticipant(item, recipientId)
  ));
  const now = new Date().toISOString();
  const message = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    threadId: threadExists ? suppliedThread : `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    senderId: sender.id,
    senderName: sender.username,
    senderRole: sender.role,
    recipientId: recipient.id,
    recipientName: recipient.username,
    recipientRole: recipient.role,
    subject,
    message: messageText,
    priority,
    createdAt: now,
    readAt: null
  };

  d.data.messages.push(message);
  await d.write();
  return res.status(201).json({ ok: true, message });
});

app.patch('/api/messages/:id', authRequired, adminIpAllowed, async (req, res) => {
  const d = await getDB();
  const message = (d.data.messages || []).find((item) => item.id === req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  if (!messageBelongsToRecipient(message, req.user)) return res.status(403).json({ error: 'Only the recipient can update this message' });

  if (req.body?.read === true && !message.readAt) {
    message.readAt = new Date().toISOString();
    await d.write();
  }
  return res.json({ ok: true, message });
});

// ---- SuperAdmin: credential recovery + technical ops (no school workflows) ----
function publicAdminSummary(admin) {
  return {
    id: admin.id,
    username: admin.username,
    role: admin.role
  };
}

const PRIMARY_ADMIN_IDS = { Secretary: 'sec-1', Manager: 'mgr-1', Headmaster: 'hm-1' };

function pickManagedAdmins(admins) {
  const list = Array.isArray(admins) ? admins : [];
  return MANAGED_ADMIN_ROLES.map((role) => {
    const preferredId = PRIMARY_ADMIN_IDS[role];
    const primary = list.find((a) => a.id === preferredId && a.role === role);
    if (primary) return publicAdminSummary(primary);
    const fallback = list.find((a) => a.role === role);
    return fallback ? publicAdminSummary(fallback) : null;
  }).filter(Boolean);
}

app.get('/api/super/admins', authRequired, adminIpAllowed, roleRequired('SuperAdmin'), async (req, res) => {
  const d = await getDB();
  return res.json({ admins: pickManagedAdmins(d.data.admins) });
});

app.put('/api/super/admins/:id', authRequired, adminIpAllowed, roleRequired('SuperAdmin'), async (req, res) => {
  const d = await getDB();
  const admin = (d.data.admins || []).find((a) => a.id === req.params.id);

  if (!admin) {
    return res.status(404).json({ error: 'Admin account not found' });
  }
  if (!MANAGED_ADMIN_ROLES.includes(admin.role)) {
    return res.status(403).json({ error: 'Only Secretary, Manager, and Headmaster credentials can be changed here' });
  }

  const body = req.body || {};
  let changed = false;

  if (body.username !== undefined) {
    const nextUsername = String(body.username || '').trim();
    if (!nextUsername) {
      return res.status(400).json({ error: 'username cannot be empty' });
    }
    if (nextUsername.length < 3) {
      return res.status(400).json({ error: 'username must be at least 3 characters' });
    }
    const clash = (d.data.admins || []).find(
      (a) => a.id !== admin.id && a.username && a.username.toLowerCase() === nextUsername.toLowerCase()
    );
    if (clash) {
      return res.status(409).json({ error: 'That username is already in use' });
    }
    if (admin.username !== nextUsername) {
      admin.username = nextUsername;
      changed = true;
    }
  }

  if (body.password !== undefined) {
    const nextPassword = String(body.password || '');
    if (nextPassword.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }
    admin.passwordHash = bcrypt.hashSync(nextPassword, 10);
    changed = true;
  }

  if (!changed) {
    return res.status(400).json({ error: 'Provide username and/or password to update' });
  }

  // Role is never changeable via this endpoint
  await d.write();
  return res.json({ ok: true, admin: publicAdminSummary(admin) });
});

app.get('/api/super/health', authRequired, adminIpAllowed, roleRequired('SuperAdmin'), async (req, res) => {
  const d = await getDB();
  const events = d.data.termCalendar?.events || {};
  const newsItems = d.data.news?.items || [];

  return res.json({
    ok: true,
    uptime: process.uptime(),
    host: HOST,
    port: PORT,
    node: process.version,
    dbFile,
    counts: {
      admins: (d.data.admins || []).length,
      proposals: (d.data.proposals || []).length,
      applications: (d.data.applications || []).length,
      newsItems: Array.isArray(newsItems) ? newsItems.length : 0,
      calendarDates: Object.keys(events).length
    }
  });
});

app.get('/api/super/backup', authRequired, adminIpAllowed, roleRequired('SuperAdmin'), async (req, res) => {
  const d = await getDB();
  // Re-read ensures we send the latest on-disk snapshot after any concurrent writes
  await d.read();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="debest-data-backup-${stamp}.json"`);
  return res.send(JSON.stringify(d.data || {}, null, 2));
});

// ---- Static content (optional) ----
app.use(express.static(__dirname));

app.listen(PORT, HOST, async () => {
  await ensureDefaultAdmins();
  console.log(`Server running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`LAN: open http://<this-computer-ip>:${PORT}/debest.html from other school PCs`);
  console.log(`Admin login: http://<this-computer-ip>:${PORT}/admin/login.html`);
});
