// Pruebas del Parchís sin navegador: node tests/parchis.test.js
'use strict';
const assert = require('assert');
const R = require('../js/rules.js');
const P = require('../js/parchis.js');
const { ParchisBot } = require('../js/parchis-ai.js');
const { CHARACTERS } = require('../js/ai.js');

const { ParchisGame, ParchisMirror, parchisSquare, parchisProgress, PARCHIS_SAFE, PARCHIS_META, PARCHIS_LAST } = P;

// ── El tablero ──────────────────────────────────────
assert.strictEqual(parchisSquare('amarillo', 0), 5, 'el amarillo sale en la 5');
assert.strictEqual(parchisSquare('amarillo', 63), 68, 'el amarillo entra en su pasillo desde la 68');
assert.strictEqual(parchisSquare('azul', 0), 22);
assert.strictEqual(parchisSquare('azul', 63), 17, 'el azul entra en su pasillo desde la 17');
assert.strictEqual(parchisSquare('rojo', 0), 39);
assert.strictEqual(parchisSquare('rojo', 63), 34);
assert.strictEqual(parchisSquare('verde', 0), 56);
assert.strictEqual(parchisSquare('verde', 63), 51);
assert.strictEqual(parchisSquare('verde', 13), 1, 'después de la 68 viene la 1');
assert.strictEqual(parchisSquare('verde', 64), null, 'el pasillo no es una casilla del recorrido');
for (const c of P.PARCHIS_COLORS) for (let q = 0; q <= PARCHIS_LAST; q++) assert.strictEqual(parchisProgress(c, parchisSquare(c, q)), q);

// ── Situaciones concretas ───────────────────────────
function setup(n = 4, rules = {}) {
    const g = new ParchisGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'J' + i })), rules, seed: 7 });
    g.startRound();
    g.current = 0;
    g.phase = 'roll';
    return g;
}
const place = (g, o, i, pos) => { const pc = g.players[o].pieces[i]; pc.pos = pos; pc.at = pos < 0 ? 0 : ++g.stamp; };
const roll = (g, value, p = g.current) => { g.nextDice.push(value); const r = g.act({ type: 'roll', p }); assert(r.ok, r.error); return r; };
const move = (g, i, o) => { const r = g.act({ type: 'move', p: g.current, o, i }); assert(r.ok, r.error); return r; };
const kinds = r => r.events.map(e => e.t);

