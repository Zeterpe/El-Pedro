/* =============================================
   EL PEDRO — parchis.js
   Las reglas del Parchís, sin pantalla ni sonido.
   Un dado, cuatro colores y 68 casillas: sales
   con un 5, comes y cuentas 20, metes una ficha
   en la meta y cuentas 10. Individual o por parejas.
   Usa el azar con semilla de rules.js.
   ============================================= */
'use strict';

const PARCHIS_DEFAULT_RULES = {
    pieces: 4,            // fichas de cada jugador: 4 (las de siempre), 3 o 2 para partidas más cortas
    pairs: false,         // con 4 jugadores, por parejas: cada uno con el de enfrente
    eatCount: 20,         // al comer una ficha, cuentas 20 con otra (0: no se cuenta)
    metaCount: 10,        // al meter una ficha en la meta, cuentas 10 con otra (0: no se cuenta)
    sixSeven: true,       // con un 6 y ninguna ficha en casa, avanzas 7
    threeSixes: true,     // al tercer 6 seguido, la última ficha que has movido vuelve a casa
    openBarrier: true,    // con un 6, si tienes una barrera, hay que abrirla
    exact: true,          // a la meta se entra con la cuenta justa (false: si te pasas, rebotas)
};

/** Los colores en el orden del juego (y del tablero, en sentido contrario a las agujas del reloj). */
const PARCHIS_COLORS = ['amarillo', 'azul', 'rojo', 'verde'];
/** La casilla de salida de cada color. */
const PARCHIS_START = { amarillo: 5, azul: 22, rojo: 39, verde: 56 };
/** Los seguros: aquí no se come. Las salidas también lo son. */
const PARCHIS_SAFE = new Set([5, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63, 68]);
const PARCHIS_TRACK = 68;
/** Lo que ha avanzado una ficha: -1 en casa · 0 en su salida · 63 la última casilla antes de su pasillo · 64 a 70 el pasillo · 71 la meta. */
const PARCHIS_LAST = 63;
const PARCHIS_META = 71;
const PARCHIS_ACTIONS = new Set(['roll', 'move']);

/** El color de cada sitio: con 2 jugadores, colores enfrentados. */
function parchisColorOf(p, n) { return n === 2 ? ['amarillo', 'rojo'][p] : PARCHIS_COLORS[p]; }

/** La casilla (1 a 68) en la que está una ficha de ese color, o null si está en casa, en el pasillo o en la meta. */
function parchisSquare(color, pos) {
    return pos >= 0 && pos <= PARCHIS_LAST ? ((PARCHIS_START[color] - 1 + pos) % PARCHIS_TRACK) + 1 : null;
}

/** Cuánto tiene que avanzar una ficha de ese color desde su salida para llegar a la casilla sq (más de 63: no pasa por ahí). */
function parchisProgress(color, sq) { return (sq - PARCHIS_START[color] + PARCHIS_TRACK) % PARCHIS_TRACK; }

// ═══════════════════════════════════════════════════════
// La partida
// ═══════════════════════════════════════════════════════
//
// Fases: idle → roll (tira quien tiene el turno) → move (elige ficha)
//        → bonus (cuenta 20 o 10 con una ficha) → … → gameOver
//
// Cada acción devuelve los sucesos que ha provocado. En el Parchís
// todo está a la vista: no hay sucesos secretos.

class ParchisGame {
    constructor({ players, rules = {}, seed = Date.now() }) {
        this.rules = { ...PARCHIS_DEFAULT_RULES, ...rules };
        this.seed = seed >>> 0;
        this.rng = makeRng(this.seed);
        const n = players.length;
        this.players = players.map((p, i) => ({ name: p.name, index: i, color: parchisColorOf(i, n), pieces: Array.from({ length: this.rules.pieces }, () => ({ pos: -1, at: 0 })), done: false, wins: 0 }));
        this.round = 0;
        this.phase = 'idle';
        this.current = 0;
        this.turns = 0;              // cambia con cada jugada
        this.dice = null;            // lo que ha sacado quien tiene el turno
        this.steps = null;           // lo que avanza con ese dado (un 6 puede contar 7)
        this.sixes = 0;              // seises seguidos en este turno
        this.bonus = null;           // lo que se está contando ahora (20 o 10)
        this.queue = [];             // cuentas pendientes
        this.options = [];           // las jugadas que valen ahora
        this.lastMoved = null;       // { o, i }: la última ficha que ha movido quien tiene el turno
        this.stamp = 0;              // orden de llegada a cada casilla
        this.winners = null;
        this.history = [];
        this.nextDice = [];          // pruebas: lo que saldrá en el dado
        this._out = null;
    }

