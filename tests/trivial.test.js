// Pruebas del Trivial sin navegador: node tests/trivial.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('../js/rules.js');
const T = require('../js/trivial.js');
const { TrivialBot } = require('../js/trivial-ai.js');
const { CHARACTERS } = require('../js/ai.js');

const { TrivialGame, TrivialMirror, TRIVIAL_BOARD, TRIVIAL_CATS, TRIVIAL_HUB, TRIVIAL_DIST, TRIVIAL_WILD, trivialMoves, trivialPath, trivialHq, tvRing, tvSpoke } = T;

// ── El banco de preguntas ───────────────────────────
const dir = path.join(__dirname, '..', 'js', 'trivial');
for (const f of fs.readdirSync(dir)) require(path.join(dir, f));
const BANK = globalThis.TRIVIAL_BANK || {};
let total = 0;
const texts = new Set();
for (const cat of TRIVIAL_CATS) {
    const list = BANK[cat];
    assert(Array.isArray(list) && list.length >= 50, `faltan preguntas de ${cat}`);
    list.forEach((q, i) => {
        const where = `${cat} ${i + 1}: ${q[0]}`;
        assert.strictEqual(q.length, 6, `${where}: pregunta, cuatro respuestas y nivel`);
        assert(q.slice(0, 5).every(s => typeof s === 'string' && s.trim() === s && s.length > 0), `${where}: textos vacíos o con espacios de más`);
        assert.strictEqual(new Set(q.slice(1, 5).map(s => s.toLowerCase())).size, 4, `${where}: respuestas repetidas`);
        assert([1, 2, 3].includes(q[5]), `${where}: el nivel es 1, 2 o 3`);
        assert(!texts.has(q[0].toLowerCase()), `${where}: pregunta repetida`);
        assert(!/[()]|\b(km|kg|etc)\b|%/.test(q.slice(0, 5).join(' ')), `${where}: sin paréntesis, abreviaturas ni símbolos`);
        texts.add(q[0].toLowerCase());
    });
    total += list.length;
}
console.log(`Banco: ${total} preguntas (${TRIVIAL_CATS.map(c => `${c} ${BANK[c].length}`).join(', ')}).`);

// ── El tablero ──────────────────────────────────────
assert.strictEqual(TRIVIAL_BOARD.length, 73, '73 casillas');
for (const node of TRIVIAL_BOARD) for (const nb of node.nb) assert(TRIVIAL_BOARD[nb].nb.includes(node.id), `las casillas ${node.id} y ${nb} se tocan en los dos sentidos`);
assert.strictEqual(TRIVIAL_BOARD[TRIVIAL_HUB].nb.length, 6, 'del centro salen seis radios');
const count = k => TRIVIAL_BOARD.filter(x => x.kind === k).length;
assert.strictEqual(count('hq'), 6, 'seis quesitos');
assert.strictEqual(count('roll'), 6, 'seis casillas de volver a tirar, una entre cada dos quesitos');
for (const cat of TRIVIAL_CATS) {
    assert.strictEqual(TRIVIAL_BOARD[trivialHq(cat)].cat, cat);
    assert.strictEqual(TRIVIAL_BOARD.filter(x => x.kind === 'cat' && x.cat === cat).length, 10, `${cat}: 5 casillas en el anillo y 5 en los radios`);
    assert.strictEqual(TRIVIAL_DIST[TRIVIAL_HUB][trivialHq(cat)], 6, 'del centro a cada quesito hay 6');
}
for (const node of TRIVIAL_BOARD) for (const nb of node.nb) if (node.cat && TRIVIAL_BOARD[nb].cat) assert.notStrictEqual(node.cat, TRIVIAL_BOARD[nb].cat, `las casillas ${node.id} y ${nb}, de al lado, son de categorías distintas`);
for (const a of [TRIVIAL_HUB, tvRing(3), tvSpoke(2, 3), trivialHq('arte')]) for (const b of TRIVIAL_BOARD) {
    const path = trivialPath(a, b.id);
    assert.strictEqual(path.length, TRIVIAL_DIST[a][b.id], 'el camino más corto');
    if (path.length) assert.strictEqual(path.at(-1), b.id);
    path.forEach((x, i) => assert(TRIVIAL_BOARD[i ? path[i - 1] : a].nb.includes(x), 'casilla a casilla'));
}
for (let k = 0; k < 6; k++) assert(!TRIVIAL_BOARD.filter(x => x.zone === 'spoke' && x.k === k).some(x => x.cat === TRIVIAL_CATS[k]), 'en un radio no está la categoría de su quesito');
assert.strictEqual(trivialMoves(TRIVIAL_HUB, 6).length, 6, 'del centro con un 6: los seis quesitos');
assert(trivialMoves(TRIVIAL_HUB, 6).every(m => TRIVIAL_BOARD[m.to].kind === 'hq'));
assert.deepStrictEqual(trivialMoves(tvRing(3), 1).map(m => m.to).sort((a, b) => a - b), [tvRing(2), tvRing(4)], 'en el anillo, uno a cada lado');
{   // Pasando por un quesito se puede entrar en su radio; pasando por el centro, salir por cualquier radio.
    const dests = trivialMoves(tvRing(1), 3).map(m => m.to);
    assert(dests.includes(tvSpoke(0, 2)), 'por el quesito, al radio');
    const viaHub = trivialMoves(tvSpoke(2, 5), 2).map(m => m.to);
    assert.strictEqual(viaHub.length, 6, 'por el centro: los otros cinco radios y hacia fuera');
    for (const m of trivialMoves(tvSpoke(2, 3), 5)) assert(new Set([tvSpoke(2, 3), ...m.path]).size === m.path.length + 1, 'no se vuelve atrás');
}

