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
assert.strictEqual(rooms.length, 11, 'once salas');
assert.strictEqual(corridors.length, 15, 'quince pasillos');
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
assert.strictEqual(SHIP.doors.length, 30);
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
// Las pruebas de andar y de las tareas, sin impostores; las de los impostores, más abajo.
function newGame(n, rules = {}, seed = 3, roles = []) {
    const g = new ImpostorGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'J' + i, role: roles[i] })), rules: { impostors: 0, ...rules }, seed });
    return { g, res: g.startRound() };
}
/** Un jugador hace todas sus tareas, yendo a cada sitio (también a la segunda parte de las que tienen dos). */
function doAll(g, p) {
    let last = null;
    for (let tk; (tk = g.pending(p)[0]) && g.phase === 'ship';) {
        const q = g.players[p];
        q.x = tk.spot.x; q.y = tk.spot.y; q.busy = null;
        // Las muestras: hay que esperar a que se analicen.
        if (tk.readyAt != null && g.time < tk.readyAt) g.tick(tk.readyAt - g.time + 0.01);
        assert(g.act({ type: 'startTask', p, i: tk.i }).ok);
        last = g.act({ type: 'task', p, i: tk.i });
        assert(last.ok, last.error);
    }
    return last;
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
    assert(!per.seen.includes(2) && per.heard === undefined, 'a quien está en otra sala no se le ve, y lo que no se ve no se oye');
    c.x = 9; c.y = 4;   // en Motores, al otro lado de la pared
    g.input(2, 0, 1); g.tick(1 / 30);
    assert(!g.perceive(0).seen.includes(2), 'aunque ande, tras la pared ni se le ve ni se le oye');
    assert(!g.knownBy(0).has(2), 'y la sala no manda dónde está');
    b.x = 40; b.y = 8;
    assert(!g.perceive(0).seen.includes(1), 'lejos, en otra sala, no se ve');
}
{
    // Con las luces apagadas, la tripulación ve y oye mucho más cerca; el impostor, igual que siempre.
    const g = shipWith(4, [[18, 4], [22, 4], [19, 4.5], [40, 20]]);
    g.sab = { kind: 'lights', t0: 0 };
    assert(!g.perceive(1).seen.includes(0) && !g.knownBy(1).has(0), 'a cuatro metros, a oscuras, ni se ve ni se oye');
    assert(g.perceive(2).seen.includes(0), 'a un metro, sí');
    assert(g.perceive(0).seen.includes(1), 'el impostor ve como siempre');
    g.sab = null;
    assert(g.perceive(1).seen.includes(0), 'con luz, se vuelve a ver');
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
    for (const p of [0, 1]) last = doAll(g, p) || last;
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
    assert(!v.players[0].tasks, 'pero no las de los demás');
}

// ── Partidas enteras entre rivales de la máquina ──
let games = 0, totalTime = 0, maxTime = 0;
for (let seed = 1; seed <= 60; seed++) {
    const rng = R.makeRng(seed * 7919);
    const n = 2 + (seed % 9);
    const levels = ['facil', 'normal', 'dificil'];
    const g = new ImpostorGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'B' + i })), rules: { tasks: 2 + seed % 3, impostors: 0 }, seed });
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

// ── Los impostores ────────────────────────────────
{
    // Cuántos hay: con menos de 4 jugadores, ninguno; 1 hasta 6, 2 desde 7 y hasta 3 con 9 o 10.
    const count = (n, impostors) => newGame(n, { impostors }).g.impostorCount();
    assert.strictEqual(count(3, 'auto'), 0);
    assert.strictEqual(count(4, 'auto'), 1);
    assert.strictEqual(count(6, 'auto'), 1);
    assert.strictEqual(count(7, 'auto'), 2);
    assert.strictEqual(count(5, 3), 1, 'con 5, como mucho uno');
    assert.strictEqual(count(10, 3), 3);
    assert.strictEqual(count(8, 0), 0, 'sin impostores, si se elige');
    // Cada uno sabe su papel, en secreto; los impostores saben quiénes son los demás.
    const { g, res } = newGame(8, { impostors: 2 }, 5);
    const roles = res.events.filter(e => e.type === 'role');
    assert.strictEqual(roles.length, 8);
    assert(roles.every(e => e.secret), 'el papel de cada uno es secreto');
    const imps = g.impostors();
    assert.strictEqual(imps.length, 2);
    for (const e of roles) {
        if (imps.includes(e.p)) assert.deepStrictEqual(e.mates, imps.filter(q => q !== e.p), 'el impostor sabe quién es el otro');
        else assert.deepStrictEqual(e.mates, [], 'los tripulantes no saben nada');
    }
    // Las tareas de los impostores son de mentira: no cuentan en la barra y no se pueden acabar.
    assert.strictEqual(g.taskBar().total, 6 * 3, 'la barra solo cuenta las de la tripulación');
    const ip = imps[0], it = g.pending(ip)[0], ipl = g.players[ip];
    ipl.x = it.spot.x; ipl.y = it.spot.y;
    assert(g.act({ type: 'startTask', p: ip, i: it.i }).ok, 'el impostor puede fingir una tarea');
    assert(!g.act({ type: 'task', p: ip, i: it.i }).ok, 'pero no acabarla');
    assert(g.act({ type: 'cancelTask', p: ip }).ok);
    // Quien pide ser impostor lo es; quien pide ser tripulante, no.
    for (let seed = 1; seed <= 10; seed++) {
        const a = newGame(5, { impostors: 1 }, seed, ['impostor']).g;
        assert.deepStrictEqual(a.impostors(), [0], 'si pides ser impostor, lo eres');
        const b = newGame(5, { impostors: 1 }, seed, ['crew']).g;
        assert(!b.impostors().includes(0), 'si pides ser tripulante, lo eres');
    }
}

// Una nave preparada: el impostor es el 0 y todos están donde se dice.
function shipWith(n, at, rules = {}, seed = 9) {
    const { g } = newGame(n, { impostors: 1, ...rules }, seed, ['impostor']);
    at.forEach(([x, y], p) => { const pl = g.players[p]; pl.x = x; pl.y = y; pl.area = shipArea(x, y).id; });
    return g;
}

// ── Matar ─────────────────────────────────────────
{
    // En Motores: el impostor (0) junto a 1; 2 en el Comedor, que no lo ve; 3 en Electricidad.
    const g = shipWith(4, [[5, 5], [6, 5], [22, 3.5], [5, 20]]);
    assert(!g.act({ type: 'kill', p: 0, target: 1 }).ok, 'al empezar hay que esperar un poco');
    g.players[0].killCd = 0;
    assert(!g.act({ type: 'kill', p: 1, target: 0 }).ok, 'los tripulantes no matan');
    assert(!g.act({ type: 'kill', p: 0, target: 3 }).ok, 'de lejos, no');
    assert.deepStrictEqual(g.killTargets(0), [1], 'a su alcance solo está el 1');
    const res = g.act({ type: 'kill', p: 0, target: 1 });
    assert(res.ok, res.error);
    const k = res.events.find(e => e.type === 'kill');
    assert.deepStrictEqual(k.witnesses, [], 'nadie lo ha visto');
    assert.strictEqual(g.players[1].alive, false);
    assert.strictEqual(g.bodies.length, 1, 'queda un cuerpo');
    assert.strictEqual(g.bodies[0].area, 'motores');
    assert.strictEqual(g.players[0].x, 6, 'el impostor salta sobre su víctima');
    assert.strictEqual(g.players[0].killCd, g.rules.killCooldown, 'y tiene que esperar para volver a matar');
    assert(!g.act({ type: 'kill', p: 0, target: 1 }).ok, 'a un muerto no se le mata');
    assert.strictEqual(g.phase, 'ship', 'quedan dos tripulantes contra un impostor: sigue la partida');
    // Los vivos no ven al fantasma; el fantasma ve a todos.
    g.players[1].x = 5; g.players[1].y = 20; g.players[1].area = 'electricidad';
    assert(!g.perceive(3).seen.includes(1), 'nadie ve a los fantasmas');
    assert(g.perceive(1).seen.includes(3), 'los fantasmas ven a los vivos');
    // El fantasma sigue con sus tareas.
    const t = g.pending(1)[0], gp = g.players[1];
    gp.x = t.spot.x; gp.y = t.spot.y;
    assert(g.act({ type: 'startTask', p: 1, i: t.i }).ok && g.act({ type: 'task', p: 1, i: t.i }).ok, 'los fantasmas acaban sus tareas');
    assert(!g.act({ type: 'report', p: 1 }).ok, 'pero no avisan');
    // Con testigo: el 2 está en la misma sala.
    const g2 = shipWith(4, [[18, 4], [19, 4], [24.5, 3.5], [5, 20]]);
    g2.players[0].killCd = 0;
    const k2 = g2.act({ type: 'kill', p: 0, target: 1 }).events.find(e => e.type === 'kill');
    assert.deepStrictEqual(k2.witnesses, [2], 'quien está en la sala lo ve');
    // A través de una pared no se mata, aunque esté cerca.
    const g3 = shipWith(4, [[10.6, 9.2], [11.4, 7.6], [26, 9], [5, 20]]);
    g3.players[0].killCd = 0;
    assert(!shipSight(10.6, 9.2, 11.4, 7.6), 'entre Motores y el pasillo hay una esquina de pared');
    assert.deepStrictEqual(g3.killTargets(0), [], 'con una pared en medio, no está a su alcance');
    // El alcance depende de la regla.
    const near = r => { const x = shipWith(4, [[5, 5], [7.2, 5], [22, 3.5], [5, 20]], { killRange: r }); x.players[0].killCd = 0; return x.killTargets(0).includes(1); };
    assert(!near('corto') && !near('medio') && near('largo'), 'a 2,2 metros solo llega el alcance largo');
}

// ── Ganar ─────────────────────────────────────────
{
    // Un impostor contra dos: al matar a uno, quedan uno contra uno y ganan los impostores.
    const g = shipWith(4, [[5, 5], [6, 5], [22, 3.5], [5, 20]]);
    g.players[3].alive = false; g.players[3].knownDead = true;
    g.players[0].killCd = 0;
    const res = g.act({ type: 'kill', p: 0, target: 1 });
    const over = res.events.find(e => e.type === 'gameOver');
    assert(over && over.side === 'impostors' && over.reason === 'kills', 'ganan los impostores');
    assert.deepStrictEqual(g.winners, [0]);
    assert.strictEqual(g.phase, 'gameOver');
    // La tripulación gana con las tareas aunque haya impostores (las de los muertos también cuentan).
    const g2 = shipWith(4, [[5, 5], [22, 3.5], [23, 3.5], [5, 20]]);
    let last;
    for (const p of [1, 2, 3]) last = doAll(g2, p) || last;
    const end = last.events.find(e => e.type === 'gameOver');
    assert(end && end.side === 'crew' && end.reason === 'tasks', 'gana la tripulación con las tareas');
    assert.deepStrictEqual(g2.winners, [1, 2, 3], 'ganan todos los tripulantes, no el impostor');
}

