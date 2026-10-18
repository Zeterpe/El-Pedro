/* =============================================
   EL PEDRO — impostor-match.js
   La mesa de El Impostor: la nave vista desde
   arriba, en tiempo real. Andas con W, A, S y D o
   con las flechas (en el móvil, con el joystick o la
   cruceta) y todo suena desde su sitio: tus pasos y
   los de los demás, las puertas, el ambiente de cada
   sala, las paredes al rozarlas y tus tareas, que te
   llaman bajito.
   · Siempre miras al norte: lo que está a tu derecha
     en la pantalla suena a tu derecha, y lo de arriba,
     delante.
   · La F dice qué hay cerca y la G pone la guía: un
     pitido que te lleva a una tarea o a una sala.
   · Las tareas son minijuegos de oído y de reflejos.
   ImpostorArt dibuja la ficha del salón.
   ============================================= */
'use strict';

/** El color de cada tripulante (tú eres el primero). */
const IMP_COLORS = ['#f2c94c', '#4f8fe0', '#e05656', '#5cc46a', '#b071e0', '#f08a3c', '#45c9c9', '#f07fbf', '#c9c9c9', '#a8743f'];
/** El suelo de cada sala, en la pantalla. */
const IMP_FLOOR = { motores: '#3a3f52', comedor: '#4a3e5e', puente: '#2c4a60', electricidad: '#4c4930', almacen: '#3c4a3a', enfermeria: '#523c48' };
const IMP_DIRS = ['delante', 'delante a la derecha', 'a la derecha', 'detrás a la derecha', 'detrás', 'detrás a la izquierda', 'a la izquierda', 'delante a la izquierda'];
const IMP_MOVE = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const IMP_STEP = 1 / 30;      // el paso del tiempo de la partida, en segundos
const IMP_STRIDE = 1.1;       // metros entre paso y paso
const IMP_SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/** Los cables: su color y su nota. */
const IMP_CABLES = [
    { name: 'rojo', f: 523, color: '#e05656' },
    { name: 'azul', f: 659, color: '#4f8fe0' },
    { name: 'amarillo', f: 784, color: '#f2c94c' },
    { name: 'verde', f: 988, color: '#5cc46a' },
];
/** Los ruidos sueltos de cada sala: cuál y cada cuánto (de min a max segundos). */
const IMP_SPARKS = { comedor: ['clink', 3, 7], puente: ['beep', 1.5, 4], enfermeria: ['monitor', 1.1, 1.1], electricidad: ['crackle', 2, 5] };

/** Hacia dónde está algo, mirando siempre al norte: «delante a la derecha». */
function impDir(dx, dy) {
    const a = Math.atan2(dx, -dy);
    return IMP_DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}
/** A qué distancia, para el oído: «aquí al lado», «muy cerca», «a 6 metros». */
function impDist(d) {
    if (d < 1.6) return 'aquí al lado';
    if (d < 3) return 'muy cerca';
    return `a ${Math.round(d)} metros`;
}
/** «a, b; y c»: para listas cuyas partes ya llevan comas. */
function impList(items) {
    if (items.length < 2) return items[0] || '';
    return items.slice(0, -1).join('; ') + '; y ' + items[items.length - 1];
}
/** «a Leo», «al robot Chispas». */
const toWhom = name => name.startsWith('el ') ? 'al ' + name.slice(3) : 'a ' + name;
/** Un sitio libre dentro de una sala, para que la guía lleve allí. */
function impRoomPoint(a) {
    for (const [x, y] of [[a.cx, a.cy], [a.cx, a.y + a.h - 1.5], [a.x + 1.5, a.cy], [a.x + 1.5, a.y + 1.5]]) if (!shipBlocked(x, y, IMPOSTOR_RADIUS + 0.06)) return { x, y };
    return { x: a.x + 1.5, y: a.y + 1.5 };
}

// ═══════════════════════════════════════════════════════
// El dibujo de la ficha del salón
// ═══════════════════════════════════════════════════════

const ImpostorArt = {
    /** Un tripulante visto desde arriba: cuerpo redondo, visera y antena. */
    crew(x, y, r, color) {
        return `<g transform="translate(${x} ${y})"><line x1="0" y1="${-r * 0.9}" x2="${r * 0.35}" y2="${-r * 1.55}" stroke="#dfe7f5" stroke-width="${r * 0.18}" stroke-linecap="round"/><circle cx="${r * 0.35}" cy="${-r * 1.6}" r="${r * 0.2}" fill="#ffd34d"/><circle r="${r}" fill="${color}" stroke="#0b1020" stroke-width="${r * 0.18}"/><ellipse cx="0" cy="${-r * 0.3}" rx="${r * 0.62}" ry="${r * 0.36}" fill="#bfe6ff" stroke="#0b1020" stroke-width="${r * 0.12}"/></g>`;
    },

    tile() {
        const s = 2.3, ox = 9, oy = 20, X = x => (ox + x * s).toFixed(1), Y = y => (oy + y * s).toFixed(1);
        const stars = [[6, 8], [20, 5], [37, 12], [58, 6], [79, 10], [97, 4], [112, 13], [4, 92], [33, 95], [70, 93], [104, 90]]
            .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 0.7 : 1.1}" fill="#fff" opacity="${i % 2 ? 0.5 : 0.85}"/>`).join('');
        const areas = SHIP.areas.map(a => `<rect x="${X(a.x)}" y="${Y(a.y)}" width="${(a.w * s).toFixed(1)}" height="${(a.h * s).toFixed(1)}" fill="${a.kind === 'room' ? IMP_FLOOR[a.id] : '#2b3448'}"/>`).join('');
        const t = SHIP.furniture[0];
        const table = `<rect x="${X(t.x)}" y="${Y(t.y)}" width="${t.w * s}" height="${t.h * s}" rx="2" fill="#7a5a3a" stroke="#a07a50" stroke-width="0.8"/>`;
        const spots = SHIP.spots.map(p => `<rect x="${(+X(p.x) - 1.4).toFixed(1)}" y="${(+Y(p.y) - 1.4).toFixed(1)}" width="2.8" height="2.8" rx="0.6" fill="#ffd34d"/>`).join('');
        // Un tripulante que anda por el pasillo y suena: las ondas son su sonido.
        const wx = +X(13.5), wy = +Y(6.5);
        const waves = [4, 7, 10].map((r, i) => `<path d="M ${wx + r * 0.7} ${wy - r * 0.7} A ${r} ${r} 0 0 1 ${wx + r * 0.7} ${wy + r * 0.7}" fill="none" stroke="#45c9c9" stroke-width="1.1" opacity="${0.9 - i * 0.25}"/>`).join('');
        const crew = [this.crew(+X(18.5), +Y(9), 3.2, IMP_COLORS[2]), this.crew(+X(25.5), +Y(9.2), 3.2, IMP_COLORS[3]), this.crew(wx, wy, 3.2, IMP_COLORS[0]), this.crew(+X(21.5), +Y(13.5), 3.2, IMP_COLORS[1])].join('');
        return `<svg class="imp-tile" viewBox="0 0 120 100" aria-hidden="true" focusable="false">${stars}<rect x="${X(1)}" y="${Y(1)}" width="${42 * s}" height="${25 * s}" rx="7" fill="#141b2b" stroke="#8da2c9" stroke-width="1.4"/>${areas}${table}${spots}${waves}${crew}</svg>`;
    },
};

// ═══════════════════════════════════════════════════════
// La partida
// ═══════════════════════════════════════════════════════

class ImpostorMatch extends Match {
    static get kind() { return 'impostor'; }
    get roundWord() { return 'partida'; }
    get playPhases() { return ['ship']; }
    get againLabel() { return 'Jugar otra vez con los mismos compañeros'; }