// ── Situaciones concretas ───────────────────────────
const MINI = {};
for (const cat of TRIVIAL_CATS) MINI[cat] = Array.from({ length: 8 }, (_, i) => [`¿${cat} ${i}?`, 'Bien', 'Mal uno', 'Mal dos', 'Mal tres', 1 + (i % 3)]);
function setup(n = 3, rules = {}) {
    const g = new TrivialGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'J' + i })), rules, seed: 11, bank: MINI });
    g.startRound();
    g.current = 0;
    g.phase = 'roll';
    return g;
}
const act = (g, a) => { const r = g.act(a); assert(r.ok, r.error); return r; };
const kinds = r => r.events.map(e => e.t);
const roll = (g, v) => { g.nextDice.push(v); return act(g, { type: 'roll', p: g.current }); };
const goTo = (g, to) => act(g, { type: 'move', p: g.current, to });
const answer = (g, ok) => act(g, { type: 'answer', p: g.actor, choice: ok ? g.answerIdx : [0, 1, 2, 3].find(i => i !== g.answerIdx && !g.q.wrong.includes(i)) });

{   // Del centro con un 6 al quesito de Historia: si aciertas, te lo llevas y vuelves a tirar.
    const g = setup(3, { streak: 0 });
    roll(g, 6);
    assert.strictEqual(g.phase, 'move');
    let r = goTo(g, trivialHq('historia'));
    assert.deepStrictEqual(kinds(r), ['move', 'question']);
    assert.strictEqual(g.q.cat, 'historia');
    assert(g.q.wedge, 'pregunta de quesito');
    assert(!('correct' in r.events[1]) && !('answer' in g.view()) && !JSON.stringify(g.view()).includes('"answerIdx"'), 'la respuesta no se ve en la mesa');
    assert.strictEqual(g.view().q.options.filter(o => o === 'Bien').length, 1);
    r = answer(g, true);
    assert.deepStrictEqual(kinds(r), ['answer', 'wedge', 'turn']);
    assert.deepStrictEqual(g.tokens[0].wedges, ['historia']);
    assert.strictEqual(g.current, 0, 'acierta: vuelve a tirar');
    // Otra vez en el quesito de Historia: ya lo tiene, no se lo lleva otra vez.
    roll(g, 1); goTo(g, tvRing(15));
    answer(g, true);
    roll(g, 1); goTo(g, trivialHq('historia'));
    assert(!g.q.wedge);
    r = answer(g, true);
    assert.deepStrictEqual(kinds(r), ['answer', 'turn']);
    assert.strictEqual(g.tokens[0].wedges.length, 1);
    // Falla: pasa el turno.
    roll(g, 1); goTo(g, tvRing(13));
    r = answer(g, false);
    assert.deepStrictEqual(kinds(r), ['answer', 'turn']);
    assert.strictEqual(g.current, 1);
    assert.strictEqual(r.events[0].answerText, 'Bien', 'al fallar se dice la correcta');
    assert.strictEqual(g.tokens[0].missed[TRIVIAL_BOARD[tvRing(13)].cat], 1);
}
{   // Casilla de volver a tirar: no hay pregunta.
    const g = setup();
    g.tokens[0].at = tvRing(0);
    roll(g, 4);
    const r = goTo(g, tvRing(4));
    assert.strictEqual(TRIVIAL_BOARD[tvRing(4)].kind, 'roll');
    assert.deepStrictEqual(kinds(r), ['move', 'turn']);
    assert(r.events[1].again);
    assert.strictEqual(g.phase, 'roll');
}
{   // En el centro sin todos los quesitos: eliges tú la categoría.
    const g = setup();
    g.tokens[0].at = tvSpoke(1, 4);
    roll(g, 2);
    let r = goTo(g, TRIVIAL_HUB);
    assert.deepStrictEqual(kinds(r), ['move', 'pickCat']);
    assert.strictEqual(g.actor, 0);
    assert(!g.act({ type: 'pick', p: 1, cat: 'arte' }).ok, 'no elige otro');
    r = act(g, { type: 'pick', p: 0, cat: 'arte' });
    assert.strictEqual(g.q.cat, 'arte');
    assert.strictEqual(g.q.kind, 'hub');
}
{   // Con todos los quesitos, al centro: elige la categoría el siguiente rival. Si aciertas, ganas.
    const g = setup(3);
    g.tokens[0].wedges = TRIVIAL_CATS.slice();
    g.tokens[0].at = tvSpoke(3, 5);
    roll(g, 1);
    let r = goTo(g, TRIVIAL_HUB);
    assert.strictEqual(g.phase, 'pick');
    assert.strictEqual(g.actor, 1, 'elige el rival de después');
    assert.deepStrictEqual(g.legal(1), ['pick']);
    act(g, { type: 'pick', p: 1, cat: 'deportes' });
    assert.strictEqual(g.q.kind, 'final');
    assert(!g.act({ type: 'answer', p: 1, choice: 0 }).ok, 'contesta quien juega');
    r = answer(g, true);
    assert.strictEqual(g.phase, 'gameOver');
    assert.deepStrictEqual(g.winners, [0]);
    assert(kinds(r).includes('gameOver'));
}
{   // Falla la final: pasa el turno y tendrá que volver al centro.
    const g = setup(2, { finalPick: 'azar' });
    g.tokens[0].wedges = TRIVIAL_CATS.slice();
    g.tokens[0].at = tvSpoke(0, 4);
    roll(g, 2);
    goTo(g, TRIVIAL_HUB);
    assert.strictEqual(g.q.kind, 'final', 'al azar: pregunta directa');
    answer(g, false);
    assert.strictEqual(g.phase, 'roll');
    assert.strictEqual(g.current, 1);
}
{   // Partida corta: con 3 quesitos y sin final, ganas al conseguir el tercero.
    const g = setup(2, { wedges: 3, hubFinal: false });
    g.tokens[0].wedges = ['arte', 'ciencia'];
    g.tokens[0].at = TRIVIAL_HUB;
    roll(g, 6);
    goTo(g, trivialHq('deportes'));
    const r = answer(g, true);
    assert.deepStrictEqual(kinds(r), ['answer', 'wedge', 'gameOver']);
}
{   // Sin volver a tirar al acertar.
    const g = setup(2, { rollAgain: false });
    g.tokens[0].at = tvRing(1);
    roll(g, 3);
    goTo(g, trivialMoves(tvRing(1), 3).find(m => TRIVIAL_BOARD[m.to].kind === 'cat').to);
    answer(g, true);
    assert.strictEqual(g.current, 1);
}
{   // Por equipos: una ficha por equipo, la mueven sus jugadores por turnos.
    const g = setup(4, { teams: true, rebound: false });
    assert(g.teamPlay);
    assert.strictEqual(g.tokens.length, 2);
    assert.deepStrictEqual(g.tokens[0].members, [0, 2]);
    roll(g, 6);
    goTo(g, trivialHq('geografia'));
    answer(g, true);
    assert.deepStrictEqual(g.tokens[0].wedges, ['geografia']);
    roll(g, 1);
    goTo(g, trivialMoves(g.tokens[0].at, 1).find(m => TRIVIAL_BOARD[m.to].kind === 'cat').to);
    answer(g, false);
    assert.strictEqual(g.current, 1);
    roll(g, 6);
    assert.strictEqual(g.tokens[1].at, TRIVIAL_HUB, 'el otro equipo sigue en el centro');
    goTo(g, trivialHq('arte'));
    answer(g, false);
    assert.strictEqual(g.current, 2, 'le toca al compañero del primero');
    assert.strictEqual(g.tokenOf(2), g.tokens[0], 'y mueve la ficha de su equipo');
    // La final la elige un rival del otro equipo.
    g.tokens[0].wedges = TRIVIAL_CATS.slice();
    assert.strictEqual(g.finalChooser(2), 3);
    assert.strictEqual(g.finalChooser(0), 1);
}
{   // Preguntas fáciles: solo las de nivel 1.
    const g = setup(2, { level: 'faciles' });
    assert(g.decks.arte.every(i => MINI.arte[i][5] === 1));
    const m = setup(2, { level: 'medias' });
    assert(m.decks.arte.length && m.decks.arte.every(i => MINI.arte[i][5] === 2));
    const h = setup(2, { level: 'dificiles' });
    assert(h.decks.arte.length && h.decks.arte.every(i => MINI.arte[i][5] === 3));
    const t = setup(2, { level: 'todas' });
    assert.strictEqual(t.decks.arte.length, MINI.arte.length);
}
{   // Tras 3 aciertos seguidos pasa el turno, aunque aciertes; el quesito sí te lo llevas.
    const g = setup(2);
    const stepCat = h => {   // tira lo que haga falta para caer en una casilla de categoría
        const at = h.tokenOf(h.current).at;
        for (let v = 1; v <= 6; v++) {
            const m = trivialMoves(at, v).find(x => TRIVIAL_BOARD[x.to].kind === 'cat');
            if (m) { roll(h, v); goTo(h, m.to); return; }
        }
        throw new Error('sin casilla de categoría');
    };
    g.tokens[0].at = tvRing(1);
    for (let k = 1; k <= 2; k++) {
        stepCat(g);
        const r = answer(g, true);
        assert.strictEqual(g.current, 0, 'sigue tirando');
        assert.strictEqual(r.events.at(-1).streak, k);
    }
    g.tokens[0].at = TRIVIAL_HUB;
    roll(g, 6); goTo(g, trivialHq('historia'));
    const r = answer(g, true);
    assert.deepStrictEqual(kinds(r), ['answer', 'wedge', 'streak', 'turn']);
    assert.deepStrictEqual(g.tokens[0].wedges, ['historia']);
    assert.strictEqual(g.current, 1);
    assert.strictEqual(g.streak, 0);
    // Fallar también empieza la cuenta de nuevo.
    stepCat(g); answer(g, true);
    assert.strictEqual(g.streak, 1);
    stepCat(g); answer(g, false);
    assert.strictEqual(g.current, 0);
    assert.strictEqual(g.streak, 0);
    // Sin límite, se sigue tirando.
    const u = setup(2, { streak: 0 });
    u.tokens[0].at = tvRing(1);
    for (let k = 0; k < 5; k++) { stepCat(u); answer(u, true); }
    assert.strictEqual(u.current, 0);
}
{   // Las preguntas que ya han salido en otras partidas van al final del montón.
    const seen = MINI.arte.map((_, i) => `arte:${i}`).filter((_, i) => i !== 5);
    const g = new TrivialGame({ players: [{ name: 'a' }, { name: 'b' }], seed: 3, bank: MINI, seen });
    assert.strictEqual(g.decks.arte[0], 5);
}
{   // El dado del 1 al 7: con el 7 eliges un quesito que te falte y te hacen una pregunta muy difícil, sin moverte.
    const g = setup(3);
    g.tokens[0].wedges = ['arte'];
    g.tokens[0].at = tvRing(3);
    let r = roll(g, TRIVIAL_WILD);
    assert.deepStrictEqual(kinds(r), ['roll', 'pickCat']);
    assert(r.events[0].wild && r.events[1].wild);
    assert.strictEqual(g.phase, 'pick');
    assert.strictEqual(g.actor, 0);
    assert.deepStrictEqual(g.pick.cats, TRIVIAL_CATS.filter(c => c !== 'arte'), 'solo los que te faltan');
    assert(!g.act({ type: 'pick', p: 0, cat: 'arte' }).ok, 'el que ya tienes, no');
    act(g, { type: 'pick', p: 0, cat: 'ciencia' });
    assert.strictEqual(g.q.kind, 'wild');
    assert.strictEqual(g.q.level, 3, 'muy difícil');
    assert(g.q.wedge);
    r = answer(g, true);
    assert.deepStrictEqual(kinds(r), ['answer', 'wedge', 'turn']);
    assert.deepStrictEqual(g.tokens[0].wedges, ['arte', 'ciencia']);
    assert.strictEqual(g.tokens[0].at, tvRing(3), 'no se mueve');
    assert.strictEqual(g.current, 0, 'acierta: vuelve a tirar');
    // Con todos los quesitos, el 7 es volver a tirar.
    g.tokens[0].wedges = TRIVIAL_CATS.slice();
    r = roll(g, TRIVIAL_WILD);
    assert.deepStrictEqual(kinds(r), ['roll', 'turn']);
    assert.strictEqual(r.events[1].why, 'wild');
    assert.strictEqual(g.phase, 'roll');
    // Sin el dado del quesito, el 7 no sale.
    const h = setup(2, { wildDie: false });
    for (let k = 0; k < 300; k++) { h.phase = 'roll'; h.act({ type: 'roll', p: 0 }); assert(h.dice >= 1 && h.dice <= 6); }
    const w = setup(2);
    const seen = new Set();
    for (let k = 0; k < 300; k++) { w.phase = 'roll'; w.pick = null; w.act({ type: 'roll', p: 0 }); seen.add(w.dice); }
    assert.strictEqual(seen.size, 7, 'del 1 al 7');
}
{   // El rebote: quien falla una pregunta de quesito se la pasa al siguiente, que se lo lleva si acierta.
    const g = setup(3, { streak: 0 });
    roll(g, 6); goTo(g, trivialHq('deportes'));
    const right = g.answerIdx;
    let r = answer(g, false);
    assert.deepStrictEqual(kinds(r), ['answer', 'rebound']);
    assert(!('correct' in r.events[0]) && !('answerText' in r.events[0]), 'si rebota, la correcta no se dice');
    assert.strictEqual(r.events[0].rebound, 1);
    assert.strictEqual(g.phase, 'answer');
    assert.strictEqual(g.actor, 1, 'contesta el siguiente');
    assert.strictEqual(g.current, 0);
    assert.strictEqual(g.q.wrong.length, 1);
    assert(!g.act({ type: 'answer', p: 0, choice: right }).ok, 'ya no contesta quien ha fallado');
    assert(!g.act({ type: 'answer', p: 1, choice: g.q.wrong[0] }).ok, 'la que ha fallado está descartada');
    const m = new TrivialMirror({ names: g.players.map(p => p.name), rules: {} });
    m.setView(JSON.parse(JSON.stringify(g.view())));
    assert.strictEqual(m.actor, 1);
    r = answer(g, true);
    assert.deepStrictEqual(kinds(r), ['answer', 'wedge', 'turn']);
    assert.deepStrictEqual(g.tokens[1].wedges, ['deportes'], 'el quesito es para quien acierta el rebote');
    assert.deepStrictEqual(g.tokens[0].wedges, []);
    assert.strictEqual(g.tokens[1].at, TRIVIAL_HUB, 'sin moverse');
    assert.strictEqual(g.current, 1, 'y después juega el siguiente');
    // Si el rebote también falla, se dice la correcta y juega el siguiente; solo rebota una vez.
    roll(g, 6); goTo(g, trivialHq('historia'));
    answer(g, false);
    assert.strictEqual(g.actor, 2);
    r = answer(g, false);
    assert.deepStrictEqual(kinds(r), ['answer', 'turn']);
    assert('answerText' in r.events[0]);
    assert.strictEqual(g.current, 2);
    // No rebota en una casilla normal, ni si al siguiente ya tiene ese quesito.
    g.tokens[2].at = tvRing(1);
    roll(g, 1);
    goTo(g, tvRing(2));
    assert.deepStrictEqual(kinds(answer(g, false)), ['answer', 'turn']);
    g.tokens[0].wedges = ['geografia'];
    g.tokens[2].at = TRIVIAL_HUB;
    g.current = 2; g.phase = 'roll';
    roll(g, 6); goTo(g, trivialHq('geografia'));
    assert.deepStrictEqual(kinds(answer(g, false)), ['answer', 'turn'], 'el siguiente ya lo tiene');
    // Sin la regla, no rebota.
    const n = setup(2, { rebound: false });
    roll(n, 6); goTo(n, trivialHq('arte'));
    assert.deepStrictEqual(kinds(answer(n, false)), ['answer', 'turn']);
    // Por equipos rebota al otro equipo, y el quesito es del equipo.
    const t = setup(4, { teams: true });
    roll(t, 6); goTo(t, trivialHq('arte'));
    answer(t, false);
    assert.strictEqual(t.actor, 1);
    answer(t, true);
    assert.deepStrictEqual(t.tokens[1].wedges, ['arte']);
    // El quesito del dado también rebota.
    const d = setup(2);
    roll(d, TRIVIAL_WILD);
    act(d, { type: 'pick', p: 0, cat: 'arte' });
    answer(d, false);
    assert.strictEqual(d.actor, 1);
}
{   // Se acaba el tiempo: cuenta como fallo (y si es de quesito, rebota).
    const g = setup(2);
    roll(g, 6); goTo(g, trivialHq('ciencia'));
    let r = act(g, { type: 'answer', p: 0, timeout: true });
    assert(r.events[0].timeout && !r.events[0].ok && r.events[0].choice === -1);
    assert.strictEqual(g.actor, 1);
    assert.deepStrictEqual(g.q.wrong, [], 'no descarta ninguna');
    r = act(g, { type: 'answer', p: 1, timeout: true });
    assert.deepStrictEqual(kinds(r), ['answer', 'turn']);
    assert.strictEqual(g.current, 1);
}
{   // Errores.
    const g = setup();
    assert(!g.act({ type: 'move', p: 0, to: 1 }).ok, 'primero se tira');
    assert(!g.act({ type: 'roll', p: 1 }).ok, 'no es su turno');
    roll(g, 3);
    assert(!g.act({ type: 'move', p: 0, to: trivialHq('arte') }).ok, 'no se llega con un 3');
    assert(!g.act({ type: 'nada', p: 0 }).ok);
}

