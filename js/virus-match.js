/* =============================================
   EL PEDRO — virus-match.js
   Una partida de Virus en la mesa: cada uno con su
   cuerpo delante y tres cartas en la mano. Eliges
   una carta tocándola o con su número, y después
   dónde va: el juego te dice antes qué hará cada
   jugada («infectar el corazón de Lola»). Todo lo
   que pasa se cuenta con voz, sonido y animaciones.
   Las cartas se dibujan aquí, en SVG (VirusArt).
   ============================================= */
'use strict';

/** Lo que dura cada momento sin voz (modo visual), en milisegundos. */
const VIRUS_BEAT = { play: 900, big: 1500, discard: 600, lost: 900 };

/** Colores de cada carta: relleno, borde, claro y el fondo de la carta. */
const VIRUS_PAINT = {
    rojo:     { fill: '#ec4650', dark: '#7d1019', light: '#ffb3b8', bg: ['#ff7b83', '#c41f2c'] },
    verde:    { fill: '#4cbb4c', dark: '#175e1f', light: '#b4f0ad', bg: ['#7fdb78', '#24852d'] },
    azul:     { fill: '#3a8cf0', dark: '#0f3a85', light: '#b0d4ff', bg: ['#6cb0ff', '#1b5bc2'] },
    amarillo: { fill: '#f7c81e', dark: '#7a5600', light: '#fff0a6', bg: ['#ffe066', '#d49400'] },
    multi:    { fill: 'url(#vgRainbow)', dark: '#33204f', light: '#ffffff', bg: null },
    trat:     { fill: '#9466e0', dark: '#351a6b', light: '#ddcbff', bg: ['#b18cf5', '#5a2fa8'] },
};
const VIRUS_ORGAN = { rojo: 'corazón', azul: 'cerebro', verde: 'estómago', amarillo: 'hueso', multi: 'órgano multicolor' };
const VIRUS_COLOR_M = { rojo: 'rojo', verde: 'verde', azul: 'azul', amarillo: 'amarillo', multi: 'multicolor' };
const VIRUS_COLOR_F = { rojo: 'roja', verde: 'verde', azul: 'azul', amarillo: 'amarilla', multi: 'multicolor' };
const VIRUS_TREAT = { trasplante: 'trasplante', ladron: 'ladrón de órganos', contagio: 'contagio', guante: 'guante de látex', error: 'error médico' };
const VIRUS_TREAT_HELP = {
    trasplante: 'cambia un órgano por otro entre dos jugadores',
    ladron: 'roba un órgano a otro jugador',
    contagio: 'pasa tus virus a los órganos libres de los demás',
    guante: 'todos los demás tiran sus cartas y pierden un turno',
    error: 'cambia tu cuerpo entero por el de otro jugador',
};
/** Orden de los órganos en la mesa. */
const VIRUS_ORDER = { rojo: 0, azul: 1, verde: 2, amarillo: 3, multi: 4 };

// ═══════════════════════════════════════════════════════
// Las cartas, dibujadas
// ═══════════════════════════════════════════════════════

