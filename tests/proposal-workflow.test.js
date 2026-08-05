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

test('syncApprovedCalendarEvents publishes final approvals onto the shared calendar store', () => {
  const { syncApprovedCalendarEvents } = require('../proposal-workflow');

  const events = {
    '2026-01-06': [{ title: 'Term 1 Begins', type: 'General', notes: 'Students resume.' }]
  };

  const proposals = [
    {
      id: '1',
      category: 'calendar',
      status: 'final_approved',
      event: { date: '2026-07-05', title: 'Term begins', type: 'Assembly', notes: '' }
    },
    {
      id: '2',
      category: 'calendar',
      status: 'awaiting_headmaster_approval',
      event: { date: '2026-07-06', title: 'Not yet public', type: 'Sports', notes: '' }
    },
    {
      id: '3',
      category: 'news',
      status: 'final_approved',
      event: { date: '2026-07-07', title: 'News only', type: 'Announcement', notes: 'Skip for calendar' }
    }
  ];

  const nextEvents = syncApprovedCalendarEvents(events, proposals);
  assert.ok(nextEvents['2026-07-05'].some((item) => item.title === 'Term begins'));
  assert.equal(nextEvents['2026-07-06'], undefined);
  assert.equal(nextEvents['2026-07-07'], undefined);
  assert.ok(nextEvents['2026-01-06'].some((item) => item.title === 'Term 1 Begins'));
});

test('applyProposalToEvents ignores proposals without a valid ISO date', () => {
  const nextEvents = applyProposalToEvents({}, {
    event: { date: 'not-a-date', title: 'Broken', type: 'General', notes: '' }
  });
  assert.deepEqual(nextEvents, {});
});
