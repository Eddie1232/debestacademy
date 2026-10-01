/**
 * Public website assistant: school knowledge, request validation,
 * OpenAI replies, and a local FAQ fallback when no API key is set.
 */

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-5.6-luna';
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1000;
const ASSISTANT_WINDOW_MS = 15 * 60 * 1000;
const ASSISTANT_MAX_REQUESTS = 20;

const SCHOOL_FACTS = `
DEBEST Academy is a private school in Ghana offering education from Creche through Junior High School (JHS).
Tagline: EDUCATION GOOD AS GOLD.
School hours: Monday to Friday, 7:45 AM to 3:00 PM.
The public website lists campuses in Dansoman and Kasoa. Contact the office to confirm visit arrangements.

Contact:
- Phone: 0244 669 383 and 0244 802 748 (Ghana)
- WhatsApp: https://wa.me/233244669383
- PTA email: pta@debestacademy.com
- Written messages: contact form on contact.html
- For urgent matters, call the office during working hours

Admission:
- Levels: Creche, KG, Primary, JHS
- Steps: submit an enquiry or application, contact the school about a visit and current requirements, then follow the school's placement instructions
- Apply at apply.html — student admission forms, teaching staff forms, and non-teaching staff forms
For current documents, fees, uniforms, meals, transport, class sizes, schedules, and support arrangements, contact the school office; do not assume availability or invent terms.
The Terms Calendar is available at student/terms-calendar.html.
Do not request sensitive or identifying information about a child in chat.
`.trim();

