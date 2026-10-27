// Keep the document (and its AudioContext) alive between the portfolio and Listen.
const base = new URL('../', import.meta.url);
const pages = new Map();
const pending = new Map();
let navigation = 0;

function pageFor(url) {
    if (url.origin !== base.origin || url.search) return null;
    const path = url.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
    if (path === base.pathname.replace(/\/$/, '')) return 'home';
    if (path === new URL('listen', base).pathname) return 'listen';
    return null;
}

function wrap(doc, url, name) {
    const root = document.createElement('div');
    root.dataset.page = name;
    // Resolve assets before changing the address, including hash links on the home page.
    for (const node of doc.body.querySelectorAll('[href], [src]')) {
        for (const attr of ['href', 'src']) {
            if (node.hasAttribute(attr)) node.setAttribute(attr, new URL(node.getAttribute(attr), url).href);
        }
    }
    for (const child of [...doc.body.children]) {
        if (child.tagName !== 'SCRIPT') root.append(child);
    }
    return root;
}

async function loadPage(name) {
    if (pages.has(name)) return pages.get(name);
    if (!pending.has(name)) {
        pending.set(name, fetchPage(name).finally(() => pending.delete(name)));
    }
    return pending.get(name);
}

async function fetchPage(name) {
    const url = new URL(name === 'home' ? './' : 'listen/', base);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Page load failed: ${response.status}`);
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    for (const link of doc.querySelectorAll('link[rel="stylesheet"]')) {
        const href = new URL(link.getAttribute('href'), url).href;
        if (![...document.styleSheets].some((sheet) => sheet.href === href)) {
            const style = document.createElement('link');
            style.rel = 'stylesheet';
            style.href = href;
            document.head.append(style);
            await new Promise((resolve, reject) => {
                style.onload = resolve;
                style.onerror = reject;
            });
        }
    }
    const page = { root: wrap(doc, url, name), title: doc.title };
    page.root.hidden = true;
    document.body.append(page.root);
    pages.set(name, page);
    return page;
}

async function show(url, push = false) {
    const name = pageFor(url);
    if (!name) { location.href = url.href; return; }
    const samePage = pageFor(new URL(location.href)) === name;
    const token = ++navigation;
    try {
        const page = await loadPage(name);
        if (token !== navigation) return;
        if (push) history.pushState(null, '', url);
        for (const entry of pages.values()) entry.root.hidden = entry !== page;
        document.title = page.title;
        await import(name === 'home' ? './home.js' : './listen.js');
        if (token !== navigation) return;
        const target = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
        if (target) target.scrollIntoView({ behavior: samePage ? 'smooth' : 'instant' }); else window.scrollTo(0, 0);
    } catch (error) {
        console.error('Navigation failed', error);
        location.href = url.href;
    }
}

const initialURL = new URL(location.href);
const initialName = pageFor(initialURL);
const root = wrap(document, initialURL, initialName);
document.body.append(root);
pages.set(initialName, { root, title: document.title });

// Capture only ordinary same-tab navigation; modified clicks still open a new document.
document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
        || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href);
    if (!pageFor(url)) return;
    event.preventDefault();
    show(url, url.href !== location.href);
});
window.addEventListener('popstate', () => show(new URL(location.href)));
await import(initialName === 'home' ? './home.js' : './listen.js');
