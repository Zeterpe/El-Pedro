/* =============================================
   EL PEDRO — virus.js
   Las reglas del Virus, sin pantalla ni sonido.
   Cada uno construye un cuerpo de cuatro órganos
   de distinto color mientras los demás lo infectan,
   se lo roban o se lo cambian. Gana quien tenga
   antes cuatro órganos sanos.
   Usa el azar con semilla de rules.js.
   ============================================= */
'use strict';

const VIRUS_DEFAULT_RULES = {
    pairs: false,             // con 4 o 6 jugadores, por parejas: cada uno con el de enfrente
    winsToWin: 1,             // rondas ganadas para ganar la partida (0 = sin límite)
};

const VIRUS_HAND = 3;
const VIRUS_TO_WIN = 4;
/** Los cuatro colores, y el multicolor que vale por todos. */
const VIRUS_COLORS = ['rojo', 'verde', 'azul', 'amarillo'];
const VIRUS_TREATMENTS = ['trasplante', 'ladron', 'contagio', 'guante', 'error'];
/** Cuántas cartas hay de cada tratamiento. */
const VIRUS_TREATMENT_COUNT = { trasplante: 3, ladron: 3, contagio: 2, guante: 1, error: 1 };
const VIRUS_ACTIONS = new Set(['play', 'discard']);

/** El mazo de 68 cartas: 21 órganos, 17 virus, 20 medicinas y 10 tratamientos. */
function makeVirusDeck() {
    const cards = [];
    let id = 0;
    const add = (kind, color, n, treat) => { for (let i = 0; i < n; i++) cards.push(treat ? { id: id++, kind, treat } : { id: id++, kind, color }); };
    for (const c of VIRUS_COLORS) { add('organo', c, 5); add('virus', c, 4); add('medicina', c, 4); }
    add('organo', 'multi', 1); add('virus', 'multi', 1); add('medicina', 'multi', 4);
    for (const t of VIRUS_TREATMENTS) add('tratamiento', null, VIRUS_TREATMENT_COUNT[t], t);
    return cards;
}

/** ¿Una carta de color a vale sobre una de color b? El multicolor vale con todos. */
const virusMatch = (a, b) => a === 'multi' || b === 'multi' || a === b;

/** Cómo está un órgano: libre, infectado, vacunado o inmune. */
function organState(o) {
    if (!o.items.length) return 'libre';
    if (o.items[0].kind === 'virus') return 'infectado';
    return o.items.length >= 2 ? 'inmune' : 'vacunado';
}
const organHealthy = o => organState(o) !== 'infectado';

/** Lo que hace una medicina o un virus sobre un órgano, o null si no vale. */
function virusEffect(card, o) {
    const st = organState(o), top = o.items[o.items.length - 1];
    if (st === 'inmune') return null;
    if (card.kind === 'virus') {
        if (st === 'libre') return virusMatch(card.color, o.organ.color) ? 'infectar' : null;
        if (st === 'infectado') return virusMatch(card.color, o.organ.color) ? 'extirpar' : null;
        return virusMatch(card.color, top.color) ? 'destruirVacuna' : null;
    }
    if (card.kind === 'medicina') {
        if (st === 'libre') return virusMatch(card.color, o.organ.color) ? 'vacunar' : null;
        if (st === 'infectado') return virusMatch(card.color, top.color) ? 'curar' : null;
        return virusMatch(card.color, o.organ.color) ? 'inmunizar' : null;
    }
    return null;
}

/** El mayor número de contagios a la vez: cada virus a un órgano libre distinto de su color. */
function virusMaxMatching(froms, tos) {
    let best = 0;
    const used = new Set();
    const go = (i, n) => {
        if (n + (froms.length - i) <= best) return;
        if (i === froms.length) { best = Math.max(best, n); return; }
        for (let j = 0; j < tos.length; j++) {
            if (used.has(j) || !virusMatch(froms[i].color, tos[j].color)) continue;
            used.add(j); go(i + 1, n + 1); used.delete(j);
        }
        go(i + 1, n);
    };
    go(0, 0);
    return best;
}

