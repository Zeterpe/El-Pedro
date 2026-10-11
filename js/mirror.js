/* =============================================
   EL PEDRO — mirror.js
   En una partida online, quien se une a una sala
   no tiene la baraja: el anfitrión le manda lo que
   pasa y una foto de la mesa. MirrorGame guarda esa
   foto y responde a las mismas preguntas que
   PedroGame (de quién es el turno, qué cartas hay,
   qué se puede hacer), sin conocer cartas ocultas.
   ============================================= */
'use strict';

const HIDDEN = Object.freeze({ hidden: true });   // carta boca abajo que no conoces

class MirrorGame {
    constructor({ names, rules, me }) {
        this.rules = { ...DEFAULT_RULES, ...rules };
        this.me = me;
        this.players = names.map((name, index) => ({ name, index, slots: [], wins: 0 }));
        this.phase = 'idle';
        this.round = 0; this.dealer = 0; this.current = 0; this.caller = null;
        this.deck = { length: 0 }; this.table = { length: 0 };
        this.top = null;
        this.power = null; this.give = null;
        this.drawn = null; this.drawnFrom = null;
        this.peekPending = new Set();
        this.turns = 0;
        this.winners = null;
    }

    get n() { return this.players.length; }

    /** Pone la mesa como la manda el anfitrión. */
    setView(v) {
        this.phase = v.phase; this.round = v.round; this.dealer = v.dealer; this.current = v.current;
        this.caller = v.caller;
        this.deck = { length: v.deckCount }; this.table = { length: v.tableCount };
        this.top = v.top;
        v.players.forEach((p, i) => {
            this.players[i].wins = p.wins;
            this.players[i].slots = p.slots.map(b => b ? HIDDEN : null);
        });
        this.power = v.power ? { ...v.power } : null;
        this.give = v.give;
        this.drawnFrom = v.drawnFrom;
        if (v.phase !== 'drawn') this.drawn = null;
        this.peekPending = new Set(v.peekPending || []);
        this.turns = v.turns;
        this.winners = v.winners;
    }

    /** Lo que se puede saber de los sucesos (la carta robada, si es tuya o viene de la mesa). */
    observe(e) {
        if (e.t === 'draw' && e.card && (e.p === this.me || e.from === 'table')) this.drawn = e.card;
    }
}

// Las preguntas sobre la mesa son las mismas que en PedroGame.
for (const m of ['card', 'slotsOf', 'countOf', 'isProtected', 'isFrozen', 'targets', 'canSwapAny', 'canBurn', 'legal']) {
    MirrorGame.prototype[m] = PedroGame.prototype[m];
}

/** Lo que un jugador puede ver de un suceso: sin las cartas que no le corresponden. */
function eventFor(e, seat) {
    switch (e.t) {
        case 'draw': return e.secret && e.p !== seat ? { ...e, card: null } : e;
        case 'peek': return e.by !== seat ? { ...e, card: null } : e;
        case 'swap': return e.secret && e.p !== seat ? { ...e, drawn: null } : e;
        default: return e;
    }
}