const FAQ_ANSWERS = [
  {
    keys: ['hour', 'time', 'open', 'close', 'schedule', 'when do you', 'school day'],
    answer:
      'The school day is listed as 7:45 AM to 3:00 PM, Monday through Friday. Call the office to confirm holiday or event schedules.',
  },
  {
    keys: ['apply', 'admission', 'enrol', 'enroll', 'join', 'new student', 'how do i apply'],
    answer:
      'Start on the Apply page (apply.html), then contact admissions for the current document checklist and next steps. You can call 0244 669 383 or 0244 802 748.',
  },
  {
    keys: ['document', 'documents', 'records', 'enroll', 'enrol', 'enrollment'],
    answer:
      'The website does not publish a complete document checklist. Contact the admissions office for the current document checklist. For a visit, call the office or use the contact form.',
  },
  {
    keys: ['scholarship', 'bursary', 'financial aid'],
    answer:
      'Contact admissions to ask whether financial support is currently available and what its terms are.',
  },
  {
    keys: ['uniform', 'dress', 'clothes', 'attire'],
    answer:
      'Contact the school office for current uniform requirements.',
  },
  {
    keys: ['meal', 'food', 'lunch', 'canteen', 'diet'],
    answer:
      'Contact the school office to confirm current meal arrangements and any dietary support.',
  },
  {
    keys: ['bus', 'transport', 'pickup', 'van'],
    answer:
      'Contact the school office to confirm whether transport is currently available and to request current route information.',
  },
  {
    keys: ['fee', 'pay', 'tuition', 'bank', 'receipt'],
    answer:
      'Request the current written fee schedule and approved payment instructions from the school office before making a payment.',
  },
  {
    keys: ['contact', 'phone', 'call', 'whatsapp', 'email', 'number'],
    answer:
      'Call the office on 0244 669 383 or 0244 802 748 (Monday–Friday, 7:45 AM–3:00 PM). WhatsApp: https://wa.me/233244669383. PTA email: pta@debestacademy.com. You can also use the contact form.',
  },
  {
    keys: ['campus', 'dansoman', 'kasoa', 'location', 'where', 'address', 'tour', 'visit'],
    answer:
      'DEBEST Academy has a Dansoman campus and a Kasoa campus. Book a tour when you apply, or call the office to schedule a visit.',
  },
  {
    keys: ['ratio', 'class size', 'how many student', 'teacher'],
    answer:
      'Contact admissions for current class-size and staffing information.',
  },
  {
    keys: ['platform', 'parent portal', 'login', 'announcement'],
    answer:
      'The student/parent platform is at student/parent_platform.html. Access is granted after registration. You can view announcements, calendars, and messages there.',
  },
  {
    keys: ['calendar', 'exam', 'term date', 'timetable', 'holiday'],
    answer:
      'Exam schedules, term dates, and school events are on the Terms Calendar page. Approved updates appear there after the Headmaster publishes them.',
  },
  {
    keys: ['absent', 'absence', 'sick', 'miss school'],
    answer:
      'Notify the school office as soon as possible by phone or the contact form. Send a note explaining the absence when your child returns.',
  },
  {
    keys: ['pta', 'parent teacher', 'volunteer'],
    answer:
      'The PTA brings parents and teachers together for events, student support, and community programmes. Email pta@debestacademy.com or visit pta.html. Parents may volunteer for approved events.',
  },
  {
    keys: ['after school', 'club', 'sport', 'music', 'extra'],
    answer:
      'Contact the school office for current after-school activity information.',
  },
  {
    keys: ['progress', 'report', 'result', 'grade'],
    answer:
      'Ask the school office how and when student progress information is shared.',
  },
  {
    keys: ['transfer', 'withdraw', 'leave the school'],
    answer:
      'Contact admissions for the current transfer or withdrawal process and any records needed.',
  },
  {
    keys: ['complaint', 'concern', 'problem'],
    answer:
      'Please submit complaints through the contact form or speak with the school administration so they can be addressed promptly. For urgent matters, call 0244 669 383.',
  },
  {
    keys: ['creche', 'kg', 'primary', 'jhs', 'junior high', 'age', 'level'],
    answer:
      'DEBEST Academy serves children from Creche through Junior High School (JHS), including KG and Primary.',
  },
  {
    keys: ['staff', 'job', 'employment', 'vacancy', 'teach'],
    answer:
      'Teaching and non-teaching staff can apply on the Apply page (apply.html) using the staff forms. Submit online, then print and deliver signed copies to the office where required.',
  },
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMessages(body) {
  const raw = body && Array.isArray(body.messages) ? body.messages : null;
  if (!raw || !raw.length) {
    return { error: 'Please send a question.', status: 400 };
  }
  if (raw.length > MAX_MESSAGES) {
    return { error: 'Too many messages in this conversation. Start a new chat.', status: 400 };
  }

  const messages = [];
  for (const item of raw) {
    if (!item || (item.role !== 'user' && item.role !== 'assistant')) {
      return { error: 'Each message must come from you or the assistant.', status: 400 };
    }
    const content = typeof item.content === 'string' ? item.content.trim() : '';
    if (!content) {
      return { error: 'Message text is required.', status: 400 };
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      return { error: 'Please keep each message under 1000 characters.', status: 400 };
    }
    messages.push({ role: item.role, content });
  }

  if (messages[messages.length - 1].role !== 'user') {
    return { error: 'The last message must be your question.', status: 400 };
  }

  return { messages };
}

function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
}

