const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeApplicationForms,
  hasApplicationContact,
  isValidApplicationEmail,
} = require('../application-data');

test('student application data excludes sensitive and unnecessary fields', () => {
  const result = sanitizeApplicationForms('student', {
    student: {
      fullName: 'A. Learner',
      currentGrade: 'KG1',
      healthNotes: 'private',
      homeAddress: 'hidden',
    },
    parent: { fullName: 'Guardian', phone: '0244000000', address: 'hidden' },
    extra: { trackingId: 'not stored' },
  });
  assert.deepEqual(result, {
    student: { fullName: 'A. Learner', currentGrade: 'KG1' },
    parent: { fullName: 'Guardian', phone: '0244000000' },
  });
});

test('employment applications discard referee and emergency-contact fields', () => {
  const result = sanitizeApplicationForms('teaching-staff', {
    teaching: { fullName: 'Applicant', phone: '0244000000', dateOfBirth: '2000-01-01' },
    teachingReferees: { referee1Contact: 'third party contact' },
    teachingQualifications: { highestQualification: 'Degree', referee: 'not allowed' },
  });
  assert.deepEqual(result, {
    teaching: { fullName: 'Applicant', phone: '0244000000' },
    teachingQualifications: { highestQualification: 'Degree' },
    teachingDeclaration: {},
  });
});

test('an application contact must contain a nonblank phone or email', () => {
  assert.equal(hasApplicationContact({ phone: '  ', email: 'guardian@example.com' }), true);
  assert.equal(hasApplicationContact({ phone: '  ', email: '' }), false);
});


test('optional application email is validated only when supplied', () => {
  assert.equal(isValidApplicationEmail(''), true);
  assert.equal(isValidApplicationEmail('parent@example.com'), true);
  assert.equal(isValidApplicationEmail('not-an-email'), false);
  assert.equal(isValidApplicationEmail('parent @example.com'), false);
});


test('employment applicant declaration confirmation is preserved for staff review', () => {
  const result = sanitizeApplicationForms('teaching-staff', {
    teachingDeclaration: { declaration: 'I confirm the information is true.', confirmed: true },
  });
  assert.deepEqual(result.teachingDeclaration, {
    declaration: 'I confirm the information is true.',
    confirmed: true,
  });
});
