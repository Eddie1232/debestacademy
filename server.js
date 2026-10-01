const path = require('path');
const crypto = require('crypto');
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
  addNewsItem,
  removeNewsItem,
  syncApprovedCalendarEvents,
  calendarEventsEqual,
} = require('./proposal-workflow');
const {
  isEmploymentApplication,
  normalizeApplicationStatus,
  applyApplicationStatusChange,
  statusLabel,
  createEmploymentAuditEntry,
  appendEmploymentAuditEntry,
  hydrateEmploymentHistory,
  collectEmploymentAuditLog,
  isStaffActor,
} = require('./employment-offer-workflow');
const {
  sanitizeApplicationForms,
  hasApplicationContact,
  isValidApplicationEmail,
} = require('./application-data');
const { assistantRateLimit, handleAssistantChat, handleAdminAssistantChat } = require('./assistant-service');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1');

const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Helmet defaults break this school site on plain HTTP LAN:
// - CSP script-src 'self' blocks inline <script> used by login/admin pages
// - upgrade-insecure-requests forces HTTPS (no TLS on typical school host)
// - HSTS is inappropriate without HTTPS
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        formAction: ["'self'", 'https://formspree.io'],
        frameAncestors: ["'self'"],
        frameSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
        connectSrc: ["'self'"],
        // Do NOT set upgradeInsecureRequests — host is HTTP on the school LAN
      },
    },
    hsts: false,
    frameguard: { action: 'sameorigin' },
    referrerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
  })
);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (!CORS_ALLOWED_ORIGINS.length) return callback(null, true);
      if (CORS_ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
    exposedHeaders: ['Authorization'],
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', apiRateLimit);

// ---- Config ----
const PORT = Number(process.env.PORT) || 5501;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PROD';
const ADMIN_IP_ALLOWLIST = (process.env.ADMIN_IP_ALLOWLIST || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const JWT_SECRET_MIN_LENGTH = 32;

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'CHANGE_ME_IN_PROD') {
  console.error(
    '[security] JWT_SECRET must be set to a strong value in production. Aborting startup.'
  );
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && JWT_SECRET.length < JWT_SECRET_MIN_LENGTH) {
  console.error(
    '[security] JWT_SECRET must be at least 32 characters in production. Aborting startup.'
  );
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && !CORS_ALLOWED_ORIGINS.length) {
  console.error(
    '[security] CORS_ALLOWED_ORIGINS must be configured in production. Aborting startup.'
  );
  process.exit(1);
}

if (JWT_SECRET === 'CHANGE_ME_IN_PROD') {
  console.warn(
    '[security] JWT_SECRET is using the default value. Set JWT_SECRET in the environment for production/LAN use.'
  );
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
  messages: [],
  computerHealth: {},
  loginHistory: [],
  knownOfficeDevices: {},
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
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header) return next();
  return authRequired(req, res, next);
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

const apiRequestCounts = new Map();
function apiRateLimit(req, res, next) {
  const ip = clientIp(req);
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const maxRequests = 200;
  const entry = apiRequestCounts.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  apiRequestCounts.set(ip, entry);
  if (entry.count > maxRequests) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
  }
  return next();
}