    get n() { return this.players.length; }
    get teamPlay() { return !!this.rules.pairs && this.n === 4; }
    team(p) { return this.teamPlay ? p % 2 : p; }
    partner(p) { return this.teamPlay ? (p + 2) % 4 : null; }
    partners(p) { return this.teamPlay ? [this.partner(p)] : []; }
    sides() { return this.teamPlay ? [[0, 2], [1, 3]] : this.players.map((_, i) => [i]); }
    /** De quién son las fichas que mueve p: las suyas o, si ya las ha metido todas, las de su pareja. */
    controlled(p) { return this.teamPlay && this.players[p].done ? this.partner(p) : p; }
    colorOf(p) { return this.players[p].color; }

    // ── Consultas ─────────────────────────────────────
    piecesOf(o) { return this.players[o].pieces; }
    homeCount(o) { return this.piecesOf(o).filter(pc => pc.pos < 0).length; }
    metaCount(o) { return this.piecesOf(o).filter(pc => pc.pos === PARCHIS_META).length; }
    squareOf(o, i) { return parchisSquare(this.colorOf(o), this.piecesOf(o)[i].pos); }

    /** Las fichas que hay en la casilla sq: [{ o, i, at }], por orden de llegada. */
    occupants(sq) {
        const out = [];
        this.players.forEach((pl, o) => pl.pieces.forEach((pc, i) => {
            if (parchisSquare(pl.color, pc.pos) === sq) out.push({ o, i, at: pc.at });
        }));
        return out.sort((a, b) => a.at - b.at);
    }

    /** Dos fichas en la misma casilla forman una barrera: nadie pasa por ella. */
    isBarrier(sq) { return this.occupants(sq).length >= 2; }

    /** Las fichas de o que forman una barrera de su color. */
    barrierPieces(o) {
        const at = new Map(), out = new Set();
        this.piecesOf(o).forEach((pc, i) => {
            const sq = parchisSquare(this.colorOf(o), pc.pos);
            if (sq == null) return;
            if (at.has(sq)) { out.add(at.get(sq)); out.add(i); } else at.set(sq, i);
        });
        return out;
    }

    /** ¿Puede la ficha i de o avanzar steps casillas? Devuelve la jugada o null. */
    tryMove(o, i, steps) {
        const color = this.colorOf(o), from = this.piecesOf(o)[i].pos;
        if (from < 0 || from >= PARCHIS_META) return null;
        const raw = from + steps;
        let to = raw;
        if (to > PARCHIS_META) {
            if (this.rules.exact) return null;
            to = PARCHIS_META - (to - PARCHIS_META);   // rebota en la meta
            if (to <= PARCHIS_LAST) return null;
        }
        // Las casillas por las que pasa: ninguna puede ser una barrera.
        for (let q = from + 1; q <= Math.min(raw - 1, PARCHIS_LAST); q++) {
            if (this.isBarrier(parchisSquare(color, q))) return null;
        }
        let sq = null, capture = null;
        if (to <= PARCHIS_LAST) {
            sq = parchisSquare(color, to);
            const occ = this.occupants(sq);
            if (occ.length >= 2) return null;
            const x = occ[0];
            // Una ficha sola de otro color, fuera de los seguros: te la comes.
            if (x && this.team(x.o) !== this.team(o) && !PARCHIS_SAFE.has(sq)) capture = { o: x.o, i: x.i };
        }
        return { o, i, from, to, sq, capture, amount: steps, meta: to === PARCHIS_META, out: false };
    }

    /** Sacar una ficha de casa con un 5 (o null si la salida está cerrada por una barrera tuya). */
    exitMove(o) {
        const i = this.piecesOf(o).findIndex(pc => pc.pos < 0);
        if (i < 0) return null;
        const sq = PARCHIS_START[this.colorOf(o)];
        const occ = this.occupants(sq);
        let capture = null;
        if (occ.length >= 2) {
            // Salida llena: te comes la última ficha que llegó de otro color. Si las dos son tuyas (o de tu pareja), no puedes salir.
            const others = occ.filter(x => this.team(x.o) !== this.team(o));
            if (!others.length) return null;
            const v = others[others.length - 1];
            capture = { o: v.o, i: v.i };
        }
        return { o, i, from: -1, to: 0, sq, capture, amount: 5, meta: false, out: true };
    }

