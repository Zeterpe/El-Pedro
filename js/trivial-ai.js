/* =============================================
   EL PEDRO — trivial-ai.js
   Los rivales de la máquina en el Trivial. Cada
   personaje sabe más de lo suyo (la abuela Carmen,
   de historia; Marta, de ciencia) y acierta más
   o menos según su dificultad. Para moverse, van
   a por los quesitos que les faltan y, con todos,
   al centro.
   ============================================= */
'use strict';

const TRIVIAL_LEVELS = {
    // know: probabilidad de saber la respuesta (si no la sabe, contesta al azar) · sloppy: de moverse sin pensar
    facil:   { know: 0.38, sloppy: 0.3 },
    normal:  { know: 0.58, sloppy: 0.08 },
    dificil: { know: 0.78, sloppy: 0 },
};

/** Lo que mejor se le da a cada personaje. */
const TRIVIAL_FAVORITE = { paco: 'deportes', lucia: 'espectaculos', carmen: 'historia', toni: 'geografia', marta: 'ciencia', rafa: 'arte',
    terminator: 'ciencia', doraemon: 'ciencia', nobita: 'espectaculos', shinchan: 'espectaculos', manolo: 'deportes',
    puri: 'espectaculos', chispas: 'ciencia', michi: 'geografia', fermin: 'historia', pepa: 'arte', bacalao: 'geografia' };

class TrivialBot {
    constructor(game, me, character, rng) {
        this.game = game;
        this.me = me;
        this.char = character;
        this.level = { ...TRIVIAL_LEVELS[character.level || 'normal'] };
        this.favorite = TRIVIAL_FAVORITE[character.id] || null;
        this.rng = rng;
    }

    observe() { }

    /** Lo probable que es que sepa una pregunta de cat. */
    knows(cat, level = 2) {
        let k = this.level.know;
        if (cat === this.favorite) k += 0.2;
        k += level === 1 ? 0.15 : level === 3 ? -0.15 : 0;
        return Math.max(0.05, Math.min(0.97, k));
    }

    /** Su jugada: tirar, moverse, elegir categoría o contestar. */
    chooseTurn() {
        const g = this.game, me = this.me;
        if (g.phase === 'roll') return { type: 'roll', p: me };
        if (g.phase === 'move') return { type: 'move', p: me, to: this.chooseMove(g.options) };
        if (g.phase === 'pick') return { type: 'pick', p: me, cat: this.chooseCat() };
        if (g.phase === 'answer') return { type: 'answer', p: me, choice: this.chooseAnswer() };
        return null;
    }

    chooseAnswer() {
        const g = this.game, q = g.q;
        if (g.answerIdx != null && this.rng.chance(this.knows(q.cat, q.level))) return g.answerIdx;
        const left = [0, 1, 2, 3].filter(i => !(q.wrong || []).includes(i));
        return this.rng.pick(left);
    }

    /** La categoría: para sí misma, la que mejor sabe; para la final de un rival, la que más ha fallado ese rival. Con el quesito del dado, el que le falta que mejor sabe. */
    chooseCat() {
        const g = this.game, pk = g.pick;
        if (pk?.wild) {
            let best = pk.cats[0], top = -Infinity;
            for (const c of pk.cats) { const v = this.knows(c, 3) + this.rng.range(0, 0.05); if (v > top) { top = v; best = c; } }
            return best;
        }
        if (!pk || pk.for === this.me) {
            if (this.favorite) return this.favorite;
            return this.rng.pick(TRIVIAL_CATS);
        }
        const missed = g.tokenOf(pk.for).missed || {};
        const top = Math.max(0, ...TRIVIAL_CATS.map(c => missed[c] || 0));
        const worst = TRIVIAL_CATS.filter(c => (missed[c] || 0) === top);
        return this.rng.pick(worst.length ? worst : TRIVIAL_CATS);
    }

    /** Lo que vale cada destino: el quesito que le falta, el centro con todos, volver a tirar o lo que mejor sabe. */
    scoreDest(to) {
        const g = this.game, me = this.me, node = TRIVIAL_BOARD[to], D = TRIVIAL_DIST[to];
        const missing = g.missing(me);
        const done = g.hasAll(me);
        let v = 0;
        if (done && g.rules.hubFinal) {
            if (node.kind === 'hub') return 1000;
            v -= D[TRIVIAL_HUB] * 6;
        } else {
            if (node.kind === 'hq' && missing.includes(node.cat)) v += 200 + this.knows(node.cat) * 40;
            const near = Math.min(...missing.map(c => D[trivialHq(c)]));
            if (Number.isFinite(near)) v -= near * 4;
        }
        if (node.kind === 'roll') v += 30;
        else if (node.cat) v += this.knows(node.cat) * 25;
        return v;
    }

    chooseMove(options) {
        if (options.length === 1) return options[0].to;
        if (this.rng.chance(this.level.sloppy)) return this.rng.pick(options).to;
        let best = options[0].to, top = -Infinity;
        for (const m of options) {
            const v = this.scoreDest(m.to) + this.rng.range(-2, 2);
            if (v > top) { top = v; best = m.to; }
        }
        return best;
    }

    quip(kind) {
        const list = this.char.quips?.[kind];
        return list && list.length ? this.rng.pick(list) : null;
    }
}

if (typeof module !== 'undefined') {
    const T = require('./trivial.js');
    Object.assign(globalThis, T);
    module.exports = { TrivialBot, TRIVIAL_LEVELS, TRIVIAL_FAVORITE };
}
