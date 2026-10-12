/* =============================================
   EL PEDRO — trivial-match.js
   Una partida de Trivial en la mesa: la rueda
   dibujada con sus seis quesitos, el dado en el
   centro, las fichas que andan casilla a casilla
   y la tarjeta de la pregunta con sus cuatro
   respuestas. Todo se cuenta por voz: adónde
   puedes ir, la pregunta y sus respuestas, quién
   acierta y quién se lleva cada quesito.
   ============================================= */
'use strict';

/** Lo que dura cada momento sin voz (modo visual), en milisegundos. */
const TRIVIAL_BEAT = { roll: 350, move: 250, again: 700, answer: 1500, wedge: 1300, pick: 600 };

const TRIVIAL_PAINT = {
    geografia: { fill: '#2f7dd6', dark: '#174a8a', ink: '#ffffff', ico: '🌍' },
    espectaculos: { fill: '#e0559a', dark: '#8a2459', ink: '#ffffff', ico: '🎭' },
    historia: { fill: '#f2c12e', dark: '#8a6a00', ink: '#2e2300', ico: '📜' },
    arte: { fill: '#8d5a2b', dark: '#4a2c12', ink: '#ffffff', ico: '🎨' },
    ciencia: { fill: '#3a9f52', dark: '#1d5c2c', ink: '#ffffff', ico: '🔬' },
    deportes: { fill: '#f2862b', dark: '#8f4a0e', ink: '#2b1600', ico: '⚽' },
};
/** El color del borde de la ficha de cada jugador (el mismo que su avatar). */
const TRIVIAL_RIM = ['#3d6fb6', '#c8323c', '#3d8a4a', '#b07d10', '#7a4fb0', '#1b8c8c'];

// ═══════════════════════════════════════════════════════
// El tablero dibujado
// ═══════════════════════════════════════════════════════
//
// Una rueda centrada en (0, 0): el anillo entre los radios 8,75 y 11,15,
// con un medallón en cada quesito; seis radios hacia el centro y el
// centro con los seis colores, donde está el dado. El quesito de
// Geografía arriba y los demás en el sentido de las agujas del reloj.

