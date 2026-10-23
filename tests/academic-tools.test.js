const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, validateRows } = require('../academic-tools');

test('CSV parser supports quoted commas and escaped quotes', () => {
  const rows = parseCsv('student_id,student_name,subject,score\nS1,"Ama, Mensah",Science,72\nS2,"Kojo ""KJ"" Owusu",Maths,81');
  assert.equal(rows[0].student_name, 'Ama, Mensah');
  assert.equal(rows[1].student_name, 'Kojo "KJ" Owusu');
});

test('CSV parser rejects unclosed quoted fields', () => {
  assert.throws(() => parseCsv('student_id,student_name,subject,score\nS1,"Ama,Science,72'), /unclosed quoted field/);
});

test('validation uses selected JHS term/year defaults and 100-point maximum', () => {
  const rows = parseCsv('student_id,student_name,subject,score\nS1,Ama,Science,72');
  const result = validateRows(rows, { section: 'JHS', academicYear: '2026/2027', term: 'Term 1' });
  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0].section, 'JHS');
  assert.equal(result.valid[0].maxScore, 100);
  assert.equal(result.valid[0].term, 'Term 1');
});

test('validation reports unsupported sections and scores above maximum', () => {
  const rows = parseCsv('student_id,student_name,subject,score,school_section\nS1,Ama,Science,120,Other');
  const result = validateRows(rows, { section: 'JHS', academicYear: '2026/2027', term: 'Term 1' });
  assert.equal(result.valid.length, 0);
  assert.equal(result.errors.length, 1);
});

test('validation rejects duplicate student-subject rows in one import', () => {
  const rows = parseCsv('student_id,student_name,subject,score\nS1,Ama,Science,72\nS1,Ama,Science,75');
  const result = validateRows(rows, { section: 'JHS', academicYear: '2026/2027', term: 'Term 1' });
  assert.equal(result.valid.length, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Duplicate/);
});

test('validation rejects rows that do not match selected import period', () => {
  const rows = parseCsv('student_id,student_name,subject,score,term\nS1,Ama,Science,72,Term 2');
  const result = validateRows(rows, { section: 'JHS', academicYear: '2026/2027', term: 'Term 1' });
  assert.equal(result.valid.length, 0);
  assert.match(result.errors[0].message, /must match/);
});

test('XLSX parser rejects non-workbook data clearly', () => {
  const { parseXlsxBase64 } = require('../academic-tools');
  assert.throws(() => parseXlsxBase64(Buffer.from('not an xlsx').toString('base64')), /Invalid XLSX workbook/);
});

test('registers academic preview, import, KPI, and report-card routes', () => {
  const { registerAcademicRoutes } = require('../academic-tools');
  const routes = [];
  const app = {
    get: (path, ...handlers) => routes.push('GET ' + path),
    post: (path, ...handlers) => routes.push('POST ' + path),
  };
  const middleware = () => (_req, _res, next) => next();
  registerAcademicRoutes(app, {
    authRequired: middleware(), adminIpAllowed: middleware(), schoolStaffRequired: middleware(),
    roleRequired: () => middleware(),
  });
  assert.ok(routes.includes('POST /api/academic/preview-import'));
  assert.ok(routes.includes('POST /api/academic/import-csv'));
  assert.ok(routes.includes('GET /api/academic/kpi-comparison'));
  assert.ok(routes.includes('GET /api/academic/report-card'));
});
