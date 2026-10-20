/* =============================================
   EL PEDRO — parchis-match.js
   Una partida de Parchís en la mesa: el tablero
   dibujado (tu casa siempre abajo a la derecha),
   el dado, las fichas que avanzan casilla a casilla
   con su sonido, y todo contado por voz: qué sale,
   adónde va cada ficha, quién come y qué peligros
   tienes cerca. Tus fichas se eligen tocándolas o
   con su número.
   ============================================= */
'use strict';

/** Lo que dura cada momento sin voz (modo visual), en milisegundos. */
const PARCHIS_BEAT = { roll: 350, move: 250, capture: 900, meta: 900, penalty: 1100, noMove: 650, bonusLost: 800, finished: 1300 };

const PARCHIS_PAINT = {
    amarillo: { fill: '#f5c518', dark: '#8a6a00', tint: '#fbeaa8', ink: '#2e2300' },
    azul: { fill: '#2f6fd6', dark: '#173c80', tint: '#c9dbf8', ink: '#ffffff' },
    rojo: { fill: '#d63a3a', dark: '#7c1b1b', tint: '#f7c9c6', ink: '#ffffff' },
    verde: { fill: '#2e9d4f', dark: '#165c2b', tint: '#c5e9cd', ink: '#ffffff' },
};
/** «la ficha amarilla», «las amarillas». */
const PARCHIS_FEM = { amarillo: 'amarilla', azul: 'azul', rojo: 'roja', verde: 'verde' };
const PARCHIS_PLURAL = { amarillo: 'amarillas', azul: 'azules', rojo: 'rojas', verde: 'verdes' };

// ═══════════════════════════════════════════════════════
// El tablero dibujado
// ═══════════════════════════════════════════════════════
//
// 22 × 22 unidades: cuatro brazos de 3 columnas (6 de ancho) y 8 filas,
// las casas en las esquinas y la meta en el centro. Las casillas se
// numeran del 1 al 68 en sentido contrario a las agujas del reloj, con el
// amarillo abajo a la derecha. Cada jugador ve el tablero girado para que
// su casa quede abajo a la derecha, pero los números siguen derechos.

const ParchisArt = {
    idx: { amarillo: 0, azul: 1, rojo: 2, verde: 3 },

    /** Gira un punto k cuartos de vuelta, en sentido contrario a las agujas del reloj, alrededor del centro. */
    rot(x, y, k) {
        k = ((k % 4) + 4) % 4;
        let dx = x - 11, dy = y - 11;
        for (let j = 0; j < k; j++) [dx, dy] = [dy, -dx];
        return [11 + dx, 11 + dy];
    },

    /** ¿La casilla está en un brazo de arriba o de abajo (más ancha que alta)? */
    wide(s) { return s <= 8 || (s >= 26 && s <= 42) || s >= 60; },

    /** El centro y el tamaño de la casilla s (1 a 68). */
    cell(s) {
        let x, y;
        if (s <= 8) { x = 13; y = 21.5 - (s - 1); }
        else if (s <= 16) { x = 14.5 + (s - 9); y = 13; }
        else if (s === 17) { x = 21.5; y = 11; }
        else if (s <= 25) { x = 21.5 - (s - 18); y = 9; }
        else if (s <= 33) { x = 13; y = 7.5 - (s - 26); }
        else if (s === 34) { x = 11; y = 0.5; }
        else if (s <= 42) { x = 9; y = 0.5 + (s - 35); }
        else if (s <= 50) { x = 7.5 - (s - 43); y = 9; }
        else if (s === 51) { x = 0.5; y = 11; }
        else if (s <= 59) { x = 0.5 + (s - 52); y = 13; }
        else if (s <= 67) { x = 9; y = 14.5 + (s - 60); }
        else { x = 11; y = 21.5; }
        const w = this.wide(s);
        return { x, y, w: w ? 2 : 1, h: w ? 1 : 2 };
    },

    /** La casilla k (1 a 7) del pasillo de un color. */
    lane(color, k) {
        const c = this.idx[color];
        const [x, y] = this.rot(11, 21.5 - k, c);
        return { x, y, w: c % 2 ? 1 : 2, h: c % 2 ? 2 : 1 };
    },

    homeCenter(color) { return this.rot(18, 18, this.idx[color]); },
    homeSpot(color, i) {
        const d = [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]][i] || [0, 0];
        return this.rot(18 + d[0], 18 + d[1], this.idx[color]);
    },
    metaSpot(color, k) {
        const d = [-1.35, 1.35, -0.45, 0.45][k] ?? 0;
        return this.rot(11 + d, 13.2, this.idx[color]);
    },
    metaTri(color) { return [[8, 14], [14, 14], [11, 11]].map(([x, y]) => this.rot(x, y, this.idx[color])); },

    rect(c, cls, fill = null) {
        const f = fill ? ` style="fill:${fill}"` : '';
        return `<rect class="${cls}" x="${c.x - c.w / 2}" y="${c.y - c.h / 2}" width="${c.w}" height="${c.h}"${f}/>`;
    },

    /** El tablero sin fichas, en su posición de siempre (el amarillo abajo a la derecha). */
    boardSvg() {
        const P = PARCHIS_PAINT, out = [];
        out.push('<rect class="pb-bg" x="0" y="0" width="22" height="22" rx="0.5"/>');
        for (const color of PARCHIS_COLORS) {
            const [cx, cy] = this.homeCenter(color);
            out.push(`<rect class="pb-home" x="${cx - 4}" y="${cy - 4}" width="8" height="8" fill="${P[color].fill}"/>`);
            out.push(`<circle class="pb-yard" cx="${cx}" cy="${cy}" r="3.35" stroke="${P[color].dark}"/>`);
            for (let k = 1; k <= 7; k++) out.push(this.rect(this.lane(color, k), 'pb-lane', P[color].tint));
            out.push(`<polygon class="pb-meta" points="${this.metaTri(color).map(p => p.join(',')).join(' ')}" fill="${P[color].fill}"/>`);
        }
        for (let s = 1; s <= PARCHIS_TRACK; s++) {
            const c = this.cell(s);
            const start = PARCHIS_COLORS.find(col => PARCHIS_START[col] === s);
            out.push(this.rect(c, 'pb-cell' + (start ? ' start' : ''), start ? P[start].fill : null));
            if (PARCHIS_SAFE.has(s) && !start) out.push(`<circle class="pb-safe" cx="${c.x}" cy="${c.y}" r="0.34"/>`);
        }
        out.push('<circle class="pb-center" cx="11" cy="11" r="0.55"/>');
        return out.join('');
    },

    /** Los números de las casillas, derechos (con el tablero girado k cuartos de vuelta). */
    numbersSvg(k) {
        const out = [];
        for (let s = 1; s <= PARCHIS_TRACK; s++) {
            const c = this.cell(s);
            const [x, y] = this.rot(c.x, c.y, k);
            const start = PARCHIS_COLORS.find(col => PARCHIS_START[col] === s);
            out.push(`<text class="pb-num" x="${x}" y="${y + 0.16}"${start ? ` style="fill:${PARCHIS_PAINT[start].ink}"` : ''}>${s}</text>`);
        }
        return out.join('');
    },

    /** Un tablero pequeño para el salón y la sala. */
    tile() {
        const pieces = [['amarillo', 5], ['azul', 30], ['rojo', 46], ['verde', 60], ['amarillo', 12]].map(([color, s]) => {
            const c = this.cell(s);
            return `<circle cx="${c.x}" cy="${c.y}" r="0.75" fill="${PARCHIS_PAINT[color].fill}" stroke="${PARCHIS_PAINT[color].dark}" stroke-width="0.25"/>`;
        }).join('');
        return `<svg class="parchis-tile" viewBox="-0.5 -0.5 23 23" aria-hidden="true" focusable="false">${this.boardSvg()}${pieces}</svg>`;
    },

    /** Los puntos de cada cara del dado. */
    pips(v) {
        const a = -0.6, b = 0, c = 0.6;
        const faces = { 1: [[b, b]], 2: [[a, a], [c, c]], 3: [[a, a], [b, b], [c, c]], 4: [[a, a], [c, a], [a, c], [c, c]], 5: [[a, a], [c, a], [b, b], [a, c], [c, c]], 6: [[a, a], [c, a], [a, b], [c, b], [a, c], [c, c]] };
        return (faces[v] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.24"/>`).join('');
    },
};

