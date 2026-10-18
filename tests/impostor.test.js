// Pruebas de El Impostor sin navegador: node tests/impostor.test.js
'use strict';
const assert = require('assert');
const R = require('../js/rules.js');
const I = require('../js/impostor.js');
const { ImpostorBot } = require('../js/impostor-ai.js');
const { CHARACTERS } = require('../js/ai.js');

const { SHIP, ImpostorGame, shipArea, shipBlocked, shipSight, shipPath, pathLength, IMPOSTOR_RADIUS, IMPOSTOR_USE } = I;

// ── La nave ───────────────────────────────────────
const rooms = SHIP.areas.filter(a => a.kind === 'room');
const corridors = SHIP.areas.filter(a => a.kind === 'corridor');
assert.strictEqual(rooms.length, 6, 'seis salas');
assert.strictEqual(corridors.length, 7, 'siete pasillos');
for (const a of SHIP.areas) {
    // El centro de cada zona es suyo (en el Comedor está la mesa: se mira junto a la pared).
    const [x, y] = shipBlocked(a.cx, a.cy) ? [a.x + 1.5, a.y + 1.5] : [a.cx, a.cy];
    assert.strictEqual(shipArea(x, y)?.id, a.id, `el centro de ${a.id} es suyo`);
    assert(!a.name.includes('undefined'), `${a.id} tiene nombre`);
}
for (const c of corridors) {
    assert.strictEqual(c.doors.length, 2, `${c.id}: una puerta en cada punta`);
    for (const d of c.doors) {
        assert(c.links.includes(d.room), `${c.id}: la puerta da a una de sus salas`);
        // A un paso de la puerta, hacia dentro de la sala y hacia dentro del pasillo, hay suelo de cada uno.
        assert.strictEqual(shipArea(d.x - d.nx * 0.5, d.y - d.ny * 0.5)?.id, d.room, `${c.id}: la puerta toca la sala ${d.room}`);
        assert.strictEqual(shipArea(d.x + d.nx * 0.5, d.y + d.ny * 0.5)?.id, c.id, `${c.id}: la puerta toca el pasillo`);
    }
}
for (const r of rooms) assert(r.doors.length >= 2, `${r.id}: al menos dos salidas`);
assert.strictEqual(SHIP.doors.length, 14);
// La mesa es un mueble: no se puede pisar, pero no tapa la vista.
assert(shipBlocked(22, 6.5), 'la mesa ocupa sitio');
assert(shipSight(18, 6.5, 26, 6.5), 'por encima de la mesa se ve');
assert(!shipSight(6, 6, 22, 3), 'las paredes tapan');
assert(shipSight(17, 3, 27, 10), 'dentro de una sala se ve de punta a punta');

// Todas las salas se alcanzan desde todas, y cada tarea desde el Comedor.
for (const a of SHIP.areas) for (const b of SHIP.areas) {
    const pa = !shipBlocked(a.cx, a.cy) ? a : { cx: a.x + 1.5, cy: a.y + 1.5 };
    const pb = !shipBlocked(b.cx, b.cy) ? b : { cx: b.x + 1.5, cy: b.y + 1.5 };
    const path = shipPath(pa.cx, pa.cy, pb.cx, pb.cy);
    assert(path, `hay camino de ${a.id} a ${b.id}`);
}
for (const s of SHIP.spots) {
    assert.strictEqual(shipArea(s.x, s.y)?.id, s.area, `la tarea ${s.type} está en ${s.area}`);
    assert(shipPath(18, 3, s.x, s.y), `se llega a la tarea ${s.type} de ${s.area}`);
}
// El camino va en línea recta cuando se puede, y nunca roza una pared entre dos puntos.
const straight = shipPath(17.5, 3.5, 26.5, 3.5);
assert.strictEqual(straight.length, 1, 'en la misma sala, en línea recta');
const far = shipPath(3.5, 3.5, 40.5, 23.5);
assert(far.length >= 3 && far.length < 20, 'de Motores a la Enfermería, unos pocos tramos');
assert(pathLength(3.5, 3.5, far) < 70, 'y no da vueltas de más');
{
    let x = 3.5, y = 3.5;
    for (const p of far) { assert(I.shipClear(x, y, p.x, p.y), 'cada tramo está libre'); x = p.x; y = p.y; }
}

