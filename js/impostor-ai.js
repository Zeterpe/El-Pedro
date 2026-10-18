/* =============================================
   EL PEDRO — impostor-ai.js
   Los rivales de la máquina en El Impostor.
   Andan por la nave como cualquiera: buscan el
   camino a sus tareas, se paran a hacerlas y, cuando
   acaban, pasean de sala en sala.
   · De tripulantes, recuerdan a quién han visto,
     dónde y cuándo; si ven un cuerpo, avisan, y en la
     reunión cuentan lo que saben y votan a quien más
     sospechoso les parece.
   · De impostores, fingen tareas, buscan a alguien
     que esté solo, matan sin testigos y huyen o
     avisan ellos mismos. En la reunión mienten sobre
     dónde estaban y echan la culpa a otro.
   Solo saben lo que ven y oyen, como cualquiera.
   Usan los personajes de ai.js, que son los mismos
   en todos los juegos.
   ============================================= */
'use strict';

/**
 * Cómo juega cada dificultad (los tiempos, en segundos):
 * pause y work, lo que se paran y lo que tardan en cada tarea; react, lo que tardan en reaccionar a un cuerpo;
 * hunt, lo que espera un impostor a ir a por alguien; careless, las veces que mata aunque le vean;
 * selfReport, las que avisa él mismo del cuerpo; recall, lo que recuerdan de lo que ven;
 * trust, lo que se fían de lo que dicen los demás; noise y threshold, lo que dudan al votar y cuánto
 * tienen que sospechar para votar a alguien; lie, lo bien que mienten de impostores.
 */
const IMPOSTOR_LEVELS = {
    facil: { pause: [1.5, 4], work: [9, 14], react: 1.6, hunt: [6, 14], careless: 0.3, selfReport: 0.05, recall: 0.6, trust: 0.85, noise: 10, threshold: 11, lie: 0.3 },
    normal: { pause: [0.8, 2.5], work: [7, 11], react: 0.9, hunt: [3, 8], careless: 0.06, selfReport: 0.15, recall: 0.85, trust: 0.65, noise: 6, threshold: 17, lie: 0.6 },
    dificil: { pause: [0.3, 1.2], work: [5, 8], react: 0.45, hunt: [1, 4], careless: 0, selfReport: 0.25, recall: 1, trust: 0.5, noise: 3, threshold: 22, lie: 0.9 },
};
/** Lo que pesa cada cosa que se dice en la reunión al sospechar de alguien. */
const IMPOSTOR_BLAME = { kill: 60, lie: 25, saw: 7, sus: 8, agree: 5, with: -15 };
/** Para no decir dos veces lo mismo en una reunión. */
// Sospechar, dar la razón y acusar de matar son lo mismo contra alguien: no se repite.
const lineKey = l => `${['agree', 'kill'].includes(l.kind) ? 'sus' : l.kind}:${l.who ?? ''}:${l.area ?? ''}`;

class ImpostorBot {
    constructor(game, me, character, rng) {
        this.game = game;
        this.me = me;
        this.char = character;
        this.level = { ...IMPOSTOR_LEVELS[character.level || 'normal'] || IMPOSTOR_LEVELS.normal };
        this.rng = rng;
        this.goal = null;          // { x, y, task, kind, reach } adonde va
        this.path = null;
        this.wait = rng.range(0.4, 1.6);
        this.work = 0;
        this.stuck = 0;
        this.lastX = null; this.lastY = null;
        this.senseT = 0;
        this.per = { seen: [], heard: [], bodies: [] };
        this.log = [];             // a quién ha visto: { t, q, area }
        this.mine = [];            // dónde ha estado: { t, area }
        this.witness = null;       // lo que ha visto: { killer, victim, area }
        this.noticed = null;       // ha visto un cuerpo: cuándo reacciona
        this.huntAt = null;        // impostor: cuándo va a por alguien
        this.hunting = false;
        this.chase = null;
        this.selfReport = null;
        this.said = new Set();     // lo que ya ha dicho en esta reunión
    }

    get me_() { return this.game.players[this.me]; }
    get impostor() { return this.game.isImpostor(this.me); }