// ═══════════════════════════════════════════════════════
// La partida
// ═══════════════════════════════════════════════════════

class ParchisMatch extends Match {
    static get kind() { return 'parchis'; }
    get roundWord() { return 'partida'; }
    get beats() { return PARCHIS_BEAT; }
    get playPhases() { return ['roll', 'move', 'bonus']; }

    setup() {
        this.sel = null;               // tu ficha elegida, a la espera del segundo toque
        this.dieSel = null;            // con dos dados: el dado con el que quieres mover
        this.promptedKey = null;
        this.stamp = 0;
        this.advisor = new ParchisBot(this.game, this.me, { level: 'dificil' }, makeRng(this.seed + 4242));
        this.syncShown();
    }

    makeGame(rules, seed) { return new ParchisGame({ players: this.seats.map(s => ({ name: s.name })), rules, seed }); }
    makeMirror(rules) { return new ParchisMirror({ names: this.seats.map(s => s.name), rules }); }
    makeBot(p, char, rng) { return new ParchisBot(this.game, p, char, rng); }
    stateKey() { const g = this.game; return `${g.phase}|${g.current}|${g.turns}`; }

    /** Lo que se ve en la mesa, al ritmo de lo que se cuenta (la partida ya va por delante). */
    syncShown() {
        const g = this.game;
        this.shown = {
            pos: g.players.map(pl => pl.pieces.map(pc => pc.pos)),
            at: g.players.map(pl => pl.pieces.map(pc => pc.at || 0)),
            done: g.players.map(pl => !!pl.done),
            turn: g.current,
            die: g.dice,
            pair: g.pair ? g.pair.slice() : null,
            left: (g.left || []).slice(),
        };
        this.stamp = Math.max(0, ...this.shown.at.flat());
    }

    // ── Ayudas ────────────────────────────────────────
    /** ¿Se juega con dos dados? */
    get two() { return !!this.game.rules.twoDice; }
    /** «un 3 y un 5», «dobles de 4». */
    pairText(a, b) { return a === b ? `dobles de ${a}` : `un ${a} y un ${b}`; }
    /** Lo que ha salido en los dados, para el oído: «un 3 y un 5; te queda el 5». */
    diceNow() {
        const S = this.shown;
        if (!this.two) return S.die ? `El dado: ${S.die}.` : null;
        if (!S.pair) return null;
        let t = `Los dados: ${this.pairText(...S.pair)}.`;
        if (S.turn === this.game.current && this.game.phase === 'move' && S.left.length === 1) t += ` Queda el ${S.left[0]}.`;
        return t;
    }
    /** Las jugadas de tu ficha i (con dos dados, una por dado). */
    pieceOpts(i) {
        const g = this.game, ctrl = this.ctrlOf(this.me);
        return g.options.filter(x => x.o === ctrl && x.i === i);
    }
    /** La jugada de tu ficha i con el dado elegido (o con el que valga). */
    pieceOpt(i) {
        const list = this.pieceOpts(i);
        return list.find(m => m.die === this.dieSel) || list[0] || null;
    }
    /** Los dados distintos que te quedan por mover. */
    leftDice() { return this.two && this.game.phase === 'move' ? [...new Set(this.game.left)] : []; }
    colorOf(p) { return this.game.players[p].color; }
    /** De quién son las fichas que mueves (las tuyas o, si ya has acabado, las de tu pareja). */
    ctrlOf(p) { const g = this.game; return g.teamPlay && this.shown.done[p] ? g.partner(p) : p; }
    /** El tablero tal como se ve ahora (para los peligros y las descripciones). */
    shownGame() {
        const g = this.game, S = this.shown;
        const v = Object.create(ParchisMirror.prototype);
        v.rules = g.rules;
        v.players = g.players.map((pl, o) => ({ name: pl.name, index: o, color: pl.color, done: S.done[o], pieces: S.pos[o].map((pos, i) => ({ pos, at: S.at[o][i] })) }));
        return v;
    }
    /** El giro del tablero: tu casa abajo a la derecha. */
    get turnK() { return (4 - ParchisArt.idx[this.colorOf(this.pov)]) % 4; }
    get watchKeys() { return [['m', 'dónde está cada ficha'], ['d', 'el último dado']]; }
    view(x, y) { return ParchisArt.rot(x, y, this.turnK); }
    /** Lo que suena a la izquierda o a la derecha según dónde está en el tablero. */
    panAt([x]) { return Math.max(-0.9, Math.min(0.9, (x - 11) / 11)); }

    /** «tu ficha 2», «la ficha 2 de Bea», «la 2 de tu pareja». */
    pieceName(o, i, { short = false } = {}) {
        const me = this.me;
        if (o === me) return short ? `la ${i + 1}` : `tu ficha ${i + 1}`;
        const g = this.game;
        if (g.teamPlay && g.partner(me) === o) return short ? `la ${i + 1} de tu pareja` : `la ficha ${i + 1} de ${this.names[o]}, tu pareja`;
        return short ? `la ${i + 1} de ${this.names[o]}` : `la ficha ${i + 1} de ${this.names[o]}, ${PARCHIS_FEM[this.colorOf(o)]}`;
    }

    /** Dónde está una ficha, para el oído: «en casa», «en la 34, seguro», «en el pasillo, a 3 de la meta». */
    whereText(o, pos, { far = false } = {}) {
        if (pos < 0) return 'en casa';
        if (pos === PARCHIS_META) return 'en la meta';
        if (pos > PARCHIS_LAST) return `en el pasillo, a ${PARCHIS_META - pos} de la meta`;
        const sq = parchisSquare(this.colorOf(o), pos);
        let t = `en la ${sq}`;
        if (sq === PARCHIS_START[this.colorOf(o)]) t += o === this.me ? ', tu salida' : ', su salida';
        else if (!this.watching && PARCHIS_START[this.colorOf(this.me)] === sq) t += ', tu salida';
        else if (PARCHIS_SAFE.has(sq)) t += ', seguro';
        if (far) t += `, a ${PARCHIS_META - pos} de la meta`;
        return t;
    }

    /** Adónde va una jugada: «a la 27», «a la meta», «al pasillo, a 4 de la meta». */
    destText(m) {
        if (m.meta) return 'a la meta';
        if (m.to > PARCHIS_LAST) return `al pasillo, a ${PARCHIS_META - m.to} de la meta`;
        let t = `a la ${m.sq}`;
        if (PARCHIS_SAFE.has(m.sq)) t += ', seguro';
        return t;
    }

    optionText(m) {
        let t = m.out ? `sacar ${m.o === this.me ? 'una ficha' : 'una de tu pareja'}` : `la ${m.i + 1}${m.o !== this.me ? ' de tu pareja' : ''} ${this.destText(m)}`;
        if (m.capture) t += `, y comes ${this.pieceName(m.capture.o, m.capture.i, { short: true })}`;
        return t;
    }

    /** Por qué no se puede mover esa ficha ahora. */
    whyNot(o, i) {
        const g = this.game, pos = this.shown.pos[o][i];
        if (pos < 0) return `Tu ficha ${i + 1} está en casa: sale con un 5${this.two ? ', o si los dados suman 5' : ''}.`;
        if (pos === PARCHIS_META) return `Tu ficha ${i + 1} ya está en la meta.`;
        if (this.two && g.phase === 'move') {
            if (g.options.some(m => m.out)) return 'Con un 5, o si los dados suman 5, si puedes sacar ficha, hay que sacarla.';
            if (g.left.length === 2 && g.left[0] === g.left[1] && g.rules.openBarrier && g.barrierPieces(o).size && !g.barrierPieces(o).has(i)) return 'Con dobles hay que abrir tu barrera.';
            const ds = this.leftDice();
            const n = ds.length > 1 ? `ni ${ds[0]} ni ${ds[1]}` : ds[0];
            if (ds.every(d => pos + d > PARCHIS_META) && g.rules.exact) return `Tu ficha ${i + 1} está a ${PARCHIS_META - pos} de la meta: hace falta la cuenta justa.`;
            return `Tu ficha ${i + 1} no puede avanzar ${n}: hay una barrera en el camino, o la casilla está llena.`;
        }
        if (g.phase === 'move' && g.dice === 5 && g.options.some(m => m.out)) return 'Con un 5, si puedes sacar ficha, hay que sacarla.';
        if (g.phase === 'move' && g.dice === 6 && g.rules.openBarrier && g.barrierPieces(o).size && !g.barrierPieces(o).has(i)) return 'Con un 6 hay que abrir tu barrera.';
        const n = g.phase === 'bonus' ? g.bonus : g.steps;
        if (pos + n > PARCHIS_META && g.rules.exact) return `Tu ficha ${i + 1} está a ${PARCHIS_META - pos} de la meta: hace falta la cuenta justa.`;
        return `Tu ficha ${i + 1} no puede avanzar ${n}: hay una barrera en el camino, o la casilla está llena.`;
    }