// ── Avisar y el botón ─────────────────────────────
{
    const g = shipWith(5, [[5, 5], [6, 5], [7.5, 7], [22, 3.5], [40, 20]]);
    g.players[0].killCd = 0;
    g.act({ type: 'kill', p: 0, target: 1 });
    assert(!g.act({ type: 'report', p: 3 }).ok, 'desde el Comedor no se ve el cuerpo');
    g.players[0].x = 9; g.players[0].y = 4;   // el impostor se aparta un poco
    assert.strictEqual(g.bodyHere(2)?.p, 1, 'el 2 tiene el cuerpo cerca');
    assert(g.perceive(2).bodies.includes(1), 'y lo ve');
    const res = g.act({ type: 'report', p: 2 });
    assert(res.ok, res.error);
    const m = res.events[0];
    assert.strictEqual(m.type, 'meeting');
    assert.strictEqual(m.by, 2); assert.strictEqual(m.kind, 'body'); assert.strictEqual(m.body, 1); assert.strictEqual(m.area, 'motores');
    assert.deepStrictEqual(m.dead, [1], 'en la reunión se sabe quién ha muerto');
    assert.strictEqual(g.phase, 'meeting');
    assert.strictEqual(g.bodies.length, 0, 'los cuerpos desaparecen');
    for (const pl of g.players) assert.strictEqual(pl.area, 'comedor', 'todos vuelven al Comedor');
    assert.deepStrictEqual(g.tick(1), [], 'en la reunión no corre el tiempo de la nave');
    assert(!g.act({ type: 'kill', p: 0, target: 2 }).ok, 'ni se mata');
    // El botón: solo junto a la mesa, después de la espera y si te quedan reuniones.
    const { g: b } = newGame(5, { impostors: 1, meetings: 1, buttonWait: 15 });
    const p = b.players.findIndex(pl => pl.role === 'crew');
    assert(b.atButton(p), 'al empezar, todos están junto a la mesa');
    assert(/dentro de 15/.test(b.act({ type: 'button', p }).error), 'hay que esperar al principio');
    b.tick(15.1);
    assert(b.act({ type: 'button', p }).ok, 'después, se puede');
    assert.strictEqual(b.meeting.kind, 'button');
    assert.strictEqual(b.players[p].meetingsLeft, 0);
    const pl = b.players[p];
    pl.x = 5; pl.y = 5;
    assert(!b.atButton(p), 'lejos de la mesa, no');
}

// ── La reunión y los votos ────────────────────────
function meetingWith(n, rules = {}, seed = 9) {
    const { g } = newGame(n, { impostors: 1, discussTime: 0, ...rules }, seed, ['impostor']);
    g.tick(16);
    const res = g.act({ type: 'button', p: 1 });
    assert(res.ok, res.error);
    return g;
}
{
    const g = meetingWith(5);
    assert(g.act({ type: 'say', p: 1, line: { kind: 'sus', who: 0 } }).ok);
    assert(!g.act({ type: 'say', p: 1, line: { kind: 'cantar' } }).ok, 'solo se dice lo que se puede decir');
    assert(!g.act({ type: 'say', p: 1, line: { kind: 'where', area: 'cocina' } }).ok, 'y de salas que existen');
    for (let i = 0; i < 3; i++) g.act({ type: 'say', p: 1, line: { kind: 'nothing' } });
    assert(!g.act({ type: 'say', p: 1, line: { kind: 'nothing' } }).ok, 'cada uno dice como mucho cuatro cosas');
    assert.strictEqual(g.meeting.said.length, 4);
    // Votan 0, 1 y 2 al 0; 3 y 4 saltan. Sale el 0, que era el impostor: gana la tripulación.
    for (const [p, t] of [[0, 1], [1, 0], [2, 0], [3, -1]]) assert(g.act({ type: 'vote', p, target: t }).ok);
    assert(!g.act({ type: 'vote', p: 1, target: 2 }).ok, 'se vota una vez');
    assert.strictEqual(g.phase, 'meeting', 'hasta que no votan todos, no se cuenta');
    const res = g.act({ type: 'vote', p: 4, target: 0 });
    const r = res.events.find(e => e.type === 'voteResult');
    assert.deepStrictEqual(r.counts, { 0: 3, 1: 1 });
    assert.strictEqual(r.skip, 1);
    assert.strictEqual(r.ejected, 0);
    const ej = res.events.find(e => e.type === 'eject');
    assert(ej.impostor === true && ej.left === 0, 'se dice que era el impostor y que no queda ninguno');
    const over = res.events.find(e => e.type === 'gameOver');
    assert(over && over.side === 'crew' && over.reason === 'ejected', 'echado el impostor, gana la tripulación');
}
{
    // Empate: no sale nadie, y se vuelve a la nave con la espera de matar entera.
    const g = meetingWith(6);
    g.players[0].killCd = 0;
    for (const [p, t] of [[0, 1], [1, 0], [2, 1], [3, 0], [4, -1], [5, -1]]) g.act({ type: 'vote', p, target: t });
    assert.strictEqual(g.meeting.stage, 'result', 'contados los votos, se espera a que todos lo oigan');
    assert(!g.act({ type: 'vote', p: 1, target: 2 }).ok && !g.act({ type: 'say', p: 1, line: { kind: 'nothing' } }).ok, 'ya no se vota ni se habla');
    assert.deepStrictEqual(g.resumeShip(), [{ type: 'resume' }]);
    assert.strictEqual(g.phase, 'ship', 'con empate, a la nave');
    assert(g.players.every(pl => pl.alive), 'sin echar a nadie');
    assert.strictEqual(g.players[0].killCd, g.rules.killCooldown, 'tras la reunión, el impostor espera para matar');
    assert(g.buttonWait() > 0, 'y el botón vuelve a esperar');
    // Si echan a un tripulante, se dice que no era impostor y sigue la partida.
    const h = meetingWith(6);
    let res;
    for (const p of [0, 1, 2, 3, 4, 5]) res = h.act({ type: 'vote', p, target: p === 2 ? 3 : 2 });
    const ej = res.events.find(e => e.type === 'eject');
    assert(ej.p === 2 && ej.impostor === false && ej.left === 1);
    assert.strictEqual(res.events[res.events.length - 1].type, 'eject');
    h.resumeShip();
    assert(!h.act({ type: 'say', p: 2, line: { kind: 'nothing' } }).ok, 'los echados ya no hablan');
    // Votos anónimos y sin confirmar: no se dice quién votó a quién ni qué era.
    const a = meetingWith(5, { anonymousVotes: true, confirmEjects: false });
    let ra;
    for (const p of [0, 1, 2, 3, 4]) { ra = a.act({ type: 'vote', p, target: 3 }); if (p < 4) assert.strictEqual(ra.events[0].target, null, 'el voto es secreto'); }
    assert.strictEqual(ra.events.find(e => e.type === 'voteResult').votes, null);
    const ej2 = ra.events.find(e => e.type === 'eject');
    assert(ej2.impostor === null && ej2.left === null, 'sin confirmar, no se sabe qué era');
}

// ── Los sabotajes ─────────────────────────────────
{
    // Las luces: la tripulación viva casi no ve; el impostor, sí. Se arreglan en el cuadro de Electricidad.
    const g = shipWith(4, [[18, 4], [22, 4], [24, 8.5], [5, 20]]);
    assert(g.perceive(1).seen.includes(0), 'con luz, se ve de lejos');
    assert(/faltan/.test(g.act({ type: 'sabotage', p: 0, kind: 'lights' }).error), 'al empezar hay que esperar para sabotear');
    assert(!g.act({ type: 'sabotage', p: 1, kind: 'lights' }).ok, 'los tripulantes no sabotean');
    g.tick(15.1);
    let res = g.act({ type: 'sabotage', p: 0, kind: 'lights' });
    assert(res.ok, res.error);
    assert.strictEqual(res.events[0].type, 'sabotage');
    assert(g.lightsOff);
    assert(!g.perceive(1).seen.includes(0), 'a oscuras, a cuatro metros no se ve');
    assert(g.perceive(0).seen.includes(1), 'pero el impostor sí ve');
    assert(!g.act({ type: 'sabotage', p: 0, kind: 'reactor' }).ok, 'un sabotaje cada vez');
    assert(!g.act({ type: 'fix', p: 1, panel: 'luces' }).ok, 'las luces se arreglan en su panel');
    const q = g.players[3];
    q.x = 10.3; q.y = 24.2; q.area = 'electricidad';
    assert.strictEqual(g.panelHere(3)?.id, 'luces');
    res = g.act({ type: 'fix', p: 3, panel: 'luces' });
    assert(res.ok, res.error);
    assert.deepStrictEqual(res.events[0], { type: 'fixed', kind: 'lights', by: 3 });
    assert(!g.lightsOff && g.perceive(1).seen.includes(0), 'con las luces arregladas, se vuelve a ver');
    assert(/faltan 30/.test(g.act({ type: 'sabotage', p: 0, kind: 'reactor' }).error), 'y hay que esperar para el siguiente');
}
{
    // El reactor: si nadie lo arregla a tiempo, ganan los impostores.
    const g = shipWith(4, [[5, 5], [22, 3.5], [23, 3.5], [5, 20]], { reactorTime: 30 });
    g.tick(15.1);
    const res = g.act({ type: 'sabotage', p: 0, kind: 'reactor' });
    assert(res.ok && Math.abs(res.events[0].until - (g.time + 30)) < 1e-9, 'el reactor da sus segundos');
    assert(/reactor/.test(g.act({ type: 'button', p: 1 }).error), 'con el reactor a punto de estallar no hay reuniones');
    let over = [];
    for (let i = 0; i < 31 * 30 && !over.length; i++) over = g.tick(1 / 30).filter(e => e.type === 'gameOver');
    assert(over.length && over[0].side === 'impostors' && over[0].reason === 'reactor', 'estalla el reactor y ganan los impostores');
    // Con una persona en cada panel a la vez, se arregla. Con una sola, no.
    const h = shipWith(4, [[5, 5], [2.6, 30.6], [22, 3.5], [10.4, 30.6]]);
    h.tick(15.1);
    h.act({ type: 'sabotage', p: 0, kind: 'reactor' });
    let r = h.act({ type: 'fix', p: 1, panel: 'reactor0' });
    assert(r.ok && r.events.length === 1 && r.events[0].type === 'fixHold' && r.events[0].held, 'una mano puesta');
    assert(h.sab, 'con una sola mano no basta');
    assert.deepStrictEqual(h.reactorHeld(), ['reactor0']);
    h.input(1, 1, 0); h.tick(0.5);
    assert(Math.abs(h.players[1].x - 2.6) < 1e-9, 'con la mano en el panel no te mueves');
    r = h.act({ type: 'cancelTask', p: 1 });
    assert(r.ok && r.events[0].type === 'fixHold' && !r.events[0].held, 'se puede soltar');
    assert(!h.act({ type: 'fix', p: 2, panel: 'reactor1' }).ok, 'desde lejos, no');
    h.act({ type: 'fix', p: 1, panel: 'reactor0' });
    r = h.act({ type: 'fix', p: 3, panel: 'reactor1' });
    assert.deepStrictEqual(r.events.map(e => e.type), ['fixHold', 'fixed'], 'con las dos manos a la vez, arreglado');
    assert(!h.sab && !h.players[1].busy && !h.players[3].busy, 'y los dos quedan libres');
}
{
    // Las puertas: se cierran las de una sala y no se pasa; quien estaba en la puerta queda a un lado; se abren solas.
    const g = shipWith(4, [[18, 6.5], [15.5, 6.5], [22, 3.5], [5, 20]]);
    assert(shipPath(18, 6.5, 5, 5, g.closed), 'del Comedor a Motores hay camino');
    assert(/faltan/.test(g.act({ type: 'sabotage', p: 0, kind: 'doors', room: 'comedor' }).error));
    g.tick(15.1);
    assert(!g.act({ type: 'sabotage', p: 0, kind: 'doors', room: 'p-motores-comedor' }).ok, 'solo se cierran las salas');
    const res = g.act({ type: 'sabotage', p: 0, kind: 'doors', room: 'comedor' });
    assert(res.ok, res.error);
    assert.strictEqual(res.events[0].type, 'doors');
    assert(!shipPath(18, 6.5, 5, 5, g.closed), 'con las puertas cerradas no hay camino');
    assert(!shipBlocked(g.players[1].x, g.players[1].y, IMPOSTOR_RADIUS, g.closed), 'quien estaba en la puerta no se queda dentro de ella');
    assert.strictEqual(g.players[1].area, 'comedor', 'se queda dentro de la sala, que estaba más cerca');
    assert(!shipSight(18, 6.5, 13, 6.5, g.closed), 'una puerta cerrada tapa la vista');
    assert(g.sabWait('lights') === 0, 'cerrar puertas no impide otro sabotaje');
    g.input(1, -1, 0);
    let bump = null;
    for (let i = 0; i < 60 && !bump; i++) bump = g.tick(1 / 30).find(e => e.type === 'bump' && e.p === 1);
    assert(bump && bump.what === 'puerta', 'se choca con la puerta');
    let open = null;
    for (let i = 0; i < 11 * 30 && !open; i++) open = g.tick(1 / 30).find(e => e.type === 'doorsOpen');
    assert(open && open.room === 'comedor', 'a los diez segundos se abren');
    assert(shipPath(18, 6.5, 5, 5, g.closed), 'y se vuelve a pasar');
    assert(g.sabWait('doors') > 20, 'hay que esperar para volver a cerrarlas');
    // La reunión acaba con los sabotajes y abre las puertas.
    const h = shipWith(5, [[18, 6.5], [22, 3.5], [23, 3.5], [5, 20], [40, 20]], { buttonWait: 0 });
    h.tick(15.1);
    h.act({ type: 'sabotage', p: 0, kind: 'lights' });
    h.act({ type: 'sabotage', p: 0, kind: 'doors', room: 'electricidad' });
    const m = h.act({ type: 'button', p: 1 });
    assert(m.ok, m.error);
    assert(m.events[0].sab === 'lights' && m.events[0].doors === 'electricidad', 'la reunión dice qué se ha acabado');
    assert(!h.sab && !h.doorsShut && !h.closed.some(Boolean), 'sin sabotajes ni puertas cerradas');
    // Sin sabotajes en las reglas, no hay.
    const k = shipWith(4, [[18, 6.5], [22, 3.5], [23, 3.5], [5, 20]], { sabotages: false });
    k.tick(20);
    assert(!k.act({ type: 'sabotage', p: 0, kind: 'lights' }).ok, 'regla sin sabotajes');
}

