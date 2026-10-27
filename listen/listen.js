import { engine, stateFor } from './session.js';
import { MOTIFS, SHAPES } from '../lib/predictive-sonification/src/memory.js';
import { CITIES, loadWeather, loadMars, loadSolarWind, refreshSource, searchCities, formatMoment } from '../lib/predictive-sonification/src/sources/index.js';
import { Garden } from '../lib/predictive-sonification/src/garden.js';
import { VOICES } from './voices.js';
import { noteName } from '../lib/predictive-sonification/src/util.js';

const LISTEN = {
    panelInterval: 125,          // ms between readout / timeline redraws
    idleInterval: 400,           // ms between garden redraws while silent
    announceGap: 8000,           // the live region speaks at most this often
    searchDelay: 300,
    departing: 0.8,              // departure percentile shown in vermilion
    residualDeparting: 2         // |r| shown in vermilion
};

const LOADERS = {
    weather: (city) => loadWeather(city),
    mars: () => loadMars(),
    solar: () => loadSolarWind()
};

const root = document.querySelector('[data-page="listen"]');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

let kind = 'weather';
let city = CITIES[0];
let current = null;
let displayObs = null;
let loadToken = 0;
let pollTimer = null;

const $ = (selector, scope = root) => scope.querySelector(selector);
const $$ = (selector, scope = root) => [...scope.querySelectorAll(selector)];
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, className, parent, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
}

function svg(tag, attrs, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (parent) parent.appendChild(node);
    return node;
}

function fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
}

function ordinal(n) {
    const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
    return `${n}${suffix}`;
}

function indexAfter(samples, time) {
    let lo = 0;
    let hi = samples.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (samples[mid].time <= time) lo = mid + 1; else hi = mid;
    }
    return lo;
}

// Custom cursor, as on the rest of the site
const cursorDot = $('.cursor-dot');
document.addEventListener('mousemove', (e) => {
    cursorDot.style.left = e.clientX + 'px';
    cursorDot.style.top = e.clientY + 'px';
});

// Radio groups made of buttons: click or arrow keys, with a roving tab stop
function radioGroup(container, onSelect) {
    const buttons = () => $$('[role="radio"]', container).filter((button) => !button.disabled);
    const check = (button) => {
        $$('[role="radio"]', container).forEach((b) => {
            b.setAttribute('aria-checked', String(b === button));
            b.tabIndex = b === button ? 0 : -1;
        });
    };
    container.addEventListener('click', (e) => {
        const button = e.target.closest('[role="radio"]');
        if (!button || button.disabled) return;
        check(button);
        onSelect(button);
    });
    container.addEventListener('keydown', (e) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        const list = buttons();
        const index = list.indexOf(document.activeElement);
        const next = list[(index + step + list.length) % list.length];
        check(next);
        next.focus();
        onSelect(next);
    });
    const initial = $$('[role="radio"]', container).find((b) => b.getAttribute('aria-checked') === 'true');
    if (initial) check(initial);
    return { check };
}

// ---------------------------------------------------------------- sources

async function selectSource(nextKind, nextCity = city) {
    const token = ++loadToken;
    kind = nextKind;
    if (kind === 'weather') city = nextCity;
    $('[data-cities]').hidden = kind !== 'weather';

    let state;
    try {
        const id = kind === 'weather' ? `weather:${city.id}` : kind;
        state = await stateFor(id, () => LOADERS[kind](city));
    } catch (error) {
        console.error(error);
        return;
    }
    if (token !== loadToken) return;

    current = state;
    garden.clear();
    if (engine.state !== state) engine.setSource(state);
    displayObs = peekAtCursor(state);
    buildTimelines(state.source);
    buildVoices(state.source);
    renderSource();
    poll();
}

function peekAtCursor(state) {
    const sample = state.source.samples[Math.max(0, Math.min(state.index, state.source.samples.length) - 1)]
        ?? state.source.samples[0];
    return state.memory.peek(sample);
}

function poll() {
    clearInterval(pollTimer);
    const source = current.source;
    if (!source.pollMs) return;
    pollTimer = setInterval(async () => {
        if (document.hidden || current.source !== source) return;
        try {
            if (await refreshSource(source)) renderSource();
        } catch (error) {
            console.warn('Refresh failed', error);
        }
    }, source.pollMs);
}

