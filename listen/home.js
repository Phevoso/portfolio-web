// Front-page preview of the Listen page: the karesansui garden in the hero, playing Reykjavík's
// weather when the visitor presses play, with the place, the moment and the five voices beside it.
// The full page (./index.html) has the rest.

import { engine, stateFor } from './session.js';
import { initHome } from '../script.js';
import { CITIES, loadWeather, formatMoment } from '../lib/predictive-sonification/src/sources/index.js';
import { Garden } from '../lib/predictive-sonification/src/garden.js';
import { VOICES } from './voices.js';

const root = document.querySelector('[data-page="home"]');
initHome(root);

const HOME = {
    city: CITIES[0],
    flash: 900                   // ms a voice stays lit after it sounds
};

const $ = (selector, scope = root) => scope.querySelector(selector);
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

const canvas = $('[data-hero-garden]');
const explore = $('[data-hero-explore]');
let pulse = 0;
const garden = new Garden(canvas);
document.addEventListener('themechange', () => garden.readColours());
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const toggles = [$('[data-hero-play]'), $('.nav-sound')].filter(Boolean);
const navLabel = $('.nav-sound-label');
let state = null;



// The five voices, lit as they sound
const voiceItems = Object.fromEntries(VOICES.map((voice) => {
    const item = document.createElement('li');
    item.innerHTML = `<svg viewBox="0 0 44 24" aria-hidden="true">${voice.glyph}</svg><span>${voice.name}</span>`;
    $('[data-hero-voices]').appendChild(item);
    return [voice.key, { item, scale: voice.scale }];
}));

function flash(key, departing = false) {
    const entry = voiceItems[key];
    if (!entry || entry.item.classList.contains('is-resting')) return;
    entry.item.classList.add('is-on');
    entry.item.classList.toggle('is-departing', departing);
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => entry.item.classList.remove('is-on', 'is-departing'), HOME.flash);
}

// The source: last week of Reykjavík weather, warmed up on the week before
stateFor(`weather:${HOME.city.id}`, () => loadWeather(HOME.city)).then((initial) => {
    if (!engine.state) engine.setSource(initial);
    state = engine.state;
    const { source } = state;

    const latest = source.samples[source.samples.length - 1].values.temperature;
    const reading = latest === null ? '' : `${Math.round(latest)}°C`;
    $('[data-hero-place]').textContent = source.place.toLowerCase();
    $('[data-hero-reading]').textContent = reading;
    if (navLabel) navLabel.textContent = `${source.place} ${reading}`.trim();
}).catch((error) => console.warn('Sonification preview unavailable', error));

toggles.forEach((button) => {
    button.addEventListener('click', () => {
        if (engine.running) engine.stop(); else engine.start();
    });
});

// Autoplay on launch. Browsers only allow sound before any interaction on sites they trust, so
// try that first; otherwise the music starts on the visitor's first click, tap or key press
// anywhere on the page. The play buttons handle their own first press, and someone who has
// already stopped the music isn't overruled.
// A finger's pointerdown doesn't count as a gesture, so on phones wait for the pointerup. A touch
// that ends in a scroll doesn't count either; keep listening until one does.
const GESTURES = ['pointerup', 'keydown'];
function startOnGesture(event) {
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    GESTURES.forEach((type) => document.removeEventListener(type, startOnGesture, true));
    if (event.target.closest?.('[data-hero-play], .nav-sound')) return;
    if (!engine.running) engine.start();
}

function autoplay() {
    const policy = navigator.getAutoplayPolicy?.('audiocontext');
    if (policy === 'allowed' || (policy === undefined && probeAudio())) {
        engine.start();
        return;
    }
    GESTURES.forEach((type) => document.addEventListener(type, startOnGesture, true));
}

// Where the policy can't be asked (Chrome, Safari), a fresh context that starts out running means
// sound is already allowed; hand it to the engine instead of making another
function probeAudio() {
    const context = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
    if (context.state === 'running') {
        engine.ctx = context;
        return true;
    }
    context.close();
    return false;
}

if (!engine.ctx) autoplay();

function syncPlayback() {
    toggles.forEach((button) => {
        button.classList.toggle('is-playing', engine.running);
        button.setAttribute('aria-pressed', String(engine.running));
        button.setAttribute('aria-label', engine.running ? 'Stop the live sonification' : 'Play live music generated from Reykjavík weather');
    });
    if (navLabel) navLabel.hidden = !engine.running;
    // Stones and sand live on the audio clock; start the garden fresh next time
    if (!engine.running) garden.clear();
}
engine.addEventListener('statechange', syncPlayback);
syncPlayback();

engine.addEventListener('observation', ({ detail }) => {
    if (!state) return;
    const { start, end } = state.source.replay;
    garden.addTick((detail.time - start) / (end - start), engine.ctx.currentTime, detail.d ?? 0);
});

engine.addEventListener('note', ({ detail }) => {
    if (detail.instrument === 'piano') garden.addStone(detail);
    flash(detail.instrument, detail.departure);
});

// Voices outside the current line-up rest; the piano always plays
engine.addEventListener('lineup', ({ detail }) => {
    for (const [key, { item }] of Object.entries(voiceItems)) {
        item.classList.toggle('is-resting', key !== 'piano' && !detail.voices.includes(key));
    }
});

// Draw only while the hero is on screen; silent, the lines still drift
let visible = true;
new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(canvas);

function frame(ms) {
    state = engine.state;
    if (visible && !root.hidden) {
        const running = engine.running && !!engine.graph;
        const now = running ? engine.ctx.currentTime : ms / 1000;
        const levels = engine.levels();
        if (running) garden.consumeSand(engine.sandLog, now, canvas.clientWidth, canvas.clientHeight, reduced.matches);
        const cursor = state ? clamp((state.cursor - state.source.replay.start) / (state.source.replay.end - state.source.replay.start)) : null;
        garden.draw(now, { levels, chordRoot: engine.chord?.root, running, cursor, reduced: reduced.matches, idleSwell: 0.5 });

        if (state) {
            $('[data-hero-place]').textContent = state.source.place.toLowerCase();
            $('[data-hero-moment]').textContent = running
                ? formatMoment(state.source, Math.max(state.cursor, state.source.replay.start))
                : 'last week of weather, as music';
        }
        for (const [key, { item, scale }] of Object.entries(voiceItems)) {
            item.style.setProperty('--level', running ? clamp(levels[key] / scale).toFixed(2) : 0);
        }
        // Eases towards each piano note over about a second, then fades over a few
        const hit = running && !reduced.matches ? clamp(levels.piano / voiceItems.piano.scale) : 0;
        pulse += (hit - pulse) * (hit > pulse ? 0.04 : 0.015);
        explore.style.setProperty('--pulse', pulse.toFixed(3));
    }
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
