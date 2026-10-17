// Pruebas del Virus sin navegador: node tests/virus.test.js
'use strict';
const assert = require('assert');
const R = require('../js/rules.js');
const V = require('../js/virus.js');
const { VirusBot } = require('../js/virus-ai.js');
const { CHARACTERS } = require('../js/ai.js');

const { VirusGame, VirusMirror, virusEventFor, makeVirusDeck, organState, virusEffect } = V;

// El mazo
const deck = makeVirusDeck();
assert.strictEqual(deck.length, 68, '68 cartas');
const count = f => deck.filter(f).length;
assert.strictEqual(count(c => c.kind === 'organo'), 21);
assert.strictEqual(count(c => c.kind === 'virus'), 17);
assert.strictEqual(count(c => c.kind === 'medicina'), 20);
assert.strictEqual(count(c => c.kind === 'tratamiento'), 10);
assert.strictEqual(count(c => c.kind === 'medicina' && c.color === 'multi'), 4);
assert.strictEqual(new Set(deck.map(c => c.id)).size, 68, 'cada carta con su id');

// Una mesa preparada a mano
let id = 1000;
const card = (kind, color, treat) => treat ? { id: id++, kind, treat } : { id: id++, kind, color };
const org = (color, ...items) => ({ organ: card('organo', color), items });
function table(n, bodies, hands, rules = {}) {
    const g = new VirusGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'J' + i })), rules, seed: 7 });
    g.startRound();
    g.current = 0;
    g.players.forEach((pl, i) => { pl.body = bodies[i] || []; pl.hand = (hands[i] || [card('medicina', 'azul')]).concat([null, null, null]).slice(0, 3); });
    g.deck = makeVirusDeck();
    g.discardPile = [];
    return g;
}
const ok = res => { assert(res.ok, res.error); return res.events; };

// Colores y efectos
const V_ = (c) => card('virus', c), M = (c) => card('medicina', c);
assert.strictEqual(virusEffect(V_('rojo'), org('rojo')), 'infectar');
assert.strictEqual(virusEffect(V_('azul'), org('rojo')), null, 'un virus solo infecta su color');
assert.strictEqual(virusEffect(V_('multi'), org('rojo')), 'infectar', 'el virus multicolor infecta cualquier color');
assert.strictEqual(virusEffect(V_('azul'), org('multi')), 'infectar', 'cualquier virus infecta el órgano multicolor');
assert.strictEqual(virusEffect(V_('rojo'), org('rojo', V_('rojo'))), 'extirpar');
assert.strictEqual(virusEffect(V_('rojo'), org('rojo', M('rojo'))), 'destruirVacuna');
assert.strictEqual(virusEffect(V_('azul'), org('multi', M('rojo'))), null, 'la vacuna roja solo la destruye un virus rojo');
assert.strictEqual(virusEffect(V_('azul'), org('rojo', M('multi'))), 'destruirVacuna', 'la medicina multicolor la destruye cualquier virus');
assert.strictEqual(virusEffect(V_('rojo'), org('rojo', M('rojo'), M('rojo'))), null, 'inmune');
assert.strictEqual(virusEffect(M('rojo'), org('rojo')), 'vacunar');
assert.strictEqual(virusEffect(M('rojo'), org('rojo', M('multi'))), 'inmunizar');
assert.strictEqual(virusEffect(M('azul'), org('rojo', V_('multi'))), 'curar', 'el virus multicolor se cura con cualquier medicina');
assert.strictEqual(virusEffect(M('azul'), org('rojo', V_('rojo'))), null);
assert.strictEqual(organState(org('rojo', M('rojo'), M('multi'))), 'inmune');

// Órganos: no dos del mismo color
let g = table(2, [[org('rojo')]], [[card('organo', 'rojo'), card('organo', 'multi')]]);
assert.strictEqual(g.playsFor(0, 0).length, 0, 'no puedes tener dos corazones');
ok(g.act({ type: 'play', p: 0, slot: 1 }));
assert.strictEqual(g.bodyOf(0).length, 2);
assert.strictEqual(g.handOf(0).filter(Boolean).length, 3, 'se roba hasta tres');
assert.strictEqual(g.current, 1);