// ═══════════════════════════════════════════════════════
// La partida
// ═══════════════════════════════════════════════════════
//
// Fases: idle → turn → … → roundOver → (startRound) … → gameOver
//
// En tu turno juegas una carta o descartas las que quieras, y robas hasta
// tener tres. Un órgano se dice por su dueño y su color: { p, color }.
// Cada acción devuelve los sucesos que ha provocado. Un suceso con
// `secret: true` lleva cartas que solo debe conocer `p`.

class VirusGame {
    constructor({ players, rules = {}, seed = Date.now() }) {
        this.rules = { ...VIRUS_DEFAULT_RULES, ...rules };
        this.seed = seed >>> 0;
        this.rng = makeRng(this.seed);
        this.players = players.map((p, i) => ({ name: p.name, index: i, hand: [], body: [], wins: 0 }));
        this.round = 0;
        this.dealer = this.players.length - 1;
        this.phase = 'idle';
        this.deck = [];
        this.discardPile = [];
        this.current = 0;
        this.turns = 0;
        this.result = null;
        this.winners = null;
        this.history = [];
        this._out = null;
    }

    get n() { return this.players.length; }
    get teamPlay() { return !!this.rules.pairs && this.n >= 4 && this.n % 2 === 0; }
    team(p) { return this.teamPlay ? p % 2 : p; }
    partners(p) { return this.players.map((_, i) => i).filter(i => i !== p && this.team(i) === this.team(p)); }
    rivals(p) { return this.players.map((_, i) => i).filter(i => this.team(i) !== this.team(p)); }
    sides() {
        if (!this.teamPlay) return this.players.map((_, i) => [i]);
        return [0, 1].map(t => this.players.map((_, i) => i).filter(i => i % 2 === t));
    }

    // ── Consultas ─────────────────────────────────────
    handOf(p) { return this.players[p]?.hand || []; }   // p = -1: quien mira no tiene mano
    slotsOf(p) { return this.handOf(p).map((c, i) => c ? i : -1).filter(i => i >= 0); }
    countOf(p) { return this.slotsOf(p).length; }
    card(p, s) { return this.handOf(p)[s] || null; }
    bodyOf(p) { return this.players[p].body; }
    organ(p, color) { return this.players[p]?.body.find(o => o.organ.color === color) || null; }
    hasColor(p, color) { return this.bodyOf(p).some(o => o.organ.color === color); }
    healthyCount(p) { return this.bodyOf(p).filter(organHealthy).length; }
    isComplete(p) { return this.healthyCount(p) >= VIRUS_TO_WIN; }