    setup() {
        this.held = new Set();          // teclas de andar pulsadas (y botones de la cruceta)
        this.stick = null;              // el joystick de la pantalla
        this.nudge = null;              // un toque en la cruceta: andas un momento
        this.guide = null;              // adónde te lleva la guía
        this.task = null;               // la tarea que estás haciendo (su minijuego)
        this.bar = { done: 0, total: 0 };
        this.barSaid = 0;
        this.stepAcc = new Array(this.game.n).fill(0);
        this.seenNow = new Set();
        this.lastSeen = {};             // cuándo has visto por última vez a cada uno
        this.areaWait = null;           // la sala en la que acabas de entrar (se dice si te quedas)
        this.saidArea = null;
        this.nearKey = null;
        this.timers = { door: 0.6, beacon: 1.4, slow: 0, sparks: {} };
        this.ripples = [];              // ondas que se ven donde suena algo que no se ve
        this.clock = 0;
        this.scene = null;
        this.raf = null;
        this.frozen = false;
        this.bumps = 0;
        this.uiRng = makeRng(this.seed + 777);
        // En tiempo real, la voz del juego va al momento; el lector de pantalla se queda atrás.
        this.forceVoice = this.settings.impostorVoice !== 'lector';
        this.stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), a: 0.25 + Math.random() * 0.6, r: Math.random() < 0.15 ? 1.6 : 1 }));
    }

    makeGame(rules, seed) { return new ImpostorGame({ players: this.seats.map(s => ({ name: s.name })), rules, seed }); }
    makeMirror() { throw new Error('El Impostor todavía no se juega en una sala.'); }
    makeBot(p, char, rng) { return new ImpostorBot(this.game, p, char, rng); }

    // ── La voz ────────────────────────────────────────
    say(text, { keep = false, pitch = 1, rate = 1, interrupt = false } = {}) {
        if (this.stopped || !text) return Promise.resolve();
        return this.speech.say(text, { interrupt, keep, pitch, rate, tts: this.forceVoice });
    }
    /** Dice algo al momento; sin voz, en la línea de estado. */
    tell(text, { interrupt = true, keep = false } = {}) {
        if (!text || this.stopped) return;
        if (this.visual) { Board.status(text); return; }
        this.say(text, { interrupt, keep });
    }
    notice(text) {
        if (!text) return;
        if (this.visual) { Board.status(text); return; }
        if (this.speech.history[this.speech.history.length - 1] !== text) this.say(text);
    }
    repeat() { this.say(this.speech.last || 'Nada que repetir.', { interrupt: true }); }

    // ── Ayudas ────────────────────────────────────────
    get mePl() { return this.game.players[this.me]; }
    areaName(id) { return SHIP.byId[id]?.name || ''; }
    taskName(t) { return IMPOSTOR_TASKS[t.type].name; }
    /** Dónde está algo respecto a ti: «a la derecha, a 6 metros». */
    rel(x, y) { const m = this.mePl; return `${impDir(x - m.x, y - m.y)}, ${impDist(Math.hypot(x - m.x, y - m.y))}`; }
    timbreOf(p) { const n = this.game.n; return p === this.me ? 0 : 1 + ((p - this.me - 1 + n) % n) % (STEP_TIMBRES.length - 1); }
    get touch() { return matchMedia('(pointer: coarse)').matches; }
    /** «pulsa E» con teclado; «toca Usar» en una pantalla táctil. */
    press(key, button) { return this.touch ? `toca ${button}` : `pulsa ${key}`; }
    /** Tu tarea pendiente más cercana, contando el camino: { t, d } o null. */
    nearestTask() {
        const m = this.mePl;
        let best = null;
        for (const t of this.game.pending(this.me)) {
            const s = shipStandAt(t.spot), path = shipPath(m.x, m.y, s.x, s.y);
            const d = path ? pathLength(m.x, m.y, path) : Math.hypot(s.x - m.x, s.y - m.y);
            if (!best || d < best.d) best = { t, d };
        }
        return best;
    }

    introText() {
        const others = this.seats.filter((_, p) => p !== this.me).map(s => s.name);
        let t = `Estás en el Comedor de la nave, junto a la mesa, con ${Txt.list(others)}. En esta primera versión no hay impostores: entre todos tenéis que hacer las tareas de la nave.`;
        if (!this.settings.mono) t += ' Ponte auriculares: lo que suena a tu derecha está a tu derecha, y lo que suena delante está arriba en la pantalla.';
        t += this.hint('keys', this.touch
            ? 'Para andar, toca la nave y arrastra el dedo, o usa la cruceta. El botón Qué hay cerca te dice lo que tienes alrededor, y Guía te lleva adonde quieras.'
            : 'Anda con W, A, S y D, o con las flechas. La F te dice qué hay cerca, la G te guía y la H te dice todas las teclas.');
        if (this.practice) t = 'Partida de práctica, con dos tareas fáciles. ' + t;
        return t;
    }

    async intro() {
        Board.status(this.visual ? `${this.title}: haced entre todos las tareas de la nave` : '');
        await this.say(`${this.title}. ${this.introText()}`, { keep: true });
        if (this.speech.mode === 'sr' && UI.trapWanted && !Match.voTipDone) {
            Match.voTipDone = true;
            await this.say(UI.VO_TIP);
        }
    }

    // ── La mesa ───────────────────────────────────────
    actionsDef() {
        return [
            { kind: 'use', label: 'Usar', key: 'E', cls: 'main' },
            { kind: 'near', label: 'Qué hay cerca', key: 'F', cls: 'small talk' },
            { kind: 'guide', label: 'Guía', key: 'G', cls: 'small' },
            { kind: 'tasks', label: 'Mis tareas', key: 'T', cls: 'small' },
            { kind: 'map', label: 'La nave', key: 'M', cls: 'small talk' },
            { kind: 'steps', label: 'Los pasos', key: 'P', cls: 'small talk' },
            { kind: 'info', label: 'Cómo va', key: 'I', cls: 'small talk' },
            { kind: 'repeat', label: 'Repetir', key: 'Espacio', cls: 'small talk' },
            { kind: 'menu', label: 'Pausa', key: 'Esc', cls: 'small' },
        ];
    }

    button(kind) {
        if (kind === 'use') return this.use();
        if (kind === 'near') return this.radar();
        if (kind === 'guide') return this.openGuide();
        if (kind === 'tasks') return this.sayTasks();
        if (kind === 'map') return this.describeShip();
        if (kind === 'steps') return this.stepsDemo();
        return super.button(kind);
    }

    buildCenter(center) {
        for (const id of SEAT_IDS) $('seat-' + id).hidden = true;
        center.innerHTML = `
            <div class="imp-wrap">
                <div class="imp-hud" aria-hidden="true">
                    <span id="imp-area" class="imp-area"></span>
                    <span class="imp-bar"><span id="imp-bar-fill" class="imp-bar-fill"></span><span id="imp-bar-text" class="imp-bar-text"></span></span>
                </div>
                <canvas id="imp-canvas" class="imp-canvas" aria-hidden="true"></canvas>
                <div id="imp-task" class="imp-task" role="group" aria-labelledby="imp-task-title" hidden>
                    <h3 id="imp-task-title"></h3>
                    <p id="imp-task-text"></p>
                    <div id="imp-task-art" class="imp-task-art" aria-hidden="true"></div>
                    <div id="imp-task-btns" class="imp-task-btns"></div>
                </div>
            </div>`;
        $('my-hand').setAttribute('aria-label', 'La nave');
        // La cruceta: mantenla pulsada para andar; un toque (o Enter) anda un paso.
        $('my-extra').innerHTML = `<div class="imp-pad" role="group" aria-label="Andar">
            <button class="nav imp-dir" data-k="w" style="grid-area:up" aria-label="Andar hacia delante">▲</button>
            <button class="nav imp-dir" data-k="a" style="grid-area:left" aria-label="Andar a la izquierda">◀</button>
            <button class="nav imp-dir" data-k="s" style="grid-area:down" aria-label="Andar hacia detrás">▼</button>
            <button class="nav imp-dir" data-k="d" style="grid-area:right" aria-label="Andar a la derecha">▶</button>
        </div>`;
        $('my-extra').querySelectorAll('.imp-dir').forEach(b => {
            const k = 'pad:' + b.dataset.k;
            let t0 = 0;
            b.addEventListener('pointerdown', e => { t0 = performance.now(); this.held.add(k); b.setPointerCapture?.(e.pointerId); });
            const up = () => this.held.delete(k);
            for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, up);
            b.addEventListener('click', () => {
                const held = t0 && performance.now() - t0 > 300;
                t0 = 0;
                if (!held) this.walkNudge(b.dataset.k);
            });
        });
        // El joystick: toca la nave y arrastra hacia donde quieres andar.
        const cv = this.canvas = $('imp-canvas');
        this.ctx2d = cv.getContext('2d');
        const at = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
        cv.addEventListener('pointerdown', e => {
            if (this.task || this.stick) return;
            e.preventDefault();
            cv.setPointerCapture?.(e.pointerId);
            const [x, y] = at(e);
            this.stick = { id: e.pointerId, x0: x, y0: y, dx: 0, dy: 0 };
            this.audio.unlock();
        });
        cv.addEventListener('pointermove', e => {
            const s = this.stick;
            if (!s || s.id !== e.pointerId) return;
            const R = 48, [x, y] = at(e);
            let vx = x - s.x0, vy = y - s.y0, d = Math.hypot(vx, vy);
            // Si el dedo se va lejos, el centro del joystick lo sigue.
            if (d > R * 1.5) { s.x0 = x - vx / d * R * 1.5; s.y0 = y - vy / d * R * 1.5; vx = x - s.x0; vy = y - s.y0; d = R * 1.5; }
            const m = d < 8 ? 0 : Math.min(1, d / R);
            s.dx = d ? vx / d * m : 0; s.dy = d ? vy / d * m : 0;
        });
        const end = e => { if (this.stick?.id === e.pointerId) this.stick = null; };
        for (const ev of ['pointerup', 'pointercancel']) cv.addEventListener(ev, end);
        this.wallSegs = this.findWalls();
    }

    /** Los bordes entre suelo y pared, para dibujarlos. */
    findWalls() {
        const segs = [];
        for (let y = 0; y < SHIP.h; y++) for (let x = 0; x < SHIP.w; x++) {
            if (shipSolid(x, y)) continue;
            if (SHIP.tiles[y * SHIP.w + x] < 0) continue;
            if (shipTile(x + 0.5, y - 0.5) === -1) segs.push([x, y, x + 1, y]);
            if (shipTile(x + 0.5, y + 1.5) === -1) segs.push([x, y + 1, x + 1, y + 1]);
            if (shipTile(x - 0.5, y + 0.5) === -1) segs.push([x, y, x, y + 1]);
            if (shipTile(x + 1.5, y + 0.5) === -1) segs.push([x + 1, y, x + 1, y + 1]);
        }
        return segs;
    }

    render() {
        const g = this.game;
        if (!$('imp-bar-fill')) return;
        const t = !this.task && g.phase === 'ship' ? g.taskHere(this.me) : null;
        Board.showAct('use', g.phase === 'ship', this.task ? 'Seguir la tarea' : t ? `Usar: ${IMPOSTOR_TASKS[t.type].short}` : 'Usar');
        const { done, total } = this.bar;
        $('imp-bar-fill').style.width = total ? `${done / total * 100}%` : '0';
        $('imp-bar-text').textContent = `Tareas de la tripulación: ${done} de ${total}`;
        $('imp-area').textContent = cap(this.areaName(this.mePl.area));
    }

    statusIdle() {
        if (this.guide) return `Guía: te llevo ${this.guide.to}`;
        return this.touch ? 'Toca la nave y arrastra para andar' : 'Anda con W, A, S y D o las flechas · F: qué hay cerca · G: guía';
    }

    // ── El tiempo real ────────────────────────────────
    async phaseStep(phase) {
        if (phase !== 'ship') return false;
        await this.realtime();
        return true;
    }

    /** La partida corre sola: cada fotograma avanza el tiempo, suenan las cosas y se dibuja la nave. */
    realtime() {
        if (!this.scene) this.createScene();
        Board.status(this.statusIdle());
        this.saidArea = this.mePl.area;
        // A quien ya está contigo al empezar no se le anuncia: lo ha dicho la presentación.
        this.seenNow = new Set(this.game.perceive(this.me).seen);
        return new Promise(resolve => {
            let last = performance.now(), acc = 0;
            this.rtDone = () => { this.rtDone = null; resolve(); };
            const frame = now => {
                if (this.stopped || this.game.phase !== 'ship') { this.raf = null; this.draw(); this.scene?.setActive(false); this.rtDone?.(); return; }
                const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
                last = now;
                const frozen = this.paused || Dialog.active;
                if (frozen !== this.frozen) this.onFreeze(frozen);
                if (!frozen) {
                    acc += dt / Math.max(0.05, this.timeScale);
                    let steps = 0;
                    while (acc >= IMP_STEP && steps < 12 && this.game.phase === 'ship') { acc -= IMP_STEP; this.simStep(IMP_STEP); steps++; }
                    if (steps >= 12) acc = 0;
                    if (this.game.phase === 'ship') this.senses(dt);
                    this.taskTick(dt / Math.max(0.05, this.timeScale));
                }
                this.draw();
                this.raf = requestAnimationFrame(frame);
            };
            this.raf = requestAnimationFrame(frame);
        });
    }

    onFreeze(on) {
        this.frozen = on;
        this.scene?.setActive(!on);
        if (on) this.releaseKeys();
    }

    createScene() {
        this.audio.unlock();
        const sc = this.scene = new SpaceAudio(this.audio);
        if (!sc.ok) return;
        for (const a of SHIP.areas) if (a.kind === 'room' && ROOM_AMBIENCE[a.id]) sc.loop('amb:' + a.id, a.cx, a.cy, ROOM_AMBIENCE[a.id], { ref: 3 });
        if (this.settings.impostorWalls) IMP_SIDES.forEach((_, k) => sc.loop('wall' + k, 0, 0, wallRub, { ref: 0.6 }));
    }

    /** Hacia dónde quieres andar: teclas, cruceta y joystick. */
    moveInput() {
        let dx = 0, dy = 0;
        for (const k of this.held) { const v = IMP_MOVE[k.replace('pad:', '')]; if (v) { dx += v[0]; dy += v[1]; } }
        if (this.stick) { dx += this.stick.dx; dy += this.stick.dy; }
        if (this.nudge) { dx += this.nudge.dx; dy += this.nudge.dy; }
        return [clamp(dx, -1, 1), clamp(dy, -1, 1)];
    }

    simStep(dt) {
        const g = this.game;
        if (this.nudge && (this.nudge.t -= dt) <= 0) this.nudge = null;
        const [dx, dy] = this.task ? [0, 0] : this.moveInput();
        g.input(this.me, dx, dy);
        for (let p = 0; p < g.n; p++) {
            const b = this.bots[p];
            if (!b) continue;
            const a = b.update(dt);
            if (a) this.fire({ ...a, p });
            if (g.phase !== 'ship') return;
        }
        for (const e of g.tick(dt)) this.onTick(e);
        this.footsteps();
    }

    /** Lo que hace un compañero de la máquina. */
    fire(a) {
        const res = this.game.act(a);
        if (res.ok) this.apply(res);
        return res;
    }

    onTick(e) {
        if (e.p !== this.me) return;
        if (e.type === 'bump') {
            this.scene?.at(e.x, e.y, ShipSounds.bump(e.what));
            this.ripple(e.x, e.y, 'bump');
            if (++this.bumps === 4) { const h = this.hint('bump', `Si no encuentras la salida, ${this.press('F', 'Qué hay cerca')} para saber por dónde se sale, o ${this.press('G', 'Guía')} para que te guíe.`); if (h && !this.speech.busy) this.notice(h.trim()); }
        } else if (e.type === 'area') this.areaWait = { id: e.area, from: e.from, t: 0.3 };
    }

    /** Los pasos de cada uno: los tuyos, cerca; los de los demás, desde su sitio, y amortiguados tras una pared. */
    footsteps() {
        const g = this.game, me = this.mePl, sc = this.scene;
        for (const pl of g.players) {
            if (!pl.moved) continue;
            const p = pl.index;
            this.stepAcc[p] += pl.moved;
            if (this.stepAcc[p] < IMP_STRIDE) continue;
            this.stepAcc[p] -= IMP_STRIDE;
            if (!sc) continue;
            const floor = shipArea(pl.x, pl.y)?.floor || 'metal', tb = STEP_TIMBRES[this.timbreOf(p)];
            if (p === this.me) { sc.here(ShipSounds.step(tb, floor, 0.5)); continue; }
            const d = Math.hypot(pl.x - me.x, pl.y - me.y);
            if (d > g.hearing) continue;
            const seen = d <= g.vision && shipSight(me.x, me.y, pl.x, pl.y);
            sc.at(pl.x, pl.y, ShipSounds.step(tb, floor, seen ? 1 : 0.9), { wall: !seen && !shipSight(me.x, me.y, pl.x, pl.y) });
            if (!seen) this.ripple(pl.x, pl.y, 'step');
        }
    }

    ripple(x, y, kind) {
        this.ripples.push({ x, y, kind, t0: this.clock });
        if (this.ripples.length > 40) this.ripples.shift();
    }

    /** Lo que oyes y ves en cada fotograma. */
    senses(dt) {
        const g = this.game, me = this.mePl, sc = this.scene;
        this.clock += dt;
        sc?.setListener(me.x, me.y);
        // Quién aparece a la vista.
        const { seen } = g.perceive(this.me);
        for (const p of seen) {
            if (!this.seenNow.has(p)) this.appeared(p);
            this.lastSeen[p] = this.clock;
        }
        this.seenNow = new Set(seen);
        // La sala en la que entras, si te quedas en ella un momento (al cruzar una puerta no se repite).
        const w = this.areaWait;
        if (w && (w.t -= dt) <= 0) {
            this.areaWait = null;
            if (me.area === w.id && w.id !== this.saidArea) this.announceArea(w);
        }
        this.updateGuide(dt);
        this.ambience(dt);
        this.nearCue();
    }

    appeared(p) {
        const pl = this.game.players[p], me = this.mePl;
        this.scene?.at(pl.x, pl.y, ShipSounds.appear());
        // Se dice quién aparece si hace rato que no lo veías, y no mientras haces una tarea.
        if (!this.settings.impostorNames || this.visual || this.task) return;
        if (this.clock - (this.lastSeen[p] ?? -99) < 12 || this.speech.busy) return;
        this.say(`${cap(this.names[p])}, ${impDir(pl.x - me.x, pl.y - me.y)}.`);
    }

    announceArea({ id, from }) {
        const a = SHIP.byId[id];
        this.saidArea = id;
        Board.render(this);
        let t;
        if (a.kind === 'corridor') {
            const to = a.links.find(r => r !== from) || a.links[1];
            t = `Pasillo hacia ${this.areaName(to)}.`;
        } else {
            t = cap(a.name) + '.';
            const here = this.game.pending(this.me).filter(x => x.spot.area === id);
            if (here.length) t += ` Aquí tienes ${here.length === 1 ? 'una tarea' : `${here.length} tareas`}: ${Txt.list(here.map(x => IMPOSTOR_TASKS[x.type].short))}.`;
        }
        this.tell(t);
    }

    /** La guía: un pitido que suena hacia donde tienes que andar, unos metros por delante de ti. */
    updateGuide(dt) {
        const G = this.guide;
        if (!G) return;
        const g = this.game, me = this.mePl;
        if (G.kind === 'task' && me.tasks[G.i]?.done) { this.guide = null; Board.status(this.statusIdle()); return; }
        if (G.kind === 'task' && g.taskHere(this.me)?.i === G.i) {
            // Has llegado: suena la campanita y se dice qué tarea es (nearCue ya no la repite).
            this.guide = null;
            this.nearKey = G.i;
            this.scene?.here(ShipSounds.arrive());
            const t = me.tasks[G.i];
            this.tell(`Has llegado: ${this.taskName(t)}.${this.hint('use', `${cap(this.press('E', 'Usar'))} para empezar.`)}`);
            Board.status(`${cap(this.press('E', 'Usar'))}: ${this.taskName(t)}`);
            Board.render(this);
            return;
        }
        if (G.kind === 'room' && me.area === G.id) {
            this.guide = null;
            this.scene?.here(ShipSounds.arrive());
            this.tell(`Has llegado ${toPlace(this.areaName(G.id))}.`);
            Board.status(this.statusIdle());
            return;
        }
        if ((G.replan -= dt) <= 0) { G.replan = 0.5; G.path = shipPath(me.x, me.y, G.x, G.y); }
        if (!G.path || !G.path.length) return;
        G.carrot = this.carrot(me, G.path);
        const dx = G.carrot.x - me.x, dy = G.carrot.y - me.y;
        // Al doblar una esquina, se dice hacia dónde sigue el camino.
        const ang = Math.atan2(dx, -dy);
        if (G.ang == null) G.ang = ang;
        const turn = Math.abs(((ang - G.ang + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        if (turn > 0.9 && this.clock - (G.saidAt || 0) > 1.2) {
            G.ang = ang; G.saidAt = this.clock;
            this.scene?.here(ShipSounds.waypoint());
            if (!this.speech.busy) this.say(cap(impDir(dx, dy)) + '.');
        }
        if ((G.ping -= dt) <= 0) {
            G.ping = clamp(pathLength(me.x, me.y, G.path) / 12, 0.35, 1);
            this.scene?.at(G.carrot.x, G.carrot.y, ShipSounds.ping(), { ref: 2 });
            this.ripple(G.carrot.x, G.carrot.y, 'ping');
        }
    }

    /** Hacia dónde suena la guía: el punto del camino más lejano (hasta 3 metros) al que se llega en línea recta. */
    carrot(me, path) {
        let best = path[0], px = me.x, py = me.y, run = 0;
        for (const p of path) {
            const seg = Math.hypot(p.x - px, p.y - py);
            for (let t = 0.25; t <= seg + 1e-6; t += 0.25) {
                const k = Math.min(1, t / seg), x = px + (p.x - px) * k, y = py + (p.y - py) * k;
                if (run + t > 3) return best;
                if (!shipClear(me.x, me.y, x, y, IMPOSTOR_RADIUS + 0.02)) return best;
                best = { x, y };
            }
            run += seg; px = p.x; py = p.y;
        }
        return best;
    }

    setGuide(target) {
        this.guide = target ? { ...target, path: null, replan: 0, ping: 0.15, ang: null } : null;
        Board.status(this.statusIdle());
    }

    /** Puertas, tareas que te llaman, el ambiente de cada sala y el roce de las paredes. */
    ambience(dt) {
        const g = this.game, me = this.mePl, sc = this.scene, T = this.timers;
        if (!sc?.ok) return;
        const area = SHIP.byId[me.area];
        // Las puertas de donde estás hacen tic, cada una desde su sitio: así sabes por dónde se sale.
        if ((T.door -= dt) <= 0) {
            T.door = 2.2;
            (area?.doors || []).forEach((d, k) => setTimeout(() => { if (!this.stopped && !this.frozen) sc.at(d.x, d.y, ShipSounds.door()); }, k * 170));
        }
        // Tus tareas te llaman bajito, cada una desde su consola.
        if ((T.beacon -= dt) <= 0) {
            T.beacon = 2.6;
            if (!this.task) g.pending(this.me).forEach((t, k) => {
                const s = t.spot, d = Math.hypot(s.x - me.x, s.y - me.y);
                if (d > 16) return;
                const wall = !shipSight(me.x, me.y, s.x, s.y);
                setTimeout(() => { if (!this.stopped && !this.frozen) sc.at(s.x, s.y, ShipSounds.task(), { wall }); }, k * 320);
            });
        }
        // Los ruidos sueltos de cada sala.
        for (const [id, [name, lo, hi]] of Object.entries(IMP_SPARKS)) {
            if ((T.sparks[id] = (T.sparks[id] ?? Math.random() * hi) - dt) > 0) continue;
            T.sparks[id] = lo + Math.random() * (hi - lo);
            const a = SHIP.byId[id];
            if (Math.hypot(a.cx - me.x, a.cy - me.y) > 18) continue;
            const x = a.x + 1 + Math.random() * (a.w - 2), y = a.y + 1 + Math.random() * (a.h - 2);
            sc.at(x, y, ShipSounds[name](), { wall: me.area !== id && !shipSight(me.x, me.y, x, y) });
        }
        // El ambiente y las paredes, unas diez veces por segundo.
        if ((T.slow -= dt) > 0) return;
        T.slow = 0.1;
        for (const a of SHIP.areas) {
            if (a.kind !== 'room') continue;
            const inside = me.area === a.id, d = Math.hypot(a.cx - me.x, a.cy - me.y);
            const level = inside ? 1 : clamp(1 - d / 20, 0, 1) * 0.55;
            sc.setLoop('amb:' + a.id, { level, wall: !inside && !shipSight(me.x, me.y, a.cx, a.cy) });
        }
        if (!this.settings.impostorWalls) return;
        IMP_SIDES.forEach(([dx, dy], k) => {
            let d = null;
            for (let r = 0.35; r <= 1.6; r += 0.1) if (shipSolid(Math.floor(me.x + dx * r), Math.floor(me.y + dy * r))) { d = r; break; }
            const level = d == null ? 0 : clamp((1.6 - d) / 1.2, 0, 1) * 0.3;
            sc.setLoop('wall' + k, { x: me.x + dx * (d ?? 2), y: me.y + dy * (d ?? 2), level });
        });
    }

    /** Al llegar junto a una tarea tuya, suena una campanita y se dice cuál es. */
    nearCue() {
        const t = this.task ? null : this.game.taskHere(this.me);
        const key = t ? t.i : null;
        if (key === this.nearKey) return;
        this.nearKey = key;
        Board.render(this);
        if (!t) { if (!this.task) Board.status(this.statusIdle()); return; }
        const name = this.taskName(t);
        this.scene?.here(ShipSounds.hit());
        this.tell(`${name}.${this.hint('use', `${cap(this.press('E', 'Usar'))} para empezar.`)}`, { interrupt: !this.speech.busy });
        Board.status(`${cap(this.press('E', 'Usar'))}: ${name}`);
    }

    // ── Lo que pasa ───────────────────────────────────
    async present(e) {
        const me = this.me;
        switch (e.type) {
            case 'tasks':
                if (e.p === me) {
                    Board.render(this);
                    const list = this.game.pending(me).map(t => `${this.taskName(t)}, ${inPlace(this.areaName(t.spot.area))}`);
                    await this.say(`Tus tareas: ${impList(list)}.${this.hint('guide', `${cap(this.press('G', 'Guía'))} y la guía te lleva a la que quieras.`)}`, { keep: true });
                }
                break;
            case 'taskBar': {
                this.bar = { done: e.done, total: e.total };
                const q = e.total ? Math.floor(e.done / e.total * 4) : 0;
                if (e.done) this.scene?.here(ShipSounds.progress(e.done / e.total));
                if (q > this.barSaid && q < 4) {
                    this.barSaid = q;
                    this.notice(['', 'La barra de tareas va por un cuarto.', 'La barra de tareas va por la mitad.', 'La barra de tareas va por tres cuartos.'][q]);
                }
                break;
            }
            case 'taskStart':
                if (e.p === me) this.openTask(e.i, e.task);
                else this.otherSound(e.p, ShipSounds.beep());
                break;
            case 'taskStop':
                if (e.p === me) this.closeTask();
                break;
            case 'taskDone':
                if (e.p === me) {
                    this.closeTask();
                    this.scene?.here(ShipSounds.done());
                    const left = this.game.pending(me).length;
                    this.tell(left ? `Tarea hecha. Te ${left === 1 ? 'queda 1' : `quedan ${left}`}.${this.hint('next', `${cap(this.press('G', 'Guía'))} para ir a la siguiente.`)}` : this.game.phase === 'ship' ? '¡Has hecho todas tus tareas! Pasea por la nave mientras los demás acaban las suyas.' : '', { keep: true });
                } else this.otherSound(e.p, ShipSounds.clink());
                break;
            case 'gameOver':
                this.closeTask();
                this.guide = null;
                Board.banner('¡Nave arreglada!', 'La tripulación ha hecho todas las tareas');
                Board.confetti();
                break;
        }
    }

    /** Un sonido en el sitio de otro jugador, si lo tienes a la vista o al oído. */
    otherSound(p, play) {
        const g = this.game, pl = g.players[p], me = this.mePl, d = Math.hypot(pl.x - me.x, pl.y - me.y);
        if (d > g.hearing) return;
        this.scene?.at(pl.x, pl.y, play, { wall: !shipSight(me.x, me.y, pl.x, pl.y) });
    }

    gameOverText() { return 'La tripulación ha hecho todas las tareas de la nave. ¡Habéis ganado!'; }
    resultText() {
        const g = this.game, { done, total } = g.taskBar(), mine = g.players[this.me].tasks.filter(t => t.done).length;
        return `Tareas hechas: ${done} de ${total}. Tú has hecho ${mine}.`;
    }

    // ── Lo que preguntas ──────────────────────────────
    /** F: dónde estás, por dónde se sale, tus tareas y quién está cerca. */
    radar() {
        const g = this.game, me = this.mePl, a = SHIP.byId[me.area];
        const parts = [];
        if (!a) parts.push('Estás junto a una pared.');
        else if (a.kind === 'room') {
            parts.push(`Estás ${inPlace(a.name)}.`);
            parts.push(`Salidas: ${impList(a.doors.map(d => `hacia ${this.areaName(d.to)}, ${this.rel(d.x, d.y)}`))}.`);
        } else {
            const [d1, d2] = a.doors;
            parts.push(`Estás en ${a.name}. ${cap(this.areaName(d1.room))} está ${this.rel(d1.x, d1.y)}; y ${this.areaName(d2.room)}, ${this.rel(d2.x, d2.y)}.`);
        }
        for (const f of SHIP.furniture) if (f.area === me.area) {
            const x = clamp(me.x, f.x, f.x + f.w), y = clamp(me.y, f.y, f.y + f.h);
            parts.push(`${cap(f.name)} está ${this.rel(x, y)}.`);
        }
        const pend = g.pending(this.me), here = pend.filter(t => t.spot.area === me.area);
        if (here.length) parts.push(here.map(t => `Tu tarea ${this.taskName(t)} está ${this.rel(t.spot.x, t.spot.y)}.`).join(' '));
        else if (pend.length) { const n = this.nearestTask(); parts.push(`Tu tarea más cercana es ${this.taskName(n.t)}, ${inPlace(this.areaName(n.t.spot.area))}.`); }
        else parts.push('Ya has hecho todas tus tareas.');
        const { seen, heard } = g.perceive(this.me);
        if (seen.length) parts.push(`Ves ${impList(seen.map(p => `${toWhom(this.names[p])}, ${this.rel(g.players[p].x, g.players[p].y)}`))}.`);
        const steps = new Set(heard.map(p => {
            const pl = g.players[p];
            return `${impDir(pl.x - me.x, pl.y - me.y)}${shipSight(me.x, me.y, pl.x, pl.y) ? ', lejos' : ', al otro lado de la pared'}`;
        }));
        if (steps.size) parts.push(`Oyes pasos ${impList([...steps])}.`);
        if (!seen.length && !heard.length) parts.push('No hay nadie cerca.');
        if (this.guide?.carrot) parts.push(`La guía te lleva ${this.guide.to}: sigue ${impDir(this.guide.carrot.x - me.x, this.guide.carrot.y - me.y)}.`);
        this.tell(parts.join(' '), { keep: true });
    }

    /** M: cómo es la nave. */
    describeShip() {
        const a = SHIP.byId[this.mePl.area];
        this.tell(`La nave tiene seis salas en dos filas. Arriba, de izquierda a derecha: Motores, el Comedor y el Puente de mando. Abajo: Electricidad, el Almacén y la Enfermería. Un pasillo une cada sala con las de al lado, y otro baja del Comedor al Almacén. Empezáis en el Comedor, alrededor de la mesa.${a ? ` Ahora estás ${inPlace(a.name)}.` : ''}`, { keep: true });
    }

    sayTasks() {
        const me = this.mePl;
        if (!me.tasks.length) { this.tell('Todavía no tienes tareas.'); return; }
        const list = me.tasks.map(t => {
            const s = SHIP.spots[t.spot], name = IMPOSTOR_TASKS[t.type].name;
            if (t.done) return `${name}: hecha`;
            return `${name}, ${inPlace(this.areaName(s.area))}${me.area === s.area ? `, ${this.rel(s.x, s.y)}` : ''}`;
        });
        this.tell(`Tus tareas: ${impList(list)}.`, { keep: true });
    }
    myCards() { this.sayTasks(); }

    info() {
        const g = this.game, { done, total } = g.taskBar(), mine = this.mePl.tasks, left = mine.filter(t => !t.done).length;
        const parts = [`La tripulación lleva ${done} tareas de ${total}, el ${total ? Math.round(done / total * 100) : 0} por ciento.`];
        parts.push(left ? `A ti te quedan ${left} de ${mine.length}.` : 'Tú ya has hecho todas las tuyas.');
        const a = SHIP.byId[this.mePl.area];
        if (a) parts.push(`Estás ${inPlace(a.name)}.`);
        parts.push(`En la nave estáis ${g.n}: ${Txt.list(this.names)}.`);
        this.tell(parts.join(' '), { keep: true });
    }

    keysHelp() {
        const t = [
            'W, A, S y D, o las flechas: andar. W va hacia delante, que es arriba en la pantalla; S, hacia detrás; A, a la izquierda, y D, a la derecha. Lo que suena a tu derecha está a tu derecha.',
            'E o Enter: usar la tarea que tienes al lado.',
            'F: qué hay cerca: dónde estás, las salidas, tus tareas y quién está contigo. G: la guía, que te lleva con un pitido a una tarea o a una sala.',
            'T o C: tus tareas. M: cómo es la nave. P: cómo suenan los pasos de cada uno. I: cómo va la partida.',
            'Espacio: repetir lo último. H: las teclas. Escape: pausa, o dejar la tarea que estás haciendo.',
        ];
        this.tell(t.join(' ') + this.srKeysTip(), { keep: true });
    }

    /** P: los pasos de cada uno, para reconocerlos sin verlos. */
    async stepsDemo() {
        if (this.demoing || !this.scene?.ok) { if (!this.scene?.ok) this.tell('No hay sonido.'); return; }
        this.demoing = true;
        const g = this.game, order = [this.me, ...g.players.map(p => p.index).filter(p => p !== this.me)];
        for (const [k, p] of order.entries()) {
            if (this.stopped) break;
            await this.say(p === this.me ? 'Tus pasos.' : `${cap(this.names[p])}.`, { interrupt: k === 0 });
            for (let i = 0; i < 3; i++) setTimeout(() => this.scene?.here(ShipSounds.step(STEP_TIMBRES[this.timbreOf(p)], 'metal', 0.8)), i * 300);
            await new Promise(r => setTimeout(r, 1000));
        }
        this.demoing = false;
    }

    /** G: adónde quieres que te lleve la guía. */
    async openGuide() {
        if (this.task) { this.notice('Primero acaba la tarea, o déjala con Escape.'); return; }
        if (this.game.phase !== 'ship' || Dialog.active) return;
        const g = this.game, me = this.mePl;
        const tasks = g.pending(this.me).map(t => {
            const s = shipStandAt(t.spot), path = shipPath(me.x, me.y, s.x, s.y);
            return { t, s, d: path ? pathLength(me.x, me.y, path) : 99 };
        }).sort((a, b) => a.d - b.d);
        const items = [
            ...tasks.map(({ t, d }) => ({ label: `${this.taskName(t)}, ${inPlace(this.areaName(t.spot.area))}, ${impDist(d)}`, value: 'task:' + t.i })),
            ...SHIP.areas.filter(a => a.kind === 'room' && a.id !== me.area).map(a => ({ label: `Ir ${toPlace(a.name)}`, value: 'room:' + a.id })),
            ...(this.guide ? [{ label: 'Apagar la guía', value: 'off' }] : []),
        ];
        const r = await Dialog.open({
            title: 'La guía',
            text: this.guide ? `Ahora te llevo ${this.guide.to}.` : 'Elige adónde quieres ir. Un pitido te llevará por el camino.',
            items, cancel: null,
        });
        if (!r || this.stopped) return;
        if (r === 'off') { this.setGuide(null); this.tell('Guía apagada.'); return; }
        const [kind, v] = r.split(':');
        if (kind === 'task') {
            const { t, s } = tasks.find(x => x.t.i === +v);
            this.setGuide({ kind, i: t.i, x: s.x, y: s.y, to: `a ${this.taskName(t).toLowerCase()}` });
        } else {
            const a = SHIP.byId[v], p = impRoomPoint(a);
            this.setGuide({ kind, id: v, x: p.x, y: p.y, to: toPlace(a.name) });
        }
        this.tell(`Te llevo ${this.guide.to}. Sigue el pitido.${this.hint('ping', 'Suena hacia donde tienes que andar, y más deprisa cuanto más cerca estás. Al llegar, suena una campanita.')}`, { keep: true });
    }

    // ── Andar ─────────────────────────────────────────
    walkNudge(k) {
        if (this.task) { this.busyNotice(); return; }
        const [dx, dy] = IMP_MOVE[k];
        this.nudge = { dx, dy, t: 0.45 };
        this.audio.unlock();
    }

    busyNotice() {
        if (this.clock - (this.busySaid || -9) < 2) return;
        this.busySaid = this.clock;
        this.notice(`Estás con una tarea. Para irte, ${this.press('Escape', 'Dejar la tarea')}.`);
    }

    releaseKeys() {
        this.held.clear();
        this.stick = null;
        this.nudge = null;
        if (this.game.phase === 'ship') this.game.input(this.me, 0, 0);
    }

    onKeyUp(e) {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        this.held.delete(k);
    }

    // ── Usar y las tareas ─────────────────────────────
    use() {
        if (this.task) { this.taskKey('Enter'); return; }
        const g = this.game;
        if (g.phase !== 'ship') { this.explainCant(); return; }
        const t = g.taskHere(this.me);
        if (t) { this.act({ type: 'startTask', p: this.me, i: t.i }); return; }
        this.audio.error();
        const n = this.nearestTask();
        if (!n) { this.tell('Ya has hecho todas tus tareas. Pasea por la nave mientras los demás acaban las suyas.'); return; }
        this.tell(`Aquí no hay ninguna tarea tuya. La más cercana es ${this.taskName(n.t)}, ${inPlace(this.areaName(n.t.spot.area))}, ${impDist(n.d)}.${this.hint('guideTip', `${cap(this.press('G', 'Guía'))} para que te guíe.`)}`);
    }

    openTask(i, type) {
        this.releaseKeys();
        const T = this.task = { i, type, easy: !!this.game.rules.easyTasks };
        $('imp-task').hidden = false;
        $('imp-task-title').textContent = IMPOSTOR_TASKS[type].name;
        Board.status(IMPOSTOR_TASKS[type].name);
        this[type + 'Start'](T);
        Board.render(this);
    }

    closeTask() {
        if (this.motorOsc) this.motorTone(false);
        if (!this.task) return;
        this.task = null;
        const box = $('imp-task');
        if (box) box.hidden = true;
        this.nearKey = undefined;
        Board.render(this);
    }

    finishTask() {
        const T = this.task;
        if (!T || T.finished) return;
        T.finished = true;
        if (this.motorOsc) this.motorTone(false);
        this.act({ type: 'task', p: this.me, i: T.i });
    }

    cancelPick() {
        if (!this.task) return false;
        this.act({ type: 'cancelTask', p: this.me });
        this.tell('Dejas la tarea. Puedes volver cuando quieras.');
        return true;
    }

    taskKey(k) {
        const T = this.task;
        if (!T || T.finished) return;
        this[T.type + 'Key'](T, k === 'e' ? 'Enter' : k);
    }

    taskTick(dt) {
        const T = this.task;
        if (T && !T.finished && this[T.type + 'Tick']) this[T.type + 'Tick'](T, dt);
    }

    /** Lo que se ve en el panel de la tarea: el texto, el dibujo y los botones. */
    taskUI({ text = null, art = null, buttons = null }) {
        if (text != null) $('imp-task-text').textContent = text;
        if (art != null) $('imp-task-art').innerHTML = art;
        if (!buttons) return;
        const box = $('imp-task-btns');
        box.innerHTML = '';
        for (const b of [...buttons, { k: 'Escape', label: 'Dejar la tarea', cls: 'imp-leave' }]) {
            const el = document.createElement('button');
            el.className = `nav imp-tbtn ${b.cls || ''}`.trim();
            el.textContent = b.label;
            if (b.color) el.style.setProperty('--c', b.color);
            el.addEventListener('click', () => { this.audio.unlock(); if (b.k === 'Escape') this.cancelPick(); else this.taskKey(b.k); });
            box.appendChild(el);
        }
    }

    sound(play) { this.scene?.here(play); }

    // · Arreglar los cables: cada cable con el enchufe de su color, que suena igual.
    cablesStart(T) {
        const n = T.easy ? 3 : 4;
        T.sockets = this.uiRng.shuffle([...Array(n).keys()]);
        T.cur = 0; T.sel = null; T.links = [];
        this.taskUI({ buttons: T.sockets.map((c, k) => ({ k: String(k + 1), label: `${k + 1} · ${IMP_CABLES[c].name}`, color: IMP_CABLES[c].color })) });
        this.cableCall(T, true);
    }
    cableCall(T, first = false) {
        const c = IMP_CABLES[T.cur];
        this.taskUI({ text: `Conecta el cable ${c.name} con el enchufe ${c.name}. Cada enchufe suena al pulsarlo; el bueno suena igual que el cable.`, art: this.cablesArt(T) });
        this.sound(ShipSounds.note(c.f));
        const what = this.touch ? 'Toca un enchufe' : 'Pulsa el número de un enchufe';
        const how = this.settings.confirmPlay ? `${what} para oírlo, y otra vez para conectarlo.` : `${what} que suene igual para conectarlo.`;
        this.tell(`${first ? 'Conecta cada cable con el enchufe de su color. ' : ''}Cable ${c.name}.${first ? this.hint('cables', how) : ''}`);
    }
    cablesKey(T, k) {
        if (k === ' ') { this.cableCall(T); return; }
        if (k === 'Enter') {
            if (T.sel == null) { this.audio.error(); this.tell('Primero elige un enchufe con su número.'); return; }
            this.cablePlug(T, T.sel);
            return;
        }
        const s = +k - 1;
        if (!(s >= 0 && s < T.sockets.length)) return;
        if (T.links.includes(s)) { this.audio.error(); this.tell(`El enchufe ${s + 1} ya está conectado.`); return; }
        const c = IMP_CABLES[T.sockets[s]];
        if (this.settings.confirmPlay && T.sel !== s) {
            T.sel = s;
            this.sound(ShipSounds.note(c.f, 0.3));
            this.tell(`Enchufe ${s + 1}: ${c.name}.`);
            this.taskUI({ art: this.cablesArt(T) });
            return;
        }
        this.cablePlug(T, s);
    }
    cablePlug(T, s) {
        T.sel = null;
        if (T.sockets[s] !== T.cur) {
            this.sound(ShipSounds.zap());
            this.tell(`Ese es el ${IMP_CABLES[T.sockets[s]].name}. Busca el ${IMP_CABLES[T.cur].name}.`);
            this.taskUI({ art: this.cablesArt(T) });
            return;
        }
        this.sound(ShipSounds.plug());
        T.links[T.cur] = s;
        T.cur++;
        if (T.cur >= T.sockets.length) { this.taskUI({ art: this.cablesArt(T) }); this.finishTask(); return; }
        this.cableCall(T);
    }
    cablesArt(T) {
        const n = T.sockets.length, H = n * 30 + 10, y = k => 20 + k * 30;
        let s = '';
        for (let c = 0; c < n; c++) {
            const col = IMP_CABLES[c].color, done = T.links[c] != null;
            if (done) s += `<path d="M 26 ${y(c)} C 100 ${y(c)}, 100 ${y(T.links[c])}, 174 ${y(T.links[c])}" stroke="${col}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
            s += `<rect x="6" y="${y(c) - 8}" width="22" height="16" rx="4" fill="${col}" ${c === T.cur ? 'stroke="#fff" stroke-width="3"' : ''}/>`;
        }
        T.sockets.forEach((c, k) => {
            s += `<rect x="172" y="${y(k) - 9}" width="22" height="18" rx="4" fill="#1b2233" stroke="${IMP_CABLES[c].color}" stroke-width="${T.sel === k ? 5 : 3}"/><text x="183" y="${y(k) + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">${k + 1}</text>`;
        });
        return `<svg viewBox="0 0 200 ${H}">${s}</svg>`;
    }

    // · Descargar los datos: empiezas la descarga y esperas a que se llene la barra.
    descargaStart(T) {
        T.t = 0; T.dur = T.easy ? 4 : 7; T.running = false; T.mark = 0;
        this.taskUI({ text: `${this.touch ? 'Toca Empezar la descarga' : 'Pulsa E o Enter para empezar la descarga'}, y espera a que se llene la barra.`, art: this.barArt(0), buttons: [{ k: 'Enter', label: 'Empezar la descarga' }] });
        this.tell(`Descargar los datos.${this.hint('descarga', `${cap(this.press('E', 'Empezar la descarga'))} y espera aquí a que termine.`)}`);
    }
    descargaKey(T, k) {
        if (k !== 'Enter' && k !== ' ') return;
        if (T.running) { this.tell(`Va por el ${Math.round(T.t / T.dur * 100)} por ciento.`); return; }
        T.running = true;
        this.sound(ShipSounds.key());
        this.taskUI({ text: 'Descargando. Espera a que se llene la barra.', buttons: [{ k: 'Enter', label: 'Cuánto falta' }] });
        this.tell('Descargando.');
    }
    descargaTick(T, dt) {
        if (!T.running) return;
        T.t += dt;
        const x = Math.min(1, T.t / T.dur), mark = Math.floor(x * 10);
        if (mark > T.mark) { T.mark = mark; this.sound(ShipSounds.progress(x)); }
        $('imp-task-art').innerHTML = this.barArt(x);
        if (x >= 1) this.finishTask();
    }
    barArt(x) { return `<div class="imp-dl"><span style="width:${Math.round(x * 100)}%"></span></div><p class="imp-dl-pct">${Math.round(x * 100)} %</p>`; }

    // · Calibrar el motor: una aguja que va y viene; se para en el centro.
    motorStart(T) {
        T.ph = -Math.PI / 2; T.x = -1; T.hits = 0; T.need = T.easy ? 2 : 3; T.tol = T.easy ? 0.3 : 0.17; T.speed = T.easy ? 1.6 : 2.3; T.cool = 0;
        this.taskUI({ text: this.motorText(T), art: this.motorArt(T), buttons: [{ k: ' ', label: '¡Ahora!' }] });
        this.motorTone(true);
        this.tell(`Calibrar el motor. ${cap(this.press('Espacio', 'Ahora'))} cuando la aguja esté en el centro: allí suena más aguda y en medio, ni a la izquierda ni a la derecha. Hacen falta ${T.need} aciertos.`);
    }
    motorText(T) { return `${this.touch ? 'Toca Ahora' : 'Pulsa Espacio, E o Enter'} cuando la aguja esté en el centro, donde suena más aguda. Aciertos: ${T.hits} de ${T.need}.`; }
    motorKey(T, k) {
        if (k !== ' ' && k !== 'Enter') return;
        if (T.cool > 0) return;
        T.cool = 0.35;
        if (Math.abs(T.x) <= T.tol) {
            T.hits++;
            this.sound(ShipSounds.hit());
            if (T.hits >= T.need) { this.finishTask(); return; }
            T.speed *= 1.12;
            this.taskUI({ text: this.motorText(T) });
            this.tell(`¡Bien! ${T.hits} de ${T.need}.`);
        } else {
            this.sound(ShipSounds.zap());
            this.tell(`Casi: estaba a la ${T.x < 0 ? 'izquierda' : 'derecha'}.`);
        }
    }
    motorTick(T, dt) {
        T.ph += dt * T.speed;
        T.x = Math.sin(T.ph);
        T.cool -= dt;
        const o = this.motorOsc;
        if (o) {
            const t = this.audio.ctx.currentTime;
            o.o.frequency.setTargetAtTime(330 + 600 * (1 - Math.abs(T.x)), t, 0.015);
            o.p.pan.setTargetAtTime(T.x * 0.9, t, 0.015);
        }
        const needle = $('imp-needle');
        if (needle) needle.setAttribute('transform', `rotate(${(T.x * 60).toFixed(1)} 100 96)`);
    }
    motorTone(on) {
        const sc = this.scene, ctx = this.audio.ctx;
        if (on && sc?.ok && !this.motorOsc) {
            const o = ctx.createOscillator(); o.type = 'triangle';
            const g = ctx.createGain(); g.gain.value = 0;
            const p = ctx.createStereoPanner();
            o.connect(g); g.connect(p); p.connect(sc.root);
            o.start();
            g.gain.setTargetAtTime(0.1, ctx.currentTime, 0.05);
            this.motorOsc = { o, g, p };
        } else if (!on && this.motorOsc) {
            const { o, g } = this.motorOsc;
            this.motorOsc = null;
            g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
            setTimeout(() => { try { o.stop(); o.disconnect(); } catch (_) { /* ya parado */ } }, 250);
        }
    }
    motorArt(T) {
        const zone = T.tol * 60 * Math.PI / 180, r = 80, cx = 100, cy = 96;
        const arc = (a0, a1) => `M ${cx + r * Math.sin(a0)} ${cy - r * Math.cos(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.sin(a1)} ${cy - r * Math.cos(a1)}`;
        const full = 60 * Math.PI / 180;
        return `<svg viewBox="0 0 200 110"><path d="${arc(-full, full)}" stroke="#3a4560" stroke-width="16" fill="none"/><path d="${arc(-zone, zone)}" stroke="#5cc46a" stroke-width="16" fill="none"/><g id="imp-needle" transform="rotate(-60 100 96)"><line x1="100" y1="96" x2="100" y2="22" stroke="#ffd34d" stroke-width="5" stroke-linecap="round"/></g><circle cx="100" cy="96" r="8" fill="#ffd34d"/></svg>`;
    }

    // · Teclear el código: se dice (y se ve) un número y lo tecleas.
    codigoStart(T) {
        T.code = Array.from({ length: T.easy ? 3 : 4 }, () => 1 + this.uiRng.int(9));
        T.pos = 0;
        const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => ({ k: String(d), label: String(d), cls: 'imp-key' }));
        const again = this.touch ? 'El botón Repetir el código lo repite.' : 'Espacio lo repite.';
        this.taskUI({ text: `Teclea el código: ${T.code.join(' ')}. ${again}`, art: this.codeArt(T), buttons: [...keys, { k: ' ', label: 'Repetir el código', cls: 'imp-wide' }] });
        this.tell(`Teclea el código: ${T.code.join(', ')}.${this.hint('codigo', again)}`);
    }
    codigoKey(T, k) {
        if (k === ' ' || k === 'Enter') { this.tell(`El código: ${T.code.join(', ')}.${T.pos ? ` Llevas ${T.pos}.` : ''}`); return; }
        if (!/^[1-9]$/.test(k)) return;
        if (+k === T.code[T.pos]) {
            T.pos++;
            this.sound(ShipSounds.key());
            $('imp-task-art').innerHTML = this.codeArt(T);
            if (T.pos >= T.code.length) this.finishTask();
            return;
        }
        T.pos = 0;
        this.sound(ShipSounds.zap());
        $('imp-task-art').innerHTML = this.codeArt(T);
        this.tell(`No. Otra vez desde el principio: ${T.code.join(', ')}.`);
    }
    codeArt(T) { return `<div class="imp-code">${T.code.map((d, i) => `<span class="${i < T.pos ? 'ok' : ''}">${d}</span>`).join('')}</div>`; }

    // ── Teclado ───────────────────────────────────────
    gameKey(k, e) {
        if (IMP_MOVE[k]) {
            e.preventDefault();
            if (this.task) { this.busyNotice(); return true; }
            this.held.add(k);
            this.audio.unlock();
            return true;
        }
        if (this.task) {
            if (/^[1-9]$/.test(k) || k === ' ' || k === 'e' || (k === 'Enter' && !e.target?.closest?.('button'))) {
                e.preventDefault();
                this.taskKey(k);
                return true;
            }
            if (k === 'Enter') return false;
        }
        if (k === 'e' || (k === 'Enter' && !e.target?.closest?.('button'))) { e.preventDefault(); this.use(); return true; }
        if (k === 'f') { e.preventDefault(); this.radar(); return true; }
        if (k === 'g') { e.preventDefault(); this.openGuide(); return true; }
        if (k === 't') { e.preventDefault(); this.sayTasks(); return true; }
        if (k === 'm') { e.preventDefault(); this.describeShip(); return true; }
        if (k === 'p') { e.preventDefault(); this.stepsDemo(); return true; }
        return false;
    }

    stop() {
        super.stop();
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = null;
        this.closeTask();
        this.scene?.dispose();
        this.scene = null;
        this.rtDone?.();
    }

    // ── El dibujo de la nave ──────────────────────────
    draw() {
        const cv = this.canvas;
        if (!cv || !cv.isConnected) return;
        const w = cv.clientWidth, h = cv.clientHeight;
        if (!w || !h) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
        const c = this.ctx2d, g = this.game, me = this.mePl, now = this.clock;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.fillStyle = '#060a14';
        c.fillRect(0, 0, w, h);
        if (this.settings.impostorBlind) {
            c.fillStyle = 'rgba(255,255,255,.55)';
            c.font = '600 18px system-ui, sans-serif';
            c.textAlign = 'center';
            c.fillText('Modo a ciegas: guíate por el oído', w / 2, h / 2);
            return;
        }
        const S = clamp(Math.min(w, h) / 13, 18, 46);
        const ox = w / 2 - me.x * S, oy = h / 2 - me.y * S;
        const X = x => ox + x * S, Y = y => oy + y * S;
        // Las estrellas, que se mueven un poco al andar.
        for (const s of this.stars) {
            const sx = ((s.x * w - me.x * S * 0.15) % w + w) % w, sy = ((s.y * h - me.y * S * 0.15) % h + h) % h;
            c.fillStyle = `rgba(255,255,255,${s.a})`;
            c.fillRect(sx, sy, s.r, s.r);
        }
        // El casco, las salas y los pasillos.
        c.fillStyle = '#141b2b';
        c.beginPath(); c.roundRect?.(X(1), Y(1), 42 * S, 25 * S, S); c.fill();
        for (const a of SHIP.areas) {
            c.fillStyle = a.kind === 'room' ? IMP_FLOOR[a.id] : '#2b3448';
            c.fillRect(X(a.x), Y(a.y), a.w * S + 0.5, a.h * S + 0.5);
            // Las rejillas se ven como rejillas.
            if (a.floor === 'rejilla') {
                c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 1;
                c.beginPath();
                for (let x = a.x + 1; x < a.x + a.w; x++) { c.moveTo(X(x), Y(a.y)); c.lineTo(X(x), Y(a.y + a.h)); }
                for (let y = a.y + 1; y < a.y + a.h; y++) { c.moveTo(X(a.x), Y(y)); c.lineTo(X(a.x + a.w), Y(y)); }
                c.stroke();
            }
        }
        // Las paredes.
        c.strokeStyle = '#8da2c9'; c.lineWidth = Math.max(2, S * 0.12); c.lineCap = 'round';
        c.beginPath();
        for (const [x0, y0, x1, y1] of this.wallSegs) { c.moveTo(X(x0), Y(y0)); c.lineTo(X(x1), Y(y1)); }
        c.stroke();
        // Las puertas: una raya en el suelo.
        c.strokeStyle = 'rgba(159,180,217,.45)'; c.lineWidth = Math.max(1.5, S * 0.07); c.setLineDash([S * 0.25, S * 0.2]);
        c.beginPath();
        for (const d of SHIP.doors) { const px = -d.ny * 1.5, py = d.nx * 1.5; c.moveTo(X(d.x - px), Y(d.y - py)); c.lineTo(X(d.x + px), Y(d.y + py)); }
        c.stroke(); c.setLineDash([]);
        // Los muebles.
        for (const f of SHIP.furniture) {
            c.fillStyle = '#7a5a3a'; c.strokeStyle = '#a07a50'; c.lineWidth = Math.max(2, S * 0.08);
            c.beginPath(); c.roundRect?.(X(f.x) + 2, Y(f.y) + 2, f.w * S - 4, f.h * S - 4, S * 0.4); c.fill(); c.stroke();
        }
        // Las consolas de las tareas: las tuyas, en amarillo; hechas, en verde.
        const mine = new Map(me.tasks.map(t => [t.spot, t]));
        for (const s of SHIP.spots) {
            const t = mine.get(s.id), r = S * 0.34;
            c.fillStyle = t ? (t.done ? '#5cc46a' : '#f2c94c') : '#56627e';
            c.fillRect(X(s.x) - r, Y(s.y) - r, r * 2, r * 2);
            if (t && !t.done) {
                c.strokeStyle = `rgba(242,201,76,${0.35 + 0.35 * Math.sin(now * 4)})`; c.lineWidth = 2;
                c.beginPath(); c.arc(X(s.x), Y(s.y), r * 1.9, 0, Math.PI * 2); c.stroke();
            }
        }
        // Los nombres de las salas.
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `700 ${Math.round(S * 0.5)}px system-ui, sans-serif`;
        c.fillStyle = 'rgba(255,255,255,.5)';
        for (const a of SHIP.areas) if (a.kind === 'room') c.fillText(cap(a.name), X(a.cx), Y(a.y + a.h - 0.7));
        // El camino de la guía.
        const G = this.guide;
        if (G?.path?.length) {
            c.strokeStyle = 'rgba(69,201,201,.75)'; c.lineWidth = Math.max(2, S * 0.1); c.setLineDash([S * 0.3, S * 0.25]);
            c.beginPath(); c.moveTo(X(me.x), Y(me.y));
            for (const p of G.path) c.lineTo(X(p.x), Y(p.y));
            c.stroke(); c.setLineDash([]);
        }
        // Las ondas de lo que suena y no se ve (pasos tras la pared, choques, la guía).
        this.ripples = this.ripples.filter(r => now - r.t0 < 0.9);
        for (const r of this.ripples) {
            const age = (now - r.t0) / 0.9;
            c.strokeStyle = r.kind === 'ping' ? `rgba(69,201,201,${0.9 * (1 - age)})` : r.kind === 'bump' ? `rgba(255,140,120,${0.8 * (1 - age)})` : `rgba(255,255,255,${0.45 * (1 - age)})`;
            c.lineWidth = 2;
            c.beginPath(); c.arc(X(r.x), Y(r.y), S * (0.2 + age * (r.kind === 'step' ? 1.2 : 0.8)), 0, Math.PI * 2); c.stroke();
        }
        // Los tripulantes que ves, y tú.
        c.font = `700 ${Math.round(S * 0.38)}px system-ui, sans-serif`;
        for (const pl of g.players) {
            if (pl.index !== this.me && !this.seenNow.has(pl.index)) continue;
            this.drawCrew(c, X(pl.x), Y(pl.y), S, pl, pl.index === this.me);
        }
        // La niebla: más allá de lo que ves, se ve oscuro.
        const fog = c.createRadialGradient(w / 2, h / 2, g.vision * S * 0.75, w / 2, h / 2, g.vision * S * 1.15);
        fog.addColorStop(0, 'rgba(4,7,15,0)');
        fog.addColorStop(1, 'rgba(4,7,15,.72)');
        c.fillStyle = fog;
        c.fillRect(0, 0, w, h);
        // El joystick.
        const st = this.stick;
        if (st) {
            c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 3;
            c.beginPath(); c.arc(st.x0, st.y0, 48, 0, Math.PI * 2); c.stroke();
            c.fillStyle = 'rgba(255,211,77,.7)';
            c.beginPath(); c.arc(st.x0 + st.dx * 48, st.y0 + st.dy * 48, 18, 0, Math.PI * 2); c.fill();
        }
    }

    drawCrew(c, x, y, S, pl, isMe) {
        const r = S * 0.32, col = IMP_COLORS[(pl.index - this.me + this.game.n) % this.game.n % IMP_COLORS.length];
        if (isMe) { c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r * 1.7, 0, Math.PI * 2); c.stroke(); }
        // La antena, siempre hacia arriba, y el cuerpo.
        c.strokeStyle = '#dfe7f5'; c.lineWidth = Math.max(1.5, r * 0.18);
        c.beginPath(); c.moveTo(x, y - r * 0.9); c.lineTo(x + r * 0.35, y - r * 1.5); c.stroke();
        c.fillStyle = '#ffd34d'; c.beginPath(); c.arc(x + r * 0.35, y - r * 1.55, r * 0.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = col; c.strokeStyle = '#0b1020'; c.lineWidth = Math.max(1.5, r * 0.18);
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
        // La visera mira hacia donde anda.
        const ang = Math.atan2(pl.fy, pl.fx);
        c.fillStyle = '#bfe6ff'; c.lineWidth = Math.max(1, r * 0.12);
        c.beginPath(); c.ellipse(x + Math.cos(ang) * r * 0.42, y + Math.sin(ang) * r * 0.42, r * 0.36, r * 0.6, ang, 0, Math.PI * 2); c.fill(); c.stroke();
        if (pl.busy) { c.fillStyle = '#ffd34d'; c.fillText('…', x, y - r * 2.3); }
        c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 3;
        const label = isMe ? 'Tú' : cap(pl.name);
        c.strokeText(label, x, y + r * 2); c.fillText(label, x, y + r * 2);
    }
}
