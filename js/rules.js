/* =============================================
   EL PEDRO — rules.js
   Las reglas del juego, sin pantalla ni sonido.
   Todo el azar sale de una semilla, para poder
   repetir partidas (pruebas y, más adelante,
   partidas online iguales para todos).
   ============================================= */
'use strict';

const GAME_VERSION = { id: '20261019b', spoken: '19 de octubre de 2026' };

const SUITS = ['oros', 'copas', 'espadas', 'bastos'];
const RANK_NAME = {
    1: 'as', 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco', 6: 'seis',
    7: 'siete', 8: 'ocho', 9: 'nueve', 10: 'sota', 11: 'caballo', 12: 'rey',
};
/** Poderes de las figuras al robarlas del mazo y tirarlas a la mesa. */
const POWERS = {
    10: { name: 'cambiar', steps: ['swap'] },
    11: { name: 'mirar', steps: ['look'] },
    12: { name: 'mirar y cambiar', steps: ['look', 'swap'] },
};

const DEFAULT_RULES = {
    deck: 48,              // 48: del 1 al 12 · 40: sin ochos ni nueves
    handSize: 4,           // cartas por jugador
    peekStart: 2,          // cartas que miras al empezar
    powers: true,          // la sota cambia, el caballo mira, el rey hace las dos cosas
    burn: true,            // quemar: soltar una carta igual a la de la mesa
    burnOthers: true,      // también las cartas de los demás
    burnGive: true,        // al quemar la carta de otro, le das una tuya
    penaltyCards: 1,       // cartas de castigo por quemar mal
    protectCaller: true,   // nadie toca las cartas de quien canta Pedro (ni esa persona quema fuera de su turno)
    takeFromTable: false,  // poder coger la carta de la mesa en vez de robar
    allEqualOne: true,     // si todas tus cartas son del mismo número, valen 1 punto
    sevenMinus: false,     // el siete vale -1 en vez de 7
    winsToWin: 3,          // rondas ganadas para ganar la partida (0 = sin límite)
    deckOut: 'reshuffle',  // si se acaba el mazo: 'reshuffle' (se baraja la mesa) o 'end' (se descubren las cartas)
};

const MAX_PLAYERS = 6;     // con 48 cartas y 4 por jugador, a partir de 6 el mazo se queda corto

const MAX_TURNS = 400;     // red de seguridad: ninguna ronda real llega a tanto

/** Las únicas acciones que puede pedir un jugador (en una sala llegan de otros navegadores). */
const ACTIONS = new Set(['peekStart', 'draw', 'take', 'call', 'swap', 'discard', 'peek', 'swapCards', 'pass', 'burn', 'give']);
/** Momentos de la ronda en los que se puede quemar. */
const BURN_PHASES = ['turn', 'drawn', 'power'];

// ── Azar con semilla (mulberry32) ─────────────────────
function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    const next = () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        next,
        int: n => Math.floor(next() * n),
        range: (lo, hi) => lo + next() * (hi - lo),
        pick: arr => arr[Math.floor(next() * arr.length)],
        chance: p => next() < p,
        shuffle(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(next() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        },
    };
}

