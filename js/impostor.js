/* =============================================
   EL PEDRO — impostor.js
   Las reglas de El Impostor, sin pantalla ni sonido.
   Una nave vista desde arriba, con salas, pasillos y
   paredes, por la que todos andan a la vez y en
   tiempo real. La tripulación hace sus tareas; cuando
   están todas hechas, gana.

   Esta es la primera entrega: la nave, andar, chocar,
   ver y oír a los demás, y las tareas. Los impostores,
   las reuniones y los sabotajes llegarán después.

   Las medidas van en metros: cada casilla mide uno.
   x crece hacia la derecha (este) e y hacia abajo
   (sur). El norte, arriba en la pantalla, es lo que
   tienes delante.
   Usa el azar con semilla de rules.js.
   ============================================= */
'use strict';

const IMPOSTOR_DEFAULT_RULES = {
    tasks: 3,                 // tareas de cada tripulante, de 2 a 4
    easyTasks: false,         // tareas fáciles: más margen y menos que hacer en cada una
    speed: 1,                 // velocidad al andar
    vision: 1,                // hasta dónde se ve y se oye a los demás
};

const IMPOSTOR_SPEED = 3.2;           // metros por segundo
const IMPOSTOR_RADIUS = 0.3;          // lo que ocupa cada jugador
const IMPOSTOR_VISION = 6;            // hasta dónde se ve (y se oye con nombre)
const IMPOSTOR_HEARING = 10;          // hasta dónde se oyen pasos, aunque sea a través de una pared
const IMPOSTOR_USE = 1.4;             // a qué distancia se puede usar una tarea
const IMPOSTOR_ACTIONS = new Set(['startTask', 'cancelTask', 'task']);

// ── La nave ───────────────────────────────────────
// Seis salas unidas por siete pasillos de tres metros de ancho, en anillo:
//
//   Motores ─── Comedor ─── Puente de mando
//      │           │              │
//   Electricidad ─ Almacén ─── Enfermería
//
const SHIP_W = 44, SHIP_H = 27;
const SHIP_AREAS = [
    { id: 'motores', kind: 'room', name: 'Motores', x: 2, y: 2, w: 9, h: 8, floor: 'metal' },
    { id: 'comedor', kind: 'room', name: 'el Comedor', x: 16, y: 2, w: 12, h: 9, floor: 'moqueta' },
    { id: 'puente', kind: 'room', name: 'el Puente de mando', x: 33, y: 2, w: 9, h: 8, floor: 'metal' },
    { id: 'electricidad', kind: 'room', name: 'Electricidad', x: 2, y: 17, w: 9, h: 8, floor: 'rejilla' },
    { id: 'almacen', kind: 'room', name: 'el Almacén', x: 16, y: 16, w: 12, h: 9, floor: 'metal' },
    { id: 'enfermeria', kind: 'room', name: 'la Enfermería', x: 33, y: 17, w: 9, h: 8, floor: 'moqueta' },
    { id: 'p-motores-comedor', kind: 'corridor', links: ['motores', 'comedor'], x: 11, y: 5, w: 5, h: 3, floor: 'rejilla' },
    { id: 'p-comedor-puente', kind: 'corridor', links: ['comedor', 'puente'], x: 28, y: 5, w: 5, h: 3, floor: 'rejilla' },
    { id: 'p-comedor-almacen', kind: 'corridor', links: ['comedor', 'almacen'], x: 20, y: 11, w: 3, h: 5, floor: 'rejilla' },
    { id: 'p-electricidad-almacen', kind: 'corridor', links: ['electricidad', 'almacen'], x: 11, y: 19, w: 5, h: 3, floor: 'rejilla' },
    { id: 'p-almacen-enfermeria', kind: 'corridor', links: ['almacen', 'enfermeria'], x: 28, y: 19, w: 5, h: 3, floor: 'rejilla' },
    { id: 'p-motores-electricidad', kind: 'corridor', links: ['motores', 'electricidad'], x: 5, y: 10, w: 3, h: 7, floor: 'rejilla' },
    { id: 'p-puente-enfermeria', kind: 'corridor', links: ['puente', 'enfermeria'], x: 36, y: 10, w: 3, h: 7, floor: 'rejilla' },
];
/** Los muebles: no se puede pasar por encima. */
const SHIP_FURNITURE = [
    { id: 'mesa', name: 'la mesa', area: 'comedor', x: 20, y: 5, w: 4, h: 3 },
];