// ── Partidas enteras con la máquina, y la mesa del invitado ──
function playGame(seed, n, rules = {}, bank = BANK) {
    const g = new TrivialGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'J' + i })), rules, seed, bank });
    const bots = Array.from({ length: n }, (_, i) => new TrivialBot(g, i, CHARACTERS[(seed + i) % CHARACTERS.length], R.makeRng(seed * 31 + i)));
    const mirror = new TrivialMirror({ names: g.players.map(p => p.name), rules });
    let r = g.startRound();
    assert(r.ok);
    let steps = 0;
    while (g.phase !== 'gameOver') {
        assert(++steps < 20000, 'la partida se acaba');
        const a = bots[g.actor].chooseTurn();
        r = g.act(a);
        assert(r.ok, `${r.error} (${JSON.stringify(a)}, fase ${g.phase})`);
        for (const e of r.events) {
            if (e.t === 'question') { assert(!('correct' in e)); assert.strictEqual(e.options.length, 4); }
            if (e.t === 'answer' && e.rebound == null) assert.strictEqual(e.ok, e.choice === e.correct);
            if (e.t === 'answer' && e.rebound != null) assert(!('correct' in e) && !e.ok);
        }
        mirror.setView(JSON.parse(JSON.stringify(g.view())));
        assert.strictEqual(mirror.actor, g.actor);
        assert.deepStrictEqual(mirror.legal(g.actor), g.legal(g.actor));
    }
    const win = g.tokens[g.side(g.winners[0])];
    assert(win.wedges.length >= g.rules.wedges, 'gana quien tiene los quesitos');
    if (g.rules.hubFinal) assert.strictEqual(win.at, TRIVIAL_HUB, 'y en el centro');
    return steps;
}
const R = require('../js/rules.js');
let games = 0, steps = 0;
for (let s = 1; s <= 60; s++) { steps += playGame(s, 2 + (s % 5)); games++; }
for (let s = 1; s <= 20; s++) { playGame(100 + s, 4, { teams: true }); playGame(200 + s, 6, { teams: true, finalPick: 'tu' }); games += 2; }
for (let s = 1; s <= 20; s++) { playGame(300 + s, 3, { wedges: 3, hubFinal: false, rollAgain: false, level: 'faciles' }); playGame(400 + s, 2, { wedges: 4, finalPick: 'azar', level: 'dificiles' }); games += 2; }
for (let s = 1; s <= 20; s++) { playGame(500 + s, 3, { wildDie: false, rebound: false }); playGame(600 + s, 5, { wedges: 3, hubFinal: false }); games += 2; }
console.log(`${games} partidas de Trivial con la máquina (unas ${Math.round(steps / 60)} jugadas cada una).`);
console.log('Trivial: todo bien.');
