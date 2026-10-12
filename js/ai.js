/* =============================================
   EL PEDRO — ai.js
   La memoria de cada jugador (lo que sabe de cada
   carta de la mesa) y los rivales de la máquina.
   Los rivales solo saben lo que verían en una mesa
   de verdad: lo que han mirado, lo que se tira a la
   mesa y por dónde se mueven las cartas. Según su
   dificultad, se les olvidan cosas o se confunden.
   ============================================= */
'use strict';

/**
 * Lo que un jugador sabe de cada carta. Sigue las cartas cuando se cambian
 * de sitio, aunque no sepa cuáles son (sabe que «su 3 ahora está en la mano de Paco»).
 */
class Memory {
    constructor(me, { forget = 0, mistake = 0, rng = null } = {}) {
        this.me = me;
        this.forget = forget;
        this.mistake = mistake;
        this.rng = rng || makeRng(Date.now() + me * 7919);
        this.known = new Map();   // 'p:s' → { rank, suit }
        this.drawn = null;        // carta que tengo robada ahora mismo
    }

    static key(p, s) { return p + ':' + s; }
    get(p, s) { return this.known.get(Memory.key(p, s)) || null; }
    rank(p, s) { return this.get(p, s)?.rank ?? null; }
    set(p, s, card) {
        let c = { rank: card.rank, suit: card.suit };
        if (this.mistake && this.rng.chance(this.mistake)) {
            // Se confunde de número (y no se da cuenta).
            const d = this.rng.chance(0.5) ? 1 : -1;
            c = { rank: Math.min(12, Math.max(1, c.rank + d)), suit: c.suit, wrong: true };
        }
        this.known.set(Memory.key(p, s), c);
    }
    del(p, s) { this.known.delete(Memory.key(p, s)); }
    swap(a, b) {
        const ka = Memory.key(a.p, a.s), kb = Memory.key(b.p, b.s);
        const va = this.known.get(ka), vb = this.known.get(kb);
        this.known.delete(ka); this.known.delete(kb);
        if (vb) this.known.set(ka, vb);
        if (va) this.known.set(kb, va);
    }

    /** Se olvida de algunas cartas (se llama una vez por turno propio). */
    fade() {
        if (!this.forget) return;
        for (const k of [...this.known.keys()]) if (this.rng.chance(this.forget)) this.known.delete(k);
    }

    observe(e) {
        const me = this.me;
        switch (e.t) {
            case 'round': this.known.clear(); this.drawn = null; break;
            case 'peek': if (e.by === me) this.set(e.target.p, e.target.s, e.card); break;
            case 'draw':
                if (e.p === me) this.drawn = { rank: e.card.rank, suit: e.card.suit };
                break;
            case 'swap':
                if (e.p === me) { this.known.set(Memory.key(me, e.slot), { rank: e.drawn.rank, suit: e.drawn.suit }); this.drawn = null; }
                else if (!e.secret) this.set(e.p, e.slot, e.drawn);
                else this.del(e.p, e.slot);
                break;
            case 'discard': if (e.p === me) this.drawn = null; break;
            case 'swapCards': this.swap(e.a, e.b); break;
            case 'burn': this.del(e.target.p, e.target.s); break;
            case 'burnFail': this.set(e.target.p, e.target.s, e.card); break;
            case 'penalty': for (const s of e.slots) this.del(e.p, s); break;
            case 'give': {
                const v = this.known.get(Memory.key(e.by, e.from));
                this.del(e.by, e.from);
                if (v) this.known.set(Memory.key(e.to.p, e.to.s), v); else this.del(e.to.p, e.to.s);
                break;
            }
            case 'reveal': this.known.clear(); this.drawn = null; break;
        }
    }
}

// ── Personajes ────────────────────────────────────────

const BOT_LEVELS = {
    // forget: probabilidad de olvidar cada carta en cada turno · mistake: de recordarla mal
    // sloppy: de despistarse al decidir · react: lo que tarda en quemar (ms)
    facil:   { label: 'fácil',   forget: 0.30, mistake: 0.20, sloppy: 0.30, callAt: 11, margin: 0,   react: [2200, 3800], bluff: 0.03 },
    normal:  { label: 'normal',  forget: 0.08, mistake: 0.04, sloppy: 0.08, callAt: 7,  margin: 1,   react: [1300, 2500], bluff: 0.04 },
    dificil: { label: 'difícil', forget: 0,    mistake: 0,    sloppy: 0,    callAt: 5,  margin: 1.5, react: [800, 1600],  bluff: 0.02 },
};