// ── Empezar ───────────────────────────────────────
function newGame(n, rules = {}, seed = 3) {
    const g = new ImpostorGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'J' + i })), rules, seed });
    return { g, res: g.startRound() };
}
{
    const { g, res } = newGame(6);
    assert(res.ok);
    assert.strictEqual(g.phase, 'ship');
    assert.strictEqual(res.events.filter(e => e.type === 'tasks').length, 6, 'cada uno sabe sus tareas');
    assert(res.events.filter(e => e.type === 'tasks').every(e => e.secret), 'las tareas de cada uno son suyas');
    for (const pl of g.players) {
        assert.strictEqual(pl.area, 'comedor', 'todos empiezan en el Comedor');
        assert(!shipBlocked(pl.x, pl.y), 'nadie empieza dentro de la mesa ni de una pared');
        assert.strictEqual(pl.tasks.length, 3);
        assert.strictEqual(new Set(pl.tasks.map(t => t.type)).size, 3, 'tres tareas distintas');
        for (const t of pl.tasks) assert.strictEqual(SHIP.spots[t.spot].type, t.type);
    }
    assert.deepStrictEqual(g.taskBar(), { done: 0, total: 18 });
    for (let n = 1; n <= 10; n++) {
        const { g: g2 } = newGame(n);
        for (const pl of g2.players) assert(!shipBlocked(pl.x, pl.y), `con ${n} jugadores, todos caben alrededor de la mesa`);
    }
    const { g: g4 } = newGame(3, { tasks: 4 });
    assert(g4.players.every(pl => pl.tasks.length === 4));
}

// ── Andar y chocar ────────────────────────────────
{
    const { g } = newGame(2);
    const pl = g.players[0];
    pl.x = 18; pl.y = 6.5; pl.area = 'comedor';
    g.input(0, 0, -1);   // hacia el norte, contra la pared de arriba
    let bumps = 0;
    for (let i = 0; i < 90; i++) bumps += g.tick(1 / 30).filter(e => e.type === 'bump' && e.p === 0).length;
    assert(bumps >= 1, 'al llegar a la pared, choca');
    assert(bumps <= 8, 'y el choque no se repite sin parar');
    assert(Math.abs(pl.y - (2 + IMPOSTOR_RADIUS)) < 0.15, 'se queda pegado a la pared');
    assert(!shipBlocked(pl.x, pl.y));
    // Andando en diagonal contra la pared, resbala a lo largo de ella.
    const x0 = pl.x;
    g.input(0, 1, -1);
    for (let i = 0; i < 15; i++) g.tick(1 / 30);
    assert(pl.x > x0 + 0.5, 'resbala por la pared');
    // Hacia el oeste, por el pasillo, hasta Motores.
    pl.x = 17; pl.y = 6.5; pl.area = 'comedor';
    g.input(0, -1, 0);
    const areas = [];
    for (let i = 0; i < 200; i++) for (const e of g.tick(1 / 30)) if (e.type === 'area' && e.p === 0) areas.push(e.area);
    assert.deepStrictEqual(areas, ['p-motores-comedor', 'motores'], 'del Comedor al pasillo y a Motores');
    assert(pl.x > 2 && pl.x < 3, 'hasta la pared del fondo de Motores');
    // El paso de cada uno depende de la velocidad.
    pl.x = 4; pl.y = 6; pl.area = 'motores';
    g.input(0, 1, 0);
    g.tick(0.5);
    assert(Math.abs(pl.x - (4 + I.IMPOSTOR_SPEED * 0.5)) < 1e-9, 'anda a su velocidad');
    g.input(0, 0, 0);
    g.tick(0.5);
    assert.strictEqual(pl.moved, 0, 'sin teclas, quieto');
    // Andando recto contra la esquina de la mesa, se rodea sin chocar.
    pl.x = 19.6; pl.y = 5.15; pl.area = 'comedor';
    g.input(0, 1, 0);
    let corner = 0;
    for (let i = 0; i < 45; i++) corner += g.tick(1 / 30).filter(e => e.type === 'bump' && e.p === 0).length;
    assert(pl.x > 21 && pl.y < 5 - IMPOSTOR_RADIUS + 0.01, 'rodea la esquina de la mesa y sigue');
    assert.strictEqual(corner, 0, 'sin chocar');
    // Y lo mismo con el borde de una puerta: hacia el oeste, un poco por encima del pasillo, se entra en él.
    pl.x = 17; pl.y = 4.8; pl.area = 'comedor';
    g.input(0, -1, 0);
    for (let i = 0; i < 40; i++) g.tick(1 / 30);
    assert.strictEqual(pl.area, 'p-motores-comedor', 'entra en el pasillo aunque apunte al borde de la puerta');
    // Pero contra una pared lisa no se mueve de lado.
    pl.x = 18; pl.y = 6.5; pl.area = 'comedor';
    g.input(0, 0, -1);
    for (let i = 0; i < 60; i++) g.tick(1 / 30);
    assert(Math.abs(pl.x - 18) < 1e-9, 'contra una pared lisa, se queda donde está');
    // La entrada se recorta a 1: en diagonal no se anda más rápido.
    g.input(0, 1, 1);
    assert(Math.abs(Math.hypot(pl.ix, pl.iy) - 1) < 1e-9);
}
// Nunca se atraviesa una pared, ande como ande (con pasos grandes y pequeños).
{
    const rng = R.makeRng(11);
    const { g } = newGame(4);
    for (let i = 0; i < 6000; i++) {
        // Unas veces en cualquier dirección y otras con las teclas (recto o en diagonal), que rodean esquinas.
        if (i % 20 === 0) for (let p = 0; p < 4; p++) {
            if (rng.chance(0.5)) g.input(p, rng.range(-1, 1), rng.range(-1, 1));
            else g.input(p, rng.pick([-1, 0, 1]), rng.pick([-1, 0, 1]));
        }
        g.tick(rng.pick([1 / 60, 1 / 30, 1 / 15]));
        for (const pl of g.players) assert(!shipBlocked(pl.x, pl.y, IMPOSTOR_RADIUS - 0.01), `nadie dentro de una pared (paso ${i})`);
        for (const pl of g.players) assert.strictEqual(pl.area, shipArea(pl.x, pl.y).id, 'la zona de cada uno es la de su sitio');
    }
}