    introText() {
        const g = this.game, me = this.me;
        const others = this.seats.map((s, p) => {
            if (p === me) return null;
            const bot = this.mode !== 'local' && s.kind === 'bot' ? ', de la máquina' : '';
            return `${s.name}${bot}, con las ${PARCHIS_PLURAL[this.colorOf(p)]}`;
        }).filter(Boolean);
        let text = `Llevas las ${PARCHIS_PLURAL[this.colorOf(me)]}. Juegas contra ${Txt.list(others)}.`;
        if (g.teamPlay) text = `Llevas las ${PARCHIS_PLURAL[this.colorOf(me)]}. Jugáis por parejas: vas con ${this.names[g.partner(me)]}, que lleva las ${PARCHIS_PLURAL[this.colorOf(g.partner(me))]}, contra ${Txt.list([1, 3].map(k => this.names[(me + k) % 4]))}.`;
        if (g.rules.pieces !== 4) text += ` Cada uno con ${g.rules.pieces} fichas.`;
        if (this.two) text += ' Se juega con dos dados.';
        if (this.practice) text = 'Partida de práctica: con la A te doy un consejo. ' + text;
        return text;
    }

    // ── La mesa ───────────────────────────────────────
    actionsDef() {
        return [
            { kind: 'roll', label: this.game?.rules?.twoDice ? 'Tirar los dados' : 'Tirar el dado', key: 'T', cls: 'main' },
            { kind: 'play', label: 'Mover la ficha', key: 'Enter', cls: 'main' },
            { kind: 'die', label: 'Cambiar de dado', key: 'D' },
            { kind: 'advice', label: 'Consejo', key: 'A' },
            { kind: 'board', label: 'El tablero', key: 'M', cls: 'small talk' },
            { kind: 'danger', label: 'Peligros', key: 'P', cls: 'small talk' },
            { kind: 'info', label: 'Cómo va', key: 'I', cls: 'small talk' },
            { kind: 'cards', label: 'Mis fichas', key: 'C', cls: 'small talk' },
            { kind: 'repeat', label: 'Repetir', key: 'Espacio', cls: 'small talk' },
            { kind: 'menu', label: 'Pausa', key: 'Esc', cls: 'small' },
        ];
    }

    button(kind) {
        if (kind === 'board') return this.describeBoard();
        if (kind === 'danger') return this.describeDanger();
        if (kind === 'die') return this.switchDie();
        if (kind === 'advice' && !this.want?.kinds.has('advice')) return this.advise();
        return super.button(kind);
    }

    buildCenter(center) {
        const k = this.turnK;
        center.innerHTML = `
            <div class="pboard-wrap">
                <svg id="pboard" class="pboard" viewBox="-0.4 -0.4 22.8 22.8" aria-hidden="true" focusable="false">
                    <g transform="rotate(${(4 - k) % 4 * 90} 11 11)">${ParchisArt.boardSvg()}</g>
                    <g class="pb-nums">${ParchisArt.numbersSvg(k)}</g>
                    <g id="pb-marks"></g>
                    <g id="pb-pieces"></g>
                    <g id="p-die" class="die" data-k="0"><g class="die-in"><rect x="-1.1" y="-1.1" width="2.2" height="2.2" rx="0.42"/><g class="pips"></g></g></g>
                    ${this.two ? '<g id="p-die2" class="die" data-k="1"><g class="die-in"><rect x="-1.1" y="-1.1" width="2.2" height="2.2" rx="0.42"/><g class="pips"></g></g></g>' : ''}
                </svg>
            </div>`;
        const svg = $('pboard');
        svg.addEventListener('click', e => {
            const pz = e.target.closest?.('.pz');
            if (pz) { this.boardPieceClick(+pz.dataset.o, +pz.dataset.i); return; }
            const die = e.target.closest?.('.die');
            if (die) this.dieClick(+die.dataset.k);
        });
        // Las fichas de todos: un grupo por ficha, que se mueve casilla a casilla.
        const box = $('pb-pieces');
        const g = this.game;
        g.players.forEach((pl, o) => pl.pieces.forEach((_, i) => {
            const P = PARCHIS_PAINT[pl.color];
            const el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            el.setAttribute('class', `pz${o === this.me ? ' mine' : ''}`);
            el.dataset.o = o; el.dataset.i = i;
            el.innerHTML = `<circle class="pz-ring" r="0.66"/><circle class="pz-body" r="0.46" fill="${P.fill}" stroke="${P.dark}"/><circle class="pz-shine" r="0.17" cx="-0.14" cy="-0.16"/><text class="pz-num" y="0.17" fill="${P.ink}">${i + 1}</text>`;
            box.appendChild(el);
        }));
        // Los sitios: el color de cada jugador y sus fichas.
        for (let p = 0; p < g.n; p++) {
            const seat = Board.seatEl(p);
            if (!seat) continue;
            seat.dataset.color = this.colorOf(p);
            const av = seat.querySelector('.avatar');
            if (av) av.dataset.color = this.colorOf(p);
            const hand = Board.handEl(p);
            if (p !== this.me) hand?.setAttribute('aria-label', `Fichas de ${this.names[p]}, ${PARCHIS_PLURAL[this.colorOf(p)]}`);
        }
        $('my-hand').setAttribute('aria-label', 'Tus fichas');
        delete $('my-hand').dataset.k;
    }

    /** El sitio de una ficha en el tablero (ya girado). */
    piecePoint(o, i) {
        const S = this.shown, color = this.colorOf(o), pos = S.pos[o][i];
        let x, y;
        if (pos < 0) [x, y] = ParchisArt.homeSpot(color, i);
        else if (pos === PARCHIS_META) {
            const k = S.pos[o].slice(0, i).filter(q => q === PARCHIS_META).length;
            [x, y] = ParchisArt.metaSpot(color, k);
        } else {
            let cell, mates;
            if (pos > PARCHIS_LAST) {
                cell = ParchisArt.lane(color, pos - PARCHIS_LAST);
                mates = S.pos[o].map((q, j) => q === pos ? { o, i: j, at: S.at[o][j] } : null).filter(Boolean);
            } else {
                const sq = parchisSquare(color, pos);
                cell = ParchisArt.cell(sq);
                mates = [];
                S.pos.forEach((list, q) => list.forEach((qp, j) => { if (parchisSquare(this.colorOf(q), qp) === sq) mates.push({ o: q, i: j, at: S.at[q][j] }); }));
            }
            mates.sort((a, b) => a.at - b.at || a.o - b.o || a.i - b.i);
            const k = mates.findIndex(m => m.o === o && m.i === i), n = mates.length;
            const off = n <= 1 ? 0 : (k - (n - 1) / 2) * (n > 2 ? 0.55 : 1);
            x = cell.x + (cell.w > cell.h ? off : 0);
            y = cell.y + (cell.w > cell.h ? 0 : off);
        }
        return this.view(x, y);
    }

    /** El centro de la casilla a la que llega una jugada (para marcarla). */
    destPoint(m) {
        const color = this.colorOf(m.o);
        if (m.meta) return this.view(...ParchisArt.metaTri(color).reduce((a, p) => [a[0] + p[0] / 3, a[1] + p[1] / 3], [0, 0]));
        const c = m.to > PARCHIS_LAST ? ParchisArt.lane(color, m.to - PARCHIS_LAST) : ParchisArt.cell(m.sq);
        return this.view(c.x, c.y);
    }

