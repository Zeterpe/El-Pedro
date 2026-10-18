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
    assert.strictEqual(v.players[0].tasks, null, 'pero no las de los demás');
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
    const { g } = newGame(n, { impostors: 1, ...rules }, seed, ['impostor']);
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
    assert.strictEqual(res.events[res.events.length - 1].type, 'resume');
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
assert(used.lights && used.reactor && used.doors && used['vent-in'] && used['vent-out'], `los impostores sabotean y usan los conductos: ${JSON.stringify(used)}`);
assert(used.fixed >= (used.lights + used.reactor) * 0.5, `la tripulación arregla los sabotajes: ${JSON.stringify(used)}`);
assert((ends.reactor || 0) < impGames * 0.15, `el reactor estalla pocas veces: ${JSON.stringify(ends)}`);

console.log(`El Impostor: todo bien. ${games} partidas sin impostores (${Math.round(totalTime / games)} segundos de media, ${Math.round(maxTime)} como mucho) y ${impGames} con impostores (${Math.round(impTime / impGames)} segundos de media, ${impMeetings} reuniones). Ganan: ${JSON.stringify(sides)}; cómo: ${JSON.stringify(ends)}; echados: ${impEjects} impostores y ${crewEjects} tripulantes; sabotajes y conductos: ${JSON.stringify(used)}.`);
