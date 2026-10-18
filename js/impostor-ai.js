/* =============================================
   EL PEDRO — impostor-ai.js
   Los compañeros de la máquina en El Impostor.
   Andan por la nave como cualquiera: buscan el
   camino a sus tareas, se paran a hacerlas y, cuando
   acaban, pasean de sala en sala. Usan los
   personajes de ai.js, que son los mismos en todos
   los juegos.
   ============================================= */
'use strict';

/** Cómo juega cada dificultad: cuánto se paran y cuánto tardan en cada tarea (en segundos). */
const IMPOSTOR_LEVELS = {
    facil: { pause: [1.5, 4], work: [7, 11] },
    normal: { pause: [0.8, 2.5], work: [5, 8] },
    dificil: { pause: [0.3, 1.2], work: [3.5, 6] },
};

class ImpostorBot {
    constructor(game, me, character, rng) {
        this.game = game;
        this.me = me;
        this.char = character;
        this.level = { ...IMPOSTOR_LEVELS[character.level || 'normal'] || IMPOSTOR_LEVELS.normal };
        this.rng = rng;
        this.goal = null;          // { x, y, task } adonde va
        this.path = null;
        this.wait = rng.range(0.4, 1.6);
        this.work = 0;
        this.stuck = 0;
        this.lastX = null; this.lastY = null;
    }

    observe() { }

    /**
     * Cada paso del tiempo: decide hacia dónde anda (con game.input) y,
     * si toca, devuelve una acción para la partida ({ type: 'startTask' | 'task', i }).
     */
    update(dt) {
        const g = this.game, me = this.me, pl = g.players[me];
        if (g.phase !== 'ship') return null;
        if (pl.busy) {
            g.input(me, 0, 0);
            this.work -= dt;
            return this.work <= 0 ? { type: 'task', i: pl.busy.i } : null;
        }
        if (this.wait > 0) { this.wait -= dt; g.input(me, 0, 0); return null; }
        if (!this.goal) this.pickGoal();
        if (!this.goal) { this.wait = 1; return null; }
        const goal = this.goal;
        // ¿Ha llegado?
        const reach = goal.task != null ? 0.9 : 1.2;
        if (Math.hypot(goal.x - pl.x, goal.y - pl.y) <= reach) {
            g.input(me, 0, 0);
            this.goal = null; this.path = null;
            if (goal.task != null) {
                this.work = this.rng.range(...this.level.work);
                return { type: 'startTask', i: goal.task };
            }
            this.wait = this.rng.range(...this.level.pause);
            return null;
        }
        if (!this.path || !this.path.length) this.path = shipPath(pl.x, pl.y, goal.x, goal.y);
        if (!this.path) { this.goal = null; return null; }
        let wp = this.path[0];
        while (this.path.length > 1 && Math.hypot(wp.x - pl.x, wp.y - pl.y) < 0.35) { this.path.shift(); wp = this.path[0]; }
        const dx = wp.x - pl.x, dy = wp.y - pl.y, d = Math.hypot(dx, dy) || 1;
        g.input(me, dx / d, dy / d);
        // Si se queda atascado en una esquina, busca otro camino.
        if (this.lastX != null && Math.hypot(pl.x - this.lastX, pl.y - this.lastY) < 0.01) this.stuck += dt; else this.stuck = 0;
        this.lastX = pl.x; this.lastY = pl.y;
        if (this.stuck > 0.8) { this.stuck = 0; this.path = null; g.input(me, this.rng.range(-1, 1), this.rng.range(-1, 1)); }
        return null;
    }

    /** Su siguiente tarea, la más cercana; si no le quedan, una sala cualquiera. */
    pickGoal() {
        const g = this.game, pl = g.players[this.me];
        const tasks = g.pending(this.me);
        if (tasks.length) {
            // Los fáciles van a la que les toca en su lista; los demás, a la más cercana.
            const t = this.char.level === 'facil' ? tasks[0] : tasks.slice().sort((a, b) => Math.hypot(a.spot.x - pl.x, a.spot.y - pl.y) - Math.hypot(b.spot.x - pl.x, b.spot.y - pl.y))[0];
            // Se pone delante de la consola, no encima.
            const p = shipStandAt(t.spot);
            this.goal = { x: p.x, y: p.y, task: t.i };
        } else {
            const rooms = SHIP.areas.filter(a => a.kind === 'room' && a.id !== pl.area);
            const r = this.rng.pick(rooms);
            this.goal = { x: r.cx + this.rng.range(-r.w / 4, r.w / 4), y: r.cy + this.rng.range(-r.h / 4, r.h / 4), task: null };
            if (shipBlocked(this.goal.x, this.goal.y)) this.goal = { x: r.cx, y: r.cy, task: null };
            if (shipBlocked(this.goal.x, this.goal.y)) this.goal = { x: r.x + 1.5, y: r.y + 1.5, task: null };
        }
        this.path = null;
    }
}

// Para las pruebas con Node (en el navegador no hace nada).
if (typeof module !== 'undefined') {
    const I = require('./impostor.js');
    Object.assign(globalThis, { shipPath: I.shipPath, shipBlocked: I.shipBlocked, shipStandAt: I.shipStandAt, SHIP: I.SHIP });
    module.exports = { ImpostorBot, IMPOSTOR_LEVELS };
}