// ── Los conductos ─────────────────────────────────
{
    // El impostor (0) junto al conducto de Motores; el 1 lo ve desde la misma sala.
    const g = shipWith(4, [[8.2, 8.2], [5, 5], [22, 3.5], [40, 20]]);
    assert(!g.act({ type: 'vent', p: 1 }).ok, 'los tripulantes no van por los conductos');
    let res = g.act({ type: 'vent', p: 0 });
    assert(res.ok, res.error);
    const e = res.events[0];
    assert(e.type === 'vent' && e.kind === 'in' && e.area === 'motores', 'entra en el conducto de Motores');
    assert.deepStrictEqual(e.witnesses, [1], 'y el 1 lo ha visto');
    assert(!g.perceive(1).seen.includes(0), 'dentro del conducto no se le ve');
    assert(!g.act({ type: 'kill', p: 0, target: 1 }).ok, 'desde un conducto no se mata');
    g.input(0, 1, 0); g.tick(0.5);
    assert.strictEqual(g.players[0].x, SHIP.vents[e.vent].x, 'dentro de un conducto no se anda');
    const to = SHIP.vents[e.vent].to;
    assert.strictEqual(SHIP.vents[to[0]].area, 'reactor', 'de Motores se va al Reactor');
    assert(!g.act({ type: 'ventTo', p: 0, to: 5 }).ok, 'solo a los conductos de su red');
    res = g.act({ type: 'ventTo', p: 0, to: to[0] });
    assert(res.ok && g.players[0].area === 'reactor');
    res = g.act({ type: 'vent', p: 0 });
    assert(res.ok && res.events[0].kind === 'out' && res.events[0].witnesses.length === 0, 'sale en el Reactor sin que le vean');
    assert(g.players[0].vent == null && !shipBlocked(g.players[0].x, g.players[0].y));
    assert(g.act({ type: 'vent', p: 0 }).ok && g.players[0].vent != null, 'y se puede volver a entrar');
    // Sin conductos en las reglas, no hay.
    const h = shipWith(4, [[8.2, 8.2], [5, 5], [22, 3.5], [40, 20]], { vents: false });
    assert(!h.act({ type: 'vent', p: 0 }).ok, 'regla sin conductos');
    // La reunión saca a todos de los conductos.
    const k = shipWith(5, [[8.2, 8.2], [22, 3.5], [23, 3.5], [5, 20], [40, 20]], { buttonWait: 0 });
    k.act({ type: 'vent', p: 0 });
    k.act({ type: 'button', p: 1 });
    assert.strictEqual(k.players[0].vent, null, 'en la reunión nadie está en un conducto');
}

// ── Las consolas ──────────────────────────────────
{
    const g = shipWith(5, [[35, 33.5], [22, 3.5], [23, 3.5], [21.5, 13.5], [40.5, 18.5]]);
    assert(!g.act({ type: 'console', p: 1, id: 'admin' }).ok, 'lejos de la consola, no');
    let res = g.act({ type: 'console', p: 0, id: 'admin' });
    assert(res.ok, res.error);
    assert(res.events[0].secret, 'lo que dice la consola solo lo sabe quien mira');
    assert.deepStrictEqual(res.events[0].data.counts, { administracion: 1, comedor: 2, enfermeria: 1 }, 'el mapa cuenta quién hay en cada sala, sin los pasillos');
    // Las cámaras ven el pasillo del Comedor al Almacén.
    const c = g.players[1];
    c.x = 21; c.y = 35.4; c.area = 'seguridad';
    res = g.act({ type: 'console', p: 1, id: 'cams' });
    assert(res.ok, res.error);
    const cam = res.events[0].data.cams.find(x => x.area === 'p-comedor-almacen');
    assert.deepStrictEqual(cam.seen, [3], 'la cámara ve a quien pasa');
    // Las constantes vitales saben quién ha muerto, aunque nadie haya encontrado el cuerpo.
    g.players[2].alive = false;
    res = g.act({ type: 'console', p: 4, id: 'vitals' });
    assert(res.ok, res.error);
    assert.deepStrictEqual(res.events[0].data.dead, [2]);
    assert.deepStrictEqual(res.events[0].data.alive, [0, 1, 3, 4]);
}

// ── Los fantasmas y las tareas nuevas ─────────────
{
    // Los fantasmas atraviesan las paredes y ven a través de ellas.
    const g = shipWith(4, [[18, 6.5], [22, 3.5], [23, 3.5], [8, 6.5]]);
    g.players[1].alive = false;
    g.players[1].x = 17; g.players[1].y = 6.5;
    g.input(1, -1, 0);
    g.tick(1.5);
    assert(g.players[1].x < 13, 'el fantasma atraviesa la pared hacia Motores');
    assert(g.perceive(1).seen.includes(3), 'y ve a quien está al otro lado');
    g.input(1, 0, -1);
    g.tick(5);
    assert(g.players[1].y >= 1.3, 'pero no sale de la nave');
    // Repostar el motor: se llena la lata en el Almacén y se echa en Motores o en el Reactor.
    const h = shipWith(4, [[18, 6.5], [22, 3.5], [23, 3.5], [8, 6.5]]);
    const fill = SHIP.spots.find(s => s.type === 'combustible' && s.step === 0);
    const pour = SHIP.spots.find(s => s.type === 'combustible' && s.step === 1);
    const q = h.players[1];
    q.tasks = [{ type: 'combustible', spot: fill.id, next: [pour.id], step: 0, done: false }];
    const before = h.taskBar();
    q.x = fill.x; q.y = fill.y;
    h.act({ type: 'startTask', p: 1, i: 0 });
    let res = h.act({ type: 'task', p: 1, i: 0 });
    assert(res.ok, res.error);
    assert.strictEqual(res.events[0].type, 'taskStep', 'hecha la primera parte, queda la segunda');
    assert.strictEqual(res.events[0].area, pour.area);
    assert(!q.tasks[0].done && q.tasks[0].spot === pour.id);
    assert.deepStrictEqual(h.taskBar(), before, 'la barra no sube hasta acabarla');
    assert(!h.act({ type: 'startTask', p: 1, i: 0 }).ok, 'la segunda parte se hace en su sitio');
    q.x = pour.x; q.y = pour.y;
    h.act({ type: 'startTask', p: 1, i: 0 });
    res = h.act({ type: 'task', p: 1, i: 0 });
    assert.strictEqual(res.events[0].type, 'taskDone');
    // El escáner se ve: el tripulante pasa por él; el impostor puede ponerse, pero no pasa nada.
    const k = shipWith(4, [[18, 6.5], [22, 3.5], [23, 3.5], [8, 6.5]]);
    const scan = SHIP.spots.find(s => s.type === 'escaner');
    for (const p of [0, 1]) {
        const pl = k.players[p];
        pl.tasks = [{ type: 'escaner', spot: scan.id, done: false }];
        pl.x = scan.x; pl.y = scan.y;
        const r = k.act({ type: 'startTask', p, i: 0 });
        assert(r.ok, r.error);
        assert.strictEqual(r.events[0].visible, p === 1, p ? 'el tripulante pasa por el escáner y se ve' : 'el impostor no puede fingirlo');
        k.act({ type: 'cancelTask', p });
    }
}

// ── Lo que ve cada uno ────────────────────────────
{
    const { g } = newGame(8, { impostors: 2 }, 5);
    const [i1, i2] = g.impostors(), crew = g.players.find(pl => pl.role === 'crew').index;
    assert.strictEqual(g.view(crew).players[i1].role, null, 'un tripulante no sabe quién es impostor');
    assert.strictEqual(g.view(crew).players[crew].role, 'crew', 'pero sabe lo que es él');
    assert.strictEqual(g.view(i1).players[i2].role, 'impostor', 'los impostores se conocen');
}