function localAnswer(messages) {
  const question = lastUserText(messages);
  const normalized = normalizeText(question);

  if (!normalized) {
    return fallbackReply();
  }

  if (/^(hi|hello|hey|good morning|good afternoon|good evening|howdy)\b/.test(normalized)) {
    return 'Hello! I am the DEBEST Academy assistant. I can help with admissions, school hours, uniforms, fees, campuses, and how to reach the office. What would you like to know?';
  }

  let best = null;
  let bestScore = 0;
  for (const entry of FAQ_ANSWERS) {
    let score = 0;
    for (const key of entry.keys) {
      if (normalized.includes(key)) score += key.split(' ').length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (best && bestScore >= 1) return best.answer;
  return fallbackReply();
}

const ADMIN_FAQ_ANSWERS = [
  {
    keys: ['admission', 'application', 'enrol', 'enroll', 'parent meeting', 'records', 'supporting documents'],
    answer:
      'Guide the parent to the online application, then confirm the current document checklist and next steps with admissions. Ask the family to share only records requested for the application.',
  },
  {
    keys: ['tour', 'visit', 'campus', 'school tour', 'parent visit'],
    answer:
      'Offer a tour or campus visit by coordinating with the school office. Families can request a visit when they apply or call to book a time during working hours.',
  },
  {
    keys: ['scholarship', 'financial need', 'support', 'bursary'],
    answer:
      'Ask the admissions office whether financial support is currently available and what its terms are. Do not promise that a programme or award exists.',
  },
  {
    keys: ['transfer', 'withdraw', 'leave', 'records', 'previous school'],
    answer:
      'For transfers or withdrawals, direct the family to admissions to confirm the current process and any records needed.',
  },
  {
    keys: ['complaint', 'concern', 'issue', 'discipline', 'safeguarding'],
    answer:
      'Escalate concerns through the school administration or the contact form. For urgent matters, advise families to call the office directly during working hours.',
  },
];

function fallbackReply() {
  return (
    'I do not have that specific detail here. Please call the school office on 0244 669 383 or 0244 802 748 ' +
    '(Monday–Friday, 7:45 AM–3:00 PM), use WhatsApp at https://wa.me/233244669383, or send a message on the Contact page. ' +
    'You can also browse the FAQ page for common answers.'
  );
}

function adminLocalAnswer(messages) {
  const question = lastUserText(messages);
  const normalized = normalizeText(question);

  if (!normalized) {
    return localAnswer(messages);
  }

  let best = null;
  let bestScore = 0;
  for (const entry of ADMIN_FAQ_ANSWERS) {
    let score = 0;
    for (const key of entry.keys) {
      if (normalized.includes(key)) score += key.split(' ').length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (best && bestScore >= 1) return best.answer;
  return localAnswer(messages);
}

function formatNews(news) {
  const items = news && Array.isArray(news.items) ? news.items : [];
  if (!items.length) return 'No published headlines at the moment.';
  return items
    .slice(0, 6)
    .map((item) => {
      const title = item && item.title ? String(item.title) : 'News';
      const date = item && item.date ? ` (${item.date})` : '';
      const body = item && item.body ? String(item.body).slice(0, 180) : '';
      return `- ${title}${date}${body ? ': ' + body : ''}`;
    })
    .join('\n');
}

function eventTitle(value) {
  if (!value) return 'Event';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(eventTitle).filter(Boolean).join(', ') || 'Event';
  }
  if (typeof value === 'object') return value.title || value.name || 'Event';
  return 'Event';
}

function formatUpcomingEvents(termCalendar) {
  const events = (termCalendar && termCalendar.events) || {};
  const today = new Date().toISOString().slice(0, 10);
  const dates = Object.keys(events)
    .filter((date) => date >= today)
    .sort()
    .slice(0, 8);
  if (!dates.length) return 'No upcoming calendar items published.';
  return dates.map((date) => `- ${date}: ${eventTitle(events[date])}`).join('\n');
}

function buildSystemPrompt(context) {
  const news = formatNews(context && context.news);
  const calendar = formatUpcomingEvents(context && context.termCalendar);
  return `You are the public website assistant for DEBEST Academy, a school in Ghana.
Answer parents, students, and applicants in warm, clear, concise English.
Use only the school facts below plus the latest news and calendar items. If a detail is missing (especially fee amounts, personal records, medical advice, or unpublished dates), say you do not have it and point them to the office.
Do not invent facts. Do not complete homework or exams. Do not pretend to access a child’s file.
For official, urgent, or sensitive matters, direct people to call 0244 669 383 or 0244 802 748.
Keep replies short (a few sentences). You may mention useful pages such as apply.html, contact.html, faq.html, pta.html, or student/parent_platform.html.

SCHOOL FACTS:
${SCHOOL_FACTS}

LATEST NEWS:
${news}

UPCOMING CALENDAR:
${calendar}`;
}

function extractChatText(data) {
  if (!data || typeof data !== 'object') return '';
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const choice = data.choices && data.choices[0];
  const fromChoice = choice && choice.message && choice.message.content;
  if (typeof fromChoice === 'string' && fromChoice.trim()) return fromChoice.trim();
  if (Array.isArray(data.output)) {
    const parts = [];
    for (const item of data.output) {
      const content = item && item.content;
      if (typeof content === 'string') parts.push(content);
      else if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block.text === 'string') parts.push(block.text);
        }
      }
    }
    return parts.join('\n').trim();
  }
  return '';
}

