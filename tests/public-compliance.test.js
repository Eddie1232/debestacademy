const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('policy page covers required rights and disclosures', () => {
  const policies = read('policies.html');
  for (const section of [
    'privacy',
    'terms',
    'refunds',
    'cookies',
    'accessibility',
    'deletion',
    'children',
    'email',
    'third-parties',
  ]) {
    assert.match(policies, new RegExp(`id="${section}"`));
  }
  assert.match(policies, /Formspree/);
  assert.match(policies, /OpenAI/);
  assert.match(policies, /retention period/);
});

test('application consent is required and recorded by the API', () => {
  const forms = read('forms-modal.html');
  const client = read('forms-modal.js');
  const server = read('server.js');
  assert.equal((forms.match(/data-application-consent/g) || []).length, 3);
  assert.match(client, /privacyAccepted: true/);
  assert.match(client, /guardianConfirmed: setKey === 'student'/);
  assert.match(server, /body\.consent\?\.privacyAccepted !== true/);
  assert.match(server, /body\.consent\?\.guardianConfirmed !== true/);
  assert.match(server, /privacyPolicyVersion/);
});

test('initial applications exclude unnecessary sensitive and third-party data', () => {
  const forms = read('forms-modal.html');
  const client = read('forms-modal.js');
  const server = read('server.js');
  for (const field of [
    'health-blood-group',
    'health-allergies',
    'student-home-address',
    'teach-dob',
    'teach-ref1-contact',
    'nonteach-emergency',
  ]) {
    assert.doesNotMatch(forms, new RegExp(field));
  }
  assert.doesNotMatch(
    client,
    /health-blood-group|health-allergies|teach-ref1-contact|nonteach-emergency/
  );
  assert.match(server, /sanitizeApplicationForms\(type, submittedForms\)/);
  const applicationData = read('application-data.js');
  assert.match(applicationData, /function sanitizeApplicationForms/);
  assert.match(applicationData, /function hasApplicationContact/);
});

test('assistant data use is disclosed and requires user acknowledgement', () => {
  const widget = read('assistant.js');
  const policy = read('policies.html');
  assert.match(widget, /debest-assistant-consent/);
  assert.match(widget, /if \(!consent\.checked\)/);
  assert.match(policy, /conversation is sent from the school server to OpenAI/);
});

test('unsupported testimonial pages are removed and homepage makes no fabricated endorsements', () => {
  const home = read('debest.html');
  assert.match(
    home,
    /only share feedback after it has been received\s+directly, verified, and approved for publication by its author/i
  );
  for (const file of ['parents-reviews.html', 'students-reviews.html', 'teachers-reviews.html']) {
    assert.equal(fs.existsSync(path.join(root, file)), false);
  }
  assert.doesNotMatch(home, /Mary Koomson|Ama Koomson|Miss Kwaku/);
});

test('programmes page only states verified levels and distinguishes school hours from class timetables', () => {
  const programmes = read('programmes.html');
  for (const level of ['Creche', 'Kindergarten (KG)', 'Primary', 'Junior High School (JHS)']) {
    assert.ok(programmes.includes(level), `missing listed level: ${level}`);
  }
  assert.match(programmes, /published school-day hours are Monday to Friday, 7:45 AM to 3:00 PM/i);
  assert.match(programmes, /Individual class timetables.*are not listed/i);
  assert.match(programmes, /Contact admissions for current class placement, curriculum information, learning expectations, and timetable/);
  assert.doesNotMatch(programmes, /guaranteed|top-ranked|100% pass|award-winning/i);
});

test('shared public navigation provides an accessible mobile menu', () => {
  const client = read('debest.js');
  const css = read('debest.css');
  assert.match(client, /aria-controls/);
  assert.match(client, /aria-expanded/);
  assert.match(client, /setupMobileNavigation/);
  assert.match(css, /\.site-menu-toggle/);
  assert.match(css, /header nav\.is-open/);
});

test('news loading uses the moving skeleton and respects reduced motion', () => {
  const home = read('debest.html');
  const css = read('debest.css');
  assert.match(home, /class="news-skeleton"/);
  assert.match(home, /aria-busy="true"/);
  assert.match(css, /@keyframes skeleton-wave/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('all HTML images declare alternative text', () => {
  const files = fs
    .readdirSync(root, { recursive: true })
    .filter((file) => file.endsWith('.html') && !file.startsWith('node_modules/'));
  for (const file of files) {
    const html = read(file);
    for (const image of html.matchAll(/<img\b[^>]*>/gs)) {
      assert.match(image[0], /\balt\s*=/i, `${file} has an image without alt text`);
    }
  }
});

test('image rights are explicitly tracked as pending rather than assumed', () => {
  const register = read('ASSET_RIGHTS.md');
  assert.match(register, /no signed releases or licensing records/);
  assert.equal((register.match(/\|\s*Unverified\s*\|/g) || []).length, 15);
});