// ── El tiempo de la reunión ───────────────────────
{
    const { g } = newGame(5, { impostors: 1, discussTime: 30, voteTime: 20 }, 9, ['impostor']);
    g.tick(16);
    let res = g.act({ type: 'button', p: 1 });
    const m = res.events[0];
    assert.strictEqual(m.stage, 'talk', 'primero se habla');
    assert(Math.abs(m.talkUntil - (g.time + 30)) < 1e-9 && Math.abs(m.voteUntil - (g.time + 50)) < 1e-9, 'y luego se vota');
    assert(/hablando/.test(g.act({ type: 'vote', p: 1, target: 0 }).error), 'mientras se habla, no se vota');
    assert(g.act({ type: 'say', p: 1, line: { kind: 'nothing' } }).ok, 'pero se habla');
    res = g.act({ type: 'ready', p: 1 });
    assert.deepStrictEqual(res.events, [{ type: 'ready', p: 1 }], 'quien quiere votar ya, lo dice');
    assert(!g.act({ type: 'ready', p: 1 }).ok, 'una vez');
    assert.deepStrictEqual(g.view(2).meeting.ready, [1]);
    assert(g.view(2).meeting.said.length === 1 && !g.view(2, true).meeting.said, 'lo dicho va en la mesa entera, no en la ligera');
    let ev = [];
    for (let i = 0; i < 31 * 10 && !ev.length; i++) ev = g.tick(0.1);
    assert.strictEqual(ev[0].type, 'voteStart', 'se acaba el tiempo de hablar: a votar');
    assert(Math.abs(ev[0].until - (g.time + 20)) < 1e-6);
    assert(!g.act({ type: 'ready', p: 2 }).ok, 'ya se está votando');
    g.act({ type: 'vote', p: 1, target: 0 });
    g.act({ type: 'vote', p: 2, target: 0 });
    ev = [];
    for (let i = 0; i < 21 * 10 && !ev.length; i++) ev = g.tick(0.1);
    const r = ev.find(e => e.type === 'voteResult');
    assert(r, 'se acaba el tiempo de votar y se cuentan los votos');
    assert.deepStrictEqual(r.timeout.slice().sort(), [0, 3, 4], 'quien no ha votado a tiempo');
    assert.strictEqual(r.skip, 3, 'salta el voto');
    assert.strictEqual(r.ejected, null, 'con más saltos que votos, no sale nadie');
    assert.deepStrictEqual(g.tick(5), [], 'contados los votos, el reloj ya no hace nada');
    assert.strictEqual(g.resumeShip()[0].type, 'resume');
    // Si todos quieren votar ya, se vota antes.
    const h = meetingWith(4, { discussTime: 60 });
    let last;
    for (const p of h.living()) last = h.act({ type: 'ready', p });
    assert.deepStrictEqual(last.events.map(e => e.type), ['ready', 'voteStart'], 'todos listos: a votar');
    assert.strictEqual(h.meeting.stage, 'vote');
    // Con los votos anónimos no se dice quién no ha votado.
    const a = meetingWith(4, { anonymousVotes: true, voteTime: 10 });
    a.act({ type: 'vote', p: 1, target: -1 });
    ev = [];
    for (let i = 0; i < 11 * 10 && !ev.length; i++) ev = a.tick(0.1);
    assert.strictEqual(ev[0].timeout, null);
}

// ── El oxígeno y las comunicaciones ───────────────
{
    // El oxígeno: un código en cada uno de sus dos teclados, en Oxígeno y en Administración.
    const at = [[18, 6.5], [55.5, 17.5], [40.5, 30.5], [22, 3.5]];
    const g = shipWith(4, at, { reactorTime: 30 });
    g.tick(15.1);
    let res = g.act({ type: 'sabotage', p: 0, kind: 'oxygen' });
    assert(res.ok, res.error);
    assert(Math.abs(res.events[0].until - (g.time + 30)) < 1e-9 && g.critical, 'el oxígeno se cuenta, como el reactor');
    assert(/oxígeno/.test(g.act({ type: 'button', p: 3 }).error), 'sin oxígeno no hay reuniones');
    assert.strictEqual(g.panelHere(1)?.id, 'oxigeno0');
    res = g.act({ type: 'fix', p: 1, panel: 'oxigeno0' });
    assert.deepStrictEqual(res.events, [{ type: 'fixPart', p: 1, kind: 'oxygen', panel: 'oxigeno0', left: ['oxigeno1'] }], 'un teclado arreglado; queda el otro');
    assert(g.sab && !g.players[1].busy, 'con uno no basta, y no hay que quedarse');
    assert(!g.act({ type: 'fix', p: 1, panel: 'oxigeno0' }).ok && g.panelHere(1) === null, 'cada teclado, una vez');
    assert.deepStrictEqual(g.view(3).sab.done, ['oxigeno0'], 'todos saben cuál falta');
    res = g.act({ type: 'fix', p: 2, panel: 'oxigeno1' });
    assert.deepStrictEqual(res.events.map(e => e.type), ['fixPart', 'fixed'], 'con los dos, arreglado');
    assert(!g.sab);
    // Si no se arreglan los dos a tiempo, ganan los impostores.
    const h = shipWith(4, at, { reactorTime: 30 });
    h.tick(15.1);
    h.act({ type: 'sabotage', p: 0, kind: 'oxygen' });
    h.act({ type: 'fix', p: 1, panel: 'oxigeno0' });
    let over = [];
    for (let i = 0; i < 31 * 30 && !over.length; i++) over = h.tick(1 / 30).filter(e => e.type === 'gameOver');
    assert(over.length && over[0].side === 'impostors' && over[0].reason === 'oxygen', 'se acaba el oxígeno');
}
/** Hace una tarea de un sitio de un jugador, en su sitio (la primera de su lista, convertida en los cables). */
function oneTask(g, p) {
    const t = g.players[p].tasks.find(x => !x.done), spot = SHIP.spots.find(s => s.type === 'cables');
    t.type = 'cables'; t.spot = spot.id; delete t.next; delete t.step; delete t.readyAt;
    const q = g.players[p], i = q.tasks.indexOf(t);
    q.x = spot.x; q.y = spot.y; q.busy = null;
    assert(g.act({ type: 'startTask', p, i }).ok);
    const res = g.act({ type: 'task', p, i });
    assert(res.ok, res.error);
    return res;
}
{
    // Las comunicaciones: ni mapa ni cámaras, y la barra no se mueve hasta que se arreglan en la radio.
    const g = shipWith(4, [[18, 6.5], [47.5, 3.5], [35, 33.5], [5, 20]]);
    g.tick(15.1);
    let res = g.act({ type: 'sabotage', p: 0, kind: 'comms' });
    assert(res.ok && res.events[0].until === null && !g.critical, 'las comunicaciones no se cuentan');
    assert(g.commsDown);
    assert.deepStrictEqual(g.act({ type: 'console', p: 2, id: 'admin' }).events[0].data, { down: true }, 'el mapa no tiene señal');
    const before = { ...g.barShown };
    res = oneTask(g, 3);
    assert.deepStrictEqual(res.events.map(e => e.type), ['taskDone'], 'la barra no se mueve');
    assert.deepStrictEqual(g.view(2).bar, before);
    assert.strictEqual(g.panelHere(1)?.id, 'radio');
    res = g.act({ type: 'fix', p: 1, panel: 'radio' });
    assert.deepStrictEqual(res.events.map(e => e.type), ['fixed', 'taskBar'], 'arregladas, la barra se pone al día');
    assert.strictEqual(res.events[1].done, before.done + 1);
    assert(g.act({ type: 'console', p: 2, id: 'admin' }).events[0].data.counts, 'y el mapa vuelve');
}
{
    // La barra solo en las reuniones, o nunca.
    const g = shipWith(4, [[18, 6.5], [47.5, 3.5], [22, 3.5], [5, 20]], { barUpdates: 'reuniones', buttonWait: 0 });
    let res = oneTask(g, 1);
    assert.deepStrictEqual(res.events.map(e => e.type), ['taskDone'], 'con «reuniones», la barra espera');
    res = g.act({ type: 'button', p: 2 });
    assert.deepStrictEqual(res.events.map(e => e.type), ['meeting', 'taskBar'], 'y se pone al día en la reunión');
    const h = shipWith(4, [[18, 6.5], [47.5, 3.5], [22, 3.5], [5, 20]], { barUpdates: 'nunca', buttonWait: 0 });
    assert.strictEqual(h.view(1).bar, null, 'con «nunca», no se ve');
    res = oneTask(h, 1);
    assert.deepStrictEqual(res.events.map(e => e.type), ['taskDone']);
    assert.deepStrictEqual(h.act({ type: 'button', p: 2 }).events.map(e => e.type), ['meeting'], 'ni en la reunión');
}

// ── Las tareas nuevas ─────────────────────────────
{
    for (const type of ['secuencia', 'rumbo', 'basura', 'filtro', 'temperatura', 'muestras']) {
        assert(I.IMPOSTOR_TASKS[type], `la tarea ${type} existe`);
        assert(SHIP.spots.some(s => s.type === type), `y tiene sitio en la nave`);
    }
    // Las muestras: se empieza el análisis y, al rato, se recogen los resultados en el mismo sitio.
    const g = shipWith(4, [[18, 6.5], [22, 3.5], [23, 3.5], [5, 20]]);
    const spot = SHIP.spots.find(s => s.type === 'muestras'), q = g.players[1];
    q.tasks[0] = { type: 'muestras', spot: spot.id, next: [spot.id], step: 0, done: false };
    q.x = spot.x; q.y = spot.y;
    g.act({ type: 'startTask', p: 1, i: 0 });
    let res = g.act({ type: 'task', p: 1, i: 0 });
    const st = res.events[0];
    assert(st.type === 'taskStep' && st.wait === 60 && st.spot === spot.id && Math.abs(st.readyAt - (g.time + 60)) < 1e-9, 'hay que esperar un minuto');
    assert(/analizando/.test(g.act({ type: 'startTask', p: 1, i: 0 }).error), 'antes, no se recogen');
    assert(g.pending(1)[0].readyAt === st.readyAt, 'la tarea sabe cuándo está lista');
    g.tick(60.1);
    assert(g.act({ type: 'startTask', p: 1, i: 0 }).ok, 'pasado el minuto, sí');
    assert.strictEqual(g.act({ type: 'task', p: 1, i: 0 }).events[0].type, 'taskDone');
    // Con tareas fáciles, la mitad.
    const h = shipWith(4, [[18, 6.5], [22, 3.5], [23, 3.5], [5, 20]], { easyTasks: true });
    h.players[1].tasks[0] = { type: 'muestras', spot: spot.id, next: [spot.id], step: 0, done: false };
    Object.assign(h.players[1], { x: spot.x, y: spot.y });
    h.act({ type: 'startTask', p: 1, i: 0 });
    assert.strictEqual(h.act({ type: 'task', p: 1, i: 0 }).events[0].wait, 30);
    // Al repartir, las muestras se hacen dos veces en el mismo sitio.
    for (let seed = 1; seed < 30; seed++) {
        const { g: k } = newGame(4, { tasks: 5 }, seed);
        for (const pl of k.players) for (const t of pl.tasks) if (t.type === 'muestras') assert.deepStrictEqual(t.next, [t.spot]);
    }
}