{   // Con un 5 se saca ficha; con otro número, todas en casa, no se mueve.
    const g = setup();
    let r = roll(g, 3);
    assert.deepStrictEqual(kinds(r), ['roll', 'noMove', 'turn'], 'sin fichas fuera, un 3 no sirve');
    assert.strictEqual(g.current, 1);
    g.current = 0; g.phase = 'roll';
    r = roll(g, 5);
    assert.strictEqual(g.phase, 'move');
    assert.strictEqual(g.options.length, 1, 'con un 5 hay que sacar');
    assert(g.options[0].out);
    r = move(g, g.options[0].i);
    assert.strictEqual(g.players[0].pieces[0].pos, 0, 'la ficha está en su salida');
    assert.strictEqual(r.events[0].sq, 5);
}
{   // Comer: cuentas 20 con otra ficha.
    const g = setup();
    place(g, 0, 0, 20);                         // amarillo en la 25
    place(g, 0, 1, 2);                          // amarillo en la 7
    const sq = parchisSquare('amarillo', 23);   // la 28
    assert(!PARCHIS_SAFE.has(sq));
    place(g, 1, 0, parchisProgress('azul', sq));
    roll(g, 3);
    const m = g.options.find(x => x.i === 0);
    assert(m && m.capture && m.capture.o === 1, 'la ficha 1 come');
    const r = move(g, 0);
    assert(kinds(r).includes('capture'));
    assert.strictEqual(g.players[1].pieces[0].pos, -1, 'la comida vuelve a casa');
    assert.strictEqual(g.phase, 'bonus');
    assert.strictEqual(g.bonus, 20);
    move(g, 1);
    assert.strictEqual(g.players[0].pieces[1].pos, 22, 'cuenta 20');
    assert.strictEqual(g.current, 1, 'después pasa el turno');
}
{   // En un seguro no se come: se comparte la casilla.
    const g = setup();
    place(g, 1, 0, parchisProgress('azul', 12));
    place(g, 0, 0, 3);                          // la 8
    roll(g, 4);                                 // a la 12, un seguro con una azul
    const m = g.options.find(x => x.i === 0);
    assert(m && !m.capture, 'en el seguro no se come');
    move(g, 0);
    assert.strictEqual(g.occupants(12).length, 2, 'comparten el seguro');
}
{   // Una barrera no se puede pasar.
    const g = setup();
    place(g, 0, 0, 2);                          // la 7
    place(g, 1, 0, parchisProgress('azul', 9));
    place(g, 1, 1, parchisProgress('azul', 9));
    roll(g, 4);
    assert(!g.options.some(x => x.i === 0), 'la ficha no pasa la barrera');
}
{   // Salida llena con una ficha de otro: al sacar, te la comes.
    const g = setup();
    place(g, 0, 0, 0);                          // amarilla en su salida (la 5)
    place(g, 3, 0, parchisProgress('verde', 5));
    roll(g, 5);
    assert.strictEqual(g.options.length, 1);
    assert(g.options[0].out && g.options[0].capture && g.options[0].capture.o === 3, 'se come a la verde de la salida');
    move(g, g.options[0].i);
    assert.strictEqual(g.phase, 'bonus');
}
{   // Salida cerrada por dos fichas tuyas: el 5 se mueve con otra.
    const g = setup();
    place(g, 0, 0, 0); place(g, 0, 1, 0); place(g, 0, 2, 20);
    roll(g, 5);
    assert(!g.options.some(m => m.out), 'no puedes sacar');
    assert(g.options.some(m => m.i === 2), 'mueves otra ficha 5');
}
{   // El 6 cuenta 7 si no tienes fichas en casa.
    const g = setup(4, { pieces: 2 });
    place(g, 0, 0, 10); place(g, 0, 1, 30);
    roll(g, 6);
    assert.strictEqual(g.steps, 7);
    assert(g.options.every(m => m.amount === 7));
    const h = setup(4, { pieces: 2 });
    place(h, 0, 0, 10);
    roll(h, 6);
    assert.strictEqual(h.steps, 6, 'con fichas en casa, el 6 es 6');
}
{   // Con un 6 se vuelve a tirar; el tercer 6 manda a casa la última ficha movida.
    const g = setup(4, { pieces: 2 });
    place(g, 0, 0, 10); place(g, 0, 1, 30);
    roll(g, 6); move(g, 0);
    assert.strictEqual(g.current, 0, 'repite turno');
    assert.strictEqual(g.phase, 'roll');
    roll(g, 6); move(g, 1);
    const pos = g.players[0].pieces[1].pos;
    assert(pos <= PARCHIS_LAST);
    const r = roll(g, 6);
    assert(kinds(r).includes('penalty'));
    assert.strictEqual(g.players[0].pieces[1].pos, -1, 'la última ficha movida vuelve a casa');
    assert.strictEqual(g.current, 1, 'y pasa el turno');
}
{   // A la meta, con la cuenta justa; con rebote, se pasa y vuelve.
    const g = setup(4, { pieces: 2 });
    place(g, 0, 0, 68); place(g, 0, 1, -1);
    roll(g, 4);
    assert.strictEqual(g.options.length, 0, 'te pasas: no puedes mover');
    const h = setup(4, { pieces: 2, exact: false });
    place(h, 0, 0, 68); place(h, 0, 1, -1);
    roll(h, 4);
    assert.strictEqual(h.options[0].to, 70, 'se pasa una y rebota');
    const k = setup(4, { pieces: 2 });
    place(k, 0, 0, 68); place(k, 0, 1, 20);
    roll(k, 3);
    const r = move(k, 0);
    assert(kinds(r).includes('meta'));
    assert.strictEqual(k.phase, 'bonus');
    assert.strictEqual(k.bonus, 10, 'al llegar a la meta cuentas 10');
    move(k, 1);
    assert.strictEqual(k.players[0].pieces[1].pos, 30);
}
{   // Cuenta perdida: si ninguna ficha puede contar 20, se pierde.
    const g = setup(4, { pieces: 2 });
    place(g, 0, 0, 10); place(g, 0, 1, 66);       // la 2, en el pasillo: no puede contar 20
    const sq = parchisSquare('amarillo', 13);
    place(g, 2, 0, parchisProgress('rojo', sq));
    const wall = parchisProgress('verde', parchisSquare('amarillo', 20));   // una barrera verde delante
    place(g, 3, 0, wall); place(g, 3, 1, wall);
    roll(g, 3);
    const r = move(g, 0);
    assert(kinds(r).includes('bonusLost'), 'no hay con qué contar 20');
    assert.strictEqual(g.current, 1);
}
{   // Barrera propia y un 6: hay que abrirla.
    const g = setup(4, { pieces: 3 });
    place(g, 0, 0, 10); place(g, 0, 1, 10); place(g, 0, 2, 30);
    roll(g, 6);
    assert(g.options.length && g.options.every(m => m.i === 0 || m.i === 1), 'solo se mueve una de la barrera');
    const h = setup(4, { pieces: 3, openBarrier: false });
    place(h, 0, 0, 10); place(h, 0, 1, 10); place(h, 0, 2, 30);
    roll(h, 6);
    assert(h.options.some(m => m.i === 2));
}
{   // Por parejas: a tu pareja no te la comes, y quien acaba mueve las fichas de su pareja.
    const g = setup(4, { pieces: 2, pairs: true });
    place(g, 0, 0, 10); place(g, 0, 1, -1);
    const sq = parchisSquare('amarillo', 13);
    assert(!PARCHIS_SAFE.has(sq));
    place(g, 2, 0, parchisProgress('rojo', sq));  // la roja es la pareja del amarillo
    roll(g, 3);
    const m = g.options.find(x => x.i === 0);
    assert(m && !m.capture, 'a la pareja no se la come');
    const h = setup(4, { pieces: 1, pairs: true, metaCount: 10 });
    place(h, 0, 0, 68); place(h, 2, 0, 20);
    roll(h, 3);
    let r = move(h, 0);
    assert(kinds(r).includes('finished'));
    assert.strictEqual(h.phase, 'bonus', 'cuenta 10 con la ficha de su pareja');
    assert.strictEqual(h.options[0].o, 2);
    move(h, 0, 2);
    assert.strictEqual(h.players[2].pieces[0].pos, 30);
    h.current = 0; h.phase = 'roll';
    roll(h, 4);
    assert.strictEqual(h.options[0].o, 2, 'mueve las fichas de su pareja');
    place(h, 2, 0, 69);
    h.options = h.rollOptions(0, 2);
    h.dice = 2;
    r = move(h, 0, 2);
    assert(kinds(r).includes('gameOver'));
    assert.deepStrictEqual(h.winners, [0, 2], 'gana la pareja');
}

