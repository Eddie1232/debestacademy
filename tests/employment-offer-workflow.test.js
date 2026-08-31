const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EMPLOYMENT_STAGES,
  isEmploymentApplication,
  normalizeApplicationStatus,
  canTransitionEmployment,
  getNextEmploymentAction,
  canBeginRegistration,
  applyApplicationStatusChange,
  employmentPipelineSnapshot,
  statusLabel,
} = require('../employment-offer-workflow');

test('teaching and non-teaching applications are employment offers', () => {
  assert.equal(isEmploymentApplication('teaching-staff'), true);
  assert.equal(isEmploymentApplication('non-teaching-staff'), true);
  assert.equal(isEmploymentApplication('student'), false);
});

test('new staff applications start as Applied', () => {
  assert.equal(normalizeApplicationStatus('teaching-staff', 'new'), 'applied');
  assert.equal(normalizeApplicationStatus('teaching-staff', undefined), 'applied');
  assert.equal(normalizeApplicationStatus('non-teaching-staff', 'reviewed'), 'interviewed');
});

test('employment pipeline advances one step at a time', () => {
  assert.equal(canTransitionEmployment('applied', 'interviewed'), true);
  assert.equal(canTransitionEmployment('applied', 'selected'), false);
  assert.equal(canTransitionEmployment('interviewed', 'selected'), true);
  assert.equal(canTransitionEmployment('selected', 'accepted'), true);
  assert.equal(canTransitionEmployment('accepted', 'registered'), true);
  assert.equal(canTransitionEmployment('applied', 'registered'), false);
  assert.equal(canTransitionEmployment('selected', 'registered'), false);
});

test('registration can begin only after the offer is accepted', () => {
  assert.equal(canBeginRegistration('applied'), false);
  assert.equal(canBeginRegistration('interviewed'), false);
  assert.equal(canBeginRegistration('selected'), false);
  assert.equal(canBeginRegistration('accepted'), true);
  assert.equal(canBeginRegistration('registered'), false);

  const blocked = applyApplicationStatusChange('teaching-staff', 'selected', 'registered');
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /accepts the offer/i);

  const allowed = applyApplicationStatusChange('teaching-staff', 'accepted', 'registered');
  assert.equal(allowed.ok, true);
  assert.equal(allowed.status, 'registered');
  assert.equal(allowed.registrationStarted, true);
});

test('next action labels match the hiring steps', () => {
  assert.equal(getNextEmploymentAction('applied').status, 'interviewed');
  assert.equal(getNextEmploymentAction('interviewed').status, 'selected');
  assert.equal(getNextEmploymentAction('selected').status, 'accepted');
  assert.equal(getNextEmploymentAction('accepted').status, 'registered');
  assert.equal(getNextEmploymentAction('accepted').label, 'Begin registration');
  assert.equal(getNextEmploymentAction('registered'), null);
  assert.equal(getNextEmploymentAction('rejected'), null);
});

test('candidate may decline after selection or acceptance', () => {
  assert.equal(canTransitionEmployment('selected', 'declined'), true);
  assert.equal(canTransitionEmployment('accepted', 'declined'), true);
  assert.equal(canTransitionEmployment('applied', 'declined'), false);
  assert.equal(canTransitionEmployment('interviewed', 'rejected'), true);
});

test('student applications follow the approval and letter timeline', () => {
  const ok = applyApplicationStatusChange('student', 'new', 'manager_approved');
  assert.equal(ok.ok, true);
  assert.equal(ok.status, 'manager_approved');

  const headmasterApproval = applyApplicationStatusChange(
    'student',
    'manager_approved',
    'headmaster_approved'
  );
  assert.equal(headmasterApproval.ok, true);

  const printed = applyApplicationStatusChange(
    'student',
    'headmaster_approved',
    'admission_letter_printed'
  );
  assert.equal(printed.ok, true);

  const bad = applyApplicationStatusChange('student', 'new', 'accepted');
  assert.equal(bad.ok, false);
});

test('pipeline snapshot marks completed and current stages', () => {
  const snap = employmentPipelineSnapshot('selected');
  assert.equal(snap.length, EMPLOYMENT_STAGES.length);
  assert.equal(snap[0].state, 'done'); // applied
  assert.equal(snap[1].state, 'done'); // interviewed
  assert.equal(snap[2].state, 'current'); // selected
  assert.equal(snap[3].state, 'upcoming'); // accepted
  assert.equal(snap[4].state, 'upcoming'); // registered
  assert.equal(statusLabel('accepted'), 'Accepted offer');
});