    /** Todas las jugadas posibles de una carta de la mano (sin contar descartar). */
    playsFor(p, slot) {
        const c = this.card(p, slot);
        if (!c || this.phase !== 'turn' || this.current !== p) return [];
        const out = [];
        const all = this.players.map((_, i) => i);
        if (c.kind === 'organo') {
            if (!this.hasColor(p, c.color)) out.push({ type: 'play', p, slot, effect: 'organo' });
        } else if (c.kind === 'medicina') {
            for (const o of this.bodyOf(p)) {
                const effect = virusEffect(c, o);
                if (effect) out.push({ type: 'play', p, slot, target: { p, color: o.organ.color }, effect });
            }
        } else if (c.kind === 'virus') {
            for (const q of this.rivals(p)) for (const o of this.bodyOf(q)) {
                const effect = virusEffect(c, o);
                if (effect) out.push({ type: 'play', p, slot, target: { p: q, color: o.organ.color }, effect });
            }
        } else if (c.treat === 'trasplante') {
            for (const a of all) for (const b of all) {
                if (b <= a) continue;
                for (const oa of this.bodyOf(a)) for (const ob of this.bodyOf(b)) {
                    if (this._canTransplant(a, oa, b, ob)) out.push({ type: 'play', p, slot, a: { p: a, color: oa.organ.color }, b: { p: b, color: ob.organ.color }, effect: 'trasplante' });
                }
            }
        } else if (c.treat === 'ladron') {
            for (const q of this.rivals(p)) for (const o of this.bodyOf(q)) {
                if (organState(o) !== 'inmune' && !this.hasColor(p, o.organ.color)) out.push({ type: 'play', p, slot, target: { p: q, color: o.organ.color }, effect: 'ladron' });
            }
        } else if (c.treat === 'contagio') {
            for (const moves of this._contagionOptions(p)) out.push({ type: 'play', p, slot, moves, effect: 'contagio' });
        } else if (c.treat === 'guante') {
            if (this.rivals(p).some(q => this.countOf(q)) || this.partners(p).some(q => this.countOf(q))) out.push({ type: 'play', p, slot, effect: 'guante' });
        } else if (c.treat === 'error') {
            for (const q of all) {
                if (q === p || (this.bodyOf(p).length === 0 && this.bodyOf(q).length === 0)) continue;
                out.push({ type: 'play', p, slot, target: { p: q }, effect: 'error' });
            }
        }
        return out;
    }

    /** Todas las jugadas de p ahora (cartas que se pueden jugar, sin descartar). */
    plays(p) { return this.slotsOf(p).flatMap(s => this.playsFor(p, s)); }
    playable(p) { return this.slotsOf(p).filter(s => this.playsFor(p, s).length); }

    _canTransplant(a, oa, b, ob) {
        if (a === b || organState(oa) === 'inmune' || organState(ob) === 'inmune') return false;
        const ca = oa.organ.color, cb = ob.organ.color;
        if (ca !== cb && (this.hasColor(a, cb) || this.hasColor(b, ca))) return false;
        return true;
    }

    /** Los virus de p que se pueden contagiar y los órganos libres que los reciben. */
    _contagionParts(p) {
        const froms = this.bodyOf(p).filter(o => organState(o) === 'infectado').map(o => ({ color: o.items[0].color, organ: o.organ.color }));
        const tos = [];
        for (const q of this.rivals(p)) for (const o of this.bodyOf(q)) if (organState(o) === 'libre') tos.push({ p: q, color: o.organ.color });
        return { froms, tos };
    }

    /** Cada forma de contagiar el mayor número posible de virus. */
    _contagionOptions(p) {
        const { froms, tos } = this._contagionParts(p);
        const max = virusMaxMatching(froms.map(f => ({ color: f.color })), tos);
        if (!max) return [];
        const out = [], used = new Set(), moves = [];
        const go = i => {
            if (out.length >= 60) return;
            if (i === froms.length) { if (moves.length === max) out.push(moves.slice()); return; }
            if (moves.length + (froms.length - i) < max) return;
            for (let j = 0; j < tos.length; j++) {
                if (used.has(j) || !virusMatch(froms[i].color, tos[j].color)) continue;
                used.add(j); moves.push({ from: froms[i].organ, to: { p: tos[j].p, color: tos[j].color } });
                go(i + 1);
                moves.pop(); used.delete(j);
            }
            go(i + 1);
        };
        go(0);
        return out;
    }

    /** Lo que un jugador puede hacer ahora mismo. */
    legal(p) {
        if (this.phase !== 'turn' || this.current !== p) return [];
        const a = [];
        if (this.playable(p).length) a.push('play');
        if (this.countOf(p)) a.push('discard');
        return a;
    }

