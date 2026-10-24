// Pruebas de la copia de la partida (snapshot.js) sin navegador: node tests/snapshot.test.js
// Si se va quien ha creado la sala, otro sigue la partida desde una copia: aquí se copia a mitad de
// partida y se juega a la vez en la de verdad y en la copia; las dos tienen que ir exactamente igual.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const R = require('../js/rules.js');
const { Snapshot } = require('../js/snapshot.js');
const { Bot, Memory, CHARACTERS, BOT_LEVELS } = require('../js/ai.js');
const { BriscaGame } = require('../js/brisca.js');
const { BriscaBot } = require('../js/brisca-ai.js');
const { ParchisGame } = require('../js/parchis.js');
const { ParchisBot } = require('../js/parchis-ai.js');
const { TrivialGame, TRIVIAL_BOARD } = require('../js/trivial.js');
const { TrivialBot } = require('../js/trivial-ai.js');
const { VirusGame } = require('../js/virus.js');
const { VirusBot } = require('../js/virus-ai.js');
const I = require('../js/impostor.js');
const { ImpostorBot, IMPOSTOR_LEVELS } = require('../js/impostor-ai.js');
for (const f of fs.readdirSync(path.join(__dirname, '..', 'js', 'trivial'))) require(path.join(__dirname, '..', 'js', 'trivial', f));

const { ImpostorGame, SHIP, IMPOSTOR_TASKS, IMPOSTOR_ROLES, IMPOSTOR_COLORS } = I;
const ctx = {
    makeRng: R.makeRng,
    classes: { PedroGame: R.PedroGame, BriscaGame, ParchisGame, TrivialGame, VirusGame, ImpostorGame, Bot, Memory, BriscaBot, ParchisBot, TrivialBot, VirusBot, ImpostorBot },
    externs: [['SHIP', SHIP], ['CHARACTERS', CHARACTERS], ['TRIVIAL_BANK', globalThis.TRIVIAL_BANK], ['TRIVIAL_BOARD', TRIVIAL_BOARD], ['IMPOSTOR_TASKS', IMPOSTOR_TASKS],
        ['IMPOSTOR_ROLES', IMPOSTOR_ROLES], ['IMPOSTOR_COLORS', IMPOSTOR_COLORS], ['POWERS', R.POWERS], ['BOT_LEVELS', BOT_LEVELS], ['IMPOSTOR_LEVELS', IMPOSTOR_LEVELS]],
};

const enc = root => { const { data, lost } = Snapshot.encode(root, ctx); assert.deepStrictEqual(lost, [], 'todo se puede copiar'); return JSON.stringify(data); };
/** Lo que llega al otro navegador: pasa por JSON. */
const copy = root => Snapshot.decode(JSON.parse(enc(root)), ctx);

// ── Lo básico ─────────────────────────────────────
{
    const card = { rank: 3, suit: 'oros' };
    const rng = R.makeRng(9); rng.next();
    const o = { a: [card, card], s: new Set([1, 'x']), m: new Map([['k', card]]), u: new Uint8Array([1, 2, 3]), inf: Infinity, nan: NaN, no: undefined, rng, rng2: rng, ship: SHIP };
    o.self = o;
    const c = copy(o);
    assert.strictEqual(c.a[0], c.a[1], 'la misma carta sigue siendo la misma');
    assert.strictEqual(c.m.get('k'), c.a[0]);
    assert(c.s.has('x') && c.s.size === 2);
    assert(c.u instanceof Uint8Array && c.u[2] === 3);
    assert.strictEqual(c.inf, Infinity); assert(Number.isNaN(c.nan)); assert('no' in c && c.no === undefined);
    assert.strictEqual(c.self, c, 'lo que se apunta a sí mismo');
    assert.strictEqual(c.rng, c.rng2);
    assert.strictEqual(c.rng.next(), rng.next(), 'el azar sigue igual');
    assert.strictEqual(c.ship, SHIP, 'la nave no se copia: es la de este navegador');
    assert.notDeepStrictEqual(Snapshot.encode({ f() { } }, ctx).lost, [], 'una función no se puede copiar, y se dice');
}

/**
 * Juega step veces con la partida de verdad y su copia a la vez, y comprueba que van igual.
 * mk: () => { g, bots }; step(g, bots): da un paso (devuelve false si se acaba).
 */
