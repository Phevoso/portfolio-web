// Light by day, dark by night. The switch overrides the clock until its next change.
// Runs from the head so the page never flashes the wrong theme first.
(() => {
    const root = document.documentElement;
    const DAY = [7, 19];             // light from 07:00 until 19:00, local time

    const byClock = () => {
        const hour = new Date().getHours();
        return hour >= DAY[0] && hour < DAY[1] ? 'light' : 'dark';
    };

    // When the clock would next switch: 07:00 or 19:00, whichever comes first
    const nextChange = () => {
        const now = new Date();
        const hour = now.getHours();
        const next = new Date(now);
        next.setHours(hour < DAY[0] ? DAY[0] : hour < DAY[1] ? DAY[1] : DAY[0] + 24, 0, 0, 0);
        return next.getTime();
    };

    // Kept in memory too, so the switch still holds where storage is blocked
    let choice = null;
    try {
        choice = JSON.parse(localStorage.getItem('theme'));
    } catch {}

    const current = () => (choice && Date.now() < choice.until ? choice.theme : byClock());

    const apply = (theme) => {
        if ((root.dataset.theme === 'dark') === (theme === 'dark')) return;
        if (theme === 'dark') root.dataset.theme = 'dark'; else delete root.dataset.theme;
        // Canvases cache their colours; let them read the new ones
        document.dispatchEvent(new Event('themechange'));
    };

    apply(current());
    // Follow the clock while the page stays open
    setInterval(() => apply(current()), 60 * 1000);

    // Delegated, since navigation.js swaps the nav in with each page
    document.addEventListener('click', (event) => {
        if (!event.target.closest('[data-theme-toggle]')) return;
        choice = { theme: root.dataset.theme === 'dark' ? 'light' : 'dark', until: nextChange() };
        try {
            localStorage.setItem('theme', JSON.stringify(choice));
        } catch {}
        apply(choice.theme);
    });
})();