/** Rivales con nombre y carácter. pitch y rate cambian su voz en los comentarios. */
const CHARACTERS = [
    {
        id: 'paco', name: 'Paco', level: 'facil', pitch: 0.8, rate: 1.0,
        intro: 'Paco, que se despista con una mosca',
        quips: {
            call: ['¡Pedro! Creo. Sí, sí, Pedro.', 'Pedro, y que sea lo que Dios quiera.'],
            burnFail: ['Ay, que juraría que era esa.', 'Uy. Esa no era.'],
            win: ['¡Anda! ¡He ganado yo!', 'Ni yo me lo creo.'],
            burned: ['¿Mi carta? ¿Por qué mi carta?'],
            cut: ['¡Toma triunfo!', 'Uy, que tenía triunfo.'],
            bigTrick: ['¡Mira lo que me llevo!', 'Esto pesa, esto pesa.'],
            cante: ['¡Que canto! ¿Se canta así?'],
        },
    },
    {
        id: 'lucia', name: 'Lucía', level: 'normal', pitch: 1.25, rate: 1.05,
        intro: 'Lucía, que juega rápido y sonriendo',
        quips: {
            call: ['¡Pedro! Contad bien vuestras cartas.', 'Pedro. Ya me diréis.'],
            burnFail: ['Vaya, me he precipitado.'],
            win: ['¡Toma! Esa me la llevo.', 'Lo sabía.'],
            burned: ['Oye, que esa la tenía controlada.'],
            cut: ['Fallo, y sin pestañear.'],
            bigTrick: ['Para el saco.', 'Muy rica esta baza.'],
            cante: ['Las tenía guardadas.'],
        },
    },
    {
        id: 'carmen', name: 'la abuela Carmen', level: 'dificil', pitch: 1.1, rate: 0.95,
        intro: 'la abuela Carmen, que no olvida ni una carta',
        quips: {
            call: ['Pedro, cariño.', 'Pedro. Y no me pongáis esa cara.'],
            burnFail: ['Hasta la abuela se equivoca, hijo.'],
            win: ['Lo que no sepa la abuela...', 'Cincuenta años jugando, mi vida.'],
            burned: ['Muy bien visto, muy bien.'],
            cut: ['Triunfo, hijo, triunfo.'],
            bigTrick: ['Esto para la abuela.', 'Ay, qué bien me viene.'],
            cante: ['Las cuarenta, como en los buenos tiempos.'],
        },
    },
    {
        id: 'toni', name: 'Toni', level: 'normal', pitch: 0.9, rate: 1.1, bluff: 0.22, callBonus: 3,
        intro: 'Toni, que canta Pedro antes de tiempo para despistar',
        quips: {
            call: ['¡Pedro! ¿Qué pasa? ¿Os da miedo?', '¡Pedro! A ver quién se atreve.'],
            burnFail: ['Era una prueba. Para ver si estabais atentos.'],
            win: ['Farol del bueno, señores.', '¡Os lo dije!'],
            burned: ['Eso no lo he visto venir.'],
            cut: ['¡Zas! Fallo.', 'Os lo esperabais, ¿eh?'],
            bigTrick: ['¿Quién da más?', 'Baza gorda para Toni.'],
            cante: ['¡Cantando, que es gerundio!'],
        },
    },
    {
        id: 'marta', name: 'Marta', level: 'dificil', pitch: 1.15, rate: 1.15,
        intro: 'Marta, que cuenta todas las cartas',
        quips: {
            call: ['Pedro. Los números no mienten.', 'Pedro. Lo tengo calculado.'],
            burnFail: ['Error de cálculo. No volverá a pasar.'],
            win: ['Estadística pura.', 'Como estaba previsto.'],
            burned: ['Interesante jugada.'],
            cut: ['Fallo calculado.'],
            bigTrick: ['Todo según lo previsto.'],
            cante: ['Cante. Puntos asegurados.'],
        },
    },
    {
        id: 'rafa', name: 'Rafa', level: 'facil', pitch: 1.0, rate: 0.95,
        intro: 'Rafa, que acaba de aprender a jugar',
        quips: {
            call: ['¿Así se canta? Pues ¡Pedro!', 'Pedro, ¿vale?'],
            burnFail: ['Perdón, perdón, sigo aprendiendo.'],
            win: ['¿Gano yo? ¡Qué ilusión!'],
            burned: ['¿Se puede hacer eso?'],
            cut: ['¿Esto es fallar? ¡Pues fallo!'],
            bigTrick: ['¡Me la llevo yo! ¿Verdad?'],
            cante: ['¿Puedo cantar? ¡Pues canto!'],
        },
    },
];