    /** Lo que avanza p con el dado value. */
    stepsFor(p, value) {
        return value === 6 && this.rules.sixSeven && this.homeCount(this.controlled(p)) === 0 ? 7 : value;
    }

    /** Las jugadas que tiene p con el dado value. */
    rollOptions(p, value) {
        const o = this.controlled(p);
        if (value === 5 && this.homeCount(o) > 0) {
            const ex = this.exitMove(o);
            if (ex) return [ex];   // con un 5, si puedes sacar, hay que sacar
        }
        const steps = this.stepsFor(p, value);
        let opts = this.piecesOf(o).map((_, i) => this.tryMove(o, i, steps)).filter(Boolean);
        if (value === 6 && this.rules.openBarrier) {
            const bar = this.barrierPieces(o);
            const open = opts.filter(m => bar.has(m.i));
            if (open.length) opts = open;
        }
        return opts;
    }

    /** Las fichas con las que p puede contar amount (20 al comer, 10 al llegar a la meta). */
    bonusOptions(p, amount) {
        const o = this.controlled(p);
        return this.piecesOf(o).map((_, i) => this.tryMove(o, i, amount)).filter(Boolean);
    }

    /** Fichas de otros que pueden comerse a las fichas de o con una tirada: [{ i, sq, by: { o, i }, d }]. */
    threats(o) {
        const out = [];
        this.piecesOf(o).forEach((pc, i) => {
            const sq = parchisSquare(this.colorOf(o), pc.pos);
            if (sq == null || PARCHIS_SAFE.has(sq) || this.occupants(sq).length > 1) return;
            this.players.forEach((pl, q) => {
                if (this.team(q) === this.team(o)) return;
                const reach = this.rules.sixSeven && this.homeCount(q) === 0 ? 7 : 6;
                const need = parchisProgress(pl.color, sq);
                if (need > PARCHIS_LAST) return;
                pl.pieces.forEach((qc, j) => {
                    if (qc.pos < 0 || qc.pos > PARCHIS_LAST) return;
                    const d = need - qc.pos;
                    if (d >= 1 && d <= reach) out.push({ i, sq, by: { o: q, i: j }, d });
                });
            });
        });
        return out.sort((a, b) => a.d - b.d);
    }

    /** Fichas de otros que las de o pueden comerse con una tirada: [{ i, sq, prey: { o, i }, d }]. */
    chances(o) {
        const out = [];
        const color = this.colorOf(o);
        const reach = this.rules.sixSeven && this.homeCount(o) === 0 ? 7 : 6;
        this.players.forEach((pl, q) => {
            if (this.team(q) === this.team(o)) return;
            pl.pieces.forEach((qc, j) => {
                const sq = parchisSquare(pl.color, qc.pos);
                if (sq == null || PARCHIS_SAFE.has(sq) || this.occupants(sq).length > 1) return;
                const need = parchisProgress(color, sq);
                if (need > PARCHIS_LAST) return;
                this.piecesOf(o).forEach((pc, i) => {
                    if (pc.pos < 0 || pc.pos > PARCHIS_LAST) return;
                    const d = need - pc.pos;
                    if (d >= 1 && d <= reach) out.push({ i, sq, prey: { o: q, i: j }, d });
                });
            });
        });
        return out.sort((a, b) => a.d - b.d);
    }

    /** Lo que un jugador puede hacer ahora mismo. */
    legal(p) {
        if (this.current !== p) return [];
        if (this.phase === 'roll') return ['roll'];
        if (this.phase === 'move' || this.phase === 'bonus') return ['move'];
        return [];
    }

