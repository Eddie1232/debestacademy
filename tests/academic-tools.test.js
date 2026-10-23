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