function renderSource() {
    const { source } = current;
    $('[data-place]').textContent = (source.kind === 'solar' ? 'L1 · solar wind' : source.place).toLowerCase();
    updateClock();
    renderMemory();
}

function updateClock() {
    if (!current) return;
    const { source } = current;
    let text;
    if (source.kind === 'weather') {
        text = new Intl.DateTimeFormat('en-GB', { timeZone: source.timezone, hour: '2-digit', minute: '2-digit' }).format(new Date());
    } else if (source.kind === 'mars') {
        text = `sol ${source.samples[source.samples.length - 1].sol}`;
    } else {
        text = `${new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }).format(new Date())} utc`;
    }
    $('[data-clock]').textContent = text;
}
setInterval(updateClock, 15000);

// ---------------------------------------------------------------- controls

radioGroup($('[data-sources]'), (button) => selectSource(button.dataset.source));

const cityChips = $('[data-city-chips]');
const cityPlaces = new Map();
function addCityChip(place) {
    let chip = $(`[data-city="${place.id}"]`, cityChips);
    if (!chip) {
        chip = el('button', '', cityChips, place.name);
        chip.type = 'button';
        chip.setAttribute('role', 'radio');
        chip.setAttribute('aria-checked', 'false');
        chip.dataset.city = place.id;
        chip.tabIndex = -1;
        cityPlaces.set(place.id, place);
    }
    return chip;
}
CITIES.forEach((place, i) => {
    const chip = addCityChip(place);
    if (i === 0) chip.setAttribute('aria-checked', 'true');
});
const cityGroup = radioGroup(cityChips, (button) => selectSource('weather', cityPlaces.get(button.dataset.city)));

radioGroup($('[data-speeds]'), (button) => engine.setSpeed(Number(button.dataset.speed)));

const scrub = $('[data-scrub]');
let scrubbing = false;
scrub.addEventListener('pointerdown', () => { scrubbing = true; });
window.addEventListener('pointerup', () => { scrubbing = false; });
scrub.addEventListener('input', () => {
    if (!current) return;
    const { start, end } = current.source.replay;
    current.cursor = start + (scrub.value / 1000) * (end - start);
    current.index = indexAfter(current.source.samples, current.cursor);
    displayObs = peekAtCursor(current);
});

$$('[data-control]').forEach((input) => {
    input.addEventListener('input', () => engine.setControl(input.dataset.control, input.value / 100));
});

// Start / stop
const toggles = $$('[data-toggle]');
toggles.forEach((button) => {
    button.addEventListener('click', () => {
        if (engine.running) engine.stop(); else engine.start();
    });
});

function syncPlayback() {
    toggles.forEach((button) => {
        button.classList.toggle('is-playing', engine.running);
        button.setAttribute('aria-pressed', String(engine.running));
        button.setAttribute('aria-label', engine.running ? 'Stop the sonification' : 'Start listening');
        if (button.classList.contains('iot-start')) button.textContent = engine.running ? 'Stop' : 'Start Listening';
    });
    // Stones and sand live on the audio clock; start the garden fresh next time
    if (!engine.running) garden.clear();
}
engine.addEventListener('statechange', syncPlayback);

// City search: an ARIA combobox over Open-Meteo's geocoder
const search = $('#city-search');
const results = $('#city-results');
let searchTimer = null;
let options = [];
let active = -1;

function closeResults() {
    results.hidden = true;
    search.setAttribute('aria-expanded', 'false');
    search.removeAttribute('aria-activedescendant');
    active = -1;
}

function highlight(index) {
    active = index;
    options.forEach(({ node }, i) => node.setAttribute('aria-selected', String(i === index)));
    if (index >= 0) search.setAttribute('aria-activedescendant', options[index].node.id);
}

function choose(place) {
    closeResults();
    search.value = '';
    const chip = addCityChip(place);
    cityGroup.check(chip);
    selectSource('weather', place);
}

search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const query = search.value.trim();
    if (query.length < 2) {
        closeResults();
        return;
    }
    searchTimer = setTimeout(async () => {
        let places = [];
        try {
            places = await searchCities(query);
        } catch (error) {
            console.warn('City search failed', error);
        }
        if (search.value.trim() !== query) return;
        results.replaceChildren();
        options = places.map((place, i) => {
            const node = el('li', '', results);
            node.id = `city-option-${i}`;
            node.setAttribute('role', 'option');
            node.setAttribute('aria-selected', 'false');
            el('span', '', node, place.name);
            el('small', '', node, place.region);
            node.addEventListener('mousedown', (e) => {
                e.preventDefault();
                choose(place);
            });
            return { node, place };
        });
        if (!options.length) el('li', 'is-empty', results, 'No places found');
        results.hidden = false;
        search.setAttribute('aria-expanded', 'true');
        highlight(-1);
    }, LISTEN.searchDelay);
});