function twin(name, mk, step, { warm = 40, after = 400 } = {}) {
    const a = mk();
    for (let i = 0; i < warm && step(a.g, a.bots); i++);
    const b = copy({ g: a.g, bots: a.bots });
    assert.strictEqual(enc(b), enc({ g: a.g, bots: a.bots }), `${name}: la copia es igual`);
    assert.strictEqual(Object.getPrototypeOf(b.g), Object.getPrototypeOf(a.g), `${name}: con su clase`);
    b.bots.forEach((bot, i) => { if (bot) assert.strictEqual(bot.game, b.g, `${name}: cada rival juega en la copia`); void i; });
    let n = 0;
    for (; n < after; n++) {
        const goA = step(a.g, a.bots), goB = step(b.g, b.bots);
        assert.strictEqual(goA, goB, `${name}: las dos siguen o se acaban a la vez`);
        if (!goA) break;
    }
    assert.strictEqual(enc({ g: b.g, bots: b.bots }), enc({ g: a.g, bots: a.bots }), `${name}: después de ${n} pasos, igual`);
    return n;
}

const players = n => Array.from({ length: n }, (_, i) => ({ name: 'J' + i }));
const feedBots = (bots, res) => { assert(res.ok, res.error); for (const e of res.events) for (const b of bots) b?.observe(e); };

// ── Turnos: Brisca, Parchís, Trivial y Virus ──────
const turnGames = {
    brisca: [BriscaGame, BriscaBot, { pairs: true }],
    parchis: [ParchisGame, ParchisBot, {}],
    trivial: [TrivialGame, TrivialBot, {}],
    virus: [VirusGame, VirusBot, {}],
};
for (const [name, [G, B, rules]] of Object.entries(turnGames)) {
    for (const seed of [3, 11, 27]) {
        const n = name === 'parchis' ? 4 : name === 'brisca' ? 4 : 3 + seed % 3;
        twin(`${name} ${seed}`, () => {
            const g = new G({ players: players(n), rules, seed });
            const bots = g.players.map((_, i) => new B(g, i, { ...CHARACTERS[(seed + i) % CHARACTERS.length], level: ['facil', 'normal', 'dificil'][i % 3] }, R.makeRng(seed * 31 + i)));
            feedBots(bots, g.startRound());
            return { g, bots };
        }, (g, bots) => {
            if (g.phase === 'gameOver') return false;
            if (g.phase === 'roundOver') { feedBots(bots, g.startRound()); return true; }
            const p = g.actor ?? g.current;
            feedBots(bots, g.act(bots[p].chooseTurn()));
            return true;
        }, { warm: 20 + seed });
    }
}

// ── El Pedro: la copia piensa igual ───────────────
{
    const g = new R.PedroGame({ players: players(4), seed: 5 });
    g.startRound();
    const bots = g.players.map((_, i) => new Bot(g, i, CHARACTERS[i], R.makeRng(50 + i)));
    for (const p of g.players.map(pl => pl.index)) feedBots(bots, g.act({ type: 'peekStart', p, slots: bots[p].choosePeekStart(g.rules.peekCount ?? 2) }));
    const c = copy({ g, bots });
    assert.strictEqual(enc(c), enc({ g, bots }));
    assert(c.bots[1].mem instanceof Memory, 'la memoria de cada rival');
    assert.deepStrictEqual(c.bots[g.current].chooseTurn(), bots[g.current].chooseTurn(), 'decide lo mismo');
}

// ── El Impostor, en tiempo real ───────────────────
for (const seed of [2, 9]) {
    const n = 6 + seed % 3;
    const steps = twin(`impostor ${seed}`, () => {
        const g = new ImpostorGame({ players: players(n), rules: { tasks: 3, killCooldown: 15 }, seed });
        const bots = g.players.map((_, p) => new ImpostorBot(g, p, { ...CHARACTERS[p], level: 'normal' }, R.makeRng(seed * 37 + p)));
        feedBots(bots, g.startRound());
        return { g, bots };
    }, (g, bots) => {
        if (g.phase === 'meeting') {
            // Una reunión rápida: todos quieren votar, votan lo que piensan y se vuelve a la nave.
            for (const p of g.living()) { const r = g.act({ type: 'ready', p }); if (r.ok) feedBots(bots, r); }
            for (const p of g.living()) { const r = g.act({ type: 'vote', p, target: bots[p].vote(g.meeting) }); if (r.ok) feedBots(bots, r); }
            if (g.phase === 'meeting') feedBots(bots, { ok: true, events: g.resumeShip() });
            return g.phase === 'ship';
        }
        if (g.phase !== 'ship') return false;
        for (const b of bots) {
            const a = b.update(1 / 30);
            if (a) { const r = g.act({ ...a, p: b.me }); if (r.ok) feedBots(bots, r); }
            if (g.phase !== 'ship') return false;
        }
        feedBots(bots, { ok: true, events: g.tick(1 / 30) });
        return true;
    }, { warm: 30 * 12, after: 30 * 40 });
    assert(steps > 100, 'la nave sigue un rato');
}

console.log('Copia de la partida: bien.');