// ── Con dos dados ───────────────────────────────────
const roll2 = (g, a, b, p = g.current) => { g.nextDice.push(a, b); const r = g.act({ type: 'roll', p }); assert(r.ok, r.error); return r; };
const move2 = (g, i, d, o) => { const r = g.act({ type: 'move', p: g.current, o, i, d }); assert(r.ok, r.error); return r; };
const TWO = { twoDice: true };
{   // Cada dado se mueve por separado: con la misma ficha o con otra.
    const g = setup(4, TWO);
    place(g, 0, 0, 10); place(g, 0, 1, 30); place(g, 0, 2, 40); place(g, 0, 3, 50);
    let r = roll2(g, 2, 4);
    assert.deepStrictEqual(r.events[0], { t: 'roll', p: 0, value: 2, value2: 4, double: false, sixes: 0 });
    assert.strictEqual(g.phase, 'move');
    assert(g.options.some(m => m.i === 0 && m.die === 2) && g.options.some(m => m.i === 0 && m.die === 4), 'jugadas con cada dado');
    r = move2(g, 0, 4);
    assert.strictEqual(g.players[0].pieces[0].pos, 14);
    assert.deepStrictEqual(r.events[0].left, [2], 'queda el 2');
    assert.strictEqual(g.phase, 'move');
    assert(g.options.every(m => m.die === 2));
    move2(g, 0, 2);
    assert.strictEqual(g.players[0].pieces[0].pos, 16, 'la misma ficha avanza los dos dados');
    assert.strictEqual(g.current, 1, 'sin dobles, pasa el turno');
}
{   // Sin d, se mueve con el primer dado que vale. Un dado que no vale ya no cuenta.
    const g = setup(4, { ...TWO, pieces: 1 });
    place(g, 0, 0, 68);                          // a 3 de la meta
    const r = roll2(g, 3, 6);
    assert.strictEqual(g.options.length, 1);
    const m = move2(g, 0);
    assert(kinds(m).includes('meta'));
}
{   // Se sale con un 5, o si los dados suman 5; con 5 y 5, salen dos.
    const g = setup(4, TWO);
    let r = roll2(g, 1, 4);
    assert.strictEqual(g.options.length, 1);
    assert(g.options[0].out && g.options[0].sum, 'sumando 5 se sale');
    r = move2(g, g.options[0].i, 5);
    assert.deepStrictEqual(r.events[0].left, [], 'se usan los dos dados');
    assert.strictEqual(g.current, 1);
    const h = setup(4, TWO);
    roll2(h, 5, 5);
    move2(h, h.options[0].i, 5);
    assert.strictEqual(h.options.length, 1);
    assert(h.options[0].out, 'con el otro 5 sale otra');
    move2(h, h.options[0].i, 5);
    assert.strictEqual(h.homeCount(0), 2);
    assert.strictEqual(h.current, 0, 'con dobles se vuelve a tirar');
    assert.strictEqual(h.phase, 'roll');
    const k = setup(4, TWO);
    r = roll2(k, 2, 6);
    assert.deepStrictEqual(kinds(r), ['roll', 'noMove', 'turn'], 'sin 5 ni suma 5, todas en casa, no se mueve');
    const q = setup(4, TWO);
    place(q, 0, 0, 10);
    roll2(q, 5, 3);
    assert.strictEqual(q.options.length, 1, 'con un 5 hay que sacar primero');
    move2(q, q.options[0].i, 5);
    assert(q.options.length && q.options.every(m => m.die === 3), 'después, el 3');
}
{   // Comer con el primer dado: se cuentan 20 y después se mueve el otro.
    const g = setup(4, TWO);
    place(g, 0, 0, 20); place(g, 0, 1, 2); place(g, 0, 2, 40); place(g, 0, 3, 45);
    const sq = parchisSquare('amarillo', 23);
    place(g, 1, 0, parchisProgress('azul', sq));
    roll2(g, 3, 1);
    move2(g, 0, 3);
    assert.strictEqual(g.phase, 'bonus');
    move2(g, 1);
    assert.strictEqual(g.players[0].pieces[1].pos, 22, 'cuenta 20');
    assert.strictEqual(g.phase, 'move', 'queda el otro dado');
    assert.deepStrictEqual(g.left, [1]);
    move2(g, 2, 1);
    assert.strictEqual(g.current, 1);
}
{   // El dado que queda, si no se puede mover, se pierde.
    const g = setup(4, { ...TWO, pieces: 1 });
    place(g, 0, 0, 66);                          // a 5 de la meta
    roll2(g, 2, 4);
    const r = move2(g, 0, 2);                    // a 3: el 4 ya no entra
    assert(kinds(r).includes('noMove'));
    assert(r.events.find(e => e.t === 'noMove').partial);
    assert.strictEqual(g.current, 1);
}
{   // Dobles: hay que abrir la barrera; el 6 no cuenta 7; a los terceros dobles, la última ficha vuelve a casa.
    const g = setup(4, { ...TWO, pieces: 3 });
    place(g, 0, 0, 10); place(g, 0, 1, 10); place(g, 0, 2, 30);
    roll2(g, 3, 3);
    assert(g.options.length && g.options.every(m => m.i === 0 || m.i === 1), 'con dobles se abre la barrera');
    move2(g, 0, 3);
    assert(g.options.some(m => m.i === 2), 'abierta, el otro dado va con cualquiera');
    move2(g, 2, 3);
    assert.strictEqual(g.current, 0, 'repite');
    const h = setup(4, { ...TWO, pieces: 2 });
    place(h, 0, 0, 10); place(h, 0, 1, 30);
    roll2(h, 6, 6);
    assert(h.options.every(m => m.amount === 6), 'con dos dados el 6 es 6');
    move2(h, 0, 6); move2(h, 0, 6);
    roll2(h, 2, 2); move2(h, 1, 2); move2(h, 1, 2);
    const r = roll2(h, 4, 4);
    assert(kinds(r).includes('penalty'), 'terceros dobles');
    assert.strictEqual(h.players[0].pieces[1].pos, -1, 'la última ficha movida vuelve a casa');
    assert.strictEqual(h.current, 1);
}
{   // El invitado ve los dados y las jugadas.
    const g = setup(4, TWO);
    place(g, 0, 0, 10);
    roll2(g, 2, 3);
    const m = new ParchisMirror({ names: g.players.map(p => p.name), rules: TWO });
    m.setView(JSON.parse(JSON.stringify(g.view())));
    assert.deepStrictEqual(m.pair, [2, 3]);
    assert.deepStrictEqual(m.left, [2, 3]);
    assert.deepStrictEqual(m.options, g.options);
    assert.deepStrictEqual(m.pairOptions(0), g.pairOptions(0));
}

