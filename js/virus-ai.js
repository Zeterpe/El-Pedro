/* =============================================
   EL PEDRO — virus-ai.js
   Los rivales de la máquina en el Virus. Ven los
   cuerpos de todos y su propia mano, como en una
   mesa de verdad. Prueban cada jugada y se quedan
   con la que más les acerca a ganar y más frena
   a quien va por delante. Los fáciles se despistan;
   los difíciles vigilan al que está a punto de ganar.
   ============================================= */
'use strict';

const VIRUS_LEVELS = {
    // sloppy: probabilidad de jugar sin pensar · watch: cuánto miran a los rivales · noise: dudas
    facil:   { sloppy: 0.3,  watch: 0.4, noise: 6 },
    normal:  { sloppy: 0.06, watch: 0.9, noise: 2 },
    dificil: { sloppy: 0,    watch: 1.2, noise: 0 },
};

/** Lo que vale un cuerpo: cada órgano según cómo está, y mucho más cuanto más cerca de ganar. */
function virusBodyValue(body) {
    let v = 0, healthy = 0;
    for (const o of body) {
        const st = organState(o);
        if (st === 'infectado') v += 3;
        else { healthy++; v += st === 'inmune' ? 22 : st === 'vacunado' ? 14 : 10; }
    }
    if (healthy >= VIRUS_TO_WIN) return 10000;
    return v + [0, 0, 6, 25, 0][healthy];
}

class VirusBot {
    constructor(game, me, character, rng) {
        this.game = game;
        this.me = me;
        this.char = character;
        this.level = { ...VIRUS_LEVELS[character.level || 'normal'] };
        this.rng = rng;
    }

    observe() { }

    /** Su jugada: jugar una carta o descartar las que no le sirven. */
    chooseTurn() {
        const g = this.game, me = this.me, L = this.level;
        const plays = g.plays(me);
        const useless = g.slotsOf(me).filter(s => !g.playsFor(me, s).length);
        if (plays.length && this.rng.chance(L.sloppy)) return this.clean(this.rng.pick(plays));
        let best = null, top = -Infinity;
        const base = this.value(g.players.map(pl => pl.body));
        for (const a of plays) {
            const v = this.simulate(a) - base + (L.noise ? this.rng.range(-L.noise, L.noise) : 0);
            if (v > top) { top = v; best = a; }
        }
        // Si nada mejora la mesa y hay cartas que no sirven, mejor cambiarlas.
        if (best && (top > 0.5 || !useless.length)) return this.clean(best);
        if (useless.length) return { type: 'discard', p: me, slots: useless };
        return { type: 'discard', p: me, slots: g.slotsOf(me).slice(0, 1) };
    }

    clean(a) {
        const out = { type: 'play', p: a.p, slot: a.slot };
        for (const k of ['target', 'a', 'b', 'moves']) if (a[k]) out[k] = a[k];
        return out;
    }

    /** Lo buena que es la mesa para mí: mi cuerpo menos el del rival más peligroso. */
    value(bodies) {
        const g = this.game, me = this.me;
        const mine = Math.max(...g.sides()[g.teamPlay ? g.team(me) : me].map(i => virusBodyValue(bodies[i])));
        const theirs = g.rivals(me).map(i => virusBodyValue(bodies[i]));
        return mine - this.level.watch * Math.max(0, ...theirs);
    }

    /** Cómo queda la mesa tras una jugada, sin tocar la partida de verdad. */
    simulate(a) {
        const g = this.game;
        const sim = Object.create(VirusGame.prototype);
        Object.assign(sim, {
            rules: g.rules, phase: 'turn', current: this.me, deck: [], discardPile: [], history: [], _out: null,
            players: g.players.map(pl => ({ ...pl, hand: pl.hand.slice(), body: pl.body.map(o => ({ organ: o.organ, items: o.items.slice() })) })),
        });
        const c = sim.handOf(this.me)[a.slot];
        sim.handOf(this.me)[a.slot] = null;
        sim._apply(this.me, c, a);
        let v = this.value(sim.players.map(pl => pl.body));
        // El guante no cambia los cuerpos: vale más cuanto más cerca de ganar están los demás.
        if (a.effect === 'guante') v += 4 + this.game.rivals(this.me).reduce((s, q) => s + this.game.healthyCount(q) * 3, 0);
        return v;
    }
}

if (typeof module !== 'undefined') {
    const V = require('./virus.js');
    Object.assign(globalThis, { organState: V.organState, VIRUS_TO_WIN: V.VIRUS_TO_WIN, VirusGame: V.VirusGame });
    module.exports = { VirusBot, VIRUS_LEVELS, virusBodyValue };
}
