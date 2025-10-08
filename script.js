// Custom cursor animation
const cursor = document.querySelector('.cursor-dot');

document.addEventListener('mousemove', (e) => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
});

// Complex Fourier Series Visualization
const canvas = document.getElementById('fourierCanvas');
if (canvas) {
    const ctx = canvas.getContext('2d');
    let animationFrame;
    let time = 0;

    function resizeCanvas() {
        const container = canvas.parentElement;
        canvas.width = container.offsetWidth;
        canvas.height = 140;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Complex signal parameters
    const harmonics = [
        { freq: 1, amp: 30, phase: 0 },
        { freq: 2, amp: 20, phase: Math.PI / 4 },
        { freq: 3, amp: 15, phase: Math.PI / 2 },
        { freq: 5, amp: 12, phase: Math.PI / 3 },
        { freq: 7, amp: 8, phase: Math.PI / 6 },
        { freq: 11, amp: 5, phase: 0 },
        { freq: 13, amp: 4, phase: Math.PI / 8 }
    ];

    function drawComplexWaveform() {
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;

        // Clear with fade effect for trail
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(0, 0, width, height);

        // Draw individual harmonics (faint)
        harmonics.forEach((harmonic, index) => {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(0, 0, 0, ${0.08 + index * 0.01})`;
            ctx.lineWidth = 0.5;

            for (let x = 0; x < width; x += 2) {
                const t = (x / width) * Math.PI * 4 + time * 0.02;
                const y = centerY + Math.sin(harmonic.freq * t + harmonic.phase + time * 0.05 * harmonic.freq) * harmonic.amp;

                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        });

        // Draw composite waveform (thick, prominent)
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
        ctx.lineWidth = 1.5;

        for (let x = 0; x < width; x += 1) {
            const t = (x / width) * Math.PI * 4 + time * 0.02;
            let y = centerY;

            // Sum all harmonics (Fourier synthesis)
            harmonics.forEach(harmonic => {
                y += Math.sin(harmonic.freq * t + harmonic.phase + time * 0.05 * harmonic.freq) * harmonic.amp;
            });

            // Add some AM modulation for complexity
            const modulation = 1 + 0.15 * Math.sin(t * 0.5 + time * 0.03);
            y = centerY + (y - centerY) * modulation;

            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        time += 1;
        animationFrame = requestAnimationFrame(drawComplexWaveform);
    }

    drawComplexWaveform();
}

// Smooth scroll for navigation
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// Animate elements on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all sections
document.querySelectorAll('.section').forEach(section => {
    section.style.opacity = '0';
    section.style.transform = 'translateY(30px)';
    section.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
    observer.observe(section);
});

// Add active state to nav on scroll and fade scroll indicator
window.addEventListener('scroll', () => {
    const sections = document.querySelectorAll('.section');
    const navLinks = document.querySelectorAll('.nav-link');
    const scrollIndicator = document.querySelector('.scroll-indicator');

    // Fade out scroll indicator on scroll
    if (scrollIndicator) {
        const scrollProgress = Math.min(window.scrollY / 300, 1);
        scrollIndicator.style.opacity = 1 - scrollProgress;
    }

    let current = '';

    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (scrollY >= sectionTop - 200) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.style.color = '';
        if (link.getAttribute('href') === '#' + current) {
            link.style.color = 'var(--black)';
        }
    });
});

// Ensure installation sections remain expanded
document.querySelectorAll('.installation-item').forEach(item => {
    item.classList.remove('expanded');
});

document.querySelectorAll('.installation-content').forEach(content => {
    content.style.removeProperty('max-height');
});
