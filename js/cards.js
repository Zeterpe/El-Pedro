/* =============================================
   EL PEDRO — cards.js
   Dibujo de las cartas de la baraja española (SVG
   propio, al estilo clásico): oros, copas, espadas y
   bastos colocados como en la baraja de siempre,
   sota, caballo y rey, el número en las esquinas y
   las «pintas» (cortes del marco: ninguno en oros,
   uno en copas, dos en espadas y tres en bastos).
   ============================================= */
'use strict';

const CardArt = {
    // Colores de las figuras de cada palo: ropa y detalles.
    FIG: {
        oros:    ['#2f5fae', '#e2b23a'],
        copas:   ['#c8323c', '#3d8a4a'],
        espadas: ['#3d8a4a', '#c8323c'],
        bastos:  ['#c8323c', '#2f5fae'],
    },
    GAPS: { oros: 0, copas: 1, espadas: 2, bastos: 3 },

    /** Gradientes compartidos por todas las cartas (se ponen una vez en la página). */
    installDefs() {
        if (document.getElementById('card-defs')) return;
        const div = document.createElement('div');
        div.innerHTML = `<svg id="card-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
            <radialGradient id="gOro" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff4b0"/><stop offset=".55" stop-color="#eebd3a"/><stop offset="1" stop-color="#b07d10"/></radialGradient>
            <linearGradient id="gCopa" x1="0" x2="1"><stop offset="0" stop-color="#8f1d25"/><stop offset=".45" stop-color="#e0444d"/><stop offset="1" stop-color="#8f1d25"/></linearGradient>
            <linearGradient id="gHoja" x1="0" x2="1"><stop offset="0" stop-color="#6f8fb8"/><stop offset=".5" stop-color="#dfe9f7"/><stop offset="1" stop-color="#6f8fb8"/></linearGradient>
            <linearGradient id="gBasto" x1="0" x2="1"><stop offset="0" stop-color="#2f6a1f"/><stop offset=".5" stop-color="#7cc255"/><stop offset="1" stop-color="#2f6a1f"/></linearGradient>
            <linearGradient id="gPapel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf6"/><stop offset="1" stop-color="#f3ecdc"/></linearGradient>
            <pattern id="pDorso" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="16" height="16" fill="#a3202c"/><rect width="8" height="8" fill="#c23140"/><rect x="8" y="8" width="8" height="8" fill="#c23140"/>
            </pattern>
        </defs></svg>`;
        document.body.prepend(div.firstChild);
    },

    // ── Símbolos de los palos (centrados en 0,0; radio ≈ 45) ──
    symbol(suit) {
        switch (suit) {
            case 'oros': return `
                <circle r="44" fill="url(#gOro)" stroke="#7a5208" stroke-width="4"/>
                <circle r="34" fill="none" stroke="#8a6410" stroke-width="2.5"/>
                ${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<line x1="${(25 * Math.cos(a)).toFixed(1)}" y1="${(25 * Math.sin(a)).toFixed(1)}" x2="${(32 * Math.cos(a)).toFixed(1)}" y2="${(32 * Math.sin(a)).toFixed(1)}" stroke="#8a6410" stroke-width="2.5"/>`; }).join('')}
                <circle r="20" fill="#f6d466" stroke="#8a6410" stroke-width="2"/>
                <circle cx="-7" cy="-4" r="2.6" fill="#7a5208"/><circle cx="7" cy="-4" r="2.6" fill="#7a5208"/>
                <path d="M-8 7 Q0 13 8 7" stroke="#7a5208" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
            case 'copas': return `
                <path d="M-34 -38 H34 C34 -8 18 6 0 6 C-18 6 -34 -8 -34 -38 Z" fill="url(#gCopa)" stroke="#6a1018" stroke-width="3"/>
                <rect x="-37" y="-46" width="74" height="9" rx="3" fill="#eebd3a" stroke="#8a6410" stroke-width="2"/>
                <path d="M-30 -22 H30" stroke="#eebd3a" stroke-width="3"/>
                <circle cx="0" cy="-12" r="5" fill="#eebd3a" stroke="#8a6410" stroke-width="1.5"/>
                <path d="M-6 6 H6 V12 Q14 17 6 22 V30 H-6 V22 Q-14 17 -6 12 Z" fill="#eebd3a" stroke="#8a6410" stroke-width="2"/>
                <path d="M-28 46 Q0 24 28 46 Z" fill="url(#gCopa)" stroke="#6a1018" stroke-width="3"/>
                <rect x="-30" y="44" width="60" height="5" rx="2" fill="#eebd3a" stroke="#8a6410" stroke-width="1.5"/>`;
            case 'espadas': return `
                <path d="M0 -50 L7.5 -38 L7.5 22 L-7.5 22 L-7.5 -38 Z" fill="url(#gHoja)" stroke="#2c4f7f" stroke-width="2"/>
                <line x1="0" y1="-40" x2="0" y2="19" stroke="#f4f8ff" stroke-width="2"/>
                <path d="M-24 21 Q0 30 24 21 L24 28 Q0 37 -24 28 Z" fill="#eebd3a" stroke="#8a6410" stroke-width="2"/>
                <rect x="-4.5" y="31" width="9" height="13" rx="2" fill="#a3262f" stroke="#6a1018" stroke-width="1.5"/>
                <circle cx="0" cy="47.5" r="5.5" fill="#eebd3a" stroke="#8a6410" stroke-width="2"/>`;
            case 'bastos': return `
                <path d="M-8 48 C-10 22 -18 -8 -15 -28 C-12 -48 14 -51 17 -33 C21 -15 12 12 8 48 Z" fill="url(#gBasto)" stroke="#24521a" stroke-width="3"/>
                <path d="M-13 -10 L-23 -16 M14 -2 L24 -9 M-11 18 L-20 14 M10 28 L18 25" stroke="#24521a" stroke-width="6" stroke-linecap="round"/>
                <circle cx="-23" cy="-16" r="4" fill="#c23140"/><circle cx="24" cy="-9" r="4" fill="#c23140"/>
                <circle cx="-20" cy="14" r="3.5" fill="#c23140"/><circle cx="18" cy="25" r="3.5" fill="#c23140"/>
                <ellipse cx="1" cy="-34" rx="8" ry="4" fill="#9fd77a" opacity=".7"/>`;
        }
        return '';
    },

    pip(suit, x, y, scale, rot = 0) {
        return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})">${this.symbol(suit)}</g>`;
    },

    /** Dónde van los símbolos de las cartas del 1 al 9. */
    LAYOUT: {
        2: [[100, 95], [100, 205]],
        3: [[100, 80], [100, 150], [100, 220]],
        4: [[66, 95], [134, 95], [66, 205], [134, 205]],
        5: [[66, 90], [134, 90], [100, 150], [66, 210], [134, 210]],
        6: [[66, 82], [134, 82], [66, 150], [134, 150], [66, 218], [134, 218]],
        7: [[66, 78], [134, 78], [100, 114], [66, 150], [134, 150], [66, 222], [134, 222]],
        8: [[66, 74], [134, 74], [66, 125], [134, 125], [66, 176], [134, 176], [66, 227], [134, 227]],
        9: [[56, 82], [100, 82], [144, 82], [56, 150], [100, 150], [144, 150], [56, 218], [100, 218], [144, 218]],
    },

    frame(suit) {
        // Marco interior con sus cortes (las pintas), arriba y abajo.
        const gaps = this.GAPS[suit], x0 = 14, x1 = 186, y0 = 14, y1 = 286;
        const seg = y => {
            if (!gaps) return `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`;
            const parts = [], w = 14, step = (x1 - x0) / (gaps + 1);
            let x = x0;
            for (let i = 1; i <= gaps; i++) {
                const c = x0 + step * i;
                parts.push(`<line x1="${x}" y1="${y}" x2="${c - w / 2}" y2="${y}"/>`);
                x = c + w / 2;
            }
            parts.push(`<line x1="${x}" y1="${y}" x2="${x1}" y2="${y}"/>`);
            return parts.join('');
        };
        return `<g stroke="#5a5040" stroke-width="2.2" fill="none">${seg(y0)}${seg(y1)}<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}"/><line x1="${x1}" y1="${y0}" x2="${x1}" y2="${y1}"/></g>`;
    },

    index(rank, color) {
        const t = `font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="26" fill="${color}"`;
        return `<text x="22" y="42" ${t}>${rank}</text><text x="178" y="258" ${t} text-anchor="start" transform="rotate(180 178 258)">${rank}</text>`;
    },

    head(x, y, r, beard = false) {
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="#f2c9a0" stroke="#3a2a1a" stroke-width="2"/>
            <circle cx="${x - r * 0.35}" cy="${y - r * 0.1}" r="${r * 0.1}" fill="#3a2a1a"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.1}" r="${r * 0.1}" fill="#3a2a1a"/>
            ${beard ? `<path d="M${x - r * 0.85} ${y + r * 0.2} Q${x} ${y + r * 1.9} ${x + r * 0.85} ${y + r * 0.2} Q${x} ${y + r * 0.75} ${x - r * 0.85} ${y + r * 0.2} Z" fill="#e4e0d6" stroke="#9a948a" stroke-width="1.5"/>`
                : `<path d="M${x - r * 0.3} ${y + r * 0.45} Q${x} ${y + r * 0.65} ${x + r * 0.3} ${y + r * 0.45}" stroke="#7a3a2a" stroke-width="2" fill="none" stroke-linecap="round"/>`}`;
    },

    figure(rank, suit) {
        const [c1, c2] = this.FIG[suit];
        const ink = 'stroke="#2a2018" stroke-width="2"';
        if (rank === 10) {   // la sota: un paje de pie
            return `
                <rect x="84" y="200" width="13" height="56" fill="#eebd3a" ${ink}/><rect x="103" y="200" width="13" height="56" fill="#eebd3a" ${ink}/>
                <ellipse cx="89" cy="259" rx="12" ry="5" fill="#5a3a1a"/><ellipse cx="111" cy="259" rx="12" ry="5" fill="#5a3a1a"/>
                <path d="M68 122 Q100 110 132 122 L142 208 Q100 220 58 208 Z" fill="${c1}" ${ink}/>
                <path d="M100 118 L100 214" stroke="${c2}" stroke-width="6"/>
                <rect x="64" y="162" width="72" height="8" fill="#eebd3a" ${ink}/>
                <path d="M70 128 L54 178" stroke="${c1}" stroke-width="15" stroke-linecap="round"/>
                <path d="M130 128 L146 160" stroke="${c1}" stroke-width="15" stroke-linecap="round"/>
                <path d="M80 118 Q100 130 120 118" stroke="#fff" stroke-width="6" fill="none"/>
                ${this.head(100, 96, 18)}
                <path d="M80 90 Q100 66 122 90 Q118 76 100 74 Q82 76 80 90 Z" fill="#b87a2a"/>
                <path d="M76 84 Q100 56 126 84 Q100 76 76 84 Z" fill="${c2}" ${ink}/>
                <path d="M120 72 Q136 52 146 60" stroke="#fff" stroke-width="4" fill="none"/>
                ${this.pip(suit, 150, 168, 0.42, suit === 'espadas' || suit === 'bastos' ? 20 : 0)}`;
        }
        if (rank === 11) {   // el caballo: jinete a caballo
            return `
                <path d="M44 196 Q24 214 34 248" stroke="#2b1a0c" stroke-width="8" fill="none" stroke-linecap="round"/>
                <rect x="60" y="210" width="10" height="52" fill="#6a3e1c" ${ink}/><rect x="80" y="214" width="10" height="48" fill="#6a3e1c" ${ink}/>
                <rect x="118" y="214" width="10" height="48" fill="#6a3e1c" ${ink}/><rect x="138" y="210" width="10" height="52" fill="#6a3e1c" ${ink}/>
                <ellipse cx="100" cy="200" rx="56" ry="27" fill="#8a5528" ${ink}/>
                <path d="M138 192 L158 148 Q166 134 178 146 L176 166 L156 204 Z" fill="#8a5528" ${ink}/>
                <circle cx="168" cy="150" r="2.5" fill="#1a0f06"/>
                <path d="M144 186 L160 148" stroke="#2b1a0c" stroke-width="7" stroke-linecap="round"/>
                <path d="M78 176 H124 V206 H78 Z" fill="${c2}" ${ink}/>
                <rect x="95" y="186" width="12" height="40" fill="#eebd3a" ${ink}/>
                <path d="M84 122 Q100 112 116 122 L120 186 L80 186 Z" fill="${c1}" ${ink}/>
                <path d="M114 128 L134 108" stroke="${c1}" stroke-width="13" stroke-linecap="round"/>
                ${this.head(100, 104, 15)}
                <path d="M82 96 Q100 72 120 96 Q100 88 82 96 Z" fill="${c2}" ${ink}/>
                ${this.pip(suit, 140, 92, 0.38, suit === 'espadas' || suit === 'bastos' ? 25 : 0)}`;
        }
        // el rey: de pie, con corona, barba y manto
        return `
            <path d="M60 130 Q100 116 140 130 L150 262 L50 262 Z" fill="${c1}" ${ink}/>
            <path d="M60 130 Q100 152 140 130 L144 176 Q100 198 56 176 Z" fill="${c2}" ${ink}/>
            <path d="M56 176 Q100 198 144 176" stroke="#fff" stroke-width="7" fill="none"/>
            ${[64, 80, 96, 112, 128].map(x => `<circle cx="${x + 4}" cy="${184 + Math.abs(x - 100) * -0.18}" r="1.8" fill="#222"/>`).join('')}
            <path d="M100 196 L100 262" stroke="#eebd3a" stroke-width="5"/>
            <path d="M138 136 L150 170" stroke="${c2}" stroke-width="15" stroke-linecap="round"/>
            ${this.head(100, 100, 18, true)}
            <path d="M80 86 L84 64 L92 77 L100 58 L108 77 L116 64 L120 86 Z" fill="#eebd3a" stroke="#8a6410" stroke-width="2"/>
            <circle cx="100" cy="72" r="3" fill="#c23140"/><circle cx="88" cy="78" r="2.2" fill="#2f5fae"/><circle cx="112" cy="78" r="2.2" fill="#2f5fae"/>
            ${this.pip(suit, 152, 186, 0.42, suit === 'espadas' || suit === 'bastos' ? 15 : 0)}`;
    },

    _cache: new Map(),

    /** La cara de una carta, como texto SVG. */
    face(card) {
        const key = card.suit + card.rank;
        if (this._cache.has(key)) return this._cache.get(key);
        const { rank, suit } = card;
        let art;
        if (rank === 1) art = this.pip(suit, 100, 150, suit === 'oros' ? 1.45 : 1.6, suit === 'espadas' || suit === 'bastos' ? -18 : 0);
        else if (rank >= 10) art = this.figure(rank, suit);
        else {
            const tilt = suit === 'espadas' || suit === 'bastos';
            const sc = rank >= 7 ? 0.36 : rank >= 4 ? 0.42 : 0.5;
            art = this.LAYOUT[rank].map(([x, y]) => this.pip(suit, x, y, sc, tilt ? (x < 100 ? -16 : x > 100 ? 16 : 0) : 0)).join('');
        }
        const color = { oros: '#8a6410', copas: '#a3262f', espadas: '#24457f', bastos: '#2f6a1f' }[suit];
        const svg = `<svg viewBox="0 0 200 300" class="art" aria-hidden="true" focusable="false">
            <rect x="2" y="2" width="196" height="296" rx="14" fill="url(#gPapel)" stroke="#bdb39c" stroke-width="2"/>
            ${this.frame(suit)}${art}${this.index(rank, color)}</svg>`;
        this._cache.set(key, svg);
        return svg;
    },

    /** Número grande y palo, para ver la carta de lejos (modo de alto contraste). */
    badge(card) {
        const color = { oros: '#8a6410', copas: '#a3262f', espadas: '#24457f', bastos: '#2f6a1f' }[card.suit];
        return `<span class="badge" aria-hidden="true" style="--c:${color}"><b>${card.rank}</b><svg viewBox="-50 -50 100 100" focusable="false">${this.symbol(card.suit)}</svg></span>`;
    },

    /** Un abanico de cartas, para la portada y el salón. */
    fan(cards, { spread = 14 } = {}) {
        const n = cards.length, mid = (n - 1) / 2;
        return `<span class="fan" aria-hidden="true">${cards.map((c, i) => `<span class="fan-card" style="--a:${((i - mid) * spread).toFixed(1)}deg;--i:${i}">${c ? this.face(c) : this.back()}</span>`).join('')}</span>`;
    },

    /** El dorso: rojo con rombos, como el de la baraja clásica. */
    back() {
        return this._back ||= `<svg viewBox="0 0 200 300" class="art" aria-hidden="true" focusable="false">
            <rect x="2" y="2" width="196" height="296" rx="14" fill="#fffdf6" stroke="#bdb39c" stroke-width="2"/>
            <rect x="12" y="12" width="176" height="276" rx="8" fill="url(#pDorso)"/>
            <rect x="12" y="12" width="176" height="276" rx="8" fill="none" stroke="#f4e3b0" stroke-width="3"/>
            <ellipse cx="100" cy="150" rx="46" ry="62" fill="#a3202c" stroke="#f4e3b0" stroke-width="4"/>
            <ellipse cx="100" cy="150" rx="34" ry="48" fill="none" stroke="#eebd3a" stroke-width="2"/>
            <text x="100" y="162" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="700" fill="#f4e3b0">P</text>
        </svg>`;
    },
};
