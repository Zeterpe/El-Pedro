/* =============================================
   EL PEDRO — trivial.js
   Las reglas del Trivial, sin pantalla ni sonido.
   Un tablero en forma de rueda: el anillo con los
   seis quesitos, seis radios y el centro. Tiras el
   dado, eliges adónde vas y contestas una pregunta
   de cuatro respuestas de esa categoría. En cada
   casilla de quesito, si aciertas, te lo llevas.
   Con todos, al centro: la pregunta final.
   Individual o por equipos.
   Usa el azar con semilla de rules.js.
   ============================================= */
'use strict';

const TRIVIAL_DEFAULT_RULES = {
    wedges: 6,              // quesitos que hay que conseguir: 6 (los de siempre), 4 o 3 para partidas más cortas
    teams: false,           // con 4 o 6 jugadores, por equipos: sitios alternos, una ficha por equipo
    hubFinal: true,         // con los quesitos, hay que llegar al centro y acertar la pregunta final (false: ganas al conseguirlos)
    finalPick: 'rivales',   // quién elige la categoría de la pregunta final: rivales · azar · tu
    rollAgain: true,        // si aciertas, vuelves a tirar
    level: 'todas',         // las preguntas: todas · faciles · dificiles
};

/** Las seis categorías, en el orden del tablero (y de los quesitos). */
const TRIVIAL_CATS = ['geografia', 'espectaculos', 'historia', 'arte', 'ciencia', 'deportes'];
const TRIVIAL_CAT = {
    geografia: { name: 'Geografía', short: 'Geografía', color: 'azul' },
    espectaculos: { name: 'Espectáculos', short: 'Espectáculos', color: 'rosa' },
    historia: { name: 'Historia', short: 'Historia', color: 'amarillo' },
    arte: { name: 'Arte y Literatura', short: 'Arte', color: 'marrón' },
    ciencia: { name: 'Ciencias y Naturaleza', short: 'Ciencia', color: 'verde' },
    deportes: { name: 'Deportes y Pasatiempos', short: 'Deportes', color: 'naranja' },
};
const TRIVIAL_ACTIONS = new Set(['roll', 'move', 'pick', 'answer']);

// ═══════════════════════════════════════════════════════
// El tablero
// ═══════════════════════════════════════════════════════
//
// 73 casillas: el centro (0), el anillo (1 a 42) y los seis radios (43 a 72).
// En el anillo, cada 7 casillas hay un quesito: el quesito k está en la casilla
// 1 + 7k. Entre dos quesitos hay seis casillas: cuatro de categoría y dos de
// «vuelve a tirar». Cada radio va de su quesito al centro con cinco casillas,
// una de cada categoría menos la del quesito.

const TRIVIAL_HUB = 0;
const TRIVIAL_RING = 42;
const tvRing = r => 1 + (((r % TRIVIAL_RING) + TRIVIAL_RING) % TRIVIAL_RING);
/** La casilla j (1 junto al quesito, 5 junto al centro) del radio k. */
const tvSpoke = (k, j) => 43 + k * 5 + (j - 1);

const TRIVIAL_BOARD = (() => {
    const C = TRIVIAL_CATS, nodes = [];
    nodes[TRIVIAL_HUB] = { id: TRIVIAL_HUB, kind: 'hub', cat: null, nb: [] };
    for (let r = 0; r < TRIVIAL_RING; r++) {
        const k = Math.floor(r / 7), pos = r % 7, id = tvRing(r);
        let kind = 'cat', cat = null;
        if (pos === 0) { kind = 'hq'; cat = C[k]; }
        else if (pos === 2 || pos === 5) kind = 'roll';
        else cat = C[(k + { 1: 3, 3: 5, 4: 2, 6: 4 }[pos]) % 6];
        nodes[id] = { id, kind, cat, zone: 'ring', r, k, pos, nb: [tvRing(r - 1), tvRing(r + 1)] };
        if (pos === 0) nodes[id].nb.push(tvSpoke(k, 1));
    }
    for (let k = 0; k < 6; k++) for (let j = 1; j <= 5; j++) {
        const id = tvSpoke(k, j);
        nodes[id] = { id, kind: 'cat', cat: C[(k + j) % 6], zone: 'spoke', k, j, nb: [j === 1 ? tvRing(7 * k) : tvSpoke(k, j - 1), j === 5 ? TRIVIAL_HUB : tvSpoke(k, j + 1)] };
        if (j === 5) nodes[TRIVIAL_HUB].nb.push(id);
    }
    return nodes;
})();