const ROLE_DASHBOARD = {
  Secretary: '/admin/secretary.html',
  Manager: '/admin/manager.html',
  Headmaster: '/admin/headmaster.html',
  SuperAdmin: '/admin/superadmin.html',
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
    at: new Date().toISOString(),
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
    history: Array.isArray(proposal.history) ? proposal.history.slice(-4) : [],
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
    proposal.assignedTo =
      proposal.status === PROPOSAL_STATUSES.FINAL_APPROVED ? 'Completed' : 'Manager';
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
      password: process.env.SECRETARY_PASS || 'Secretary123',
    },
    {
      id: 'mgr-1',
      username: 'Manager',
      role: 'Manager',
      password: process.env.MANAGER_PASS || 'Manager123',
    },
    {
      id: 'hm-1',
      username: 'Headmaster',
      role: 'Headmaster',
      password: process.env.HEADMASTER_PASS || 'Headmaster123',
    },
    {
      id: 'super-1',
      username: process.env.SUPERADMIN_USER || 'SuperAdmin',
      role: 'SuperAdmin',
      password: process.env.SUPERADMIN_PASS || 'SuperAdmin123',
    },
    // Legacy / alternate headmaster accounts (still hashed)
    {
      id: 'admin-1',
      username: process.env.ADMIN_USER || 'admin',
      role: 'Headmaster',
      password: process.env.ADMIN_PASS || 'Admin123',
    },
    {
      id: 'hm-comma',
      username: 'Comma',
      role: 'Headmaster',
      password: process.env.COMMA_PASS || 'comma4711',
    },
  ];

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
app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/api/admin/login', adminIpAllowed, loginRateLimit, async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
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
  const suppliedDeviceId = String(req.body?.deviceId || '').trim().slice(0, 160);
  const deviceId = suppliedDeviceId || 'unidentified-browser';
  const deviceLabel = String(req.body?.deviceLabel || `${role}-PC`)
    .trim()
    .slice(0, 100) || `${role}-PC`;
  if (!d.data.knownOfficeDevices || typeof d.data.knownOfficeDevices !== 'object') {
    d.data.knownOfficeDevices = {};
  }
  if (!Array.isArray(d.data.loginHistory)) d.data.loginHistory = [];

  const knownDeviceId = d.data.knownOfficeDevices[role];
  // The first successful login establishes the office browser for that role.
  // Later logins from another browser are retained as security alerts.
  const unexpectedDevice = Boolean(knownDeviceId && knownDeviceId !== deviceId);
  if (!knownDeviceId) d.data.knownOfficeDevices[role] = deviceId;

  d.data.loginHistory.push({
    id: `login-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    role,
    username: admin.username,
    computer: deviceLabel,
    ip: clientIp(req).replace(/^::ffff:/, ''),
    unexpectedDevice,
  });
  d.data.loginHistory = d.data.loginHistory.slice(-200);
  await d.write();

  const token = signToken({ sub: admin.id, username: admin.username, role });
  return res.json({
    token,
    role,
    unexpectedDevice,
    dashboard: ROLE_DASHBOARD[role] || '/admin/login.html',
  });
});

// Convenience routes matching the public architecture diagram
app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

app.get('/api/terms-calendar', async (req, res) => {
  const d = await getDB();
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  return res.json(d.data.termCalendar || { events: {} });
});

app.put(
  '/api/terms-calendar',
  authRequired,
  adminIpAllowed,
  schoolStaffRequired,
  roleRequired('Headmaster'),
  async (req, res) => {
    const d = await getDB();
    const body = req.body || {};
    if (!body.events || typeof body.events !== 'object') {
      return res.status(400).json({ error: 'events must be an object keyed by ISO date' });
    }

    // Replace (direct edit restricted to Headmaster; normal flow uses proposal final approval)
    d.data.termCalendar = { events: body.events };
    await d.write();
    return res.json({ ok: true });
  }
);

app.get('/api/proposals', authRequired, adminIpAllowed, schoolStaffRequired, async (req, res) => {
  const d = await getDB();
  const role = req.user?.role;
  const proposals = (d.data.proposals || [])
    .filter((proposal) => {
      if (role === 'Headmaster') return true;
      if (role === 'Manager')
        return [
          'pending_manager_review',
          'awaiting_headmaster_approval',
          'revisions_requested',
        ].includes(proposal.status);
      if (role === 'Secretary')
        return ['draft', 'pending_manager_review', 'revisions_requested'].includes(proposal.status);
      return false;
    })
    .map(summarizeProposal)
    .sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
    );
  return res.json({ proposals });
});

app.get('/api/dashboard', authRequired, adminIpAllowed, schoolStaffRequired, async (req, res) => {
  const d = await getDB();
  const role = req.user?.role;
  const proposals = (d.data.proposals || [])
    .filter((proposal) => {
      if (role === 'Headmaster') return true;
      if (role === 'Manager')
        return [
          'pending_manager_review',
          'awaiting_headmaster_approval',
          'revisions_requested',
        ].includes(proposal.status);
      if (role === 'Secretary')
        return ['draft', 'pending_manager_review', 'revisions_requested'].includes(proposal.status);
      return false;
    })
    .map(summarizeProposal)
    .sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
    );

  const pendingProposals = proposals.filter((proposal) =>
    [
      'draft',
      'pending_manager_review',
      'awaiting_headmaster_approval',
      'revisions_requested',
    ].includes(proposal.status)
  ).length;
  const itemsNeedingReview = proposals.filter((proposal) => {
    if (role === 'Manager') return proposal.status === 'pending_manager_review';
    if (role === 'Headmaster') return proposal.status === 'awaiting_headmaster_approval';
    return [
      'pending_manager_review',
      'awaiting_headmaster_approval',
      'revisions_requested',
    ].includes(proposal.status);
  }).length;
  const recentApprovals = proposals
    .filter((proposal) => ['final_approved', 'approved'].includes(proposal.status))
    .slice(0, 6);
  const inbox = proposals
    .filter((proposal) =>
      [
        'draft',
        'pending_manager_review',
        'awaiting_headmaster_approval',
        'revisions_requested',
      ].includes(proposal.status)
    )
    .slice(0, 8);
  const recentActivity = proposals.slice(0, 8);
  const newApplications = (d.data.applications || []).filter((app) => {
    const type = app.type || 'student';
    const status = normalizeApplicationStatus(type, app.status);
    if (isEmploymentApplication(type)) return status === 'applied';
    return status === 'new';
  }).length;
  const unreadMessages = (d.data.messages || []).filter(
    (message) => messageBelongsToRecipient(message, req.user) && !message.readAt
  ).length;

  return res.json({
    summary: {
      pendingProposals,
      itemsNeedingReview,
      recentApprovals: recentApprovals.length,
      newApplications,
      unreadMessages,
    },
    inbox,
    recentApprovals,
    recentActivity,
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
    category: ['news', 'policy', 'communication', 'resource'].includes(body.category)
      ? body.category
      : 'calendar',
    status: PROPOSAL_STATUSES.DRAFT,
    assignedTo: ['Manager', 'Headmaster', 'Secretary'].includes(body.assignedTo)
      ? body.assignedTo
      : 'Manager',
    priority: ['Low', 'Medium', 'High'].includes(body.priority) ? body.priority : 'Medium',
    event: body.event,
    notes: body.notes || '',
    comments: [],
    history: [],
    createdAt: new Date().toISOString(),
  };

  addProposalHistoryEntry(proposal, req.user?.username, 'created', 'Draft created');
  d.data.proposals.push(proposal);
  await d.write();
  return res.json({ proposal });
});

app.put(
  '/api/proposals/:id',
  authRequired,
  adminIpAllowed,
  schoolStaffRequired,
  async (req, res) => {
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
      addProposalHistoryEntry(
        proposal,
        req.user?.username,
        'submit',
        'Submitted for manager review'
      );
      await d.write();
      return res.json({ proposal: summarizeProposal(proposal) });
    }

    if (role === 'Manager' && ['approve', 'reject', 'request-revisions'].includes(action)) {
      proposal.status = nextStatus;
      proposal.reviewedBy = req.user?.username;
      proposal.assignedTo = action === 'approve' ? 'Headmaster' : 'Secretary';
      proposal.updatedAt = new Date().toISOString();
      const msg =
        action === 'approve'
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
      proposal.assignedTo =
        action === 'approve' && nextStatus === PROPOSAL_STATUSES.FINAL_APPROVED
          ? 'Completed'
          : 'Secretary';
      proposal.updatedAt = new Date().toISOString();

      const msg =
        action === 'approve'
          ? 'Final approval granted'
          : action === 'reject'
          ? 'Rejected by Headmaster'
          : 'Revision requested by Headmaster';
      addProposalHistoryEntry(proposal, req.user?.username, action, msg);

      let payload = { proposal: summarizeProposal(proposal) };

      if (action === 'approve' && nextStatus === PROPOSAL_STATUSES.FINAL_APPROVED) {
        const category = ['news', 'policy', 'communication', 'resource', 'calendar'].includes(
          proposal.category
        )
          ? proposal.category
          : 'calendar';

        if (category === 'calendar') {
          // Publish onto the shared term calendar used by every public + admin calendar.
          d.data.termCalendar = {
            events: applyProposalToEvents(d.data.termCalendar?.events || {}, proposal),
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
  }
);

app.post(
  '/api/proposals/:id/comments',
  authRequired,
  adminIpAllowed,
  schoolStaffRequired,
  async (req, res) => {
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
      createdAt: new Date().toISOString(),
    };

    proposal.comments.push(comment);
    addProposalHistoryEntry(proposal, req.user?.username, 'comment', message);
    proposal.updatedAt = new Date().toISOString();
    await d.write();
    return res.json({ proposal: summarizeProposal(proposal), comment });
  }
);

app.get('/api/news', async (req, res) => {
  const d = await getDB();
  return res.json(d.data.news || { items: [] });
});

app.post(
  '/api/news/headline',
  authRequired,
  adminIpAllowed,
  schoolStaffRequired,
  async (req, res) => {
    const d = await getDB();
    const body = req.body || {};
    const title = String(body.title || '').trim();
    const bodyText = String(body.body || '').trim();
    const date = String(body.date || new Date().toISOString().slice(0, 10)).trim();
    const expiresAt = String(body.expiresAt || '').trim();

    if (!title) return res.status(400).json({ error: 'Headline title is required' });
    if (!expiresAt) return res.status(400).json({ error: 'Display end date is required' });
    if (expiresAt < date) {
      return res.status(400).json({ error: 'Display end date must be on or after the publish date' });
    }

    const item = {
      id: `news-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      title,
      body: bodyText,
      date,
      expiresAt,
      category: 'Announcement',
      publishedBy: req.user?.username || req.user?.role || 'Admin',
      createdAt: new Date().toISOString(),
    };

    d.data.news = { items: addNewsItem(d.data.news?.items || [], item) };
    await d.write();
    return res.json({ ok: true, item });
  }
);

