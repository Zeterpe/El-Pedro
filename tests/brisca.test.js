// Pruebas de la Brisca sin navegador: node tests/brisca.test.js
'use strict';
const assert = require('assert');
const R = require('../js/rules.js');
const B = require('../js/brisca.js');
const { BriscaBot } = require('../js/brisca-ai.js');
const { CHARACTERS } = require('../js/ai.js');

const { BriscaGame, BriscaMirror, briscaEventFor, briscaBeats, briscaPoints } = B;

// Qué carta gana
const c = (rank, suit) => ({ rank, suit });
assert(briscaBeats(c(3, 'oros'), c(12, 'oros'), 'oros', 'copas'), 'el tres gana al rey');
assert(briscaBeats(c(2, 'copas'), c(1, 'oros'), 'oros', 'copas'), 'el triunfo gana');
assert(!briscaBeats(c(1, 'bastos'), c(2, 'oros'), 'oros', 'copas'), 'otro palo no gana');
assert(briscaBeats(c(1, 'copas'), c(3, 'copas'), 'oros', 'copas'), 'el as de triunfo gana al tres');

function play(n, rules, seed, levels) {
    const g = new BriscaGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'J' + i })), rules, seed });
    const bots = g.players.map((_, i) => new BriscaBot(g, i, { ...CHARACTERS[i % CHARACTERS.length], level: levels[i % levels.length] }, R.makeRng(seed + i)));
    const mirror = new BriscaMirror({ names: g.players.map(p => p.name), rules, me: 0 });
    let rounds = 0, steps = 0;
    const feed = res => {
        assert(res.ok, res.error);
        for (const e of res.events) {
            for (const b of bots) b.observe(e);
            const seen = briscaEventFor(e, 0);
            if (e.secret && e.p !== 0) assert(!(seen.card) && !(seen.cards || []).some(Boolean), 'secreto filtrado');
            mirror.observe(seen);
        }
        mirror.setView(g.view(0));
    };
    while (g.phase !== 'gameOver' && rounds < 50) {
        feed(g.startRound());
        rounds++;
        const total = g.deck.length + n * 3;
        assert.strictEqual(total % n, 0, 'la baraja se reparte igual');
        let tricksSeen = 0;
        while (g.phase === 'turn') {
            steps++;
            assert(steps < 5000, 'demasiados pasos');
            const p = g.current;
            if (p === 0) {
                assert.deepStrictEqual(mirror.legal(0), g.legal(0), 'el invitado ve las mismas jugadas');
                assert.deepStrictEqual(mirror.playable(0), g.playable(0));
            } else assert.deepStrictEqual(mirror.legal(0), []);
            const a = bots[p].chooseTurn();
            if (a.type === 'play') assert(g.playable(p).includes(a.slot), 'jugada válida');
            const before = g.tricks;
            feed(g.act(a));
            if (g.tricks > before) tricksSeen++;
        }
        const r = g.result;
        const extra = g.players.reduce((s, p) => s + p.bonus, 0);
        const sum = r.points.reduce((a, b) => a + b, 0);
        const removedPts = g.removed.reduce((s, x) => s + briscaPoints(x), 0);
        assert.strictEqual(sum, 120 - removedPts + extra, 'los puntos suman 120 (más cantes y diez de últimas)');
        assert.strictEqual(tricksSeen, total / n, 'todas las bazas');
        assert(g.players.every(p => !p.hand.some(Boolean)), 'sin cartas al final');
    }
    return { g, rounds };
}

let games = 0;
const ruleSets = [
    {},
    { deck: 48 },
    { arrastre: true },
    { cantes: true, lastTen: true },
    { swapTrump: 'siete', pairs: false },
    { swapTrump: 'no', showPoints: false, winsToWin: 3 },
];
for (let n = 2; n <= 6; n++) {
    for (const rules of ruleSets) {
        for (let k = 0; k < 6; k++) {
            play(n, rules, 1000 * n + k * 17 + games, ['facil', 'normal', 'dificil']);
            games++;
        }
    }
}

// Los rivales difíciles ganan más a menudo a los fáciles.
let hard = 0, easy = 0;
for (let k = 0; k < 300; k++) {
    const { g } = play(2, { winsToWin: 1 }, 77 + k, k % 2 ? ['dificil', 'facil'] : ['facil', 'dificil']);
    const hp = k % 2 ? 0 : 1;
    if (g.winners.length === 1) { if (g.winners[0] === hp) hard++; else easy++; }
}
console.log(`Partidas de prueba: ${games}. Difícil contra fácil: ${hard} a ${easy}.`);
assert(hard > easy * 1.4, 'el rival difícil juega mejor');

// Cambiar la muestra
{
    const g = new BriscaGame({ players: [{ name: 'A' }, { name: 'B' }], seed: 5 });
    g.startRound();
    g.trump = c(12, 'oros'); g.trumpSuit = 'oros'; g.deck[0] = g.trump;
    g.players[g.current].hand[0] = c(7, 'oros');
    assert(g.canSwapTrump(g.current), 'el siete cambia el rey');
    g.players[g.current].hand[0] = c(2, 'oros');
    assert(!g.canSwapTrump(g.current), 'el dos no cambia el rey');
    g.trump = c(5, 'oros'); g.deck[0] = g.trump;
    assert(g.canSwapTrump(g.current), 'el dos cambia el cinco');
    const p = g.current;
    const res = g.act({ type: 'swapTrump', p });
    assert(res.ok && g.players[p].hand[0].rank === 5 && g.deck[0].rank === 2 && g.trump.rank === 2);
}
console.log('Brisca: todo bien.');