/** La casilla del quesito de una categoría. */
const trivialHq = cat => tvRing(7 * TRIVIAL_CATS.indexOf(cat));

/** Distancia (en casillas) de cada casilla a todas las demás. */
const TRIVIAL_DIST = TRIVIAL_BOARD.map(src => {
    const d = new Array(TRIVIAL_BOARD.length).fill(Infinity);
    d[src.id] = 0;
    const q = [src.id];
    while (q.length) {
        const a = q.shift();
        for (const b of TRIVIAL_BOARD[a].nb) if (d[b] === Infinity) { d[b] = d[a] + 1; q.push(b); }
    }
    return d;
});

/**
 * Adónde se puede llegar desde from con steps casillas exactas, sin volver atrás.
 * Devuelve [{ to, path }] (path sin la casilla de salida), una vez por destino.
 */
function trivialMoves(from, steps) {
    const out = new Map();
    const walk = (at, prev, path) => {
        if (path.length === steps) { if (!out.has(at)) out.set(at, { to: at, path: path.slice() }); return; }
        for (const nb of TRIVIAL_BOARD[at].nb) {
            if (nb === prev) continue;
            path.push(nb);
            walk(nb, at, path);
            path.pop();
        }
    };
    walk(from, null, []);
    return [...out.values()];
}

// ═══════════════════════════════════════════════════════
// La partida
// ═══════════════════════════════════════════════════════
//
// Fases: idle → roll (tira quien tiene el turno) → move (elige adónde va)
//        → [pick (alguien elige la categoría)] → answer (contesta) → … → gameOver
//
// Cada acción devuelve los sucesos que ha provocado. La respuesta correcta
// no sale en la mesa (view) ni en la pregunta: solo cuando se contesta.

class TrivialGame {
    constructor({ players, rules = {}, seed = Date.now(), bank = null, seen = [] }) {
        this.rules = { ...TRIVIAL_DEFAULT_RULES, ...rules };
        this.seed = seed >>> 0;
        this.rng = makeRng(this.seed);
        this.bank = bank || (typeof globalThis !== 'undefined' && globalThis.TRIVIAL_BANK) || {};
        this.players = players.map((p, i) => ({ name: p.name, index: i, wins: 0 }));
        this.tokens = this.sides().map(members => ({ at: TRIVIAL_HUB, wedges: [], members, right: 0, wrong: 0, missed: {} }));
        this.round = 0;
        this.phase = 'idle';
        this.current = 0;
        this.turns = 0;              // cambia con cada jugada
        this.dice = null;
        this.options = [];           // adónde se puede ir: [{ to, path }]
        this.pick = null;            // quién elige la categoría: { by, for, final }
        this.q = null;               // la pregunta que se está contestando (sin la respuesta)
        this.answerIdx = null;       // la respuesta correcta (solo aquí)
        this.last = null;            // la última respuesta: { choice, correct, ok }
        this.winners = null;
        this.history = [];
        this.nextDice = [];          // pruebas: lo que saldrá en el dado
        this.nextChoice = [];        // pruebas: el orden de las respuestas (la correcta va donde diga)
        this._out = null;
        this.decks = {};
        const seenSet = new Set(seen);
        for (const cat of TRIVIAL_CATS) this.decks[cat] = this._deck(cat, seenSet);
    }

