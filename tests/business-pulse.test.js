const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createBusinessPulse,
  applicationSubmittedEvent,
  applicationStatusEvent,
  ledgerEntryMovement,
  ledgerEntryVoidMovement,
  normalizeLedgerInput,
} = require('../business-pulse');
const { isPrivatePath } = require('../private-files');

const quiet = { warn() {}, log() {}, error() {} };

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, headers: opts.headers, events: body.events });
    const next = typeof responses === 'function' ? responses(body.events, calls.length) : responses.shift();
    if (next instanceof Error) throw next;
    return { ok: next.status < 400, status: next.status, json: async () => next.body || {} };
  };
  return { impl, calls };
}

test('tracker is a silent no-op when not configured', async () => {
  const { impl, calls } = fakeFetch([]);
  const pulse = createBusinessPulse({ env: {}, fetch: impl, logger: quiet });
  assert.equal(pulse.enabled, false);
  await pulse.send({ kind: 'event', event: 'x', summary: 'y' });
  assert.equal(calls.length, 0);
  assert.equal(pulse.status().endpoint, '');
});

test('non-http URLs are not accepted', () => {
  const pulse = createBusinessPulse({ url: 'ftp://x', key: 'k', fetch: async () => ({}), logger: quiet });
  assert.equal(pulse.enabled, false);
});