// ── En una sala ───────────────────────────────────
{
    // Quien juega en otro navegador dice dónde está; el anfitrión solo lo cree si se puede.
    const g = new ImpostorGame({ players: ['A', 'B', 'C', 'D'].map((name, i) => ({ name, remote: i === 1 })), rules: { impostors: 0 }, seed: 4 });
    g.startRound();
    const b = g.players[1], w = b.warp;
    b.x = 17; b.y = 3;
    assert(g.remoteMove(1, { x: 17.5, y: 3.4, fx: 1, fy: 0, w }, 0.2), 'medio metro en un momento, sí');
    assert(b.x === 17.5 && b.y === 3.4 && b.fx === 1 && b.area === 'comedor');
    g.input(1, 1, 0);
    g.tick(1 / 30);
    assert.strictEqual(b.x, 17.5, 'el anfitrión no le mueve: se mueve él');
    assert(g.walking(b), 'pero se le oye andar');
    assert(!g.remoteMove(1, { x: 23, y: 3.4, w }, 0.1), 'cinco metros de golpe, no');
    assert.strictEqual(b.warp, w + 1, 'y se le devuelve a donde estaba');
    assert(!g.remoteMove(1, { x: 17.6, y: 3.4, w }, 0.1), 'lo que mande antes de enterarse no vale');
    assert(!g.remoteMove(1, { x: 16.1, y: 3, w: w + 1 }, 0.5), 'dentro de una pared, tampoco');
    assert(g.remoteMove(1, { x: 17.6, y: 3.4, w: w + 2 }, 0.1));
    b.busy = { i: 0, since: 0 };
    assert(!g.remoteMove(1, { x: 17.7, y: 3.4, w: w + 2 }, 0.1), 'con una tarea entre manos no se anda');
}
{
    // Lo que ve cada uno: de los demás, solo a quien tiene a la vista.
    const g = shipWith(5, [[18, 4], [17, 3], [9, 3], [40, 20], [22, 4]]);
    let v = g.view(1);
    assert(v.players[0].known && v.players[0].x === 18, 'a quien tienes delante, lo ves');
    assert(!v.players[2].known && v.players[2].x === undefined, 'a quien está tras la pared y quieto, no');
    assert(!v.players[3].known, 'ni a quien está lejos');
    assert.strictEqual(v.players[0].role, null, 'y no sabes quién es impostor');
    assert(Array.isArray(v.players[1].tasks) && v.players[1].warp != null, 'de ti, todo');
    assert.strictEqual(v.players[0].tasks, undefined, 'de los demás, sus tareas no');
    assert(v.rules && !g.view(1, true).rules, 'la mesa ligera no lleva las reglas');
    g.input(2, 0, 1);
    g.tick(0.1);
    assert(!g.view(1).players[2].known, 'aunque ande tras la pared: lo que no se ve tampoco se oye');
    assert(g.view(0).players[4].role === null && g.view(0).players[0].role === 'impostor');
    // Una muerte: la ven del todo quien mata, quien muere y los testigos; los demás no se enteran.
    const h = shipWith(5, [[18, 4], [19, 4], [21.5, 4], [9, 4], [40, 20]]);
    h.players[0].killCd = 0;
    const kr = h.act({ type: 'kill', p: 0, target: 1 });
    const k = kr.events.find(e => e.type === 'kill');
    assert.deepStrictEqual(k.witnesses, [2]);
    assert.strictEqual(I.impostorEventFor(h, k, 2), k, 'el testigo lo ve todo');
    assert.strictEqual(I.impostorEventFor(h, k, 1), k, 'y quien muere');
    assert.strictEqual(I.impostorEventFor(h, k, 3), null, 'quien está cerca, tras la pared, no oye nada');
    assert.strictEqual(I.impostorEventFor(h, k, 4), null, 'quien está lejos no se entera');
    assert(h.view(3).players[1].alive, 'para quien no lo ha visto, sigue vivo');
    assert.strictEqual(h.view(2).bodies.length, 1, 'el cuerpo lo ve quien lo tiene delante');
    assert.strictEqual(h.view(4).bodies.length, 0, 'y no quien está lejos');
    // Lo secreto, solo para su dueño; quién sabotea, solo para los impostores.
    const { g: s, res } = newGame(4, { impostors: 1 }, 2, ['impostor']);
    const role = res.events.find(e => e.type === 'role' && e.p === 1);
    assert.strictEqual(I.impostorEventFor(s, role, 1), role);
    assert.strictEqual(I.impostorEventFor(s, role, 2), null, 'el papel de otro no se sabe');
    const sab = { type: 'sabotage', kind: 'lights', by: 0, until: null };
    assert.strictEqual(I.impostorEventFor(s, sab, 1).by, null);
    assert.strictEqual(I.impostorEventFor(s, sab, 0).by, 0);
    // Las tareas de los demás: solo que alguien está con una, si está cerca; y si es el escáner.
    s.players[1].x = 18; s.players[1].y = 4; s.players[2].x = 19; s.players[2].y = 4; s.players[3].x = 40; s.players[3].y = 20;
    const ts = { type: 'taskStart', p: 1, i: 0, task: 'cables', step: 0, fake: false, visible: false };
    assert.deepStrictEqual(I.impostorEventFor(s, ts, 2), { type: 'taskStart', p: 1, task: null, visible: false, x: 18, y: 4 });
    assert.strictEqual(I.impostorEventFor(s, ts, 3), null);
}
{
    // La mesa del invitado: anda él mismo, y los demás se acercan a donde dice el anfitrión.
    const g = new ImpostorGame({ players: ['A', 'B', 'C', 'D'].map((name, i) => ({ name, remote: i === 1 })), rules: { impostors: 1 }, seed: 6 });
    const start = g.startRound();
    const m = new I.ImpostorMirror({ names: g.players.map(p => p.name), rules: g.rules, me: 1 });
    m.setView(g.view(1));
    for (const e of start.events) { const f = I.impostorEventFor(g, e, 1); if (f) m.observe(f); }
    const me = m.players[1], host = g.players[1];
    assert.strictEqual(m.phase, 'ship');
    assert.strictEqual(me.role, host.role, 'sabe su papel');
    assert.deepStrictEqual(me.tasks.map(t => t.type), host.tasks.map(t => t.type), 'y sus tareas');
    assert(me.x === host.x && me.y === host.y && m.warped, 'al empezar, en su sitio');
    m.warped = false;
    assert.deepStrictEqual(m.taskBar(), g.barShown, 've la barra');
    m.input(1, 0, 1);
    const y0 = me.y;
    for (let i = 0; i < 6; i++) m.tickSelf(1 / 30);
    assert(me.y > y0 + 0.5, 'anda en su mesa sin esperar al anfitrión');
    assert(g.remoteMove(1, { x: me.x, y: me.y, fx: me.fx, fy: me.fy, w: me.warp }, 0.2), 'y el anfitrión se lo cree');
    m.setView(g.view(1, true));
    assert(me.y > y0 + 0.5 && !m.warped, 'la mesa que llega no le cambia de sitio');
    // Otro anda: en la mesa del invitado se acerca poco a poco a donde está.
    const other = g.players.findIndex((pl, i) => i !== 1 && g.knownBy(1).has(i));
    const ox = m.players[other].x;
    g.input(other, 1, 0);
    g.tick(0.3);
    g.input(other, 0, 0);
    m.setView(g.view(1, true));
    assert.strictEqual(m.players[other].x, ox, 'no salta');
    for (let i = 0; i < 30; i++) m.tickSelf(1 / 30);
    assert(Math.abs(m.players[other].x - g.players[other].x) < 0.05, 'sino que se acerca');
    // Si el anfitrión le lleva a otro sitio (un salto), se pone allí.
    host.x = 18; host.y = 3.5; host.warp++;
    m.setView(g.view(1, true));
    assert(me.x === 18 && me.y === 3.5 && m.warped, 'el salto, sí');
    // En la reunión se sabe de todos; al acabar la partida, quiénes eran los impostores.
    host.x = 22; host.y = 3.5;
    g.tick(16);
    g.act({ type: 'button', p: 1 });
    m.setView(g.view(1));
    assert(m.phase === 'meeting' && m.meeting.stage === 'talk' && m.players.every(pl => pl.known || pl === me), 'en la reunión, de todos');
    const imp = g.impostors()[0];
    const over = g.finish('crew', 'ejected')[0];
    m.observe(over);
    m.setView(g.view(1));
    assert.deepStrictEqual(m.impostors(), [imp], 'al acabar, se sabe quién era');
}

// ── Los rivales de la máquina ─────────────────────
const { IMPOSTOR_LEVELS } = require('../js/impostor-ai.js');
{
    // Un tripulante que ve un cuerpo va hacia él y avisa.
    const g = shipWith(4, [[30, 20], [24, 20], [22, 3.5], [40, 20]]);
    const bot = new ImpostorBot(g, 1, { ...CHARACTERS[0], level: 'dificil' }, R.makeRng(1));
    g.players[3].alive = false;
    g.bodies.push({ p: 3, x: 19, y: 20, area: 'almacen', t: 0 });
    let action = null;
    for (let i = 0; i < 300 && !action; i++) { action = bot.update(1 / 30); g.tick(1 / 30); }
    assert(action && action.type === 'report', 'el tripulante avisa del cuerpo');
    assert(g.act({ ...action, p: 1 }).ok);
    // Un impostor solo con un tripulante lo mata; con un testigo delante, no.
    const h = shipWith(4, [[5, 5], [8, 6], [22, 3.5], [40, 20]]);
    h.players[0].killCd = 0;
    const imp = new ImpostorBot(h, 0, { ...CHARACTERS[1], level: 'dificil' }, R.makeRng(2));
    action = null;
    for (let i = 0; i < 600 && !action; i++) { action = imp.update(1 / 30); h.tick(1 / 30); }
    assert(action && action.type === 'kill' && action.target === 1, 'el impostor mata a quien está solo');
    const w = shipWith(4, [[18, 4], [21, 4], [24.5, 3.5], [40, 20]]);
    w.players[0].killCd = 0;
    const imp2 = new ImpostorBot(w, 0, { ...CHARACTERS[1], level: 'dificil' }, R.makeRng(3));
    let killed = false;
    for (let i = 0; i < 150; i++) { const a = imp2.update(1 / 30); if (a?.type === 'kill') killed = true; w.input(2, 0, 0); w.tick(1 / 30); }
    assert(!killed, 'delante de un testigo, no mata');
    assert(IMPOSTOR_LEVELS.facil.careless > IMPOSTOR_LEVELS.dificil.careless, 'los fáciles son más descuidados');
}
{
    // En la reunión, quien vio matar lo dice y lo vota; quien le acusa sin razón se defiende.
    const g = shipWith(5, [[18, 4], [19, 4], [21.5, 3.5], [40, 20], [5, 20]]);
    const bots = g.players.map((_, p) => new ImpostorBot(g, p, { ...CHARACTERS[p], level: 'normal' }, R.makeRng(p + 40)));
    for (const b of bots) b.sense();
    g.players[0].killCd = 0;
    const res = g.act({ type: 'kill', p: 0, target: 1 });
    for (const e of res.events) for (const b of bots) b.observe(e);
    assert.deepStrictEqual(bots[2].witness, { killer: 0, victim: 1, area: 'comedor' }, 'el 2 lo ha visto');
    const rep = g.act({ type: 'report', p: 2 });
    for (const e of rep.events) for (const b of bots) b.observe(e);
    const lines = bots[2].meetingLines(g.meeting);
    assert.deepStrictEqual(lines[0], { kind: 'kill', who: 0 }, 'cuenta lo que ha visto');
    for (const l of lines) g.act({ type: 'say', p: 2, line: l });
    const reply = bots[0].react(2, lines[0], g.meeting);
    assert.strictEqual(reply[0].kind, 'deny', 'el acusado dice que no ha sido');
    assert.strictEqual(bots[2].vote(g.meeting), 0, 'y lo vota');
}