function deckRanks(size) {
    return size === 40 ? [1, 2, 3, 4, 5, 6, 7, 10, 11, 12] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

function makeDeck(size) {
    const cards = [];
    let id = 0;
    for (const suit of SUITS) for (const rank of deckRanks(size)) cards.push({ id: id++, rank, suit });
    return cards;
}

/** Puntos de una carta por su número: el suyo, salvo el siete con `sevenMinus` (vale -1). */
function rankPoints(rank, rules = DEFAULT_RULES) {
    return rules.sevenMinus && rank === 7 ? -1 : rank;
}

/** Valor medio de una carta que no conoces (para los rivales de la máquina). */
function averageRank(size, rules = DEFAULT_RULES) {
    const r = deckRanks(size);
    return r.reduce((a, b) => a + rankPoints(b, rules), 0) / r.length;
}

/** Puntos de una mano: la suma, salvo que todas sean del mismo número (valen 1, o menos si son sietes que restan). */
function scoreCards(cards, rules = DEFAULT_RULES) {
    if (!cards.length) return 0;
    const sum = cards.reduce((s, c) => s + rankPoints(c.rank, rules), 0);
    if (rules.allEqualOne && cards.length >= 2 && cards.every(c => c.rank === cards[0].rank)) return Math.min(1, sum);
    return sum;
}

const sameSlot = (a, b) => a && b && a.p === b.p && a.s === b.s;

// ═══════════════════════════════════════════════════════
// La partida
// ═══════════════════════════════════════════════════════
//
// Fases: idle → peek → turn → drawn → (power) → turn …
//        Quemar se puede en turn, drawn y power; si quemas la carta de otro, give y vuelta.
//        … → roundOver → (startRound) … → gameOver
//
// Cada acción devuelve los sucesos que ha provocado. Un suceso con
// `secret: true` lleva una carta que solo debe conocer quien la ve
// (`by` o `p`); el resto de cartas de un suceso son públicas.

class PedroGame {
    constructor({ players, rules = {}, seed = Date.now() }) {
        this.rules = { ...DEFAULT_RULES, ...rules };
        this.seed = seed >>> 0;
        this.rng = makeRng(this.seed);
        this.players = players.map((p, i) => ({ name: p.name, index: i, slots: [], wins: 0 }));
        this.round = 0;
        this.dealer = this.players.length - 1;   // así empieza el primer jugador
        this.phase = 'idle';
        this.deck = []; this.table = [];
        this.current = 0; this.caller = null;
        this.drawn = null; this.drawnFrom = null;
        this.power = null; this.give = null;
        this.peekPending = new Set();
        this.turns = 0;
        this.result = null;
        this.winners = null;
        this.history = [];
        this._out = null;
    }

    get n() { return this.players.length; }
    get top() { return this.table[this.table.length - 1] || null; }

    // ── Consultas ─────────────────────────────────────
    card(p, s) { return this.players[p]?.slots[s] || null; }
    /** Índices de los sitios con carta de un jugador. */
    slotsOf(p) { return this.players[p].slots.map((c, i) => c ? i : -1).filter(i => i >= 0); }
    countOf(p) { return this.slotsOf(p).length; }
    /** Las cartas de quien ha cantado Pedro: nadie más puede tocarlas. */
    isProtected(p) { return this.rules.protectCaller && this.caller !== null && p === this.caller; }
    /** Quien ha cantado Pedro juega su turno; después ya no toca nada (ni quema). */
    isFrozen(p) { return this.isProtected(p) && !(this.current === p && ['turn', 'drawn', 'power', 'give'].includes(this.phase)); }
    scoreOf(p) { return scoreCards(this.players[p].slots.filter(Boolean), this.rules); }

    /** Cartas a las que se puede apuntar para mirar, cambiar o quemar. */
    targets(kind, by) {
        const out = [];
        for (let p = 0; p < this.n; p++) {
            if (kind !== 'look' && this.isProtected(p) && p !== by) continue;
            if (kind === 'burn' && p !== by && !this.rules.burnOthers) continue;
            for (const s of this.slotsOf(p)) out.push({ p, s });
        }
        return out;
    }

    canSwapAny(by) {
        const t = this.targets('swap', by);
        return new Set(t.map(x => x.p)).size >= 2;
    }

    /** Se puede quemar en cualquier momento de la ronda, mientras haya carta en la mesa. */
    canBurn(p) {
        return BURN_PHASES.includes(this.phase) && !!this.top && !this.isFrozen(p)
            && this.targets('burn', p).length > 0;
    }

    /** Lo que un jugador puede hacer ahora mismo. */
    legal(p) {
        const burn = this.canBurn(p) ? ['burn'] : [];
        switch (this.phase) {
            case 'peek': return this.peekPending.has(p) ? ['peekStart'] : [];
            case 'turn': {
                if (p !== this.current) return burn;
                const a = ['draw', ...burn];
                if (this.caller === null) a.push('call');
                if (this.rules.takeFromTable && this.top && this.countOf(p) > 0) a.push('take');
                return a;
            }
            case 'drawn': {
                if (p !== this.current) return burn;
                const a = [...burn];
                if (this.countOf(p) > 0) a.push('swap');
                if (this.drawnFrom === 'deck') a.push('discard');
                return a;
            }
            case 'power': {
                if (p !== this.power.by) return burn;
                return [this.power.step === 'look' ? 'peek' : 'swapCards', 'pass', ...burn];
            }
            case 'give': return p === this.give.by ? ['give'] : [];
            default: return [];
        }
    }

    /** Estado público, sin cartas ocultas (sirve para dibujar la mesa y para el online). */
    view() {
        return {
            phase: this.phase, round: this.round, dealer: this.dealer, current: this.current,
            caller: this.caller, deckCount: this.deck.length, tableCount: this.table.length, top: this.top,
            players: this.players.map(p => ({ name: p.name, wins: p.wins, slots: p.slots.map(c => !!c) })),
            power: this.power && { rank: this.power.rank, by: this.power.by, step: this.power.step },
            give: this.give && { by: this.give.by, to: this.give.to },
            drawnFrom: this.drawnFrom,
            peekPending: this.phase === 'peek' ? [...this.peekPending] : [],
            turns: this.turns,
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
            this.deck = this.rng.shuffle(makeDeck(this.rules.deck));
            this.table = [];
            for (const p of this.players) p.slots = [];
            for (let k = 0; k < this.rules.handSize; k++) {
                for (let i = 1; i <= this.n; i++) this.players[(this.dealer + i) % this.n].slots.push(this.deck.pop());
            }
            this.table.push(this.deck.pop());
            this.current = (this.dealer + 1) % this.n;
            this.caller = null; this.drawn = null; this.drawnFrom = null;
            this.power = null; this.give = null;
            this.turns = 0; this.result = null;
            this._emit({ t: 'round', round: this.round, dealer: this.dealer, first: this.current, top: this.top });
            const k = Math.min(this.rules.peekStart, this.rules.handSize);
            if (k > 0) {
                this.peekPending = new Set(this.players.map(p => p.index));
                this.phase = 'peek';
                this._emit({ t: 'peekAsk', count: k });
            } else this._beginTurn();
            return null;
        });
    }

    _beginTurn() {
        this.phase = 'turn';
        this._emit({ t: 'turn', p: this.current, last: this.caller !== null });
    }

    _nextTurn() {
        this.drawn = null; this.drawnFrom = null; this.power = null; this.give = null;
        this.turns++;
        if (this.turns >= MAX_TURNS) return this._reveal('limit');
        this.current = (this.current + 1) % this.n;
        if (this.caller !== null && this.current === this.caller) return this._reveal('call');
        this._beginTurn();
    }

    /** Si el mazo se acaba, se barajan las cartas de la mesa menos la de arriba. */
    _refill() {
        if (this.deck.length) return true;
        if (this.rules.deckOut === 'end' || this.table.length <= 1) return false;
        const top = this.table.pop();
        this.deck = this.rng.shuffle(this.table);
        this.table = [top];
        this._emit({ t: 'reshuffle', count: this.deck.length });
        return true;
    }

    _reveal(reason) {
        const hands = this.players.map(p => p.slots.map((c, s) => c ? { s, card: c } : null).filter(Boolean));
        const scores = this.players.map((_, i) => this.scoreOf(i));
        const best = Math.min(...scores);
        const winners = scores.map((v, i) => v === best ? i : -1).filter(i => i >= 0);
        for (const w of winners) this.players[w].wins++;
        const empty = this.players.filter(p => !p.slots.some(Boolean)).map(p => p.index);
        this.result = { hands, scores, winners, caller: this.caller, reason, empty };
        this.drawn = null; this.drawnFrom = null; this.power = null; this.give = null;
        this.phase = 'roundOver';
        this._emit({ t: 'reveal', ...this.result, wins: this.players.map(p => p.wins) });
        const goal = this.rules.winsToWin;
        if (goal > 0) {
            const top = Math.max(...this.players.map(p => p.wins));
            if (top >= goal) {
                this.winners = this.players.filter(p => p.wins === top).map(p => p.index);
                this.phase = 'gameOver';
                this._emit({ t: 'gameOver', winners: this.winners, wins: this.players.map(p => p.wins) });
            }
        }
    }

    _validSlot(p, s) { return Number.isInteger(p) && Number.isInteger(s) && !!this.card(p, s); }

    // ── Acciones ──────────────────────────────────────
    act(a) {
        return this._run(() => {
            if (!a || !ACTIONS.has(a.type)) return 'Acción no válida.';
            return this['_' + a.type](a);
        });
    }

    _peekStart({ p, slots }) {
        if (this.phase !== 'peek' || !this.peekPending.has(p)) return 'Ahora no puedes mirar cartas.';
        const k = Math.min(this.rules.peekStart, this.rules.handSize);
        const set = [...new Set(slots || [])];
        if (set.length !== k || !set.every(s => this._validSlot(p, s))) return `Elige ${k} cartas distintas.`;
        for (const s of set) this._emit({ t: 'peek', by: p, target: { p, s }, card: this.card(p, s), secret: true, start: true });
        this.peekPending.delete(p);
        this._emit({ t: 'peekDone', p });
        if (!this.peekPending.size) this._beginTurn();
        return null;
    }

    _draw({ p }) {
        if (this.phase !== 'turn' || p !== this.current) return 'No es tu turno.';
        if (!this._refill()) { this._reveal('deck'); return null; }
        this.drawn = this.deck.pop();
        this.drawnFrom = 'deck';
        this.phase = 'drawn';
        this._emit({ t: 'draw', p, from: 'deck', card: this.drawn, secret: true });
        return null;
    }

    _take({ p }) {
        if (this.phase !== 'turn' || p !== this.current) return 'No es tu turno.';
        if (!this.rules.takeFromTable) return 'Con estas reglas no se coge de la mesa.';
        if (!this.top || !this.countOf(p)) return 'No puedes coger la carta de la mesa.';
        this.drawn = this.table.pop();
        this.drawnFrom = 'table';
        this.phase = 'drawn';
        this._emit({ t: 'draw', p, from: 'table', card: this.drawn });
        return null;
    }

    _call({ p }) {
        if (this.phase !== 'turn' || p !== this.current) return 'Solo puedes cantar Pedro al empezar tu turno.';
        if (this.caller !== null) return 'Ya se ha cantado Pedro.';
        // Quien canta juega su turno; los demás juegan una vez más y, al volver a quien cantó, se descubren.
        this.caller = p;
        this._emit({ t: 'call', p });
        return null;
    }

    _swap({ p, slot }) {
        if (this.phase !== 'drawn' || p !== this.current) return 'No tienes ninguna carta robada.';
        if (!this._validSlot(p, slot)) return 'Ahí no tienes carta.';
        const old = this.card(p, slot);
        const drawn = this.drawn;
        this.players[p].slots[slot] = drawn;
        this.table.push(old);
        this._emit({ t: 'swap', p, slot, card: old, drawn, from: this.drawnFrom, secret: this.drawnFrom === 'deck' });
        this.drawn = null;
        this._nextTurn();
        return null;
    }

    _discard({ p }) {
        if (this.phase !== 'drawn' || p !== this.current) return 'No tienes ninguna carta robada.';
        if (this.drawnFrom !== 'deck') return 'La carta de la mesa tienes que cambiarla por una tuya.';
        const card = this.drawn;
        this.table.push(card);
        this.drawn = null;
        const pw = this.rules.powers ? POWERS[card.rank] : null;
        let steps = pw ? pw.steps.slice() : [];
        if (!this.canSwapAny(p)) steps = steps.filter(s => s !== 'swap');
        if (!this.targets('look', p).length) steps = steps.filter(s => s !== 'look');
        this._emit({ t: 'discard', p, card, power: steps.length ? card.rank : null });
        if (steps.length) {
            this.power = { rank: card.rank, by: p, steps, step: steps[0] };
            this.phase = 'power';
            this._emit({ t: 'power', p, rank: card.rank, step: this.power.step });
        } else this._nextTurn();
        return null;
    }

    _advancePower() {
        const pw = this.power;
        const i = pw.steps.indexOf(pw.step);
        let next = pw.steps[i + 1];
        if (next === 'swap' && !this.canSwapAny(pw.by)) next = undefined;
        if (next) {
            pw.step = next;
            this._emit({ t: 'power', p: pw.by, rank: pw.rank, step: next });
        } else {
            this.power = null;
            this._nextTurn();
        }
    }

    _peek({ p, target }) {
        if (this.phase !== 'power' || p !== this.power.by || this.power.step !== 'look') return 'Ahora no puedes mirar una carta.';
        if (!target || !this._validSlot(target.p, target.s)) return 'Esa carta no existe.';
        this._emit({ t: 'peek', by: p, target: { p: target.p, s: target.s }, card: this.card(target.p, target.s), secret: true });
        this._advancePower();
        return null;
    }

    _swapCards({ p, a, b }) {
        if (this.phase !== 'power' || p !== this.power.by || this.power.step !== 'swap') return 'Ahora no puedes cambiar cartas.';
        if (!a || !b || !this._validSlot(a.p, a.s) || !this._validSlot(b.p, b.s)) return 'Esa carta no existe.';
        if (a.p === b.p) return 'Las dos cartas tienen que ser de jugadores distintos.';
        if ((this.isProtected(a.p) && a.p !== p) || (this.isProtected(b.p) && b.p !== p)) return 'Las cartas de quien ha cantado Pedro no se tocan.';
        const A = this.players[a.p].slots, B = this.players[b.p].slots;
        [A[a.s], B[b.s]] = [B[b.s], A[a.s]];
        this._emit({ t: 'swapCards', by: p, a: { p: a.p, s: a.s }, b: { p: b.p, s: b.s } });
        this._advancePower();
        return null;
    }

    _pass({ p }) {
        if (this.phase !== 'power' || p !== this.power.by) return 'No tienes ningún poder que pasar.';
        this._emit({ t: 'pass', p, rank: this.power.rank, step: this.power.step });
        this._advancePower();
        return null;
    }


    /**
     * Quemar: se puede en cualquier momento de la ronda (también en el turno de otro).
     * top: la carta de la mesa que veía quien quema; si ya ha cambiado, no vale.
     */
    _burn({ p, target, top }) {
        if (!BURN_PHASES.includes(this.phase) || !this.top) return 'Ahora no se puede quemar.';
        if (!Number.isInteger(p) || !this.players[p]) return 'Ese jugador no existe.';
        if (top != null && top !== this.top.id) return 'La carta de la mesa ya ha cambiado.';
        if (this.isFrozen(p)) return 'Has cantado Pedro: ya no puedes tocar tus cartas.';
        if (!target || !this._validSlot(target.p, target.s)) return 'Esa carta no existe.';
        if (target.p !== p && !this.rules.burnOthers) return 'Con estas reglas solo puedes quemar tus cartas.';
        if (this.isProtected(target.p) && target.p !== p) return 'Las cartas de quien ha cantado Pedro no se tocan.';
        const card = this.card(target.p, target.s);
        const t = { p: target.p, s: target.s };
        if (card.rank === this.top.rank) {
            this.players[t.p].slots[t.s] = null;
            this.table.push(card);
            this._emit({ t: 'burn', by: p, target: t, card });
            if (t.p !== p && this.rules.burnGive && this.countOf(p) > 0) {
                // Quien quema la carta de otro le da una suya. Después la ronda sigue donde estaba.
                this.give = { by: p, to: t, back: this.phase };
                this.phase = 'give';
                this._emit({ t: 'giveAsk', by: p, to: t });
                return null;
            }
            this._checkEmpty();
            return null;
        }
        // Falla: la carta se ha visto, vuelve a su sitio y quien falló se lleva castigo.
        // Se puede seguir intentando mientras dure la ventana: cada fallo, otro castigo.
        this._emit({ t: 'burnFail', by: p, target: t, card });
        const slots = [];
        for (let k = 0; k < this.rules.penaltyCards; k++) {
            if (!this._refill()) break;
            const c = this.deck.pop();
            const hand = this.players[p].slots;
            let s = hand.indexOf(null);
            if (s < 0) { s = hand.length; hand.push(c); } else hand[s] = c;
            slots.push(s);
        }
        if (slots.length) this._emit({ t: 'penalty', p, slots });
        return null;
    }

    _give({ p, slot }) {
        if (this.phase !== 'give' || p !== this.give.by) return 'Ahora no tienes que dar ninguna carta.';
        if (!this._validSlot(p, slot)) return 'Ahí no tienes carta.';
        const to = this.give.to;
        this.players[to.p].slots[to.s] = this.card(p, slot);
        this.players[p].slots[slot] = null;
        this._emit({ t: 'give', by: p, from: slot, to: { p: to.p, s: to.s } });
        this.phase = this.give.back;
        this.give = null;
        this._checkEmpty();
        return null;
    }

    /** Quien se queda sin cartas gana: se acaba la ronda y se descubren todas. */
    _checkEmpty() {
        if (this.players.some(pl => !pl.slots.some(Boolean))) this._reveal('empty');
    }
}

// Para las pruebas con Node (en el navegador no hace nada).
if (typeof module !== 'undefined') {
    module.exports = { GAME_VERSION, MAX_PLAYERS, SUITS, RANK_NAME, POWERS, DEFAULT_RULES, makeRng, makeDeck, deckRanks, averageRank, rankPoints, scoreCards, sameSlot, PedroGame, BURN_PHASES };
}