test('send posts an events batch with the API key header', async () => {
  const { impl, calls } = fakeFetch([{ status: 201 }]);
  const pulse = createBusinessPulse({ url: 'https://t.example/api/ingest', key: 'lp_abc', fetch: impl, logger: quiet });
  await pulse.send([{ kind: 'event', event: 'a', summary: 'A' }, { kind: 'event', event: 'b', summary: 'B' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://t.example/api/ingest');
  assert.equal(calls[0].headers['X-API-Key'], 'lp_abc');
  assert.equal(calls[0].events.length, 2);
  assert.equal(pulse.status().sent, 2);
  assert.equal(pulse.status().queued, 0);
});

test('server errors and network failures are retried, not lost', async () => {
  const scheduled = [];
  const timers = [];
  const { impl, calls } = fakeFetch([{ status: 503 }, new Error('ECONNREFUSED'), { status: 201 }]);
  const pulse = createBusinessPulse({
    url: 'https://t.example/api/ingest',
    key: 'k',
    fetch: impl,
    logger: quiet,
    retryDelays: [10, 20],
    setTimeout: (fn, ms) => {
      scheduled.push(ms);
      timers.push(fn);
      return { fn };
    },
  });
  await pulse.send({ kind: 'event', event: 'a', summary: 'A' });
  assert.equal(pulse.status().queued, 1);
  assert.deepEqual(scheduled, [10]);
  timers.shift()();
  await pulse.flush();
  assert.equal(pulse.status().queued, 1);
  assert.deepEqual(scheduled, [10, 20]);
  timers.shift()();
  await pulse.flush();
  assert.equal(pulse.status().queued, 0);
  assert.equal(pulse.status().sent, 1);
  assert.equal(calls.length, 3);
});

test('a rejected batch is resent one by one and only the bad item is dropped', async () => {
  const { impl, calls } = fakeFetch((events) =>
    events.some((e) => e.bad) ? { status: 400, body: { message: 'bad item' } } : { status: 201 }
  );
  const pulse = createBusinessPulse({ url: 'https://t.example/api/ingest', key: 'k', fetch: impl, logger: quiet });
  await pulse.send([{ id: 1 }, { id: 2, bad: true }, { id: 3 }]);
  assert.equal(pulse.status().queued, 0);
  assert.equal(pulse.status().sent, 2);
  assert.equal(pulse.status().failed, 1);
  assert.equal(calls.length, 4); // 1 batch + 3 singles
});

test('application events carry name and class only, never contact or birth data', () => {
  const app = {
    id: 'APP-1',
    type: 'student',
    forms: {
      student: {
        fullName: 'Ama Owusu',
        currentGrade: 'Basic 3',
        dateOfBirth: '2018-04-02',
        guardianPhone: '0240000000',
        guardianEmail: 'parent@example.com',
      },
    },
  };
  const ev = applicationSubmittedEvent(app);
  const text = JSON.stringify(ev);
  assert.equal(ev.kind, 'event');
  assert.equal(ev.eventId, 'debest:APP-1:submitted');
  assert.match(ev.summary, /Ama Owusu \(Basic 3\)/);
  for (const secret of ['2018-04-02', '0240000000', 'parent@example.com']) assert.ok(!text.includes(secret));

  const status = applicationStatusEvent({ ...app, reviewedAt: '2026-11-01T10:00:00Z' }, 'Submitted', 'approved', 'Headmaster', 'Approved');
  assert.match(status.summary, /Submitted → Approved by Headmaster/);
  assert.equal(status.eventId, 'debest:APP-1:status:approved:2026-11-01T10:00:00Z');
});

test('fee entries become stable money-in movements; voids reverse direction', () => {
  const entry = {
    id: 'L1',
    direction: 'in',
    amount: 450,
    date: '2026-11-02',
    purpose: 'Tuition fees',
    method: 'momo',
    party: 'Mr Mensah',
    studentName: 'Kofi Mensah',
    className: 'JHS 1',
    receiptNo: 'RCT-20261102-001',
  };
  const m = ledgerEntryMovement(entry);
  assert.equal(m.direction, 'in');
  assert.equal(m.customer, 'Mr Mensah');
  assert.equal(m.supplier, undefined);
  assert.equal(m.category, 'Tuition fees');
  assert.equal(m.eventId, 'debest:L1');
  assert.equal(ledgerEntryMovement(entry).eventId, m.eventId);
  assert.match(m.notes, /Kofi Mensah \(JHS 1\)/);

  const v = ledgerEntryVoidMovement({ ...entry, voidReason: 'Wrong amount' }, 'Manager');
  assert.equal(v.direction, 'out');
  assert.equal(v.amount, 450);
  assert.equal(v.eventId, 'debest:L1:void');
  assert.match(v.notes, /Reversal of RCT-20261102-001 by Manager: Wrong amount/);

  const exp = ledgerEntryMovement({ ...entry, id: 'L2', direction: 'out', purpose: 'Utilities', party: 'ECG' });
  assert.equal(exp.direction, 'out');
  assert.equal(exp.supplier, 'ECG');
});

test('ledger input validation rejects bad entries', () => {
  const base = { direction: 'in', amount: '1,200.50', purpose: 'Tuition fees', party: 'Mrs Asante', method: 'momo' };
  const ok = normalizeLedgerInput(base);
  assert.equal(ok.ok, true);
  assert.equal(ok.entry.amount, 1200.5);
  assert.equal(ok.entry.method, 'momo');

  const tomorrow = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
  const cases = [
    [{ direction: 'sideways' }, /money in/],
    [{ amount: 0 }, /above zero/],
    [{ amount: '-50' }, /above zero/],
    [{ amount: 'abc' }, /above zero/],
    [{ amount: 20000000 }, /too large/],
    [{ purpose: 'Utilities' }, /what the money is for/],
    [{ date: tomorrow }, /future/],
    [{ date: '2026-02-31' }, /valid date/],
    [{ party: '   ' }, /who paid/],
    [{ direction: 'out', purpose: 'Utilities', party: '' }, /who was paid/],
  ];
  for (const [patch, msg] of cases) {
    const r = normalizeLedgerInput({ ...base, ...patch });
    assert.equal(r.ok, false, JSON.stringify(patch));
    assert.match(r.error, msg);
  }
  assert.equal(normalizeLedgerInput({ ...base, method: 'bitcoin' }).entry.method, 'cash');
  assert.equal(normalizeLedgerInput({ ...base, direction: 'out', purpose: 'Utilities' }).entry.studentName, '');
});

test('database, backend source and dependencies are never served as static files', () => {
  for (const p of [
    '/data.json',
    '/DATA.JSON',
    '/%64ata.json',
    '/debest-data.json',
    '/server.js',
    '/business-pulse.js',
    '/package.json',
    '/.env',
    '/.git/config',
    '/node_modules/express/package.json',
    '/tests/business-pulse.test.js',
    '/README.md',
    '/%E0%A4%A',
  ]) {
    assert.equal(isPrivatePath(p), true, p);
  }
  for (const p of ['/', '/debest.html', '/debest.js', '/assistant.js', '/admin/fees.html', '/admin/admin-shared.js', '/images/logo.png']) {
    assert.equal(isPrivatePath(p), false, p);
  }
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(server.indexOf('blockPrivateFiles(') < server.indexOf('express.static(__dirname)'));
});

test('fees page is linked from the staff dashboard', () => {
  const base = fs.readFileSync(path.join(__dirname, '..', 'admin', 'terms-calendar-admin-base.html'), 'utf8');
  assert.equal((base.match(/href="\.\/fees\.html"/g) || []).length, 2);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'admin', 'fees.html')));
});