app.delete(
  '/api/news/:id',
  authRequired,
  adminIpAllowed,
  schoolStaffRequired,
  async (req, res) => {
    const d = await getDB();
    const { id } = req.params;
    d.data.news = { items: removeNewsItem(d.data.news?.items || [], id) };
    await d.write();
    return res.json({ ok: true, removedId: id });
  }
);

app.post('/api/assistant', assistantRateLimit, async (req, res) => {
  try {
    const d = await getDB();
    const result = await handleAssistantChat(req.body, {
      news: d.data.news,
      termCalendar: d.data.termCalendar,
    });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    return res.json({ reply: result.reply, source: result.source });
  } catch (err) {
    console.error('[assistant]', err);
    return res.status(500).json({
      error:
        'The assistant is unavailable right now. Please try again or call the school office on 0244 669 383.',
    });
  }
});

app.post('/api/admin/assistant', assistantRateLimit, async (req, res) => {
  try {
    const d = await getDB();
    const result = await handleAdminAssistantChat(req.body, {
      news: d.data.news,
      termCalendar: d.data.termCalendar,
    });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    return res.json({ reply: result.reply, source: result.source });
  } catch (err) {
    console.error('[assistant:admin]', err);
    return res.status(500).json({
      error:
        'The school admin assistant is unavailable right now. Please contact the office directly on 0244 669 383.',
    });
  }
});