    renderPieces() {
        const S = this.shown;
        const g = this.game;
        const want = this.want?.kinds;
        const choosing = !!want?.has('slot') && (g.phase === 'move' || g.phase === 'bonus') && g.current === this.me;
        const can = new Set(choosing ? g.options.map(m => m.o + ':' + m.i) : []);
        const ctrl = this.ctrlOf(this.me);
        for (const el of $('pb-pieces').children) {
            const o = +el.dataset.o, i = +el.dataset.i;
            const [x, y] = this.piecePoint(o, i);
            const pos = S.pos[o][i];
            const scale = pos < 0 ? 1.3 : 1;
            el.style.transform = `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px) scale(${scale})`;
            el.classList.toggle('can', can.has(o + ':' + i));
            el.classList.toggle('sel', o === ctrl && this.sel === i && choosing);
            el.classList.toggle('home', pos < 0);
        }
        // La casilla a la que iría la ficha elegida.
        const marks = $('pb-marks');
        const m = choosing && this.sel != null ? this.pieceOpt(this.sel) : null;
        const k = m ? `${m.o}:${m.i}:${m.to}` : '';
        if (marks.dataset.k !== k) {
            marks.dataset.k = k;
            if (m) {
                const [x, y] = this.destPoint(m);
                marks.innerHTML = `<circle class="pb-dest" cx="${x}" cy="${y}" r="0.62"/>`;
            } else marks.innerHTML = '';
        }
        // El dado (o los dos), en la casa de quien tiene el turno.
        const [dx, dy] = this.view(...ParchisArt.homeCenter(this.colorOf(S.turn)));
        const dice = this.two ? [$('p-die'), $('p-die2')] : [$('p-die')];
        const values = this.two ? (S.pair || [null, null]) : [S.die];
        const used = this.usedDice();
        const pickDie = choosing && g.phase === 'move' && this.leftDice().length > 1 ? (m ? m.die : this.dieSel) : null;
        dice.forEach((die, j) => {
            const x = this.two ? dx + (j ? 1.2 : -1.2) : dx;
            die.style.transform = `translate(${x}px, ${dy}px)${this.two ? ' scale(0.85)' : ''}`;
            if (!this.rolling) {
                const face = String(values[j] || '');
                if (die.dataset.face !== face) { die.dataset.face = face; die.querySelector('.pips').innerHTML = ParchisArt.pips(values[j]); }
            }
            die.classList.toggle('ready', !!want?.has('roll'));
            die.classList.toggle('blank', !values[j] && !this.rolling);
            die.classList.toggle('used', !this.rolling && used[j]);
            die.classList.toggle('chosen', pickDie != null && values[j] === pickDie && !used[j] && (j === 0 || values[0] !== values[1]));
        });
    }

    /** Con dos dados: cuáles ya se han movido (para verlos apagados). */
    usedDice() {
        const S = this.shown;
        if (!this.two || !S.pair) return [false, false];
        const left = S.left.slice();
        return S.pair.map(v => { const k = left.indexOf(v); if (k < 0) return true; left.splice(k, 1); return false; });
    }

    render() {
        const g = this.game, me = this.me, S = this.shown;
        const want = this.want?.kinds;
        const choosing = !!want?.has('slot') && (g.phase === 'move' || g.phase === 'bonus') && g.current === me;
        const opts = choosing ? g.options : [];
        for (let p = 0; p < g.n; p++) {
            const seat = Board.seatEl(p);
            if (!seat) continue;
            seat.classList.toggle('active', g.phase !== 'gameOver' && S.turn === p);
            seat.classList.toggle('winner', !!g.winners?.includes(p));
            if (g.teamPlay) { seat.classList.toggle('team-a', g.team(p) === g.team(me)); seat.classList.toggle('team-b', g.team(p) !== g.team(me)); }
            Board.setWins(p, 0);
            const metas = S.pos[p].filter(q => q === PARCHIS_META).length;
            Board.setScore(p, metas ? `${metas} en la meta` : '');
            if (p === me) continue;
            const hand = Board.handEl(p);
            const key = S.pos[p].join(',');
            if (hand.dataset.k !== key) {
                hand.dataset.k = key;
                hand.innerHTML = S.pos[p].map((pos, i) => {
                    const short = pos < 0 ? 'casa' : pos === PARCHIS_META ? 'meta' : pos > PARCHIS_LAST ? `P${pos - PARCHIS_LAST}` : parchisSquare(this.colorOf(p), pos);
                    return `<span class="pzc" data-color="${this.colorOf(p)}"><span class="pzc-dot" aria-hidden="true">${i + 1}</span><span class="pzc-t" aria-hidden="true">${short}</span><span class="sr-only">Ficha ${i + 1}: ${this.whereText(p, pos)}. </span></span>`;
                }).join('');
            }
        }
        // Tus fichas: un botón por ficha (mirando la partida, las de abajo se ven como las de los demás).
        if (this.watching) $('seat-me').dataset.color = this.colorOf(this.pov);
        else this.renderMine(opts, choosing);
        this.renderPieces();
        Board.showAct('roll', !!want?.has('roll'));
        Board.showAct('play', !!want?.has('play') && this.sel != null && this.settings.confirmPlay);
        Board.showAct('die', choosing && g.phase === 'move' && this.leftDice().length > 1);
        Board.showAct('advice', this.practice && !!want);
    }

    renderMine(opts, choosing) {
        const me = this.me, S = this.shown;
        const ctrl = this.ctrlOf(me);
        const hand = $('my-hand');
        const pcs = S.pos[ctrl];
        const mk = `${ctrl}|${pcs.length}`;
        if (hand.dataset.k !== mk) {
            hand.dataset.k = mk;
            hand.innerHTML = '';
            for (const k of Object.keys(Board.els)) if (k.startsWith(me + ':')) delete Board.els[k];
            pcs.forEach((_, i) => {
                const b = document.createElement('button');
                b.className = 'slot nav pzb';
                b.dataset.p = me; b.dataset.s = i;
                b.innerHTML = `<span class="pzb-dot" aria-hidden="true">${i + 1}</span><span class="pzb-txt" aria-hidden="true"></span>`;
                b.addEventListener('click', () => this.tapPiece(i));
                hand.appendChild(b);
                Board.els[me + ':' + i] = b;
            });
        }
        $('seat-me').dataset.color = this.colorOf(ctrl);
        [...hand.children].forEach((b, i) => {
            const pos = pcs[i];
            const m = choosing ? this.pieceOpt(i) : null;
            b.dataset.color = this.colorOf(ctrl);
            b.querySelector('.pzb-txt').textContent = pos < 0 ? 'En casa' : pos === PARCHIS_META ? 'En la meta' : pos > PARCHIS_LAST ? `Pasillo: a ${PARCHIS_META - pos}` : `Casilla ${parchisSquare(this.colorOf(ctrl), pos)}`;
            b.classList.toggle('pickable', !!m);
            b.classList.toggle('blocked', choosing && !m);
            b.classList.toggle('chosen', choosing && this.sel === i);
            b.classList.toggle('done', pos === PARCHIS_META);
            b.setAttribute('aria-label', this.pieceLabel(ctrl, i, m));
        });
    }

    pieceLabel(o, i, m) {
        const pos = this.shown.pos[o][i];
        let t = `${o === this.me ? 'Tu ficha' : 'Ficha de tu pareja'} ${i + 1}: ${this.whereText(o, pos, { far: pos >= 0 && pos <= PARCHIS_LAST })}`;
        const list = m && this.two ? this.pieceOpts(i) : [];
        if (list.length > 1) t += '. ' + list.map(x => `Con el ${x.die}, ${this.destText(x)}${x.capture ? ', y comes' : ''}`).join('. ');
        else if (m) t += `. Puede ir ${this.destText(m)}${m.capture ? ', y comes' : ''}`;
        if (m && this.sel === i) t += '. Elegida: pulsa otra vez para moverla';
        return t;
    }

    // ── Animaciones ───────────────────────────────────
    /** La ficha avanza casilla a casilla, con un toque de sonido en cada una. */
    async walk(o, i, from, to, { fast = false } = {}) {
        const S = this.shown, A = this.audio;
        const path = [];
        if (from < 0) path.push(to);
        else if (to >= from) for (let q = from + 1; q <= to; q++) path.push(q);
        else { for (let q = from + 1; q <= PARCHIS_META; q++) path.push(q); for (let q = PARCHIS_META - 1; q >= to; q--) path.push(q); }
        const still = Board.still;
        const ms = still ? 0 : fast ? 55 : 95;
        for (let k = 0; k < path.length; k++) {
            if (this.stopped) return;
            S.pos[o][i] = path[k];
            S.at[o][i] = ++this.stamp;
            this.renderPieces();
            A.step(this.panAt(this.piecePoint(o, i)), k);
            if (ms && k < path.length - 1) await this.sleep(ms);
        }
        if (ms) await this.sleep(140);
    }