// ── Ver y oír ─────────────────────────────────────
{
    const { g } = newGame(3);
    const [a, b, c] = g.players;
    a.x = 18; a.y = 4; b.x = 21; b.y = 8.5; c.x = 6; c.y = 6;
    let per = g.perceive(0);
    assert(per.seen.includes(1), 'en la misma sala se ven');
    assert(!per.seen.includes(2) && !per.heard.includes(2), 'a quien está quieto en otra sala ni se le ve ni se le oye');
    c.x = 9; c.y = 4;   // en Motores, al otro lado de la pared
    g.input(2, 0, 1); g.tick(1 / 30);
    per = g.perceive(0);
    assert(per.heard.includes(2) && !per.seen.includes(2), 'a través de la pared se oyen sus pasos');
    b.x = 40; b.y = 8;
    assert(!g.perceive(0).seen.includes(1), 'lejos, en otra sala, no se ve');
}

// ── Tareas ────────────────────────────────────────
{
    const { g } = newGame(2, {}, 21);
    const t = g.pending(0)[0];
    let res = g.act({ type: 'startTask', p: 0, i: t.i });
    assert(!res.ok && /lejos/.test(res.error), 'desde lejos no se puede');
    const pl = g.players[0];
    pl.x = t.spot.x; pl.y = t.spot.y;
    assert.strictEqual(g.taskHere(0).i, t.i, 'estando al lado, es la tarea de aquí');
    res = g.act({ type: 'task', p: 0, i: t.i });
    assert(!res.ok, 'hay que empezarla antes');
    res = g.act({ type: 'startTask', p: 0, i: t.i });
    assert(res.ok && res.events[0].type === 'taskStart');
    assert(!g.act({ type: 'startTask', p: 0, i: t.i }).ok, 'no se empieza dos veces');
    g.input(0, 1, 0); g.tick(0.5);
    assert.strictEqual(pl.x, t.spot.x, 'mientras haces una tarea no te mueves');
    res = g.act({ type: 'cancelTask', p: 0 });
    assert(res.ok && !pl.busy, 'se puede dejar a medias');
    g.act({ type: 'startTask', p: 0, i: t.i });
    res = g.act({ type: 'task', p: 0, i: t.i });
    assert(res.ok);
    assert.deepStrictEqual(res.events.map(e => e.type), ['taskDone', 'taskBar']);
    assert.strictEqual(res.events[1].done, 1);
    assert(!g.act({ type: 'startTask', p: 0, i: t.i }).ok, 'una tarea hecha no se repite');
    assert(!g.act({ type: 'task', p: 1, i: 9 }).ok, 'no se hacen tareas que no son tuyas');
    assert(!g.act({ type: 'volar', p: 0 }).ok, 'acciones que no existen');
    // Al terminar todas las tareas de todos, gana la tripulación.
    let last = null;
    for (const p of [0, 1]) for (const tk of g.pending(p)) {
        const q = g.players[p];
        q.x = tk.spot.x; q.y = tk.spot.y; q.busy = null;
        assert(g.act({ type: 'startTask', p, i: tk.i }).ok);
        last = g.act({ type: 'task', p, i: tk.i });
        assert(last.ok);
    }
    assert.strictEqual(g.phase, 'gameOver');
    assert.strictEqual(last.events[last.events.length - 1].type, 'gameOver');
    assert.deepStrictEqual(g.winners, [0, 1], 'gana toda la tripulación');
    assert(!g.act({ type: 'startTask', p: 0, i: 0 }).ok, 'acabada la partida, nada más');
    assert.deepStrictEqual(g.tick(1), [], 'y el tiempo no corre');
}
// Cada tarea se puede usar desde el sitio donde se ponen la guía y el rival de la máquina.
{
    for (const s of SHIP.spots) {
        const p = I.shipStandAt(s);
        assert(!shipBlocked(p.x, p.y), `se puede estar junto a ${s.type} de ${s.area}`);
        assert(Math.hypot(p.x - s.x, p.y - s.y) <= IMPOSTOR_USE, 'y desde ahí se llega');
    }
}