search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!options.length) return;
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        highlight((active + step + options.length) % options.length);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const option = options[active] ?? options[0];
        if (option) choose(option.place);
    } else if (e.key === 'Escape') {
        closeResults();
    }
});
search.addEventListener('blur', () => setTimeout(closeResults, 150));

// ---------------------------------------------------------------- departure line

// Only a departure gets a line; a calm reading needs no caption
function describeDeparture(obs, source) {
    if (!obs || obs.d === null || !obs.lead || obs.d < LISTEN.departing) return { text: '', departing: false };
    const channel = source.channels.find(({ key }) => key === obs.lead);
    const r = obs.channels[obs.lead].r;
    const distance = Math.abs(r) > 3 ? 'far ' : '';
    return { text: `${channel.label} ${distance}${r >= 0 ? 'above' : 'below'} expected`, departing: true };
}

// The garden overlay names a departure while it lasts
function updateNow() {
    if (!current || !displayObs) return;
    const { text, departing } = describeDeparture(displayObs, current.source);
    const line = $('[data-departure-line]');
    line.textContent = text;
    line.classList.toggle('is-departing', departing);
}

// ---------------------------------------------------------------- Source: timelines

let timelines = [];

function buildTimelines(source) {
    const container = $('[data-timelines]');
    container.replaceChildren();
    timelines = source.channels.map((channel) => {
        const row = el('div', 'listen-timeline', container);
        const labels = el('div', 'listen-timeline-label', row);
        el('span', '', labels, channel.label);
        el('span', '', labels, channel.unit || 'index');
        const canvas = el('canvas', '', row);
        canvas.setAttribute('aria-hidden', 'true');
        const values = source.samples.map((s) => s.values[channel.key]).filter((v) => v !== null);
        const lo = Math.min(...values);
        const hi = Math.max(...values);
        const pad = (hi - lo || 1) * 0.12;
        return { channel, canvas, lo: lo - pad, hi: hi + pad };
    });
}

function drawTimelines() {
    if (!current) return;
    const { source, memory, cursor } = current;
    const { start, end } = source.replay;
    const { samples } = source;
    const first = indexAfter(samples, start - 1);
    const style = getComputedStyle(document.documentElement);
    const shu = style.getPropertyValue('--shu').trim() || '#C23B22';

    for (const { channel, canvas, lo, hi } of timelines) {
        const { ctx, width, height } = fitCanvas(canvas);
        ctx.clearRect(0, 0, width, height);
        const x = (time) => ((time - start) / (end - start)) * width;
        const y = (value) => height - 3 - ((value - lo) / (hi - lo)) * (height - 6);
        const bar = Math.max(1, width / Math.max(1, samples.length - first));

        // Expected band, only where the memory has already made its forecast
        ctx.fillStyle = '#EDEDED';
        for (let i = first; i < samples.length; i++) {
            const record = memory.records.get(samples[i].time);
            const entry = record?.channels[channel.key];
            if (!entry || entry.mu === null) continue;
            const top = y(entry.mu + entry.sigma);
            ctx.fillRect(x(samples[i].time) - bar / 2, top, bar, Math.max(1, y(entry.mu - entry.sigma) - top));
        }

        // Observed: ink up to the cursor, faint after it
        for (const [from, to, colour] of [[start, cursor, '#000'], [cursor, end, '#CCC']]) {
            ctx.strokeStyle = colour;
            ctx.lineWidth = 1;
            ctx.beginPath();
            let drawing = false;
            for (let i = first; i < samples.length; i++) {
                const sample = samples[i];
                if (sample.time < from - (end - start) / width) continue;
                if (sample.time > to) break;
                const value = sample.values[channel.key];
                if (value === null) {
                    drawing = false;
                    continue;
                }
                if (drawing) ctx.lineTo(x(sample.time), y(value)); else ctx.moveTo(x(sample.time), y(value));
                drawing = true;
            }
            ctx.stroke();
        }

        // Departures
        ctx.fillStyle = shu;
        for (let i = first; i < samples.length; i++) {
            const record = memory.records.get(samples[i].time);
            const entry = record?.channels[channel.key];
            if (!entry || entry.r === null || Math.abs(entry.r) <= LISTEN.residualDeparting) continue;
            ctx.beginPath();
            ctx.arc(x(samples[i].time), y(entry.x), 2, 0, Math.PI * 2);
            ctx.fill();
        }

        const cx = Math.round(x(clamp(cursor, start, end))) + 0.5;
        ctx.fillStyle = '#000';
        ctx.fillRect(cx - 0.5, 0, 1, height);
    }
}

