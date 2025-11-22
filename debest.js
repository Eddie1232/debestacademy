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