// ── Partidas enteras entre la máquina ────────────────
function play(n, rules, seed, levels) {
    const g = new ParchisGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'J' + i })), rules, seed });
    const bots = g.players.map((_, i) => new ParchisBot(g, i, { ...CHARACTERS[i % CHARACTERS.length], level: levels[i % levels.length] }, R.makeRng(seed + i)));
    const mirror = new ParchisMirror({ names: g.players.map(p => p.name), rules });
    const stats = { captures: 0, metas: 0, bonus: 0, lost: 0, penalties: 0, rolls: 0 };
    const check = () => {
        const count = new Map();
        g.players.forEach(pl => pl.pieces.forEach(pc => {
            assert(pc.pos >= -1 && pc.pos <= PARCHIS_META, 'posición válida');
            const sq = parchisSquare(pl.color, pc.pos);
            if (sq != null) count.set(sq, (count.get(sq) || 0) + 1);
        }));
        for (const [sq, k] of count) assert(k <= 2, `como mucho dos fichas en la casilla ${sq}`);
        mirror.setView(JSON.parse(JSON.stringify(g.view())));
        assert.deepStrictEqual(mirror.options, g.options, 'el invitado ve las mismas jugadas');
        for (let p = 0; p < n; p++) assert.deepStrictEqual(mirror.legal(p), g.legal(p));
    };
    const feed = res => {
        assert(res.ok, res.error);
        for (const e of res.events) {
            if (e.t === 'roll') stats.rolls++;
            if (e.t === 'capture') {
                stats.captures++;
                assert(!PARCHIS_SAFE.has(e.sq) || e.sq === P.PARCHIS_START[g.colorOf(e.o)], 'solo se come fuera de los seguros (o al salir)');
                assert(g.team(e.victim.o) !== g.team(e.o), 'no se come a la pareja');
            }
            if (e.t === 'meta') stats.metas++;
            if (e.t === 'bonus') stats.bonus++;
            if (e.t === 'bonusLost') stats.lost++;
            if (e.t === 'penalty') stats.penalties++;
            if (e.t === 'move' && e.kind === 'roll' && rules.exact !== false && !e.amount) assert.fail('sin avance');
        }
        check();
    };
    feed(g.startRound());
    let steps = 0;
    while (g.phase !== 'gameOver') {
        steps++;
        assert(steps < 20000, 'la partida no acaba');
        const p = g.current;
        const a = bots[p].chooseTurn();
        if (a.type === 'move') assert(g.options.some(m => m.o === a.o && m.i === a.i && (m.die == null || m.die === a.d)), 'jugada válida');
        feed(g.act(a));
    }
    assert(g.winners && g.winners.length, 'hay ganador');
    for (const w of g.winners) assert(g.players[w].pieces.every(pc => pc.pos === PARCHIS_META), 'quien gana tiene todas sus fichas en la meta');
    if (g.teamPlay) assert.strictEqual(g.winners.length, 2, 'por parejas ganan los dos');
    return { steps, ...stats };
}