// ---------------------------------------------------------------- Voices

let voiceRows = {};

function buildVoices(source) {
    const container = $('[data-voices]');
    container.replaceChildren();
    voiceRows = {};
    for (const voice of VOICES) {
        const row = el('div', 'listen-voice', container);
        const glyph = svg('svg', { viewBox: '0 0 44 24', 'aria-hidden': 'true' }, row);
        glyph.innerHTML = voice.glyph;
        el('h3', '', row, voice.name);
        const note = el('span', 'listen-voice-note', row, '—');
        const fill = el('span', 'iot-meter-fill', el('span', 'iot-meter-bar', row));
        voiceRows[voice.key] = { row, note, fill, scale: voice.scale };
    }
}

function flashVoice(key, departing = false) {
    const entry = voiceRows[key];
    if (!entry || entry.row.classList.contains('is-resting')) return;
    entry.row.classList.add('is-on');
    entry.row.classList.toggle('is-departing', departing);
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => entry.row.classList.remove('is-on', 'is-departing'), 900);
}

function updateVoiceLevels(levels) {
    for (const [key, entry] of Object.entries(voiceRows)) {
        entry.fill.style.width = `${clamp((levels[key] ?? 0) / entry.scale) * 100}%`;
    }
    // Which of the thesis presets the weather noise leans toward right now
    const noise = voiceRows.noise;
    if (noise && engine.running && engine.noiseMood && !noise.row.classList.contains('is-resting')) {
        noise.note.textContent = `${engine.noiseMood} preset`;
    }
}

// ---------------------------------------------------------------- Memory

let shapeCards = {};

function contourPoints(shape) {
    const { intervals, rhythm } = MOTIFS[shape];
    const degrees = [0];
    for (const step of intervals) degrees.push(degrees[degrees.length - 1] + step);
    const low = Math.min(...degrees);
    const high = Math.max(...degrees);
    const total = rhythm.reduce((sum, beats) => sum + beats, 0) - rhythm[rhythm.length - 1];
    let t = 0;
    return degrees.map((degree, i) => {
        const point = [4 + (t / (total || 1)) * 56, high > low ? 34 - ((degree - low) / (high - low)) * 28 : 20];
        t += rhythm[i];
        return point;
    });
}

function buildMemory() {
    const container = $('[data-memory]');
    container.replaceChildren();
    for (const shape of SHAPES) {
        const card = el('div', 'listen-shape', container);
        const glyph = svg('svg', { viewBox: '0 0 64 40', 'aria-hidden': 'true' }, card);
        const points = contourPoints(shape);
        svg('polyline', { points: points.map((p) => p.join(',')).join(' ') }, glyph);
        for (const [cx, cy] of points) svg('circle', { cx, cy, r: 2 }, glyph);
        el('h3', '', card, MOTIFS[shape].label);
        const count = el('span', '', card, '—');
        shapeCards[shape] = { card, count };
    }
}

function renderMemory() {
    if (!current) return;
    const { memory } = current;
    for (const shape of SHAPES) {
        const { card, count } = shapeCards[shape];
        const stats = memory.stats[shape];
        count.textContent = stats.occurrences ? `heard ${stats.occurrences}×` : 'not yet';
        card.classList.toggle('is-current', memory.shape === shape);
        if (memory.shape === shape) card.setAttribute('aria-current', 'true'); else card.removeAttribute('aria-current');
    }
}

// ---------------------------------------------------------------- announcements

let lastAnnounce = 0;
let pendingAnnouncement = null;

function announce(message) {
    pendingAnnouncement = message;
    flushAnnouncement();
}

function flushAnnouncement() {
    if (!pendingAnnouncement || performance.now() - lastAnnounce < LISTEN.announceGap) return;
    $('[data-announce]').textContent = pendingAnnouncement;
    pendingAnnouncement = null;
    lastAnnounce = performance.now();
}