const VirusArt = {
    _cache: new Map(),

    installDefs() {
        if (document.getElementById('virus-defs')) return;
        const bg = Object.entries(VIRUS_PAINT).filter(([, p]) => p.bg)
            .map(([k, p]) => `<linearGradient id="vbg-${k}" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="${p.bg[0]}"/><stop offset="1" stop-color="${p.bg[1]}"/></linearGradient>`).join('');
        const div = document.createElement('div');
        div.innerHTML = `<svg id="virus-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
            ${bg}
            <linearGradient id="vgRainbow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ec4650"/><stop offset=".33" stop-color="#f7c81e"/><stop offset=".66" stop-color="#4cbb4c"/><stop offset="1" stop-color="#3a8cf0"/></linearGradient>
            <linearGradient id="vbg-multi" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2434d"/><stop offset=".3" stop-color="#eeb51a"/><stop offset=".65" stop-color="#3fa94a"/><stop offset="1" stop-color="#2f6fd0"/></linearGradient>
            <radialGradient id="vgShine" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
            <pattern id="vDots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2.2" fill="#fff" opacity=".18"/><circle cx="13" cy="13" r="1.6" fill="#fff" opacity=".12"/></pattern>
            <pattern id="vBack" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="22" height="22" fill="#2a1447"/><rect width="11" height="22" fill="#33195a"/></pattern>
        </defs></svg>`;
        document.body.prepend(div.firstChild);
    },

    paint(card) { return VIRUS_PAINT[card.kind === 'tratamiento' ? 'trat' : card.color]; },

    /** Varias formas que se pintan como una sola, con un borde grueso alrededor de todas. */
    outlined(shapes, fill, dark, w = 9) {
        return `<g fill="${dark}" stroke="${dark}" stroke-width="${w}" stroke-linejoin="round">${shapes}</g><g fill="${fill}">${shapes}</g>`;
    },

    happy(x = 0, y = 0, s = 1) {
        if (this._plain) return '';
        return `<g transform="translate(${x} ${y}) scale(${s})">
            <ellipse cx="-13" cy="-6" rx="7.5" ry="9.5" fill="#fff" stroke="#1d1424" stroke-width="2.2"/><ellipse cx="13" cy="-6" rx="7.5" ry="9.5" fill="#fff" stroke="#1d1424" stroke-width="2.2"/>
            <circle cx="-11.5" cy="-4" r="4.2" fill="#1d1424"/><circle cx="14.5" cy="-4" r="4.2" fill="#1d1424"/>
            <circle cx="-10" cy="-6" r="1.5" fill="#fff"/><circle cx="16" cy="-6" r="1.5" fill="#fff"/>
            <path d="M-12 10 Q0 23 12 10" stroke="#1d1424" stroke-width="3.6" fill="#7d1019" stroke-linecap="round" stroke-linejoin="round"/>
            <ellipse cx="-25" cy="8" rx="6" ry="3.5" fill="#ff6f86" opacity=".55"/><ellipse cx="25" cy="8" rx="6" ry="3.5" fill="#ff6f86" opacity=".55"/>
        </g>`;
    },

    angry(x = 0, y = 0, s = 1) {
        return `<g transform="translate(${x} ${y}) scale(${s})">
            <path d="M-24 -20 L-5 -11" stroke="#1d1424" stroke-width="5" stroke-linecap="round"/><path d="M24 -20 L5 -11" stroke="#1d1424" stroke-width="5" stroke-linecap="round"/>
            <ellipse cx="-12" cy="-3" rx="7" ry="7.5" fill="#fffbd6" stroke="#1d1424" stroke-width="2.2"/><ellipse cx="12" cy="-3" rx="7" ry="7.5" fill="#fffbd6" stroke="#1d1424" stroke-width="2.2"/>
            <circle cx="-10" cy="-1" r="3.6" fill="#c0101c"/><circle cx="10" cy="-1" r="3.6" fill="#c0101c"/>
            <path d="M-17 11 Q0 3 17 11 Q0 27 -17 11 Z" fill="#3a0a14" stroke="#1d1424" stroke-width="2.4" stroke-linejoin="round"/>
            <path d="M-11 10 l3.5 5 l3.5 -5.8 Z M4 8.2 l3.5 6 l3.5 -4.4 Z" fill="#fff"/>
        </g>`;
    },

    // ── Los dibujos del centro (centrados en 0,0; caben en un círculo de radio 62) ──
    heart(fill, dark) {
        return this.outlined('<path d="M0 50 C-70 6 -62 -48 -28 -48 C-12 -48 0 -36 0 -26 C0 -36 12 -48 28 -48 C62 -48 70 6 0 50Z"/>', fill, dark)
            + '<path d="M-42 -20 Q-40 -38 -24 -40" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" opacity=".55"/>'
            + this.happy(0, -4, 0.95);
    },
    brain(fill, dark) {
        const c = [[-30, -12, 24], [-10, -27, 24], [16, -26, 24], [33, -6, 22], [24, 18, 22], [-2, 24, 22], [-28, 14, 22]];
        return this.outlined(c.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join(''), fill, dark)
            + `<g stroke="${dark}" stroke-width="3.4" fill="none" stroke-linecap="round" opacity=".7">
                <path d="M-46 -2 q8 -10 16 -2"/><path d="M-22 -44 q2 10 10 10"/><path d="M22 -48 q-4 10 4 16"/><path d="M42 6 q-10 2 -10 12"/><path d="M-10 40 q4 -8 12 -6"/><path d="M-44 26 q6 -6 12 0"/></g>`
            + '<path d="M-36 -26 Q-30 -40 -16 -42" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".5"/>'
            + this.happy(0, -2, 0.9);
    },
    stomach(fill, dark) {
        return this.outlined('<path d="M-24 -56 L-6 -56 L-6 -32 C-6 -22 2 -18 16 -20 C46 -24 62 2 52 26 C42 50 4 58 -20 46 C-46 32 -46 4 -32 -12 C-26 -20 -24 -28 -24 -36 Z"/>', fill, dark)
            + '<path d="M-28 22 Q-30 38 -12 44" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".5"/>'
            + this.happy(10, 12, 0.82);
    },
    bone(fill, dark) {
        const shapes = '<rect x="-44" y="-15" width="88" height="30" rx="10"/><circle cx="-46" cy="-16" r="17"/><circle cx="-46" cy="16" r="17"/><circle cx="46" cy="-16" r="17"/><circle cx="46" cy="16" r="17"/>';
        return `<g transform="rotate(-28)">${this.outlined(shapes, fill, dark)}<path d="M-38 -9 H30" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".5"/></g>` + this.happy(0, 2, 0.72);
    },
    /** El círculo con los cuatro colores: el comodín. */
    quarters(r, dark) {
        const q = (a0, color) => {
            const a = a0 * Math.PI / 2, b = (a0 + 1) * Math.PI / 2;
            return `<path d="M0 0 L${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)} A${r} ${r} 0 0 1 ${(r * Math.cos(b)).toFixed(1)} ${(r * Math.sin(b)).toFixed(1)} Z" fill="${VIRUS_PAINT[color].fill}"/>`;
        };
        return `<circle r="${r}" fill="${dark}" stroke="${dark}" stroke-width="9"/>${q(-2, 'rojo')}${q(-1, 'azul')}${q(0, 'verde')}${q(1, 'amarillo')}`;
    },
    multiOrgan(dark) {
        return this.quarters(48, dark) + '<circle r="48" fill="url(#vgShine)"/>' + this.happy(0, 0, 1);
    },
    organArt(color, s = 1) {
        const P = VIRUS_PAINT[color];
        const art = { rojo: () => this.heart(P.fill, P.dark), azul: () => this.brain(P.fill, P.dark), verde: () => this.stomach(P.fill, P.dark), amarillo: () => this.bone(P.fill, P.dark), multi: () => this.multiOrgan(P.dark) }[color]();
        return s === 1 ? art : `<g transform="scale(${s})">${art}</g>`;
    },
    virusArt(color) {
        const P = VIRUS_PAINT[color];
        const spikes = Array.from({ length: 10 }, (_, i) => {
            const a = i * Math.PI / 5 + 0.2, c = Math.cos(a), s = Math.sin(a);
            return `<line x1="${(34 * c).toFixed(1)}" y1="${(34 * s).toFixed(1)}" x2="${(54 * c).toFixed(1)}" y2="${(54 * s).toFixed(1)}" stroke="${P.dark}" stroke-width="7" stroke-linecap="round"/>
                <circle cx="${(55 * c).toFixed(1)}" cy="${(55 * s).toFixed(1)}" r="7.5" fill="${color === 'multi' ? VIRUS_PAINT[['rojo', 'azul', 'verde', 'amarillo'][i % 4]].fill : P.fill}" stroke="${P.dark}" stroke-width="3"/>`;
        }).join('');
        const body = color === 'multi' ? this.quarters(40, P.dark) : `<circle r="40" fill="${P.fill}" stroke="${P.dark}" stroke-width="5"/>`;
        return spikes + body + '<circle r="40" fill="url(#vgShine)"/>'
            + `<circle cx="-24" cy="20" r="6" fill="${P.dark}" opacity=".25"/><circle cx="26" cy="-22" r="4.5" fill="${P.dark}" opacity=".25"/><circle cx="22" cy="26" r="3.5" fill="${P.dark}" opacity=".25"/>`
            + this.angry(0, 0, 1);
    },
    medicineArt(color) {
        const P = VIRUS_PAINT[color], d = P.dark;
        switch (color) {
            case 'rojo': return `<g transform="rotate(-40)">
                <rect x="-18" y="-70" width="36" height="8" rx="4" fill="#dcdcdc" stroke="${d}" stroke-width="3"/>
                <rect x="-5" y="-64" width="10" height="26" fill="#cfcfcf" stroke="${d}" stroke-width="3"/>
                <rect x="-26" y="-42" width="52" height="8" rx="4" fill="#f1f1f1" stroke="${d}" stroke-width="3"/>
                <rect x="-15" y="-36" width="30" height="70" rx="5" fill="#fff" stroke="${d}" stroke-width="4"/>
                <rect x="-11" y="-6" width="22" height="36" rx="3" fill="${P.fill}"/>
                <path d="M-15 -22 h9 M-15 -10 h9 M-15 2 h9 M-15 14 h9" stroke="${d}" stroke-width="2.5"/>
                <path d="M-8 34 h16 l-4 10 h-8 Z" fill="#cfcfcf" stroke="${d}" stroke-width="3" stroke-linejoin="round"/>
                <line x1="0" y1="44" x2="0" y2="70" stroke="#8a8a8a" stroke-width="3.5" stroke-linecap="round"/>
                <circle cx="0" cy="77" r="4" fill="${P.fill}" stroke="${d}" stroke-width="1.5"/></g>`;
            case 'verde': return `
                <rect x="-17" y="-60" width="34" height="18" rx="5" fill="${d}"/>
                <rect x="-12" y="-44" width="24" height="16" fill="#e8fbe6" stroke="${d}" stroke-width="4"/>
                <rect x="-32" y="-30" width="64" height="84" rx="16" fill="#e8fbe6" stroke="${d}" stroke-width="5"/>
                <path d="M-29 8 Q0 0 29 8 V40 Q29 51 18 51 H-18 Q-29 51 -29 40 Z" fill="${P.fill}"/>
                <rect x="-22" y="-20" width="44" height="26" rx="5" fill="#fff" stroke="${d}" stroke-width="2.5"/>
                <path d="M-4 -16 h8 v6 h6 v8 h-6 v6 h-8 v-6 h-6 v-8 h6 Z" fill="${P.fill}" stroke="${d}" stroke-width="1.5"/>
                <path d="M-22 22 v18" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".55"/>`;
            case 'azul': return `
                <g transform="translate(-4 -14) rotate(-30)">
                    <path d="M0 -15 H-26 A15 15 0 0 0 -26 15 H0 Z" fill="#fff"/>
                    <path d="M0 -15 H26 A15 15 0 0 1 26 15 H0 Z" fill="${P.fill}"/>
                    <rect x="-41" y="-15" width="82" height="30" rx="15" fill="none" stroke="${d}" stroke-width="4.5"/>
                    <line x1="0" y1="-15" x2="0" y2="15" stroke="${d}" stroke-width="3"/>
                    <path d="M-30 -7 h20" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>
                </g>
                <circle cx="-26" cy="32" r="17" fill="${P.light}" stroke="${d}" stroke-width="4"/><line x1="-37" y1="32" x2="-15" y2="32" stroke="${d}" stroke-width="3"/>
                <circle cx="22" cy="34" r="17" fill="${P.fill}" stroke="${d}" stroke-width="4"/><line x1="22" y1="23" x2="22" y2="45" stroke="${d}" stroke-width="3"/>`;
            case 'amarillo': {
                const band = rot => `<g transform="rotate(${rot})">
                    <rect x="-56" y="-17" width="112" height="34" rx="17" fill="${P.fill}" stroke="${d}" stroke-width="4"/>
                    <rect x="-17" y="-13" width="34" height="26" rx="5" fill="${P.light}" stroke="${d}" stroke-width="2"/>
                    ${[-40, -30, 30, 40].map(x => `<circle cx="${x}" cy="-5" r="2.2" fill="${d}" opacity=".45"/><circle cx="${x}" cy="5" r="2.2" fill="${d}" opacity=".45"/>`).join('')}</g>`;
                return band(-38) + band(38);
            }
            default: return `
                <path d="M-18 -40 V-50 Q-18 -56 -12 -56 H12 Q18 -56 18 -50 V-40" fill="none" stroke="${d}" stroke-width="7"/>
                <rect x="-52" y="-40" width="104" height="80" rx="12" fill="#fff" stroke="${d}" stroke-width="5"/>
                <rect x="-52" y="-6" width="104" height="12" fill="url(#vgRainbow)"/>
                <rect x="-52" y="-40" width="104" height="80" rx="12" fill="none" stroke="${d}" stroke-width="5"/>
                <path d="M-11 -32 h22 v21 h21 v22 h-21 v21 h-22 v-21 h-21 v-22 h21 Z" fill="url(#vgRainbow)" stroke="${d}" stroke-width="3.5" stroke-linejoin="round"/>`;
        }
    },
    treatmentArt(treat) {
        const d = VIRUS_PAINT.trat.dark;
        const arrow = (path, head) => `<path d="${path}" fill="none" stroke="${d}" stroke-width="6" stroke-linecap="round"/><path d="${head}" fill="${d}"/>`;
        switch (treat) {
            case 'trasplante': return `
                <g transform="translate(-32 6)">${this.organArt('rojo', 0.42)}</g>
                <g transform="translate(32 6)">${this.organArt('azul', 0.42)}</g>
                ${arrow('M-34 -30 Q0 -60 30 -34', 'M38 -26 L22 -40 L36 -44 Z')}
                ${arrow('M34 44 Q0 70 -30 46', 'M-38 38 L-22 52 L-36 56 Z')}`;
            case 'ladron': return `
                <g transform="translate(0 30)">${this.organArt('rojo', 0.42)}</g>
                <path d="M-58 -26 Q-40 -46 0 -36 Q40 -46 58 -26 Q56 -2 30 0 Q12 0 0 -12 Q-12 0 -30 0 Q-56 -2 -58 -26 Z" fill="#1d1424" stroke="#000" stroke-width="3"/>
                <ellipse cx="-27" cy="-20" rx="11" ry="7" fill="#fff"/><ellipse cx="27" cy="-20" rx="11" ry="7" fill="#fff"/>
                <circle cx="-24" cy="-19" r="4" fill="#1d1424"/><circle cx="30" cy="-19" r="4" fill="#1d1424"/>
                <path d="M58 -26 q10 4 6 16 M-58 -26 q-10 4 -6 16" stroke="#1d1424" stroke-width="4" fill="none" stroke-linecap="round"/>
                <path d="M-44 44 h-14 M-46 30 h-10 M44 44 h14 M46 30 h10" stroke="${d}" stroke-width="4" stroke-linecap="round"/>`;
            case 'contagio': return `
                <g transform="scale(.5)">${this.virusArt('verde')}</g>
                ${[[-50, -36], [50, -36], [0, 56]].map(([x, y]) => {
                    const a = Math.atan2(y, x), l = Math.hypot(x, y);
                    const x0 = (36 * Math.cos(a)).toFixed(1), y0 = (36 * Math.sin(a)).toFixed(1), x1 = ((l - 14) * Math.cos(a)).toFixed(1), y1 = ((l - 14) * Math.sin(a)).toFixed(1);
                    return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${d}" stroke-width="5" stroke-dasharray="7 5" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="11" fill="${VIRUS_PAINT.verde.fill}" stroke="${d}" stroke-width="3.5"/>`;
                }).join('')}`;
            case 'guante': return `
                <path d="M-26 50 V12 L-40 -10 Q-46 -22 -36 -24 Q-28 -26 -22 -14 L-18 -6 V-40 Q-18 -48 -10 -48 Q-3 -48 -3 -40 V-14 V-50 Q-3 -58 5 -58 Q13 -58 13 -50 V-14 V-44 Q13 -52 21 -52 Q29 -52 29 -44 V-12 V-32 Q29 -40 36 -40 Q43 -40 43 -32 V18 Q43 38 30 50 Z" fill="#c9ecff" stroke="${d}" stroke-width="5" stroke-linejoin="round"/>
                <rect x="-30" y="42" width="64" height="16" rx="5" fill="#9fd8f7" stroke="${d}" stroke-width="4"/>
                <path d="M-10 -40 v26 M5 -50 v34 M21 -44 v30" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>`;
            default: {
                const fig = (x, c) => `<g transform="translate(${x} 0)"><circle cx="0" cy="-30" r="13" fill="${VIRUS_PAINT[c].light}" stroke="${d}" stroke-width="4"/><path d="M-20 26 V-4 Q-20 -14 -10 -14 H10 Q20 -14 20 -4 V26 Z" fill="${VIRUS_PAINT[c].fill}" stroke="${d}" stroke-width="4" stroke-linejoin="round"/></g>`;
                return fig(-30, 'azul') + fig(30, 'rojo')
                    + arrow('M-12 40 Q0 54 12 40', 'M18 34 L14 48 L4 40 Z')
                    + `<text x="0" y="-48" text-anchor="middle" font-family="system-ui, sans-serif" font-size="30" font-weight="900" fill="${d}">?</text>`;
            }
        }
    },

    /** Un dibujo sin cara (para los iconos pequeños). */
    plain(fn) { this._plain = true; try { return fn(); } finally { this._plain = false; } },

    kindIcon(card) {
        const d = this.paint(card).dark;
        switch (card.kind) {
            case 'organo': return `<circle cy="-7" r="5" fill="${d}"/><path d="M-9 11 V3 Q-9 -2 -4 -2 H4 Q9 -2 9 3 V11 Z" fill="${d}"/>`;
            case 'virus': return `<circle r="7" fill="${d}"/>${Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3; return `<line x1="0" y1="0" x2="${(12 * Math.cos(a)).toFixed(1)}" y2="${(12 * Math.sin(a)).toFixed(1)}" stroke="${d}" stroke-width="3" stroke-linecap="round"/>`; }).join('')}`;
            case 'medicina': return `<g transform="rotate(-40)"><rect x="-12" y="-6" width="24" height="12" rx="6" fill="#fff" stroke="${d}" stroke-width="2.5"/><path d="M0 -6 H6 A6 6 0 0 1 6 6 H0 Z" fill="${d}"/></g>`;
            default: return `<path d="M-3.5 -11 h7 v7.5 h7.5 v7 h-7.5 v7.5 h-7 v-7.5 h-7.5 v-7 h7.5 Z" fill="${d}"/>`;
        }
    },

    title(card) {
        if (card.kind === 'organo') return { rojo: 'Corazón', azul: 'Cerebro', verde: 'Estómago', amarillo: 'Hueso', multi: 'Comodín' }[card.color];
        if (card.kind === 'virus') return 'Virus';
        if (card.kind === 'medicina') return 'Medicina';
        return { trasplante: 'Trasplante', ladron: 'Ladrón', contagio: 'Contagio', guante: 'Guante', error: 'Error médico' }[card.treat];
    },

    /** La cara de una carta. */
    face(card) {
        if (!card) return this.back();
        const key = card.kind + (card.color || card.treat);
        const hit = this._cache.get(key);
        if (hit) return hit;
        const P = this.paint(card), bgId = card.kind === 'tratamiento' ? 'trat' : card.color;
        const art = card.kind === 'organo' ? this.organArt(card.color) : card.kind === 'virus' ? this.virusArt(card.color) : card.kind === 'medicina' ? this.medicineArt(card.color) : this.treatmentArt(card.treat);
        const title = this.title(card);
        const corner = card.kind === 'tratamiento' ? '' : `<g transform="translate(164 38)"><circle r="21" fill="#fff" stroke="${P.dark}" stroke-width="3"/><g transform="scale(.27)">${card.color === 'multi' ? this.quarters(48, P.dark) : this.plain(() => this.organArt(card.color))}</g></g>`;
        const svg = `<svg viewBox="0 0 200 300" class="art" aria-hidden="true" focusable="false">
            <rect x="2" y="2" width="196" height="296" rx="16" fill="#fffdf8" stroke="#2a1f3d" stroke-width="3"/>
            <rect x="10" y="10" width="180" height="280" rx="11" fill="url(#vbg-${bgId})"/>
            <rect x="10" y="10" width="180" height="280" rx="11" fill="url(#vDots)"/>
            <circle cx="100" cy="142" r="76" fill="#fffdf8" stroke="${P.dark}" stroke-width="4"/>
            <circle cx="100" cy="142" r="76" fill="${card.kind === 'virus' ? '#f3e8ff' : '#fff'}" opacity=".35"/>
            <g transform="translate(100 142)">${art}</g>
            <g transform="translate(36 38)"><circle r="21" fill="#fff" stroke="${P.dark}" stroke-width="3"/>${this.kindIcon(card)}</g>
            ${corner}
            <rect x="20" y="238" width="160" height="40" rx="20" fill="${P.dark}"/>
            <text x="100" y="266" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="${title.length > 9 ? 21 : 25}" font-weight="800" fill="#fff" letter-spacing=".5">${title}</text>
        </svg>`;
        this._cache.set(key, svg);
        return svg;
    },

    back() {
        return this._back ||= `<svg viewBox="0 0 200 300" class="art" aria-hidden="true" focusable="false">
            <rect x="2" y="2" width="196" height="296" rx="16" fill="#fffdf8" stroke="#2a1f3d" stroke-width="3"/>
            <rect x="10" y="10" width="180" height="280" rx="11" fill="url(#vBack)"/>
            <rect x="18" y="18" width="164" height="264" rx="8" fill="none" stroke="#7ee07a" stroke-width="3" opacity=".7"/>
            <g transform="translate(100 120) scale(.82)">${this.virusArt('verde')}</g>
            <text x="100" y="238" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="40" font-weight="900" fill="#7ee07a" stroke="#14321a" stroke-width="3" paint-order="stroke" letter-spacing="2">VIRUS</text>
        </svg>`;
    },

    fan(cards) {
        const n = cards.length, mid = (n - 1) / 2;
        return `<span class="fan virus-fan" aria-hidden="true">${cards.map((c, i) => `<span class="fan-card" style="--a:${((i - mid) * 14).toFixed(1)}deg;--i:${i}">${this.face(c)}</span>`).join('')}</span>`;
    },

    /** Para el salón: un corazón, un virus y una medicina. */
    tile() {
        this.installDefs();
        return this.fan([{ kind: 'organo', color: 'rojo' }, { kind: 'virus', color: 'verde' }, { kind: 'medicina', color: 'azul' }]);
    },
};

// ═══════════════════════════════════════════════════════
// La partida
// ═══════════════════════════════════════════════════════

class VirusMatch extends Match {
    static get kind() { return 'virus'; }
    get beats() { return VIRUS_BEAT; }

    setup() {
        this.sel = null;          // tu carta elegida
        this.choice = null;       // { slot, paths, depth, picked }: dónde va la carta elegida
        this.optSel = null;       // la opción marcada, a la espera del segundo toque
        this.discarding = null;   // las cartas que vas a descartar (Set) o null
        this.lastPlay = null;     // lo último que ha pasado, para repetirlo
        this.lastResult = null;
        this.advisor = new VirusBot(this.game, this.me, { level: 'dificil' }, makeRng(this.seed + 4242));
        this.syncShown();
    }

    makeGame(rules, seed) { return new VirusGame({ players: this.seats.map(s => ({ name: s.name })), rules, seed }); }
    makeMirror(rules) { return new VirusMirror({ names: this.seats.map(s => s.name), rules, me: this.me }); }
    makeBot(p, char, rng) { return new VirusBot(this.game, p, char, rng); }
    eventFor(e, seat) { return virusEventFor(e, seat); }
    stateKey() { const g = this.game; return `${g.phase}|${g.round}|${g.current}|${g.deck.length}|${g.discardPile.length}|${g.players.map(pl => pl.body.length).join('')}`; }
    faceOf(card) { return card ? VirusArt.face(card) : VirusArt.back(); }

    /** Lo que se ve en la mesa, al ritmo de lo que se cuenta (la partida ya va por delante). */
    syncShown() {
        const g = this.game;
        this.shown = {
            bodies: g.players.map(pl => pl.body.map(o => ({ organ: o.organ, items: o.items.slice() }))),
            hand: (g.handOf(this.me) || []).map(c => c && !c.hidden ? c : null),
            counts: g.players.map((_, p) => g.countOf(p)),
            deck: g.deck.length,
            discard: g.discardPile.length,
            top: g.discardPile[g.discardPile.length - 1] || null,
        };
        while (this.shown.hand.length < VIRUS_HAND) this.shown.hand.push(null);
    }
    afterApply() { this.syncShown(); Board.render(this); }
    afterBatch() { this.syncShown(); }

    // ── Textos ────────────────────────────────────────
    organName(color) { return VIRUS_ORGAN[color]; }
    /** «el virus rojo», «una medicina azul», «el corazón», «el trasplante». */
    cardName(c, art = 'def') {
        if (!c) return 'nada';
        const el = art === 'def' ? 'el ' : art === 'un' ? 'un ' : '';
        const la = art === 'def' ? 'la ' : art === 'un' ? 'una ' : '';
        if (c.kind === 'organo') return `${el}${this.organName(c.color)}`;
        if (c.kind === 'virus') return `${el}virus ${VIRUS_COLOR_M[c.color]}`;
        if (c.kind === 'medicina') return `${la}medicina ${VIRUS_COLOR_F[c.color]}`;
        return c.treat === 'guante' || c.treat === 'error' || c.treat === 'ladron' || c.treat === 'trasplante' || c.treat === 'contagio' ? `${el}${VIRUS_TREAT[c.treat]}` : VIRUS_TREAT[c.treat];
    }
    /** El nombre de una carta y para qué sirve. */
    cardLong(c) {
        if (c.kind === 'organo') return c.color === 'multi' ? 'órgano multicolor: vale por cualquier color' : `${this.organName(c.color)}, órgano ${VIRUS_COLOR_M[c.color]}`;
        if (c.kind === 'virus') return c.color === 'multi' ? 'virus multicolor: infecta cualquier órgano' : `virus ${VIRUS_COLOR_M[c.color]}: ataca ${this.organName(c.color) === 'corazón' ? 'corazones' : this.organName(c.color) + 's'}`;
        if (c.kind === 'medicina') return c.color === 'multi' ? 'medicina multicolor: cura y protege cualquier órgano' : `medicina ${VIRUS_COLOR_F[c.color]}: para el ${this.organName(c.color)}`;
        return `${VIRUS_TREAT[c.treat]}: ${VIRUS_TREAT_HELP[c.treat]}`;
    }
    /** «tu corazón», «su corazón» (de quien actúa), «el corazón de Lola». */
    ref(p, color, actor = null) {
        const n = this.organName(color);
        if (p === this.me) return `tu ${n}`;
        if (actor != null && p === actor) return `su ${n}`;
        return `el ${n} de ${this.names[p]}`;
    }
    /** «de tu corazón», «del corazón de Lola». */
    deRef(p, color, actor = null) { const r = this.ref(p, color, actor); return r.startsWith('el ') ? 'del ' + r.slice(3) : 'de ' + r; }
    /** «al corazón de Lola», «a tu corazón». */
    aRef(p, color, actor = null) { const r = this.ref(p, color, actor); return r.startsWith('el ') ? 'al ' + r.slice(3) : 'a ' + r; }

    stateText(o) {
        const st = organState(o), top = o.items[o.items.length - 1];
        if (st === 'libre') return 'libre';
        if (st === 'infectado') return `infectado con un virus ${VIRUS_COLOR_M[top.color]}`;
        if (st === 'vacunado') return `vacunado con una medicina ${VIRUS_COLOR_F[top.color]}`;
        return 'inmune';
    }
    stateShort(o) { return { libre: '', infectado: 'Infectado', vacunado: 'Vacunado', inmune: 'Inmune' }[organState(o)]; }

    bodyOfShown(p) { return this.shown.bodies[p].slice().sort((a, b) => VIRUS_ORDER[a.organ.color] - VIRUS_ORDER[b.organ.color]); }
    healthy(p) { return this.shown.bodies[p].filter(organHealthy).length; }

    bodyText(p) {
        const body = this.bodyOfShown(p);
        if (!body.length) return 'sin órganos';
        const list = Txt.list(body.map(o => `${this.organName(o.organ.color)} ${this.stateText(o)}`));
        const h = this.healthy(p);
        return `${list}. ${h === 1 ? '1 órgano sano' : h + ' órganos sanos'}`;
    }

    handText() {
        const parts = this.shown.hand.map((c, s) => c ? `${s + 1}, ${this.cardName(c, 'none')}` : null).filter(Boolean);
        return parts.length ? parts.join('; ') : 'no tienes cartas';
    }

    whoText(p) { return p === this.me ? 'Tu cuerpo' : `${cap(this.names[p])}`; }

    introText() {
        const g = this.game;
        let text = super.introText();
        if (g.teamPlay) text += ` Jugáis por parejas: vas con ${Txt.list(g.partners(this.me).map(p => this.names[p]))}.`;
        const goal = g.rules.winsToWin;
        if (goal > 1) text += ` Gana quien consiga antes ${goal} rondas.`;
        if (this.practice) text = 'Partida de práctica: con la A te doy un consejo. ' + text;
        return text;
    }

    // ── Las jugadas de la carta elegida, paso a paso ──
    /** Los pasos de una jugada: cada uno con su clave, su texto y el órgano que señala. */
    pathsOf(play) {
        const me = this.me;
        const step = (key, label, target = null) => ({ key, label, target });
        const t = play.target;
        switch (play.effect) {
            case 'organo': return [[step('o', `Poner ${this.cardName(this.game.card(me, play.slot))} en tu cuerpo`)]];
            case 'guante': return [[step('g', 'Usar el guante de látex: los demás tiran sus cartas y pierden un turno')]];
            case 'error': return [[step('e' + t.p, `Cambiar tu cuerpo por el de ${this.names[t.p]}: ${this.bodyText(t.p)}`, { p: t.p })]];
            case 'ladron': {
                const o = this.game.organ(t.p, t.color);
                return [[step(`${t.p}:${t.color}`, `Robar ${this.ref(t.p, t.color)}, ${this.stateText(o)}`, t)]];
            }
            case 'trasplante': {
                const one = (x, y) => [
                    step(`${x.p}:${x.color}`, `Cambiar ${this.ref(x.p, x.color)}`, x),
                    step(`${y.p}:${y.color}`, `por ${this.ref(y.p, y.color)}, ${this.stateText(this.game.organ(y.p, y.color))}`, y),
                ];
                return [one(play.a, play.b), one(play.b, play.a)];
            }
            case 'contagio': {
                const froms = this.game.bodyOf(me).filter(o => organState(o) === 'infectado').map(o => o.organ.color);
                return [froms.map(f => {
                    const m = play.moves.find(x => x.from === f);
                    const v = VIRUS_COLOR_M[this.game.organ(me, f).items[0].color];
                    return m ? step(`${f}>${m.to.p}:${m.to.color}`, `Pasar el virus ${v} de tu ${this.organName(f)} ${this.aRef(m.to.p, m.to.color)}`, m.to)
                        : step(`${f}>no`, `Dejar el virus ${v} en tu ${this.organName(f)}`, { p: me, color: f });
                })];
            }
            default: {
                const verb = {
                    infectar: `Infectar ${this.ref(t.p, t.color)}`,
                    extirpar: `Destruir ${this.ref(t.p, t.color)}, que ya está infectado`,
                    destruirVacuna: `Quitar la vacuna ${this.deRef(t.p, t.color)}`,
                    vacunar: `Vacunar ${this.ref(t.p, t.color)}`,
                    inmunizar: `Inmunizar ${this.ref(t.p, t.color)}: nadie podrá tocarlo`,
                    curar: `Curar ${this.ref(t.p, t.color)}`,
                }[play.effect];
                return [[step(`${t.p}:${t.color}`, verb, t)]];
            }
        }
    }

    startChoice(slot) {
        const plays = this.game.playsFor(this.me, slot);
        const paths = plays.flatMap(play => this.pathsOf(play).map(steps => ({ play, steps })));
        this.choice = { slot, paths, depth: 0 };
        this.optSel = null;
        this.skipSingles();
    }

    /** En los pasos con una sola salida (que no son el último), se sigue solo. */
    skipSingles() {
        const c = this.choice;
        while (c) {
            const opts = this.options();
            const last = c.paths.every(x => x.steps.length === c.depth + 1);
            if (opts.length !== 1 || last) break;
            c.paths = c.paths.filter(x => x.steps[c.depth].key === opts[0].key);
            c.depth++;
        }
    }

    /** Las opciones de este paso: [{ key, label, target }]. */
    options() {
        const c = this.choice;
        if (!c) return [];
        const seen = new Map();
        for (const x of c.paths) {
            const s = x.steps[c.depth];
            if (s && !seen.has(s.key)) seen.set(s.key, s);
        }
        return [...seen.values()];
    }

    /** Lo que se dijo antes en esta jugada («Cambiar tu corazón»), para el paso siguiente. */
    choiceSoFar() {
        const c = this.choice;
        if (!c || !c.depth) return '';
        return c.paths[0].steps.slice(0, c.depth).map(s => s.label).join(', ');
    }

    targetIndex(p, color) {
        return this.options().findIndex(o => o.target && o.target.p === p && (o.target.color == null || o.target.color === color));
    }

    // ── La mesa ───────────────────────────────────────
    actionsDef() {
        return [
            { kind: 'play', label: 'Jugar', key: 'Enter', cls: 'main' },
            { kind: 'discard', label: 'Descartar', key: 'D', cls: 'main alt' },
            { kind: 'cancel', label: 'Elegir otra carta', key: 'Esc', cls: 'main ghostbtn' },
            { kind: 'advice', label: 'Consejo', key: 'A' },
            { kind: 'table', label: 'La mesa', key: 'M', cls: 'small talk' },
            { kind: 'info', label: 'Cómo va', key: 'I', cls: 'small talk' },
            { kind: 'cards', label: 'Mis cartas', key: 'C', cls: 'small talk' },
            { kind: 'repeat', label: 'Repetir', key: 'Espacio', cls: 'small talk' },
            { kind: 'menu', label: 'Pausa', key: 'Esc', cls: 'small' },
        ];
    }

    button(kind) {
        if (kind === 'table') return this.describeTable();
        if (kind === 'cancel') { this.cancelPick(); return; }
        if (kind === 'advice' && !this.want?.kinds.has('advice')) return this.advise();
        if (kind === 'discard' && !this.want?.kinds.has('discard')) { this.audio.error(); this.explainCant('discard'); return; }
        return super.button(kind);
    }

    buildCenter(center) {
        VirusArt.installDefs();
        center.innerHTML = `
            <div class="vpiles">
                <button id="v-deck" class="pile pile-btn nav" aria-label="Mazo">
                    <span class="pile-card vstack">${VirusArt.back()}</span>
                    <span class="pile-cap">Mazo: <span id="v-deck-count">0</span></span>
                </button>
                <button id="v-discard" class="pile pile-btn nav" aria-label="Descartes">
                    <span class="pile-card" id="v-discard-card"></span>
                    <span class="pile-cap">Descartes: <span id="v-discard-count">0</span></span>
                </button>
            </div>
            <div id="v-opts" class="vopts" role="group" aria-label="Dónde juegas la carta" hidden>
                <p id="v-opts-title" class="vopts-title" aria-hidden="true"></p>
                <div id="v-opts-list" class="vopts-list"></div>
            </div>`;
        $('v-deck').addEventListener('click', () => this.describePiles());
        $('v-discard').addEventListener('click', () => this.describePiles());
        // Los cuerpos: el tuyo encima de tus cartas, el de los demás en su sitio.
        for (let p = 0; p < this.game.n; p++) {
            const box = document.createElement('div');
            box.className = 'vbody';
            box.setAttribute('role', 'group');
            box.dataset.p = p;
            box.setAttribute('aria-label', p === this.me ? 'Tu cuerpo' : `Cuerpo de ${this.names[p]}`);
            if (p === this.me) $('seat-me').insertBefore(box, $('my-hand'));
            else Board.seatEl(p)?.insertBefore(box, Board.handEl(p));
        }
    }

    bodyEl(p) { return document.querySelector(`.vbody[data-p="${p}"]`); }
    organEl(p, color) { return this.bodyEl(p)?.querySelector(`.vorg[data-color="${color}"]`); }

    render() {
        const g = this.game, me = this.me, S = this.shown;
        const myTurn = g.phase === 'turn' && g.current === me && !!this.want;
        const opts = this.options();
        for (let p = 0; p < g.n; p++) {
            const seat = Board.seatEl(p);
            if (!seat) continue;
            seat.classList.toggle('active', g.phase === 'turn' && g.current === p);
            seat.classList.toggle('winner', !!this.lastResult && this.lastResult.winners.includes(p));
            if (g.teamPlay) { seat.classList.toggle('team-a', g.team(p) === g.team(me)); seat.classList.toggle('team-b', g.team(p) !== g.team(me)); }
            Board.setWins(p, g.players[p].wins);
            const h = this.healthy(p);
            Board.setScore(p, `${h} de 4`);
            seat.classList.toggle('vdanger', h === 3 && g.phase === 'turn');
            this.renderBody(p, opts);
            if (p !== me) {
                const hand = Board.handEl(p), n = S.counts[p];
                if (hand.dataset.n !== String(n)) {
                    hand.dataset.n = n;
                    hand.innerHTML = Array.from({ length: n }, () => `<span class="mini">${VirusArt.back()}</span>`).join('');
                    hand.setAttribute('aria-label', `${cap(this.names[p])}: ${n === 1 ? '1 carta' : n + ' cartas'} en la mano`);
                }
            }
        }
        // Tus cartas
        const hand = Board.handEl(me);
        const playable = myTurn ? new Set(g.playable(me)) : null;
        Board.trimSlots(me, VIRUS_HAND);
        S.hand.forEach((c, s) => {
            const b = Board.slotButton(me, s, hand, s);
            if (!b.dataset.v) { b.dataset.v = '1'; b.querySelector('.back').innerHTML = VirusArt.back(); }
            const front = b.querySelector('.front'), fk = c ? c.kind + (c.color || c.treat) : '';
            if (front.dataset.k !== fk) { front.dataset.k = fk; front.innerHTML = c ? VirusArt.face(c) : ''; }
            b.classList.toggle('up', !!c);
            b.classList.toggle('empty', !c);
            b.classList.toggle('chosen', !!c && (this.choice?.slot === s || !!this.discarding?.has(s)));
            b.classList.toggle('discarding', !!c && !!this.discarding?.has(s));
            b.classList.toggle('pickable', !!c && !!playable?.has(s) && !this.choice && !this.discarding);
            b.classList.toggle('blocked', !!c && !!playable && !playable.has(s) && !this.discarding);
            b.disabled = !c;
            b.setAttribute('aria-label', this.cardLabel(s, playable));
        });
        // Centro: mazo, descartes y opciones.
        $('v-deck-count').textContent = S.deck;
        $('v-deck').classList.toggle('empty', !S.deck);
        $('v-deck').setAttribute('aria-label', `Mazo: ${S.deck === 1 ? '1 carta' : S.deck + ' cartas'}`);
        $('v-discard-count').textContent = S.discard;
        const top = $('v-discard-card'), tk = S.top ? S.top.kind + (S.top.color || S.top.treat) + S.discard : '';
        if (top.dataset.k !== tk) { top.dataset.k = tk; top.innerHTML = S.top ? VirusArt.face(S.top) : ''; top.classList.toggle('none', !S.top); }
        $('v-discard').setAttribute('aria-label', S.top ? `Descartes: ${S.discard} cartas; arriba, ${this.cardName(S.top, 'none')}` : 'Descartes: vacío');
        this.renderOptions(opts);
        const want = this.want?.kinds;
        const n = this.discarding?.size || 0;
        Board.showAct('play', !!want?.has('play') && (this.discarding ? n > 0 : !!this.choice && (opts.length === 1 || this.optSel != null)),
            this.discarding ? `Descartar ${n === 1 ? '1 carta' : n + ' cartas'}` : this.optSel != null ? 'Confirmar' : 'Jugar');
        Board.showAct('discard', !!want?.has('discard') && !this.discarding, 'Descartar');
        Board.showAct('cancel', !!want && (!!this.choice || !!this.discarding), this.discarding ? 'No descartar' : 'Elegir otra carta');
        Board.showAct('advice', this.practice && !!want);
    }

    renderBody(p, opts) {
        const box = this.bodyEl(p);
        if (!box) return;
        const body = this.bodyOfShown(p);
        const key = body.map(o => o.organ.color + ':' + o.items.map(i => i.kind[0] + i.color).join('')).join('|');
        if (box.dataset.k !== key) {
            box.dataset.k = key;
            box.innerHTML = '';
            if (!body.length) box.innerHTML = '<span class="vbody-empty" aria-hidden="true">Sin órganos</span>';
            for (const o of body) {
                const b = document.createElement('button');
                const st = organState(o);
                b.className = `vorg nav st-${st}`;
                b.dataset.p = p; b.dataset.color = o.organ.color;
                const items = o.items.map((c, i) => `<span class="vitem i${i}${st === 'inmune' ? ' turned' : ''}">${VirusArt.face(c)}</span>`).join('');
                b.innerHTML = `<span class="vorg-card">${VirusArt.face(o.organ)}${items}</span><span class="vtag" aria-hidden="true">${this.stateShort(o)}</span><span class="vnum" aria-hidden="true"></span>`;
                b.addEventListener('click', () => this.organClick(p, o.organ.color));
                box.appendChild(b);
            }
        }
        for (const b of box.querySelectorAll('.vorg')) {
            const color = b.dataset.color, o = body.find(x => x.organ.color === color);
            if (!o) continue;
            const i = this.targetIndex(p, color);
            b.classList.toggle('target', i >= 0);
            b.classList.toggle('marked', i >= 0 && i === this.optSel);
            b.querySelector('.vnum').textContent = i >= 0 ? String(i + 1) : '';
            let label = `${p === this.me ? 'Tu' : `${cap(this.names[p])}:`} ${this.organName(color)}, ${this.stateText(o)}`;
            if (i >= 0) label += `. Opción ${i + 1}: ${opts[i].label}`;
            b.setAttribute('aria-label', label);
        }
        box.classList.toggle('target', opts.some(o => o.target && o.target.p === p && o.target.color == null));
    }

    renderOptions(opts) {
        const box = $('v-opts'), list = $('v-opts-list');
        const show = !!this.choice && opts.length > 0;
        box.hidden = !show;
        const key = show ? `${this.choice.slot}|${this.choice.depth}|${opts.map(o => o.key).join(',')}` : '';
        if (list.dataset.k !== key) {
            list.dataset.k = key;
            list.innerHTML = '';
            opts.forEach((o, i) => {
                const b = document.createElement('button');
                b.className = 'vopt nav';
                b.innerHTML = `<span class="vopt-n" aria-hidden="true">${i + 1}</span><span class="vopt-t"></span>`;
                b.querySelector('.vopt-t').textContent = o.label;
                b.addEventListener('click', () => this.tapOption(i));
                list.appendChild(b);
            });
        }
        if (!show) return;
        const card = this.shown.hand[this.choice.slot];
        $('v-opts-title').textContent = this.choice.depth ? `${this.choiceSoFar()}…` : card ? `${cap(this.cardName(card, 'none'))}: ${opts.length === 1 ? 'toca otra vez para jugarla' : 'elige dónde'}` : '';
        [...list.children].forEach((b, i) => {
            b.classList.toggle('chosen', this.optSel === i);
            b.setAttribute('aria-label', `${i + 1}: ${opts[i].label}${this.optSel === i ? '. Elegida: pulsa otra vez para confirmar' : ''}`);
        });
    }

    cardLabel(s, playable) {
        const c = this.shown.hand[s];
        if (!c) return `Sitio ${s + 1}, sin carta`;
        let label = `Tu carta ${s + 1}: ${this.cardLong(c)}`;
        if (this.discarding) label += this.discarding.has(s) ? '. Marcada para descartar' : '. Pulsa para marcarla y descartarla';
        else if (this.choice?.slot === s) label += '. Elegida';
        else if (playable && !playable.has(s)) label += '. Ahora no se puede jugar';
        return label;
    }

    // ── Lo que pasa, contado y animado ────────────────
    /** Cambia la mesa que se ve según un suceso (la partida ya va por delante). */
    applyShown(e) {
        const S = this.shown, me = this.me;
        const org = (p, color) => S.bodies[p].find(o => o.organ.color === color);
        const toPile = (...cards) => { for (const c of cards) if (c) { S.discard++; S.top = c; } };
        const fromHand = (p, slot) => { if (p === me) S.hand[slot] = null; else S.counts[p] = Math.max(0, S.counts[p] - 1); };
        if (e.t === 'play') {
            fromHand(e.p, e.slot);
            const t = e.target;
            switch (e.effect) {
                case 'organo': S.bodies[e.p].push({ organ: e.card, items: [] }); break;
                case 'infectar': case 'vacunar': case 'inmunizar': org(t.p, t.color)?.items.push(e.card); break;
                case 'extirpar': S.bodies[t.p] = S.bodies[t.p].filter(o => o.organ.color !== t.color); toPile(...e.gone); break;
                case 'curar': case 'destruirVacuna': { const o = org(t.p, t.color); o?.items.pop(); toPile(...e.gone); break; }
                case 'trasplante': {
                    toPile(e.card);
                    const A = S.bodies[e.a.p], B = S.bodies[e.b.p];
                    const ia = A.findIndex(o => o.organ.color === e.a.color), ib = B.findIndex(o => o.organ.color === e.b.color);
                    if (ia >= 0 && ib >= 0) { const x = A[ia]; A[ia] = B[ib]; B[ib] = x; }
                    break;
                }
                case 'ladron': {
                    toPile(e.card);
                    const o = org(t.p, t.color);
                    if (o) { S.bodies[t.p] = S.bodies[t.p].filter(x => x !== o); S.bodies[e.p].push(o); }
                    break;
                }
                case 'contagio': {
                    toPile(e.card);
                    for (const m of e.moves) { const v = org(e.p, m.from)?.items.pop(); if (v) org(m.to.p, m.to.color)?.items.push(v); }
                    break;
                }
                case 'guante': {
                    toPile(e.card);
                    for (const l of e.lost) { if (l.p === me) S.hand = [null, null, null]; S.counts[l.p] = 0; toPile(...l.cards); }
                    break;
                }
                case 'error': { toPile(e.card); const q = t.p; [S.bodies[e.p], S.bodies[q]] = [S.bodies[q], S.bodies[e.p]]; break; }
            }
        } else if (e.t === 'discard') {
            for (const s of e.slots) fromHand(e.p, s);
            toPile(...e.cards);
        } else if (e.t === 'draw') {
            S.deck = Math.max(0, S.deck - e.slots.length);
            if (e.p === me) e.slots.forEach((s, i) => { S.hand[s] = e.cards[i]; });
            S.counts[e.p] += e.slots.length;
        } else if (e.t === 'flip') {
            S.deck = e.count; S.discard = 0; S.top = null;
        }
        S.counts[me] = S.hand.filter(Boolean).length;
    }

    async present(e) {
        const g = this.game, me = this.me, v = this.v, A = this.audio, B = Board, S = this.shown;
        const pan = p => A.panOf(p);
        switch (e.t) {
            case 'round': {
                this.lastResult = null; this.lastPlay = null;
                this.clearChoice();
                this.shown = { bodies: g.players.map(() => []), hand: [null, null, null], counts: g.players.map(() => 0), deck: 68, discard: 0, top: null };
                B.render(this);
                A.shuffle();
                await this.sleep(650);
                A.deal(g.n, VIRUS_HAND);
                B.dealAnim(g.n, VIRUS_HAND);
                this.shown.deck = 68 - g.n * VIRUS_HAND;
                this.shown.counts = g.players.map(() => VIRUS_HAND);
                await this.sleep(400 + g.n * 3 * 90);
                B.render(this);
                const who = e.dealer === me ? 'Repartes tú' : `Reparte ${g.players[e.dealer].name}`;
                B.status(`Ronda ${e.round}`);
                const goal = e.round === 1 && !this.brief ? ' Gana quien tenga antes cuatro órganos sanos, de colores distintos.' : '';
                await this.say(`${g.rules.winsToWin === 1 && e.round === 1 ? '' : `Ronda ${e.round}. `}${who}.${goal}`, { keep: true });
                break;
            }
            case 'deal': {
                if (e.p !== me) break;
                this.shown.hand = e.cards.slice();
                B.render(this);
                e.cards.forEach((c, i) => A.virusCard(c, A.slotPan(i, 3), 0.15 + i * 0.35));
                await this.say(`Tus cartas: ${this.handText()}.`, { keep: true });
                break;
            }
            case 'turn': {
                if (e.p === me) {
                    A.yourTurn();
                    const spoken = this.brief ? `Tu turno. ${this.handText()}.` : `Tu turno. Tienes ${this.handText()}.${this.hint('turn', 'Elige una carta con su número para jugarla, o descarta con la D.')}`;
                    this.prompt('Tu turno: juega una carta o descarta', spoken);
                } else {
                    A.otherTurn(e.p);
                    B.status(`Turno de ${this.names[e.p]}`);
                    if (this.seats[e.p].kind === 'remote' && !this.brief) await this.say(`Turno de ${v.name(e.p)}.`);
                }
                break;
            }
            case 'play': await this.presentPlay(e); break;
            case 'discard': {
                const from = e.p === me ? B.slotEl(me, e.slots[0]) : B.seatEl(e.p);
                this.applyShown(e);
                if (e.p === me) this.clearChoice();
                A.place(pan(e.p));
                B.render(this);
                e.cards.forEach((c, i) => setTimeout(() => B.fly(from, $('v-discard-card'), c, 380), i * 120 * this.timeScale));
                const n = e.cards.length === 1 ? '1 carta' : `${e.cards.length} cartas`;
                if (e.p === me) await this.say(`Descartas ${Txt.list(e.cards.map(c => this.cardName(c)))}.`);
                else {
                    B.bubble(e.p, `Descarta ${n}`);
                    await this.say(this.brief ? `${v.Name(e.p)} descarta ${n}.` : `${v.Name(e.p)} descarta ${n}: ${Txt.list(e.cards.map(c => this.cardName(c, 'un')))}.`, { keep: true });
                }
                await this.beat('discard');
                break;
            }
            case 'draw': {
                this.applyShown(e);
                if (e.p === me) {
                    A.flick(0);
                    B.render(this);
                    e.slots.forEach((s, i) => {
                        const el = B.slotEl(me, s);
                        el.style.visibility = 'hidden';
                        A.virusCard(e.cards[i], A.slotPan(s, 3), 0.1 + i * 0.25);
                        B.fly($('v-deck'), el, null, 380).then(() => { el.style.visibility = ''; });
                    });
                    await this.say(`Robas ${Txt.list(e.cards.map(c => this.cardName(c, 'un')))}.`, { keep: true });
                } else {
                    A.flick(pan(e.p));
                    B.render(this);
                    B.fly($('v-deck'), B.seatEl(e.p), null, 380);
                    await this.sleep(150);
                }
                break;
            }
            case 'flip': {
                this.applyShown(e);
                A.shuffle();
                B.render(this);
                B.banner('Se acabó el mazo', 'Se da la vuelta a los descartes');
                await this.say('Se ha acabado el mazo: se da la vuelta a los descartes.');
                break;
            }
            case 'lostTurn': {
                B.bubble(e.p, 'Pierde el turno');
                A.pass();
                await this.say(e.p === me ? 'No tienes cartas: pierdes el turno y robas tres nuevas.' : `${v.Name(e.p)} no tiene cartas: pierde el turno y roba.`, { keep: e.p === me });
                await this.beat('lost');
                break;
            }
            case 'roundOver': await this.presentResult(e); break;
            case 'gameOver': break;
        }
    }

    async presentPlay(e) {
        const g = this.game, me = this.me, v = this.v, A = this.audio, B = Board;
        const pan = A.panOf(e.p);
        const from = e.p === me ? B.slotEl(me, e.slot) : B.seatEl(e.p);
        const before = g.players.map((_, p) => this.healthy(p));
        const t = e.target, actor = e.p, Who = v.Name(actor);
        const mine = actor === me;
        let text = '', bubble = '', target = null, big = false, quip = null, status = '';
        // A dónde vuela la carta.
        if (t?.color) target = this.organEl(t.p, t.color);
        else if (e.effect === 'organo') target = this.bodyEl(actor);
        else target = $('v-discard-card');
        if (e.p === me) this.clearChoice();
        B.fly(from, target || $('v-discard-card'), e.card, 450);
        await this.sleep(260);
        this.applyShown(e);
        B.render(this);
        const tEl = t?.color ? this.organEl(e.effect === 'ladron' ? actor : t.p, t.color) : null;
        switch (e.effect) {
            case 'organo':
                A.organ(e.card.color, pan);
                text = mine ? `Pones ${this.cardName(e.card)}.` : `${Who} pone ${this.cardName(e.card, 'un')}.`;
                bubble = `Pone ${this.cardName(e.card, 'un')}`;
                B.pulse(this.organEl(actor, e.card.color), 'land');
                break;
            case 'infectar':
                A.infect(A.panOf(t.p));
                text = mine ? `Infectas ${this.ref(t.p, t.color)}.` : `${Who} infecta ${this.ref(t.p, t.color, actor)} con ${this.cardName(e.card, 'un')}.`;
                bubble = '¡Infecta!'; quip = 'virusAttack';
                B.pulse(tEl, 'shake');
                break;
            case 'extirpar':
                A.destroy(A.panOf(t.p));
                text = mine ? `¡Destruyes ${this.ref(t.p, t.color)}!` : `¡${Who} destruye ${this.ref(t.p, t.color, actor)}!`;
                bubble = '¡Destruye!'; big = true; quip = 'virusAttack';
                B.burst(this.bodyEl(t.p));
                break;
            case 'destruirVacuna':
                A.destroy(A.panOf(t.p), false);
                text = mine ? `Quitas la vacuna ${this.deRef(t.p, t.color)}.` : `${Who} quita la vacuna ${this.deRef(t.p, t.color, actor)} con ${this.cardName(e.card, 'un')}.`;
                bubble = 'Rompe una vacuna';
                B.pulse(tEl, 'shake');
                break;
            case 'vacunar':
                A.cure(pan);
                text = mine ? `Vacunas ${this.ref(t.p, t.color)}.` : `${Who} vacuna ${this.ref(t.p, t.color, actor)}.`;
                bubble = 'Vacuna';
                B.pulse(tEl, 'land');
                break;
            case 'inmunizar':
                A.immunize(pan);
                text = mine ? `Inmunizas ${this.ref(t.p, t.color)}: ya nadie lo puede tocar.` : `${Who} inmuniza ${this.ref(t.p, t.color, actor)}: ya nadie lo puede tocar.`;
                bubble = '¡Inmune!'; quip = 'immune';
                B.burst(tEl);
                break;
            case 'curar':
                A.cure(pan);
                text = mine ? `Curas ${this.ref(t.p, t.color)}.` : `${Who} cura ${this.ref(t.p, t.color, actor)}.`;
                bubble = 'Cura';
                B.pulse(tEl, 'land');
                break;
            case 'trasplante': {
                A.treatment(pan);
                A.swap?.(A.panOf(e.a.p), A.panOf(e.b.p));
                const a = e.a, b = e.b;
                B.banner('¡Trasplante!', `${cap(this.names[a.p])} y ${this.names[b.p]} se cambian un órgano`);
                if (a.p === actor || b.p === actor) {
                    const mineSide = a.p === actor ? a : b, other = a.p === actor ? b : a;
                    text = mine ? `Trasplante: cambias tu ${this.organName(mineSide.color)} por ${this.ref(other.p, other.color)}.`
                        : `Trasplante: ${v.name(actor)} cambia su ${this.organName(mineSide.color)} por ${this.ref(other.p, other.color)}.`;
                } else text = `Trasplante: ${v.name(actor)} cambia ${this.ref(a.p, a.color)} por ${this.ref(b.p, b.color)}.`;
                bubble = 'Trasplante'; big = true;
                B.pulse(this.organEl(a.p, b.color), 'land'); B.pulse(this.organEl(b.p, a.color), 'land');
                break;
            }
            case 'ladron':
                A.treatment(pan);
                B.banner('¡Ladrón de órganos!', `${cap(this.names[actor])} roba un ${this.organName(t.color)}`);
                text = mine ? `¡Robas ${this.ref(t.p, t.color)}!` : t.p === me ? `¡${Who} te roba el ${this.organName(t.color)}!` : `¡${Who} roba ${this.ref(t.p, t.color)}!`;
                bubble = '¡Ladrón!'; big = true; quip = 'virusAttack';
                B.fly(B.seatEl(t.p), this.organEl(actor, t.color) || B.seatEl(actor), null, 500);
                break;
            case 'contagio': {
                A.treatment(pan);
                setTimeout(() => A.infect(0), 250 * this.timeScale);
                B.banner('¡Contagio!', e.moves.length === 1 ? '1 virus pasa a otro jugador' : `${e.moves.length} virus pasan a otros jugadores`);
                const parts = e.moves.map(m => `${mine ? 'tu' : 'su'} ${this.organName(m.from)} ${this.aRef(m.to.p, m.to.color)}`);
                text = `${mine ? 'Contagias' : `${Who} contagia`}: ${parts.length === 1 ? 'un virus pasa de' : 'los virus pasan de'} ${Txt.list(parts)}.`;
                bubble = '¡Contagio!'; big = true; quip = 'virusAttack';
                status = `${mine ? 'Contagias' : `${cap(this.names[actor])} contagia`} ${e.moves.length === 1 ? '1 virus' : e.moves.length + ' virus'}`;
                for (const m of e.moves) B.pulse(this.organEl(m.to.p, m.to.color), 'shake');
                break;
            }
            case 'guante':
                A.glove(pan);
                B.banner('¡Guante de látex!', `Todos menos ${mine ? 'tú' : this.names[actor]} tiran sus cartas`);
                text = mine ? 'Guante de látex: todos los demás tiran sus cartas y pierden su próximo turno.' : `¡Guante de látex! ${Who} hace que todos los demás tiren sus cartas${e.lost.some(l => l.p === me) ? ', tú también,' : ''} y pierdan su próximo turno.`;
                bubble = '¡Guante!'; big = true;
                status = mine ? 'Guante de látex: los demás pierden su turno' : `${cap(this.names[actor])} usa el guante de látex`;
                for (const l of e.lost) B.fly(B.seatEl(l.p), $('v-discard-card'), null, 450);
                break;
            case 'error': {
                A.treatment(pan);
                A.swap?.(pan, A.panOf(t.p));
                B.banner('¡Error médico!', `${cap(this.names[actor])} y ${this.names[t.p]} se cambian el cuerpo`);
                text = mine ? `Error médico: te cambias el cuerpo con ${this.names[t.p]}. Ahora tienes ${this.bodyText(me)}.`
                    : t.p === me ? `¡Error médico! ${Who} se cambia el cuerpo contigo. Ahora tienes ${this.bodyText(me)}.`
                        : `¡Error médico! ${Who} se cambia el cuerpo con ${this.names[t.p]}.`;
                bubble = '¡Error médico!'; big = true;
                status = `Error médico: ${mine ? 'te cambias' : `${cap(this.names[actor])} se cambia`} el cuerpo con ${t.p === me ? 'tigo' : this.names[t.p]}`.replace('con tigo', 'contigo');
                B.pulse(this.bodyEl(actor), 'land'); B.pulse(this.bodyEl(t.p), 'land');
                break;
            }
        }
        if (!mine) B.bubble(actor, bubble, 2000);
        // Quien se queda a un órgano de ganar, se avisa.
        const after = g.players.map((_, p) => this.healthy(p));
        const close = after.map((h, p) => h === 3 && before[p] < 3 ? p : -1).filter(p => p >= 0);
        if (close.length && !this.brief) text += ' ' + close.map(p => p === me ? 'Te falta un solo órgano sano.' : `Cuidado: a ${this.names[p]} le falta un solo órgano sano.`).join(' ');
        this.lastPlay = text;
        Board.status(status || cap(text.split(/(?<=[.!])\s/)[0].replace(/[¡!.]/g, '').trim()));
        await this.say(text, { keep: true });
        if (!mine && quip) await this.quip(actor, quip, 0.25);
        if (big && !mine) {
            const hurt = e.effect === 'ladron' || e.effect === 'extirpar' ? t.p : null;
            if (hurt != null && hurt !== me) await this.quip(hurt, 'virusHit', 0.35);
        }
        await this.beat(big ? 'big' : 'play');
    }

    async presentResult(e) {
        const g = this.game, me = this.me, A = this.audio;
        this.lastResult = e;
        Board.render(this);
        const mine = e.winners.includes(me);
        let res;
        if (e.winner == null) res = 'Nadie consigue un cuerpo sano: la ronda acaba sin ganador.';
        else if (mine) res = e.teams && e.winner !== me ? `¡Tu pareja, ${this.names[e.winner]}, completa su cuerpo! ¡Ganáis la ronda!` : '¡Completas tu cuerpo con cuatro órganos sanos! ¡Ganas la ronda!';
        else res = e.teams ? `${cap(this.names[e.winner])} completa su cuerpo: ganan la ronda ${Txt.list(e.winners.map(p => this.names[p]))}.` : `${cap(this.names[e.winner])} completa su cuerpo con cuatro órganos sanos y gana la ronda.`;
        if (mine) { A.win(); Board.confetti(); Board.banner('¡Cuerpo completo!', e.teams ? 'Ganáis la ronda' : 'Ganas la ronda'); } else { A.lose(); if (e.winner != null) Board.banner('¡Cuerpo completo!', `Gana ${this.names[e.winner]}`); }
        this.app.recordRound('virus', mine, null);
        const goal = g.rules.winsToWin;
        const wins = goal === 1 ? '' : ' Rondas ganadas: ' + Txt.list(g.players.map((_, p) => `${this.v.name(p)} ${e.wins[p]}`)) + '.';
        Board.status(res);
        await this.say(`${res}${wins}`, { keep: true });
        if (this.visual) await this.sleep(1800);
        if (!mine && e.winner != null) await this.quip(e.winner, 'win', 0.7);
    }

    resultText() {
        const e = this.lastResult;
        if (!e) return this.speech.last;
        return this.game.players.map((_, p) => `${cap(this.v.name(p))}: ${this.healthy(p)} órganos sanos`).join(' · ');
    }

    // ── Lo que se pregunta ────────────────────────────
    describeTable() {
        if (this.visual) return;
        const g = this.game;
        const order = [this.me, ...g.players.map((_, p) => p).filter(p => p !== this.me)];
        const parts = order.map(p => `${p === this.me ? 'Tú' : cap(this.names[p])}: ${this.bodyText(p)}.`);
        this.speech.say(parts.join(' '), { interrupt: true });
    }

    describePiles() {
        if (this.visual) return;
        const S = this.shown;
        this.speech.say(`Quedan ${S.deck === 1 ? '1 carta' : S.deck + ' cartas'} en el mazo. ${S.top ? `En los descartes hay ${S.discard}; arriba, ${this.cardName(S.top, 'un')}.` : 'Los descartes están vacíos.'}`, { interrupt: true });
    }

    info() {
        const g = this.game, v = this.v, me = this.me;
        const parts = [g.rules.winsToWin === 1 ? '' : `Ronda ${g.round}.`];
        if (g.phase === 'turn') parts.push(g.current === me ? 'Es tu turno.' : `Es el turno de ${v.name(g.current)}.`);
        parts.push('Órganos sanos: ' + Txt.list(g.players.map((_, p) => `${v.name(p)} ${this.healthy(p)}`)) + '.');
        if (g.teamPlay) parts.push(`Vas con ${Txt.list(g.partners(me).map(p => this.names[p]))}.`);
        if (g.rules.winsToWin !== 1) parts.push('Rondas ganadas: ' + Txt.list(g.players.map((pl, p) => `${v.name(p)} ${pl.wins}`)) + '.');
        if (this.lastPlay) parts.push(`Lo último: ${this.lastPlay}`);
        this.speech.say(parts.filter(Boolean).join(' '), { interrupt: true });
    }

    myCards() {
        this.speech.say(`Tus cartas: ${this.shown.hand.map((c, s) => c ? `${s + 1}, ${this.cardLong(c)}` : null).filter(Boolean).join('; ') || 'no tienes'}. Tu cuerpo: ${this.bodyText(this.me)}.`, { interrupt: true });
    }

    keysHelp() {
        const t = [
            'Del 1 al 3: tus cartas. Al elegir una, te digo qué puedes hacer con ella, con un número para cada jugada.',
            'Con una carta elegida, los números eligen la jugada. Enter confirma. Escape vuelve a tus cartas.',
            'D: descartar. Marca las cartas con su número y pulsa D o Enter para tirarlas.',
            'Flechas: moverte por tus cartas y los órganos de la mesa. También puedes tocar un órgano marcado.',
            'M: los cuerpos de todos. T: el mazo y los descartes.',
            this.practice ? 'A: un consejo.' : '',
            'I: cómo va la partida. C: tus cartas y tu cuerpo. Espacio: repetir lo último. Escape: pausa.',
        ].filter(Boolean);
        this.speech.say(t.join(' ') + this.srKeysTip(), { interrupt: true });
    }

    /** Un consejo: la jugada que haría un buen jugador. */
    advise() {
        const g = this.game, me = this.me;
        if (g.phase !== 'turn' || g.current !== me) { this.notice('El consejo te lo doy cuando te toque.'); return; }
        const a = this.advisor.chooseTurn();
        let text;
        if (a.type === 'discard') text = `Te aconsejo descartar ${a.slots.length === 1 ? 'tu carta' : 'tus cartas'} ${Txt.list(a.slots.map(s => String(s + 1)))}: ${Txt.list(a.slots.map(s => this.cardName(g.card(me, s))))}.`;
        else {
            const play = g.playsFor(me, a.slot).find(x => JSON.stringify([x.target || null, x.a || null, x.b || null, x.moves || null]) === JSON.stringify([a.target || null, a.a || null, a.b || null, a.moves || null])) || g.playsFor(me, a.slot)[0];
            const what = this.pathsOf(play)[0].map(s => s.label.charAt(0).toLowerCase() + s.label.slice(1)).join(', ');
            text = `Te aconsejo tu carta ${a.slot + 1}, ${this.cardName(g.card(me, a.slot))}: ${what}.`;
        }
        this.audio.peek(0);
        Board.status(text);
        if (!this.visual) this.speech.say(text, { interrupt: true });
    }

    // ═══ El jugador ════════════════════════════════════
    clearChoice() { this.choice = null; this.optSel = null; this.discarding = null; this.sel = null; }

    cardClick(p, s) {
        if (this.stopped || p !== this.me) return;
        if (this.input('slot', { slot: s })) return;
        const c = this.shown.hand[s];
        this.audio.slot(s, 3);
        if (c) this.audio.virusCard(c, this.audio.slotPan(s, 3));
        if (!this.visual) this.speech.say(this.cardLabel(s, null) + '.', { interrupt: true });
    }

    organClick(p, color) {
        if (this.stopped) return;
        const i = this.targetIndex(p, color);
        if (i >= 0 && this.input('opt', { i })) return;
        const o = this.shown.bodies[p].find(x => x.organ.color === color);
        if (!o) return;
        this.audio.organColor(color, this.audio.panOf(p));
        const text = `${p === this.me ? 'Tu' : cap(this.names[p]) + ':'} ${this.organName(color)}, ${this.stateText(o)}.`;
        if (this.visual) Board.status(text); else this.speech.say(text, { interrupt: true });
    }

    tapOption(i) {
        if (this.stopped) return;
        if (!this.input('opt', { i })) this.explainCant('opt');
    }

    /** Dice lo que puedes hacer con la carta elegida. */
    announceChoice() {
        const opts = this.options(), c = this.choice;
        if (!c) return;
        const card = this.game.card(this.me, c.slot);
        let spoken, status;
        if (c.depth) {
            spoken = `${this.choiceSoFar()}. Elige: ${opts.map((o, i) => `${i + 1}, ${o.label}`).join('; ')}.`;
            status = `${this.choiceSoFar()}: elige`;
        } else if (opts.length === 1) {
            spoken = `${cap(this.cardLong(card))}. ${opts[0].label}.${this.hint('confirm1', 'Pulsa otra vez, o Enter, para jugarla.')}`;
            status = `${cap(this.cardName(card, 'none'))}: toca otra vez para jugarla`;
        } else {
            spoken = `${cap(this.cardLong(card))}. Puedes: ${opts.map((o, i) => `${i + 1}, ${o.label}`).join('; ')}.${this.hint('pickopt', 'Pulsa su número o toca el órgano marcado. Escape para elegir otra carta.')}`;
            status = `${cap(this.cardName(card, 'none'))}: elige dónde`;
        }
        Board.status(status);
        if (!this.visual) this.speech.say(spoken, { interrupt: true, keep: true });
    }

    async humanStep() {
        const g = this.game, me = this.me;
        if (g.phase !== 'turn' || g.current !== me) return;
        const key = this.stateKey();
        if (this.choice && !g.card(me, this.choice.slot)) this.clearChoice();
        const kinds = ['slot', 'opt', 'play', 'discard'];
        if (this.practice) kinds.push('advice');
        const a = await this.wait(kinds);
        if (!a || a.kind === 'interrupt' || this.stopped || this.stateKey() !== key) return;
        if (a.kind === 'advice') { this.advise(); return; }
        if (a.kind === 'discard') { await this.discardKey(); return; }
        if (a.kind === 'slot') { await this.pickCard(a.slot); return; }
        if (a.kind === 'opt') { await this.pickOption(a.i); return; }
        if (a.kind === 'play') {
            if (this.discarding) { await this.discardKey(); return; }
            if (!this.choice) { this.audio.error(); this.prompt('Primero elige una carta', 'Primero elige una carta, con su número o tocándola.', { interrupt: true }); return; }
            const opts = this.options();
            if (this.optSel != null) { await this.pickOption(this.optSel, true); return; }
            if (opts.length === 1) { await this.pickOption(0, true); return; }
            this.announceChoice();
        }
    }

    async pickCard(s) {
        const g = this.game, me = this.me;
        const c = g.card(me, s);
        if (!c) { this.audio.error(); this.prompt('Ahí no tienes carta', `En el sitio ${s + 1} no tienes carta.`, { interrupt: true }); return; }
        if (this.discarding) {
            if (this.discarding.has(s)) this.discarding.delete(s); else this.discarding.add(s);
            this.audio.select();
            Board.render(this);
            const n = this.discarding.size;
            const t = `${cap(this.cardName(c, 'none'))}: ${this.discarding.has(s) ? 'la descartas' : 'te la quedas'}. ${n ? `Vas a descartar ${n === 1 ? '1 carta' : n + ' cartas'}` : 'Ninguna marcada'}`;
            Board.status(n ? `${n === 1 ? '1 carta marcada' : n + ' cartas marcadas'}: pulsa Descartar` : 'Marca las cartas que descartas');
            if (!this.visual) this.speech.say(`${t}.${n ? this.hint('dconfirm', 'Pulsa D o Enter para descartarlas.') : ''}`, { interrupt: true });
            return;
        }
        if (this.choice?.slot === s) {
            if (this.options().length === 1) { await this.pickOption(0, true); return; }
            this.announceChoice();
            return;
        }
        const plays = g.playsFor(me, s);
        this.audio.virusCard(c, this.audio.slotPan(s, 3));
        if (!plays.length) {
            this.choice = null; this.optSel = null;
            Board.render(this);
            const why = this.whyNot(c);
            Board.status(`${cap(this.cardName(c, 'none'))}: ahora no se puede jugar`);
            if (!this.visual) this.speech.say(`${cap(this.cardLong(c))}. ${why} Puedes descartarla con la D.`, { interrupt: true });
            return;
        }
        this.startChoice(s);
        this.audio.select();
        if (!this.settings.confirmPlay && this.options().length === 1 && this.choice.paths.length === 1) { await this.pickOption(0, true); return; }
        Board.render(this);
        this.announceChoice();
        const first = this.options()[0];
        if (first?.target && this.speech.mode === 'sr') { /* el lector lee el anuncio; el foco se queda en la carta */ }
    }

    async pickOption(i, sure = false) {
        const c = this.choice;
        if (!c) { this.audio.error(); this.notice('Primero elige una carta.'); return; }
        const opts = this.options();
        if (i < 0 || i >= opts.length) { this.audio.error(); this.notice(`Elige del 1 al ${opts.length}.`); return; }
        if (this.settings.confirmPlay && !sure && opts.length > 1 && this.optSel !== i) {
            this.optSel = i;
            this.audio.select();
            Board.render(this);
            Board.status(`${opts[i].label}: toca otra vez para confirmar`);
            if (!this.visual) this.speech.say(`${opts[i].label}.${this.hint('confirm', 'Pulsa otra vez para confirmar.')}`, { interrupt: true });
            return;
        }
        c.paths = c.paths.filter(x => x.steps[c.depth].key === opts[i].key);
        this.optSel = null;
        if (c.paths.every(x => x.steps.length === c.depth + 1)) {
            const play = c.paths[0].play;
            const a = { type: 'play', p: this.me, slot: play.slot };
            for (const k of ['target', 'a', 'b', 'moves']) if (play[k]) a[k] = play[k];
            this.clearChoice();
            await this.act(a);
            return;
        }
        c.depth++;
        this.skipSingles();
        this.audio.select();
        Board.render(this);
        this.announceChoice();
    }

    async discardKey() {
        const me = this.me;
        if (!this.discarding) {
            this.discarding = new Set(this.choice ? [this.choice.slot] : []);
            this.choice = null; this.optSel = null;
            this.audio.select();
            Board.render(this);
            Board.status('Marca las cartas que descartas y pulsa Descartar');
            if (!this.visual) this.speech.say(`Descartar. ${this.discarding.size ? `Tienes marcada tu carta ${[...this.discarding][0] + 1}. ` : ''}Marca las cartas que tiras con su número, y pulsa D o Enter para descartarlas. Escape para no descartar.`, { interrupt: true });
            return;
        }
        if (!this.discarding.size) { this.audio.error(); this.notice('Marca al menos una carta, con su número o tocándola.'); return; }
        const slots = [...this.discarding].sort();
        this.discarding = null;
        await this.act({ type: 'discard', p: me, slots });
    }

    whyNot(c) {
        const g = this.game, me = this.me;
        if (c.kind === 'organo') return `Ya tienes ${c.color === 'multi' ? 'el órgano multicolor' : `un ${this.organName(c.color)}`}, y no puedes tener dos iguales.`;
        if (c.kind === 'virus') return 'No hay ningún órgano de otro jugador donde pueda ir.';
        if (c.kind === 'medicina') return g.bodyOf(me).length ? 'No le sirve a ninguno de tus órganos.' : 'Todavía no tienes órganos donde ponerla.';
        return { trasplante: 'No hay dos órganos que se puedan cambiar.', ladron: 'No hay ningún órgano que puedas robar.', contagio: 'No tienes virus que pasar, o nadie tiene órganos libres de ese color.', guante: 'Nadie más tiene cartas.', error: 'No hay cuerpos que cambiar.' }[c.treat];
    }

    cancelPick() {
        if (this.discarding) { this.discarding = null; Board.render(this); this.notice('No descartas.'); return true; }
        if (!this.choice) return false;
        if (this.optSel != null) { this.optSel = null; Board.render(this); this.notice('Nada elegido.'); return true; }
        this.choice = null;
        Board.render(this);
        this.notice('Elige otra carta.');
        return true;
    }

    async botStep(p) {
        const g = this.game, b = this.bots[p];
        if (!b) return;
        const key = this.stateKey();
        await this.think(900);
        if (this.stopped || this.stateKey() !== key || g.current !== p || this.bots[p] !== b) return;
        await this.act(b.chooseTurn());
    }

    // ── Teclado ───────────────────────────────────────
    /** Filas para las flechas: tus cartas, tu cuerpo y el de los demás. */
    cursorRows() {
        const g = this.game, rows = [];
        const opts = [...document.querySelectorAll('#v-opts:not([hidden]) .vopt')];
        if (opts.length) rows.push(opts);
        const hand = [...$('my-hand').querySelectorAll('.slot:not(:disabled)')];
        if (hand.length) rows.push(hand);
        for (let k = 0; k < g.n; k++) {
            const p = (this.me + k) % g.n;
            const orgs = [...(this.bodyEl(p)?.querySelectorAll('.vorg') || [])];
            if (orgs.length) rows.push(orgs);
        }
        return rows;
    }

    moveCursor(dx, dy) {
        const rows = this.cursorRows();
        if (!rows.length) return;
        const f = UI.active();
        let r = rows.findIndex(row => row.includes(f)), c = r >= 0 ? rows[r].indexOf(f) : -1;
        if (r < 0) { r = 0; c = 0; }
        else if (dy) { r = (r + dy + rows.length) % rows.length; c = Math.min(c, rows[r].length - 1); }
        else c = (c + dx + rows[r].length) % rows[r].length;
        this.audio.move();
        UI.focus(rows[r][c]);
    }

    gameKey(k, e) {
        if (/^[1-9]$/.test(k)) {
            e.preventDefault();
            const i = +k - 1;
            if (this.choice && !this.discarding) { this.tapOption(i); return true; }
            if (i < VIRUS_HAND) this.cardClick(this.me, i);
            else { this.audio.error(); this.speech.say(`No tienes carta ${i + 1}.`, { interrupt: true }); }
            return true;
        }
        if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); this.moveCursor(k === 'ArrowRight' ? 1 : -1, 0); return true; }
        if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); this.moveCursor(0, k === 'ArrowDown' ? 1 : -1); return true; }
        if (k === 'Enter' && this.want?.kinds.has('play') && (this.choice || this.discarding) && !e.target?.classList?.contains('slot') && !e.target?.classList?.contains('vopt') && !e.target?.classList?.contains('vorg') && !e.target?.classList?.contains('act')) { e.preventDefault(); this.input('play'); return true; }
        if (k === 'd') { e.preventDefault(); if (!this.input('discard')) { this.audio.error(); this.explainCant('discard'); } return true; }
        if (k === 'm' || k === 'q') { e.preventDefault(); this.describeTable(); return true; }
        if (k === 't') { e.preventDefault(); this.describePiles(); return true; }
        if (k === 'a') { e.preventDefault(); if (!this.practice) { this.audio.error(); this.notice('Los consejos son para la partida de práctica.'); } else if (!this.input('advice')) this.advise(); return true; }
        return false;
    }

    explainCant(kind) {
        const g = this.game, me = this.me;
        let t = 'Ahora no.';
        if (g.phase === 'turn' && g.current !== me) t = `No es tu turno: juega ${this.v.name(g.current)}.`;
        else if (kind === 'opt') t = 'Primero elige una carta, con su número o tocándola.';
        this.notice(t);
    }
}