    /** Estado público. Con seat, también las cartas de ese jugador. */
    view(seat = null) {
        return {
            phase: this.phase, round: this.round, dealer: this.dealer, current: this.current,
            deckCount: this.deck.length, discardCount: this.discardPile.length,
            discardTop: this.discardPile[this.discardPile.length - 1] || null,
            players: this.players.map(pl => ({
                name: pl.name, wins: pl.wins, hand: pl.hand.map(c => !!c),
                body: pl.body.map(o => ({ organ: o.organ, items: o.items.slice() })),
            })),
            hand: seat != null && this.players[seat] ? this.players[seat].hand.slice() : null,
            winners: this.winners,
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

    // ── Ronda ─────────────────────────────────────────
    startRound() {
        return this._run(() => {
            if (this.phase !== 'idle' && this.phase !== 'roundOver') return 'La ronda aún no ha terminado.';
            this.round++;
            if (this.round > 1) this.dealer = (this.dealer + 1) % this.n;
            this.deck = this.rng.shuffle(makeVirusDeck());
            this.discardPile = [];
            for (const p of this.players) { p.hand = []; p.body = []; }
            this.result = null;
            this.turns = 0;
            for (let k = 0; k < VIRUS_HAND; k++) {
                for (let i = 1; i <= this.n; i++) this.players[(this.dealer + i) % this.n].hand.push(this.deck.pop());
            }
            this.current = (this.dealer + 1) % this.n;
            this._emit({ t: 'round', round: this.round, dealer: this.dealer, first: this.current, teams: this.teamPlay });
            for (const pl of this.players) this._emit({ t: 'deal', p: pl.index, cards: pl.hand.slice(), secret: true });
            this.phase = 'turn';
            this._startTurn();
            return null;
        });
    }

    act(a) {
        return this._run(() => {
            if (!a || !VIRUS_ACTIONS.has(a.type)) return 'Acción no válida.';
            if (!Number.isInteger(a.p) || !this.players[a.p]) return 'Ese jugador no existe.';
            if (this.phase !== 'turn' || a.p !== this.current) return 'No es tu turno.';
            return this['_' + a.type](a);
        });
    }

    /** Empieza el turno de current. Sin cartas (por el guante), solo roba y pierde el turno. */
    _startTurn() {
        for (let guard = 0; guard < this.n; guard++) {
            const p = this.current;
            if (this.countOf(p)) { this._emit({ t: 'turn', p }); return; }
            this._emit({ t: 'lostTurn', p });
            this._refill(p);
            this.current = (p + 1) % this.n;
        }
        this._emit({ t: 'turn', p: this.current });
    }

    _discard({ p, slots }) {
        if (!Array.isArray(slots) || !slots.length) return 'Elige qué cartas descartas.';
        const set = [...new Set(slots)];
        if (set.some(s => !Number.isInteger(s) || !this.card(p, s))) return 'Ahí no tienes carta.';
        const cards = set.map(s => this.handOf(p)[s]);
        for (const s of set) this.handOf(p)[s] = null;
        this.discardPile.push(...cards);
        this._emit({ t: 'discard', p, slots: set, cards });
        this._endTurn(p);
        return null;
    }

    _play(a) {
        const { p, slot } = a;
        const c = this.card(p, slot);
        if (!c) return 'Ahí no tienes carta.';
        const options = this.playsFor(p, slot);
        if (!options.length) return 'Esa carta ahora no se puede jugar.';
        const key = o => JSON.stringify([o.target || null, o.a || null, o.b || null, o.moves || null]);
        let pick = options.find(o => key(o) === key({ target: a.target, a: a.a, b: a.b, moves: a.moves }));
        if (!pick && c.kind === 'organo') pick = options[0];
        if (!pick && c.treat === 'guante') pick = options[0];
        if (!pick && c.treat === 'contagio' && !a.moves) pick = options[0];
        if (!pick) return 'Esa jugada no vale.';
        this.handOf(p)[slot] = null;
        this._apply(p, c, pick);
        if (this.phase === 'turn') this._endTurn(p);
        return null;
    }

    _apply(p, c, pick) {
        const ev = { t: 'play', p, slot: pick.slot, card: c, effect: pick.effect };
        if (c.kind === 'organo') {
            this.bodyOf(p).push({ organ: c, items: [] });
        } else if (c.kind === 'virus' || c.kind === 'medicina') {
            const o = this.organ(pick.target.p, pick.target.color);
            ev.target = pick.target;
            if (pick.effect === 'infectar' || pick.effect === 'vacunar' || pick.effect === 'inmunizar') {
                o.items.push(c);
            } else if (pick.effect === 'extirpar') {
                const body = this.bodyOf(pick.target.p);
                body.splice(body.indexOf(o), 1);
                ev.gone = [o.organ, ...o.items, c];
                this.discardPile.push(o.organ, ...o.items, c);
                c = null;
            } else {
                // curar o destruir la vacuna: las dos cartas van a los descartes
                const gone = o.items.pop();
                ev.gone = [gone, c];
                this.discardPile.push(gone, c);
                c = null;
            }
        } else {
            this.discardPile.push(c);
            if (pick.effect === 'trasplante') {
                const oa = this.organ(pick.a.p, pick.a.color), ob = this.organ(pick.b.p, pick.b.color);
                const A = this.bodyOf(pick.a.p), B = this.bodyOf(pick.b.p);
                A[A.indexOf(oa)] = ob; B[B.indexOf(ob)] = oa;
                ev.a = pick.a; ev.b = pick.b;
            } else if (pick.effect === 'ladron') {
                const o = this.organ(pick.target.p, pick.target.color), B = this.bodyOf(pick.target.p);
                B.splice(B.indexOf(o), 1);
                this.bodyOf(p).push(o);
                ev.target = pick.target;
            } else if (pick.effect === 'contagio') {
                for (const m of pick.moves) {
                    const from = this.organ(p, m.from), to = this.organ(m.to.p, m.to.color);
                    to.items.push(from.items.pop());
                }
                ev.moves = pick.moves;
            } else if (pick.effect === 'guante') {
                const lost = [];
                for (const q of this.players.map((_, i) => i)) {
                    if (q === p) continue;
                    const cards = this.handOf(q).filter(Boolean);
                    if (!cards.length) continue;
                    this.players[q].hand = [];
                    this.discardPile.push(...cards);
                    lost.push({ p: q, cards });
                }
                ev.lost = lost;
            } else if (pick.effect === 'error') {
                const q = pick.target.p;
                [this.players[p].body, this.players[q].body] = [this.players[q].body, this.players[p].body];
                ev.target = pick.target;
            }
        }
        this._emit(ev);
        this._checkWin(p);
    }

    /** ¿Alguien tiene ya cuatro órganos sanos? Gana en ese momento, y si son varios, quien acaba de jugar. */
    _checkWin(by) {
        const done = this.players.map((_, i) => i).filter(i => this.isComplete(i));
        if (!done.length) return;
        const w = done.includes(by) ? by : done[0];
        this._endRound(w);
    }

    _refill(p) {
        const pl = this.players[p];
        const hand = pl.hand = Array.from({ length: VIRUS_HAND }, (_, i) => pl.hand[i] || null);
        const drawn = [];
        for (let s = 0; s < VIRUS_HAND; s++) {
            if (hand[s]) continue;
            if (!this.deck.length) {
                if (!this.discardPile.length) break;
                // Se da la vuelta a los descartes, sin barajar: la primera que se tiró es la primera que se roba.
                this.deck = this.discardPile.reverse();
                this.discardPile = [];
                this._emit({ t: 'flip', count: this.deck.length });
            }
            hand[s] = this.deck.pop();
            drawn.push({ slot: s, card: hand[s] });
        }
        if (drawn.length) this._emit({ t: 'draw', p, slots: drawn.map(d => d.slot), cards: drawn.map(d => d.card), secret: true });
    }

    _endTurn(p) {
        this._refill(p);
        this.turns++;
        if (this.turns > 2000) { this._endRound(null); return; }
        this.current = (p + 1) % this.n;
        this._startTurn();
    }

    _endRound(w) {
        const winners = w == null ? [] : (this.teamPlay ? this.sides()[this.team(w)] : [w]);
        for (const i of winners) this.players[i].wins++;
        this.result = { winner: w, winners, healthy: this.players.map((_, i) => this.healthyCount(i)) };
        this.phase = 'roundOver';
        this._emit({ t: 'roundOver', ...this.result, wins: this.players.map(p => p.wins), teams: this.teamPlay });
        const goal = this.rules.winsToWin;
        if (goal > 0) {
            const most = Math.max(...this.players.map(p => p.wins));
            if (most >= goal) {
                this.winners = this.players.filter(p => p.wins === most).map(p => p.index);
                this.phase = 'gameOver';
                this._emit({ t: 'gameOver', winners: this.winners, wins: this.players.map(p => p.wins) });
            }
        }
    }
}

/** En una sala: lo que un jugador puede ver de un suceso del Virus. */
function virusEventFor(e, seat) {
    if (e.t === 'deal' && e.p !== seat) return { ...e, cards: e.cards.map(() => null) };
    if (e.t === 'draw' && e.p !== seat) return { ...e, cards: e.cards.map(() => null) };
    return e;
}

/** El Virus tal como lo ve un invitado de una sala: los cuerpos de todos, y solo su mano. */
class VirusMirror {
    constructor({ names, rules, me }) {
        this.rules = { ...VIRUS_DEFAULT_RULES, ...rules };
        this.me = me;
        this.players = names.map((name, index) => ({ name, index, hand: [], body: [], wins: 0 }));
        this.phase = 'idle'; this.round = 0; this.dealer = 0; this.current = 0;
        this.deck = { length: 0 }; this.discardPile = []; this.winners = null; this.result = null;
    }

    get n() { return this.players.length; }

    setView(v) {
        this.phase = v.phase; this.round = v.round; this.dealer = v.dealer; this.current = v.current;
        this.deck = { length: v.deckCount };
        this.discardPile = Array.from({ length: v.discardCount }, () => null);
        if (v.discardTop) this.discardPile[v.discardCount - 1] = v.discardTop;
        this.winners = v.winners;
        v.players.forEach((p, i) => {
            const pl = this.players[i];
            pl.wins = p.wins;
            pl.body = p.body.map(o => ({ organ: o.organ, items: o.items.slice() }));
            pl.hand = i === this.me && v.hand ? v.hand.slice() : p.hand.map(b => b ? { hidden: true } : null);
        });
    }

    observe(e) { if (e.t === 'roundOver') this.result = e; else if (e.t === 'round') this.result = null; }
}

for (const m of ['handOf', 'slotsOf', 'countOf', 'card', 'bodyOf', 'organ', 'hasColor', 'healthyCount', 'isComplete',
    'playsFor', 'plays', 'playable', '_canTransplant', '_contagionParts', '_contagionOptions', 'legal', 'team', 'partners', 'rivals', 'sides']) {
    VirusMirror.prototype[m] = VirusGame.prototype[m];
}
Object.defineProperty(VirusMirror.prototype, 'teamPlay', Object.getOwnPropertyDescriptor(VirusGame.prototype, 'teamPlay'));

// Para las pruebas con Node (en el navegador no hace nada).
if (typeof module !== 'undefined') {
    const R = require('./rules.js');
    Object.assign(globalThis, { makeRng: R.makeRng });
    module.exports = {
        VIRUS_DEFAULT_RULES, VIRUS_HAND, VIRUS_TO_WIN, VIRUS_COLORS, VIRUS_TREATMENTS, VIRUS_TREATMENT_COUNT,
        makeVirusDeck, virusMatch, organState, organHealthy, virusEffect, virusMaxMatching, virusEventFor, VirusGame, VirusMirror,
    };
}