app.put(
  '/api/news',
  authRequired,
  adminIpAllowed,
  schoolStaffRequired,
  roleRequired('Headmaster'),
  async (req, res) => {
    const d = await getDB();
    const body = req.body || {};
    const items = body.items;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

    d.data.news = { items };
    await d.write();
    return res.json({ ok: true });
  }
);

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
  const status = normalizeApplicationStatus(type, app.status);

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
    status,
    statusLabel: statusLabel(status),
    isEmployment: isEmploymentApplication(type),
    submittedAt: app.submittedAt,
    applicantName: applicantDisplayName(app),
    studentName: student.fullName || student['student-full-name'] || applicantDisplayName(app),
    parentName: contactName,
    parentPhone: contactPhone,
    position: teaching.position || nonTeaching.position || student.currentGrade || '',
    which: app.which || 'all-3',
    registrationStartedAt: app.registrationStartedAt || null,
    offerAcceptedAt: app.offerAcceptedAt || null,
  };
}

function recordApplicationAction(application, { status, fromStatus, action, actor, role }) {
  const name = applicantDisplayName(application);
  const entry = createEmploymentAuditEntry({
    type: application.type,
    status: status || application.status,
    fromStatus,
    action,
    applicantName: name,
    by: actor || '',
    role: role || '',
    applicationId: application.id,
    createdByStaff: isStaffActor(role, actor),
  });
  application.statusHistory = appendEmploymentAuditEntry(application.statusHistory, entry);
  return entry;
}