// ── Lo que ve cada uno ────────────────────────────
{
    const { g } = newGame(3);
    const v = g.view(1);
    assert(v.players[1].tasks, 'ves tus tareas');
    assert.strictEqual(v.players[0].tasks, null, 'pero no las de los demás');
}

// ── Partidas enteras entre rivales de la máquina ──
let games = 0, totalTime = 0, maxTime = 0;
for (let seed = 1; seed <= 60; seed++) {
    const rng = R.makeRng(seed * 7919);
    const n = 2 + (seed % 9);
    const levels = ['facil', 'normal', 'dificil'];
    const g = new ImpostorGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'B' + i })), rules: { tasks: 2 + seed % 3 }, seed });
    g.startRound();
    const bots = g.players.map((_, p) => new ImpostorBot(g, p, { ...CHARACTERS[p % CHARACTERS.length], level: levels[(p + seed) % 3] }, R.makeRng(seed * 31 + p)));
    const dt = 1 / 30;
    let t = 0;
    while (g.phase === 'ship' && t < 900) {
        for (const b of bots) {
            const a = b.update(dt);
            if (a) { const res = g.act({ ...a, p: b.me }); assert(res.ok, `partida ${seed}: ${res.error}`); }
        }
        g.tick(dt);
        t += dt;
        for (const pl of g.players) assert(!shipBlocked(pl.x, pl.y, IMPOSTOR_RADIUS - 0.01), 'nadie dentro de una pared');
    }
    assert.strictEqual(g.phase, 'gameOver', `partida ${seed} (${n} jugadores): acaba con las tareas hechas (${JSON.stringify(g.taskBar())} a los ${Math.round(t)} s)`);
    games++; totalTime += t; maxTime = Math.max(maxTime, t);
}

console.log(`El Impostor: todo bien. ${games} partidas entre rivales; duran ${Math.round(totalTime / games)} segundos de media y ${Math.round(maxTime)} como mucho.`);