    /** Lo que pasa en la partida: lo que ve, lo que hace y las reuniones. */
    observe(e) {
        const g = this.game;
        if (e.type === 'kill') {
            if (e.witnesses?.includes(this.me) && !g.isImpostor(this.me)) this.witness = { killer: e.p, victim: e.target, area: e.area };
            if (e.p === this.me) this.afterKill(e);
            if (e.target === this.me) this.reset();
        } else if (e.type === 'meeting') {
            this.reset();
            this.said = new Set();
            this.defended = false;
            this.reacted = 0;
        } else if (e.type === 'resume') {
            this.reset();
            this.log = []; this.mine = [];
            this.wait = this.rng.range(0.3, 1.5);
            // Si el asesino que vio sigue vivo, lo sigue sabiendo; si no, ya no importa.
            if (this.witness && !g.players[this.witness.killer].alive) this.witness = null;
        }
    }

    reset() {
        this.goal = null; this.path = null; this.work = 0; this.wait = 0;
        this.noticed = null; this.huntAt = null; this.hunting = false; this.chase = null; this.selfReport = null;
    }

    /**
     * Cada paso del tiempo: decide hacia dónde anda (con game.input) y,
     * si toca, devuelve una acción para la partida ({ type: 'startTask' | 'task' | 'kill' | 'report', … }).
     */
    update(dt) {
        const g = this.game, me = this.me, pl = g.players[me];
        if (g.phase !== 'ship') return null;
        if ((this.senseT -= dt) <= 0) { this.senseT = 0.5; this.sense(); }
        if (pl.busy) {
            g.input(me, 0, 0);
            // Un impostor que finge una tarea la deja si alguien se queda solo cerca.
            if (this.impostor && pl.alive && this.hunting && this.pickTarget() != null) return { type: 'cancelTask' };
            this.work -= dt;
            if (this.work > 0) return null;
            return this.impostor ? { type: 'cancelTask' } : { type: 'task', i: pl.busy.i };
        }
        if (pl.alive) {
            const a = this.impostor ? this.impostorThink(dt) : this.crewThink();
            if (a) { g.input(me, 0, 0); return a; }
        }
        return this.walk(dt);
    }

    /** Lo que ve cada medio segundo, y lo que recuerda de ello. */
    sense() {
        const g = this.game, pl = this.me_;
        this.per = g.perceive(this.me);
        if (!pl.alive) return;
        this.mine.push({ t: g.time, area: pl.area });
        for (const q of this.per.seen) {
            const o = g.players[q];
            if (o.alive && this.rng.chance(this.level.recall)) this.log.push({ t: g.time, q, area: o.area, x: o.x, y: o.y });
        }
        const old = g.time - 90;
        if (this.log.length > 400 || (this.log[0] && this.log[0].t < old)) this.log = this.log.filter(x => x.t >= old);
        if (this.mine.length > 200) this.mine = this.mine.filter(x => x.t >= old);
    }

    // ── De tripulante ─────────────────────────────────
    /** Si ve un cuerpo, va hacia él y avisa. */
    crewThink() {
        const g = this.game;
        if (!this.per.bodies.length) {
            this.noticed = null;
            if (this.goal?.kind === 'body') { this.goal = null; this.path = null; }
            return null;
        }
        if (!this.noticed) this.noticed = g.time + this.level.react;
        if (g.time < this.noticed) return null;
        if (g.bodyHere(this.me)) return { type: 'report' };
        const b = g.bodies.find(x => this.per.bodies.includes(x.p));
        if (b && this.goal?.kind !== 'body') { this.goal = { x: b.x, y: b.y, kind: 'body', reach: 2 }; this.path = null; }
        return null;
    }