    async rollAnim(value, value2 = null) {
        const dice = [$('p-die'), $('p-die2')].filter(Boolean);
        this.rolling = true;
        for (const die of dice) { die.classList.add('rolling'); die.classList.remove('blank', 'used', 'chosen'); }
        if (!Board.still) {
            for (let k = 0; k < 6; k++) {
                for (const die of dice) die.querySelector('.pips').innerHTML = ParchisArt.pips(1 + Math.floor(Math.random() * 6));
                await this.sleep(70);
            }
        }
        this.rolling = false;
        for (const die of dice) { die.classList.remove('rolling'); die.dataset.face = ''; }
        if (this.two) { this.shown.pair = [value, value2]; this.shown.left = [value, value2]; }
        else this.shown.die = value;
        this.renderPieces();
    }

    flashCell(pt) {
        if (Board.still) return;
        const marks = $('pb-marks');
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('class', 'pb-flash');
        c.setAttribute('cx', pt[0]); c.setAttribute('cy', pt[1]); c.setAttribute('r', '0.9');
        marks.appendChild(c);
        setTimeout(() => c.remove(), 1000);
    }

    /** Las fichas rivales que quedan cerca de las tuyas después de que se mueva alguien. */
    threatText(mover = null) {
        const v = this.shownGame(), me = this.me;
        const mine = this.ctrlOf(me);
        const list = v.threats(mine).filter(t => mover == null || t.by.o === mover);
        if (!list.length) return '';
        const t = list[0];
        return `Ojo: ${this.pieceName(t.by.o, t.by.i, { short: true })} está a ${t.d} detrás de ${mine === me ? 'tu ficha' : 'la ficha de tu pareja'} ${t.i + 1}.`;
    }

