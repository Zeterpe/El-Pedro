/* =============================================
   EL PEDRO — brisca.js
   Las reglas de la Brisca, sin pantalla ni sonido.
   Baraja española, tres cartas en la mano, una
   muestra que marca el triunfo y bazas que valen
   puntos: gana quien pase de 60.
   Usa el azar con semilla de rules.js.
   ============================================= */
'use strict';

const BRISCA_DEFAULT_RULES = {
    deck: 40,                 // 40: sin ochos ni nueves (la de siempre) · 48: del 1 al 12
    pairs: true,              // con 4 o 6 jugadores, por parejas: cada uno con el de enfrente
    swapTrump: 'sieteYDos',   // cambiar la muestra: 'sieteYDos' · 'siete' · 'no'
    swapWhen: 'turno',        // cuándo: 'turno' (en cualquier turno tuyo, antes de jugar) · 'salir' (solo al salir)
    cantes: false,            // cantar las 20 y las 40 (rey y caballo del mismo palo)
    arrastre: false,          // al acabarse el mazo, hay que asistir y montar (o fallar)
    lastTen: false,           // diez de últimas: la última baza vale 10 puntos más
    showPoints: true,         // contar los puntos de cada uno durante la mano
    winsToWin: 1,             // manos ganadas para ganar la partida (0 = sin límite)
};

const BRISCA_HAND = 3;
/** Puntos de cada carta: el as 11, el tres 10, el rey 4, el caballo 3 y la sota 2. */
const BRISCA_POINTS = { 1: 11, 3: 10, 12: 4, 11: 3, 10: 2 };
/** Qué carta gana a cuál: as, tres, rey, caballo, sota, nueve, ocho, siete, seis, cinco, cuatro y dos. */
const BRISCA_STRENGTH = { 1: 12, 3: 11, 12: 10, 11: 9, 10: 8, 9: 7, 8: 6, 7: 5, 6: 4, 5: 3, 4: 2, 2: 1 };
const BRISCA_ORDER = [1, 3, 12, 11, 10, 9, 8, 7, 6, 5, 4, 2];
const BRISCA_ACTIONS = new Set(['play', 'swapTrump', 'cante']);

const briscaPoints = c => (c && BRISCA_POINTS[c.rank]) || 0;
const briscaStrength = c => (c && BRISCA_STRENGTH[c.rank]) || 0;

/** ¿La carta a gana a la carta b? led: el palo que salió · trump: el palo del triunfo. */
function briscaBeats(a, b, led, trump) {
    if (!b) return true;
    if (a.suit === b.suit) return briscaStrength(a) > briscaStrength(b);
    if (a.suit === trump) return true;
    if (b.suit === trump) return false;
    return a.suit === led && b.suit !== led;
}

/** La carta que va ganando una baza: { p, card } o null. */
function briscaBest(trick, trump) {
    if (!trick.length) return null;
    const led = trick[0].card.suit;
    let best = trick[0];
    for (const t of trick.slice(1)) if (briscaBeats(t.card, best.card, led, trump)) best = t;
    return best;
}

/** Los doses que se quitan para que la baraja se reparta igual entre todos. */
function briscaRemoved(deckSize, n) {
    const order = ['oros', 'copas', 'espadas', 'bastos'];
    const k = deckSize % n;
    return order.slice(0, k).map(suit => ({ rank: 2, suit }));
}

// ═══════════════════════════════════════════════════════
// La partida
// ═══════════════════════════════════════════════════════
//
// Fases: idle → turn → … (cada baza: n cartas; quien la gana roba primero y sale)
//        … → roundOver → (startRound) … → gameOver
//
// Cada acción devuelve los sucesos que ha provocado. Un suceso con
// `secret: true` lleva cartas que solo debe conocer `p`.