/** Las tareas: qué son y dónde se hacen. Cada tipo está en uno o dos sitios. */
const IMPOSTOR_TASKS = {
    cables: { name: 'Arreglar los cables', short: 'los cables' },
    descarga: { name: 'Descargar los datos', short: 'la descarga' },
    motor: { name: 'Calibrar el motor', short: 'el motor' },
    codigo: { name: 'Teclear el código', short: 'el código' },
};
const SHIP_SPOTS = [
    { type: 'cables', area: 'electricidad', x: 3.5, y: 18.5 },
    { type: 'cables', area: 'almacen', x: 26.5, y: 23.5 },
    { type: 'descarga', area: 'puente', x: 40.5, y: 3.5 },
    { type: 'descarga', area: 'comedor', x: 26.5, y: 2.5 },
    { type: 'motor', area: 'motores', x: 2.5, y: 3.5 },
    { type: 'motor', area: 'motores', x: 2.5, y: 8.5 },
    { type: 'codigo', area: 'enfermeria', x: 40.5, y: 23.5 },
    { type: 'codigo', area: 'almacen', x: 16.5, y: 16.5 },
];

/** «el Comedor» → «al Comedor»; «Motores» → «a Motores». */
const toPlace = name => name.startsWith('el ') ? 'al ' + name.slice(3) : 'a ' + name;
const inPlace = name => 'en ' + name;

/** La nave: la cuadrícula de casillas, las zonas y las puertas. */
const SHIP = (() => {
    const areas = SHIP_AREAS.map((a, i) => ({ ...a, index: i, cx: a.x + a.w / 2, cy: a.y + a.h / 2, doors: [] }));
    const byId = Object.fromEntries(areas.map(a => [a.id, a]));
    for (const a of areas) if (a.kind === 'corridor') {
        const [r1, r2] = a.links.map(id => byId[id]);
        a.name = `el pasillo entre ${r1.name.replace(/^(el|la) /, '')} y ${r2.name.replace(/^(el|la) /, '')}`;
    }
    const tiles = new Int16Array(SHIP_W * SHIP_H).fill(-1);
    for (const a of areas) for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) tiles[y * SHIP_W + x] = a.index;
    for (const f of SHIP_FURNITURE) for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) tiles[y * SHIP_W + x] = -2;
    // Una puerta donde cada pasillo toca una sala: en el centro de la línea que comparten.
    const doors = [];
    for (const c of areas.filter(a => a.kind === 'corridor')) {
        for (const rid of c.links) {
            const r = byId[rid];
            let sx = 0, sy = 0, k = 0, nx = 0, ny = 0;
            for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) {
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    if (tiles[(y + dy) * SHIP_W + x + dx] !== r.index) continue;
                    sx += x + 0.5 + dx / 2; sy += y + 0.5 + dy / 2; k++; nx = -dx; ny = -dy;
                }
            }
            const other = c.links.find(id => id !== rid);
            const d = { id: doors.length, room: rid, corridor: c.id, to: other, x: sx / k, y: sy / k, nx, ny };
            doors.push(d);
            r.doors.push(d);
            c.doors.push(d);
        }
    }
    const spots = SHIP_SPOTS.map((s, i) => ({ ...s, id: i }));
    return { w: SHIP_W, h: SHIP_H, areas, byId, tiles, doors, spots, furniture: SHIP_FURNITURE };
})();

function shipTile(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= SHIP.w || ty >= SHIP.h) return -1;
    return SHIP.tiles[ty * SHIP.w + tx];
}
const shipSolid = (tx, ty) => tx < 0 || ty < 0 || tx >= SHIP.w || ty >= SHIP.h || SHIP.tiles[ty * SHIP.w + tx] < 0;
/** La zona (sala o pasillo) en la que está un punto, o null si es pared o mueble. */
function shipArea(x, y) { const t = shipTile(x, y); return t >= 0 ? SHIP.areas[t] : null; }

/** ¿Un círculo de radio r en (x, y) toca alguna pared o mueble? */
function shipBlocked(x, y, r = IMPOSTOR_RADIUS) {
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
        for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
            if (!shipSolid(tx, ty)) continue;
            const qx = clampN(x, tx, tx + 1), qy = clampN(y, ty, ty + 1);
            if ((x - qx) ** 2 + (y - qy) ** 2 < r * r - 1e-9) return true;
        }
    }
    return false;
}
function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** ¿Se ve un punto desde otro? (sin paredes ni muebles altos en medio; la mesa no tapa) */
function shipSight(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 0.2);
    for (let i = 1; i < n; i++) {
        const t = shipTile(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n);
        if (t === -1) return false;
    }
    return true;
}

