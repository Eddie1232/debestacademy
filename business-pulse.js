/**
 * Business Pulse connector for DEBEST Academy.
 *
 * Sends school activity (fee payments, expenses, applications, admission and
 * employment status changes) to the Business Pulse tracker so everything going
 * in and out of the school is recorded in one place.
 *
 * Design rules:
 * - Server-side only. The API key never reaches the browser.
 * - Never breaks the school site: if the tracker is not configured, slow, or
 *   down, the school request still succeeds. Failed sends are queued in memory
 *   and retried with backoff.
 * - Every item carries a stable `eventId`, so retries are never recorded twice.
 * - No personal details beyond a name and class/position are sent (no dates of
 *   birth, addresses, health or guardian contact data).
 *
 * Configure with environment variables:
 *   BUSINESS_PULSE_URL  Full ingest URL, e.g. https://your-tracker.example/api/ingest
 *   BUSINESS_PULSE_KEY  API key from the tracker's "Connect website" page
 */

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_QUEUE = 500;
const RETRY_DELAYS_MS = [5000, 30000, 120000, 600000];

const FEE_PURPOSES = [
  'Tuition fees',
  'Admission fees',
  'PTA dues',
  'Uniforms',
  'Books & stationery',
  'Feeding fees',
  'Transport fees',
  'Exam fees',
  'Other income',
];

const EXPENSE_PURPOSES = [
  'Salaries & wages',
  'Utilities',
  'Maintenance & repairs',
  'Teaching materials',
  'Feeding supplies',
  'Transport & fuel',
  'Office supplies',
  'Events',
  'Other expense',
];

const PAYMENT_METHODS = ['cash', 'momo', 'bank', 'card', 'cheque', 'other'];

function clean(value, max = 120) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function createBusinessPulse(options = {}) {
  const env = options.env || process.env;
  const url = clean(options.url ?? env.BUSINESS_PULSE_URL, 500);
  const key = clean(options.key ?? env.BUSINESS_PULSE_KEY, 200);
  const fetchImpl = options.fetch || (typeof fetch === 'function' ? fetch : null);
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const logger = options.logger || console;
  const retryDelays = options.retryDelays || RETRY_DELAYS_MS;
  const schedule = options.setTimeout || setTimeout;

  const enabled = Boolean(url && key && fetchImpl && /^https?:\/\//i.test(url));
  const queue = [];
  let attempt = 0;
  let timer = null;
  let flushing = null;
  const stats = { sent: 0, failed: 0, lastError: '', lastSentAt: '', lastErrorAt: '' };

  async function post(items) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const t = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify({ events: items }),
        signal: controller ? controller.signal : undefined,
      });
      let body = null;
      try {
        body = await res.json();
      } catch (e) {
        body = null;
      }
      if (!res.ok) {
        const err = new Error((body && body.message) || `Tracker responded ${res.status}`);
        // 4xx (except 408/429) means the data itself is wrong: retrying will not help.
        err.permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
        throw err;
      }
      return body;
    } finally {
      if (t) clearTimeout(t);
    }
  }

  function scheduleRetry() {
    if (timer || !queue.length) return;
    const delay = retryDelays[Math.min(attempt, retryDelays.length - 1)];
    attempt += 1;
    timer = schedule(() => {
      timer = null;
      flush();
    }, delay);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  async function flushOnce() {
    while (queue.length) {
      const batch = queue[0] && queue[0].__single ? [queue[0].item] : queue.slice(0, 100).filter((i) => !i.__single);
      if (!batch.length) break;
      try {
        await post(batch);
        queue.splice(0, batch.length);
        stats.sent += batch.length;
        stats.lastSentAt = new Date().toISOString();
        attempt = 0;
      } catch (err) {
        stats.lastError = err && err.message ? err.message : String(err);
        stats.lastErrorAt = new Date().toISOString();
        if (err && err.permanent) {
          queue.splice(0, batch.length);
          if (batch.length === 1) {
            // The item itself is invalid: drop it so it cannot block everything after it.
            stats.failed += 1;
            logger.warn(`[business-pulse] dropped 1 item: ${stats.lastError}`);
          } else {
            // Batches are all-or-nothing on the tracker: resend one by one so only bad items are dropped.
            queue.unshift(...batch.map((item) => ({ __single: true, item })));
          }
          continue;
        }
        logger.warn(`[business-pulse] send failed, will retry: ${stats.lastError}`);
        scheduleRetry();
        return;
      }
    }
  }

  function flush() {
    if (!enabled) return Promise.resolve();
    if (!flushing) {
      flushing = flushOnce().finally(() => {
        flushing = null;
      });
    }
    return flushing;
  }

  /** Queue one or more items and send them in the background. Never throws. */
  function send(items) {
    if (!enabled) return Promise.resolve();
    const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
    if (!list.length) return Promise.resolve();
    for (const item of list) {
      if (queue.length >= MAX_QUEUE) {
        queue.shift();
        stats.failed += 1;
      }
      queue.push(item);
    }
    if (timer) return Promise.resolve(); // a retry is already scheduled
    return flush().catch(() => {});
  }

  function status() {
    return { enabled, endpoint: enabled ? url.replace(/\?.*$/, '') : '', queued: queue.length, ...stats };
  }

  return { enabled, send, flush, status };
}

// ---------- payload builders ----------

function applicationLabel(type) {
  if (type === 'teaching-staff') return 'Teaching job application';
  if (type === 'non-teaching-staff') return 'Non-teaching job application';
  return 'Admission application';
}

