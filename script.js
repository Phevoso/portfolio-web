export function initHome(root) {
// Custom cursor animation
const cursor = root.querySelector('.cursor-dot');

document.addEventListener('mousemove', (e) => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
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
root.querySelectorAll('.section').forEach(section => {
    section.style.opacity = '0';
    section.style.transform = 'translateY(30px)';
    section.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
    observer.observe(section);
});

// Add active state to nav on scroll and fade scroll indicator
window.addEventListener('scroll', () => {
    if (root.hidden) return;
    const sections = root.querySelectorAll('.section');
    const navLinks = root.querySelectorAll('.nav-link');
    const scrollIndicator = root.querySelector('.scroll-indicator');

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
root.querySelectorAll('.installation-item').forEach(item => {
    item.classList.remove('expanded');
});

root.querySelectorAll('.installation-content').forEach(content => {
    content.style.removeProperty('max-height');
});

}