    // ── Lo que pasa, contado y animado ────────────────
    async present(e) {
        const g = this.game, me = this.me, v = this.v, A = this.audio, B = Board, S = this.shown;
        const homePan = p => this.panAt(this.view(...ParchisArt.homeCenter(this.colorOf(p))));
        switch (e.t) {
            case 'round': {
                this.syncShown();
                S.turn = e.first;
                S.die = null; S.pair = null; S.left = [];
                B.render(this);
                A.dice(0);
                const first = e.first === me ? 'Empiezas tú' : `Empieza ${this.names[e.first]}`;
                B.banner('Parchís', first);
                B.status(first);
                await this.say(`${first}. ${this.two ? 'Se juega con dos dados: se sale con un 5, o si suman 5.' : 'Se sale con un 5.'} ${this.hint('start', this.two ? 'Tira los dados con la T o con Enter, o tocándolos.' : 'Tira el dado con la T o con Enter, o tocando el dado.')}`.trim(), { keep: true });
                break;
            }
            case 'turn': {
                S.turn = e.p;
                S.die = null; S.pair = null; S.left = [];
                this.sel = null;
                this.dieSel = null;
                B.render(this);
                if (e.p === me) {
                    A.yourTurn();
                    const t = e.again ? `Has sacado ${this.two ? 'dobles' : 'un 6'}: vuelves a tirar` : `Tu turno: tira ${this.two ? 'los dados' : 'el dado'}`;
                    this.prompt(t, `${t}.${this.hint('roll', ` Pulsa la T o Enter, o toca ${this.two ? 'los dados' : 'el dado'}.`)}`);
                } else {
                    A.otherTurn(e.p);
                    B.status(e.again ? `${cap(this.names[e.p])} vuelve a tirar` : `Turno de ${this.names[e.p]}`);
                    if (e.again && !this.brief) await this.say(`${v.Name(e.p)} vuelve a tirar.`);
                    else if (this.seats[e.p].kind === 'remote' && !this.brief) await this.say(`Turno de ${v.name(e.p)}.`);
                }
                break;
            }
            case 'roll': {
                A.dice(homePan(e.p));
                if (this.two) { await this.presentRoll2(e); break; }
                await this.rollAnim(e.value);
                const seven = e.steps === 7 ? (this.brief ? ', cuenta 7' : ': sin fichas en casa, cuenta 7') : '';
                const third = e.value === 6 && e.sixes === 3 && g.rules.threeSixes;
                if (e.p === me) {
                    B.status(`Sacas un ${e.value}${seven}`);
                    if (!third) await this.say(`Sacas un ${e.value}${seven}.`, { keep: true });
                } else {
                    B.bubble(e.p, `Saca un ${e.value}`);
                    if (!third) await this.say(this.brief ? `${v.Name(e.p)}: ${e.value}.` : `${v.Name(e.p)} saca un ${e.value}${seven}.`);
                }
                await this.beat('roll');
                break;
            }
            case 'noMove': {
                if (e.partial) {
                    const d = e.value2 != null ? `el ${e.value} ni el ${e.value2}` : `el ${e.value}`;
                    S.left = [];
                    this.renderPieces();
                    if (e.p === me) {
                        B.status(`No puedes mover ${d}`);
                        await this.say(`No puedes mover nada con ${d}: ${e.value2 != null ? 'se pierden' : 'se pierde'}.`, { keep: true });
                    } else {
                        B.bubble(e.p, `Pierde ${e.value2 != null ? 'los dados' : `el ${e.value}`}`);
                        if (!this.brief) await this.say(`No puede mover ${d}.`);
                    }
                    await this.beat('noMove');
                    break;
                }
                if (e.p === me) {
                    B.status(`Sacas ${this.two ? this.pairText(e.value, e.value2) : `un ${e.value}`}: no puedes mover`);
                    await this.say('No puedes mover ninguna ficha.', { keep: true });
                } else {
                    B.bubble(e.p, 'No puede mover');
                    if (!this.brief) await this.say('No puede mover.');
                }
                await this.beat('noMove');
                break;
            }
            case 'move': {
                if (e.left) { S.left = e.left.slice(); this.renderPieces(); }
                const color = this.colorOf(e.o);
                const mine = e.p === me;
                let text;
                const where = e.to === PARCHIS_META ? null : e.to > PARCHIS_LAST ? `${e.from > PARCHIS_LAST ? 'avanza por' : 'entra en'} el pasillo: le ${PARCHIS_META - e.to === 1 ? 'falta 1' : `faltan ${PARCHIS_META - e.to}`} para la meta` : `a la ${e.sq}`;
                const pre = e.kind === 'bonus' ? `${mine ? 'Cuentas' : 'Cuenta'} ${e.amount} con ${mine ? this.pieceName(e.o, e.i) : `la ${e.i + 1}${e.o !== e.p ? ' de su pareja' : ''}`}` : null;
                if (e.kind === 'out') text = mine ? `${cap(e.o === me ? `tu ficha ${e.i + 1}` : this.pieceName(e.o, e.i))} sale a la ${e.sq}.` : (this.brief ? 'Saca ficha.' : `Saca una ficha${e.o !== e.p ? ' de su pareja' : ''} a la ${e.sq}.`);
                else if (!where) text = '';
                else if (pre) text = e.to > PARCHIS_LAST ? `${pre} y ${where}.` : `${pre}: va ${where}.`;
                else if (mine) text = e.to > PARCHIS_LAST ? `${cap(this.pieceName(e.o, e.i))} ${where}.` : `${cap(this.pieceName(e.o, e.i))} va ${where}.`;
                else {
                    const whose = e.o !== e.p ? ' de su pareja' : '';
                    text = e.to > PARCHIS_LAST ? `La ${e.i + 1}${whose} ${where}.` : (this.brief ? `La ${e.i + 1}${whose}, ${where}.` : `Mueve la ${e.i + 1}${whose} ${where}.`);
                }
                if (text && e.sq != null && e.to <= PARCHIS_LAST) {
                    if (PARCHIS_SAFE.has(e.sq) && e.kind !== 'out') text = text.replace(/\.$/, ', seguro.');
                    const after = this.shownGame();
                    after.players[e.o].pieces[e.i].pos = e.to;
                    if (after.occupants(e.sq).filter(x => x.o === e.o).length === 2 && !this.brief) text = text.replace(/\.$/, '. Hace barrera.');
                }
                if (!mine && e.o === me) {
                    const left = PARCHIS_META - e.to;
                    text = e.kind === 'out' ? `${v.Name(e.p)} saca tu ficha ${e.i + 1}.`
                        : e.to === PARCHIS_META ? ''
                        : e.to > PARCHIS_LAST ? `${v.Name(e.p)} mete tu ficha ${e.i + 1} en el pasillo: le ${left === 1 ? 'falta 1' : `faltan ${left}`} para la meta.`
                        : `${v.Name(e.p)} mueve tu ficha ${e.i + 1} ${where}.`;
                }
                if (e.kind === 'out') A.out(homePan(e.o));
                const talk = text ? this.say(text, { keep: mine }) : Promise.resolve();
                if (!mine) B.bubble(e.p, e.kind === 'out' ? 'Saca ficha' : e.to === PARCHIS_META ? '¡A la meta!' : e.to > PARCHIS_LAST ? 'Al pasillo' : `A la ${e.sq}`);
                await this.walk(e.o, e.i, e.from, e.to, { fast: e.kind === 'bonus' });
                const pt = this.piecePoint(e.o, e.i);
                this.flashCell(pt);
                if (e.sq != null && PARCHIS_SAFE.has(e.sq) && e.kind !== 'out') A.safe(this.panAt(pt));
                B.render(this);
                await talk;
                // ¿Ha quedado alguna ficha rival cerca de las tuyas?
                if (!this.watching && e.p !== me && g.team(e.p) !== g.team(me) && !this.brief && !this.visual) {
                    const warn = this.threatText(e.o);
                    if (warn) await this.say(warn);
                } else if (e.p === me && !this.brief && !this.visual && e.to <= PARCHIS_LAST) {
                    const v2 = this.shownGame();
                    const t = v2.threats(e.o).find(x => x.i === e.i);
                    if (t) await this.say(`Ojo: tiene ${this.pieceName(t.by.o, t.by.i, { short: true })} a ${t.d} detrás.`);
                }
                await this.beat('move');
                break;
            }
            case 'capture': {
                const vo = e.victim.o, vi = e.victim.i;
                const pt = this.piecePoint(vo, vi);
                A.capture(this.panAt(pt));
                S.pos[vo][vi] = -1;
                S.at[vo][vi] = 0;
                B.render(this);
                this.flashCell(pt);
                let text, big = null;
                const count = e.count ? ` Cuentas ${e.count}.` : '';
                if (e.p === me) { text = `¡Te comes ${this.pieceName(vo, vi)}!${count}`; big = ['¡Te la comes!', e.count ? `Cuentas ${e.count}` : '']; }
                else if (vo === me) { text = `¡${v.Name(e.p)} se come tu ficha ${vi + 1}! Vuelve a casa.`; big = [`¡${cap(this.names[e.p])} te come!`, `Tu ficha ${vi + 1} vuelve a casa`]; }
                else text = `¡${v.Name(e.p)} se come ${this.pieceName(vo, vi, { short: true })}!${e.count && !this.brief ? ` Cuenta ${e.count}.` : ''}`;
                if (big) B.banner(...big);
                B.bubble(e.p, e.count ? `¡Come! +${e.count}` : '¡Come!', 2200);
                if (vo !== me) B.bubble(vo, 'Me han comido', 1800);
                B.status(text.replace(/[¡!]/g, '').trim());
                await this.say(text, { keep: true });
                if (e.p !== me) await this.quip(e.p, 'eat', 0.45);
                else if (this.bots[vo]) await this.quip(vo, 'eaten', 0.4);
                await this.beat('capture');
                break;
            }
            case 'meta': {
                const pt = this.piecePoint(e.o, e.i);
                A.meta(this.panAt(pt));
                this.flashCell(pt);
                const svg = $('pboard');
                if (svg) B.burst(svg);
                const count = e.count ? ` Cuentas ${e.count}.` : '';
                let text;
                if (e.p === me) text = `¡${cap(this.pieceName(e.o, e.i))} llega a la meta!${count}`;
                else text = `¡${v.Name(e.p)} mete ${e.o === e.p ? 'una ficha' : 'una ficha de su pareja'} en la meta!${e.count && !this.brief ? ` Cuenta ${e.count}.` : ''}`;
                if (e.p === me) B.banner('¡A la meta!', e.count ? `Cuentas ${e.count}` : '');
                B.bubble(e.p, e.count ? `¡Meta! +${e.count}` : '¡Meta!', 2200);
                B.status(text.replace(/[¡!]/g, '').trim());
                await this.say(text, { keep: true });
                if (e.p !== me) await this.quip(e.p, 'meta', 0.35);
                await this.beat('meta');
                break;
            }
            case 'finished': {
                S.done[e.p] = true;
                this.sel = null;
                B.render(this);
                const mate = e.partner;
                let text;
                if (e.p === me) text = mate != null && !g.winners ? `¡Has metido todas tus fichas! Ahora mueves las de tu pareja, ${this.names[mate]}.` : '¡Has metido todas tus fichas!';
                else text = mate != null && !g.winners ? `${v.Name(e.p)} ha metido todas sus fichas. Ahora mueve las de ${mate === me ? 'tu' : 'su'} pareja.` : `${v.Name(e.p)} ha metido todas sus fichas.`;
                B.status(text.replace(/[¡!]/g, ''));
                await this.say(text, { keep: true });
                await this.beat('finished');
                break;
            }
            case 'bonus': {
                // Ya se ha dicho al comer o al llegar a la meta: aquí solo se ve.
                if (e.p === me) B.status(`Cuentas ${e.amount}: elige ficha`);
                else B.bubble(e.p, `Cuenta ${e.amount}`);
                break;
            }
            case 'bonusLost': {
                const t = e.p === me ? `No puedes contar ${e.amount} con ninguna ficha: se pierden.` : `${v.Name(e.p)} no puede contar ${e.amount}: se pierden.`;
                B.status(t);
                if (e.p !== me) B.bubble(e.p, `Pierde ${e.amount}`);
                await this.say(t, { keep: e.p === me });
                await this.beat('bonusLost');
                break;
            }
            case 'penalty': {
                A.penalty(homePan(e.p));
                let t;
                const third = this.two ? '¡Terceros dobles seguidos!' : '¡Tercer 6 seguido!';
                if (e.o == null) t = e.p === me ? `${third} Pierdes el turno.` : `${third} ${v.Name(e.p)} pierde el turno.`;
                else {
                    const pt = this.piecePoint(e.o, e.i);
                    this.flashCell(pt);
                    S.pos[e.o][e.i] = -1;
                    S.at[e.o][e.i] = 0;
                    B.render(this);
                    t = e.p === me ? `${third} ${cap(this.pieceName(e.o, e.i))} vuelve a casa.` : `${third} La ficha ${e.i + 1} de ${this.names[e.p]} vuelve a casa.`;
                }
                B.banner(this.two ? '¡Terceros dobles!' : '¡Tercer 6!', e.o == null ? 'Se pierde el turno' : 'La última ficha vuelve a casa');
                B.status(t.replace(/[¡!]/g, ''));
                await this.say(t, { keep: true });
                await this.beat('penalty');
                break;
            }
            case 'gameOver': {
                B.render(this);
                if (e.winners.includes(me)) B.confetti();
                else if (e.winners.length) await this.quip(e.winners.find(p => this.bots[p]), 'win', 0.7);
                break;
            }
        }
    }

    /** Con dos dados: lo que sale en cada uno. */
    async presentRoll2(e) {
        const me = this.me, v = this.v, B = Board;
        await this.rollAnim(e.value, e.value2);
        const what = this.pairText(e.value, e.value2);
        const third = e.double && e.sixes === 3 && this.game.rules.threeSixes;
        if (e.p === me) {
            B.status(`Sacas ${what}`);
            if (!third) await this.say(`Sacas ${what}.`, { keep: true });
        } else {
            B.bubble(e.p, e.double ? `Dobles de ${e.value}` : `Saca ${e.value} y ${e.value2}`);
            if (!third) await this.say(this.brief ? `${v.Name(e.p)}: ${e.double ? `dobles de ${e.value}` : `${e.value} y ${e.value2}`}.` : `${v.Name(e.p)} saca ${what}.`);
        }
        await this.beat('roll');
    }

    resultText() {
        const g = this.game, S = this.shown;
        return 'En la meta: ' + g.players.map((_, p) => `${cap(this.v.name(p))} ${S.pos[p].filter(q => q === PARCHIS_META).length} de ${S.pos[p].length}`).join(' · ');
    }

