const test = require('node:test');
const assert = require('node:assert/strict');
const { applyProposalToNews } = require('../proposal-workflow');

test('applyProposalToNews handles resource request proposals as announcements', () => {
  const items = [];
  const proposal = {
    id: '456',
    category: 'resource',
    event: {
      date: '2026-07-15',
      title: 'Projector request for hall',
      type: 'Facility',
      notes: 'Needed for parent presentation on Thursday.'
    },
    reviewedBy: 'Headmaster'
  };

  const nextItems = applyProposalToNews(items, proposal);
  assert.equal(nextItems.length, 1);
  assert.equal(nextItems[0].title, 'Projector request for hall');
  assert.equal(nextItems[0].category, 'Facility');
  assert.equal(nextItems[0].publishedBy, 'Headmaster');
});
