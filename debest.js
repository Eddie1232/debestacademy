// Smooth scrolling and active link highlighting
        var navLinks = document.querySelectorAll('nav ul li a');
        for (var i = 0; i < navLinks.length; i++) {
            navLinks[i].addEventListener('click', function(e) {
                e.preventDefault();
                
                // Remove active class from all links
                for (var j = 0; j < navLinks.length; j++) {
                    navLinks[j].classList.remove('active');
                }
                
                // Add active class to clicked link
                this.classList.add('active');
                
                // Get target section ID
                var targetId = this.getAttribute('href').substring(1);// Smooth scroll to section
                document.getElementById(targetId).scrollIntoView({ 
                    behavior: 'smooth' 
                });
                
                // Update URL hash without page jump
                history.pushState(null, null, '#' + targetId);
            });
        }
        
        // Highlight active nav link on scroll
        window.addEventListener('scroll', function() {
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
        document.querySelectorAll('#faq dt').forEach(function(dt) {
    dt.addEventListener('click', function() {
      var dd = document.getElementById(dt.getAttribute('aria-controls'));
      dd.classList.toggle('active');
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