    // ── Lo que se pregunta con las teclas ─────────────
    piecesText(o) {
        const pos = this.shown.pos[o];
        const home = pos.map((q, i) => q < 0 ? i + 1 : null).filter(Boolean);
        const meta = pos.map((q, i) => q === PARCHIS_META ? i + 1 : null).filter(Boolean);
        const parts = [];
        pos.forEach((q, i) => { if (q >= 0 && q < PARCHIS_META) parts.push(`la ${i + 1} ${this.whereText(o, q, { far: o === this.ctrlOf(this.me) && q <= PARCHIS_LAST })}`); });
        const word = (list, w) => list.length === pos.length ? `todas ${w}` : list.length === 1 ? `la ${list[0]} ${w}` : `la ${Txt.list(list.map(String))} ${w}`;
        if (home.length) parts.push(word(home, 'en casa'));
        if (meta.length) parts.push(word(meta, 'en la meta'));
        return parts.join('; ');
    }

    describeBoard() {
        if (this.visual) return;
        const g = this.game, me = this.me;
        const order = Array.from({ length: g.n }, (_, k) => (this.pov + k) % g.n);
        const parts = order.map(p => `${p === me ? 'Tú' : cap(this.names[p])}, ${PARCHIS_PLURAL[this.colorOf(p)]}: ${this.piecesText(p)}.`);
        this.speech.say(parts.join(' '), { interrupt: true });
    }

    describeDanger() {
        if (this.visual) return;
        const v = this.shownGame(), me = this.me, o = this.ctrlOf(me);
        const whose = o === me ? 'tu ficha' : 'la ficha de tu pareja';
        const threats = v.threats(o).map(t => `${cap(whose)} ${t.i + 1}, en la ${t.sq}: ${this.pieceName(t.by.o, t.by.i, { short: true })} está a ${t.d} detrás.`);
        const chances = v.chances(o).map(c => `${this.two && c.d > 6 ? `Si los dados suman ${c.d}` : `Con un ${c.d === 7 ? '6, que cuenta 7' : c.d}`}, ${o === me ? 'tu' : 'la'} ${c.i + 1} se come ${this.pieceName(c.prey.o, c.prey.i, { short: true })}, en la ${c.sq}.`);
        const parts = [];
        parts.push(threats.length ? threats.join(' ') : 'Ninguna ficha tuya está en peligro.');
        if (chances.length) parts.push(chances.join(' '));
        this.speech.say(parts.join(' '), { interrupt: true });
    }

    info() {
        if (this.visual) return;
        const g = this.game, v = this.v, S = this.shown;
        const parts = [];
        if (g.phase === 'gameOver') parts.push('La partida ha terminado.');
        else parts.push(S.turn === this.me ? 'Es tu turno.' : `Es el turno de ${v.name(S.turn)}.`);
        if (this.two) { if (S.pair) parts.push(`Últimos dados: ${this.pairText(...S.pair)}.`); }
        else if (S.die) parts.push(`Último dado: ${S.die}.`);
        if (g.phase === 'bonus' && S.turn === this.me) parts.push(`Estás contando ${g.bonus}.`);
        parts.push('En la meta: ' + Txt.list(g.players.map((_, p) => `${v.name(p)} ${S.pos[p].filter(q => q === PARCHIS_META).length}`)) + '.');
        parts.push('En casa: ' + Txt.list(g.players.map((_, p) => `${v.name(p)} ${S.pos[p].filter(q => q < 0).length}`)) + '.');
        if (g.teamPlay && !this.watching) parts.push(`Vas con ${this.names[g.partner(this.me)]}.`);
        this.speech.say(parts.join(' '), { interrupt: true });
    }

    myCards() {
        if (this.visual) return;
        const o = this.ctrlOf(this.me);
        const who = o === this.me ? `Tus fichas, ${PARCHIS_PLURAL[this.colorOf(o)]}` : `Mueves las fichas de tu pareja, ${PARCHIS_PLURAL[this.colorOf(o)]}`;
        this.speech.say(`${who}: ${this.piecesText(o)}.`, { interrupt: true });
    }

    keysHelp() {
        const t = [
            `T o Enter: tirar ${this.two ? 'los dados' : 'el dado'}.`,
            this.two ? 'D: con dos dados, cambia el dado con el que mueves; si no, dice lo que ha salido.' : '',
            `Del 1 al ${this.shown.pos[this.me].length}: tus fichas. ${this.settings.confirmPlay ? 'La primera vez te dice adónde va y la segunda la mueve. Enter mueve la elegida.' : 'Al pulsarla, la mueves.'}`,
            'Flechas: moverte por tus fichas.',
            `M: dónde está cada ficha. P: peligros, las fichas que tienes cerca.${this.two ? '' : ' D: el último dado.'}`,
            this.practice ? 'A: un consejo.' : '',
            'I: cómo va la partida. C: tus fichas. Espacio: repetir lo último. Escape: pausa.',
        ].filter(Boolean);
        this.speech.say(t.join(' ') + this.srKeysTip(), { interrupt: true });
    }

    /** Un consejo: lo que haría un buen jugador. */
    advise() {
        const g = this.game, me = this.me;
        if (g.current !== me || !this.playPhases.includes(g.phase)) { this.notice('El consejo te lo doy cuando te toque.'); return; }
        let text;
        if (g.phase === 'roll') text = 'Tira el dado, con la T.';
        else {
            const m = this.advisor.chooseMove(g.options);
            this.sel = m.i;
            if (m.die != null) this.dieSel = m.die;
            Board.render(this);
            const withDie = this.two && m.die != null && !m.sum && this.leftDice().length > 1 ? ` con el ${m.die}` : '';
            text = `Te aconsejo ${m.out ? 'sacar ficha' : `mover la ${m.i + 1}${withDie} ${this.destText(m)}`}${m.capture ? ', y te comes una' : ''}.`;
        }
        this.audio.peek(0);
        Board.status(text);
        if (!this.visual) this.speech.say(text, { interrupt: true });
    }

    // ═══ El jugador ════════════════════════════════════
    /** Tocar una de tus fichas (o pulsar su número). */
    tapPiece(i) {
        if (this.stopped) return;
        if (this.input('slot', { slot: i })) return;
        const o = this.ctrlOf(this.me);
        const pos = this.shown.pos[o][i];
        if (pos == null) return;
        this.audio.slot(i, this.shown.pos[o].length);
        if (!this.visual) this.speech.say(`${o === this.me ? 'Tu ficha' : 'La ficha de tu pareja'} ${i + 1}: ${this.whereText(o, pos, { far: pos >= 0 && pos <= PARCHIS_LAST })}.`, { interrupt: true });
    }

    boardPieceClick(o, i) {
        if (o === this.ctrlOf(this.me)) { this.tapPiece(i); return; }
        if (!this.visual) this.speech.say(`${cap(this.pieceName(o, i))}: ${this.whereText(o, this.shown.pos[o][i])}.`, { interrupt: true });
    }

    dieClick(k = 0) {
        if (this.input('roll')) return;
        const S = this.shown;
        if (this.leftDice().length > 1 && this.game.current === this.me && S.pair && !this.usedDice()[k]) { this.switchDie(S.pair[k]); return; }
        if (!this.visual) this.speech.say(this.diceNow() || `Todavía no se ha tirado ${this.two ? 'ningún dado' : 'el dado'}.`, { interrupt: true });
    }

    /** Con dos dados: elegir con qué dado mueves (to) o pasar al otro. Si hay una ficha elegida, dice adónde iría. */
    switchDie(to = null) {
        const ds = this.leftDice();
        const g = this.game;
        if (g.current !== this.me || ds.length < 2 || !this.want?.kinds.has('slot')) {
            if (!this.visual) this.speech.say(this.diceNow() || 'Todavía no se ha tirado.', { interrupt: true });
            return;
        }
        const cur = this.sel != null ? this.pieceOpt(this.sel)?.die : this.dieSel ?? ds[0];
        this.dieSel = to ?? (ds.find(d => d !== cur) ?? ds[0]);
        this.audio.select();
        let t = `Mueves con el ${this.dieSel}`;
        if (this.sel != null) {
            const m = this.pieceOpts(this.sel).find(x => x.die === this.dieSel);
            t = m ? `La ${this.sel + 1}, con el ${m.die}: ${m.out ? 'sale' : 'va ' + this.destText(m)}${m.capture ? `, y comes ${this.pieceName(m.capture.o, m.capture.i, { short: true })}` : ''}` : `Con el ${this.dieSel}, la ${this.sel + 1} no puede moverse`;
        }
        Board.render(this);
        Board.status(t);
        if (!this.visual) this.speech.say(t + '.', { interrupt: true });
    }

