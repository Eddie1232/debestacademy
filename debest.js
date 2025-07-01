  // Smooth scrolling and active link highlight
        document.querySelectorAll('nav ul li a').forEach('link') ;
            link.addEventListener('click'), (e) => 
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                document.getElementById(targetId).scrollIntoView({ behavior: 'smooth' });
                document.querySelectorAll('nav ul li a').forEach(a => a.classList.remove('active'));