// ---------------------------------------------------------------- engine events

const garden = new Garden($('[data-garden]'));

engine.addEventListener('observation', ({ detail: obs }) => {
    if (engine.state !== current) return;
    displayObs = obs;
    const { start, end } = current.source.replay;
    garden.addTick((obs.time - start) / (end - start), engine.ctx.currentTime, obs.d ?? 0);
    if (obs.d !== null && obs.d >= 0.95) {
        const { text } = describeDeparture(obs, current.source);
        announce(`${text} · ${formatMoment(current.source, obs.time)}`);
    }
});

engine.addEventListener('note', ({ detail }) => {
    if (!current || !voiceRows.piano) return;
    if (detail.instrument === 'piano') {
        garden.addStone(detail);
        voiceRows.piano.note.textContent = `${noteName(detail.midi)}${detail.departure ? ' · departure' : ''}`;
        flashVoice('piano', detail.departure);
    } else if (detail.instrument === 'pads') {
        // Resting pads still carry the harmony silently; the piano row keeps naming it
        if (!voiceRows.pads.row.classList.contains('is-resting')) voiceRows.pads.note.textContent = engine.chordName();
        flashVoice('pads');
    } else if (detail.instrument === 'bass') {
        if (!voiceRows.bass.row.classList.contains('is-resting')) voiceRows.bass.note.textContent = noteName(detail.midi);
        flashVoice('bass');
    } else if (detail.instrument === 'clicks') {
        if (current) voiceRows.clicks.note.textContent = formatMoment(current.source, detail.dataTime);
        flashVoice('clicks');
    }
});

// Voices outside the current line-up rest; the piano always plays
engine.addEventListener('lineup', ({ detail }) => {
    for (const [key, entry] of Object.entries(voiceRows)) {
        const resting = key !== 'piano' && !detail.voices.includes(key);
        entry.row.classList.toggle('is-resting', resting);
        if (resting) entry.note.textContent = detail.solo ? 'resting · piano alone' : 'resting';
    }
});

engine.addEventListener('motif', ({ detail }) => {
    const entry = shapeCards[detail.shape];
    if (!entry) return;
    entry.card.classList.add('is-sounding');
    entry.card.classList.toggle('is-departing', (detail.d ?? 0) >= LISTEN.departing);
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => entry.card.classList.remove('is-sounding', 'is-departing'), 2400);
    if (detail.isReturn && !detail.recall) announce(`${MOTIFS[detail.shape].label} motif returns, ${ordinal(detail.count)} time`);
});

// ---------------------------------------------------------------- frame loop

const gardenCanvas = $('[data-garden]');
let gardenVisible = true;
new IntersectionObserver(([entry]) => { gardenVisible = entry.isIntersecting; }).observe(gardenCanvas);

let lastPanels = 0;
let lastIdle = 0;

function cursorFraction() {
    if (!current) return null;
    const { start, end } = current.source.replay;
    return clamp((current.cursor - start) / (end - start));
}

function frame(ms) {
    if (root.hidden) { requestAnimationFrame(frame); return; }
    const running = engine.running && !!engine.graph;
    const levels = engine.levels();

    if (gardenVisible && (running || ms - lastIdle > LISTEN.idleInterval)) {
        lastIdle = ms;
        const now = running ? engine.ctx.currentTime : ms / 1000;
        if (running) garden.consumeSand(engine.sandLog, now, gardenCanvas.clientWidth, gardenCanvas.clientHeight, reduced.matches);
        garden.draw(now, { levels, chordRoot: engine.chord?.root, running, cursor: cursorFraction(), reduced: reduced.matches });
    }

    if (current) {
        if (!scrubbing) scrub.value = String(Math.round((cursorFraction() ?? 0) * 1000));
        const moment = formatMoment(current.source, Math.max(current.cursor, current.source.replay.start));
        $('[data-moment]').textContent = moment;
        scrub.setAttribute('aria-valuetext', moment);
    }

    if (ms - lastPanels > LISTEN.panelInterval) {
        lastPanels = ms;
        updateNow();
        drawTimelines();
        updateVoiceLevels(levels);
        renderMemory();
        flushAnnouncement();
    }
    requestAnimationFrame(frame);
}

buildMemory();
syncPlayback();
selectSource('weather', city);
requestAnimationFrame(frame);