    // ── De impostor ───────────────────────────────────
    impostorThink(dt) {
        const g = this.game, pl = this.me_;
        if (this.selfReport != null) {
            if (g.time < this.selfReport) { g.input(this.me, 0, 0); this.wait = 0.1; return null; }
            this.selfReport = null;
            if (g.bodyHere(this.me)) return { type: 'report' };
        }
        if (!this.hunting && pl.killCd <= 0) {
            if (this.huntAt == null) this.huntAt = g.time + this.rng.range(...this.level.hunt);
            if (g.time >= this.huntAt) this.hunting = true;
        }
        if (!this.hunting) return null;
        const target = this.pickTarget();
        if (target == null) {
            if (this.chase != null) { this.chase = null; this.goal = null; this.path = null; }
            // Sin nadie a la vista: va hacia los pasos que oye.
            const q = this.per.heard.find(x => !g.isImpostor(x));
            if (q != null && this.goal?.kind !== 'stalk' && this.rng.chance(dt * 2)) {
                const o = g.players[q];
                this.goal = { x: o.x, y: o.y, kind: 'stalk', reach: 1.5 }; this.path = null;
            }
            return null;
        }
        if (g.killTargets(this.me).includes(target)) {
            this.hunting = false; this.huntAt = null; this.chase = null;
            return { type: 'kill', target };
        }
        const o = g.players[target];
        this.chase = target;
        if (!this.goal || this.goal.kind !== 'chase' || Math.hypot(this.goal.x - o.x, this.goal.y - o.y) > 0.7) {
            this.goal = { x: o.x, y: o.y, kind: 'chase', reach: 0.6 };
            this.path = null;
        }
        return null;
    }

    /** A quién puede matar sin que le vean: un tripulante a la vista sin nadie más que lo vea. */
    pickTarget() {
        const g = this.game, me = this.me_;
        const crew = this.per.seen.filter(q => g.players[q].alive && !g.isImpostor(q));
        if (!crew.length) return null;
        const careless = this.rng.chance(this.level.careless);
        const known = new Set([...this.per.seen, ...this.per.heard]);
        const others = (t, q) => q !== t && !g.isImpostor(q) && known.has(q);
        const options = crew.filter(t => {
            if (careless) return true;
            const o = g.players[t];
            return !g.witnesses(o.x, o.y, [this.me, t]).some(q => others(t, q)) && !g.witnesses(me.x, me.y, [this.me, t]).some(q => others(t, q));
        });
        if (!options.length) return null;
        return options.sort((a, b) => Math.hypot(g.players[a].x - me.x, g.players[a].y - me.y) - Math.hypot(g.players[b].x - me.x, g.players[b].y - me.y))[0];
    }

    /** Después de matar: avisa él mismo, a veces, o se aleja hacia otra sala. */
    afterKill(e) {
        const g = this.game;
        this.goal = null; this.path = null; this.wait = 0;
        if (this.rng.chance(this.level.selfReport)) { this.selfReport = g.time + this.rng.range(1, 2.5); return; }
        const here = SHIP.byId[e.area];
        const rooms = SHIP.areas.filter(a => a.kind === 'room' && a.id !== e.area)
            .sort((a, b) => Math.hypot(b.cx - (here?.cx ?? e.x), b.cy - (here?.cy ?? e.y)) - Math.hypot(a.cx - (here?.cx ?? e.x), a.cy - (here?.cy ?? e.y)));
        const r = this.rng.pick(rooms.slice(0, 3));
        const p = this.roomPoint(r);
        this.goal = { ...p, kind: 'flee' };
    }

