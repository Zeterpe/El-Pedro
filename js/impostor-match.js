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
   · El impostor mata con la Q; quien ve un cuerpo
     avisa con la R, y junto a la mesa del Comedor se
     pide una reunión con la E. La reunión va con
     diálogos, sin prisa: decir algo y votar.
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
/** Un texto para meterlo en HTML. */
const impEsc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** «de Leo», «del robot Chispas». */
const ofWhom = name => name.startsWith('el ') ? 'del ' + name.slice(3) : 'de ' + name;
/** Lo que se dice al negar o cuando no se sabe nada, para que no suene siempre igual. */
const IMP_SAY = {
    deny: ['¡Yo no he sido!', '¡Que no he sido yo!', 'Os equivocáis conmigo.', '¡Eh, que yo no he hecho nada!'],
    nothing: ['Yo no he visto nada.', 'No sé nada, la verdad.', 'Yo no he visto nada raro.'],
    skip: ['Sin pruebas, mejor saltamos el voto.', 'Yo salto el voto: no sabemos nada.'],
};
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
    get playPhases() { return ['ship', 'meeting']; }
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
        this.bodiesSeen = new Set();    // los cuerpos que ya has visto (se dicen una vez)
        this.bodiesNow = [];            // los que ves ahora
        this.myKills = new Set();       // de impostor: a quién has matado tú
        this.deadSaid = new Set();      // los muertos que ya se han dicho en una reunión
        this.impsOut = 0;               // impostores echados (si se dice al echarlos)
        this.killReady = false;         // de impostor: ya puedes matar
        this.inRange = null;            // de impostor: a quién tienes a tu alcance
        this.rangeSaid = {};            // de impostor: cuándo se dijo que cada uno estaba a tu alcance
        this.hudT = 0;
        this.meet = null;               // la reunión: lo que se ha dicho, para el panel
        // En tiempo real, la voz del juego va al momento; el lector de pantalla se queda atrás.
        this.forceVoice = this.settings.impostorVoice !== 'lector';
        this.stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), a: 0.25 + Math.random() * 0.6, r: Math.random() < 0.15 ? 1.6 : 1 }));
    }

    /** Tu papel lo puedes elegir en las opciones de la partida (al azar, si no). */
    makeGame(rules, seed) {
        const wish = { tripulante: 'crew', impostor: 'impostor' }[this.settings.impostorRole] || null;
        return new ImpostorGame({ players: this.seats.map((s, i) => ({ name: s.name, role: i === this.me ? wish : null })), rules, seed });
    }
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
    /** Sin voz, un rato para leer lo que acaba de salir en la pantalla. */
    readPause(text) { return this.visual && !this.stopped ? this.sleep(Math.min(5000, 1000 + text.length * 30) * this.speed) : Promise.resolve(); }
    /** Algo que se pide en la reunión: con voz, se dice; sin voz, se lee en un cuadro. */
    async inform(title, text) {
        if (this.visual) await Dialog.open({ title, text, items: [{ label: 'Volver', value: 'back' }], cancel: 'back' });
        else await this.say(text, { keep: true, interrupt: true });
    }

    // ── Ayudas ────────────────────────────────────────
    get mePl() { return this.game.players[this.me]; }
    get amImpostor() { return this.game.isImpostor(this.me); }
    get alive() { return this.mePl.alive; }
    /** ¿Es otro impostor como tú? Solo lo sabes si tú también lo eres. */
    isMate(p) { return p !== this.me && this.amImpostor && this.game.isImpostor(p); }
    colorOf(p) { return IMP_COLORS[(p - this.me + this.game.n) % this.game.n % IMP_COLORS.length]; }
    /** El nombre de alguien para el narrador: «Leo», «tú». */
    nm(p) { return this.names[p]; }
    Nm(p) { return cap(this.names[p]); }
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
        let t = `Estás en el Comedor de la nave, junto a la mesa, con ${Txt.list(others)}.`;
        if (!this.game.impostorCount() && !this.practice) t += ' En esta partida no hay impostores: entre todos tenéis que hacer las tareas de la nave.';
        if (!this.settings.mono) t += ' Ponte auriculares: lo que suena a tu derecha está a tu derecha, y lo que suena delante está arriba en la pantalla.';
        t += this.hint('keys', this.touch
            ? 'Para andar, toca la nave y arrastra el dedo, o usa la cruceta. El botón Qué hay cerca te dice lo que tienes alrededor, y Guía te lleva adonde quieras.'
            : 'Anda con W, A, S y D, o con las flechas. La F te dice qué hay cerca, la G te guía y la H te dice todas las teclas.');
        if (this.practice) t = 'Partida de práctica, sin impostores y con dos tareas fáciles: sirve para aprender a moverte por la nave. ' + t;
        return t;
    }

    async intro() {
        const n = this.game.impostorCount();
        Board.status(this.visual ? (n ? `${this.title}: haz tus tareas y descubre ${n === 1 ? 'al impostor' : 'a los impostores'}` : `${this.title}: haced entre todos las tareas de la nave`) : '');
        await this.say(`${this.title}. ${this.introText()}`, { keep: true });
        if (this.speech.mode === 'sr' && UI.trapWanted && !Match.voTipDone) {
            Match.voTipDone = true;
            await this.say(UI.VO_TIP);
        }
    }

    /** Lo que eres al empezar: tripulante o impostor, y qué tienes que hacer. */
    roleText(e) {
        const n = e.impostors;
        if (e.role === 'impostor') {
            const mates = e.mates.map(q => this.seats[q].name);
            let t = `Eres ${n === 1 ? 'el impostor' : 'impostor'}${mates.length ? `, con ${Txt.list(mates)}` : ''}. Mata a la tripulación sin que te vean: cuando tengas a alguien a tu alcance, sonarán dos latidos y ${this.press('Q', 'Matar')}. Al principio tienes que esperar unos segundos.`;
            t += ` Para disimular, ve a tus tareas, que son de mentira, y finge que las haces con ${this.touch ? 'el botón Usar' : 'la E'}. Ganas cuando ${n === 1 ? 'quedes tú solo con un tripulante' : 'quedéis tantos impostores como tripulantes'}.`;
            return t;
        }
        return `Eres tripulante. ${n === 1 ? 'Entre vosotros hay un impostor' : `Entre vosotros hay ${n} impostores`}. Haz tus tareas y descubre ${n === 1 ? 'quién es' : 'quiénes son'}. Si ves un cuerpo, acércate y ${this.press('R', 'Avisar')} para llamar a todos a una reunión; también puedes pedirla tú desde la mesa del Comedor.`;
    }

    // ── La mesa ───────────────────────────────────────
    actionsDef() {
        return [
            { kind: 'use', label: 'Usar', key: 'E', cls: 'main' },
            { kind: 'kill', label: 'Matar', key: 'Q', cls: 'main imp-kill' },
            { kind: 'report', label: 'Avisar', key: 'R', cls: 'main imp-report' },
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
        if (kind === 'kill') return this.killKey();
        if (kind === 'report') return this.report();
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
                    <span id="imp-role" class="imp-role"></span>
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
                <div id="imp-meet" class="imp-meet" aria-hidden="true" hidden>
                    <h3 id="imp-meet-title"></h3>
                    <div id="imp-meet-crew" class="imp-meet-crew"></div>
                    <ol id="imp-meet-log" class="imp-meet-log"></ol>
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
        const ship = g.phase === 'ship', me = this.mePl;
        Board.showAct('use', ship, this.useLabel());
        Board.showAct('kill', ship && this.amImpostor && me.alive, this.killLabel());
        this.reportBtn();
        const { done, total } = this.bar;
        $('imp-bar-fill').style.width = total ? `${done / total * 100}%` : '0';
        $('imp-bar-text').textContent = `Tareas de la tripulación: ${done} de ${total}`;
        $('imp-area').textContent = cap(this.areaName(me.area));
        this.renderRole();
    }

    /** Lo que eres, en la pantalla: tripulante, impostor (con la espera para matar) o fantasma. */
    /** El botón de avisar: se enciende cuando tienes un cuerpo al lado. */
    reportBtn() {
        const g = this.game, near = g.phase === 'ship' && !!g.bodyHere(this.me);
        Board.showAct('report', g.phase === 'ship' && this.alive && g.impostorCount() > 0, near ? 'Avisar del cuerpo' : 'Avisar');
        $('act-report')?.classList.toggle('ready', near);
    }

    renderRole() {
        const el = $('imp-role'), me = this.mePl;
        if (!el) return;
        let t = '';
        if (!me.alive) t = 'Fantasma';
        else if (this.amImpostor) t = me.killCd > 0 ? `Impostor · matar en ${Math.ceil(me.killCd)} s` : 'Impostor · puedes matar';
        else if (this.game.impostorCount()) t = 'Tripulante';
        el.textContent = t;
        el.dataset.role = !me.alive ? 'ghost' : this.amImpostor ? 'impostor' : 'crew';
        el.hidden = !t;
    }

    useLabel() {
        const g = this.game;
        if (this.task) return this.task.fake ? 'Dejar de fingir' : 'Seguir la tarea';
        const t = g.phase === 'ship' ? g.taskHere(this.me) : null;
        if (t) return `${this.amImpostor ? 'Fingir' : 'Usar'}: ${IMPOSTOR_TASKS[t.type].short}`;
        if (g.phase === 'ship' && this.alive && g.impostorCount() && g.atButton(this.me)) return 'Botón de emergencia';
        return 'Usar';
    }

    killLabel() {
        const me = this.mePl;
        if (me.killCd > 0) return `Matar (${Math.ceil(me.killCd)} s)`;
        const t = this.game.killTargets(this.me)[0];
        return t != null ? `Matar ${toWhom(this.seats[t].name)}` : 'Matar';
    }

    statusIdle() {
        if (this.guide) return `Guía: te llevo ${this.guide.to}`;
        if (!this.alive) return 'Eres un fantasma: nadie te ve ni te oye';
        return this.touch ? 'Toca la nave y arrastra para andar' : 'Anda con W, A, S y D o las flechas · F: qué hay cerca · G: guía';
    }

    // ── El tiempo real ────────────────────────────────
    async phaseStep(phase) {
        if (phase === 'ship') { await this.realtime(); return true; }
        if (phase === 'meeting') { await this.meetingStep(); return true; }
        return false;
    }

    /** La partida corre sola: cada fotograma avanza el tiempo, suenan las cosas y se dibuja la nave. */
    realtime() {
        if (!this.scene) this.createScene();
        this.scene?.setActive(true);
        this.frozen = false;
        Board.status(this.statusIdle());
        Board.render(this);
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
                    // La espera para matar, en la pantalla, cada cuarto de segundo.
                    if ((this.hudT -= dt) <= 0) { this.hudT = 0.25; this.renderRole(); this.reportBtn(); if (this.amImpostor && this.alive) Board.showAct('kill', this.game.phase === 'ship', this.killLabel()); }
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
            // A los fantasmas no los oyen los vivos.
            if (!pl.alive && me.alive && pl !== me) continue;
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
        this.bodyCues(g.perceive(this.me).bodies);
        this.killCues();
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

    /** Los cuerpos que tienes a la vista: suenan como un monitor plano, y el primero que ves se dice. */
    bodyCues(seen) {
        const g = this.game, sc = this.scene, me = this.mePl;
        this.bodiesNow = seen;
        for (const b of g.bodies) {
            const id = 'body:' + b.p;
            if (sc?.ok && !sc.loops.has(id)) sc.loop(id, b.x, b.y, bodyDrone, { ref: 1.5 });
            sc?.setLoop(id, { x: b.x, y: b.y, level: seen.includes(b.p) ? 0.9 : 0, wall: false });
        }
        for (const p of seen) {
            if (this.bodiesSeen.has(p)) continue;
            this.bodiesSeen.add(p);
            const b = g.bodies.find(x => x.p === p);
            if (!b || this.myKills.has(p)) continue;
            this.ripple(b.x, b.y, 'body');
            if (!me.alive) { this.tell(`${p === this.me ? 'Tu cuerpo' : `El cuerpo ${ofWhom(this.seats[p].name)}`}, ${this.rel(b.x, b.y)}.`); continue; }
            this.tell(`¡Un cuerpo! Es ${this.seats[p].name}, ${this.rel(b.x, b.y)}.${this.hint('report', `Acércate y ${this.press('R', 'Avisar')} para llamar a todos a una reunión.`)}`, { keep: true });
            Board.status(`Un cuerpo: ${this.press('R', 'Avisar')}`);
            Board.render(this);
        }
    }

    /** Siendo impostor: cuándo puedes matar y a quién tienes a tu alcance. */
    killCues() {
        const g = this.game, me = this.mePl;
        if (!this.amImpostor || !me.alive) return;
        const ready = me.killCd <= 0;
        if (ready && !this.killReady) {
            this.scene?.here(ShipSounds.knife());
            if (!this.task && !this.speech.busy) this.notice('Ya puedes matar.');
        }
        this.killReady = ready;
        const t = ready ? g.killTargets(this.me)[0] ?? null : null;
        if (t === this.inRange) return;
        this.inRange = t;
        Board.render(this);
        if (t == null) return;
        this.scene?.here(ShipSounds.target());
        // En un corro, el alcance salta de uno a otro: cada nombre se dice como mucho cada 8 segundos.
        const last = this.rangeSaid[t] ?? -99;
        this.rangeSaid[t] = this.clock;
        if (this.task || this.clock - last < 8) return;
        this.tell(`${cap(this.seats[t].name)}, a tu alcance.${this.hint('kill', `${cap(this.press('Q', 'Matar'))} para matar.`)}`, { interrupt: !this.speech.busy });
    }

    appeared(p) {
        const pl = this.game.players[p], me = this.mePl;
        this.scene?.at(pl.x, pl.y, ShipSounds.appear());
        // Se dice quién aparece si hace rato que no lo veías, y no mientras haces una tarea.
        if (!this.settings.impostorNames || this.visual || this.task) return;
        if (this.clock - (this.lastSeen[p] ?? -99) < 12 || this.speech.busy) return;
        this.say(`${cap(this.names[p])}${pl.alive ? '' : ', su fantasma'}${this.isMate(p) ? ', impostor como tú' : ''}, ${impDir(pl.x - me.x, pl.y - me.y)}.`);
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
        const me = this.me, g = this.game;
        switch (e.type) {
            case 'role':
                if (e.p !== me || !e.impostors) break;
                this.flat(e.role === 'impostor' ? ShipSounds.roleImpostor() : ShipSounds.roleCrew());
                Board.banner(e.role === 'impostor' ? (e.impostors === 1 ? 'Eres el impostor' : 'Eres impostor') : 'Eres tripulante',
                    e.role === 'impostor' ? (e.mates.length ? `Con ${Txt.list(e.mates.map(q => this.seats[q].name))}` : 'Que no te pillen') : (e.impostors === 1 ? 'Hay un impostor a bordo' : `Hay ${e.impostors} impostores a bordo`));
                this.renderRole();
                await this.say(this.roleText(e), { keep: true });
                break;
            case 'tasks':
                if (e.p === me) {
                    Board.render(this);
                    const list = g.pending(me).map(t => `${this.taskName(t)}, ${inPlace(this.areaName(t.spot.area))}`);
                    const what = e.fake ? 'Tus tareas de mentira, para disimular' : 'Tus tareas';
                    await this.say(`${what}: ${impList(list)}.${this.hint('guide', `${cap(this.press('G', 'Guía'))} y la guía te lleva a la que quieras.`)}`, { keep: true });
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
                if (e.p === me) this.openTask(e.i, e.task, e.fake);
                else this.otherSound(e.p, ShipSounds.beep());
                break;
            case 'taskStop':
                if (e.p === me) this.closeTask();
                break;
            case 'taskDone':
                if (e.p === me) {
                    this.closeTask();
                    this.scene?.here(ShipSounds.done());
                    const left = g.pending(me).length;
                    this.tell(left ? `Tarea hecha. Te ${left === 1 ? 'queda 1' : `quedan ${left}`}.${this.hint('next', `${cap(this.press('G', 'Guía'))} para ir a la siguiente.`)}` : g.phase === 'ship' ? `¡Has hecho todas tus tareas! ${g.impostorCount() ? 'Ahora, a vigilar: pasea por la nave y fíjate en quién va con quién.' : 'Pasea por la nave mientras los demás acaban las suyas.'}` : '', { keep: true });
                } else this.otherSound(e.p, ShipSounds.clink());
                break;
            case 'kill': this.presentKill(e); break;
            case 'meeting':
                this.bodiesNow = [];
                this.closeTask();
                this.releaseKeys();
                this.silenceBodies();
                this.flat(ShipSounds.alarm());
                Board.banner(e.kind === 'body' ? '¡Un cuerpo!' : '¡Reunión de emergencia!', e.kind === 'body' ? `${e.body === me ? 'Tu cuerpo' : cap(this.seats[e.body].name)}, ${inPlace(this.areaName(e.area))}` : (e.by === me ? 'La pides tú' : `La pide ${this.seats[e.by].name}`));
                break;
            case 'say': this.meetLog(e.p, this.lineText(e.p, e.line)); break;
            case 'vote':
                this.flat(ShipSounds.vote());
                if (this.meet) this.meet.voted.add(e.p);
                this.renderMeeting();
                break;
            case 'voteResult': await this.presentVotes(e); break;
            case 'eject': await this.presentEject(e); break;
            case 'resume':
                this.showMeeting(false);
                this.bodiesSeen.clear();
                this.inRange = null;
                Board.render(this);
                await this.say(`Volvéis a la nave, al Comedor.${this.alive ? this.hint('resume', this.amImpostor ? 'Disimula y vuelve a cazar: tienes que esperar otra vez para matar.' : 'Seguid con las tareas y fijaos en quién va con quién.') : ''}`, { keep: true });
                break;
            case 'gameOver':
                this.closeTask();
                this.guide = null;
                this.showMeeting(false);
                this.silenceBodies();
                if (e.side === 'impostors') Board.banner('¡Ganan los impostores!', Txt.list(e.impostors.map(q => q === me ? 'tú' : this.seats[q].name)));
                else Board.banner(e.reason === 'tasks' ? '¡Nave arreglada!' : '¡Impostores fuera!', e.reason === 'tasks' ? 'La tripulación ha hecho todas las tareas' : 'Gana la tripulación');
                if (g.winners.includes(me)) Board.confetti();
                break;
        }
    }

    /** Un sonido sin sitio (los avisos de la reunión), aunque la nave esté callada. */
    flat(play) {
        const a = this.audio;
        if (!a.ctx) return;
        a.resume();
        try { play(a.synth, a.bus, a.ctx.currentTime + 0.01); } catch (_) { /* sin sonido */ }
    }

    silenceBodies() {
        const sc = this.scene;
        if (!sc?.ok) return;
        for (const id of sc.loops.keys()) if (id.startsWith('body:')) sc.setLoop(id, { level: 0 });
    }

    /** Una muerte: si te matan, si matas tú, si lo ves o si solo lo oyes. */
    presentKill(e) {
        const g = this.game, me = this.me, sc = this.scene;
        const victim = this.seats[e.target].name, killer = this.seats[e.p].name;
        if (e.target === me) {
            this.closeTask();
            this.setGuide(null);
            sc?.here(ShipSounds.kill());
            setTimeout(() => this.scene?.here(ShipSounds.ghost()), 500);
            Board.banner('Te han matado', `Ha sido ${killer}`);
            this.tell(`¡${cap(killer)} te ha matado! Ahora eres un fantasma: nadie te ve ni te oye, y no puedes avisar ni votar.${this.amImpostor ? '' : ' Pero puedes acabar tus tareas para ayudar a la tripulación.'}`, { keep: true });
            Board.status(this.statusIdle());
            Board.render(this);
            return;
        }
        if (e.p === me) {
            this.myKills.add(e.target);
            this.killReady = false;
            this.inRange = null;
            sc?.here(ShipSounds.kill());
            const seen = e.witnesses.length ? ` Cuidado: te ${e.witnesses.length === 1 ? `ha visto ${this.seats[e.witnesses[0]].name}` : `han visto ${Txt.list(e.witnesses.map(q => this.seats[q].name))}`}.` : '';
            this.tell(`Has matado ${toWhom(victim)}.${seen}${this.hint('fled', 'Aléjate antes de que alguien encuentre el cuerpo, o avisa tú mismo con la R para disimular.')}`, { keep: true });
            Board.render(this);
            return;
        }
        const pl = this.mePl, d = Math.hypot(e.x - pl.x, e.y - pl.y);
        if (e.witnesses.includes(me) || (!pl.alive && d <= g.visionOf(me) && shipSight(pl.x, pl.y, e.x, e.y))) {
            sc?.at(e.x, e.y, ShipSounds.kill());
            this.bodiesSeen.add(e.target);
            const mate = this.isMate(e.p) ? ', tu compañero impostor,' : '';
            this.tell(`¡${cap(killer)}${mate} ha matado ${toWhom(victim)}, ${this.rel(e.x, e.y)}!${pl.alive && !this.amImpostor ? this.hint('witness', `${cap(this.press('R', 'Avisar'))} para avisar a todos.`) : ''}`, { keep: true });
            Board.render(this);
        } else if (d <= g.hearing) {
            // Solo se oye el golpe, desde donde pasa (amortiguado si hay pared).
            sc?.at(e.x, e.y, ShipSounds.kill(), { wall: !shipSight(pl.x, pl.y, e.x, e.y) });
            this.ripple(e.x, e.y, 'bump');
        }
    }

    /** Un sonido en el sitio de otro jugador, si lo tienes a la vista o al oído. */
    otherSound(p, play) {
        const g = this.game, pl = g.players[p], me = this.mePl, d = Math.hypot(pl.x - me.x, pl.y - me.y);
        if (d > g.hearing) return;
        this.scene?.at(pl.x, pl.y, play, { wall: !shipSight(me.x, me.y, pl.x, pl.y) });
    }

    gameOverText(won) {
        const g = this.game, r = g.result || {}, imps = g.impostors(), me = this.me;
        if (!imps.length) return 'La tripulación ha hecho todas las tareas de la nave. ¡Habéis ganado!';
        const who = imps.length === 1 ? (imps[0] === me ? 'El impostor eras tú.' : `El impostor era ${this.seats[imps[0]].name}.`)
            : `Los impostores eran ${Txt.list(imps.map(p => this.v.name(p)))}.`;
        let t;
        if (r.side === 'impostors') t = `Ganan los impostores: ya son tantos como los tripulantes que quedan. ${who}`;
        else t = `${r.reason === 'tasks' ? '¡La tripulación ha hecho todas las tareas!' : imps.length === 1 ? '¡Habéis echado al impostor!' : '¡Habéis echado a todos los impostores!'} ${who}`;
        return `${t} ${won ? (g.winners.length > 1 ? '¡Habéis ganado!' : '¡Has ganado!') : 'Has perdido.'}`;
    }
    resultText() {
        const g = this.game, { done, total } = g.taskBar();
        const parts = [`Tareas hechas: ${done} de ${total}.`];
        if (this.amImpostor) parts.push(this.myKills.size ? `Has matado a ${this.myKills.size}.` : 'No has matado a nadie.');
        else parts.push(`Tú has hecho ${this.mePl.tasks.filter(t => t.done).length}.`);
        if (g.meetings) parts.push(`Reuniones: ${g.meetings}.`);
        return parts.join(' ');
    }

    // ── La reunión ────────────────────────────────────
    /**
     * La reunión, con calma: se dice quién la ha pedido y quién ha muerto; habla cada compañero de la máquina
     * (y contestan si les acusan); después hablas y votas tú, con diálogos, y por último votan ellos.
     */
    async meetingStep() {
        const g = this.game, M = g.meeting;
        if (!M) return;
        this.meet = { title: '', log: [], last: {}, voted: new Set(), counts: null };
        this.showMeeting(true);
        const opening = this.meetingOpening(M);
        Board.status(this.visual ? opening : 'Reunión');
        await this.say(opening, { keep: true, interrupt: true });
        await this.readPause(opening);
        const speakers = [M.by, ...this.uiRng.shuffle(g.living().filter(p => p !== M.by))].filter(p => this.bots[p] && g.players[p].alive);
        for (const p of speakers) {
            if (this.stopped || g.phase !== 'meeting') return;
            await this.botTalk(p, this.bots[p].meetingLines(M));
        }
        if (this.stopped || g.phase !== 'meeting') return;
        if (this.alive) await this.humanMeeting();
        else await this.say('Como estás muerto, oyes la reunión, pero no puedes hablar ni votar.', { keep: true });
        // Votan los de la máquina, uno a uno.
        for (const p of this.uiRng.shuffle(g.living().filter(q => this.bots[q]))) {
            if (this.stopped || g.phase !== 'meeting') return;
            await this.sleep(450);
            await this.act({ type: 'vote', p, target: this.bots[p].vote(M) });
        }
        // Por si alguien se ha quedado sin votar (no debería): salta el voto.
        while (!this.stopped && g.phase === 'meeting') {
            const q = g.living().find(x => !g.meeting.votes.has(x));
            if (q == null) break;
            await this.act({ type: 'vote', p: q, target: -1 });
        }
    }

    meetingOpening(M) {
        const g = this.game, me = this.me;
        let t;
        if (M.kind === 'body') {
            const whose = M.body === me ? 'tu cuerpo' : `el cuerpo ${ofWhom(this.seats[M.body].name)}`;
            t = M.by === me ? `¡Reunión! Has avisado: ${whose}, ${inPlace(this.areaName(M.area))}.` : `¡Reunión! ${cap(this.seats[M.by].name)} ha encontrado ${whose} ${inPlace(this.areaName(M.area))}.`;
        } else t = M.by === me ? '¡Reunión de emergencia! La has pedido tú.' : `¡Reunión de emergencia! La ha pedido ${this.seats[M.by].name}.`;
        const dead = g.players.filter(pl => !pl.alive && pl.knownDead && !this.deadSaid.has(pl.index) && pl.index !== M.body).map(pl => pl.index);
        for (const pl of g.players) if (!pl.alive && pl.knownDead) this.deadSaid.add(pl.index);
        if (dead.length) t += ` También ${dead.length === 1 && dead[0] !== me ? 'ha' : 'han'} muerto ${Txt.list(dead.map(p => this.v.name(p)))}.`;
        const alive = g.living().length;
        t += this.alive ? ` Quedáis ${alive} en la nave.` : ` Quedan ${alive} en la nave.`;
        this.meet.title = M.kind === 'body' ? `Reunión: ${M.body === me ? 'tu cuerpo' : `el cuerpo ${ofWhom(this.seats[M.body].name)}`}, ${inPlace(this.areaName(M.area))}` : 'Reunión de emergencia';
        this.renderMeeting();
        return t;
    }

    /** Lo que dice alguien en la reunión, como una frase. Los de la máquina te hablan de tú. */
    lineText(p, l) {
        const me = this.me, aboutMe = l.who === me, w = l.who != null ? this.seats[l.who].name : '';
        const area = l.area ? inPlace(this.areaName(l.area)) : '';
        const pick = list => list[(p * 7 + (this.meet?.log.length || 0)) % list.length];
        switch (l.kind) {
            case 'where': return `Yo estaba ${area}.`;
            case 'saw': return aboutMe ? `Te vi ${area} hace poco.` : `Vi ${toWhom(w)} ${area} hace poco.`;
            case 'kill': return aboutMe ? '¡Te he visto matar!' : `¡He visto ${toWhom(w)} matar!`;
            case 'with': return aboutMe ? 'Tú estabas conmigo.' : `${cap(w)} estaba conmigo.`;
            case 'sus': return aboutMe ? 'Sospecho de ti.' : `Sospecho ${ofWhom(w)}.`;
            case 'agree': return aboutMe ? 'Yo también sospecho de ti.' : `Yo también sospecho ${ofWhom(w)}.`;
            case 'lie': return aboutMe ? `Mientes: yo te vi ${area}.` : `${cap(w)} miente: yo le vi ${area}.`;
            case 'deny': return pick(IMP_SAY.deny);
            case 'nothing': return pick(IMP_SAY.nothing);
            case 'skip': return pick(IMP_SAY.skip);
        }
        return '';
    }

    /** Un compañero de la máquina dice sus frases, con su voz; quien sale nombrado puede contestar. */
    async botTalk(p, lines, depth = 0) {
        const g = this.game, M = g.meeting, said = [];
        for (const line of lines) {
            const res = g.act({ type: 'say', p, line });
            if (!res.ok) continue;
            await this.apply(res);
            said.push(line);
        }
        if (!said.length || this.stopped) return;
        const b = this.bots[p], text = `${cap(this.seats[p].name)}: ${said.map(l => this.lineText(p, l)).join(' ')}`;
        if (this.meet) { this.meet.talking = p; this.renderMeeting(); }
        await this.say(text, { pitch: b?.char.pitch ?? 1, rate: b?.char.rate ?? 1, keep: true });
        await this.readPause(text);
        if (this.meet) { this.meet.talking = null; this.renderMeeting(); }
        if (depth > 2) return;
        for (const line of said) {
            if (line.who == null) continue;
            for (const q of g.living()) {
                if (q === p || !this.bots[q] || g.phase !== 'meeting') continue;
                const reply = this.bots[q].react(p, line, M);
                if (reply.length) await this.botTalk(q, reply, depth + 1);
            }
        }
    }

    /** Te toca: decir algo, volver a oír lo dicho o votar. */
    async humanMeeting() {
        const g = this.game, M = g.meeting;
        let first = true;
        while (!this.stopped && g.phase === 'meeting') {
            const said = M.said.filter(x => x.p === this.me).length;
            Board.status('Reunión: di algo o vota');
            const r = await Dialog.open({
                title: 'Reunión',
                text: first ? 'Te toca. Di lo que sepas, o vota cuando lo tengas claro.' : '',
                items: [
                    { label: 'Votar', value: 'vote' },
                    { label: said >= IMPOSTOR_SAY_MAX ? 'Decir algo (ya has dicho bastante)' : 'Decir algo', value: 'say', disabled: said >= IMPOSTOR_SAY_MAX },
                    { label: this.visual ? 'Leer lo que se ha dicho' : 'Oír otra vez lo que se ha dicho', value: 'log' },
                    { label: 'Quién queda en la nave', value: 'alive' },
                ],
                cancel: 'pause',
            });
            first = false;
            if (this.stopped || g.phase !== 'meeting') return;
            if (r === 'pause') { await this.pause(); continue; }
            if (r === 'log') { await this.inform('Lo que se ha dicho', this.meetingLogText()); continue; }
            if (r === 'alive') { await this.inform('Quién queda en la nave', this.aliveText()); continue; }
            if (r === 'say') { const line = await this.pickLine(); if (line) await this.humanTalk(line); continue; }
            if (r === 'vote') {
                const t = await this.pickVote();
                if (t === undefined) continue;
                await this.act({ type: 'vote', p: this.me, target: t });
                await this.say(t === -1 ? 'Saltas el voto.' : `Votas ${toWhom(this.seats[t].name)}.`, { interrupt: true });
                return;
            }
        }
    }

    /** Qué quieres decir: primero el qué y luego de quién o de dónde. */
    async pickLine() {
        const g = this.game, M = g.meeting;
        const kind = await Dialog.open({
            title: 'Decir algo',
            items: [
                { label: 'Dónde estaba yo', value: 'where' },
                { label: 'He visto a alguien matar', value: 'kill' },
                { label: 'Sospecho de alguien', value: 'sus' },
                ...(M.kind === 'body' ? [{ label: `Vi a alguien ${inPlace(this.areaName(M.area))}`, value: 'saw' }] : []),
                { label: 'Alguien estaba conmigo', value: 'with' },
                { label: 'Yo no he sido', value: 'deny' },
                { label: 'No he visto nada', value: 'nothing' },
                { label: 'Mejor saltamos el voto', value: 'skip' },
                { label: 'Volver', value: 'back' },
            ],
            cancel: 'back',
        });
        if (!kind || kind === 'back' || this.stopped) return null;
        if (kind === 'nothing' || kind === 'skip' || kind === 'deny') return { kind };
        if (kind === 'where') {
            const area = await Dialog.open({
                title: '¿Dónde estabas?',
                items: [...SHIP.areas.filter(a => a.kind === 'room').map(a => ({ label: cap(a.name), value: a.id })), { label: 'Volver', value: 'back' }],
                cancel: 'back',
            });
            return area && area !== 'back' ? { kind, area } : null;
        }
        const title = { kill: '¿A quién has visto matar?', sus: '¿De quién sospechas?', saw: `¿A quién viste ${inPlace(this.areaName(M.area))}?`, with: '¿Quién estaba contigo?' }[kind];
        const who = await Dialog.open({
            title,
            items: [...g.living().filter(q => q !== this.me).map(q => ({ label: this.voteLabel(q), value: 'p' + q })), { label: 'Volver', value: 'back' }],
            cancel: 'back',
        });
        if (!who || who === 'back') return null;
        return { kind, who: +who.slice(1), ...(kind === 'saw' ? { area: M.area } : {}) };
    }

    voteLabel(q) { return `${cap(this.seats[q].name)}${this.isMate(q) ? ', impostor como tú' : ''}`; }

    async humanTalk(line) {
        const g = this.game, M = g.meeting;
        const res = g.act({ type: 'say', p: this.me, line });
        if (!res.ok) { this.audio.error(); await this.say(res.error, { interrupt: true }); return; }
        await this.apply(res);
        await this.say(`Dices: ${this.lineText(this.me, line)}`, { keep: true, interrupt: true });
        if (line.who == null) return;
        for (const q of g.living()) {
            if (!this.bots[q] || g.phase !== 'meeting') continue;
            const reply = this.bots[q].react(this.me, line, M);
            if (reply.length) await this.botTalk(q, reply, 1);
        }
    }

    async pickVote() {
        const g = this.game;
        const r = await Dialog.open({
            title: '¿A quién votas?',
            text: 'Quien tenga más votos sale de la nave. Si hay empate, o si gana saltar el voto, no sale nadie.',
            items: [
                ...g.living().filter(q => q !== this.me).map(q => ({ label: this.voteLabel(q), value: 'p' + q })),
                { label: 'Saltar el voto', value: 'skip' },
                { label: 'Volver', value: 'back' },
            ],
            cancel: 'back',
        });
        if (!r || r === 'back' || this.stopped) return undefined;
        return r === 'skip' ? -1 : +r.slice(1);
    }

    /** Lo que se ha dicho en esta reunión, para volver a oírlo. */
    meetingLogText() {
        const log = this.meet?.log || [];
        if (!log.length) return 'Todavía no ha dicho nada nadie.';
        return log.map(x => `${x.p === this.me ? 'Tú' : cap(this.seats[x.p].name)}: ${x.text}`).join(' ');
    }

    aliveText() {
        const g = this.game, alive = g.living(), dead = g.players.filter(pl => !pl.alive && pl.knownDead).map(pl => pl.index);
        let t = `En la nave quedáis ${alive.length}: ${Txt.list(alive.map(p => p === this.me ? 'tú' : this.seats[p].name + (this.isMate(p) ? ', impostor' : '')))}.`;
        if (dead.length) t += ` Han muerto o los han echado: ${Txt.list(dead.map(p => this.v.name(p)))}.`;
        if (this.impsOut) t += ` Ya habéis echado a ${this.impsOut === 1 ? 'un impostor' : `${this.impsOut} impostores`}.`;
        return t;
    }

    /** Las votaciones: cuántos votos tiene cada uno y quién sale. */
    async presentVotes(e) {
        const g = this.game, who = q => q === this.me ? 'tú' : this.seats[q].name;
        const parts = [];
        const by = {};
        for (const [p, t] of e.votes || []) (by[t] = by[t] || []).push(p);
        const order = Object.keys(e.counts).map(Number).sort((a, b) => e.counts[b] - e.counts[a]);
        for (const t of order) {
            const n = e.counts[t];
            parts.push(`${cap(who(t))}, ${n} ${n === 1 ? 'voto' : 'votos'}${by[t] ? `: ${Txt.list(by[t].map(who))}` : ''}.`);
        }
        if (e.skip) parts.push(`${e.skip === 1 ? 'Salta el voto' : `Saltan el voto ${e.skip}`}${by[-1] ? `: ${Txt.list(by[-1].map(who))}` : ''}.`);
        if (e.ejected == null) parts.push(e.tie ? 'Hay empate: no sale nadie.' : 'No sale nadie de la nave.');
        if (this.meet) this.meet.counts = { ...e.counts, skip: e.skip };
        this.renderMeeting();
        const text = `Votos. ${parts.join(' ')}`;
        if (this.visual) Board.status(text);
        await this.say(text, { keep: true });
        await this.readPause(text);
    }

    async presentEject(e) {
        const g = this.game, me = this.me;
        this.deadSaid.add(e.p);
        if (e.impostor) this.impsOut++;
        this.flat(ShipSounds.eject());
        const name = this.seats[e.p].name;
        Board.banner(e.p === me ? 'Te echan de la nave' : `${cap(name)} sale de la nave`, e.impostor == null ? '' : e.impostor ? 'Era impostor' : 'No era impostor');
        let t = e.p === me ? 'Te han echado de la nave.' : `${cap(name)} sale de la nave por la escotilla.`;
        if (e.impostor != null) {
            t += e.p === me ? (e.impostor ? ' Eras impostor, y te han pillado.' : ' Y eras tripulante.') : e.impostor ? ` Era ${g.impostorCount() === 1 ? 'el impostor' : 'impostor'}.` : ' No era impostor.';
            if (e.left) t += ` ${e.left === 1 ? 'Queda un impostor' : `Quedan ${e.left} impostores`}.`;
        } else t += ' Nadie sabe si era impostor.';
        if (e.p === me && g.phase !== 'gameOver') t += ' Ahora eres un fantasma.';
        this.renderMeeting();
        if (this.visual) Board.status(t);
        await this.say(t, { keep: true });
        await this.sleep(400);
        await this.readPause(t);
    }

    meetLog(p, text) {
        if (!this.meet || !text) return;
        this.meet.log.push({ p, text });
        this.meet.last[p] = text;
        this.renderMeeting();
    }

    showMeeting(on) {
        const box = $('imp-meet');
        if (box) box.hidden = !on;
        if (!on) this.meet = null;
        this.renderMeeting();
    }

    /** El panel de la reunión: cada uno con su dibujo, si vive, si ha votado y lo último que ha dicho. */
    renderMeeting() {
        const M = this.meet, box = $('imp-meet');
        if (!M || !box || box.hidden) return;
        const g = this.game;
        $('imp-meet-title').textContent = M.title;
        $('imp-meet-crew').innerHTML = g.players.map(pl => {
            const p = pl.index, dead = !pl.alive, votes = M.counts?.[p];
            return `<div class="imp-card${dead ? ' dead' : ''}${M.talking === p ? ' talking' : ''}${M.voted.has(p) ? ' voted' : ''}${this.isMate(p) || (p === this.me && this.amImpostor) ? ' imp' : ''}">
                <svg viewBox="-12 -20 24 32" aria-hidden="true">${ImpostorArt.crew(0, 0, 8, this.colorOf(p))}${dead ? '<path d="M -7 -7 L 7 7 M 7 -7 L -7 7" stroke="#e05656" stroke-width="2.5" stroke-linecap="round"/>' : ''}</svg>
                <span class="nm">${impEsc(p === this.me ? 'Tú' : cap(pl.name))}</span>
                ${votes ? `<span class="votes">${votes} ${votes === 1 ? 'voto' : 'votos'}</span>` : M.voted.has(p) ? '<span class="st">ha votado</span>' : ''}
                ${M.last[p] ? `<span class="said">${impEsc(M.last[p])}</span>` : ''}
            </div>`;
        }).join('');
        $('imp-meet-log').innerHTML = M.log.slice(-6).map(x => `<li><b>${impEsc(x.p === this.me ? 'Tú' : cap(this.seats[x.p].name))}:</b> ${impEsc(x.text)}</li>`).join('');
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
        if (me.area === SHIP.button.area && g.impostorCount() && me.alive) parts.push('En la mesa está el botón de emergencia.');
        const pend = g.pending(this.me), here = pend.filter(t => t.spot.area === me.area), mine = this.amImpostor ? 'Tu tarea de mentira' : 'Tu tarea';
        if (here.length) parts.push(here.map(t => `${mine} ${this.taskName(t)} está ${this.rel(t.spot.x, t.spot.y)}.`).join(' '));
        else if (pend.length) { const n = this.nearestTask(); parts.push(`${this.amImpostor ? 'Tu tarea de mentira más cercana' : 'Tu tarea más cercana'} es ${this.taskName(n.t)}, ${inPlace(this.areaName(n.t.spot.area))}.`); }
        else parts.push('Ya has hecho todas tus tareas.');
        const { seen, heard, bodies } = g.perceive(this.me);
        for (const p of bodies) { const b = g.bodies.find(x => x.p === p); parts.push(`${p === this.me ? 'Tu cuerpo' : `El cuerpo ${ofWhom(this.seats[p].name)}`} está ${this.rel(b.x, b.y)}.`); }
        if (seen.length) parts.push(`Ves ${impList(seen.map(p => `${toWhom(this.names[p])}${g.players[p].alive ? '' : ', su fantasma'}${this.isMate(p) ? ', impostor como tú' : ''}, ${this.rel(g.players[p].x, g.players[p].y)}`))}.`);
        const steps = new Set(heard.map(p => {
            const pl = g.players[p];
            return `${impDir(pl.x - me.x, pl.y - me.y)}${shipSight(me.x, me.y, pl.x, pl.y) ? ', lejos' : ', al otro lado de la pared'}`;
        }));
        if (steps.size) parts.push(`Oyes pasos ${impList([...steps])}.`);
        if (!seen.length && !heard.length) parts.push('No hay nadie cerca.');
        if (this.amImpostor && me.alive) {
            const t = g.killTargets(this.me)[0];
            parts.push(me.killCd > 0 ? `Para matar, faltan ${Math.ceil(me.killCd)} segundos.` : t != null ? `Puedes matar ${toWhom(this.seats[t].name)}.` : 'Ya puedes matar, pero no tienes a nadie a tu alcance.');
        }
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
        this.tell(`${this.amImpostor ? 'Tus tareas de mentira' : 'Tus tareas'}: ${impList(list)}.`, { keep: true });
    }
    myCards() { this.sayTasks(); }

    info() {
        const g = this.game, { done, total } = g.taskBar(), me = this.mePl, mine = me.tasks, left = mine.filter(t => !t.done).length;
        const parts = [];
        const n = g.impostorCount();
        if (n) {
            const role = !me.alive ? 'Eres un fantasma' : this.amImpostor ? 'Eres impostor' : 'Eres tripulante';
            const mates = this.amImpostor ? g.impostors().filter(q => q !== this.me) : [];
            parts.push(`${role}${mates.length ? `, con ${Txt.list(mates.map(q => this.seats[q].name))}` : ''}. ${n === 1 ? 'Hay un impostor' : `Hay ${n} impostores`}${this.impsOut ? `, y ya habéis echado a ${this.impsOut}` : ''}.`);
        }
        parts.push(`La tripulación lleva ${done} tareas de ${total}, el ${total ? Math.round(done / total * 100) : 0} por ciento.`);
        if (!this.amImpostor) parts.push(left ? `A ti te quedan ${left} de ${mine.length}.` : 'Tú ya has hecho todas las tuyas.');
        else if (me.alive) parts.push(me.killCd > 0 ? `Para matar, faltan ${Math.ceil(me.killCd)} segundos.` : 'Ya puedes matar.');
        if (n && me.alive) {
            const w = g.buttonWait();
            parts.push(me.meetingsLeft ? `Te ${me.meetingsLeft === 1 ? 'queda una reunión de emergencia' : `quedan ${me.meetingsLeft} reuniones de emergencia`}${w > 0 ? `, y el botón estará listo dentro de ${Math.ceil(w)} segundos` : ''}.` : 'Ya no te quedan reuniones de emergencia.');
        }
        const a = SHIP.byId[me.area];
        if (a) parts.push(`Estás ${inPlace(a.name)}.`);
        const dead = g.players.filter(pl => !pl.alive && pl.knownDead).map(pl => pl.index);
        parts.push(`En la nave estáis ${g.n}: ${Txt.list(this.names)}.${dead.length ? ` Se sabe que han muerto o que los han echado: ${Txt.list(dead.map(p => this.v.name(p)))}.` : ''}`);
        this.tell(parts.join(' '), { keep: true });
    }

    keysHelp() {
        const t = [
            'W, A, S y D, o las flechas: andar. W va hacia delante, que es arriba en la pantalla; S, hacia detrás; A, a la izquierda, y D, a la derecha. Lo que suena a tu derecha está a tu derecha.',
            'E o Enter: usar la tarea que tienes al lado. Junto a la mesa del Comedor, pedir una reunión de emergencia.',
            'R: avisar de un cuerpo que tienes cerca. Q, si eres impostor: matar a quien tienes a tu alcance.',
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
        if (this.game.phase !== 'ship') return;
        if (this.task?.fake) this.act({ type: 'cancelTask', p: this.me });
        else if (this.task) { this.busyNotice(); return; }
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

    // ── Usar, matar y avisar ──────────────────────────
    use() {
        if (this.task) { if (this.task.fake) this.cancelPick(); else this.taskKey('Enter'); return; }
        const g = this.game;
        if (g.phase !== 'ship') { this.explainCant(); return; }
        const t = g.taskHere(this.me);
        if (t) { this.act({ type: 'startTask', p: this.me, i: t.i }); return; }
        if (this.alive && g.impostorCount() && g.atButton(this.me)) { this.emergency(); return; }
        this.audio.error();
        const n = this.nearestTask();
        if (!n) { this.tell(`Ya has hecho todas tus tareas. ${g.impostorCount() ? 'Vigila quién va con quién.' : 'Pasea por la nave mientras los demás acaban las suyas.'}`); return; }
        this.tell(`Aquí no hay ninguna tarea tuya. La más cercana es ${this.taskName(n.t)}, ${inPlace(this.areaName(n.t.spot.area))}, ${impDist(n.d)}.${this.hint('guideTip', `${cap(this.press('G', 'Guía'))} para que te guíe.`)}`);
    }

    /** El botón de emergencia, en la mesa del Comedor: antes de llamar a todos, se pregunta. */
    async emergency() {
        const g = this.game, me = this.mePl;
        if (Dialog.active) return;
        if (!me.meetingsLeft) { this.audio.error(); this.tell('Ya no te quedan reuniones de emergencia.'); return; }
        const w = g.buttonWait();
        if (w > 0) { this.audio.error(); this.tell(`El botón de emergencia estará listo dentro de ${Math.ceil(w)} segundos.`); return; }
        const r = await Dialog.open({
            title: 'El botón de emergencia',
            text: `¿Llamas a todos a una reunión? ${me.meetingsLeft === 1 ? 'Solo puedes hacerlo una vez.' : `Te quedan ${me.meetingsLeft}.`}`,
            items: [{ label: 'Sí, pedir una reunión', value: 'yes' }, { label: 'No, seguir', value: 'no' }],
            cancel: 'no',
        });
        if (r === 'yes' && !this.stopped && g.phase === 'ship') this.act({ type: 'button', p: this.me });
    }

    /** Q: matar a quien tienes a tu alcance (siendo impostor). */
    killKey() {
        const g = this.game, me = this.mePl;
        if (g.phase !== 'ship') { this.explainCant(); return; }
        if (!this.amImpostor) { this.audio.error(); this.tell(g.impostorCount() ? 'Solo los impostores pueden matar. Tú eres tripulante.' : 'En esta partida no hay impostores.'); return; }
        if (!me.alive) { this.audio.error(); this.tell('Los fantasmas no pueden matar.'); return; }
        if (me.killCd > 0) { this.audio.error(); this.tell(`Todavía no: faltan ${Math.ceil(me.killCd)} segundos.`); return; }
        const t = g.killTargets(this.me)[0];
        if (t == null) { this.audio.error(); this.tell('No tienes a nadie a tu alcance. Acércate más.'); return; }
        if (this.task) this.act({ type: 'cancelTask', p: this.me });
        this.act({ type: 'kill', p: this.me, target: t });
    }

    /** R: avisar de un cuerpo. */
    report() {
        const g = this.game, me = this.mePl;
        if (g.phase !== 'ship') { this.explainCant(); return; }
        if (!g.impostorCount()) { this.audio.error(); this.tell('En esta partida no hay impostores, así que no hay cuerpos.'); return; }
        if (!me.alive) { this.audio.error(); this.tell('Los fantasmas no pueden avisar.'); return; }
        const b = g.bodyHere(this.me);
        if (b) { this.act({ type: 'report', p: this.me }); return; }
        this.audio.error();
        const seen = g.perceive(this.me).bodies;
        if (seen.length) { const c = g.bodies.find(x => x.p === seen[0]); this.tell(`Acércate más al cuerpo: está ${this.rel(c.x, c.y)}.`); return; }
        this.tell(`No ves ningún cuerpo. Para pedir una reunión sin cuerpo, ve a la mesa del Comedor y ${this.press('E', 'Usar')}.`);
    }

    openTask(i, type, fake = false) {
        this.releaseKeys();
        const T = this.task = { i, type, fake, easy: !!this.game.rules.easyTasks };
        $('imp-task').hidden = false;
        if (fake) {
            $('imp-task-title').textContent = `Finges: ${IMPOSTOR_TASKS[type].name.toLowerCase()}`;
            Board.status(`Finges ${IMPOSTOR_TASKS[type].short}`);
            this.taskUI({ text: 'Quien te vea pensará que haces la tarea. Para irte, anda o pulsa Escape.', art: '', buttons: [] });
            this.tell(`Finges que haces ${IMPOSTOR_TASKS[type].short}. Para irte, anda.`);
            Board.render(this);
            return;
        }
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
        const fake = this.task.fake;
        this.act({ type: 'cancelTask', p: this.me });
        this.tell(fake ? 'Dejas de fingir.' : 'Dejas la tarea. Puedes volver cuando quieras.');
        return true;
    }

    taskKey(k) {
        const T = this.task;
        if (!T || T.finished || T.fake) return;
        this[T.type + 'Key'](T, k === 'e' ? 'Enter' : k);
    }

    taskTick(dt) {
        const T = this.task;
        if (T && !T.finished && !T.fake && this[T.type + 'Tick']) this[T.type + 'Tick'](T, dt);
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
            if (this.game.phase !== 'ship') return true;
            // Al andar, el impostor deja de fingir la tarea.
            if (this.task?.fake) { this.act({ type: 'cancelTask', p: this.me }); }
            else if (this.task) { this.busyNotice(); return true; }
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
        if (k === 'q') { e.preventDefault(); this.killKey(); return true; }
        if (k === 'r') { e.preventDefault(); this.report(); return true; }
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
            c.strokeStyle = r.kind === 'ping' ? `rgba(69,201,201,${0.9 * (1 - age)})` : r.kind === 'bump' ? `rgba(255,140,120,${0.8 * (1 - age)})`
                : r.kind === 'body' ? `rgba(240,70,70,${0.9 * (1 - age)})` : `rgba(255,255,255,${0.45 * (1 - age)})`;
            c.lineWidth = 2;
            c.beginPath(); c.arc(X(r.x), Y(r.y), S * (0.2 + age * (r.kind === 'step' ? 1.2 : 0.8)), 0, Math.PI * 2); c.stroke();
        }
        // El botón de emergencia, en el centro de la mesa del comedor.
        const B = SHIP.button;
        c.fillStyle = '#c0392b'; c.strokeStyle = '#ffd7d0'; c.lineWidth = Math.max(1.5, S * 0.06);
        c.beginPath(); c.arc(X(B.x), Y(B.y), S * 0.32, 0, Math.PI * 2); c.fill(); c.stroke();
        // Los cuerpos que ves.
        c.font = `700 ${Math.round(S * 0.38)}px system-ui, sans-serif`;
        for (const p of this.bodiesNow) {
            const b = g.bodies.find(x => x.p === p);
            if (b) this.drawBody(c, X(b.x), Y(b.y), S, p);
        }
        // Los tripulantes que ves, y tú. Los fantasmas, medio transparentes.
        for (const pl of g.players) {
            if (pl.index !== this.me && !this.seenNow.has(pl.index)) continue;
            c.globalAlpha = pl.alive ? 1 : 0.45;
            this.drawCrew(c, X(pl.x), Y(pl.y), S, pl, pl.index === this.me);
            c.globalAlpha = 1;
        }
        // Siendo impostor, un aro rojo en quien tienes a tu alcance.
        const tg = this.inRange != null ? g.players[this.inRange] : null;
        if (tg && this.seenNow.has(tg.index)) {
            c.strokeStyle = `rgba(240,70,70,${0.6 + 0.3 * Math.sin(now * 8)})`; c.lineWidth = 3;
            c.beginPath(); c.arc(X(tg.x), Y(tg.y), S * 0.62, 0, Math.PI * 2); c.stroke();
        }
        // La niebla: más allá de lo que ves, se ve oscuro.
        const vis = g.visionOf(this.me);
        const fog = c.createRadialGradient(w / 2, h / 2, vis * S * 0.75, w / 2, h / 2, vis * S * 1.15);
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

    /** Un cuerpo: medio tripulante tumbado, de su color, con un hueso y una cruz roja. */
    drawBody(c, x, y, S, p) {
        const r = S * 0.38;
        c.fillStyle = this.colorOf(p); c.strokeStyle = '#0b1020'; c.lineWidth = Math.max(1.5, r * 0.18);
        c.beginPath(); c.ellipse(x, y + r * 0.2, r * 1.15, r * 0.6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#f2efe6';
        c.beginPath(); c.arc(x + r * 0.9, y - r * 0.15, r * 0.24, 0, Math.PI * 2); c.arc(x + r * 0.9, y + r * 0.25, r * 0.24, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#e05656'; c.lineWidth = Math.max(2, r * 0.22); c.lineCap = 'round';
        c.beginPath(); c.moveTo(x - r * 0.5, y - r * 0.3); c.lineTo(x + r * 0.2, y + r * 0.6); c.moveTo(x + r * 0.2, y - r * 0.3); c.lineTo(x - r * 0.5, y + r * 0.6); c.stroke();
        c.fillStyle = '#ffb3b3'; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 3;
        const label = p === this.me ? 'Tú' : cap(this.seats[p].name);
        c.strokeText(label, x, y + r * 2); c.fillText(label, x, y + r * 2);
    }

    drawCrew(c, x, y, S, pl, isMe) {
        const r = S * 0.32, col = this.colorOf(pl.index);
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
        // Los impostores ven en rojo el nombre de sus compañeros.
        c.fillStyle = this.isMate(pl.index) ? '#ff8a8a' : '#fff'; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 3;
        const label = isMe ? 'Tú' : cap(pl.name);
        c.strokeText(label, x, y + r * 2); c.fillText(label, x, y + r * 2);
    }
}