    get n() { return this.players.length; }
    get teamPlay() { return !!this.rules.teams && this.n >= 4 && this.n % 2 === 0; }
    team(p) { return this.teamPlay ? p % 2 : p; }
    /** La ficha de p (en equipos, la de su equipo). */
    side(p) { return this.team(p); }
    partners(p) { return this.teamPlay ? this.players.map((_, q) => q).filter(q => q !== p && q % 2 === p % 2) : []; }
    sides() { return this.teamPlay ? [[0, 2, 4].filter(p => p < this.n), [1, 3, 5].filter(p => p < this.n)] : this.players.map((_, i) => [i]); }
    tokenOf(p) { return this.tokens[this.side(p)]; }
    /** ¿Tiene p todos los quesitos que hacen falta? */
    hasAll(p) { return this.tokenOf(p).wedges.length >= this.rules.wedges; }
    /** Las categorías de quesito que le faltan a p. */
    missing(p) { const w = this.tokenOf(p).wedges; return TRIVIAL_CATS.filter(c => !w.includes(c)); }
    /** Quien tiene que hacer algo ahora (en la elección de la final, puede ser un rival). */
    get actor() { return this.phase === 'pick' && this.pick ? this.pick.by : this.current; }

    /** Lo que un jugador puede hacer ahora mismo. */
    legal(p) {
        if (this.actor !== p) return [];
        return { roll: ['roll'], move: ['move'], pick: ['pick'], answer: ['answer'] }[this.phase] || [];
    }

    // ── Las preguntas ─────────────────────────────────
    _pool(cat) {
        const list = this.bank[cat] || [];
        const lv = this.rules.level;
        const ok = q => lv === 'faciles' ? (q[5] || 1) === 1 : lv === 'dificiles' ? (q[5] || 1) >= 2 : true;
        const idx = list.map((q, i) => ok(q) ? i : -1).filter(i => i >= 0);
        return idx.length ? idx : list.map((_, i) => i);
    }

    /** Las preguntas de una categoría, barajadas; las que ya han salido en otras partidas, al final. */
    _deck(cat, seen = new Set()) {
        const all = this.rng.shuffle(this._pool(cat));
        const fresh = all.filter(i => !seen.has(`${cat}:${i}`)), old = all.filter(i => seen.has(`${cat}:${i}`));
        return fresh.concat(old);
    }

    _draw(cat) {
        if (!this.decks[cat].length) this.decks[cat] = this._deck(cat);
        const i = this.decks[cat].shift();
        return { i, q: (this.bank[cat] || [])[i] };
    }

    // ── La mesa ───────────────────────────────────────
    view() {
        return {
            phase: this.phase, round: this.round, current: this.current, turns: this.turns, dice: this.dice,
            options: this.options.map(m => ({ to: m.to, path: m.path.slice() })),
            pick: this.pick && { ...this.pick }, q: this.q && { ...this.q, options: this.q.options.slice() },
            last: this.last && { ...this.last }, winners: this.winners,
            tokens: this.tokens.map(t => ({ at: t.at, wedges: t.wedges.slice(), members: t.members.slice(), right: t.right, wrong: t.wrong, missed: { ...t.missed } })),
            players: this.players.map(pl => ({ name: pl.name, wins: pl.wins })),
        };
    }

    // ── Sucesos ───────────────────────────────────────
    _emit(e) {
        this.history.push(e);
        if (this.history.length > 600) this.history.splice(0, 200);
        if (this._out) this._out.push(e);
    }

    _run(fn) {
        const out = this._out = [];
        try {
            const err = fn();
            if (err) return { ok: false, error: err, events: out };
            return { ok: true, events: out };
        } finally { this._out = null; }
    }

    startRound() {
        return this._run(() => {
            if (this.phase !== 'idle') return 'La partida ya ha empezado.';
            this.round = 1;
            for (const t of this.tokens) { t.at = TRIVIAL_HUB; t.wedges = []; t.right = 0; t.wrong = 0; t.missed = {}; }
            this.current = this.rng.int(this.n);
            this.dice = null; this.options = []; this.pick = null; this.q = null; this.last = null; this.winners = null;
            this._emit({ t: 'round', round: 1, first: this.current, teams: this.teamPlay, wedges: this.rules.wedges });
            this.phase = 'roll';
            this._emit({ t: 'turn', p: this.current, again: false });
            return null;
        });
    }

    act(a) {
        return this._run(() => {
            if (!a || !TRIVIAL_ACTIONS.has(a.type)) return 'Acción no válida.';
            if (!Number.isInteger(a.p) || !this.players[a.p]) return 'Ese jugador no existe.';
            if (this.phase === 'gameOver') return 'La partida ha terminado.';
            return this['_' + a.type](a);
        });
    }

