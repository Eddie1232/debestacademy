/**
 * Public website assistant: school knowledge, request validation,
 * SpaceXAI (xAI) replies, and a local FAQ fallback when no API key is set.
 */

const XAI_BASE_URL = 'https://api.x.ai/v1';
const DEFAULT_MODEL = 'grok-4.5';
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1000;
const ASSISTANT_WINDOW_MS = 15 * 60 * 1000;
const ASSISTANT_MAX_REQUESTS = 20;

const SCHOOL_FACTS = `
DEBEST Academy is a private school in Ghana offering education from Creche through Junior High School (JHS).
Tagline: EDUCATION GOOD AS GOLD.
Mission: create a conducive environment that equips students with confidence and leadership through quality teaching, care, and morally based training.
Vision: to be recognised as an outstanding top private institution offering high-quality education with strong religious, moral, and academic training.
Values: faith-based values, positive discipline, academic support, creative arts, sports, leadership, and a safe family-oriented environment.

Campuses:
- Dansoman campus — school activities and cultural programmes
- Kasoa campus — school activities and events
Parents may book a tour when applying or by calling the office.

School hours: Monday to Friday, 7:45 AM to 3:00 PM. Weekend closed except scheduled events. Holidays: office closed; leave a message online.
After-school activities (sports, music, clubs, academic support) are offered on selected days.

Contact:
- Phone: 0244 669 383 and 0244 802 748 (Ghana)
- WhatsApp: https://wa.me/233244669383
- PTA email: pta@debestacademy.com
- Written messages: contact form on contact.html; typical reply in 1–2 working days
- For urgent matters, call the office during working hours
- Include the child’s name and class when writing about a pupil

Admission:
- Levels: Creche, KG, Primary, JHS
- Steps: 1) Submit an enquiry / online application 2) Visit the school 3) Provide records 4) Confirm admission
- Required: completed application form, past school records, birth certificate, and a parent/guardian meeting
- Apply at apply.html — student admission forms, teaching staff forms, and non-teaching staff forms
- After submitting online, print and deliver signed copies to the school office within one week where required
- Scholarships: apply through the admissions office; awards consider academic performance, exam results, and financial need
- Transfers: contact admissions; previous school records and approvals are needed

Fees: can be paid online, at the school office, or through approved bank deposits. Keep receipts. Do not invent specific fee amounts.

Uniforms: required every day, including PE days and formal events.
Meals: nutritious meals prepared on campus daily; special dietary needs accommodated when notified in advance.
Bus: school bus service on selected routes; register early.
Class size: about 20 students per teacher.
New students: orientation, mentoring, and a welcome programme.
Progress: reports each term via the student/parent platform and parent meetings.
Exam schedules and term dates: Terms Calendar (student/terms-calendar.html), updated by administration after Headmaster approval.
Absence: notify the office by phone or the contact form as soon as possible; send a note when the child returns.
Teacher contact: student/parent platform messages or scheduled parent-teacher conferences.
Platforms: student/parent platform (student/parent_platform.html) and PTA (pta.html). Access after registration.
PTA: connects families and teachers; supports events, student activities, and community programmes. Volunteer for approved events and PTA activities.
Safety: supervised arrival/departure, secure campus access, regular safety drills.
Complaints: contact form or school administration.
Policies: Admissions & Enrolment, Attendance & Discipline, Child Safety, Parent Communication — available on the website and from the office.
Staff: Headmaster (leadership), teaching team, administrative team, pastoral care.
Photo library and reviews pages are on the public site.
`.trim();