/** Elige los rivales según la dificultad: facil, normal, dificil o mezcla. */
function pickRivals(count, difficulty, rng) {
    const pool = CHARACTERS.filter(c => difficulty === 'mezcla' || c.level === difficulty);
    const order = rng.shuffle(pool.slice());
    if (difficulty === 'mezcla') {
        // Que haya de todo: una de cada dificultad si caben.
        order.sort((a, b) => ['facil', 'normal', 'dificil'].indexOf(a.level) - ['facil', 'normal', 'dificil'].indexOf(b.level));
        const byLevel = ['normal', 'facil', 'dificil'].map(l => order.filter(c => c.level === l));
        const out = [];
        while (out.length < count && byLevel.some(l => l.length)) for (const l of byLevel) if (l.length && out.length < count) out.push(l.shift());
        return out;
    }
    const out = order.slice(0, count);
    // Si no hay bastantes de esa dificultad, se completan con otros jugando a ese nivel.
    for (const c of rng.shuffle(CHARACTERS.filter(c => !out.includes(c)))) {
        if (out.length >= count) break;
        out.push({ ...c, level: difficulty });
    }
    return out;
}

// ── El rival de la máquina ────────────────────────────

class Bot {
    constructor(game, me, character, rng) {
        this.game = game;
        this.me = me;
        this.char = character;
        this.level = { ...BOT_LEVELS[character.level || 'normal'] };
        if (character.bluff != null) this.level.bluff = character.bluff;
        if (character.callBonus) this.level.callAt += character.callBonus;
        this.rng = rng;
        this.mem = new Memory(me, { forget: this.level.forget, mistake: this.level.mistake, rng });
        this.myTurns = 0;
    }

    get E() { return averageRank(this.game.rules.deck); }

    observe(e) {
        this.mem.observe(e);
        if (e.t === 'round') this.myTurns = 0;
        if (e.t === 'turn' && e.p === this.me) { this.myTurns++; this.mem.fade(); }
    }

    /** Valor que cree que tiene una carta (la media si no la conoce). */
    guess(p, s) { const r = this.mem.rank(p, s); return r == null ? this.E : r; }

    estimate(p) {
        const g = this.game, slots = g.slotsOf(p);
        if (!slots.length) return 0;
        const known = slots.map(s => this.mem.rank(p, s));
        if (g.rules.allEqualOne && slots.length >= 2 && known.every(r => r != null && r === known[0])) return 1;
        // Los demás también mejoran su mano con el tiempo: se les supone algo mejor que la media.
        const unknown = p === this.me ? this.E : Math.max(3.5, this.E - g.turns / g.n * 0.35);
        return known.reduce((a, r) => a + (r == null ? unknown : r), 0);
    }

    unknownOwn() { return this.game.slotsOf(this.me).filter(s => this.mem.rank(this.me, s) == null); }

    /** La carta propia que más conviene quitarse: la de mayor valor (conocida o supuesta). */
    worstOwn() {
        let best = null, bestV = -1;
        for (const s of this.game.slotsOf(this.me)) {
            const r = this.mem.rank(this.me, s);
            const v = r == null ? this.E + 0.01 : r;   // a igualdad, mejor la conocida
            if (v > bestV || (v === bestV && r != null)) { bestV = v; best = s; }
        }
        return best == null ? null : { s: best, v: bestV, known: this.mem.rank(this.me, best) != null };
    }

    // ── Decisiones ────────────────────────────────────

    choosePeekStart(count) {
        return this.rng.shuffle(this.game.slotsOf(this.me).slice()).slice(0, count);
    }

    chooseTurn() {
        const g = this.game;
        if (g.caller === null && this.shouldCall()) return { type: 'call', p: this.me };
        if (g.rules.takeFromTable && g.top && g.countOf(this.me)) {
            const w = this.worstOwn();
            if (w && g.top.rank <= 3 && w.v > g.top.rank + 2) return { type: 'take', p: this.me };
        }
        return { type: 'draw', p: this.me };
    }

    shouldCall() {
        const g = this.game, L = this.level;
        const mine = this.estimate(this.me);
        const rivals = g.players.map((_, i) => i).filter(i => i !== this.me).map(i => this.estimate(i));
        const best = Math.min(...rivals);
        const unknown = this.unknownOwn().length;
        if (this.myTurns < 2 && !(mine <= 2 && unknown === 0)) return false;
        if (mine <= 2 && unknown === 0) return true;
        // Si la ronda se alarga mucho, se conforma con menos.
        const patience = Math.max(0, (g.turns - 40) / 8);
        if (mine <= L.callAt + patience && mine < best - L.margin + patience) return true;
        // Farol: cantar con una mano regular para meter prisa.
        return mine <= L.callAt + 5 && this.rng.chance(L.bluff);
    }

