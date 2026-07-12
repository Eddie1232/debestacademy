const test = require('node:test');
const assert = require('node:assert/strict');
const { applyProposalToNews } = require('../proposal-workflow');

test('applyProposalToNews adds a news item when a proposal is approved', () => {
  const items = [];
  const proposal = {
    id: '123',
    category: 'news',
    event: {
      date: '2026-07-10',
      title: 'New school announcement',
      type: 'Announcement',
      notes: 'The library opens at 8 AM.'
    },
    reviewedBy: 'Headmaster'
  };

  const nextItems = applyProposalToNews(items, proposal);
  assert.equal(nextItems.length, 1);
  assert.equal(nextItems[0].title, 'New school announcement');
  assert.equal(nextItems[0].body, 'The library opens at 8 AM.');
  assert.equal(nextItems[0].publishedBy, 'Headmaster');
});