async function callOpenAI(messages, systemPrompt, deps) {
  const fetchFn = (deps && deps.fetch) || globalThis.fetch;
  const apiKey = (deps && deps.apiKey) || process.env.OPENAI_API_KEY;

  if (!apiKey || typeof fetchFn !== 'function') return null;

  const model =
    (deps && deps.model) ||
    process.env.OPENAI_MODEL ||
    DEFAULT_MODEL;

  const input = [
    {
      role: 'system',
      content: systemPrompt
    },
    ...messages
  ];

  const response = await fetchFn(`${OPENAI_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input,
      max_output_tokens: 450
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `OpenAI request failed (${response.status}) ${detail.slice(0, 180)}`
    );
  }

  const data = await response.json();

  // OpenAI Responses API provides the convenient output_text field.
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  // Fallback parser in case output_text isn't present.
  const text = extractChatText(data);

  if (!text) {
    throw new Error('OpenAI returned an empty reply');
  }

  return text;
}

function buildAdminSystemPrompt(context) {
  const news = formatNews(context && context.news);
  const calendar = formatUpcomingEvents(context && context.termCalendar);
  return `You are the staff assistant for DEBEST Academy.
Support the school office, admissions team, and administrators with clear, practical guidance for parents, applicants, and school operations.
Use only the verified school facts below and the latest news/calendar items. When a detail is missing, say so and encourage staff to use the office or official forms.
Do not invent fee amounts, child records, or private information.
Keep replies brief, professional, and parent-friendly.

SCHOOL FACTS:
${SCHOOL_FACTS}

LATEST NEWS:
${news}

UPCOMING CALENDAR:
${calendar}`;
}

async function handleAssistantChat(body, context, deps) {
  const parsed = parseMessages(body);
  if (parsed.error) return parsed;

  try {
    const ai = await callOpenAI(parsed.messages, buildSystemPrompt(context || {}), deps);
    if (ai) return { reply: ai, source: 'ai' };
  } catch (err) {
    console.error('[assistant] model error:', err && err.message ? err.message : err);
  }

  return { reply: localAnswer(parsed.messages), source: 'local' };
}

async function handleAdminAssistantChat(body, context, deps) {
  const parsed = parseMessages(body);
  if (parsed.error) return parsed;

  try {
    const ai = await callOpenAI(parsed.messages, buildAdminSystemPrompt(context || {}), deps);
    if (ai) return { reply: ai, source: 'ai' };
  } catch (err) {
    console.error('[assistant:admin] model error:', err && err.message ? err.message : err);
  }

  return { reply: adminLocalAnswer(parsed.messages), source: 'local' };
}

const assistantRequestCounts = new Map();

function assistantRateLimit(req, res, next) {
  const xf = req.headers && req.headers['x-forwarded-for'];
  const ip =
    (typeof xf === 'string' && xf.split(',')[0].trim()) ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown';
  const now = Date.now();
  const entry = assistantRequestCounts.get(ip) || { count: 0, start: now };
  if (now - entry.start > ASSISTANT_WINDOW_MS) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  assistantRequestCounts.set(ip, entry);
  if (entry.count > ASSISTANT_MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many assistant questions from this network. Please try again in a few minutes, or call the office.',
    });
  }
  return next();
}

module.exports = {
  SCHOOL_FACTS,
  parseMessages,
  localAnswer,
  adminLocalAnswer,
  buildSystemPrompt,
  buildAdminSystemPrompt,
  handleAssistantChat,
  handleAdminAssistantChat,
  assistantRateLimit,
  formatNews,
  formatUpcomingEvents,
  extractChatText,
};