const FAQ_ANSWERS = [
  {
    keys: ['hour', 'time', 'open', 'close', 'schedule', 'when do you', 'school day'],
    answer:
      'The school day runs from 7:45 AM to 3:00 PM, Monday through Friday. After-school activities are offered on selected days. The office is closed on weekends except for scheduled events.',
  },
  {
    keys: ['apply', 'admission', 'enrol', 'enroll', 'join', 'new student', 'how do i apply'],
    answer:
      'Start on the Apply page (apply.html) and complete the student admission form. You will also need past school records, a birth certificate, and a parent/guardian meeting. After submitting online, print and bring signed copies to the office within one week where required. You can also call 0244 669 383 or 0244 802 748.',
  },
  {
    keys: ['scholarship', 'bursary', 'financial aid'],
    answer:
      'Scholarship applications go through the admissions office. Awards consider academic performance, exam results, and financial need. Call the office or use the contact form to start.',
  },
  {
    keys: ['uniform', 'dress', 'clothes', 'attire'],
    answer:
      'Yes. Students wear the school uniform every day, including PE days and formal school events.',
  },
  {
    keys: ['meal', 'food', 'lunch', 'canteen', 'diet'],
    answer:
      'Nutritious meals are prepared on campus each day. Tell the office in advance if your child has special dietary needs.',
  },
  {
    keys: ['bus', 'transport', 'pickup', 'van'],
    answer:
      'Yes, a school bus service runs on selected routes. Register early to secure a seat. Ask the office for the current routes list.',
  },
  {
    keys: ['fee', 'pay', 'tuition', 'bank', 'receipt'],
    answer:
      'Fees can be paid online, at the school office, or through approved bank deposits. Please keep your receipts. For the current amount, contact the office — I do not quote fee figures here.',
  },
  {
    keys: ['contact', 'phone', 'call', 'whatsapp', 'email', 'number'],
    answer:
      'Call the office on 0244 669 383 or 0244 802 748 (Monday–Friday, 7:45 AM–3:00 PM). WhatsApp: https://wa.me/233244669383. PTA email: pta@debestacademy.com. You can also use the contact form; we typically reply in 1–2 working days.',
  },
  {
    keys: ['campus', 'dansoman', 'kasoa', 'location', 'where', 'address', 'tour', 'visit'],
    answer:
      'DEBEST Academy has a Dansoman campus and a Kasoa campus. Book a tour when you apply, or call the office to schedule a visit.',
  },
  {
    keys: ['ratio', 'class size', 'how many student', 'teacher'],
    answer:
      'Average class size is about 20 students per teacher so learners get individual attention.',
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
      'Yes. We offer sports, music, clubs, and academic support sessions after school on selected days.',
  },
  {
    keys: ['progress', 'report', 'result', 'grade'],
    answer:
      'Progress reports are shared each term through the student/parent platform and at parent meetings.',
  },
  {
    keys: ['transfer', 'withdraw', 'leave the school'],
    answer:
      'Contact admissions for the transfer or withdrawal process. You will need records from the current school and the required approvals.',
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

function fallbackReply() {
  return (
    'I do not have that specific detail here. Please call the school office on 0244 669 383 or 0244 802 748 ' +
    '(Monday–Friday, 7:45 AM–3:00 PM), use WhatsApp at https://wa.me/233244669383, or send a message on the Contact page. ' +
    'You can also browse the FAQ page for common answers.'
  );
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

async function callXai(messages, systemPrompt, deps) {
  const fetchFn = (deps && deps.fetch) || globalThis.fetch;
  const apiKey = (deps && deps.apiKey) || process.env.XAI_API_KEY;
  if (!apiKey || typeof fetchFn !== 'function') return null;

  const model = (deps && deps.model) || process.env.XAI_MODEL || DEFAULT_MODEL;
  const payloadMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const chatRes = await fetchFn(`${XAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 450,
      messages: payloadMessages,
    }),
  });

  if (chatRes.ok) {
    const data = await chatRes.json();
    const text = extractChatText(data);
    if (text) return text;
  }

  const responsesRes = await fetchFn(`${XAI_BASE_URL}/responses`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      input: payloadMessages,
    }),
  });

  if (!responsesRes.ok) {
    const detail = await responsesRes.text().catch(() => '');
    throw new Error(`xAI request failed (${responsesRes.status}) ${detail.slice(0, 180)}`);
  }

  const data = await responsesRes.json();
  const text = extractChatText(data);
  if (!text) throw new Error('xAI returned an empty reply');
  return text;
}

async function handleAssistantChat(body, context, deps) {
  const parsed = parseMessages(body);
  if (parsed.error) return parsed;

  try {
    const ai = await callXai(parsed.messages, buildSystemPrompt(context || {}), deps);
    if (ai) return { reply: ai, source: 'ai' };
  } catch (err) {
    console.error('[assistant] model error:', err && err.message ? err.message : err);
  }

  return { reply: localAnswer(parsed.messages), source: 'local' };
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
  buildSystemPrompt,
  handleAssistantChat,
  assistantRateLimit,
  formatNews,
  formatUpcomingEvents,
  extractChatText,
};