// ── Partidas enteras con impostores ───────────────
/** Una reunión entre rivales de la máquina: hablan, contestan y votan, como en la mesa. */
function botMeeting(g, bots) {
    const M = g.meeting, alive = g.living();
    const say = (p, line) => {
        const r = g.act({ type: 'say', p, line });
        if (!r.ok) return;
        for (const e of r.events) for (const b of bots) b.observe(e);
        for (const q of g.living()) for (const l of bots[q].react(p, line, M)) say(q, l);
    };
    const order = [M.by, ...alive.filter(p => p !== M.by)].filter(p => g.players[p].alive);
    for (const p of order) for (const l of bots[p].meetingLines(M)) say(p, l);
    // Cuando han hablado todos, quieren votar ya: se acaba el tiempo de hablar.
    for (const p of alive) {
        const r = g.act({ type: 'ready', p });
        assert(r.ok, r.error);
        for (const e of r.events) for (const b of bots) b.observe(e);
    }
    assert.strictEqual(M.stage, 'vote', 'si todos quieren votar, se vota');
    // Nadie se contradice: no defiende a quien acusa de matar o de mentir.
    for (const p of alive) {
        const mine = M.said.filter(x => x.p === p).map(x => x.line);
        for (const l of mine) if (l.kind === 'with') assert(!mine.some(o => ['kill', 'lie'].includes(o.kind) && o.who === l.who), `B${p} defiende y acusa a B${l.who} en la misma reunión`);
    }
    for (const p of alive) {
        const r = g.act({ type: 'vote', p, target: bots[p].vote(M) });
        assert(r.ok, r.error);
        for (const e of r.events) for (const b of bots) b.observe(e);
    }
    for (const e of g.resumeShip()) for (const b of bots) b.observe(e);
}
const ends = {}, sides = {}, used = {};
let impGames = 0, impTime = 0, impMeetings = 0, crewEjects = 0, impEjects = 0;
for (let seed = 1; seed <= 120; seed++) {
    const n = 4 + (seed % 7);
    const levels = ['facil', 'normal', 'dificil'];
    const g = new ImpostorGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'B' + i })), rules: { tasks: 2 + seed % 3, killCooldown: [15, 25, 35][seed % 3] }, seed });
    const bots = g.players.map((_, p) => new ImpostorBot(g, p, { ...CHARACTERS[p % CHARACTERS.length], level: levels[(p + seed) % 3] }, R.makeRng(seed * 37 + p)));
    const observe = res => {
        for (const e of res.events) {
            for (const b of bots) b.observe(e);
            const k = e.type === 'sabotage' ? e.kind : e.type === 'vent' ? 'vent-' + e.kind : ['doors', 'fixed', 'scan'].includes(e.type) ? e.type : e.type === 'taskStart' && e.visible ? 'escaner' : null;
            if (k) used[k] = (used[k] || 0) + 1;
        }
    };
    observe(g.startRound());
    const dt = 1 / 30;
    let t = 0;
    while (g.phase !== 'gameOver' && t < 1500) {
        if (g.phase === 'meeting') {
            const before = g.players.filter(pl => pl.alive).map(pl => pl.index);
            botMeeting(g, bots);
            impMeetings++;
            const out = before.find(p => !g.players[p].alive);
            if (out != null) { if (g.isImpostor(out)) impEjects++; else crewEjects++; }
            continue;
        }
        for (const b of bots) {
            const a = b.update(dt);
            if (a) { const res = g.act({ ...a, p: b.me }); assert(res.ok, `partida ${seed}: ${a.type}: ${res.error}`); observe(res); }
            if (g.phase !== 'ship') break;
        }
        if (g.phase !== 'ship') continue;
        observe({ events: g.tick(dt) });
        t += dt;
        // Los vivos nunca están dentro de una pared; los fantasmas, sí, pero no salen de la nave.
        for (const pl of g.players) {
            if (pl.alive) assert(!shipBlocked(pl.x, pl.y, IMPOSTOR_RADIUS - 0.01, g.closed), 'nadie dentro de una pared');
            else assert(pl.x > 1 && pl.y > 1 && pl.x < SHIP.w - 1 && pl.y < SHIP.h - 1, 'los fantasmas no salen de la nave');
        }
    }
    assert.strictEqual(g.phase, 'gameOver', `partida ${seed} (${n} jugadores): acaba (${JSON.stringify(g.taskBar())} a los ${Math.round(t)} s)`);
    const imps = g.impostors(), live = g.living();
    if (g.result.side === 'impostors') assert(live.filter(p => imps.includes(p)).length >= live.filter(p => !imps.includes(p)).length, 'ganan los impostores cuando son tantos como los tripulantes');
    if (g.result.reason === 'ejected') assert(!live.some(p => imps.includes(p)), 'echados todos los impostores');
    ends[g.result.reason] = (ends[g.result.reason] || 0) + 1;
    sides[g.result.side] = (sides[g.result.side] || 0) + 1;
    impGames++; impTime += t;
}
assert(ends.tasks && ends.ejected && ends.kills, `se gana de las tres maneras: ${JSON.stringify(ends)}`);
assert(sides.crew > impGames * 0.25 && sides.impostors > impGames * 0.25, `las dos partes ganan a menudo: ${JSON.stringify(sides)}`);
assert(impEjects > crewEjects * 0.5, `las reuniones echan a impostores a menudo: ${impEjects} impostores y ${crewEjects} tripulantes`);
assert(used.lights && used.reactor && used.oxygen && used.comms && used.doors && used['vent-in'] && used['vent-out'], `los impostores sabotean y usan los conductos: ${JSON.stringify(used)}`);
assert(used.fixed >= (used.lights + used.reactor + used.oxygen + used.comms) * 0.5, `la tripulación arregla los sabotajes: ${JSON.stringify(used)}`);
assert((ends.reactor || 0) + (ends.oxygen || 0) < impGames * 0.15, `el reactor estalla y el oxígeno se acaba pocas veces: ${JSON.stringify(ends)}`);

// ── Los colores y los gorros ──────────────────────
{
    const L = I.impostorLooks([{ color: 3 }, { color: 3 }, {}, { color: 9, hat: 2 }], R.makeRng(5));
    assert.strictEqual(L[0].color, 3, 'quien pide un color libre se lo queda');
    assert.notStrictEqual(L[1].color, 3, 'el segundo que lo pide se queda con otro');
    assert.strictEqual(L[3].color, 9);
    assert.strictEqual(L[3].hat, 2, 'y el gorro que pide');
    assert.strictEqual(new Set(L.map(x => x.color)).size, 4, 'nadie repite color');
    for (let n = 1; n <= 10; n++) {
        const g = new ImpostorGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'C' + i, color: i % 2 ? 0 : null })), seed: n });
        assert.strictEqual(new Set(g.players.map(pl => pl.color)).size, n, `con ${n}, cada uno con su color`);
        g.startRound();
        const v = g.view(0);
        assert(v.players.every((e, i) => e.color === g.players[i].color && e.hat === g.players[i].hat), 'todos saben el color de todos');
        const m = new I.ImpostorMirror({ names: g.players.map(pl => pl.name), me: 0 });
        m.setView(v);
        assert(m.players.every((pl, i) => pl.color === g.players[i].color), 'el invitado ve los mismos colores');
    }
}

// ── Las clases de tareas ──────────────────────────
{
    const { g } = newGame(5, { tasks: 4, commonTasks: 2, longTasks: 1 }, 11);
    const commons = g.players.map(pl => pl.tasks.filter(t => t.common).map(t => `${t.type}@${t.spot}`).join());
    assert(commons[0].split(',').length === 2 && commons.every(c => c === commons[0]), 'las comunes son las mismas, en el mismo sitio, para todos');
    for (const pl of g.players) {
        assert.strictEqual(pl.tasks.length, 4);
        assert.strictEqual(pl.tasks.filter(t => !t.common && I.IMPOSTOR_TASKS[t.type].long).length, 1, 'una larga');
        assert.strictEqual(new Set(pl.tasks.map(t => t.type)).size, 4, 'sin repetir');
    }
    const { g: g0 } = newGame(4, { tasks: 3, commonTasks: 0, longTasks: 0 }, 12);
    assert(g0.players.every(pl => pl.tasks.every(t => !t.common && !I.IMPOSTOR_TASKS[t.type].long)), 'sin comunes ni largas, todas cortas');
    const { g: g5 } = newGame(4, { tasks: 2, commonTasks: 2, longTasks: 2 }, 13);
    assert(g5.players.every(pl => pl.tasks.length === 2 && pl.tasks.every(t => t.common)), 'las comunes van primero');
    // Las tareas que se ven: el escudo y la basura también, salvo si la regla lo quita.
    for (const [rule, want] of [[true, true], [false, false]]) {
        const { g: k } = newGame(4, { visualTasks: rule, commonTasks: 0, longTasks: 0, tasks: 5 }, 20);
        const pl = k.players[1];
        const i = pl.tasks.findIndex(t => t.type === 'escudos' || t.type === 'basura');
        if (i < 0) continue;
        const sp = SHIP.spots[pl.tasks[i].spot];
        pl.x = sp.x; pl.y = sp.y;
        const e = k.act({ type: 'startTask', p: 1, i }).events[0];
        assert.strictEqual(e.visible, want, `con visualTasks ${rule}, la tarea ${pl.tasks[i].type} ${want ? 'se ve' : 'no se ve'}`);
    }
}