    _roll({ p }) {
        if (p !== this.current) return 'No es tu turno.';
        if (this.phase !== 'roll') return 'Ahora no toca tirar el dado.';
        const forced = this.nextDice.length ? this.nextDice.shift() : null;
        const value = forced >= 1 && forced <= 6 ? forced : this.rng.int(6) + 1;
        this.turns++;
        this.dice = value;
        this.options = trivialMoves(this.tokenOf(p).at, value);
        this._emit({ t: 'roll', p, value });
        this.phase = 'move';
        return null;
    }

    _move({ p, to }) {
        if (p !== this.current) return 'No es tu turno.';
        if (this.phase !== 'move') return this.phase === 'roll' ? 'Primero tira el dado.' : 'Ahora no puedes mover.';
        const m = this.options.find(x => x.to === to);
        if (!m) return 'No puedes llegar a esa casilla con ese dado.';
        this.turns++;
        const tok = this.tokenOf(p), from = tok.at;
        tok.at = m.to;
        this.options = [];
        this._emit({ t: 'move', p, side: this.side(p), from, to: m.to, path: m.path.slice() });
        const node = TRIVIAL_BOARD[m.to];
        if (node.kind === 'roll') {
            this.phase = 'roll';
            this._emit({ t: 'turn', p, again: true, why: 'square' });
            return null;
        }
        if (node.kind === 'hub') {
            if (this.hasAll(p) && this.rules.hubFinal) {
                const how = this.rules.finalPick;
                if (how === 'azar') return this._ask(p, this.rng.pick(TRIVIAL_CATS), 'final');
                const by = how === 'tu' ? p : this.finalChooser(p);
                return this._startPick(p, by, true);
            }
            return this._startPick(p, p, false);
        }
        return this._ask(p, node.cat, node.kind === 'hq' ? 'hq' : 'normal');
    }

    /** Quien elige la categoría de la final de p: el siguiente rival en el orden de la mesa. */
    finalChooser(p) {
        for (let k = 1; k < this.n; k++) {
            const q = (p + k) % this.n;
            if (this.team(q) !== this.team(p)) return q;
        }
        return p;
    }

    _startPick(p, by, final) {
        this.phase = 'pick';
        this.pick = { by, for: p, final };
        this._emit({ t: 'pickCat', p, by, final });
        return null;
    }

    _pick({ p, cat }) {
        if (this.phase !== 'pick' || !this.pick) return 'Ahora no se elige categoría.';
        if (p !== this.pick.by) return 'No te toca elegir la categoría.';
        if (!TRIVIAL_CATS.includes(cat)) return 'Esa categoría no existe.';
        this.turns++;
        const { for: who, final } = this.pick;
        this.pick = null;
        this._emit({ t: 'catPicked', p, for: who, cat, final });
        return this._ask(who, cat, final ? 'final' : 'hub');
    }

    /** Hace una pregunta de cat a p. kind: normal · hq (casilla de quesito) · hub (en el centro) · final. */
    _ask(p, cat, kind) {
        const { i, q } = this._draw(cat);
        if (!q) return 'No hay preguntas de esa categoría.';
        const order = this.rng.shuffle([1, 2, 3, 4]);
        const forced = this.nextChoice.length ? this.nextChoice.shift() : null;
        if (forced != null) { const at = order.indexOf(1); [order[at], order[forced]] = [order[forced], order[at]]; }
        const tok = this.tokenOf(p);
        this.answerIdx = order.indexOf(1);
        this.q = { p, side: this.side(p), cat, kind, qid: `${cat}:${i}`, text: q[0], options: order.map(k => q[k]), level: q[5] || 1, wedge: kind === 'hq' && !tok.wedges.includes(cat) };
        this.phase = 'answer';
        this._emit({ t: 'question', ...this.q, options: this.q.options.slice() });
        return null;
    }