const TrivialArt = {
    R_IN: 8.75, R_OUT: 11.15, R_MID: 9.95, HUB: 2.55,

    rad(deg) { return deg * Math.PI / 180; },
    /** El ángulo (en grados) de la casilla r del anillo. */
    ringDeg(r) { return -90 + r * 360 / TRIVIAL_RING; },
    spokeDeg(k) { return -90 + k * 60; },
    pt(radius, deg) { const a = this.rad(deg); return [+(radius * Math.cos(a)).toFixed(3), +(radius * Math.sin(a)).toFixed(3)]; },

    /** El centro de una casilla. */
    center(id) {
        const n = TRIVIAL_BOARD[id];
        if (n.kind === 'hub') return [0, 0];
        if (n.zone === 'ring') return this.pt(this.R_MID, this.ringDeg(n.r));
        return this.pt(this.spokeR(n.j), this.spokeDeg(n.k));
    },
    /** El radio del centro de la casilla j de un radio (1 junto al quesito, 5 junto al centro). */
    spokeR(j) { const len = (this.R_IN - this.HUB) / 5; return this.R_IN - (j - 0.5) * len; },

    sector(r0, r1, d0, d1) {
        const [a, b] = [this.pt(r1, d0), this.pt(r1, d1)], [c, d] = [this.pt(r0, d1), this.pt(r0, d0)];
        const big = d1 - d0 > 180 ? 1 : 0;
        return `M${a}A${r1} ${r1} 0 ${big} 1 ${b}L${c}A${r0} ${r0} 0 ${big} 0 ${d}Z`;
    },

    /** Un dado pequeño (casilla de volver a tirar). */
    dieIcon([x, y], s = 0.62) {
        const h = s / 2, p = s * 0.24;
        return `<g class="tb-rollico" transform="translate(${x} ${y}) rotate(12)"><rect x="${-h}" y="${-h}" width="${s}" height="${s}" rx="${s * 0.2}"/><circle cx="${-p}" cy="${-p}" r="${s * 0.09}"/><circle cx="${p}" cy="${p}" r="${s * 0.09}"/><circle cx="${p}" cy="${-p}" r="${s * 0.09}"/><circle cx="${-p}" cy="${p}" r="${s * 0.09}"/></g>`;
    },

    /** La rueda sin fichas. */
    boardSvg({ icons = true } = {}) {
        const P = TRIVIAL_PAINT, out = [];
        const half = 180 / TRIVIAL_RING;
        out.push(`<circle class="tb-disc" r="12.35"/>`);
        out.push(`<circle class="tb-inner" r="${this.R_IN}"/>`);
        // El anillo.
        for (let r = 0; r < TRIVIAL_RING; r++) {
            const n = TRIVIAL_BOARD[tvRing(r)], d = this.ringDeg(r);
            const fill = n.kind === 'roll' ? null : P[n.cat].fill;
            out.push(`<path class="tb-sq${n.kind === 'roll' ? ' roll' : ''}" d="${this.sector(this.R_IN, this.R_OUT, d - half, d + half)}"${fill ? ` style="fill:${fill}"` : ''}/>`);
            if (n.kind === 'roll') out.push(this.dieIcon(this.pt(this.R_MID, d)));
        }
        // Los radios.
        const len = (this.R_IN - this.HUB) / 5;
        for (let k = 0; k < 6; k++) {
            const deg = this.spokeDeg(k);
            for (let j = 1; j <= 5; j++) {
                const n = TRIVIAL_BOARD[tvSpoke(k, j)], [x, y] = this.pt(this.spokeR(j), deg);
                out.push(`<rect class="tb-sq" x="${-len / 2}" y="-0.74" width="${len}" height="1.48" rx="0.12" transform="translate(${x} ${y}) rotate(${deg})" style="fill:${P[n.cat].fill}"/>`);
            }
        }
        // Los quesitos: un medallón grande con su dibujo.
        for (let k = 0; k < 6; k++) {
            const cat = TRIVIAL_CATS[k], [x, y] = this.pt(this.R_MID, this.spokeDeg(k));
            out.push(`<circle class="tb-hq" cx="${x}" cy="${y}" r="1.42" style="fill:${P[cat].fill};stroke:${P[cat].dark}"/>`);
            out.push(`<circle class="tb-hq-in" cx="${x}" cy="${y}" r="1.02"/>`);
            if (icons) out.push(`<text class="tb-ico" x="${x}" y="${y + 0.38}">${P[cat].ico}</text>`);
        }
        // El centro: los seis colores.
        for (let k = 0; k < 6; k++) {
            const d = this.spokeDeg(k);
            out.push(`<path class="tb-hub" d="${this.sector(1.2, this.HUB, d - 30, d + 30)}" style="fill:${P[TRIVIAL_CATS[k]].fill}"/>`);
        }
        out.push(`<circle class="tb-hub-in" r="1.2"/>`);
        return out.join('');
    },

    /** Una ficha: un círculo con seis huecos para los quesitos. */
    pie(wedges, rim, r = 0.62) {
        const parts = [`<circle class="tk-base" r="${r}" style="stroke:${rim}"/>`];
        TRIVIAL_CATS.forEach((cat, k) => {
            const d = this.spokeDeg(k), on = wedges.includes(cat);
            parts.push(`<path class="tk-w${on ? ' on' : ''}" d="${this.sector(0, r * 0.74, d - 30, d + 30).replace(/A0 0 0 0 0 [^Z]*/, '')}"${on ? ` style="fill:${TRIVIAL_PAINT[cat].fill}"` : ''}/>`);
        });
        return parts.join('');
    },

    /** Una ficha suelta (para los sitios de la mesa). */
    pieSvg(wedges, rim, cls = 'tpie') {
        return `<svg class="${cls}" viewBox="-0.9 -0.9 1.8 1.8" aria-hidden="true" focusable="false">${this.pie(wedges, rim, 0.8)}</svg>`;
    },

    /** Una rueda pequeña para el salón y la sala. */
    tile() {
        const tokens = [[tvRing(9), ['historia', 'ciencia'], 1], [tvSpoke(4, 2), ['geografia'], 0], [tvRing(30), ['arte', 'deportes', 'espectaculos'], 2]].map(([id, w, c]) => {
            const [x, y] = this.center(id);
            return `<g transform="translate(${x} ${y}) scale(1.6)">${this.pie(w, TRIVIAL_RIM[c])}</g>`;
        }).join('');
        return `<svg class="trivial-tile" viewBox="-12.6 -12.6 25.2 25.2" aria-hidden="true" focusable="false">${this.boardSvg({ icons: false })}${tokens}</svg>`;
    },

    pips(v) {
        const a = -0.42, b = 0, c = 0.42;
        const faces = { 1: [[b, b]], 2: [[a, a], [c, c]], 3: [[a, a], [b, b], [c, c]], 4: [[a, a], [c, a], [a, c], [c, c]], 5: [[a, a], [c, a], [b, b], [a, c], [c, c]], 6: [[a, a], [c, a], [a, b], [c, b], [a, c], [c, c]] };
        return (faces[v] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.16"/>`).join('');
    },
};

// ═══════════════════════════════════════════════════════
// La partida
// ═══════════════════════════════════════════════════════

const TRIVIAL_SEEN_KEY = 'elpedro.trivial.seen';

class TrivialMatch extends Match {
    static get kind() { return 'trivial'; }
    get roundWord() { return 'partida'; }
    get beats() { return TRIVIAL_BEAT; }
    get playPhases() { return ['roll', 'move', 'pick', 'answer']; }
    actor() { return this.game.actor; }

    setup() {
        this.sel = null;               // lo que has elegido, a la espera del segundo toque
        this.promptedKey = null;
        this.cut = new Set();          // respuestas quitadas por la pista (práctica)
        this.advisor = new TrivialBot(this.game, this.me, { level: 'dificil' }, makeRng(this.seed + 4242));
        this.syncShown();
    }

    makeGame(rules, seed) {
        return new TrivialGame({ players: this.seats.map(s => ({ name: s.name })), rules, seed, seen: TrivialMatch.loadSeen() });
    }
    makeMirror(rules) { return new TrivialMirror({ names: this.seats.map(s => s.name), rules }); }
    makeBot(p, char, rng) { return new TrivialBot(this.game, p, char, rng); }
    stateKey() { const g = this.game; return `${g.phase}|${g.current}|${g.turns}`; }

    /** Las preguntas que ya te han salido (para que no se repitan de una partida a otra). */
    static loadSeen() {
        try { return JSON.parse(localStorage.getItem(TRIVIAL_SEEN_KEY) || '[]'); } catch (_) { return []; }
    }
    static markSeen(qid) {
        try {
            const list = TrivialMatch.loadSeen().filter(x => x !== qid);
            list.push(qid);
            localStorage.setItem(TRIVIAL_SEEN_KEY, JSON.stringify(list.slice(-1500)));
        } catch (_) { /* sin almacenamiento */ }
    }

    /** Lo que se ve en la mesa, al ritmo de lo que se cuenta (la partida ya va por delante). */
    syncShown() {
        const g = this.game;
        this.shown = {
            at: g.tokens.map(t => t.at),
            wedges: g.tokens.map(t => t.wedges.slice()),
            turn: g.current,
            die: g.dice,
            q: g.q ? { ...g.q, options: g.q.options.slice() } : null,
            result: null,
            pick: g.pick ? { ...g.pick } : null,
        };
    }

    // ── Ayudas ────────────────────────────────────────
    get side() { return this.game.side(this.me); }
    catName(cat) { return TRIVIAL_CAT[cat].name; }
    catShort(cat) { return TRIVIAL_CAT[cat].short; }
    rimOf(s) { return TRIVIAL_RIM[this.game.tokens[s].members[0] % 6]; }
    /** «tú», «Lucía», «tu equipo», «el equipo de Lucía». */
    sideName(s) {
        const g = this.game, members = g.tokens[s].members;
        if (!g.teamPlay) return this.v.name(members[0]);
        return members.includes(this.me) ? 'tu equipo' : `el equipo de ${Txt.list(members.map(p => this.names[p]))}`;
    }
    needed() { return this.game.rules.wedges; }
    hasAllShown(s) { return this.shown.wedges[s].length >= this.needed(); }

    /** Dónde está una casilla, para el oído. */
    placeText(id) {
        const n = TRIVIAL_BOARD[id];
        if (n.kind === 'hub') return 'en el centro';
        if (n.kind === 'hq') return `en el quesito de ${this.catShort(n.cat)}`;
        if (n.zone === 'spoke') return `en el radio de ${this.catShort(TRIVIAL_CATS[n.k])}, casilla de ${this.catShort(n.cat)}, a ${6 - n.j} del centro`;
        const a = TRIVIAL_CATS[n.k], b = TRIVIAL_CATS[(n.k + 1) % 6];
        const what = n.kind === 'roll' ? 'casilla de volver a tirar' : `casilla de ${this.catShort(n.cat)}`;
        return `en el anillo, ${what}, a ${n.pos} del quesito de ${this.catShort(a)} y a ${7 - n.pos} del de ${this.catShort(b)}`;
    }

    /** Dónde está tu ficha, en pocas palabras (para verlo). */
    placeShort(id) {
        const n = TRIVIAL_BOARD[id];
        if (n.kind === 'hub') return 'En el centro';
        if (n.kind === 'hq') return `Quesito de ${this.catShort(n.cat)}`;
        const what = n.kind === 'roll' ? 'tira otra vez' : this.catShort(n.cat);
        return n.zone === 'spoke' ? `Radio de ${this.catShort(TRIVIAL_CATS[n.k])}: ${what}` : `Anillo: ${what}`;
    }

    /** Adónde lleva una jugada: «el quesito de Historia», «Ciencia, entre el quesito de Arte y el de Ciencia», «volver a tirar». */
    destText(to, { brief = this.brief } = {}) {
        const n = TRIVIAL_BOARD[to], s = this.side;
        if (n.kind === 'hub') return this.hasAllShown(s) && this.game.rules.hubFinal ? 'el centro: la pregunta final' : 'el centro: eliges categoría';
        if (n.kind === 'hq') return `el quesito de ${this.catShort(n.cat)}${this.shown.wedges[s].includes(n.cat) ? ', que ya tienes' : ''}`;
        const what = n.kind === 'roll' ? 'volver a tirar' : this.catShort(n.cat);
        if (brief) return what;
        if (n.zone === 'spoke') return `${what}, en el radio de ${this.catShort(TRIVIAL_CATS[n.k])}`;
        const a = TRIVIAL_CATS[n.k], b = TRIVIAL_CATS[(n.k + 1) % 6];
        if (n.kind === 'roll') { const near = n.pos <= 3 ? a : b; return `${what}, a ${Math.min(n.pos, 7 - n.pos)} del quesito de ${this.catShort(near)}, hacia el de ${this.catShort(near === a ? b : a)}`; }
        return `${what}, entre el quesito de ${this.catShort(a)} y el de ${this.catShort(b)}`;
    }

    /** Las jugadas en el orden en que se dicen: la final, los quesitos que te faltan, los demás quesitos, las categorías y volver a tirar. */
    orderedOptions() {
        const g = this.game, s = g.side(g.current);
        const have = this.shown.wedges[s] || [];
        const rank = m => {
            const n = TRIVIAL_BOARD[m.to];
            if (n.kind === 'hub') return 0;
            if (n.kind === 'hq') return have.includes(n.cat) ? 2 : 1;
            return n.kind === 'cat' ? 3 : 4;
        };
        return g.options.slice().sort((a, b) => rank(a) - rank(b) || a.to - b.to);
    }

    /** El quesito que te falta más cerca de una casilla. */
    nearestMissing(s, from) {
        const missing = TRIVIAL_CATS.filter(c => !this.shown.wedges[s].includes(c));
        let best = null;
        for (const c of missing) { const d = TRIVIAL_DIST[from][trivialHq(c)]; if (!best || d < best.d) best = { cat: c, d }; }
        return best;
    }

    wedgesText(s) {
        const w = this.shown.wedges[s];
        if (!w.length) return 'ningún quesito';
        return `${w.length === 1 ? '1 quesito' : `${w.length} quesitos`}: ${Txt.list(w.map(c => this.catShort(c)))}`;
    }

    introText() {
        const g = this.game, me = this.me;
        let text;
        if (g.teamPlay) {
            const mine = g.tokenOf(me).members.filter(p => p !== me).map(p => this.names[p]);
            const others = g.tokens.find(t => !t.members.includes(me)).members.map(p => this.names[p]);
            text = `Jugáis por equipos, con una ficha por equipo: vas con ${Txt.list(mine)}, contra ${Txt.list(others)}.`;
        } else text = super.introText();
        text += this.needed() < 6 ? ` Hay que conseguir ${this.needed()} quesitos.` : '';
        if (this.practice) text = 'Partida de práctica: con la A te doy un consejo. ' + text;
        return text;
    }

    // ── La mesa ───────────────────────────────────────
    actionsDef() {
        return [
            { kind: 'roll', label: 'Tirar el dado', key: 'T', cls: 'main' },
            { kind: 'play', label: 'Confirmar', key: 'Enter', cls: 'main' },
            { kind: 'advice', label: 'Consejo', key: 'A' },
            { kind: 'question', label: 'La pregunta', key: 'P', cls: 'small talk' },
            { kind: 'board', label: 'Dónde estáis', key: 'M', cls: 'small talk' },
            { kind: 'info', label: 'Cómo va', key: 'I', cls: 'small talk' },
            { kind: 'cards', label: 'Mis quesitos', key: 'C', cls: 'small talk' },
            { kind: 'repeat', label: 'Repetir', key: 'Espacio', cls: 'small talk' },
            { kind: 'menu', label: 'Pausa', key: 'Esc', cls: 'small' },
        ];
    }

    button(kind) {
        if (kind === 'board') return this.describeBoard();
        if (kind === 'question') return this.readQuestion();
        if (kind === 'advice' && !this.want?.kinds.has('advice')) return this.advise();
        return super.button(kind);
    }

    buildCenter(center) {
        center.innerHTML = `
            <div class="tboard-wrap">
                <svg id="tboard" class="tboard" viewBox="-12.6 -12.6 25.2 25.2" aria-hidden="true" focusable="false">
                    ${TrivialArt.boardSvg()}
                    <g id="tb-marks"></g>
                    <g id="tb-tokens"></g>
                    <g id="t-die" class="die"><g class="die-in"><rect x="-0.78" y="-0.78" width="1.56" height="1.56" rx="0.3"/><g class="pips"></g></g></g>
                </svg>
                <div id="tq" class="tq" hidden>
                    <div class="tq-card">
                        <div class="tq-head"><span class="tq-ico" aria-hidden="true"></span><span class="tq-cat"></span><span class="tq-kind"></span></div>
                        <p class="tq-text"></p>
                        <div class="tq-answers" role="group"></div>
                        <p class="tq-foot"></p>
                    </div>
                </div>
            </div>
            <div class="tlegend" aria-hidden="true">${TRIVIAL_CATS.map(c => `<span class="tleg" style="--cc:${TRIVIAL_PAINT[c].fill}"><i></i>${this.catShort(c)}</span>`).join('')}</div>`;
        const svg = $('tboard');
        svg.addEventListener('click', e => {
            const mk = e.target.closest?.('.tmark');
            if (mk) { this.tapOption(+mk.dataset.i); return; }
            if (e.target.closest?.('#t-die')) { this.dieClick(); return; }
            const tk = e.target.closest?.('.tk');
            if (tk) this.describeSide(+tk.dataset.s);
        });
        const box = $('tb-tokens');
        this.game.tokens.forEach((_, s) => {
            const el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            el.setAttribute('class', `tk${this.game.tokens[s].members.includes(this.me) ? ' mine' : ''}`);
            el.dataset.s = s;
            box.appendChild(el);
        });
        for (let p = 0; p < this.game.n; p++) {
            const hand = Board.handEl(p);
            if (p !== this.me) hand?.setAttribute('aria-label', `Quesitos de ${this.names[p]}`);
        }
        $('my-hand').setAttribute('aria-label', 'Tus opciones');
        delete $('my-hand').dataset.k;
    }

    /** Dónde se dibuja cada ficha (si hay varias en la misma casilla, se apartan un poco). */
    tokenPoint(s) {
        const S = this.shown, at = S.at[s];
        const same = S.at.map((a, i) => a === at ? i : -1).filter(i => i >= 0);
        const [x, y] = TrivialArt.center(at);
        if (at === TRIVIAL_HUB) {
            const k = same.indexOf(s), deg = -90 + 30 + k * (360 / Math.max(same.length, 2));
            return TrivialArt.pt(1.85, deg).map((v, i) => v + [x, y][i]);
        }
        if (same.length < 2) return [x, y];
        const k = same.indexOf(s), deg = -90 + k * 360 / same.length;
        const d = TrivialArt.pt(0.5, deg);
        return [x + d[0], y + d[1]];
    }

    renderTokens() {
        const S = this.shown, g = this.game;
        const many = S.at.length > 3;
        for (const el of $('tb-tokens').children) {
            const s = +el.dataset.s;
            const key = S.wedges[s].join(',');
            if (el.dataset.k !== key) { el.dataset.k = key; el.innerHTML = TrivialArt.pie(S.wedges[s], this.rimOf(s)); }
            const [x, y] = this.tokenPoint(s);
            const same = S.at.filter(a => a === S.at[s]).length;
            const scale = S.at[s] === TRIVIAL_HUB ? 0.95 : same > 1 ? (many ? 0.7 : 0.8) : 1.12;
            el.style.transform = `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px) scale(${scale})`;
            el.classList.toggle('turn', g.phase !== 'gameOver' && g.side(S.turn) === s);
        }
        // Adónde puedes ir: una marca con su número en cada casilla.
        const marks = $('tb-marks');
        const choosing = this.choosing('move');
        const opts = choosing ? this.orderedOptions() : [];
        const k = opts.map(m => m.to).join(',') + '|' + (choosing ? this.sel : '');
        if (marks.dataset.k !== k) {
            marks.dataset.k = k;
            marks.innerHTML = opts.map((m, i) => {
                const [x, y] = TrivialArt.center(m.to);
                return `<g class="tmark${this.sel === i ? ' sel' : ''}" data-i="${i}" transform="translate(${x} ${y})"><circle r="0.78"/><text y="0.27">${i + 1}</text></g>`;
            }).join('');
        }
        const die = $('t-die');
        if (!this.rolling) {
            const face = String(S.die || '');
            if (die.dataset.face !== face) { die.dataset.face = face; die.querySelector('.pips').innerHTML = TrivialArt.pips(S.die); }
        }
        const want = this.want?.kinds;
        die.classList.toggle('ready', !!want?.has('roll'));
        die.classList.toggle('blank', !S.die && !this.rolling);
    }

    /** ¿Te toca elegir algo ahora (fase phase)? */
    choosing(phase) {
        const g = this.game, want = this.want?.kinds;
        return !!want?.has('slot') && g.phase === phase && g.actor === this.me;
    }

    render() {
        const g = this.game, me = this.me, S = this.shown;
        for (let p = 0; p < g.n; p++) {
            const seat = Board.seatEl(p);
            if (!seat) continue;
            const s = g.side(p);
            seat.classList.toggle('active', g.phase !== 'gameOver' && S.turn === p);
            seat.classList.toggle('winner', !!g.winners?.includes(p));
            if (g.teamPlay) { seat.classList.toggle('team-a', g.team(p) === g.team(me)); seat.classList.toggle('team-b', g.team(p) !== g.team(me)); }
            Board.setWins(p, 0);
            Board.setScore(p, p === me ? `${S.wedges[s].length} de ${this.needed()}` : '');
            if (p === me) continue;
            const hand = Board.handEl(p);
            const key = `${S.wedges[s].join(',')}|${S.at[s]}|${this.needed()}`;
            if (hand.dataset.k !== key) {
                hand.dataset.k = key;
                hand.innerHTML = `${TrivialArt.pieSvg(S.wedges[s], this.rimOf(s))}<span class="tcount" aria-hidden="true">${S.wedges[s].length} de ${this.needed()}</span><span class="sr-only">${cap(this.names[p])}: ${this.wedgesText(s)}. Está ${this.placeText(S.at[s])}.</span>`;
            }
        }
        // Tu ficha y tus quesitos.
        const extra = $('my-extra');
        const ek = `${S.wedges[this.side].join(',')}|${S.at[this.side]}`;
        if (extra.dataset.k !== ek) {
            extra.dataset.k = ek;
            extra.innerHTML = `${TrivialArt.pieSvg(S.wedges[this.side], this.rimOf(this.side), 'tpie big')}<span class="tme-where" aria-hidden="true"></span>`;
            extra.querySelector('.tme-where').textContent = this.placeShort(S.at[this.side]);
        }
        this.renderChoices();
        this.renderQuestion();
        this.renderTokens();
        const want = this.want?.kinds;
        Board.showAct('roll', !!want?.has('roll'));
        Board.showAct('play', !!want?.has('play') && this.sel != null && this.settings.confirmPlay, g.phase === 'answer' ? 'Responder' : g.phase === 'pick' ? 'Elegir' : 'Ir allí');
        Board.showAct('advice', this.practice && !!want);
        Board.showAct('question', !!S.q);
    }

    /** Tus botones de abajo: adónde ir. */
    renderChoices() {
        const hand = $('my-hand');
        const opts = this.choosing('move') ? this.orderedOptions() : [];
        const key = opts.map(m => m.to).join(',');
        if (hand.dataset.k !== key) {
            hand.dataset.k = key;
            hand.innerHTML = '';
            for (const k of Object.keys(Board.els)) if (k.startsWith(this.me + ':')) delete Board.els[k];
            opts.forEach((m, i) => {
                const n = TRIVIAL_BOARD[m.to];
                const b = document.createElement('button');
                b.className = 'slot nav tdest';
                b.dataset.p = this.me; b.dataset.s = i;
                const cat = n.cat;
                if (cat) b.style.setProperty('--cc', TRIVIAL_PAINT[cat].fill), b.style.setProperty('--ci', TRIVIAL_PAINT[cat].ink);
                b.dataset.kind = n.kind;
                b.innerHTML = `<span class="tdest-n" aria-hidden="true">${i + 1}</span><span class="tdest-t" aria-hidden="true"></span>`;
                b.querySelector('.tdest-t').textContent = n.kind === 'hub' ? 'Centro' : n.kind === 'roll' ? 'Tira otra vez' : n.kind === 'hq' ? `Quesito ${this.catShort(cat)}` : this.catShort(cat);
                b.addEventListener('click', () => this.tapOption(i));
                hand.appendChild(b);
                Board.els[this.me + ':' + i] = b;
            });
        }
        [...hand.children].forEach((b, i) => {
            const m = opts[i];
            if (!m) return;
            b.classList.toggle('chosen', this.sel === i);
            b.setAttribute('aria-label', `${i + 1}: ${this.destText(m.to, { brief: false })}${this.sel === i ? '. Elegida: pulsa otra vez para ir' : ''}`);
        });
    }

    /** La tarjeta de la pregunta (o de elegir categoría), encima del tablero. */
    renderQuestion() {
        const g = this.game, S = this.shown, box = $('tq');
        if (!box) return;
        const pick = S.pick, q = S.q;
        if (!q && !pick) { box.hidden = true; box.dataset.k = ''; return; }
        box.hidden = false;
        const card = box.querySelector('.tq-card'), list = box.querySelector('.tq-answers');
        const iPick = !!pick && pick.by === this.me && g.phase === 'pick';
        const mineQ = !!q && q.p === this.me;
        const key = q ? `q|${q.qid}|${q.p}` : `p|${pick.by}|${pick.for}|${pick.final}|${iPick}`;
        if (box.dataset.k !== key) {
            box.dataset.k = key;
            const cat = q ? q.cat : null;
            card.dataset.cat = cat || '';
            card.style.setProperty('--cc', cat ? TRIVIAL_PAINT[cat].fill : '#5a3418');
            card.style.setProperty('--ci', cat ? TRIVIAL_PAINT[cat].ink : '#fff');
            box.querySelector('.tq-ico').textContent = cat ? TRIVIAL_PAINT[cat].ico : '❓';
            list.innerHTML = '';
            if (q) {
                box.querySelector('.tq-cat').textContent = this.catName(cat);
                box.querySelector('.tq-kind').textContent = q.kind === 'final' ? 'Pregunta final' : q.wedge ? 'Por el quesito' : '';
                box.querySelector('.tq-text').textContent = q.text;
                list.setAttribute('aria-label', 'Respuestas');
                q.options.forEach((o, i) => {
                    const b = document.createElement('button');
                    b.className = 'nav tans';
                    b.dataset.i = i;
                    b.innerHTML = `<span class="tans-n" aria-hidden="true">${i + 1}</span><span class="tans-t"></span>`;
                    b.querySelector('.tans-t').textContent = o;
                    b.addEventListener('click', () => this.tapOption(i));
                    list.appendChild(b);
                });
            } else {
                const forWho = pick.for === this.me ? 'tu' : `la de ${this.names[pick.for]}`;
                box.querySelector('.tq-cat').textContent = pick.final ? 'Pregunta final' : 'En el centro';
                box.querySelector('.tq-kind').textContent = '';
                box.querySelector('.tq-text').textContent = iPick
                    ? (pick.final ? (pick.for === this.me ? 'Elige la categoría de tu pregunta final' : `Elige la categoría de la pregunta final de ${this.names[pick.for]}`) : 'Elige la categoría de tu pregunta')
                    : `${cap(this.names[pick.by])} elige la categoría de ${pick.final ? `${forWho} pregunta final` : 'su pregunta'}…`;
                list.setAttribute('aria-label', 'Categorías');
                if (iPick) TRIVIAL_CATS.forEach((c, i) => {
                    const b = document.createElement('button');
                    b.className = 'nav tans tcat';
                    b.dataset.i = i;
                    b.style.setProperty('--cc', TRIVIAL_PAINT[c].fill); b.style.setProperty('--ci', TRIVIAL_PAINT[c].ink);
                    b.innerHTML = `<span class="tans-n" aria-hidden="true">${i + 1}</span><span class="tans-t"></span><span class="tcat-ico" aria-hidden="true">${TRIVIAL_PAINT[c].ico}</span>`;
                    b.querySelector('.tans-t').textContent = this.catName(c);
                    b.addEventListener('click', () => this.tapOption(i));
                    list.appendChild(b);
                });
            }
        }
        // Lo que ha contestado cada uno y la correcta.
        const R = S.result;
        const answering = q && this.choosing('answer');
        [...list.children].forEach((b, i) => {
            const isQ = !!q;
            b.classList.toggle('chosen', (answering || iPick) && this.sel === i);
            b.classList.toggle('cut', isQ && this.cut.has(i) && !R);
            b.classList.toggle('right', isQ && !!R && R.correct === i);
            b.classList.toggle('wrong', isQ && !!R && R.choice === i && !R.ok);
            b.disabled = isQ ? !answering : !iPick;
            const label = isQ ? `${i + 1}: ${q.options[i]}` : `${i + 1}: ${this.catName(TRIVIAL_CATS[i])}`;
            b.setAttribute('aria-label', label + ((answering || iPick) && this.sel === i ? `. Elegida: pulsa otra vez para ${isQ ? 'responder' : 'elegirla'}` : ''));
        });
        const foot = box.querySelector('.tq-foot');
        foot.textContent = R ? (R.ok ? '¡Correcto!' : `La correcta era: ${q.options[R.correct]}`) : q ? (mineQ ? (this.visual ? 'Toca tu respuesta' : 'Elige con el 1, 2, 3 o 4') : `Contesta ${this.names[q.p]}`) : '';
        card.classList.toggle('ok', !!R?.ok);
        card.classList.toggle('ko', !!R && !R.ok);
        // Si te toca contestar y el foco se ha perdido, va a la primera respuesta (sin leerla).
        const f = document.activeElement;
        if ((answering || iPick) && UI.current === 'game' && !Dialog.active && (!f || f === document.body || !document.contains(f) || f.disabled || f.hidden)) UI.focus(list.querySelector('.tans:not(:disabled)'), { silent: true });
    }

    // ── Animaciones ───────────────────────────────────
    async walk(s, path) {
        const S = this.shown, A = this.audio;
        const ms = Board.still ? 0 : 120;
        for (let k = 0; k < path.length; k++) {
            if (this.stopped) return;
            S.at[s] = path[k];
            this.renderTokens();
            A.step(Math.max(-0.9, Math.min(0.9, TrivialArt.center(path[k])[0] / 12)), k);
            if (ms && k < path.length - 1) await this.sleep(ms);
        }
        if (ms) await this.sleep(160);
    }

    async rollAnim(value) {
        const die = $('t-die');
        this.rolling = true;
        die.classList.add('rolling');
        die.classList.remove('blank');
        if (!Board.still) {
            for (let k = 0; k < 6; k++) {
                die.querySelector('.pips').innerHTML = TrivialArt.pips(1 + Math.floor(Math.random() * 6));
                await this.sleep(70);
            }
        }
        this.rolling = false;
        die.classList.remove('rolling');
        this.shown.die = value;
        die.dataset.face = '';
        this.renderTokens();
    }

    flashAt(id) {
        if (Board.still) return;
        const [x, y] = TrivialArt.center(id);
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('class', 'tb-flash');
        c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', '1.3');
        $('tb-marks').appendChild(c);
        setTimeout(() => c.remove(), 1000);
    }

    /** La pregunta para leerla: categoría, texto y las cuatro respuestas. */
    questionSpeech(q, { head = true } = {}) {
        const kind = q.kind === 'final' ? 'Pregunta final, de ' : q.wedge ? 'Por el quesito de ' : '';
        const who = q.p === this.me ? '' : `Para ${this.names[q.p]}. `;
        const opts = q.options.map((o, i) => `${i + 1}, ${o}.`).join(' ');
        return `${head ? `${who}${kind ? kind + this.catName(q.cat) : this.catName(q.cat)}. ` : ''}${q.text} ${opts}`;
    }

    // ── Lo que pasa, contado y animado ────────────────
    async present(e) {
        const g = this.game, me = this.me, v = this.v, A = this.audio, B = Board, S = this.shown;
        switch (e.t) {
            case 'round': {
                this.syncShown();
                S.turn = e.first;
                S.die = null;
                B.render(this);
                A.dice(0);
                const first = e.first === me ? 'Empiezas tú' : `Empieza ${this.names[e.first]}`;
                B.banner('Trivial', first);
                B.status(first);
                await this.say(`${first}. Todas las fichas salen del centro.${this.hint('start', 'Tira el dado con la T, o tocando el dado.')}`, { keep: true });
                break;
            }
            case 'turn': {
                S.turn = e.p;
                S.pick = null;
                this.sel = null;
                this.cut = new Set();
                if (!e.again) S.die = null;
                B.render(this);
                if (e.p === me) {
                    A.yourTurn();
                    const t = e.why === 'square' ? 'Tira otra vez' : e.why === 'right' ? 'Aciertas: vuelves a tirar' : 'Tu turno: tira el dado';
                    this.prompt(t, `${e.why === 'right' ? 'Vuelves a tirar.' : t + '.'}${this.hint('roll', 'Pulsa la T, o toca el dado.')}`);
                } else {
                    A.otherTurn(e.p);
                    B.status(e.again ? `${cap(this.names[e.p])} vuelve a tirar` : `Turno de ${this.names[e.p]}`);
                    if (!e.again && (this.seats[e.p].kind === 'remote' || g.teamPlay) && !this.brief) await this.say(`Turno de ${v.name(e.p)}${g.teamPlay && g.team(e.p) === g.team(me) ? ', de tu equipo' : ''}.`);
                }
                break;
            }
            case 'roll': {
                A.dice(0);
                await this.rollAnim(e.value);
                if (e.p === me) {
                    B.status(`Sacas un ${e.value}`);
                    await this.say(`Sacas un ${e.value}.`, { keep: true });
                } else {
                    B.bubble(e.p, `Saca un ${e.value}`);
                    await this.say(this.brief ? `${v.Name(e.p)}: ${e.value}.` : `${v.Name(e.p)} saca un ${e.value}.`);
                }
                await this.beat('roll');
                break;
            }
            case 'move': {
                const n = TRIVIAL_BOARD[e.to];
                const mine = e.p === me;
                const where = n.kind === 'hub' ? 'al centro' : n.kind === 'hq' ? `al quesito de ${this.catShort(n.cat)}` : n.kind === 'roll' ? 'a una casilla de volver a tirar' : `a ${this.catShort(n.cat)}`;
                const text = mine ? `Vas ${where}.` : `${v.Name(e.p)} va ${where}.`;
                if (!mine) B.bubble(e.p, n.kind === 'hub' ? 'Al centro' : n.kind === 'hq' ? `Quesito de ${this.catShort(n.cat)}` : n.kind === 'roll' ? 'Tira otra vez' : this.catShort(n.cat));
                this.sel = null;
                B.render(this);
                const talk = this.say(text, { keep: mine });
                await this.walk(e.side, e.path);
                this.flashAt(e.to);
                if (n.kind === 'roll') A.out(0);
                B.render(this);
                await talk;
                await this.beat(n.kind === 'roll' ? 'again' : 'move');
                break;
            }
            case 'pickCat': {
                S.pick = { by: e.by, for: e.p, final: e.final };
                B.render(this);
                if (e.final) {
                    A.call(0);
                    B.banner('¡Pregunta final!', e.p === me ? 'Si aciertas, ganas' : `Para ${this.names[e.p]}`);
                }
                let t;
                if (e.by === me) {
                    t = e.final ? (e.p === me ? 'Elige la categoría de tu pregunta final' : `Pregunta final de ${this.names[e.p]}: elige tú la categoría`) : 'Estás en el centro: elige la categoría de tu pregunta';
                    const list = TRIVIAL_CATS.map((c, i) => `${i + 1}, ${this.catName(c)}`).join('. ');
                    this.prompt(t, `${t}. ${list}.`);
                    break;
                }
                if (e.final && e.p === me) t = `¡Tienes todos los quesitos y estás en el centro! Pregunta final: ${this.names[e.by]} elige la categoría.`;
                else if (e.final) t = `¡${v.Name(e.p)} llega al centro con todos los quesitos! Pregunta final: ${e.by === e.p ? 'elige la categoría' : `elige la categoría ${v.name(e.by)}`}.`;
                else t = `${v.Name(e.p)} está en el centro y elige categoría.`;
                B.status(t.replace(/[¡!]/g, ''));
                await this.say(t, { keep: true });
                await this.beat('pick');
                break;
            }
            case 'catPicked': {
                S.pick = null;
                if (e.p !== me) {
                    B.bubble(e.p, this.catShort(e.cat));
                    if (e.final && e.for === me) await this.say(`${v.Name(e.p)} te pone ${this.catName(e.cat)}.`);
                }
                break;
            }
            case 'question': {
                S.q = { ...e, options: e.options.slice() };
                S.result = null;
                S.pick = null;
                this.sel = null;
                this.cut = new Set();
                if (this.mode !== 'client') TrivialMatch.markSeen(e.qid);
                A.question(TRIVIAL_CATS.indexOf(e.cat));
                B.render(this);
                const text = this.questionSpeech(e);
                B.status(e.p === me ? `Pregunta de ${this.catName(e.cat)}` : `Pregunta para ${this.names[e.p]}`);
                if (e.p === me) {
                    // Puedes contestar sin esperar a que acabe de leerla.
                    if (!this.visual) this.say(text + this.hint('answer', 'Contesta con el 1, 2, 3 o 4.'), { keep: true });
                    else this.speech.last = text;
                } else await this.say(text, { keep: true });
                break;
            }
            case 'answer': {
                const q = S.q || { options: [], p: e.p };
                S.result = { choice: e.choice, correct: e.correct, ok: e.ok };
                this.sel = null;
                B.render(this);
                if (e.ok) A.right(); else A.wrong();
                const pick = q.options[e.choice];
                let text;
                if (e.p === me) {
                    if (e.ok) { text = '¡Correcto!'; B.banner('¡Correcto!', ''); }
                    else text = `No. La correcta es: ${e.answerText}.`;
                    this.app.recordAnswer?.(this.kind, e.ok);
                } else {
                    const said = this.brief ? '' : `${v.Name(e.p)} responde ${pick}. `;
                    text = e.ok ? `${said}¡Correcto!` : `${said}${this.brief ? `${v.Name(e.p)} falla. ` : 'Falla. '}Era: ${e.answerText}.`;
                    B.bubble(e.p, e.ok ? '¡Acierta!' : 'Falla', 2000);
                }
                B.status(text.replace(/[¡!]/g, ''));
                await this.say(text, { keep: true });
                if (e.p !== me) await this.quip(e.p, e.ok ? 'right' : 'wrong', e.ok ? 0.2 : 0.3);
                await this.beat('answer');
                if (this.visual) await this.sleep(400);
                S.q = null;
                S.result = null;
                B.render(this);
                break;
            }
            case 'wedge': {
                S.wedges[e.side] = S.wedges[e.side].includes(e.cat) ? S.wedges[e.side] : [...S.wedges[e.side], e.cat];
                B.render(this);
                A.wedge();
                const tk = $('tb-tokens')?.querySelector(`.tk[data-s="${e.side}"]`);
                if (tk) B.burst(tk);
                const need = this.needed(), rest = need - e.count;
                const mine = g.side(me) === e.side;
                let text;
                if (e.p === me) text = `¡Te llevas el quesito de ${this.catName(e.cat)}!`;
                else if (mine) text = `¡${v.Name(e.p)} se lleva el quesito de ${this.catName(e.cat)} para tu equipo!`;
                else text = `¡${v.Name(e.p)} se lleva el quesito de ${this.catName(e.cat)}!`;
                if (e.all && g.rules.hubFinal) text += mine ? ' ¡Ya tenéis todos! Ahora, al centro para la pregunta final.'.replace('tenéis', g.teamPlay ? 'tenéis' : 'tienes') : ' Ya los tiene todos: va a por la pregunta final.';
                else if (!e.all) text += mine ? ` ${g.teamPlay ? 'Lleváis' : 'Llevas'} ${e.count} de ${need}.` : ` Lleva ${e.count}.`;
                if (mine) B.banner('¡Quesito!', this.catName(e.cat));
                B.bubble(e.p, `¡Quesito de ${this.catShort(e.cat)}!`, 2200);
                B.status(text.replace(/[¡!]/g, ''));
                await this.say(text, { keep: true });
                if (e.p !== me) await this.quip(e.p, 'wedge', 0.5);
                if (rest === 1 && !mine && !this.brief) await this.say(`Ojo: a ${this.sideName(e.side)} solo le falta uno.`);
                await this.beat('wedge');
                break;
            }
            case 'gameOver': {
                S.q = null; S.pick = null;
                B.render(this);
                if (e.winners.includes(me)) B.confetti();
                else if (e.winners.length) await this.quip(e.winners.find(p => this.bots[p]), 'win', 0.7);
                break;
            }
        }
    }

    resultText() {
        const g = this.game;
        return 'Quesitos: ' + g.tokens.map((_, s) => `${cap(this.sideName(s))} ${this.shown.wedges[s].length}`).join(' · ');
    }

    gameOverText(won) {
        const g = this.game, ws = g.winners || [];
        if (!ws.length) return super.gameOverText(won);
        if (won) return g.teamPlay ? '¡Habéis ganado el Trivial!' : '¡Has ganado el Trivial!';
        return `${ws.length > 1 ? 'Ganan' : 'Gana'} el Trivial ${Txt.list(ws.map(p => this.v.name(p)))}.`;
    }

    // ── Lo que se pregunta con las teclas ─────────────
    describeSide(s) {
        if (this.visual) return;
        const g = this.game;
        const who = g.teamPlay ? cap(this.sideName(s)) : cap(this.v.name(g.tokens[s].members[0]));
        this.speech.say(`${who}: ${this.wedgesText(s)}. ${s === this.side ? 'Estás' : 'Está'} ${this.placeText(this.shown.at[s])}.`, { interrupt: true });
    }

    describeBoard() {
        if (this.visual) return;
        const g = this.game, me = this.side;
        const order = g.tokens.map((_, s) => s).sort((a, b) => (a === me ? -1 : b === me ? 1 : a - b));
        const parts = order.map(s => {
            const who = s === me ? (g.teamPlay ? 'Tu equipo' : 'Tú') : cap(this.sideName(s));
            return `${who}, ${s === me ? (g.teamPlay ? 'estáis' : 'estás') : 'está'} ${this.placeText(this.shown.at[s])}, con ${this.wedgesText(s)}.`;
        });
        const near = this.nearestMissing(me, this.shown.at[me]);
        if (near && !(this.hasAllShown(me))) parts.push(`El quesito que te falta más cerca es el de ${this.catShort(near.cat)}, a ${near.d}.`);
        else if (this.hasAllShown(me) && g.rules.hubFinal) parts.push(`Te quedan ${TRIVIAL_DIST[this.shown.at[me]][TRIVIAL_HUB]} casillas hasta el centro.`);
        this.speech.say(parts.join(' '), { interrupt: true });
    }

    info() {
        if (this.visual) return;
        const g = this.game, v = this.v, S = this.shown;
        const parts = [];
        if (g.phase === 'gameOver') parts.push('La partida ha terminado.');
        else parts.push(S.turn === this.me ? 'Es tu turno.' : `Es el turno de ${v.name(S.turn)}.`);
        if (S.die) parts.push(`Último dado: ${S.die}.`);
        parts.push(`Para ganar hacen falta ${this.needed()} quesitos${g.rules.hubFinal ? ' y acertar la pregunta final en el centro' : ''}.`);
        parts.push('Quesitos: ' + Txt.list(g.tokens.map((_, s) => `${this.sideName(s)} ${S.wedges[s].length}`)) + '.');
        const t = g.tokens[this.side];
        if (t.right + t.wrong) parts.push(`${g.teamPlay ? 'Lleváis' : 'Llevas'} ${t.right} ${t.right === 1 ? 'acierto' : 'aciertos'} y ${t.wrong} ${t.wrong === 1 ? 'fallo' : 'fallos'}.`);
        this.speech.say(parts.join(' '), { interrupt: true });
    }

    myCards() {
        if (this.visual) return;
        const s = this.side;
        const missing = TRIVIAL_CATS.filter(c => !this.shown.wedges[s].includes(c));
        const have = this.shown.wedges[s];
        const head = have.length ? `${this.game.teamPlay ? 'Tenéis' : 'Tienes'} ${this.wedgesText(s)}.` : `${this.game.teamPlay ? 'No tenéis' : 'No tienes'} ningún quesito.`;
        const rest = this.hasAllShown(s) ? (this.game.rules.hubFinal ? ' Ya los tienes: ve al centro.' : '') : ` Te faltan: ${Txt.list(missing.map(c => this.catShort(c)))}.`;
        this.speech.say(`${head}${rest} ${cap(this.placeText(this.shown.at[s]))}.`, { interrupt: true });
    }

    readQuestion() {
        if (this.visual) return;
        const q = this.shown.q;
        if (!q) { this.notice('Ahora no hay ninguna pregunta.'); return; }
        this.speech.say(this.questionSpeech(q), { interrupt: true, keep: true });
    }

    keysHelp() {
        const t = [
            'T: tirar el dado.',
            `Del 1 al 9: adónde vas, la categoría o la respuesta. ${this.settings.confirmPlay ? 'La primera vez te dice cuál es y la segunda la elige. Enter elige la marcada.' : 'Al pulsarla, la eliges.'}`,
            'Flechas: moverte por las opciones.',
            'P: repetir la pregunta y sus respuestas. M: dónde está cada ficha y el quesito que te falta más cerca. C: tus quesitos. D: el último dado.',
            this.practice ? 'A: un consejo.' : '',
            'I: cómo va la partida. Espacio: repetir lo último. Escape: pausa.',
        ].filter(Boolean);
        this.speech.say(t.join(' '), { interrupt: true });
    }

    /** Un consejo: adónde iría un buen jugador o, en una pregunta, quita dos respuestas falsas. */
    advise() {
        const g = this.game, me = this.me;
        if (g.actor !== me || !this.playPhases.includes(g.phase)) { this.notice('El consejo te lo doy cuando te toque.'); return; }
        let text;
        if (g.phase === 'roll') text = 'Tira el dado, con la T.';
        else if (g.phase === 'move') {
            const to = this.advisor.chooseMove(g.options);
            this.sel = this.orderedOptions().findIndex(m => m.to === to);
            text = `Te aconsejo ir a ${this.destText(to)}.`;
        } else if (g.phase === 'pick') {
            const cat = this.advisor.favorite || g.pick.for !== me ? this.advisor.chooseCat() : this.advisor.chooseCat();
            text = `Te aconsejo ${this.catName(cat)}.`;
        } else if (g.answerIdx != null) {
            if (!this.cut.size) {
                const wrong = [0, 1, 2, 3].filter(i => i !== g.answerIdx);
                this.advisor.rng.shuffle(wrong);
                this.cut = new Set(wrong.slice(0, 2));
            }
            const left = [0, 1, 2, 3].filter(i => !this.cut.has(i));
            text = `Pista: es la ${left[0] + 1} o la ${left[1] + 1}.`;
        } else text = 'Piensa bien la respuesta.';
        Board.render(this);
        this.audio.peek(0);
        Board.status(text);
        if (!this.visual) this.speech.say(text, { interrupt: true });
    }

    // ═══ El jugador ════════════════════════════════════
    /** Tocar una opción (o pulsar su número): adónde ir, la categoría o la respuesta. */
    tapOption(i) {
        if (this.stopped) return;
        if (this.input('slot', { slot: i })) return;
        const g = this.game;
        if (g.phase === 'answer' && this.shown.q && g.current !== this.me) { this.notice(`Contesta ${this.names[g.current]}.`); return; }
        this.explainCant('slot');
    }

    dieClick() {
        if (this.input('roll')) return;
        if (!this.visual) this.speech.say(this.shown.die ? `El dado: ${this.shown.die}.` : 'Todavía no se ha tirado el dado.', { interrupt: true });
    }

    /** Espera a que elijas una de count opciones (con el doble toque si está activado). Devuelve el índice o null. */
    async choose(count, describe, kinds = ['slot', 'play']) {
        if (this.practice) kinds = [...kinds, 'advice'];
        if (this.sel != null && this.sel >= count) this.sel = null;
        const a = await this.wait(kinds);
        if (!a || a.kind === 'interrupt' || this.stopped) return null;
        if (a.kind === 'advice') { this.advise(); return null; }
        const i = a.kind === 'play' ? this.sel : a.slot;
        if (i == null) { this.audio.error(); this.prompt('Primero elige una opción', 'Primero elige una opción, con su número o tocándola.', { interrupt: true }); return null; }
        if (i < 0 || i >= count) { this.audio.error(); this.notice(`Elige del 1 al ${count}.`); return null; }
        if (this.settings.confirmPlay && a.kind === 'slot' && this.sel !== i) {
            this.sel = i;
            this.audio.select();
            Board.render(this);
            const t = describe(i);
            Board.status(`${t}. Toca otra vez para confirmar`);
            if (!this.visual) this.speech.say(`${t}.${this.hint('confirm', 'Pulsa otra vez para confirmar.')}`, { interrupt: true });
            return null;
        }
        this.sel = null;
        return i;
    }

    async humanStep() {
        const g = this.game, me = this.me;
        if (g.actor !== me || !this.playPhases.includes(g.phase)) return;
        const key = this.stateKey();
        if (g.phase === 'roll') {
            const kinds = ['roll', 'slot'];
            if (this.practice) kinds.push('advice');
            const a = await this.wait(kinds);
            if (!a || a.kind === 'interrupt' || this.stopped) return;
            if (a.kind === 'advice') { this.advise(); return; }
            if (a.kind === 'slot') { this.want = null; this.notice('Primero tira el dado, con la T.'); return; }
            await this.act({ type: 'roll', p: me });
            return;
        }
        if (g.phase === 'move') {
            const opts = this.orderedOptions();
            if (opts.length === 1) {
                const t = `Solo puedes ir a ${this.destText(opts[0].to)}`;
                Board.status(t);
                if (!this.visual && !this.brief) await this.say(t + '.');
                await this.sleep(this.visual ? 650 : 200);
                if (this.stopped || this.stateKey() !== key) return;
                await this.act({ type: 'move', p: me, to: opts[0].to });
                return;
            }
            if (this.promptedKey !== key) {
                this.promptedKey = key;
                const list = opts.map((m, i) => `${i + 1}, ${this.destText(m.to)}`).join('. ');
                this.prompt(`Sacas un ${g.dice}: elige adónde vas`, `Elige adónde vas: ${list}.${this.hint('pick', 'Pulsa su número, o toca la casilla.')}`);
            }
            const i = await this.choose(opts.length, j => `${j + 1}: ${this.destText(opts[j].to, { brief: false })}`);
            if (i == null || this.stateKey() !== key) return;
            await this.act({ type: 'move', p: me, to: opts[i].to });
            return;
        }
        if (g.phase === 'pick') {
            const i = await this.choose(6, j => `${j + 1}: ${this.catName(TRIVIAL_CATS[j])}`);
            if (i == null || this.stateKey() !== key) return;
            await this.act({ type: 'pick', p: me, cat: TRIVIAL_CATS[i] });
            return;
        }
        if (g.phase === 'answer') {
            const q = g.q;
            const i = await this.choose(4, j => `${j + 1}: ${q.options[j]}`);
            if (i == null || this.stateKey() !== key) return;
            await this.act({ type: 'answer', p: me, choice: i });
        }
    }

    async botStep(p) {
        const g = this.game, b = this.bots[p];
        if (!b) return;
        const key = this.stateKey();
        const wait = { roll: 450, move: 650, pick: 900, answer: 900 + (this.visual ? 1200 : 0) }[g.phase] || 500;
        await this.think(wait);
        if (this.stopped || this.stateKey() !== key || g.actor !== p || this.bots[p] !== b) return;
        const a = b.chooseTurn();
        if (a) await this.act(a);
    }

    cancelPick() {
        if (this.sel == null) return false;
        this.sel = null;
        Board.render(this);
        this.notice('Nada elegido.');
        return true;
    }

    /** Las opciones que hay ahora en pantalla (para moverse con las flechas). */
    choiceButtons() {
        const q = [...document.querySelectorAll('#tq:not([hidden]) .tans:not(:disabled)')];
        return q.length ? q : [...$('my-hand').querySelectorAll('.tdest')];
    }

    // ── Teclado ───────────────────────────────────────
    gameKey(k, e) {
        if (/^[1-9]$/.test(k)) { e.preventDefault(); this.tapOption(+k - 1); return true; }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) {
            const list = this.choiceButtons();
            if (!list.length) return false;
            e.preventDefault();
            const d = k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1;
            const at = list.indexOf(document.activeElement);
            this.audio.move();
            UI.focus(list[at < 0 ? (d > 0 ? 0 : list.length - 1) : (at + d + list.length) % list.length]);
            return true;
        }
        if (k === 'Enter' && this.sel != null && this.want?.kinds.has('play') && !e.target?.classList?.contains('tans') && !e.target?.classList?.contains('slot') && !e.target?.classList?.contains('act')) { e.preventDefault(); this.input('play'); return true; }
        if (k === 't') {
            e.preventDefault();
            if (!this.input('roll')) { this.audio.error(); this.explainCant('roll'); }
            return true;
        }
        if (k === 'm') { e.preventDefault(); this.describeBoard(); return true; }
        if (k === 'p') { e.preventDefault(); this.readQuestion(); return true; }
        if (k === 'd') {
            e.preventDefault();
            const S = this.shown;
            this.speech.say(S.die ? `El dado: ${S.die}.` : S.turn === this.me ? 'Todavía no has tirado el dado.' : `${cap(this.v.name(S.turn))} todavía no ha tirado el dado.`, { interrupt: true });
            return true;
        }
        if (k === 'a') { e.preventDefault(); if (!this.practice) { this.audio.error(); this.notice('Los consejos son para la partida de práctica.'); } else if (!this.input('advice')) this.advise(); return true; }
        return false;
    }

    explainCant(kind) {
        const g = this.game, me = this.me;
        let t = 'Ahora no.';
        if (g.phase === 'gameOver') t = 'La partida ha terminado.';
        else if (g.actor !== me) t = g.phase === 'pick' ? `Ahora elige la categoría ${this.v.name(g.actor)}.` : `No es tu turno: juega ${this.v.name(g.current)}.`;
        else if (kind === 'roll' && g.phase === 'move') t = 'Ya has tirado: elige adónde vas.';
        else if (kind === 'roll' && g.phase === 'answer') t = 'Primero contesta la pregunta.';
        else if (kind === 'roll' && g.phase === 'pick') t = 'Primero elige la categoría.';
        else if (kind === 'slot' && g.phase === 'roll') t = 'Primero tira el dado, con la T.';
        this.notice(t);
    }
}