class BriscaGame {
    constructor({ players, rules = {}, seed = Date.now() }) {
        this.rules = { ...BRISCA_DEFAULT_RULES, ...rules };
        this.seed = seed >>> 0;
        this.rng = makeRng(this.seed);
        this.players = players.map((p, i) => ({ name: p.name, index: i, hand: [], won: [], bonus: 0, wins: 0 }));
        this.round = 0;
        this.dealer = this.players.length - 1;
        this.phase = 'idle';
        this.deck = [];
        this.trump = null;           // la muestra (mientras está debajo del mazo)
        this.trumpSuit = null;
        this.trick = [];             // [{ p, card }]
        this.current = 0; this.leader = 0;
        this.lastWinner = null;      // quien ganó la última baza
        this.tricks = 0;             // bazas jugadas en esta mano
        this.sung = [];              // palos cantados en esta mano
        this.sangAt = -1;            // baza en la que se cantó por última vez
        this.removed = [];
        this.result = null;
        this.winners = null;
        this.history = [];
        this._out = null;
    }

    get n() { return this.players.length; }
    /** ¿Se juega por parejas? Con 4 o 6 jugadores, si las reglas lo dicen. */
    get teamPlay() { return !!this.rules.pairs && this.n >= 4 && this.n % 2 === 0; }
    team(p) { return this.teamPlay ? p % 2 : p; }
    partners(p) { return this.players.map((_, i) => i).filter(i => i !== p && this.team(i) === this.team(p)); }
    sides() {
        if (!this.teamPlay) return this.players.map((_, i) => [i]);
        return [0, 1].map(t => this.players.map((_, i) => i).filter(i => i % 2 === t));
    }

    // ── Consultas ─────────────────────────────────────
    handOf(p) { return this.players[p]?.hand || []; }   // p = -1: quien mira no tiene mano
    slotsOf(p) { return this.handOf(p).map((c, i) => c ? i : -1).filter(i => i >= 0); }
    countOf(p) { return this.slotsOf(p).length; }
    card(p, s) { return this.handOf(p)[s] || null; }
    get led() { return this.trick[0]?.card.suit || null; }
    get best() { return briscaBest(this.trick, this.trumpSuit); }
    /** ¿Se acabó el mazo? (con la muestra incluida) */
    get deckEmpty() { return this.deck.length === 0; }

    pointsOf(p) {
        const pl = this.players[p];
        return pl.won.reduce((s, c) => s + briscaPoints(c), 0) + pl.bonus;
    }
    sidePoints(side) { return side.reduce((s, p) => s + this.pointsOf(p), 0); }

    /** Las cartas que puede jugar p ahora (con arrastre, hay que asistir y montar). */
    playable(p) {
        const slots = this.slotsOf(p);
        if (!this.rules.arrastre || !this.deckEmpty || !this.trick.length) return slots;
        const hand = this.handOf(p), led = this.led, trump = this.trumpSuit, best = this.best;
        const partnerWins = this.teamPlay && best && best.p !== p && this.team(best.p) === this.team(p);
        const follow = slots.filter(s => hand[s].suit === led);
        if (follow.length) {
            if (partnerWins) return follow;
            const over = follow.filter(s => briscaBeats(hand[s], best.card, led, trump));
            return over.length ? over : follow;
        }
        const trumps = slots.filter(s => hand[s].suit === trump);
        if (trumps.length && !partnerWins) {
            const over = trumps.filter(s => briscaBeats(hand[s], best.card, led, trump));
            return over.length ? over : trumps;
        }
        return slots;
    }

    /** ¿Puede p cambiar su siete (o su dos) de triunfo por la muestra? Devuelve el sitio de esa carta o -1. */
    swapSlot(p) {
        const r = this.rules.swapTrump;
        if (r === 'no' || this.phase !== 'turn' || this.current !== p || !this.trump || this.deck.length <= 1) return -1;
        if (this.rules.swapWhen === 'salir' && this.trick.length) return -1;
        const hand = this.handOf(p), muestra = this.trump;
        const seven = hand.findIndex(c => c && c.suit === this.trumpSuit && c.rank === 7);
        const two = hand.findIndex(c => c && c.suit === this.trumpSuit && c.rank === 2);
        const m = briscaStrength(muestra), s7 = BRISCA_STRENGTH[7];
        if (r === 'siete') return seven >= 0 && muestra.rank !== 7 ? seven : -1;
        if (seven >= 0 && m > s7) return seven;
        if (two >= 0 && m <= s7 && muestra.rank !== 2) return two;
        return -1;
    }
    canSwapTrump(p) { return this.swapSlot(p) >= 0; }

