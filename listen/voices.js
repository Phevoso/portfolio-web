// The four voices of the paper's palette, with what drives each one. Shared by the Listen page
// and the front-page preview.

export function label(source, role) {
    return source?.channels.find((channel) => channel.role === role)?.label.toLowerCase() ?? '—';
}

export const VOICES = [
    { key: 'pads', name: 'Detuned pads', role: 'Expected voice', scale: 0.08,
        map: (s) => `← expected ${label(s, 'primary')} · ${label(s, 'texture')} opens the filter`,
        glyph: '<path d="M0 8 Q11 2 22 8 T44 8"/><path d="M0 16 Q11 10 22 16 T44 16"/>' },
    { key: 'piano', name: 'Piano', role: 'Episodes and departures', scale: 0.06,
        map: () => '← recurring shapes as motifs · signed departures above or below',
        glyph: '<rect x="1" y="3" width="10.5" height="18"/><rect x="11.5" y="3" width="10.5" height="18"/>'
            + '<rect x="22" y="3" width="10.5" height="18"/><rect x="32.5" y="3" width="10.5" height="18"/>'
            + '<rect class="is-solid" x="8" y="3" width="7" height="11"/><rect class="is-solid" x="29" y="3" width="7" height="11"/>' },
    { key: 'bass', name: 'Sine bass', role: 'Anchor', scale: 0.12,
        map: () => '← chord roots · swells when a new episode begins',
        glyph: '<path class="is-heavy" d="M0 12 Q11 7 22 12 T44 12"/>' },
    { key: 'noise', name: 'Weather noise', role: 'Variability and uncertainty', scale: 0.1,
        map: () => '← rain as readings vary, storm on departures, mist under uncertainty',
        glyph: [[5, 5], [13, 11], [20, 4], [27, 10], [34, 5], [40, 12]]
            .map(([x, y]) => `<line x1="${x}" y1="${y}" x2="${x - 2}" y2="${y + 7}"/>`).join('') }
];
