const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseMessages,
  localAnswer,
  handleAssistantChat,
  formatNews,
  formatUpcomingEvents,
  extractChatText,
} = require('../assistant-service');

test('parseMessages rejects empty payloads', () => {
  const result = parseMessages({});
  assert.equal(result.status, 400);
  assert.match(result.error, /question/i);
});

test('parseMessages accepts a short user question', () => {
  const result = parseMessages({
    messages: [{ role: 'user', content: 'What are the school hours?' }],
  });
  assert.equal(result.error, undefined);
  assert.equal(result.messages.length, 1);
});

test('parseMessages rejects oversized text', () => {
  const result = parseMessages({
    messages: [{ role: 'user', content: 'a'.repeat(1001) }],
  });
  assert.equal(result.status, 400);
});

test('localAnswer knows school hours', () => {
  const reply = localAnswer([{ role: 'user', content: 'What time does school start?' }]);
  assert.match(reply, /7:45/);
  assert.match(reply, /3:00/);
});

test('localAnswer knows how to apply', () => {
  const reply = localAnswer([{ role: 'user', content: 'How do I apply for admission?' }]);
  assert.match(reply, /apply\.html/i);
});

test('localAnswer does not invent fee amounts', () => {
  const reply = localAnswer([{ role: 'user', content: 'How much are the school fees?' }]);
  assert.doesNotMatch(reply, /GHS|cedi|₵|\d{3,}/i);
  assert.match(reply, /office/i);
});

test('localAnswer greets visitors', () => {
  const reply = localAnswer([{ role: 'user', content: 'Hello' }]);
  assert.match(reply, /DEBEST/i);
});

test('handleAssistantChat uses local fallback without an API key', async () => {
  const result = await handleAssistantChat(
    { messages: [{ role: 'user', content: 'Are uniforms required?' }] },
    { news: { items: [] }, termCalendar: { events: {} } },
    { apiKey: '', fetch: async () => {
      throw new Error('should not call the model without a key');
    } }
  );
  assert.equal(result.source, 'local');
  assert.match(result.reply, /uniform/i);
});

test('handleAssistantChat uses the model when it returns text', async () => {
  const result = await handleAssistantChat(
    { messages: [{ role: 'user', content: 'Where are the campuses?' }] },
    { news: { items: [] }, termCalendar: { events: {} } },
    {
      apiKey: 'test-key',
      fetch: async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Dansoman and Kasoa campuses.' } }],
        }),
      }),
    }
  );
  assert.equal(result.source, 'ai');
  assert.match(result.reply, /Dansoman/);
});

test('formatNews and calendar helpers stay readable', () => {
  const news = formatNews({
    items: [{ title: 'Sports day', date: '2026-09-01', body: 'Bring water.' }],
  });
  assert.match(news, /Sports day/);

  const calendar = formatUpcomingEvents({
    events: { '2099-01-02': { title: 'Open day' } },
  });
  assert.match(calendar, /Open day/);
});

test('extractChatText reads chat and responses payloads', () => {
  assert.equal(
    extractChatText({ choices: [{ message: { content: 'Hello from chat' } }] }),
    'Hello from chat'
  );
  assert.equal(extractChatText({ output_text: 'Hello from responses' }), 'Hello from responses');
});