    chooseDrawn(card) {
        const g = this.game, me = this.me, v = card.rank;
        const slots = g.slotsOf(me);
        if (!slots.length) return { type: 'discard', p: me };
        const fromTable = g.drawnFrom === 'table';
        if (this.rng.chance(this.level.sloppy)) {
            // Despiste: decide sin pensar mucho.
            if (fromTable || this.rng.chance(0.5)) return { type: 'swap', p: me, slot: this.rng.pick(slots) };
            return { type: 'discard', p: me };
        }
        const w = this.worstOwn();
        // Las figuras con poder casi siempre se tiran para usar el poder.
        if (!fromTable && g.rules.powers && POWERS[v] && !(w && w.known && w.v > v + 1)) return { type: 'discard', p: me };
        // ¿Hace pareja con todas las demás conocidas? (todas iguales valen 1)
        if (g.rules.allEqualOne && slots.length >= 2) {
            const others = slots.map(s => this.mem.rank(me, s));
            const counts = others.filter(r => r === v).length;
            const odd = slots.filter(s => this.mem.rank(me, s) !== v);
            if (counts === slots.length - 1 && odd.length === 1) return { type: 'swap', p: me, slot: odd[0] };
        }
        if (w && w.v > v) return { type: 'swap', p: me, slot: w.s };
        if (fromTable) return { type: 'swap', p: me, slot: w ? w.s : slots[0] };
        return { type: 'discard', p: me };
    }

    choosePower(step) {
        const g = this.game, me = this.me;
        if (this.rng.chance(this.level.sloppy)) return { type: 'pass', p: me };
        if (step === 'look') {
            const mine = this.unknownOwn();
            if (mine.length) return { type: 'peek', p: me, target: { p: me, s: this.rng.pick(mine) } };
            // Mira una carta desconocida del rival que parece ir mejor.
            const rivals = g.players.map((_, i) => i).filter(i => i !== me && g.countOf(i))
                .sort((a, b) => this.estimate(a) - this.estimate(b));
            for (const p of rivals) {
                const un = g.slotsOf(p).filter(s => this.mem.rank(p, s) == null);
                if (un.length) return { type: 'peek', p: me, target: { p, s: this.rng.pick(un) } };
            }
            return { type: 'pass', p: me };
        }
        // Cambiar: mi peor carta por una buena (o desconocida) de otro.
        const w = this.worstOwn();
        if (!w) return { type: 'pass', p: me };
        let target = null, gain = 0;
        for (const t of g.targets('swap', me)) {
            if (t.p === me) continue;
            const r = this.mem.rank(t.p, t.s);
            const val = r == null ? this.E : r;
            const d = w.v - val + (r != null ? 0.3 : 0);
            if (d > gain) { gain = d; target = t; }
        }
        if (target && gain >= 2.5) return { type: 'swapCards', p: me, a: { p: me, s: w.s }, b: target };
        return { type: 'pass', p: me };
    }

    /** ¿Quema algo? Devuelve el objetivo y cuánto tarda en reaccionar, o null. */
    chooseBurn(value) {
        if (!this.game.canBurn(this.me)) return null;
        if (this.rng.chance(this.level.sloppy)) return null;   // no se da cuenta
        const target = this.burnTarget(value);
        if (!target) return null;
        const [lo, hi] = this.level.react;
        const delay = this.rng.range(lo, hi) * (target.p === this.me ? 1 : 1.15);
        return { target, delay };
    }

    /** La carta que cree que es igual a value: primero las suyas, después las de los demás. */
    burnTarget(value) {
        const g = this.game, me = this.me;
        if (!g.canBurn(me)) return null;
        for (const s of g.slotsOf(me)) if (this.mem.rank(me, s) === value) return { p: me, s };
        if (g.rules.burnOthers && g.countOf(me) > 0) {
            for (const t of g.targets('burn', me)) {
                if (t.p !== me && this.mem.rank(t.p, t.s) === value) return t;
            }
        }
        return null;
    }

    chooseGive() {
        const w = this.worstOwn();
        return { type: 'give', p: this.me, slot: w ? w.s : this.game.slotsOf(this.me)[0] };
    }

    quip(kind) {
        const list = this.char.quips?.[kind];
        return list && list.length ? this.rng.pick(list) : null;
    }
}

if (typeof module !== 'undefined') {
    const R = require('./rules.js');
    Object.assign(globalThis, { makeRng: R.makeRng, averageRank: R.averageRank, POWERS: R.POWERS });
    module.exports = { Memory, Bot, BOT_LEVELS, CHARACTERS, pickRivals };
}