/** ¿Se puede ir en línea recta de un punto a otro sin rozar nada? */
function shipClear(x0, y0, x1, y1, r = IMPOSTOR_RADIUS + 0.06) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 0.2));
    for (let i = 0; i <= n; i++) if (shipBlocked(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, r)) return false;
    return true;
}

/**
 * El camino más corto de un punto a otro, como una lista de puntos por los que pasar
 * (sin el de salida). Sirve para la guía y para los rivales de la máquina. null si no hay camino.
 */
function shipPath(x0, y0, x1, y1) {
    const W = SHIP.w, start = Math.floor(y0) * W + Math.floor(x0), goal = Math.floor(y1) * W + Math.floor(x1);
    if (shipSolid(Math.floor(x1), Math.floor(y1)) || shipSolid(Math.floor(x0), Math.floor(y0))) return null;
    const prev = new Int32Array(W * SHIP.h).fill(-1);
    prev[start] = start;
    const queue = [start];
    for (let qi = 0; qi < queue.length && prev[goal] < 0; qi++) {
        const cur = queue[qi], cx = cur % W, cy = (cur - cx) / W;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (shipSolid(nx, ny)) continue;
            if (dx && dy && (shipSolid(cx + dx, cy) || shipSolid(cx, cy + dy))) continue;   // sin cortar esquinas
            const ni = ny * W + nx;
            if (prev[ni] >= 0) continue;
            prev[ni] = cur;
            queue.push(ni);
        }
    }
    if (prev[goal] < 0) return null;
    const cells = [];
    for (let c = goal; c !== start; c = prev[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map(c => ({ x: c % W + 0.5, y: Math.floor(c / W) + 0.5 }));
    if (pts.length) pts[pts.length - 1] = { x: x1, y: y1 };
    // Se quitan los puntos intermedios que no hacen falta: de cada punto se salta al más lejano que se ve en línea recta.
    const out = [];
    let fx = x0, fy = y0, i = 0;
    while (i < pts.length) {
        let j = pts.length - 1;
        while (j > i && !shipClear(fx, fy, pts[j].x, pts[j].y)) j--;
        out.push(pts[j]);
        fx = pts[j].x; fy = pts[j].y;
        i = j + 1;
    }
    return out;
}

/** Un sitio libre junto a la consola de una tarea, para ponerse delante y no encima. */
function shipStandAt(spot) {
    if (!shipBlocked(spot.x, spot.y, IMPOSTOR_RADIUS + 0.06)) return { x: spot.x, y: spot.y };
    for (const [dx, dy] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) {
        if (!shipBlocked(spot.x + dx, spot.y + dy, IMPOSTOR_RADIUS + 0.06)) return { x: spot.x + dx, y: spot.y + dy };
    }
    return { x: spot.x, y: spot.y };
}

/** Lo largo que es un camino desde (x, y). */
function pathLength(x, y, pts) {
    let d = 0;
    for (const p of pts || []) { d += Math.hypot(p.x - x, p.y - y); x = p.x; y = p.y; }
    return d;
}

class ImpostorGame {
    constructor({ players, rules = {}, seed = Date.now() }) {
        this.rules = { ...IMPOSTOR_DEFAULT_RULES, ...rules };
        this.seed = seed >>> 0;
        this.rng = makeRng(this.seed);
        this.players = players.map((p, i) => ({
            name: p.name, index: i, x: 0, y: 0, ix: 0, iy: 0, fx: 0, fy: -1,
            area: null, busy: null, tasks: [], bumpT: 0, moved: 0,
        }));
        this.round = 0;
        this.phase = 'idle';
        this.time = 0;
        this.turns = 0;
        this.current = 0;
        this.winners = null;
        this.result = null;
    }

    get n() { return this.players.length; }
    get speed() { return IMPOSTOR_SPEED * this.rules.speed; }
    get vision() { return IMPOSTOR_VISION * this.rules.vision; }
    get hearing() { return IMPOSTOR_HEARING * this.rules.vision; }
    areaOf(p) { return SHIP.byId[this.players[p].area] || null; }

    /** La barra de tareas: cuántas hay hechas de todas las de la tripulación. */
    taskBar() {
        let done = 0, total = 0;
        for (const pl of this.players) for (const t of pl.tasks) { total++; if (t.done) done++; }
        return { done, total };
    }
    pending(p) { return this.players[p].tasks.map((t, i) => ({ ...t, i, spot: SHIP.spots[t.spot] })).filter(t => !t.done); }

    // ── Empezar ───────────────────────────────────────
    startRound() {
        this.round++;
        this.phase = 'ship';
        this.time = 0;
        this.winners = null;
        this.result = null;
        // Todos empiezan alrededor de la mesa del Comedor.
        const n = this.n, t = SHIP.furniture[0], cx = t.x + t.w / 2, cy = t.y + t.h / 2;
        const order = this.rng.shuffle(this.players.map((_, i) => i));
        const types = Object.keys(IMPOSTOR_TASKS);
        const count = clampN(this.rules.tasks | 0, 1, types.length);
        order.forEach((p, k) => {
            const pl = this.players[p];
            const ang = -Math.PI / 2 + k * 2 * Math.PI / n;
            pl.x = cx + Math.cos(ang) * 3.3; pl.y = cy + Math.sin(ang) * 2.8;
            pl.ix = pl.iy = 0; pl.fx = 0; pl.fy = -1; pl.busy = null; pl.moved = 0;
            pl.area = shipArea(pl.x, pl.y)?.id || null;
            pl.tasks = this.rng.shuffle(types.slice()).slice(0, count)
                .map(type => ({ type, spot: this.rng.pick(SHIP.spots.filter(s => s.type === type)).id, done: false }));
        });
        const events = [{ type: 'round', round: this.round }];
        for (const pl of this.players) events.push({ type: 'tasks', p: pl.index, tasks: pl.tasks.map(t => ({ ...t })), secret: true });
        events.push({ type: 'taskBar', ...this.taskBar() });
        return { ok: true, events };
    }

    // ── Andar ─────────────────────────────────────────
    /** Hacia dónde quiere andar un jugador: (dx, dy) entre -1 y 1. Se mantiene hasta que cambie. */
    input(p, dx, dy) {
        const pl = this.players[p];
        if (!pl) return;
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        pl.ix = dx || 0; pl.iy = dy || 0;
    }

    /** El tiempo avanza dt segundos. Devuelve lo que ha pasado: cambios de zona y choques. */
    tick(dt) {
        if (this.phase !== 'ship') return [];
        this.time += dt;
        const events = [];
        for (const pl of this.players) {
            pl.bumpT = Math.max(0, pl.bumpT - dt);
            pl.moved = 0;
            if (pl.busy || (!pl.ix && !pl.iy)) continue;
            const len = Math.hypot(pl.ix, pl.iy);
            pl.fx = pl.ix / len; pl.fy = pl.iy / len;
            const step = this.speed * dt;
            const x0 = pl.x, y0 = pl.y;
            let hit = null;
            // Cada eje por separado: así, al rozar una pared, se resbala a lo largo de ella.
            // Si andas recto contra una esquina (el borde de una puerta o de la mesa), te desvías un poco y la rodeas.
            const nx = pl.x + pl.ix * step;
            if (!shipBlocked(nx, pl.y)) pl.x = nx;
            else if (pl.iy || !this.slideCorner(pl, nx, pl.y, 0, 1, step)) hit = { x: pl.x + Math.sign(pl.ix) * IMPOSTOR_RADIUS, y: pl.y };
            const ny = pl.y + pl.iy * step;
            if (!shipBlocked(pl.x, ny)) pl.y = ny;
            else if (pl.ix || !this.slideCorner(pl, pl.x, ny, 1, 0, step)) hit = hit || { x: pl.x, y: pl.y + Math.sign(pl.iy) * IMPOSTOR_RADIUS };
            pl.moved = Math.hypot(pl.x - x0, pl.y - y0);
            if (hit && pl.bumpT <= 0) {
                pl.bumpT = 0.4;
                const what = SHIP.furniture.find(f => hit.x >= f.x - 0.4 && hit.x <= f.x + f.w + 0.4 && hit.y >= f.y - 0.4 && hit.y <= f.y + f.h + 0.4);
                events.push({ type: 'bump', p: pl.index, x: hit.x, y: hit.y, what: what ? what.id : 'pared' });
            }
            const a = shipArea(pl.x, pl.y);
            if (a && a.id !== pl.area) {
                const from = pl.area;
                pl.area = a.id;
                events.push({ type: 'area', p: pl.index, area: a.id, from });
            }
        }
        return events;
    }

    /**
     * Andas recto hacia (x, y) y una esquina te lo impide: si un poco hacia un lado (ux, uy) está libre,
     * te mueves hacia ese lado. Devuelve true si te has movido.
     */
    slideCorner(pl, x, y, ux, uy, step) {
        for (const off of [0.15, 0.3, 0.45, 0.6]) {
            for (const s of [-1, 1]) {
                if (shipBlocked(x + s * ux * off, y + s * uy * off)) continue;
                const d = Math.min(step, off);
                if (shipBlocked(pl.x + s * ux * d, pl.y + s * uy * d)) continue;
                pl.x += s * ux * d; pl.y += s * uy * d;
                return true;
            }
        }
        return false;
    }

    // ── Ver y oír ─────────────────────────────────────
    /** A quién ve un jugador (cerca y sin paredes en medio) y a quién solo oye andar. */
    perceive(p) {
        const me = this.players[p], seen = [], heard = [];
        for (const pl of this.players) {
            if (pl === me) continue;
            const d = Math.hypot(pl.x - me.x, pl.y - me.y);
            if (d <= this.vision && shipSight(me.x, me.y, pl.x, pl.y)) seen.push(pl.index);
            else if (d <= this.hearing && pl.moved > 0) heard.push(pl.index);
        }
        return { seen, heard };
    }

    /** La tarea pendiente más cercana que se puede usar desde donde estás, o null. */
    taskHere(p) {
        const pl = this.players[p];
        let best = null, bd = IMPOSTOR_USE;
        for (const t of this.pending(p)) {
            const d = Math.hypot(t.spot.x - pl.x, t.spot.y - pl.y);
            if (d <= bd) { bd = d; best = t; }
        }
        return best;
    }

    // ── Acciones ──────────────────────────────────────
    act(a) {
        if (!a || !IMPOSTOR_ACTIONS.has(a.type)) return { ok: false, error: 'Eso no se puede hacer.' };
        if (this.phase !== 'ship') return { ok: false, error: 'Ahora no.' };
        const pl = this.players[a.p];
        if (!pl) return { ok: false, error: 'Ese jugador no está en la nave.' };
        if (a.type === 'cancelTask') {
            if (!pl.busy) return { ok: false, error: 'No estás haciendo ninguna tarea.' };
            const i = pl.busy.i;
            pl.busy = null;
            return { ok: true, events: [{ type: 'taskStop', p: a.p, i }] };
        }
        const t = pl.tasks[a.i];
        if (!t) return { ok: false, error: 'Esa tarea no es tuya.' };
        if (t.done) return { ok: false, error: 'Esa tarea ya está hecha.' };
        const spot = SHIP.spots[t.spot];
        if (Math.hypot(spot.x - pl.x, spot.y - pl.y) > IMPOSTOR_USE + 0.2) return { ok: false, error: 'Estás demasiado lejos de esa tarea.' };
        if (a.type === 'startTask') {
            if (pl.busy) return { ok: false, error: 'Ya estás con una tarea.' };
            pl.busy = { i: a.i, since: this.time };
            pl.ix = pl.iy = 0;
            return { ok: true, events: [{ type: 'taskStart', p: a.p, i: a.i, task: t.type }] };
        }
        // 'task': la tarea está hecha.
        if (!pl.busy || pl.busy.i !== a.i) return { ok: false, error: 'Primero tienes que empezar la tarea.' };
        t.done = true;
        pl.busy = null;
        this.turns++;
        const events = [{ type: 'taskDone', p: a.p, i: a.i, task: t.type, area: spot.area }, { type: 'taskBar', ...this.taskBar() }];
        const bar = this.taskBar();
        if (bar.done >= bar.total) {
            this.phase = 'gameOver';
            this.winners = this.players.map(x => x.index);
            this.result = { reason: 'tasks' };
            events.push({ type: 'gameOver', reason: 'tasks', winners: this.winners.slice() });
        }
        return { ok: true, events };
    }

    /** La mesa tal como la ve un jugador: sus tareas, y de los demás solo dónde están. */
    view(seat) {
        return {
            phase: this.phase, round: this.round, time: this.time, rules: { ...this.rules }, winners: this.winners,
            bar: this.taskBar(),
            players: this.players.map(pl => ({
                name: pl.name, x: pl.x, y: pl.y, fx: pl.fx, fy: pl.fy, area: pl.area, busy: !!pl.busy,
                tasks: pl.index === seat ? pl.tasks.map(t => ({ ...t })) : null,
            })),
        };
    }
}

// Para las pruebas con Node (en el navegador no hace nada).
if (typeof module !== 'undefined') {
    const R = require('./rules.js');
    Object.assign(globalThis, { makeRng: R.makeRng });
    module.exports = {
        IMPOSTOR_DEFAULT_RULES, IMPOSTOR_SPEED, IMPOSTOR_RADIUS, IMPOSTOR_VISION, IMPOSTOR_HEARING, IMPOSTOR_USE, IMPOSTOR_TASKS,
        SHIP, shipArea, shipTile, shipSolid, shipBlocked, shipSight, shipClear, shipPath, shipStandAt, pathLength, toPlace, inPlace, ImpostorGame,
    };
}