const ruleSets = [
    {},
    { pairs: true },
    { pieces: 2 },
    { pieces: 3, exact: false },
    { eatCount: 0, metaCount: 0 },
    { sixSeven: false, threeSixes: false, openBarrier: false },
    { pairs: true, pieces: 2, exact: false },
    { twoDice: true },
    { twoDice: true, pairs: true },
    { twoDice: true, pieces: 2, exact: false, openBarrier: false },
];
const levelSets = [['facil'], ['normal'], ['dificil'], ['facil', 'dificil'], ['dificil', 'normal', 'facil']];
let games = 0;
const total = { captures: 0, metas: 0, bonus: 0, lost: 0, penalties: 0, rolls: 0, steps: 0 };
for (const n of [2, 3, 4]) {
    for (const rules of ruleSets) {
        for (let k = 0; k < 6; k++) {
            const seed = 1000 + games * 37;
            const r = play(n, rules, seed, levelSets[games % levelSets.length]);
            for (const key of Object.keys(total)) total[key] += r[key] || 0;
            games++;
        }
    }
}

// Los difíciles ganan más a los fáciles.
let hardWins = 0;
for (let k = 0; k < 60; k++) {
    const g = new ParchisGame({ players: [{ name: 'F' }, { name: 'D' }], rules: { pieces: 4 }, seed: 5000 + k });
    const bots = [new ParchisBot(g, 0, { level: 'facil' }, R.makeRng(k)), new ParchisBot(g, 1, { level: 'dificil' }, R.makeRng(k + 99))];
    g.startRound();
    while (g.phase !== 'gameOver') g.act(bots[g.current].chooseTurn());
    if (g.winners[0] === 1) hardWins++;
}

console.log(`Partidas de prueba: ${games}. Tiradas: ${total.rolls}. Comidas: ${total.captures}. Fichas en la meta: ${total.metas}. Cuentas: ${total.bonus} (perdidas: ${total.lost}). Tercer seis: ${total.penalties}.`);
console.log(`Difícil contra fácil: ${hardWins} de 60.`);
assert(hardWins > 33, 'la máquina difícil juega mejor');
let hardWins2 = 0;
for (let k = 0; k < 60; k++) {
    const g = new ParchisGame({ players: [{ name: 'F' }, { name: 'D' }], rules: { pieces: 4, twoDice: true }, seed: 7000 + k });
    const bots = [new ParchisBot(g, 0, { level: 'facil' }, R.makeRng(k)), new ParchisBot(g, 1, { level: 'dificil' }, R.makeRng(k + 99))];
    g.startRound();
    while (g.phase !== 'gameOver') g.act(bots[g.current].chooseTurn());
    if (g.winners[0] === 1) hardWins2++;
}
console.log(`Con dos dados, difícil contra fácil: ${hardWins2} de 60.`);
assert(hardWins2 > 33, 'con dos dados, la máquina difícil también juega mejor');
console.log('Parchís: todo bien.');