// ── Los papeles especiales ────────────────────────
{
    const all = { roleScientist: 1, roleEngineer: 1, roleNoisemaker: 1, roleAngel: 1, roleShapeshifter: 1, rolePhantom: 1, impostors: 2 };
    const { g, res } = newGame(8, all, 4);
    const sp = g.players.map(pl => pl.special);
    for (const id of Object.keys(I.IMPOSTOR_ROLES)) assert.strictEqual(sp.filter(x => x === id).length, 1, `hay un ${id}`);
    for (const pl of g.players) if (pl.special) assert.strictEqual(pl.role === 'impostor', I.IMPOSTOR_ROLES[pl.special].side === 'impostor', `${pl.special} es del lado que toca`);
    assert(res.events.filter(e => e.type === 'role').every(e => e.special === g.players[e.p].special), 'cada uno sabe su papel');
    assert(!newGame(8, { ...all, mode: 'escondite' }, 4).g.players.some(pl => pl.special), 'en el escondite no hay papeles');
    assert(!newGame(5, {}, 4).g.players.some(pl => pl.special), 'con las reglas de siempre, tampoco');
}
{
    // El científico mira las constantes vitales desde cualquier sitio, mientras le dura la batería.
    const g = shipWith(4, [[5, 5], [22, 3.5], [40, 20], [5, 20]], { roleScientist: 1 });
    const s = g.players.find(pl => pl.special === 'scientist').index;
    assert(!g.act({ type: 'console', p: s, id: 'vitals' }).ok, 'lejos de la consola, no');
    assert(!g.act({ type: 'power', p: s }).ok, 'al empezar hay que esperar');
    g.players[s].powerCd = 0;
    const on = g.act({ type: 'power', p: s });
    assert(on.ok && on.events[0].secret && on.events[0].on);
    assert(g.act({ type: 'console', p: s, id: 'vitals' }).ok, 'con la batería, desde cualquier sitio');
    const off = g.tick(I.IMPOSTOR_ROLES.scientist.dur + 0.1).find(e => e.type === 'power');
    assert(off && !off.on, 'se acaba la batería');
    assert(!g.act({ type: 'console', p: s, id: 'vitals' }).ok, 'sin batería, no');
    assert(g.players[s].powerCd > 0, 'y hay que esperar para volver a usarla');
}
{
    // El ingeniero va por los conductos, un rato como mucho.
    const v = SHIP.vents[0];
    const g = shipWith(4, [[22, 3.5], [v.x, v.y - 0.6], [40, 20], [5, 20]], { roleEngineer: 1 }, 2);
    const e = g.players.find(pl => pl.special === 'engineer');
    const p = e.index;
    if (p !== 1) { const q = g.players[1]; [q.x, q.y, e.x, e.y] = [e.x, e.y, q.x, q.y]; e.area = shipArea(e.x, e.y).id; q.area = shipArea(q.x, q.y).id; }
    const other = g.players.find(pl => pl.role === 'crew' && !pl.special);
    assert(!g.canVent(other.index) && g.canVent(p), 'solo el ingeniero, de la tripulación');
    const r = g.act({ type: 'vent', p });
    assert(r.ok, r.error);
    assert.strictEqual(r.events[0].limit, I.IMPOSTOR_ROLES.engineer.dur);
    assert(g.act({ type: 'ventTo', p, to: v.to[0] }).ok, 'y va de uno a otro');
    const out = g.tick(I.IMPOSTOR_ROLES.engineer.dur + 0.1).find(x => x.type === 'vent');
    assert(out && out.kind === 'out' && out.forced, 'al cabo de un rato, sale solo');
    assert(!shipBlocked(e.x, e.y), 'fuera del conducto, en el suelo');
    e.x = SHIP.vents[v.to[0]].x; e.y = SHIP.vents[v.to[0]].y;
    assert(!g.act({ type: 'vent', p }).ok, 'y tiene que esperar para volver a entrar');
}
{
    // El ruidoso: al morir, suena una alarma para todos.
    const g = shipWith(4, [[5, 5], [6, 5], [22, 3.5], [5, 20]], { roleNoisemaker: 1 }, 6);
    const nm = g.players.find(pl => pl.special === 'noisemaker');
    const v = g.players[1];
    [nm.x, nm.y, v.x, v.y] = [v.x, v.y, nm.x, nm.y]; nm.area = shipArea(nm.x, nm.y).id; v.area = shipArea(v.x, v.y).id;
    g.players[0].killCd = 0;
    const r = g.act({ type: 'kill', p: 0, target: nm.index });
    assert(r.ok, r.error);
    const al = r.events.find(e => e.type === 'alarm');
    assert(al && al.p === nm.index && al.area === 'motores', 'suena la alarma desde su cuerpo');
    for (let q = 0; q < 4; q++) assert(I.impostorEventFor(g, al, q), 'la oyen todos');
}
{
    // El ángel de la guarda, de fantasma, protege a quien tiene cerca.
    const g = shipWith(5, [[5, 5], [6, 5], [22, 3.5], [5, 20], [40, 20]], { roleAngel: 1 }, 7);
    const an = g.players.find(pl => pl.special === 'angel');
    assert(!g.act({ type: 'power', p: an.index }).ok, 'vivo, todavía no');
    an.alive = false; an.powerCd = 0;
    const v = g.players.find(pl => pl.role === 'crew' && pl !== an), w = g.players.find(pl => pl.role === 'crew' && pl !== an && pl !== v);
    v.x = 6; v.y = 5; v.area = 'motores';
    an.x = 7; an.y = 5;
    const r = g.act({ type: 'power', p: an.index });
    assert(r.ok, r.error);
    assert.strictEqual(r.events[0].target, v.index, 'protege a quien tiene más cerca');
    assert(r.events[0].secret);
    g.players[0].killCd = 0;
    const k = g.act({ type: 'kill', p: 0, target: v.index });
    assert(k.ok && k.events[0].type === 'shielded', 'el escudo lo salva');
    assert(v.alive && g.players[0].killCd > 0, 'sigue vivo, y el impostor tiene que esperar');
    assert(I.impostorEventFor(g, k.events[0], an.index) && I.impostorEventFor(g, k.events[0], 0), 'lo saben el ángel y el impostor');
    assert(!I.impostorEventFor(g, k.events[0], v.index), 'quien estaba protegido no se entera');
    assert(g.view(an.index).players[v.index].shield, 'el ángel ve a quién protege');
    assert(!g.view(w.index).players[v.index].shield, 'los demás, no');
    assert(g.tick(I.IMPOSTOR_ROLES.angel.dur + 0.1).some(e => e.type === 'shieldOff'), 'el escudo se acaba');
    g.players[0].killCd = 0;
    assert(g.act({ type: 'kill', p: 0, target: v.index }).events[0].type === 'kill', 'sin escudo, muere');
}
{
    // El cambiaformas: se transforma en otro, y quien lo ve matar culpa a ese otro.
    const g = shipWith(5, [[5, 5], [6, 5], [7.5, 5], [22, 3.5], [40, 20]], { roleShapeshifter: 1 }, 8);
    const ss = g.players[0];
    assert.strictEqual(ss.special, 'shapeshifter');
    ss.powerCd = 0;
    assert(!g.act({ type: 'power', p: 0, as: 0 }).ok, 'en sí mismo, no');
    const r = g.act({ type: 'power', p: 0, as: 3 });
    assert(r.ok, r.error);
    assert.strictEqual(r.events[0].type, 'shift');
    assert.deepStrictEqual(r.events[0].witnesses.sort(), [1, 2], 'lo ven transformarse los que están a la vista');
    assert(I.impostorEventFor(g, r.events[0], 1) && !I.impostorEventFor(g, r.events[0], 3), 'quien no lo ve no se entera');
    assert.strictEqual(g.shown(0), 3, 'se le ve como el 3');
    assert.strictEqual(g.view(1).players[0].as, 3);
    ss.killCd = 0;
    const k = g.act({ type: 'kill', p: 0, target: 1 });
    assert.strictEqual(k.events[0].as, 3, 'quien lo ve matar ve al 3');
    const back = g.tick(I.IMPOSTOR_ROLES.shapeshifter.dur + 0.1).find(e => e.type === 'unshift');
    assert(back && g.shown(0) === 0, 'al rato vuelve a ser él');
    ss.powerCd = 0;
    g.act({ type: 'power', p: 0, as: 4 });
    g.players[2].x = 23; g.players[2].y = 3.5; g.players[2].area = 'comedor';
    g.bodies = [{ p: 1, x: 22.5, y: 3.5, area: 'comedor', t: g.time }];
    g.act({ type: 'report', p: 2 });
    assert.strictEqual(g.shown(0), 0, 'la reunión le quita el disfraz');
}
{
    // El espectro: invisible un rato; nadie de la tripulación lo ve ni lo oye, y no puede matar.
    const g = shipWith(4, [[5, 5], [6.5, 5], [22, 3.5], [5, 20]], { rolePhantom: 1 }, 9);
    const ph = g.players[0];
    assert.strictEqual(ph.special, 'phantom');
    ph.powerCd = 0;
    const r = g.act({ type: 'power', p: 0 });
    assert(r.ok && r.events[0].type === 'vanish' && r.events[0].witnesses.includes(1), 'quien lo ve, lo ve desaparecer');
    assert(!g.perceive(1).seen.includes(0), 'invisible');
    assert(!g.knownBy(1).has(0), 'en una sala, tampoco se sabe dónde está');
    ph.killCd = 0;
    assert(!g.act({ type: 'kill', p: 0, target: 1 }).ok, 'invisible no se mata');
    assert(!g.camFeed().some(f => f.people.some(q => q.p === 0)), 'ni sale en las cámaras');
    const ap = g.tick(I.IMPOSTOR_ROLES.phantom.dur + 0.1).find(e => e.type === 'appear');
    assert(ap && g.perceive(1).seen.includes(0), 'al rato se le vuelve a ver');
}

// ── El escondite ──────────────────────────────────
{
    const hs = { mode: 'escondite', impostors: 'auto' };
    assert.strictEqual(I.impostorsFor(2, 'auto', 'escondite'), 1);
    assert.strictEqual(I.impostorsFor(10, 3, 'escondite'), 1, 'en el escondite, siempre uno');
    const { g, res } = newGame(5, hs, 3, ['impostor']);
    assert.deepStrictEqual(res.events[0].seekers, [0], 'todos saben quién es el impostor');
    assert.strictEqual(g.view(2).players[0].role, 'impostor', 'también en la mesa del invitado');
    const imp = g.players[0];
    imp.ix = 1;
    g.tick(1);
    const x0 = imp.x;
    g.tick(1);
    assert.strictEqual(imp.x, x0, 'al empezar, el impostor espera quieto');
    assert(!g.act({ type: 'sabotage', p: 0, kind: 'lights' }).ok, 'no hay sabotajes');
    assert(!g.act({ type: 'button', p: 1 }).ok, 'ni reuniones');
    assert(g.canVent(1) && !g.canVent(0), 'la tripulación va por los conductos; el impostor, no');
    const go = g.tick(I.IMPOSTOR_HIDE.start);
    assert(go.some(e => e.type === 'hideGo'), 'sale a cazar');
    g.tick(0.5);
    assert(imp.x > x0, 'y ya anda');
    // Cada tarea quita tiempo.
    const until = g.hide.until, t = g.players[1].tasks[0], sp = SHIP.spots[t.spot];
    g.players[1].x = sp.x; g.players[1].y = sp.y;
    if (t.readyAt == null) {
        g.act({ type: 'startTask', p: 1, i: 0 });
        const d = g.act({ type: 'task', p: 1, i: 0 });
        if (d.events[0].type === 'taskDone') assert.strictEqual(g.hide.until, until - I.IMPOSTOR_HIDE.task, 'cada tarea quita tiempo');
    }
    // El latido: cuanto más cerca está el impostor, más fuerte, aunque haya paredes.
    imp.x = 5; imp.y = 20; g.players[2].x = 5; g.players[2].y = 12;
    assert(g.dangerOf(2) > 0.3 && g.dangerOf(2) < 1, 'el latido se oye de cerca');
    assert.strictEqual(g.dangerOf(0), 0, 'el impostor no tiene latido');
    g.players[3].x = 50; g.players[3].y = 20;
    assert.strictEqual(g.dangerOf(3), 0, 'de lejos, nada');
    // El escondite final: el impostor sabe dónde está cada uno.
    const fin = g.tick(g.hide.until - I.IMPOSTOR_HIDE.final - g.time + 0.1);
    assert(fin.some(e => e.type === 'finalHide'), 'empieza el escondite final');
    const ping = fin.find(e => e.type === 'ping') || g.tick(0.1).find(e => e.type === 'ping');
    assert(ping && ping.p === 0 && ping.secret && ping.at.length === 4, 'el impostor sabe dónde están los cuatro');
    const end = g.tick(g.hide.until - g.time + 0.1);
    assert(end.some(e => e.type === 'gameOver' && e.side === 'crew' && e.reason === 'time'), 'si aguantan, gana la tripulación');
}

// ── Las cámaras ───────────────────────────────────
{
    const cam = SHIP.cameras[1];   // en el pasillo entre el Comedor y el Almacén
    const g = shipWith(4, [[cam.x, cam.y - 1], [cam.x, cam.y], [21, 34], [5, 20]], {}, 10);
    assert(!g.camsOn, 'nadie mira las cámaras');
    const pantallas = SHIP.consoles.find(c => c.id === 'cams');
    g.players[2].x = pantallas.x; g.players[2].y = pantallas.y - 1; g.players[2].area = 'seguridad';
    const c = g.act({ type: 'console', p: 2, id: 'cams' });
    assert(c.ok, c.error);
    assert(g.camsOn && g.watchingCams(2), 'al mirarlas, se encienden');
    const v = g.view(2);
    assert(v.camsOn && v.feed && v.feed[1].people.some(q => q.p === 0), 'quien mira ve en directo lo que pasa');
    assert(!g.view(3).feed, 'los demás, no');
    g.players[0].killCd = 0;
    const k = g.act({ type: 'kill', p: 0, target: 1 });
    assert(k.events[0].cams.includes(1), 'la cámara ve la muerte');
    assert(I.impostorEventFor(g, k.events[0], 2), 'quien mira las cámaras la ve');
    assert(!I.impostorEventFor(g, k.events[0], 3), 'quien no, no');
    g.tick(I.IMPOSTOR_WATCH + 0.1);
    assert(!g.camsOn, 'al dejar de mirarlas, se apagan');
    assert.strictEqual(I.camHeading('p-comedor-almacen', 0, 1), 'almacen', 'hacia abajo, al Almacén');
    assert.strictEqual(I.camHeading('p-comedor-almacen', 0, -1), 'comedor');
}

