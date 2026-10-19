/* =============================================
   EL PEDRO — parchis-ai.js
   Los rivales de la máquina en el Parchís. Ven el
   tablero como cualquiera: comen cuando pueden,
   buscan los seguros, huyen de las fichas que
   tienen detrás y meten fichas en la meta.
   Los fáciles se despistan; los difíciles miden
   cada peligro.
   ============================================= */
'use strict';

const PARCHIS_LEVELS = {
    // sloppy: probabilidad de mover sin pensar · fear: cuánto le preocupa que le coman · noise: dudas
    facil:   { sloppy: 0.35, fear: 0.5, noise: 8 },
    normal:  { sloppy: 0.08, fear: 1,   noise: 3 },
    dificil: { sloppy: 0,    fear: 1.4, noise: 0 },
};

/** Con dos dados: la probabilidad de poder avanzar justo d casillas con una ficha (un dado o los dos sumados). */
const PARCHIS_TWO_DICE = Array.from({ length: 13 }, (_, d) => {
    let n = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a === d || b === d || a + b === d) n++;
    return n / 36;
});

class ParchisBot {
    constructor(game, me, character, rng) {
        this.game = game;
        this.me = me;
        this.char = character;
        this.level = { ...PARCHIS_LEVELS[character.level || 'normal'] };
        this.rng = rng;
    }

    observe() { }

    /** Su jugada: tirar el dado o elegir ficha. */
    chooseTurn() {
        const g = this.game, me = this.me;
        if (g.phase === 'roll') return { type: 'roll', p: me };
        const m = this.chooseMove(g.options);
        return { type: 'move', p: me, o: m.o, i: m.i, d: m.die };
    }

    chooseMove(options) {
        if (options.length === 1) return options[0];
        const L = this.level;
        if (this.rng.chance(L.sloppy)) return this.rng.pick(options);
        let best = options[0], top = -Infinity;
        for (const m of options) {
            const v = this.score(m) + (L.noise ? this.rng.range(-L.noise, L.noise) : 0);
            if (v > top) { top = v; best = m; }
        }
        return best;
    }

    /** Lo peligrosa que es una casilla para una ficha de o: la probabilidad de que la coman en la próxima vuelta. */
    danger(o, sq, ignore = null) {
        const g = this.game;
        if (sq == null || PARCHIS_SAFE.has(sq)) return 0;
        let risk = 0;
        g.players.forEach((pl, q) => {
            if (g.team(q) === g.team(o)) return;
            const need = parchisProgress(pl.color, sq);
            if (need > PARCHIS_LAST) return;
            const seven = g.rules.sixSeven && g.homeCount(q) === 0;
            pl.pieces.forEach((qc, j) => {
                if (qc.pos < 0 || qc.pos > PARCHIS_LAST) return;
                if (ignore && ignore.o === q && ignore.i === j) return;
                const d = need - qc.pos;
                if (g.rules.twoDice) { if (d >= 1 && d <= 12) risk += PARCHIS_TWO_DICE[d]; }
                else if (d >= 1 && d <= 6 && !(seven && d === 6)) risk += 1 / 6;
                else if (d === 7 && seven) risk += 1 / 6;
                else if (d > 6 && d <= 12) risk += 1 / 36;   // con un 6 y otra tirada
                if (d === 20 && g.rules.eatCount) risk += 1 / 30;
            });
        });
        return Math.min(1, risk);
    }

    /** Lo que vale una jugada para él. */
    score(m) {
        const g = this.game, o = m.o, color = g.colorOf(o), L = this.level;
        let v = 0;
        if (m.capture) {
            const victim = g.piecesOf(m.capture.o)[m.capture.i];
            v += 60 + victim.pos * 0.4;
        }
        if (m.meta) v += 48;
        if (m.out) v += 30;
        // Entrar en el pasillo: allí ya no te comen.
        if (m.to > PARCHIS_LAST && m.from <= PARCHIS_LAST) v += 22;
        const fromSq = m.from >= 0 ? parchisSquare(color, m.from) : null;
        const before = fromSq != null && g.occupants(fromSq).length < 2 ? this.danger(o, fromSq) : 0;
        const after = m.sq != null ? this.danger(o, m.sq, m.capture) : 0;
        v += (before - after) * 45 * L.fear;
        if (m.sq != null && PARCHIS_SAFE.has(m.sq)) v += 5;
        // Hacer barrera con otra ficha suya o de su pareja.
        if (m.sq != null && !m.capture && g.occupants(m.sq).some(x => g.team(x.o) === g.team(o))) v += 6;
        // Deshacer su barrera deja sola a la otra ficha.
        if (fromSq != null && g.occupants(fromSq).length === 2) v -= this.danger(o, fromSq) * 20 * L.fear;
        // Avanzar, mejor con la ficha que va más adelantada si está a salvo.
        v += m.amount * 0.2 + m.to * 0.05;
        return v;
    }

    quip(kind) {
        const list = this.char.quips?.[kind];
        return list && list.length ? this.rng.pick(list) : null;
    }
}

if (typeof module !== 'undefined') {
    const P = require('./parchis.js');
    Object.assign(globalThis, P);
    module.exports = { ParchisBot, PARCHIS_LEVELS, PARCHIS_TWO_DICE };
}