    /** Estado público (en el Parchís todo está a la vista). */
    view() {
        return {
            phase: this.phase, round: this.round, current: this.current, turns: this.turns,
            dice: this.dice, steps: this.steps, sixes: this.sixes, bonus: this.bonus, queue: this.queue.slice(),
            options: this.options.map(m => ({ ...m, capture: m.capture && { ...m.capture } })),
            lastMoved: this.lastMoved, winners: this.winners,
            players: this.players.map(pl => ({ name: pl.name, color: pl.color, done: pl.done, wins: pl.wins, pieces: pl.pieces.map(pc => ({ pos: pc.pos, at: pc.at })) })),
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

    // ── La partida ────────────────────────────────────
    startRound() {
        return this._run(() => {
            if (this.phase !== 'idle') return 'La partida ya ha empezado.';
            this.round = 1;
            for (const pl of this.players) { pl.pieces = Array.from({ length: this.rules.pieces }, () => ({ pos: -1, at: 0 })); pl.done = false; }
            this.current = this.rng.int(this.n);
            this.sixes = 0; this.dice = null; this.steps = null; this.queue = []; this.options = []; this.lastMoved = null; this.winners = null;
            this._emit({ t: 'round', round: 1, first: this.current, colors: this.players.map(pl => pl.color), pieces: this.rules.pieces, teams: this.teamPlay });
            this.phase = 'roll';
            this._emit({ t: 'turn', p: this.current, again: false });
            return null;
        });
    }

    act(a) {
        return this._run(() => {
            if (!a || !PARCHIS_ACTIONS.has(a.type)) return 'Acción no válida.';
            if (!Number.isInteger(a.p) || !this.players[a.p]) return 'Ese jugador no existe.';
            return this['_' + a.type](a);
        });
    }

    _roll({ p }) {
        if (this.phase === 'gameOver') return 'La partida ha terminado.';
        if (p !== this.current) return 'No es tu turno.';
        if (this.phase !== 'roll') return 'Ya has tirado: elige qué ficha mueves.';
        const forced = this.nextDice.length ? this.nextDice.shift() : null;
        const value = forced >= 1 && forced <= 6 ? forced : this.rng.int(6) + 1;
        this.turns++;
        this.dice = value;
        this.sixes = value === 6 ? this.sixes + 1 : 0;
        this.steps = this.stepsFor(p, value);
        this._emit({ t: 'roll', p, value, steps: this.steps, sixes: this.sixes });
        if (value === 6 && this.sixes >= 3 && this.rules.threeSixes) { this._threeSixes(p); return null; }
        this.options = this.rollOptions(p, value);
        if (!this.options.length) {
            this._emit({ t: 'noMove', p, value });
            this._next(p);
            return null;
        }
        this.phase = 'move';
        return null;
    }

    _move({ p, o, i }) {
        if (this.phase === 'gameOver') return 'La partida ha terminado.';
        if (p !== this.current) return 'No es tu turno.';
        if (this.phase === 'roll') return 'Primero tira el dado.';
        if (this.phase !== 'move' && this.phase !== 'bonus') return 'Ahora no puedes mover.';
        if (o == null) o = this.controlled(p);
        const m = this.options.find(x => x.o === o && x.i === i);
        if (!m) return 'Esa ficha no se puede mover.';
        this.turns++;
        this._apply(p, m, this.phase === 'bonus' ? 'bonus' : m.out ? 'out' : 'roll');
        if (this.phase !== 'gameOver') this._continue(p);
        return null;
    }

    _apply(p, m, kind) {
        const pc = this.piecesOf(m.o)[m.i];
        pc.pos = m.to;
        pc.at = ++this.stamp;
        this.lastMoved = { o: m.o, i: m.i };
        this.options = [];
        this._emit({ t: 'move', p, o: m.o, i: m.i, from: m.from, to: m.to, sq: m.sq, kind, amount: m.amount });
        if (m.capture) {
            const v = this.piecesOf(m.capture.o)[m.capture.i];
            v.pos = -1;
            v.at = 0;
            this._emit({ t: 'capture', p, o: m.o, i: m.i, victim: { ...m.capture }, sq: m.sq, count: this.rules.eatCount });
            if (this.rules.eatCount) this.queue.push(this.rules.eatCount);
        }
        if (m.to === PARCHIS_META) {
            const pl = this.players[m.o], mate = this.partner(m.o);
            const done = pl.pieces.every(x => x.pos === PARCHIS_META);
            const over = done && (!this.teamPlay || this.players[mate].done);
            this._emit({ t: 'meta', p, o: m.o, i: m.i, count: over ? 0 : this.rules.metaCount, left: pl.pieces.filter(x => x.pos !== PARCHIS_META).length });
            if (done) {
                pl.done = true;
                this._emit({ t: 'finished', p: m.o, partner: mate });
                if (over) return this._gameOver(this.teamPlay ? [m.o, mate].sort((a, b) => a - b) : [m.o]);
            }
            // Al llegar a la meta se cuentan 10. Si ya las ha metido todas, se cuentan con las de la pareja.
            if (this.rules.metaCount) this.queue.push(this.rules.metaCount);
        }
        return null;
    }

    /** Después de mover: las cuentas pendientes y, si no queda nada, el siguiente turno. */
    _continue(p) {
        while (this.queue.length) {
            const amount = this.queue.shift();
            const opts = this.bonusOptions(p, amount);
            if (!opts.length) { this._emit({ t: 'bonusLost', p, amount }); continue; }
            this.phase = 'bonus';
            this.bonus = amount;
            this.options = opts;
            this._emit({ t: 'bonus', p, amount });
            return;
        }
        this.bonus = null;
        this._next(p);
    }

    /** Con un 6 se vuelve a tirar; si no, le toca al siguiente. */
    _next(p) {
        this.options = [];
        this.bonus = null;
        if (this.dice === 6) {
            this.phase = 'roll';
            this._emit({ t: 'turn', p, again: true });
            return;
        }
        this._pass();
    }

    _pass() {
        this.current = (this.current + 1) % this.n;
        this.sixes = 0; this.dice = null; this.steps = null; this.lastMoved = null; this.queue = []; this.options = []; this.bonus = null;
        this.phase = 'roll';
        this._emit({ t: 'turn', p: this.current, again: false });
    }

    /** Tercer 6 seguido: la última ficha que has movido vuelve a casa (si no está ya en el pasillo) y pasa el turno. */
    _threeSixes(p) {
        const lm = this.lastMoved;
        const pc = lm && this.piecesOf(lm.o)[lm.i];
        if (pc && pc.pos >= 0 && pc.pos <= PARCHIS_LAST) {
            const from = pc.pos, sq = parchisSquare(this.colorOf(lm.o), from);
            pc.pos = -1; pc.at = 0;
            this._emit({ t: 'penalty', p, o: lm.o, i: lm.i, from, sq });
        } else this._emit({ t: 'penalty', p, o: null, i: null });
        this._pass();
    }

    _gameOver(winners) {
        this.winners = winners;
        for (const w of winners) this.players[w].wins++;
        this.phase = 'gameOver';
        this.options = [];
        this.queue = [];
        this._emit({ t: 'gameOver', winners: winners.slice(), teams: this.teamPlay });
        return null;
    }
}

/** El Parchís tal como lo ve un invitado de una sala: la mesa que manda el anfitrión (no hay nada oculto). */
class ParchisMirror {
    constructor({ names, rules }) {
        this.rules = { ...PARCHIS_DEFAULT_RULES, ...rules };
        const n = names.length;
        this.players = names.map((name, index) => ({ name, index, color: parchisColorOf(index, n), pieces: Array.from({ length: this.rules.pieces }, () => ({ pos: -1, at: 0 })), done: false, wins: 0 }));
        this.phase = 'idle'; this.round = 0; this.current = 0; this.turns = 0;
        this.dice = null; this.steps = null; this.sixes = 0; this.bonus = null; this.queue = []; this.options = [];
        this.lastMoved = null; this.winners = null;
    }

    setView(v) {
        this.phase = v.phase; this.round = v.round; this.current = v.current; this.turns = v.turns;
        this.dice = v.dice; this.steps = v.steps; this.sixes = v.sixes; this.bonus = v.bonus; this.queue = v.queue.slice();
        this.options = v.options.map(m => ({ ...m }));
        this.lastMoved = v.lastMoved; this.winners = v.winners;
        v.players.forEach((p, i) => {
            const pl = this.players[i];
            pl.done = p.done; pl.wins = p.wins;
            pl.pieces = p.pieces.map(pc => ({ ...pc }));
        });
    }

    observe() { }
}

for (const m of ['team', 'partner', 'partners', 'sides', 'controlled', 'colorOf', 'piecesOf', 'homeCount', 'metaCount', 'squareOf', 'occupants', 'isBarrier', 'barrierPieces', 'tryMove', 'exitMove', 'stepsFor', 'rollOptions', 'bonusOptions', 'threats', 'chances', 'legal']) {
    ParchisMirror.prototype[m] = ParchisGame.prototype[m];
}
for (const g of ['n', 'teamPlay']) {
    Object.defineProperty(ParchisMirror.prototype, g, Object.getOwnPropertyDescriptor(ParchisGame.prototype, g));
}

// Para las pruebas con Node (en el navegador no hace nada).
if (typeof module !== 'undefined') {
    const R = require('./rules.js');
    Object.assign(globalThis, { makeRng: R.makeRng });
    module.exports = {
        PARCHIS_DEFAULT_RULES, PARCHIS_COLORS, PARCHIS_START, PARCHIS_SAFE, PARCHIS_TRACK, PARCHIS_LAST, PARCHIS_META,
        parchisColorOf, parchisSquare, parchisProgress, ParchisGame, ParchisMirror,
    };
}