// ── Partidas enteras: papeles, escondite y práctica ─
const extra = { roles: {}, hide: {}, practice: 0 };
function playOut(g, bots, maxT, tally) {
    const observe = res => { for (const e of res.events) { for (const b of bots) b.observe(e); tally?.(e); } };
    observe(g.startRound());
    let t = 0;
    while (g.phase !== 'gameOver' && t < maxT) {
        if (g.phase === 'meeting') { botMeeting(g, bots); continue; }
        for (const b of bots) {
            const a = b.update(1 / 30);
            if (a) { const res = g.act({ ...a, p: b.me }); assert(res.ok, `${a.type}: ${res.error}`); observe(res); }
            if (g.phase !== 'ship') break;
        }
        if (g.phase !== 'ship') continue;
        observe({ events: g.tick(1 / 30) });
        t += 1 / 30;
        for (const pl of g.players) if (pl.alive) assert(!shipBlocked(pl.x, pl.y, IMPOSTOR_RADIUS - 0.01, g.closed), 'nadie dentro de una pared');
    }
    return t;
}
for (let seed = 1; seed <= 40; seed++) {
    const n = 6 + seed % 5;
    const rules = { roleScientist: 1, roleEngineer: 1, roleNoisemaker: 1, roleAngel: 1, roleShapeshifter: 1, rolePhantom: 1, impostors: 2 };
    const g = new ImpostorGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i })), rules, seed });
    const bots = g.players.map((_, p) => new ImpostorBot(g, p, { ...CHARACTERS[p % CHARACTERS.length], level: ['facil', 'normal', 'dificil'][(p + seed) % 3] }, R.makeRng(seed * 41 + p)));
    playOut(g, bots, 1500, e => { if (['shift', 'vanish', 'protect', 'shielded', 'alarm'].includes(e.type)) extra.roles[e.type] = (extra.roles[e.type] || 0) + 1; });
    assert.strictEqual(g.phase, 'gameOver', `partida con papeles ${seed}: acaba`);
}
assert(extra.roles.shift && extra.roles.vanish && extra.roles.protect && extra.roles.alarm, `los papeles se usan: ${JSON.stringify(extra.roles)}`);
for (let seed = 1; seed <= 60; seed++) {
    const n = 3 + seed % 8;
    const g = new ImpostorGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'H' + i })), rules: { mode: 'escondite', hideTime: 180, tasks: 3 }, seed });
    const bots = g.players.map((_, p) => new ImpostorBot(g, p, { ...CHARACTERS[p % CHARACTERS.length], level: ['facil', 'normal', 'dificil'][(p + seed) % 3] }, R.makeRng(seed * 43 + p)));
    let vents = 0;
    playOut(g, bots, 400, e => { if (e.type === 'vent' && e.kind === 'in') vents++; assert(!['meeting', 'sabotage'].includes(e.type), 'en el escondite no hay reuniones ni sabotajes'); });
    assert.strictEqual(g.phase, 'gameOver', `escondite ${seed}: acaba`);
    const k = `${g.result.side}:${g.result.reason}`;
    extra.hide[k] = (extra.hide[k] || 0) + 1;
    if (vents) extra.hide.vents = (extra.hide.vents || 0) + 1;
}
assert(extra.hide['crew:time'] >= 10 && extra.hide['impostors:kills'] >= 10, `en el escondite ganan los dos: ${JSON.stringify(extra.hide)}`);
assert(extra.hide.vents, 'en el escondite, la tripulación se mete en los conductos');
for (let seed = 1; seed <= 10; seed++) {
    // La práctica de impostor: los muñecos ni avisan ni hacen tareas, y el impostor (aquí, de la máquina) los caza.
    const g = new ImpostorGame({ players: Array.from({ length: 5 }, (_, i) => ({ name: 'D' + i, role: i ? 'crew' : 'impostor' })), rules: { impostors: 1, dummies: true, killCooldown: 10 }, seed });
    const bots = g.players.map((_, p) => new ImpostorBot(g, p, { ...CHARACTERS[p], level: 'normal' }, R.makeRng(seed * 47 + p)));
    playOut(g, bots, 900, e => {
        assert(!(e.type === 'meeting' && e.by !== 0), 'los muñecos no piden reuniones');
        assert(!(e.type === 'taskDone'), 'ni hacen tareas');
    });
    if (g.phase === 'gameOver') extra.practice++;
}
assert(extra.practice >= 8, `en la práctica de impostor, se acaba cazando a todos: ${extra.practice} de 10`);

// ── La sala de espera ─────────────────────────────
{
    // Todos en el Comedor con las puertas cerradas, sin impostores ni tareas, aunque las reglas digan escondite.
    const players = Array.from({ length: 6 }, (_, i) => ({ name: 'L' + i, color: i === 0 ? 3 : null, bot: i >= 4, remote: i === 1 || i === 2 }));
    players[1].at = { x: 17.5, y: 3.5 };
    players[2].at = { x: 5, y: 5 };   // fuera del Comedor: no vale
    const g = new ImpostorGame({ players, rules: { lobby: true, mode: 'escondite', impostors: 2 }, seed: 9 });
    const res = g.startRound();
    assert(g.lobby && !g.hideSeek, 'la sala de espera no es el escondite');
    assert.strictEqual(g.impostorCount(), 0, 'en la sala de espera no hay impostores');
    assert(res.events.find(e => e.type === 'round').lobby, 'el suceso round dice que es la sala de espera');
    assert(g.players.every(pl => pl.role === 'crew' && !pl.tasks.length && !pl.special), 'ni papeles ni tareas');
    assert.strictEqual(g.taskBar().total, 0);
    assert(g.players.every(pl => pl.area === 'comedor'), 'todos en el Comedor');
    assert.deepStrictEqual([g.players[1].x, g.players[1].y], [17.5, 3.5], 'quien ya estaba sigue donde estaba');
    assert.strictEqual(g.players[2].area, 'comedor', 'un sitio de fuera no vale');
    assert.strictEqual(g.doorsShut.room, 'comedor', 'las puertas del Comedor, cerradas');
    for (const d of SHIP.byId.comedor.doors) assert(!shipPath(22, 3, d.x + d.nx * 1.5, d.y + d.ny * 1.5, g.closed), 'no se sale del Comedor');
    // Andando un buen rato, nadie sale y las puertas siguen cerradas.
    const bots = g.players.map((_, p) => new ImpostorBot(g, p, { ...CHARACTERS[p], level: 'normal' }, R.makeRng(70 + p)));
    const walked = g.players.map(() => 0);
    for (let t = 0; t < 120 * 30; t++) {
        for (const b of bots) { const a = b.update(1 / 30); assert(!a, `en la sala de espera los de la máquina solo pasean: ${a?.type}`); }
        for (const e of g.tick(1 / 30)) assert(['area', 'bump'].includes(e.type), `en la sala de espera no pasa nada más: ${e.type}`);
        g.players.forEach((pl, i) => { walked[i] += pl.moved; });
    }
    for (const pl of g.players) assert.strictEqual(pl.area, 'comedor', 'nadie sale del Comedor');
    assert(walked.every((d, i) => g.players[i].remote || d > 20), `los de la máquina pasean: ${walked.map(Math.round)}`);
    // Quien llega a la sala de espera no aparece encima de quien ya estaba.
    const k = new ImpostorGame({ players: [{ name: 'A', at: { x: 22, y: 9.3 } }, { name: 'B' }, { name: 'C', at: { x: 17.5, y: 3.5 } }], rules: { lobby: true }, seed: 4 });
    k.startRound();
    assert(Math.hypot(k.players[1].x - 22, k.players[1].y - 9.3) > 2 && Math.hypot(k.players[1].x - 17.5, k.players[1].y - 3.5) > 2, 'quien llega, lejos de los demás');
    assert(g.doorsShut && g.phase === 'ship', 'la sala de espera no se acaba sola');
    // No se puede hacer nada más que andar y elegir color.
    for (const type of ['kill', 'report', 'button', 'sabotage', 'vent', 'console', 'power']) assert(!g.act({ type, p: 0, kind: 'lights', target: 1 }).ok, `${type} no vale en la sala de espera`);
    // El color: el de otra persona, no; el de uno de la máquina, se cambia por el tuyo.
    assert.strictEqual(g.players[0].color, 3, 'quien lo pidió tiene su color');
    let r = g.act({ type: 'look', p: 1, color: 3, hat: 2 });
    assert(!r.ok && /ya lo tiene L0/.test(r.error), 'el color de otra persona no se coge');
    const was = g.players[1].color, botCol = g.players[5].color;
    r = g.act({ type: 'look', p: 1, color: botCol, hat: 2 });
    assert(r.ok && g.players[1].color === botCol && g.players[1].hat === 2, 'el de la máquina, sí');
    assert.strictEqual(g.players[5].color, was, 'y el de la máquina se queda con el tuyo');
    assert.deepStrictEqual(r.events[0].swap, { p: 5, color: was });
    assert(!g.act({ type: 'look', p: 1, color: 99, hat: 0 }).ok && !g.act({ type: 'look', p: 1, color: 1, hat: 99 }).ok, 'colores y gorros que no existen');
    assert.strictEqual(new Set(g.players.map(pl => pl.color)).size, 6, 'ningún color repetido');
    // El invitado se entera del cambio, y su nave también tiene las puertas cerradas.
    const m = new I.ImpostorMirror({ names: g.players.map(pl => pl.name), me: 2 });
    m.setView(g.view(2));
    assert(m.lobby && m.closed.some(Boolean), 'el invitado está en la sala de espera, con las puertas cerradas');
    m.observe(r.events[0]);
    assert.strictEqual(m.players[1].color, botCol);
    assert.strictEqual(m.players[5].color, was);
    // Fuera de la sala de espera no se cambia de color.
    const h = new ImpostorGame({ players: players.map(p => ({ ...p })), rules: {}, seed: 9 });
    h.startRound();
    assert(!h.act({ type: 'look', p: 1, color: 9, hat: 0 }).ok, 'en la partida no se cambia de color');
    assert(!h.closed.some(Boolean), 'en la partida las puertas están abiertas');
}

console.log(`El Impostor: todo bien. ${games} partidas sin impostores (${Math.round(totalTime / games)} segundos de media, ${Math.round(maxTime)} como mucho) y ${impGames} con impostores (${Math.round(impTime / impGames)} segundos de media, ${impMeetings} reuniones). Ganan: ${JSON.stringify(sides)}; cómo: ${JSON.stringify(ends)}; echados: ${impEjects} impostores y ${crewEjects} tripulantes; sabotajes y conductos: ${JSON.stringify(used)}. Papeles: ${JSON.stringify(extra.roles)}. Escondite: ${JSON.stringify(extra.hide)}.`);
