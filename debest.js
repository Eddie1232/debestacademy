if ('scrollRestoration' in history) {
  history.scrollRestoration = 'auto';
}

window.addEventListener('pageshow', function () {
  var navigation = performance.getEntriesByType('navigation')[0];
  var isHistoryNavigation = navigation && navigation.type === 'back_forward';
  if (window.location.hash || isHistoryNavigation) return;
  window.scrollTo(0, 0);
});

(function () {
  function setupCookieConsent() {
    if (document.querySelector('.cookie-consent')) return;
    var stored = null;
    try { stored = localStorage.getItem('debest_cookie_consent'); } catch (e) { /* private browsing */ }
    if (stored) return;
    var banner = document.createElement('aside');
    banner.className = 'cookie-consent';
    document.body.classList.add('cookie-consent-visible');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML = '<p>This site currently uses no optional cookies or advertising trackers. Your choice is saved in this browser.</p>' +
      '<button type="button" class="btn-primary" data-cookie-accept>Accept</button>' +
      '<button type="button" class="btn-secondary" data-cookie-reject>Decline optional cookies</button>';
    document.body.appendChild(banner);
    function close(value) {
      try { localStorage.setItem('debest_cookie_consent', value); } catch (e) { /* continue without storage */ }
      banner.remove();
      document.body.classList.remove('cookie-consent-visible');
    }
    banner.querySelector('[data-cookie-accept]').addEventListener('click', function () { close('accepted'); });
    banner.querySelector('[data-cookie-reject]').addEventListener('click', function () { close('declined'); });
  }

  function setupCookieSettings() {
    document.querySelectorAll('[data-cookie-settings]').forEach(function (button) {
      button.addEventListener('click', function () {
        try { localStorage.removeItem('debest_cookie_consent'); } catch (e) { /* continue */ }
        setupCookieConsent();
        button.focus();
      });
    });
  }

  function setupPolicyLinks() {
    if ((window.location.pathname || '').includes('/admin/')) return;
    var footer = document.querySelector('body > footer');
    if (!footer) {
      footer = document.createElement('footer');
      footer.className = 'no-print';
      document.body.appendChild(footer);
    }
    if (footer.querySelector('.footer-links')) return;
    var base = (window.location.pathname || '').includes('/student/') ? '../' : './';
    var nav = document.createElement('nav');
    nav.className = 'footer-links';
    nav.setAttribute('aria-label', 'Legal and data rights');
    nav.innerHTML = '<a href="' + base + 'policies.html#privacy">Privacy</a>' +
      '<a href="' + base + 'policies.html#terms">Terms</a>' +
      '<a href="' + base + 'policies.html#refunds">Refunds</a>' +
      '<a href="' + base + 'policies.html#cookies">Cookies</a>' +
      '<a href="' + base + 'policies.html#deletion">Delete my data</a>';
    footer.appendChild(nav);
  }

  function makeCrestLink() {
    const crestContainers = document.querySelectorAll('.crest-container');
    if (!crestContainers.length) return;

    const isNestedPage =
      window.location.pathname.includes('/student/') ||
      window.location.pathname.includes('/admin/');
    const adminHref = isNestedPage
      ? new URL('../admin/login.html', window.location.href).toString()
      : new URL('./admin/login.html', window.location.href).toString();

    crestContainers.forEach((container) => {
      if (container.closest('a.crest-link')) return;

      const link = document.createElement('a');
      link.className = 'crest-link';
      link.href = adminHref;
      link.setAttribute('aria-label', 'Staff login');
      link.setAttribute('title', 'Staff login');

      container.replaceWith(link);
      link.appendChild(container);
    });
  }

  function setupMobileNavigation() {
    document.querySelectorAll('header nav ul[id="nav-menu"]').forEach((menu) => {
      const nav = menu.closest('nav');
      const header = nav && nav.closest('header');
      if (!nav || !header || header.querySelector('.site-menu-toggle')) return;

      const toggle = document.createElement('button');
      toggle.className = 'site-menu-toggle';
      toggle.type = 'button';
      toggle.setAttribute('aria-controls', menu.id);
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = 'Menu';
      toggle.addEventListener('click', () => {
        const isOpen = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(isOpen));
      });
      menu.addEventListener('click', (event) => {
        if (event.target.closest('a')) {
          nav.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
      header.insertBefore(toggle, nav);
    });
  }

  function loadAssistantWidget() {
    if (window.__debestAssistantLoader) return;
    window.__debestAssistantLoader = true;
    const path = window.location.pathname || '';
    if (path.includes('/admin/')) return;
    if (document.querySelector('script[src*="assistant.js"]')) return;

    const current = document.querySelector('script[src*="debest.js"]');
    const base = current
      ? current.src.replace(/debest\.js(\?.*)?$/, '')
      : path.includes('/student/')
        ? '../'
        : './';
    const script = document.createElement('script');
    script.src = base + 'assistant.js';
    script.defer = true;
    (document.body || document.documentElement).appendChild(script);
  }

  function bootSharedUi() {
    makeCrestLink();
    setupMobileNavigation();
    loadAssistantWidget();
    setupCookieConsent();
    setupCookieSettings();
    setupPolicyLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootSharedUi, { once: true });
  } else {
    bootSharedUi();
  }
})();

// Smooth scrolling and active link highlighting (in-page hash links only)
var navLinks = document.querySelectorAll('nav ul li a');
for (var i = 0; i < navLinks.length; i++) {
  navLinks[i].addEventListener('click', function (e) {
    var href = this.getAttribute('href') || '';
    // Allow normal navigation for full page links (e.g. contact.html, debest.html#about)
    if (href.charAt(0) !== '#') {
      return;
    }

    var target = document.getElementById(href.substring(1));
    if (!target) {
      return;
    }

    e.preventDefault();

    // Remove active class from all links
    for (var j = 0; j < navLinks.length; j++) {
      navLinks[j].classList.remove('active');
    }

    // Add active class to clicked link
    this.classList.add('active');

    target.scrollIntoView({
      behavior: 'smooth',
    });

    // Update URL hash without page jump
    history.pushState(null, null, href);
  });
}

// Highlight active nav link on scroll
window.addEventListener('scroll', function () {
  var sections = document.querySelectorAll('section');
  var navLinks = document.querySelectorAll('nav ul li a');
  var currentSection = '';

  for (var k = 0; k < sections.length; k++) {
    var sectionTop = sections[k].offsetTop;
    if (window.pageYOffset >= sectionTop - 100) {
      currentSection = sections[k].getAttribute('id');
    }
  }

  for (var l = 0; l < navLinks.length; l++) {
    navLinks[l].classList.remove('active');
    if (navLinks[l].getAttribute('href') === '#' + currentSection) {
      navLinks[l].classList.add('active');
    }
  }
});
document.querySelectorAll('#faq dt').forEach(function (dt) {
  dt.addEventListener('click', function () {
    var dd = document.getElementById(dt.getAttribute('aria-controls'));
    if (!dd) return;
    var isOpen = dd.classList.toggle('active');
    dt.classList.toggle('open', isOpen);
  });
  dt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dt.click();
    }
  });
});
(function () {
  const galleryImgs = Array.from(document.querySelectorAll('.gallery img'));
  if (!galleryImgs.length) return;

  // Build lightbox markup
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.setAttribute('aria-hidden', 'true');
  lightbox.innerHTML = `
    <button class="lightbox__close" aria-label="Close">&times;</button>
    <button class="lightbox__prev" aria-label="Previous image">&#10094;</button>
    <div class="lightbox__content">
      <img src="" alt="" class="lightbox__image">
      <figcaption class="lightbox__caption"></figcaption>
    </div>
    <button class="lightbox__next" aria-label="Next image">&#10095;</button>
  `;
  document.body.appendChild(lightbox);

  const lbImage = lightbox.querySelector('.lightbox__image');
  const lbCaption = lightbox.querySelector('.lightbox__caption');
  const btnClose = lightbox.querySelector('.lightbox__close');
  const btnNext = lightbox.querySelector('.lightbox__next');
  const btnPrev = lightbox.querySelector('.lightbox__prev');

  let currentIndex = -1;
  let lastFocused = null;

  function openLightbox(index) {
    const img = galleryImgs[index];
    const fullSrc = img.dataset.full || img.src;
    lbImage.src = fullSrc;
    lbImage.alt = img.alt || '';
    const figCaption = img.closest('figure')?.querySelector('figcaption');
    lbCaption.textContent = figCaption?.textContent || img.alt || '';
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    currentIndex = index;
    lastFocused = document.activeElement;
    btnClose.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    lbImage.src = '';
    currentIndex = -1;
    if (lastFocused) lastFocused.focus();
  }

  function goToIndex(index) {
    if (index < 0) index = galleryImgs.length - 1;
    if (index >= galleryImgs.length) index = 0;
    openLightbox(index);
  }

  // Setup thumbnails
  galleryImgs.forEach((img, i) => {
    img.style.cursor = 'zoom-in';
    img.tabIndex = img.tabIndex || 0;
    img.addEventListener('click', () => openLightbox(i));
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(i);
      }
    });
  });

  btnClose.addEventListener('click', closeLightbox);
  btnNext.addEventListener('click', () => goToIndex(currentIndex + 1));
  btnPrev.addEventListener('click', () => goToIndex(currentIndex - 1));

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (currentIndex === -1) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') goToIndex(currentIndex - 1);
    if (e.key === 'ArrowRight') goToIndex(currentIndex + 1);
  });
})();
