(function () {
  if (window.__debestAssistantMounted) return;
  if ((window.location.pathname || '').includes('/admin/')) return;
  window.__debestAssistantMounted = true;

  function assetBase() {
    const script = document.currentScript;
    if (script && script.src) return script.src.replace(/assistant\.js(\?.*)?$/, '');
    const tagged = document.querySelector('script[src*="assistant.js"]');
    if (tagged && tagged.src) return tagged.src.replace(/assistant\.js(\?.*)?$/, '');
    return (window.location.pathname || '').includes('/student/') ? '../' : './';
  }

  function apiBase() {
    if (location.protocol.startsWith('http') && location.port !== '5500') return location.origin;
    return 'http://127.0.0.1:5501';
  }

  function ensureStyles(base) {
    if (document.querySelector('link[href*="assistant.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = base + 'assistant.css';
    document.head.appendChild(link);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character];
    });
  }

  const SUGGESTIONS = [
    { label: 'School hours', question: 'What are the school hours?' },
    { label: 'How to apply', question: 'How do I apply for admission?' },
    { label: 'Contact the office', question: 'How can I contact the school office?' },
    { label: 'Uniforms', question: 'Are uniforms required?' },
  ];

  const WELCOME =
    'Hello! I can help with admissions, school hours, uniforms, fees, campuses, and how to reach DEBEST Academy. Ask a question or pick a topic below.';

  function mount() {
    const base = assetBase();
    ensureStyles(base);

    const root = document.createElement('div');
    root.className = 'debest-assistant';
    root.innerHTML =
      '<button type="button" class="debest-assistant__toggle" aria-expanded="false" aria-controls="debest-assistant-panel">' +
      '<span class="debest-assistant__icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4 12a8 8 0 0 1 8-8h0a8 8 0 0 1 8 8v2.2a3.8 3.8 0 0 1-3.8 3.8H11l-4.2 3v-3A8 8 0 0 1 4 14.2Z"/>' +
      '<path d="M9 12h.01M12 12h.01M15 12h.01"/>' +
      '</svg></span>' +
      '<span class="debest-assistant__toggle-label">Ask DEBEST</span>' +
      '</button>' +
      '<section id="debest-assistant-panel" class="debest-assistant__panel" role="dialog" aria-labelledby="debest-assistant-title" hidden>' +
      '<header class="debest-assistant__header">' +
      '<div><h2 id="debest-assistant-title">DEBEST Assistant</h2>' +
      '<p>Admissions, hours, and school life</p></div>' +
      '<button type="button" class="debest-assistant__close" aria-label="Close assistant">&times;</button>' +
      '</header>' +
      '<div class="debest-assistant__messages" aria-live="polite"></div>' +
      '<div class="debest-assistant__suggestions"></div>' +
      '<form class="debest-assistant__form">' +
      '<label class="visually-hidden" for="debest-assistant-input">Your question</label>' +
      '<input id="debest-assistant-input" type="text" maxlength="1000" autocomplete="off" placeholder="Ask a question..." />' +
      '<button type="submit" class="debest-assistant__send">Send</button>' +
      '</form>' +
      '</section>';

    document.body.appendChild(root);

    const toggle = root.querySelector('.debest-assistant__toggle');
    const panel = root.querySelector('.debest-assistant__panel');
    const closeBtn = root.querySelector('.debest-assistant__close');
    const messagesEl = root.querySelector('.debest-assistant__messages');
    const suggestionsEl = root.querySelector('.debest-assistant__suggestions');
    const form = root.querySelector('.debest-assistant__form');
    const input = root.querySelector('#debest-assistant-input');
    const sendBtn = root.querySelector('.debest-assistant__send');

    const history = [];

    function addBubble(role, text, pending) {
      const article = document.createElement('article');
      article.className = 'debest-assistant__bubble debest-assistant__bubble--' + role;
      if (pending) article.classList.add('is-pending');
      article.innerHTML = '<p>' + (pending ? 'Thinking…' : escapeHtml(text)) + '</p>';
      messagesEl.appendChild(article);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return article;
    }

    addBubble('assistant', WELCOME);

    SUGGESTIONS.forEach(function (item) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'debest-assistant__chip';
      button.textContent = item.label;
      button.addEventListener('click', function () {
        sendQuestion(item.question);
      });
      suggestionsEl.appendChild(button);
    });

    function setOpen(open) {
      root.classList.toggle('is-open', open);
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        input.focus();
      } else {
        toggle.focus();
      }
    }

    toggle.addEventListener('click', function () {
      setOpen(panel.hidden);
    });
    closeBtn.addEventListener('click', function () {
      setOpen(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !panel.hidden) setOpen(false);
    });

    async function sendQuestion(text) {
      const question = String(text || '').trim();
      if (!question) return;
      if (panel.hidden) setOpen(true);

      addBubble('user', question);
      history.push({ role: 'user', content: question });
      if (history.length > 12) history.splice(0, history.length - 12);

      input.value = '';
      sendBtn.disabled = true;
      const pending = addBubble('assistant', '', true);

      try {
        const res = await fetch(apiBase() + '/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history }),
        });
        const data = await res.json().catch(function () {
          return {};
        });
        const reply =
          (data && data.reply) ||
          data.error ||
          'I could not answer just now. Please call 0244 669 383 or use the Contact page.';
        pending.classList.remove('is-pending');
        pending.querySelector('p').textContent = reply;
        if (data && data.reply) history.push({ role: 'assistant', content: data.reply });
      } catch (err) {
        pending.classList.remove('is-pending');
        pending.querySelector('p').textContent =
          'I could not reach the school. Please call 0244 669 383 or 0244 802 748, or try again in a moment.';
      } finally {
        sendBtn.disabled = false;
        messagesEl.scrollTop = messagesEl.scrollHeight;
        input.focus();
      }
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      sendQuestion(input.value);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
