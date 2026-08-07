const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function normalizeMessages(messages) {
  return (messages || []).map((m) => {
    const copy = Object.assign({}, m);
    if (copy.senderRole === 'Headmaster') copy.senderId = 'hm-1';
    if (copy.recipientRole === 'Headmaster') copy.recipientId = 'hm-1';
    return copy;
  });
}

test('headmaster legacy ids normalize to hm-1', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8'));
  const normalized = normalizeMessages(data.messages || []);
  for (const msg of normalized) {
    if (msg.senderRole === 'Headmaster') assert.equal(msg.senderId, 'hm-1');
    if (msg.recipientRole === 'Headmaster') assert.equal(msg.recipientId, 'hm-1');
  }
});