function canUpdateStudentAdmission(role, fromStatus, nextStatus) {
  if (nextStatus === 'archived') return true;
  if (fromStatus === 'new' && nextStatus === 'manager_approved') return role === 'Manager';
  if (fromStatus === 'manager_approved' && nextStatus === 'headmaster_approved') {
    return role === 'Headmaster';
  }
  if (fromStatus === 'headmaster_approved' && nextStatus === 'admission_letter_printed') {
    return role === 'Secretary';
  }
  return false;
}

function normalizeStoredApplication(app) {
  if (!app || typeof app !== 'object') return app;
  const type = app.type || 'student';
  const status = normalizeApplicationStatus(type, app.status);
  if (app.status !== status) app.status = status;
  app.statusHistory = hydrateEmploymentHistory(app, applicantDisplayName(app));
  return app;
}

app.post('/api/applications', optionalAuth, async (req, res) => {
  const d = await getDB();
  const body = req.body || {};
  const submittedForms = body.forms;

  if (!submittedForms || typeof submittedForms !== 'object' || Array.isArray(submittedForms)) {
    return res.status(400).json({ error: 'forms object is required' });
  }

  const type = resolveApplicationType(body, submittedForms);
  const forms = sanitizeApplicationForms(type, submittedForms);

  if (!req.user && body.consent?.privacyAccepted !== true) {
    return res.status(400).json({ error: 'Privacy consent is required to submit an application.' });
  }
  if (!req.user && type === 'student' && body.consent?.guardianConfirmed !== true) {
    return res.status(400).json({ error: 'A parent or legal guardian must submit a student application.' });
  }

  if (type === 'teaching-staff') {
    const name = `${forms.teaching?.fullName || ''}`.trim();
    if (!name) {
      return res.status(400).json({ error: 'Teaching applicant full name is required' });
    }
    if (!`${forms.teaching?.position || ''}`.trim()) {
      return res.status(400).json({ error: 'Teaching position is required' });
    }
    if (!isValidApplicationEmail(forms.teaching?.email)) {
      return res.status(400).json({ error: 'Enter a valid teaching applicant email address' });
    }
    if (
      forms.teachingDeclaration?.confirmed !== true ||
      !`${forms.teachingDeclaration?.declaration || ''}`.trim()
    ) {
      return res.status(400).json({ error: 'Teaching applicant declaration must be confirmed' });
    }
    if (!hasApplicationContact(forms.teaching)) {
      return res.status(400).json({ error: 'Teaching applicant phone or email is required' });
    }
  } else if (type === 'non-teaching-staff') {
    const name = `${forms.nonTeaching?.fullName || ''}`.trim();
    if (!name) {
      return res.status(400).json({ error: 'Non-teaching applicant full name is required' });
    }
    if (!`${forms.nonTeaching?.position || ''}`.trim()) {
      return res.status(400).json({ error: 'Non-teaching position is required' });
    }
    if (!isValidApplicationEmail(forms.nonTeaching?.email)) {
      return res.status(400).json({ error: 'Enter a valid non-teaching applicant email address' });
    }
    if (
      forms.nonTeachingDeclaration?.confirmed !== true ||
      !`${forms.nonTeachingDeclaration?.declaration || ''}`.trim()
    ) {
      return res.status(400).json({ error: 'Non-teaching applicant declaration must be confirmed' });
    }
    if (!hasApplicationContact(forms.nonTeaching)) {
      return res.status(400).json({ error: 'Non-teaching applicant phone or email is required' });
    }
  } else {
    const student = forms.student || {};
    const studentName = `${student.fullName || student['student-full-name'] || ''}`.trim();
    if (!studentName) {
      return res.status(400).json({ error: 'Student full name is required' });
    }
    if (!`${student.dateOfBirth || ''}`.trim()) {
      return res.status(400).json({ error: 'Student date of birth is required' });
    }
    if (!`${student.currentGrade || ''}`.trim()) {
      return res.status(400).json({ error: 'Grade or class applying for is required' });
    }
    if (!`${student.campus || ''}`.trim()) {
      return res.status(400).json({ error: 'Preferred campus is required' });
    }
    if (!isValidApplicationEmail(forms.parent?.email)) {
      return res.status(400).json({ error: 'Enter a valid parent or guardian email address' });
    }
    if (!`${forms.parent?.fullName || ''}`.trim()) {
      return res.status(400).json({ error: 'Parent or guardian full name is required' });
    }
    if (!hasApplicationContact(forms.parent)) {
      return res.status(400).json({ error: 'Parent or guardian phone or email is required' });
    }
  }

  const initialStatus = isEmploymentApplication(type) ? 'applied' : 'new';
  const submittedAt = new Date().toISOString();
  const actor = req.user?.username || 'applicant';
  const role = req.user?.role || 'applicant';
  const applicantName = applicantDisplayName({ type, forms });
  const applicationId = `app-${crypto.randomUUID()}`;
  const application = {
    id: applicationId,
    type,
    which: body.which || (type === 'student' ? 'all-3' : `${type}-all`),
    status: initialStatus,
    submittedAt,
    forms: { ...forms },
    consent: req.user
      ? null
      : {
          privacyPolicyVersion: '2026-10-01',
          privacyAccepted: true,
          guardianConfirmed: type === 'student',
          acceptedAt: submittedAt,
        },
    // Assigned to secretary inbox by default
    assignedTo: 'Secretary',
    notes: req.user ? body.notes || '' : '',
    statusHistory: [
      createEmploymentAuditEntry({
        type,
        status: initialStatus,
        action: 'created',
        applicantName,
        by: actor,
        role,
        at: submittedAt,
        applicationId,
        createdByStaff: isStaffActor(role, actor),
      }),
    ],
  };

  d.data.applications = Array.isArray(d.data.applications) ? d.data.applications : [];
  d.data.applications.push(application);
  await d.write();

  return res.status(201).json({
    ok: true,
    application: summarizeApplication(application),
  });
});