/** Name + class/position only. No other personal data leaves the school server. */
function applicationSubject(app) {
  const forms = (app && app.forms) || {};
  if (app && app.type === 'teaching-staff') {
    return { name: clean(forms.teaching && forms.teaching.fullName), detail: clean(forms.teaching && forms.teaching.position) };
  }
  if (app && app.type === 'non-teaching-staff') {
    return { name: clean(forms.nonTeaching && forms.nonTeaching.fullName), detail: clean(forms.nonTeaching && forms.nonTeaching.position) };
  }
  const s = forms.student || {};
  return { name: clean(s.fullName || s['student-full-name']), detail: clean(s.currentGrade) };
}

function applicationSubmittedEvent(app) {
  const { name, detail } = applicationSubject(app);
  return {
    kind: 'event',
    event: 'application.submitted',
    summary: `${applicationLabel(app.type)} received: ${name || 'Unnamed applicant'}${detail ? ` (${detail})` : ''}`,
    reference: clean(app.id, 60),
    eventId: `debest:${app.id}:submitted`,
  };
}

function applicationStatusEvent(app, fromStatus, toStatus, actorRole, statusText) {
  const { name } = applicationSubject(app);
  const label = clean(statusText || toStatus, 60);
  return {
    kind: 'event',
    event: 'application.status',
    summary: `${applicationLabel(app.type)} for ${name || 'applicant'} moved ${clean(fromStatus, 40) || 'new'} → ${label}${actorRole ? ` by ${clean(actorRole, 30)}` : ''}`,
    reference: clean(app.id, 60),
    eventId: `debest:${app.id}:status:${clean(toStatus, 40)}:${clean(app.reviewedAt, 40) || Date.now()}`,
  };
}

/** A recorded fee payment or school expense becomes a money movement in the tracker. */
function ledgerEntryMovement(entry) {
  const isIn = entry.direction === 'in';
  const who = clean(entry.party, 120);
  const student = clean(entry.studentName, 120);
  const notes = [student && `Student: ${student}${entry.className ? ` (${clean(entry.className, 40)})` : ''}`, clean(entry.notes, 300)]
    .filter(Boolean)
    .join(' · ');
  return {
    direction: isIn ? 'in' : 'out',
    amount: Number(entry.amount),
    date: entry.date,
    category: entry.purpose,
    [isIn ? 'customer' : 'supplier']: who || undefined,
    method: entry.method,
    reference: clean(entry.receiptNo || entry.reference, 60),
    notes: notes || undefined,
    tags: 'debest-academy',
    eventId: `debest:${entry.id}`,
  };
}

function ledgerEntryVoidMovement(entry, actor) {
  // The tracker never deletes on behalf of the website: a void is recorded as an
  // opposite movement, so the books stay auditable.
  return {
    direction: entry.direction === 'in' ? 'out' : 'in',
    amount: Number(entry.amount),
    date: new Date().toISOString().slice(0, 10),
    category: entry.direction === 'in' ? 'Refunds & reversals' : 'Other income',
    method: entry.method,
    reference: `VOID ${clean(entry.receiptNo || entry.reference, 50)}`,
    notes: `Reversal of ${clean(entry.receiptNo, 40)}${actor ? ` by ${clean(actor, 40)}` : ''}${entry.voidReason ? `: ${clean(entry.voidReason, 200)}` : ''}`,
    tags: 'debest-academy,void',
    eventId: `debest:${entry.id}:void`,
  };
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Validate and normalise a fee payment / expense submitted by office staff.
 * Returns { ok: true, entry } or { ok: false, error }.
 */
function normalizeLedgerInput(body) {
  const b = body || {};
  const direction = b.direction === 'out' ? 'out' : b.direction === 'in' ? 'in' : '';
  if (!direction) return { ok: false, error: 'Choose money in (fee received) or money out (expense paid)' };
  const rawAmount = String(b.amount ?? '').replace(/[\s,]|GH[S₵C]?|₵/gi, '');
  const amount = /^\d+(\.\d+)?$/.test(rawAmount) ? Number(rawAmount) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Enter an amount above zero' };
  if (amount > 10000000) return { ok: false, error: 'Amount looks too large. Check it and try again.' };
  const purposes = direction === 'in' ? FEE_PURPOSES : EXPENSE_PURPOSES;
  const purpose = purposes.includes(b.purpose) ? b.purpose : '';
  if (!purpose) return { ok: false, error: 'Choose what the money is for' };
  const method = PAYMENT_METHODS.includes(b.method) ? b.method : 'cash';
  const today = new Date().toISOString().slice(0, 10);
  const rawDate = String(b.date || '').trim();
  if (rawDate && !isRealDate(rawDate)) return { ok: false, error: 'Enter a valid date' };
  const date = rawDate || today;
  if (date > today) return { ok: false, error: 'Date cannot be in the future' };
  const party = clean(b.party, 120);
  if (direction === 'in' && !party) return { ok: false, error: 'Enter who paid (parent, guardian or payer name)' };
  if (direction === 'out' && !party) return { ok: false, error: 'Enter who was paid (supplier, staff member or payee)' };
  return {
    ok: true,
    entry: {
      direction,
      amount: Math.round(amount * 100) / 100,
      purpose,
      method,
      date,
      party,
      studentName: direction === 'in' ? clean(b.studentName, 120) : '',
      className: direction === 'in' ? clean(b.className, 40) : '',
      reference: clean(b.reference, 60),
      notes: clean(b.notes, 300),
    },
  };
}

module.exports = {
  createBusinessPulse,
  applicationSubmittedEvent,
  applicationStatusEvent,
  ledgerEntryMovement,
  ledgerEntryVoidMovement,
  normalizeLedgerInput,
  FEE_PURPOSES,
  EXPENSE_PURPOSES,
  PAYMENT_METHODS,
};