// Extirpar: las tres cartas a los descartes
g = table(2, [[], [org('verde', V_('verde'))]], [[V_('verde')]]);
let ev = ok(g.act({ type: 'play', p: 0, slot: 0, target: { p: 1, color: 'verde' } }));
assert.strictEqual(g.bodyOf(1).length, 0, 'órgano destruido');
assert.strictEqual(g.discardPile.length, 3);
assert.strictEqual(ev.find(e => e.t === 'play').effect, 'extirpar');
// Un virus no va a tu propio cuerpo
g = table(2, [[org('verde')], []], [[V_('verde')]]);
assert.strictEqual(g.playsFor(0, 0).length, 0);

// Curar y destruir vacuna
g = table(2, [[org('azul', V_('azul'))], [org('rojo', M('rojo'))]], [[M('azul'), V_('rojo')]]);
ok(g.act({ type: 'play', p: 0, slot: 0, target: { p: 0, color: 'azul' } }));
assert.strictEqual(organState(g.organ(0, 'azul')), 'libre');
assert.strictEqual(g.discardPile.length, 2);

// Trasplante: sin colores repetidos ni inmunes
g = table(2, [[org('rojo'), org('azul')], [org('azul', V_('azul')), org('verde', M('verde'), M('verde'))]], [[card('tratamiento', null, 'trasplante')]]);
let plays = g.playsFor(0, 0);
assert(plays.every(a => a.a.color !== 'verde' && a.b.color !== 'verde'), 'los inmunes no se trasplantan');
assert(plays.some(a => a.a.color === 'azul' && a.b.color === 'azul'), 'mismo color sí');
assert(!plays.some(a => a.a.color === 'rojo' && a.b.color === 'azul'), 'no te puedes quedar con dos azules');
ok(g.act({ type: 'play', p: 0, slot: 0, a: { p: 0, color: 'azul' }, b: { p: 1, color: 'azul' } }));
assert.strictEqual(organState(g.organ(0, 'azul')), 'infectado', 'el órgano se lleva sus virus');

// Ladrón
g = table(2, [[org('rojo')], [org('rojo'), org('amarillo', M('amarillo')), org('verde', M('multi'), M('verde'))]], [[card('tratamiento', null, 'ladron')]]);
plays = g.playsFor(0, 0);
assert.deepStrictEqual(plays.map(a => a.target.color), ['amarillo']);
ok(g.act(plays[0]));
assert(g.hasColor(0, 'amarillo') && !g.hasColor(1, 'amarillo'));

// Contagio: tantos como se pueda, solo a órganos libres
g = table(3, [[org('rojo', V_('rojo')), org('azul', V_('multi'))], [org('rojo', M('rojo')), org('verde')], [org('rojo')]], [[card('tratamiento', null, 'contagio')]]);
plays = g.playsFor(0, 0);
assert(plays.length && plays.every(a => a.moves.length === 2), 'contagia los dos virus');
ok(g.act(plays[0]));
assert.strictEqual(g.healthyCount(0), 2);
assert.strictEqual(organState(g.organ(1, 'rojo')), 'vacunado', 'no se contagia a un vacunado');
g = table(2, [[org('rojo')], [org('rojo')]], [[card('tratamiento', null, 'contagio')]]);
assert.strictEqual(g.playsFor(0, 0).length, 0, 'sin virus no hay contagio');

// Guante de látex: los demás pierden la mano y el siguiente turno
g = table(3, [], [[card('tratamiento', null, 'guante')], [V_('rojo'), V_('azul')], [M('rojo')]]);
ev = ok(g.act({ type: 'play', p: 0, slot: 0 }));
assert.strictEqual(ev.filter(e => e.t === 'lostTurn').length, 2, 'los dos pierden el turno');
assert.strictEqual(g.current, 0, 'vuelve a quien usó el guante');
assert.strictEqual(g.countOf(1), 3, 'han robado mano nueva');

// Error médico: se cambian los cuerpos, inmunes incluidos
g = table(2, [[org('rojo')], [org('azul', M('azul'), M('azul')), org('verde'), org('amarillo')]], [[card('tratamiento', null, 'error')]]);
ok(g.act({ type: 'play', p: 0, slot: 0, target: { p: 1 } }));
assert.strictEqual(g.bodyOf(0).length, 3);
assert.strictEqual(g.bodyOf(1).length, 1);