    // ── Andar ─────────────────────────────────────────
    walk(dt) {
        const g = this.game, me = this.me, pl = g.players[me];
        if (this.wait > 0) { this.wait -= dt; g.input(me, 0, 0); return null; }
        if (!this.goal) this.pickGoal();
        if (!this.goal) { this.wait = 1; return null; }
        const goal = this.goal;
        // ¿Ha llegado?
        const reach = goal.reach ?? (goal.task != null ? 0.9 : 1.2);
        if (Math.hypot(goal.x - pl.x, goal.y - pl.y) <= reach) {
            g.input(me, 0, 0);
            this.goal = null; this.path = null;
            if (goal.task != null) {
                this.work = this.impostor ? this.rng.range(2.5, 6) : this.rng.range(...this.level.work);
                return { type: 'startTask', i: goal.task };
            }
            if (goal.kind === 'chase' || goal.kind === 'body') return null;
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

    /** Su siguiente tarea, la más cercana; si no le quedan, una sala cualquiera. Los impostores fingen tareas de vez en cuando. */
    pickGoal() {
        const g = this.game, pl = this.me_;
        // Entre tarea y tarea, a veces se dan una vuelta por otra sala, como cualquiera.
        const stroll = this.rng.chance(0.35);
        const tasks = pl.role === 'impostor' ? (pl.alive && this.rng.chance(0.5) ? [this.rng.pick(g.pending(this.me))].filter(Boolean) : []) : stroll ? [] : g.pending(this.me);
        if (tasks.length) {
            // Los fáciles van a la que les toca en su lista; los demás, a la más cercana.
            const t = this.char.level === 'facil' ? tasks[0] : tasks.slice().sort((a, b) => Math.hypot(a.spot.x - pl.x, a.spot.y - pl.y) - Math.hypot(b.spot.x - pl.x, b.spot.y - pl.y))[0];
            // Se pone delante de la consola, no encima.
            const p = shipStandAt(t.spot);
            this.goal = { x: p.x, y: p.y, task: t.i };
        } else {
            const rooms = SHIP.areas.filter(a => a.kind === 'room' && a.id !== pl.area);
            this.goal = { ...this.roomPoint(this.rng.pick(rooms)), task: null };
        }
        this.path = null;
    }

    roomPoint(r) {
        let p = { x: r.cx + this.rng.range(-r.w / 4, r.w / 4), y: r.cy + this.rng.range(-r.h / 4, r.h / 4) };
        if (shipBlocked(p.x, p.y)) p = { x: r.cx, y: r.cy };
        if (shipBlocked(p.x, p.y)) p = { x: r.x + 1.5, y: r.y + 1.5 };
        return p;
    }

    // ── En la reunión ─────────────────────────────────
    /** La última sala en la que ha estado antes de la reunión. */
    whereWas() {
        for (let i = this.mine.length - 1; i >= 0; i--) if (SHIP.byId[this.mine[i].area]?.kind === 'room') return this.mine[i].area;
        return null;
    }

    /** A quién ha visto en una sala (o en sus pasillos) desde since, el más reciente primero. */
    seenNear(area, since) {
        const near = id => id === area || SHIP.byId[id]?.links?.includes(area);
        const out = [];
        for (let i = this.log.length - 1; i >= 0; i--) {
            const x = this.log[i];
            if (x.t < since) break;
            if (near(x.area) && !out.includes(x.q) && x.q !== this.me) out.push(x.q);
        }
        return out.filter(q => this.game.players[q].alive);
    }

    /** Dónde ha visto a alguien por última vez desde since: { area, t } o null. */
    lastSeen(q, since) {
        for (let i = this.log.length - 1; i >= 0; i--) {
            const x = this.log[i];
            if (x.t < since) return null;
            if (x.q === q) return x;
        }
        return null;
    }

    /** Quién ha estado con él casi todo el rato desde since: su coartada. */
    companions(since) {
        const samples = this.mine.filter(x => x.t >= since).length;
        if (samples < 4) return [];
        const count = {};
        for (const x of this.log) if (x.t >= since) count[x.q] = (count[x.q] || 0) + 1;
        return Object.keys(count).map(Number).filter(q => count[q] >= samples * 0.6 && this.game.players[q].alive);
    }

    /**
     * ¿Lo que dice q de dónde estaba no cuadra con dónde lo ha visto? Si lo vio hace poco tan lejos de esa sala
     * que no le ha dado tiempo a llegar, miente. Devuelve la zona donde lo vio, o null.
     */
    contradicts(q, area, M) {
        const x = this.lastSeen(q, M.start - 20);
        if (!x || x.area === area) return null;
        const r = SHIP.byId[area];
        if (!r) return null;
        const path = shipPath(x.x, x.y, r.cx, r.cy) || [];
        const d = pathLength(x.x, x.y, path) - Math.min(r.w, r.h) / 2;
        const could = (M.start - x.t) * this.game.speed * 1.3 + 1.5;
        return d > could ? x.area : null;
    }

    /** De impostor: dónde dice que estaba. Si estaba lejos del cuerpo, la verdad; si no, otra sala. */
    lieWhere(M) {
        const truth = this.whereWas();
        if (truth && truth !== M.area) return truth;
        const rooms = SHIP.areas.filter(a => a.kind === 'room' && a.id !== M.area);
        // Los que mienten bien eligen una sala que no está junto a la del cuerpo.
        const far = rooms.filter(a => !SHIP.areas.some(c => c.kind === 'corridor' && c.links.includes(a.id) && c.links.includes(M.area)));
        return this.rng.pick(this.rng.chance(this.level.lie) && far.length ? far : rooms).id;
    }

    /** Lo que dice cuando le toca hablar: una a tres frases. */
    meetingLines(M) {
        const g = this.game, me = this.me, lines = [];
        const add = line => { const k = lineKey(line); if (!this.said.has(k)) { this.said.add(k); lines.push(line); } };
        const since = M.start - 25;
        if (!this.impostor) {
            if (this.witness && g.players[this.witness.killer].alive) add({ kind: 'kill', who: this.witness.killer });
            const where = this.whereWas();
            if (where) add({ kind: 'where', area: where });
            for (const s of M.said) {
                if (s.line.kind !== 'where' || s.p === me) continue;
                const seen = this.contradicts(s.p, s.line.area, M);
                if (seen) add({ kind: 'lie', who: s.p, area: seen });
            }
            if (M.kind === 'body' && !lines.some(l => l.kind === 'kill')) {
                const near = this.seenNear(M.area, since).filter(q => q !== M.by);
                if (near.length) add({ kind: 'saw', who: near[0], area: M.area });
            }
            const liars = new Set(lines.filter(l => l.kind === 'lie').map(l => l.who));
            const comp = this.companions(M.start - 20).filter(q => q !== this.witness?.killer && !liars.has(q));
            if (comp.length && lines.length < 3) add({ kind: 'with', who: comp[0] });
            if (lines.length === 1 && lines[0].kind === 'where') add({ kind: 'nothing' });
            if (!lines.length) add({ kind: M.kind === 'button' ? 'skip' : 'nothing' });
        } else {
            add({ kind: 'where', area: this.lieWhere(M) });
            if (this.rng.chance(this.level.lie)) {
                // Echa la culpa a quien ha visto cerca del cuerpo, o se suma a lo que dicen otros.
                const near = M.kind === 'body' ? this.seenNear(M.area, since).filter(q => !g.isImpostor(q)) : [];
                const blamed = M.said.filter(s => ['kill', 'sus', 'saw', 'lie'].includes(s.line.kind) && s.line.who != null && !g.isImpostor(s.line.who) && g.players[s.line.who].alive).map(s => s.line.who);
                if (near.length) add({ kind: 'saw', who: near[0], area: M.area });
                else if (blamed.length) add({ kind: 'agree', who: blamed[blamed.length - 1] });
            } else if (this.rng.chance(0.3)) {
                const crew = g.living().filter(q => q !== me && !g.isImpostor(q));
                if (crew.length) add({ kind: 'sus', who: this.rng.pick(crew) });
            }
        }
        return lines.slice(0, 3);
    }

    /** Lo que contesta cuando alguien dice algo: si le acusan, se defiende; si acusan a alguien con quien estaba, lo defiende. */
    react(speaker, line, M) {
        const g = this.game, me = this.me;
        if (speaker === me || line.who == null || (this.reacted || 0) >= 2) return [];
        const accuse = ['kill', 'sus', 'saw', 'lie', 'agree'].includes(line.kind);
        if (!accuse) return [];
        const out = [];
        const add = l => { const k = lineKey(l); if (this.said.has(k)) return false; this.said.add(k); out.push(l); return true; };
        if (line.who === me) {
            if (this.defended) return [];
            this.defended = true;
            out.push({ kind: 'deny' });
            const where = this.impostor ? this.lieWhere(M) : this.whereWas();
            if (where) add({ kind: 'where', area: where });
        } else if (!this.impostor) {
            const q = line.who, sure = this.witness && g.players[this.witness.killer]?.alive ? this.witness.killer : null;
            const liar = [...this.said].some(k => k.startsWith(`lie:${q}:`));
            if (q !== sure && !liar && this.companions(M.start - 20).includes(q)) add({ kind: 'with', who: q });
            // Quien ha visto matar solo da la razón contra el que mató.
            else if (line.kind !== 'agree' && (sure === q || (sure == null && this.seenNear(M.area, M.start - 25).includes(q)))) add({ kind: 'agree', who: q });
        } else if (g.isImpostor(line.who)) {
            // Defiende a su compañero, si sabe mentir.
            if (this.rng.chance(this.level.lie * 0.5)) add({ kind: 'with', who: line.who });
        } else if (this.rng.chance(0.35)) add({ kind: 'agree', who: line.who });
        if (out.length) this.reacted = (this.reacted || 0) + 1;
        return out;
    }

    /** Cuánto se fía de lo que dice alguien. */
    trust(s, M) {
        if (s === this.me) return 1;
        let t = this.level.trust;
        for (const x of M.said) {
            if (x.p !== s) continue;
            // Si te acusa a ti y sabes que eres tripulante, miente o se equivoca.
            if (!this.impostor && x.line.who === this.me && ['kill', 'sus', 'saw', 'lie', 'agree'].includes(x.line.kind)) t = 0;
            if (x.line.kind === 'where' && this.contradicts(s, x.line.area, M)) t = Math.min(t, 0.1);
        }
        return t;
    }

    /** A quién vota: el más sospechoso, si lo es bastante; si no, salta el voto (-1). */
    vote(M) {
        const g = this.game, me = this.me;
        const alive = g.living().filter(q => q !== me);
        if (this.impostor) return this.impostorVote(M, alive);
        const score = Object.fromEntries(alive.map(q => [q, 0]));
        if (this.witness && score[this.witness.killer] != null) score[this.witness.killer] += 100;
        for (const x of M.said) {
            const w = IMPOSTOR_BLAME[x.line.kind];
            if (w == null || x.line.who == null || score[x.line.who] == null) continue;
            score[x.line.who] += w * this.trust(x.p, M);
        }
        for (const q of alive) {
            // Lo que dice de dónde estaba no cuadra con lo que ha visto.
            const claim = M.said.find(x => x.p === q && x.line.kind === 'where');
            if (claim && this.contradicts(q, claim.line.area, M)) score[q] += 30;
            // Quien le acusa a él, que es tripulante, se equivoca o miente.
            if (M.said.some(x => x.p === q && x.line.who === me && ['kill', 'sus', 'saw', 'agree'].includes(x.line.kind))) score[q] += 15;
        }
        if (M.kind === 'body') for (const q of this.seenNear(M.area, M.start - 25)) if (score[q] != null) score[q] += 10;
        // Quien avisa del cuerpo suele ser tripulante.
        if (M.kind === 'body' && score[M.by] != null) score[M.by] -= 5;
        for (const q of this.companions(M.start - 20)) if (score[q] != null) score[q] -= 25;
        for (const q of alive) score[q] += this.rng.range(-this.level.noise, this.level.noise);
        const best = alive.sort((a, b) => score[b] - score[a])[0];
        return best != null && score[best] >= this.level.threshold ? best : -1;
    }

    impostorVote(M, alive) {
        const g = this.game, me = this.me;
        const crew = alive.filter(q => !g.isImpostor(q));
        const blame = {};
        const against = [];
        for (const x of M.said) {
            const w = { kill: 3, lie: 2, saw: 1, sus: 1, agree: 1, with: -1 }[x.line.kind];
            if (w == null || x.line.who == null) continue;
            if (x.line.who === me && w > 0) against.push(x.p);
            blame[x.line.who] = (blame[x.line.who] || 0) + w;
        }
        // Si le acusan a él, vota a quien le acusa.
        const accuser = against.reverse().find(q => crew.includes(q));
        if ((blame[me] || 0) >= 2 && accuser != null) return accuser;
        const best = crew.sort((a, b) => (blame[b] || 0) - (blame[a] || 0))[0];
        if (best != null && (blame[best] || 0) >= 1) return best;
        return this.rng.chance(this.level.lie * 0.4) && crew.length ? this.rng.pick(crew) : -1;
    }

    quip(kind) {
        const list = this.char.quips?.[kind];
        return list && list.length ? this.rng.pick(list) : null;
    }
}

// Para las pruebas con Node (en el navegador no hace nada).
if (typeof module !== 'undefined') {
    const I = require('./impostor.js');
    Object.assign(globalThis, { shipPath: I.shipPath, shipBlocked: I.shipBlocked, shipStandAt: I.shipStandAt, pathLength: I.pathLength, SHIP: I.SHIP });
    module.exports = { ImpostorBot, IMPOSTOR_LEVELS, IMPOSTOR_BLAME };
}