app.get(
  '/api/applications',
  authRequired,
  adminIpAllowed,
  schoolStaffRequired,
  async (req, res) => {
    const d = await getDB();
    let dirty = false;

    const applications = (d.data.applications || [])
      .map((app) => {
        const beforeStatus = app.status;
        const beforeHistory = JSON.stringify(app.statusHistory || []);
        normalizeStoredApplication(app);
        if (app.status !== beforeStatus || JSON.stringify(app.statusHistory) !== beforeHistory) {
          dirty = true;
        }
        return app;
      })
      .slice()
      .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

    if (dirty) await d.write();

    return res.json({
      applications,
      employmentAudit: collectEmploymentAuditLog(applications, applicantDisplayName),
    });
  }
);

app.get(
  '/api/applications/:id',
  authRequired,
  adminIpAllowed,
  schoolStaffRequired,
  async (req, res) => {
    const d = await getDB();

    const application = (d.data.applications || []).find((item) => item.id === req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    normalizeStoredApplication(application);
    return res.json({ application });
  }
);

app.put(
  '/api/applications/:id',
  authRequired,
  adminIpAllowed,
  schoolStaffRequired,
  async (req, res) => {
    const d = await getDB();
    const role = req.user?.role;
    const actor = req.user?.username || role || '';

    const application = (d.data.applications || []).find((item) => item.id === req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    normalizeStoredApplication(application);

    const nextStatus = req.body?.status;
    if (nextStatus) {
      const type = application.type || 'student';
      const currentStatus = normalizeApplicationStatus(type, application.status);
      if (
        !isEmploymentApplication(type) &&
        !canUpdateStudentAdmission(role, currentStatus, nextStatus)
      ) {
        return res.status(403).json({ error: 'This admission step is not available for your role' });
      }
      const result = applyApplicationStatusChange(
        type,
        application.status,
        nextStatus
      );
      if (!result.ok) {
        return res.status(400).json({ error: result.error || 'Invalid status change' });
      }

      application.status = result.status;
      application.reviewedBy = actor;
      application.reviewedAt = new Date().toISOString();
      recordApplicationAction(application, {
        status: result.status,
        fromStatus: currentStatus,
        action: 'status_changed',
        actor,
        role,
      });

      if (result.status === 'accepted') {
        application.offerAcceptedAt = application.reviewedAt;
      }
      if (result.registrationStarted) {
        application.registrationStartedAt = application.reviewedAt;
        application.registrationStartedBy = actor;
      }
    }

    if (typeof req.body?.notes === 'string') {
      if (application.notes !== req.body.notes) {
        application.notes = req.body.notes;
        recordApplicationAction(application, {
          status: application.status,
          action: 'notes_updated',
          actor,
          role,
        });
      }
    }

    await d.write();
    return res.json({ application });
  }
);

// ---- Private admin messaging ----
// Messages are intentionally direct (one sender, one recipient). The API, not
// the client, prevents a user from selecting themselves as the recipient.
function messageAdminSummary(admin) {
  return {
    id: admin.id,
    username: admin.username,
    role: admin.role,
  };
}

function isMessageParticipant(message, adminId) {
  return message && (message.senderId === adminId || message.recipientId === adminId);
}

// The extra Headmaster logins are legacy/recovery accounts. Keep direct staff
// messaging focused on the official role account rather than showing duplicates.
function isMessageDirectoryAdmin(admin) {
  return (
    admin && admin.id && admin.username && (admin.role !== 'Headmaster' || admin.id === 'hm-1')
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

  let messages = normalizedMessages.filter(
    (message) =>
      messageBelongsToSender(message, req.user) || messageBelongsToRecipient(message, req.user)
  );
  if (requestedPeer) {
    messages = messages.filter(
      (message) =>
        (messageBelongsToSender(message, req.user) && message.recipientId === requestedPeer) ||
        (messageBelongsToRecipient(message, req.user) && message.senderId === requestedPeer)
    );
  }

  messages.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  const unreadCount = normalizedMessages.filter(
    (message) => message.recipientId === currentId && !message.readAt
  ).length;
  return res.json({
    recipients: otherAdmins,
    messages: messages.slice(-150),
    unreadCount,
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
  if (recipientId === currentId)
    return res.status(400).json({ error: 'You cannot send a message to yourself' });
  if (!messageText) return res.status(400).json({ error: 'Message text is required' });
  if (subject.length > 140)
    return res.status(400).json({ error: 'Subject must be 140 characters or fewer' });
  if (messageText.length > 5000)
    return res.status(400).json({ error: 'Message must be 5,000 characters or fewer' });

  const allAdmins = d.data.admins || [];
  const sender = allAdmins.find((admin) => admin.id === currentId);
  const recipient = allAdmins.find(
    (admin) => admin.id === recipientId && isMessageDirectoryAdmin(admin)
  );
  if (!sender || !recipient) return res.status(404).json({ error: 'Recipient admin not found' });

  const priority = ['normal', 'high', 'urgent'].includes(body.priority) ? body.priority : 'normal';
  const suppliedThread = String(body.threadId || '').trim();
  const threadExists =
    suppliedThread &&
    (d.data.messages || []).some(
      (item) =>
        item.threadId === suppliedThread &&
        isMessageParticipant(item, currentId) &&
        isMessageParticipant(item, recipientId)
    );
  const now = new Date().toISOString();
  const message = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    threadId: threadExists
      ? suppliedThread
      : `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    readAt: null,
  };

  d.data.messages.push(message);
  await d.write();
  return res.status(201).json({ ok: true, message });
});

app.patch('/api/messages/:id', authRequired, adminIpAllowed, async (req, res) => {
  const d = await getDB();
  const message = (d.data.messages || []).find((item) => item.id === req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  if (!messageBelongsToRecipient(message, req.user))
    return res.status(403).json({ error: 'Only the recipient can update this message' });

  if (req.body?.read === true && !message.readAt) {
    message.readAt = new Date().toISOString();
    await d.write();
  }
  return res.json({ ok: true, message });
});

// ---- Office computer health ----
// A signed-in role dashboard sends a small heartbeat while it is open.  This is
// intentionally a dashboard-presence signal, not a network scan: it accurately
// answers whether the designated office computer can currently reach the school
// server without exposing IP addresses to the Super Admin UI.
app.post(
  '/api/computer-health/heartbeat',
  authRequired,
  adminIpAllowed,
  schoolStaffRequired,
  async (req, res) => {
    const d = await getDB();
    const role = req.user?.role;
    if (!MANAGED_ADMIN_ROLES.includes(role)) {
      return res.status(403).json({ error: 'Computer health is only tracked for office roles' });
    }
    if (!d.data.computerHealth || typeof d.data.computerHealth !== 'object') {
      d.data.computerHealth = {};
    }
    d.data.computerHealth[role] = {
      lastSeenAt: new Date().toISOString(),
      username: req.user?.username || role,
    };
    await d.write();
    return res.json({ ok: true });
  }
);

// ---- SuperAdmin: credential recovery + technical ops (no school workflows) ----
function publicAdminSummary(admin) {
  return {
    id: admin.id,
    username: admin.username,
    role: admin.role,
  };
}

const PRIMARY_ADMIN_IDS = { Secretary: 'sec-1', Manager: 'mgr-1', Headmaster: 'hm-1' };
const COMPUTER_HEALTH_ROLES = ['Secretary', 'Manager', 'Headmaster'];
const COMPUTER_ONLINE_WINDOW_MS = 90 * 1000;

function officeComputerHealth(computerHealth) {
  const now = Date.now();
  const heartbeats = computerHealth && typeof computerHealth === 'object' ? computerHealth : {};
  return COMPUTER_HEALTH_ROLES.map((role) => {
    const record = heartbeats[role] || {};
    const lastSeenAt = record.lastSeenAt || null;
    const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
    return {
      role,
      label: `${role} PC`,
      online: Number.isFinite(lastSeenMs) && now - lastSeenMs <= COMPUTER_ONLINE_WINDOW_MS,
      lastSeenAt,
    };
  });
}

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

app.get(
  '/api/super/admins',
  authRequired,
  adminIpAllowed,
  roleRequired('SuperAdmin'),
  async (req, res) => {
    const d = await getDB();
    return res.json({ admins: pickManagedAdmins(d.data.admins) });
  }
);

app.put(
  '/api/super/admins/:id',
  authRequired,
  adminIpAllowed,
  roleRequired('SuperAdmin'),
  async (req, res) => {
    const d = await getDB();
    const admin = (d.data.admins || []).find((a) => a.id === req.params.id);

    if (!admin) {
      return res.status(404).json({ error: 'Admin account not found' });
    }
    if (!MANAGED_ADMIN_ROLES.includes(admin.role)) {
      return res
        .status(403)
        .json({ error: 'Only Secretary, Manager, and Headmaster credentials can be changed here' });
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
        (a) =>
          a.id !== admin.id && a.username && a.username.toLowerCase() === nextUsername.toLowerCase()
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
  }
);

app.get(
  '/api/super/health',
  authRequired,
  adminIpAllowed,
  roleRequired('SuperAdmin'),
  async (req, res) => {
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
      officeComputers: officeComputerHealth(d.data.computerHealth),
      counts: {
        admins: (d.data.admins || []).length,
        proposals: (d.data.proposals || []).length,
        applications: (d.data.applications || []).length,
        newsItems: Array.isArray(newsItems) ? newsItems.length : 0,
        calendarDates: Object.keys(events).length,
      },
    });
  }
);

app.get(
  '/api/super/login-history',
  authRequired,
  adminIpAllowed,
  roleRequired('SuperAdmin'),
  async (req, res) => {
    const d = await getDB();
    const history = Array.isArray(d.data.loginHistory) ? d.data.loginHistory : [];
    const events = history
      .filter((entry) => MANAGED_ADMIN_ROLES.includes(entry.role))
      .slice()
      .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
      .slice(0, 20);
    return res.json({
      events,
      unexpectedDeviceCount: events.filter((entry) => entry.unexpectedDevice).length,
    });
  }
);

app.get(
  '/api/super/backup',
  authRequired,
  adminIpAllowed,
  roleRequired('SuperAdmin'),
  async (req, res) => {
    const d = await getDB();
    // Re-read ensures we send the latest on-disk snapshot after any concurrent writes
    await d.read();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="debest-data-backup-${stamp}.json"`);
    return res.send(JSON.stringify(d.data || {}, null, 2));
  }
);

// ---- Static content (optional) ----
app.use(express.static(__dirname));

// Keep API misses machine-readable while giving browser navigation a branded page.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.listen(PORT, HOST, async () => {
  await ensureDefaultAdmins();
  console.log(`Server running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`LAN: open http://<this-computer-ip>:${PORT}/debest.html from other school PCs`);
  console.log(`Admin login: http://<this-computer-ip>:${PORT}/admin/login.html`);
});
