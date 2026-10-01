const test = require('node:test');
const assert = require('node:assert/strict');
const { addNewsItem, removeNewsItem } = require('../proposal-workflow');

test('addNewsItem keeps new headlines in the latest-first order', () => {
  const items = [
    { id: 'old', title: 'Old notice', body: 'Already published', date: '2026-08-01', expiresAt: '2026-08-10' },
  ];

  const next = addNewsItem(items, {
    id: 'new',
    title: 'New notice',
    body: 'This is a fresh update',
    date: '2026-08-15',
    expiresAt: '2026-08-30',
    publishedBy: 'Headmaster',
  });

  assert.equal(next.length, 2);
  assert.equal(next[0].id, 'new');
  assert.equal(next[0].title, 'New notice');
});

test('removeNewsItem deletes the selected headline from the feed', () => {
  const items = [
    { id: 'keep', title: 'Keep me', body: 'Stay', date: '2026-08-01', expiresAt: '2026-08-10' },
    { id: 'remove-me', title: 'Remove me', body: 'Delete', date: '2026-08-02', expiresAt: '2026-08-11' },
  ];

  const next = removeNewsItem(items, 'remove-me');

  assert.equal(next.length, 1);
  assert.equal(next[0].id, 'keep');
});
