/* =============================================
   EL PEDRO — brisca-ai.js
   Los rivales de la máquina en la Brisca. Solo
   saben lo que se ve en una mesa de verdad: sus
   cartas, la muestra y las cartas que se juegan.
   Los difíciles cuentan los triunfos que han salido;
   los fáciles se despistan y tiran cartas buenas.
   ============================================= */
'use strict';

const BRISCA_LEVELS = {
    // sloppy: probabilidad de jugar sin pensar · safe: confianza en que una baza no se la quiten
    facil:   { sloppy: 0.35, counts: false, safe: 0.45, cargar: 0.6 },
    normal:  { sloppy: 0.10, counts: false, safe: 0.55, cargar: 0.8 },
    dificil: { sloppy: 0,    counts: true,  safe: 0.6,  cargar: 1 },
};

class BriscaBot {
    constructor(game, me, character, rng) {
        this.game = game;
        this.me = me;
        this.char = character;
        this.level = { ...BRISCA_LEVELS[character.level || 'normal'] };
        this.rng = rng;
        this.seen = new Set();   // cartas que ya han salido en esta mano ('copas1')
    }

    observe(e) {
        if (e.t === 'round') this.seen.clear();
        if (e.t === 'play') this.seen.add(e.card.suit + e.card.rank);
    }

    /** Su jugada: cantar si puede, cambiar la muestra si le conviene y, si no, jugar una carta. */
    chooseTurn() {
        const g = this.game, me = this.me;
        const cantes = g.canteSuits(me);
        if (cantes.length) return { type: 'cante', p: me, suit: cantes[0] };
        if (g.canSwapTrump(me) && !this.rng.chance(this.level.sloppy / 2)) return { type: 'swapTrump', p: me };
        return { type: 'play', p: me, slot: this.choosePlay() };
    }

    /** ¿Quedan triunfos más altos que esta carta sin salir (y que no tiene él)? */
    higherTrumpsOut(card) {
        const g = this.game, mine = new Set(g.handOf(this.me).filter(Boolean).map(c => c.suit + c.rank));
        const ranks = BRISCA_ORDER.filter(r => (g.rules.deck === 48 || (r !== 8 && r !== 9)) && BRISCA_STRENGTH[r] > briscaStrength(card));
        return ranks.some(r => { const k = g.trumpSuit + r; return !this.seen.has(k) && !mine.has(k); });
    }

    /** Coste de gastar un triunfo: cuanto más alto, más duele. */
    trumpCost(c) {
        if (c.suit !== this.game.trumpSuit) return 0;
        return 3 + briscaStrength(c) * 0.6 + briscaPoints(c) * 0.5;
    }

    choosePlay() {
        const g = this.game, me = this.me, L = this.level;
        const slots = g.playable(me);
        const hand = g.handOf(me);
        if (slots.length === 1) return slots[0];
        if (this.rng.chance(L.sloppy)) return this.rng.pick(slots);
        const trump = g.trumpSuit;
        // Salir: la carta más pobre, sin puntos y que no sea triunfo.
        if (!g.trick.length) {
            const keepPair = s => g.rules.cantes && !g.deckEmpty && [11, 12].includes(hand[s].rank)
                && hand.some(c => c && c.suit === hand[s].suit && c.rank === (hand[s].rank === 12 ? 11 : 12)) && !g.sung.includes(hand[s].suit);
            const cost = s => {
                const c = hand[s];
                let v = briscaPoints(c) * 2 + briscaStrength(c) * 0.15 + this.trumpCost(c) * 1.5;
                if (keepPair(s)) v += 9;
                // Con el mazo acabado y el as de triunfo en la mano, conviene sacarlo para llevarse puntos.
                if (g.deckEmpty && c.suit === trump && L.counts && !this.higherTrumpsOut(c)) v -= 6;
                return v;
            };
            return slots.slice().sort((a, b) => cost(a) - cost(b))[0];
        }
        const best = g.best, led = g.led;
        const last = g.trick.length === g.n - 1;
        const trickPts = g.trick.reduce((s, t) => s + briscaPoints(t.card), 0);
        const partnerWins = g.teamPlay && g.team(best.p) === g.team(me);
        // Si va ganando su compañero, ¿lo tiene seguro?
        const partnerSafe = partnerWins && (last || (best.card.suit === trump && L.counts && !this.higherTrumpsOut(best.card)) || briscaStrength(best.card) >= 11);
        let pick = null, top = -Infinity;
        for (const s of slots) {
            const c = hand[s];
            const wins = briscaBeats(c, best.card, led, trump);
            let safe = last ? 1 : L.safe;
            if (wins && !last && c.suit === trump && L.counts && !this.higherTrumpsOut(c)) safe = 0.95;
            if (wins && !last && c.suit !== trump && trump && led !== trump) safe = Math.min(safe, 0.5);
            let v;
            if (partnerWins) {
                // Cargar: dar puntos al compañero si va a ganar; si no, tirar lo más pobre.
                v = (partnerSafe ? briscaPoints(c) * L.cargar : -briscaPoints(c) * 0.5) - this.trumpCost(c) * 1.2;
                if (wins && !partnerSafe) v += (trickPts + briscaPoints(c)) * 0.3;
            } else if (wins) {
                v = (trickPts + briscaPoints(c)) * safe - (1 - safe) * briscaPoints(c) - this.trumpCost(c) + 0.5;
                // Llevarse una baza sin puntos con un triunfo no compensa.
                if (trickPts === 0 && c.suit === trump) v -= 4;
            } else {
                v = -briscaPoints(c) - this.trumpCost(c) * 0.8 - briscaStrength(c) * 0.05;
            }
            if (v > top) { top = v; pick = s; }
        }
        return pick ?? slots[0];
    }

    quip(kind) {
        const list = this.char.quips?.[kind];
        return list && list.length ? this.rng.pick(list) : null;
    }
}

if (typeof module !== 'undefined') {
    const B = require('./brisca.js');
    Object.assign(globalThis, B);
    module.exports = { BriscaBot, BRISCA_LEVELS };
}