    async humanStep() {
        const g = this.game, me = this.me;
        if (g.current !== me || !this.playPhases.includes(g.phase)) return;
        if (g.phase === 'roll') {
            const kinds = ['roll', 'slot'];
            if (this.practice) kinds.push('advice');
            const a = await this.wait(kinds);
            if (!a || a.kind === 'interrupt' || this.stopped) return;
            if (a.kind === 'advice') { this.advise(); return; }
            if (a.kind === 'slot') { this.want = null; this.describeOwn(a.slot); return; }
            await this.act({ type: 'roll', p: me });
            return;
        }
        const key = this.stateKey();
        const opts = g.options;
        const ctrl = g.controlled(me);
        if (opts.length === 1) {
            // Solo hay una jugada: la ficha se mueve sola.
            const m = opts[0];
            if (!m.out) {
                const t = `Solo puedes mover ${m.o === me ? `tu ficha ${m.i + 1}` : `la ${m.i + 1} de tu pareja`}`;
                Board.status(t);
                if (!this.visual && !this.brief) await this.say(t + '.');
            }
            await this.sleep(this.visual ? 650 : 200);
            if (this.stopped || this.stateKey() !== key) return;
            await this.act({ type: 'move', p: me, o: m.o, i: m.i, d: m.die });
            return;
        }
        if (this.promptedKey !== key) {
            this.promptedKey = key;
            let what = g.phase === 'bonus' ? `Cuentas ${g.bonus}` : `Sacas un ${g.dice}${g.steps === 7 ? ', cuenta 7' : ''}`;
            if (this.two && g.phase === 'move') what = g.left.length === 1 ? `Te queda el ${g.left[0]}` : opts.length === 1 && opts[0].sum ? 'Suman 5' : `Tienes ${this.pairText(g.left[0], g.left[1])}`;
            const ds = this.leftDice();
            const list = ds.length > 1 && !opts.some(m => m.out)
                ? ds.map(d => { const mine = opts.filter(m => m.die === d); return `con el ${d}, ${mine.length ? mine.map(m => this.optionText(m)).join(', ') : 'ninguna'}`; }).join('; ')
                : opts.map(m => this.optionText(m)).join('; ');
            const dieHint = this.leftDice().length > 1 ? this.hint('die', ' Si una ficha puede ir con los dos dados, la D cambia de dado.') : '';
            const lead = this.two && g.phase === 'move' && g.left.length === 1 ? `${what}. ` : '';
            this.prompt(`${what}: elige ficha`, `${lead}Elige ficha: ${list}.${this.hint('pick', ' Pulsa su número, o tócala.')}${dieHint}`);
        }
        if (this.sel != null && !opts.some(m => m.o === ctrl && m.i === this.sel)) this.sel = null;
        if (this.dieSel != null && !this.leftDice().includes(this.dieSel)) this.dieSel = null;
        const kinds = ['slot', 'play'];
        if (this.practice) kinds.push('advice');
        const a = await this.wait(kinds);
        if (!a || a.kind === 'interrupt' || this.stopped) return;
        if (a.kind === 'advice') { this.advise(); return; }
        const i = a.kind === 'play' ? this.sel : a.slot;
        if (i == null) { this.audio.error(); this.prompt('Primero elige una ficha', 'Primero elige una ficha, con su número o tocándola.', { interrupt: true }); return; }
        const m = this.pieceOpt(i);
        if (!m) {
            this.audio.error();
            this.prompt(this.whyNot(ctrl, i), null, { interrupt: true });
            return;
        }
        if (this.settings.confirmPlay && a.kind === 'slot' && this.sel !== i) {
            // Primer toque: la marca y dice adónde va. El segundo la mueve.
            this.sel = i;
            this.audio.select();
            Board.render(this);
            const both = this.pieceOpts(i).length > 1;
            const where = x => `${x.out ? 'sale' : 'va ' + this.destText(x)}${x.capture ? `, y comes ${this.pieceName(x.capture.o, x.capture.i, { short: true })}` : ''}`;
            let t = `La ${i + 1}: ${both ? `con el ${m.die}, ` : ''}${where(m)}`;
            if (both) {
                const other = this.pieceOpts(i).find(x => x.die !== m.die);
                t += `. Con el ${other.die}, ${where(other)}`;
            }
            Board.status(`${t}. Toca otra vez para moverla${both ? ` con el ${m.die}, o toca el otro dado` : ''}`);
            if (!this.visual) this.speech.say(`${t}.${this.hint('confirm', ` Pulsa otra vez para moverla${both ? ` con el ${m.die}; la D cambia de dado` : ''}.`)}`, { interrupt: true });
            return;
        }
        this.sel = null;
        await this.act({ type: 'move', p: me, o: m.o, i: m.i, d: m.die });
    }

    describeOwn(i) {
        const o = this.ctrlOf(this.me), pos = this.shown.pos[o]?.[i];
        if (pos == null) return;
        this.audio.slot(i, this.shown.pos[o].length);
        if (!this.visual) this.speech.say(`${o === this.me ? 'Tu ficha' : 'La ficha de tu pareja'} ${i + 1}: ${this.whereText(o, pos, { far: pos >= 0 && pos <= PARCHIS_LAST })}. Primero tira el dado.`, { interrupt: true });
    }

    async botStep(p) {
        const g = this.game, b = this.bots[p];
        if (!b) return;
        const key = this.stateKey();
        await this.think(g.phase === 'roll' ? 450 : 600);
        if (this.stopped || this.stateKey() !== key || g.current !== p || this.bots[p] !== b) return;
        await this.act(b.chooseTurn());
    }

    cancelPick() {
        if (this.sel == null) return false;
        this.sel = null;
        Board.render(this);
        this.notice('Ninguna ficha elegida.');
        return true;
    }

    // ── Teclado ───────────────────────────────────────
    gameKey(k, e) {
        if (/^[1-9]$/.test(k)) {
            e.preventDefault();
            const i = +k - 1;
            if (i < this.shown.pos[this.ctrlOf(this.me)].length) this.tapPiece(i);
            else { this.audio.error(); this.speech.say(`No tienes ficha ${i + 1}.`, { interrupt: true }); }
            return true;
        }
        if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); Board.moveCursor(k === 'ArrowRight' ? 1 : -1, 0); return true; }
        if (k === 'Enter' && this.sel != null && this.want?.kinds.has('play') && !e.target?.classList?.contains('slot') && !e.target?.classList?.contains('act')) { e.preventDefault(); this.input('play'); return true; }
        // Enter también tira el dado (la T se la puede quedar el lector de pantalla).
        if (k === 't' || (k === 'Enter' && this.want?.kinds.has('roll') && !e.target?.closest?.('button'))) {
            e.preventDefault();
            if (!this.input('roll')) { this.audio.error(); this.explainCant('roll'); }
            return true;
        }
        if (k === 'm') { e.preventDefault(); this.describeBoard(); return true; }
        if (k === 'p') { e.preventDefault(); this.describeDanger(); return true; }
        if (k === 'd') {
            e.preventDefault();
            const S = this.shown;
            if (this.leftDice().length > 1 && this.game.current === this.me && this.want?.kinds.has('slot')) { this.switchDie(); return true; }
            const word = this.two ? 'los dados' : 'el dado';
            this.speech.say(this.diceNow() || (S.turn === this.me ? `Todavía no has tirado ${word}.` : `${cap(this.v.name(S.turn))} todavía no ha tirado ${word}.`), { interrupt: true });
            return true;
        }
        if (k === 'a') { e.preventDefault(); if (!this.practice) { this.audio.error(); this.notice('Los consejos son para la partida de práctica.'); } else if (!this.input('advice')) this.advise(); return true; }
        return false;
    }

    explainCant(kind) {
        const g = this.game, me = this.me;
        let t = 'Ahora no.';
        if (g.phase !== 'gameOver' && g.current !== me) t = `No es tu turno: juega ${this.v.name(g.current)}.`;
        else if (kind === 'roll' && (g.phase === 'move' || g.phase === 'bonus')) t = g.phase === 'bonus' ? `Ya has tirado: cuenta ${g.bonus} con una ficha.` : 'Ya has tirado: elige qué ficha mueves.';
        this.notice(t);
    }
}