    _answer({ p, choice }) {
        if (this.phase !== 'answer' || !this.q) return 'Ahora no hay ninguna pregunta.';
        if (p !== this.current) return 'Esta pregunta no es para ti.';
        if (!Number.isInteger(choice) || choice < 0 || choice > 3) return 'Elige una de las cuatro respuestas.';
        this.turns++;
        const q = this.q, tok = this.tokenOf(p);
        const ok = choice === this.answerIdx;
        this.last = { choice, correct: this.answerIdx, ok, qid: q.qid };
        this._emit({ t: 'answer', p, side: q.side, cat: q.cat, kind: q.kind, qid: q.qid, choice, correct: this.answerIdx, ok, answerText: q.options[this.answerIdx] });
        this.q = null;
        this.answerIdx = null;
        if (ok) tok.right++; else { tok.wrong++; tok.missed[q.cat] = (tok.missed[q.cat] || 0) + 1; }
        if (!ok) { this._pass(); return null; }
        if (q.kind === 'final') return this._gameOver(tok.members.slice());
        if (q.wedge) {
            tok.wedges.push(q.cat);
            const all = tok.wedges.length >= this.rules.wedges;
            this._emit({ t: 'wedge', p, side: q.side, cat: q.cat, count: tok.wedges.length, all });
            if (all && !this.rules.hubFinal) return this._gameOver(tok.members.slice());
        }
        if (this.rules.rollAgain) {
            this.phase = 'roll';
            this._emit({ t: 'turn', p, again: true, why: 'right' });
        } else this._pass();
        return null;
    }

    _pass() {
        this.current = (this.current + 1) % this.n;
        this.dice = null; this.options = []; this.pick = null; this.q = null;
        this.phase = 'roll';
        this._emit({ t: 'turn', p: this.current, again: false });
    }

    _gameOver(winners) {
        this.winners = winners.sort((a, b) => a - b);
        for (const w of this.winners) this.players[w].wins++;
        this.phase = 'gameOver';
        this.options = [];
        this._emit({ t: 'gameOver', winners: this.winners.slice(), teams: this.teamPlay });
        return null;
    }
}

/** El Trivial tal como lo ve un invitado de una sala: la mesa que manda el anfitrión (sin la respuesta correcta). */
class TrivialMirror {
    constructor({ names, rules }) {
        this.rules = { ...TRIVIAL_DEFAULT_RULES, ...rules };
        this.players = names.map((name, index) => ({ name, index, wins: 0 }));
        this.tokens = this.sides().map(members => ({ at: TRIVIAL_HUB, wedges: [], members, right: 0, wrong: 0, missed: {} }));
        this.phase = 'idle'; this.round = 0; this.current = 0; this.turns = 0; this.dice = null;
        this.options = []; this.pick = null; this.q = null; this.last = null; this.winners = null;
    }

    setView(v) {
        this.phase = v.phase; this.round = v.round; this.current = v.current; this.turns = v.turns; this.dice = v.dice;
        this.options = v.options.map(m => ({ to: m.to, path: m.path.slice() }));
        this.pick = v.pick && { ...v.pick };
        this.q = v.q && { ...v.q, options: v.q.options.slice() };
        this.last = v.last && { ...v.last };
        this.winners = v.winners;
        this.tokens = v.tokens.map(t => ({ ...t, wedges: t.wedges.slice(), members: t.members.slice(), missed: { ...t.missed } }));
        v.players.forEach((p, i) => { this.players[i].wins = p.wins; });
    }

    observe() { }
}

for (const m of ['team', 'side', 'partners', 'sides', 'tokenOf', 'hasAll', 'missing', 'legal', 'finalChooser']) {
    TrivialMirror.prototype[m] = TrivialGame.prototype[m];
}
for (const g of ['n', 'teamPlay', 'actor']) {
    Object.defineProperty(TrivialMirror.prototype, g, Object.getOwnPropertyDescriptor(TrivialGame.prototype, g));
}

// Para las pruebas con Node (en el navegador no hace nada).
if (typeof module !== 'undefined') {
    const R = require('./rules.js');
    Object.assign(globalThis, { makeRng: R.makeRng });
    module.exports = {
        TRIVIAL_DEFAULT_RULES, TRIVIAL_CATS, TRIVIAL_CAT, TRIVIAL_BOARD, TRIVIAL_DIST, TRIVIAL_HUB, TRIVIAL_RING,
        tvRing, tvSpoke, trivialHq, trivialMoves, TrivialGame, TrivialMirror,
    };
}