// Ganar: cuatro órganos sanos, el multicolor cuenta
g = table(2, [[org('rojo', M('rojo')), org('azul'), org('multi', V_('verde')), org('verde')]], [[M('multi')]]);
ok(g.act({ type: 'play', p: 0, slot: 0, target: { p: 0, color: 'multi' } }));
assert.strictEqual(g.phase, 'gameOver');
assert.deepStrictEqual(g.winners, [0]);
// Ganar en el turno de otro (el error médico te da un cuerpo sano)
g = table(2, [[org('rojo'), org('azul'), org('verde'), org('amarillo')], [org('rojo', V_('rojo'))]], [[card('tratamiento', null, 'error')]]);
ok(g.act({ type: 'play', p: 0, slot: 0, target: { p: 1 } }));
assert.deepStrictEqual(g.winners, [1]);

// Descartar
g = table(2, [], [[V_('rojo'), V_('azul'), M('rojo')]]);
ok(g.act({ type: 'discard', p: 0, slots: [0, 2] }));
assert.strictEqual(g.discardPile.length, 2);
assert.strictEqual(g.countOf(0), 3);
assert(!g.act({ type: 'discard', p: 1, slots: [] }).ok);

// Se acaba el mazo: se da la vuelta a los descartes sin barajar
g = table(2, [], [[V_('rojo'), V_('azul'), M('rojo')]]);
g.deck = [];
g.discardPile = [M('verde'), M('azul')];
const firstDiscard = g.discardPile[0];
ev = ok(g.act({ type: 'discard', p: 0, slots: [0] }));
assert(ev.some(e => e.t === 'flip'));
assert(g.handOf(0).includes(firstDiscard), 'se roba primero lo primero que se tiró');

// Partidas enteras con los rivales de la máquina
function play(n, rules, seed, levels) {
    const g = new VirusGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'J' + i })), rules, seed });
    const bots = g.players.map((_, i) => new VirusBot(g, i, { ...CHARACTERS[i % CHARACTERS.length], level: levels[i % levels.length] }, R.makeRng(seed + i)));
    const mirror = new VirusMirror({ names: g.players.map(p => p.name), rules, me: 0 });
    let rounds = 0, steps = 0;
    const feed = res => {
        assert(res.ok, res.error);
        for (const e of res.events) {
            const seen = virusEventFor(e, 0);
            if (e.secret && e.p !== 0) assert(!(seen.cards || []).some(Boolean), 'secreto filtrado');
            mirror.observe(seen);
        }
        mirror.setView(g.view(0));
        // nunca dos órganos del mismo color
        for (const pl of g.players) assert.strictEqual(new Set(pl.body.map(o => o.organ.color)).size, pl.body.length, 'colores repetidos');
        const total = g.deck.length + g.discardPile.length + g.players.reduce((s, pl) => s + pl.hand.filter(Boolean).length + pl.body.reduce((t, o) => t + 1 + o.items.length, 0), 0);
        if (g.phase === 'turn') assert.strictEqual(total, 68, 'no se pierde ninguna carta');
    };
    while (g.phase !== 'gameOver' && rounds < 20) {
        feed(g.startRound());
        rounds++;
        while (g.phase === 'turn') {
            steps++;
            assert(steps < 20000, 'demasiados pasos');
            const p = g.current;
            if (p === 0) assert.deepStrictEqual(mirror.plays(0), g.plays(0), 'el invitado ve las mismas jugadas');
            feed(g.act(bots[p].chooseTurn()));
        }
        assert(g.result.winner != null, 'alguien gana la ronda');
        assert(g.isComplete(g.result.winner), 'quien gana tiene cuatro órganos sanos');
    }
    return { g, rounds, steps };
}

let games = 0, turns = 0;
const ruleSets = [{}, { winsToWin: 3 }, { pairs: true }];
for (let n = 2; n <= 6; n++) {
    for (const rules of ruleSets) {
        for (let k = 0; k < 8; k++) {
            turns += play(n, rules, 500 * n + k * 31 + games, ['facil', 'normal', 'dificil']).steps;
            games++;
        }
    }
}
// Los difíciles ganan más que los fáciles
let hard = 0, easy = 0;
for (let k = 0; k < 60; k++) {
    const { g } = play(2, {}, 9000 + k, k % 2 ? ['dificil', 'facil'] : ['facil', 'dificil']);
    const w = g.winners[0];
    if ((k % 2 ? w === 0 : w === 1)) hard++; else easy++;
}
assert(hard > easy, `los difíciles ganan más (${hard} contra ${easy})`);
console.log(`Virus: ${games} partidas (${Math.round(turns / games)} turnos de media), difícil contra fácil ${hard}-${easy}. Todo bien.`);
