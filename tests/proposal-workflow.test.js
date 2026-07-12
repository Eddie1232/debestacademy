const test = require('node:test');
const assert = require('node:assert/strict');
const { PROPOSAL_STATUSES, getNextStatus, applyProposalToEvents } = require('../proposal-workflow');

test('manager approval moves a proposal to headmaster review', () => {
  const nextStatus = getNextStatus('Manager', 'approve', PROPOSAL_STATUSES.PENDING_MANAGER_REVIEW);
  assert.equal(nextStatus, PROPOSAL_STATUSES.AWAITING_HEADMASTER_APPROVAL);
});

test('headmaster approval is only allowed at the final review stage', () => {
  const nextStatus = getNextStatus('Headmaster', 'approve', PROPOSAL_STATUSES.PENDING_MANAGER_REVIEW);
  assert.equal(nextStatus, PROPOSAL_STATUSES.PENDING_MANAGER_REVIEW);
});

test('headmaster approval applies the proposal to the calendar events', () => {
  const events = {
    '2026-07-02': [{ title: 'Existing event', type: 'General', notes: 'Keep' }]
  };

  const nextEvents = applyProposalToEvents(events, {
    event: {
      date: '2026-07-02',
      title: 'Approved activity',
      type: 'Holiday',
      notes: 'Approved by headmaster'
    }
  });

  assert.ok(nextEvents['2026-07-02'].some((item) => item.title === 'Approved activity'));
  assert.equal(nextEvents['2026-07-02'].find((item) => item.title === 'Approved activity').type, 'Holiday');
});