    /** Palos que p puede cantar ahora (rey y caballo del mismo palo, tras ganar una baza). */
    canteSuits(p) {
        if (!this.rules.cantes || this.phase !== 'turn' || this.current !== p || this.trick.length) return [];
        if (this.lastWinner !== p || this.sangAt === this.tricks || this.deckEmpty) return [];
        const hand = this.handOf(p).filter(Boolean);
        const out = SUITS.filter(s => !this.sung.includes(s) && hand.some(c => c.suit === s && c.rank === 12) && hand.some(c => c.suit === s && c.rank === 11));
        return out.sort((a, b) => (b === this.trumpSuit) - (a === this.trumpSuit));
    }

    /** Lo que un jugador puede hacer ahora mismo. */
    legal(p) {
        if (this.phase !== 'turn' || this.current !== p) return [];
        const a = ['play'];
        if (this.canSwapTrump(p)) a.push('swapTrump');
        if (this.canteSuits(p).length) a.push('cante');
        return a;
    }

    /** Estado público. Con seat, también las cartas de ese jugador (solo las suyas). */
    view(seat = null) {
        const showPts = this.rules.showPoints || this.phase === 'roundOver' || this.phase === 'gameOver';
        return {
            phase: this.phase, round: this.round, dealer: this.dealer, current: this.current, leader: this.leader,
            trump: this.trump, trumpSuit: this.trumpSuit, deckCount: this.deck.length,
            trick: this.trick.map(t => ({ p: t.p, card: t.card })),
            lastWinner: this.lastWinner, tricks: this.tricks, sung: this.sung.slice(), sangAt: this.sangAt,
            players: this.players.map((pl, i) => ({
                name: pl.name, wins: pl.wins, hand: pl.hand.map(c => !!c), won: pl.won.length,
                points: showPts ? this.pointsOf(i) : null,
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

    // ── Mano ──────────────────────────────────────────
    startRound() {
        return this._run(() => {
            if (this.phase !== 'idle' && this.phase !== 'roundOver') return 'La mano aún no ha terminado.';
            this.round++;
            if (this.round > 1) this.dealer = (this.dealer + 1) % this.n;
            this.removed = briscaRemoved(this.rules.deck, this.n);
            const out = new Set(this.removed.map(c => c.suit + c.rank));
            this.deck = this.rng.shuffle(makeDeck(this.rules.deck).filter(c => !out.has(c.suit + c.rank)));
            for (const p of this.players) { p.hand = []; p.won = []; p.bonus = 0; }
            this.trick = []; this.lastWinner = null; this.tricks = 0; this.sung = []; this.sangAt = -1; this.result = null;
            for (let k = 0; k < BRISCA_HAND; k++) {
                for (let i = 1; i <= this.n; i++) this.players[(this.dealer + i) % this.n].hand.push(this.deck.pop());
            }
            // La siguiente carta se pone boca arriba debajo del mazo: es la muestra y marca el triunfo.
            this.trump = this.deck.pop();
            this.trumpSuit = this.trump.suit;
            this.deck.unshift(this.trump);
            this.leader = this.current = (this.dealer + 1) % this.n;
            this._emit({ t: 'round', round: this.round, dealer: this.dealer, first: this.current, trump: this.trump, removed: this.removed, teams: this.teamPlay });
            for (const pl of this.players) this._emit({ t: 'deal', p: pl.index, cards: pl.hand.slice(), secret: true });
            this.phase = 'turn';
            this._emit({ t: 'turn', p: this.current, lead: true });
            return null;
        });
    }

    act(a) {
        return this._run(() => {
            if (!a || !BRISCA_ACTIONS.has(a.type)) return 'Acción no válida.';
            if (!Number.isInteger(a.p) || !this.players[a.p]) return 'Ese jugador no existe.';
            return this['_' + a.type](a);
        });
    }

    _play({ p, slot }) {
        if (this.phase !== 'turn' || p !== this.current) return 'No es tu turno.';
        if (!Number.isInteger(slot) || !this.card(p, slot)) return 'Ahí no tienes carta.';
        if (!this.playable(p).includes(slot)) {
            return this.handOf(p).some(c => c && c.suit === this.led) ? 'Hay que asistir: juega una carta del palo que ha salido, y que gane si puedes.' : 'Hay que fallar: juega un triunfo, y que gane si puedes.';
        }
        const card = this.handOf(p)[slot];
        const before = this.best;
        this.handOf(p)[slot] = null;
        this.trick.push({ p, card });
        const lead = this.trick.length === 1;
        // fallo: juega triunfo cuando ha salido otro palo · monta: se pone por encima de lo que iba ganando
        const cut = !lead && card.suit === this.trumpSuit && this.led !== this.trumpSuit && (!before || before.card.suit !== this.trumpSuit);
        const wins = this.best.p === p;
        this._emit({ t: 'play', p, slot, card, lead, cut, wins });
        if (this.trick.length < this.n) {
            this.current = (this.current + 1) % this.n;
            this._emit({ t: 'turn', p: this.current, lead: false });
            return null;
        }
        this._closeTrick();
        return null;
    }

    _closeTrick() {
        const best = this.best, w = best.p;
        const cards = this.trick.map(t => t.card);
        this.players[w].won.push(...cards);
        let points = cards.reduce((s, c) => s + briscaPoints(c), 0);
        this.tricks++;
        const last = this.players.every(pl => !pl.hand.some(Boolean)) && this.deckEmpty;
        let bonus = 0;
        if (last && this.rules.lastTen) { bonus = 10; this.players[w].bonus += 10; }
        this._emit({ t: 'trick', winner: w, cards: this.trick.map(t => ({ p: t.p, card: t.card })), points, bonus, last, n: this.tricks });
        this.trick = [];
        this.lastWinner = w;
        // Roban todos, empezando por quien ha ganado la baza. La última carta es la muestra.
        if (this.deck.length) {
            for (let i = 0; i < this.n && this.deck.length; i++) {
                const p = (w + i) % this.n;
                const card = this.deck.pop();
                const hand = this.handOf(p);
                let s = hand.indexOf(null);
                if (s < 0) { s = hand.length; hand.push(card); } else hand[s] = card;
                const isTrump = !this.deck.length;
                if (isTrump) this.trump = null;
                this._emit({ t: 'draw', p, slot: s, card, trump: isTrump, secret: !isTrump });
            }
            if (!this.deck.length) this._emit({ t: 'deckOut', arrastre: !!this.rules.arrastre });
        }
        if (this.players.every(pl => !pl.hand.some(Boolean))) { this._endRound(); return; }
        this.leader = this.current = w;
        this._emit({ t: 'turn', p: w, lead: true });
    }

    _swapTrump({ p }) {
        const s = this.swapSlot(p);
        if (s < 0) return 'Ahora no puedes cambiar la muestra.';
        const mine = this.handOf(p)[s], muestra = this.trump;
        this.handOf(p)[s] = muestra;
        this.deck[0] = mine;
        this.trump = mine;
        this._emit({ t: 'swapTrump', p, slot: s, gave: mine, took: muestra });
        return null;
    }

    _cante({ p, suit }) {
        const can = this.canteSuits(p);
        if (!can.length) return 'Ahora no puedes cantar.';
        const s = suit && can.includes(suit) ? suit : can[0];
        const points = s === this.trumpSuit ? 40 : 20;
        this.sung.push(s);
        this.sangAt = this.tricks;
        this.players[p].bonus += points;
        this._emit({ t: 'cante', p, suit: s, points });
        return null;
    }

    _endRound() {
        const points = this.players.map((_, i) => this.pointsOf(i));
        const sides = this.sides().map(members => ({ members, points: this.sidePoints(members) }));
        const top = Math.max(...sides.map(s => s.points));
        const best = sides.filter(s => s.points === top);
        // Empate: nadie gana la mano.
        const winners = best.length === 1 ? best[0].members.slice() : [];
        for (const w of winners) this.players[w].wins++;
        const capote = best.length === 1 && sides.every(s => s === best[0] || s.members.every(p => !this.players[p].won.length));
        this.result = { points, sides, winners, capote };
        this.trump = null;
        this.phase = 'roundOver';
        this._emit({ t: 'handOver', ...this.result, wins: this.players.map(p => p.wins), teams: this.teamPlay });
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

/** En una sala: lo que un jugador puede ver de un suceso de la Brisca. */
function briscaEventFor(e, seat) {
    if (e.t === 'deal' && e.p !== seat) return { ...e, cards: e.cards.map(() => null) };
    if (e.t === 'draw' && e.secret && e.p !== seat) return { ...e, card: null };
    return e;
}

/** La Brisca tal como la ve un invitado de una sala: la mesa que manda el anfitrión, con sus cartas y sin las de los demás. */
class BriscaMirror {
    constructor({ names, rules, me }) {
        this.rules = { ...BRISCA_DEFAULT_RULES, ...rules };
        this.me = me;
        this.players = names.map((name, index) => ({ name, index, hand: [], won: { length: 0 }, points: null, wins: 0 }));
        this.phase = 'idle'; this.round = 0; this.dealer = 0; this.current = 0; this.leader = 0;
        this.deck = { length: 0 }; this.trump = null; this.trumpSuit = null; this.trick = [];
        this.lastWinner = null; this.tricks = 0; this.sung = []; this.sangAt = -1; this.winners = null;
        this.result = null;
    }

    get n() { return this.players.length; }

    setView(v) {
        this.phase = v.phase; this.round = v.round; this.dealer = v.dealer; this.current = v.current; this.leader = v.leader;
        this.trump = v.trump; this.trumpSuit = v.trumpSuit; this.deck = { length: v.deckCount };
        this.trick = v.trick.map(t => ({ ...t }));
        this.lastWinner = v.lastWinner; this.tricks = v.tricks; this.sung = v.sung; this.sangAt = v.sangAt;
        this.winners = v.winners;
        v.players.forEach((p, i) => {
            const pl = this.players[i];
            pl.wins = p.wins; pl.won = { length: p.won }; pl.points = p.points;
            pl.hand = i === this.me && v.hand ? v.hand.slice() : p.hand.map(b => b ? { hidden: true } : null);
        });
    }

    observe(e) { if (e.t === 'handOver') this.result = e; else if (e.t === 'round') this.result = null; }

    pointsOf(p) { return this.players[p].points ?? 0; }
    sidePoints(side) { return side.reduce((s, p) => s + this.pointsOf(p), 0); }
}

for (const m of ['handOf', 'slotsOf', 'countOf', 'card', 'playable', 'swapSlot', 'canSwapTrump', 'canteSuits', 'legal', 'team', 'partners', 'sides']) {
    BriscaMirror.prototype[m] = BriscaGame.prototype[m];
}
for (const g of ['led', 'best', 'deckEmpty', 'teamPlay']) {
    Object.defineProperty(BriscaMirror.prototype, g, Object.getOwnPropertyDescriptor(BriscaGame.prototype, g));
}

// Para las pruebas con Node (en el navegador no hace nada).
if (typeof module !== 'undefined') {
    const R = require('./rules.js');
    Object.assign(globalThis, { makeRng: R.makeRng, makeDeck: R.makeDeck, SUITS: R.SUITS });
    module.exports = {
        BRISCA_DEFAULT_RULES, BRISCA_POINTS, BRISCA_STRENGTH, BRISCA_ORDER, BRISCA_HAND,
        briscaPoints, briscaStrength, briscaBeats, briscaBest, briscaRemoved, briscaEventFor, BriscaGame, BriscaMirror,
    };
}
