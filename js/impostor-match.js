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
   · El impostor sabotea con la X (las luces, el
     reactor o las puertas de una sala) y va por los
     conductos con la V. Los sabotajes se arreglan con
     la E en su panel, y las consolas (el mapa, las
     cámaras y las constantes vitales) se miran con la E.
   ImpostorArt dibuja la ficha del salón.
   ============================================= */
'use strict';

/** El color de cada tripulante (tú eres el primero). */
const IMP_COLORS = ['#f2c94c', '#4f8fe0', '#e05656', '#5cc46a', '#b071e0', '#f08a3c', '#45c9c9', '#f07fbf', '#c9c9c9', '#a8743f'];
/** El suelo de cada sala, en la pantalla. */
const IMP_FLOOR = {
    motores: '#3a3f52', comedor: '#4a3e5e', puente: '#2c4a60', electricidad: '#4c4930', almacen: '#3c4a3a', enfermeria: '#523c48',
    comunicaciones: '#2e4a50', oxigeno: '#2f5040', reactor: '#55343a', seguridad: '#3c3a58', administracion: '#4a4636',
};
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
const IMP_SPARKS = {
    comedor: ['clink', 3, 7], puente: ['beep', 1.5, 4], enfermeria: ['monitor', 1.1, 1.1], electricidad: ['crackle', 2, 5],
    comunicaciones: ['radio', 2, 5], oxigeno: ['bubble', 1.2, 3], reactor: ['hiss', 3, 6], seguridad: ['beep', 2.5, 5], administracion: ['key', 1, 3],
};
/** Cómo se dice cada sabotaje. */
const IMP_SAB = { lights: 'las luces', reactor: 'el reactor', doors: 'las puertas' };

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
/** Cómo es la nave, para la M y para «Cómo se juega». */
const IMP_SHIP_TEXT = 'La nave tiene once salas en tres filas. Arriba, de izquierda a derecha: Motores, el Comedor, el Puente de mando y Comunicaciones. En medio: Electricidad, el Almacén, la Enfermería y Oxígeno. Abajo: el Reactor, Seguridad y Administración. Un pasillo une cada sala con las que tiene al lado y con las de arriba y abajo. Empezáis en el Comedor, alrededor de la mesa del botón de emergencia. Los sabotajes se arreglan en Electricidad, las luces, y en el Reactor. En Administración está el mapa de la nave; en Seguridad, las cámaras, y en la Enfermería, las constantes vitales.';
/** «el conducto de Motores», «el conducto del Comedor». */
const ventName = v => `el conducto ${ofWhom(SHIP.byId[v.area].name)}`;
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
        const s = 1.86, ox = 7, oy = 12, X = x => (ox + x * s).toFixed(1), Y = y => (oy + y * s).toFixed(1);
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
        const vents = SHIP.vents.map(v => `<rect x="${(+X(v.x) - 1.3).toFixed(1)}" y="${(+Y(v.y) - 1).toFixed(1)}" width="2.6" height="2" fill="#0b1020" stroke="#8da2c9" stroke-width="0.4"/>`).join('');
        return `<svg class="imp-tile" viewBox="0 0 120 100" aria-hidden="true" focusable="false">${stars}${this.hull(X, Y, s, 'stroke="#8da2c9" stroke-width="1.2"')}${areas}${table}${spots}${vents}${waves}${crew}</svg>`;
    },

    /** El casco de la nave: arriba, las dos filas de cuatro salas; abajo, la fila de tres. */
    hull(X, Y, s, extra = '') {
        const pts = [[1, 1], [57, 1], [57, 26], [43, 26], [43, 39], [1, 39]].map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
        return `<polygon points="${pts}" fill="#141b2b" stroke-linejoin="round" ${extra}/>`;
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
        this.timers = { door: 0.6, beacon: 1.4, slow: 0, sparks: {}, panel: 0, alarm: 0, scan: 0, console: 0 };
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
        this.sabSaid = {};              // la cuenta atrás del reactor que ya se ha dicho
        this.scanning = new Map();      // quién está pasando por el escáner
        this.ventSaw = null;            // a quién has visto en un conducto
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
    /** El nombre de una tarea; si se hace en dos sitios, con la parte que toca: «Repostar el motor: llenar la lata». */
    taskName(t) {
        const T = IMPOSTOR_TASKS[t.type];
        return T.steps ? `${T.name}: ${T.steps[t.step || 0].toLowerCase()}` : T.name;
    }
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
            const s = shipStandAt(t.spot), path = m.alive ? shipPath(m.x, m.y, s.x, s.y) : null;
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
        Board.status(this.visual ? (n ? `${this.title}: ${n === 1 ? 'hay un impostor' : `hay ${n} impostores`} a bordo` : `${this.title}: haced entre todos las tareas de la nave`) : '');
        Board.render(this);
        // Sin voz no se lee: la nave y los carteles ya lo cuentan.
        if (this.visual) return;
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
            const r = this.game.rules, tricks = [];
            if (r.sabotages) tricks.push(`${this.touch ? 'con Sabotear' : 'con la X'} apagas las luces, haces que estalle el reactor o cierras puertas`);
            if (r.vents) tricks.push(`${this.touch ? 'con Conducto' : 'con la V'} te metes en los conductos y sales en otra sala`);
            if (tricks.length) t += ` Además, ${Txt.list(tricks)}.`;
            return t;
        }
        let t = `Eres tripulante. ${n === 1 ? 'Entre vosotros hay un impostor' : `Entre vosotros hay ${n} impostores`}. Haz tus tareas y descubre ${n === 1 ? 'quién es' : 'quiénes son'}. Si ves un cuerpo, acércate y ${this.press('R', 'Avisar')} para llamar a todos a una reunión; también puedes pedirla tú desde la mesa del Comedor.`;
        if (this.game.rules.sabotages) t += ' Si los impostores sabotean algo, corre a arreglarlo.';
        return t;
    }

    // ── La mesa ───────────────────────────────────────
    actionsDef() {
        return [
            { kind: 'use', label: 'Usar', key: 'E', cls: 'main' },
            { kind: 'kill', label: 'Matar', key: 'Q', cls: 'main imp-kill' },
            { kind: 'vent', label: 'Conducto', key: 'V', cls: 'main imp-vent' },
            { kind: 'sabotage', label: 'Sabotear', key: 'X', cls: 'main imp-sabbtn' },
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
        if (kind === 'vent') return this.ventKey();
        if (kind === 'sabotage') return this.sabotageMenu();
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
                    <span id="imp-sab" class="imp-sabtag" hidden></span>
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
        this.impostorBtns();
        this.reportBtn();
        const { done, total } = this.bar;
        $('imp-bar-fill').style.width = total ? `${done / total * 100}%` : '0';
        $('imp-bar-text').textContent = `Tareas de la tripulación: ${done} de ${total}`;
        $('imp-area').textContent = me.vent != null ? `En ${ventName(SHIP.vents[me.vent])}` : cap(this.areaName(me.area));
        this.renderRole();
        this.renderSab();
        // Fuera del tiempo real (la presentación, la reunión), la nave se dibuja aquí.
        if (this.raf == null) this.draw();
    }

    /** Los botones del impostor: el conducto y sabotear. */
    impostorBtns() {
        const g = this.game, me = this.mePl, ship = g.phase === 'ship';
        Board.showAct('vent', ship && this.amImpostor && me.alive && !!g.rules.vents, this.ventLabel());
        Board.showAct('sabotage', ship && this.amImpostor && !!g.rules.sabotages, this.sabLabel());
    }
    ventLabel() {
        const g = this.game, me = this.mePl;
        if (me.vent != null) return 'Salir del conducto';
        return g.phase === 'ship' && g.ventHere(this.me) ? 'Entrar en el conducto' : 'Conducto';
    }
    sabLabel() {
        const g = this.game, waits = ['lights', 'doors'].map(k => g.sabWait(k)).filter(w => w != null);
        if (!waits.length) return 'Sabotear';
        const w = Math.min(...waits);
        return w > 0 ? `Sabotear (${Math.ceil(w)} s)` : 'Sabotear';
    }

    /** El sabotaje en marcha, arriba: sin luces, la cuenta atrás del reactor o las puertas cerradas. */
    renderSab() {
        const el = $('imp-sab'), g = this.game;
        if (!el) return;
        const parts = [];
        if (g.phase === 'ship' && g.sab?.kind === 'lights') parts.push('Sin luces');
        if (g.phase === 'ship' && g.sab?.kind === 'reactor') parts.push(`Reactor: ${Math.max(0, Math.ceil(g.sab.until - g.time))} s`);
        if (g.phase === 'ship' && g.doorsShut) parts.push(`Puertas cerradas: ${this.areaName(g.doorsShut.room)}`);
        el.textContent = parts.join(' · ');
        el.hidden = !parts.length;
        el.dataset.kind = g.sab?.kind || 'doors';
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
        const g = this.game, me = this.mePl;
        if (this.task) return this.task.fake ? 'Dejar de fingir' : this.task.type === 'consola' ? 'Repetir' : this.task.hold ? 'Cómo va' : 'Seguir la tarea';
        if (g.phase !== 'ship' || me.vent != null) return 'Usar';
        const panel = me.alive ? g.panelHere(this.me) : null;
        if (panel) return panel.sab === 'lights' ? 'Arreglar las luces' : 'Poner la mano en el panel';
        const t = g.taskHere(this.me);
        if (t) return `${this.amImpostor ? 'Fingir' : 'Usar'}: ${IMPOSTOR_TASKS[t.type].short}`;
        const c = g.consoleHere(this.me);
        if (c) return `Mirar ${c.name}`;
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
        const g = this.game, me = this.mePl;
        if (me.vent != null) return this.touch ? 'En un conducto: la cruceta te lleva a otro; Conducto, para salir' : 'En un conducto: las flechas te llevan a otro; V, para salir';
        if (this.guide) return `Guía: te llevo ${this.guide.to}`;
        if (!this.alive) return 'Eres un fantasma: nadie te ve ni te oye';
        if (g.sab && !this.amImpostor) return g.sab.kind === 'lights' ? 'Sin luces: se arreglan en Electricidad' : '¡El reactor va a estallar! Corre al Reactor';
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
                    if ((this.hudT -= dt) <= 0) {
                        this.hudT = 0.25;
                        this.renderRole(); this.renderSab(); this.reportBtn();
                        if (this.amImpostor) { this.impostorBtns(); if (this.alive) Board.showAct('kill', this.game.phase === 'ship', this.killLabel()); }
                    }
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
        const evs = g.tick(dt);
        for (const e of evs) this.onTick(e);
        // Lo que pasa con el tiempo y tiene que contarse: las puertas que se abren y el reactor que estalla.
        const told = evs.filter(e => e.type === 'doorsOpen' || e.type === 'gameOver');
        if (told.length) this.apply({ ok: true, events: told });
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
            const floor = shipArea(pl.x, pl.y)?.floor || 'metal';
            // Los fantasmas no pisan el suelo: suenan como un soplo.
            if (p === this.me) { sc.here(pl.alive ? ShipSounds.step(STEP_TIMBRES[0], floor, 0.5) : ShipSounds.ghostStep(0.7)); continue; }
            const d = Math.hypot(pl.x - me.x, pl.y - me.y);
            if (d > g.hearing) continue;
            const sight = shipSight(me.x, me.y, pl.x, pl.y, g.closed), seen = this.seenNow.has(p);
            // A oscuras, los pasos de quien no ves suenan todos igual.
            const tb = g.lightsOff && me.alive && !this.amImpostor && !seen ? DARK_TIMBRE : STEP_TIMBRES[this.timbreOf(p)];
            sc.at(pl.x, pl.y, pl.alive ? ShipSounds.step(tb, floor, seen ? 1 : 0.9) : ShipSounds.ghostStep(), { wall: !seen && !sight });
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
        this.sabCues(dt);
        this.nearCue();
    }

    /** Los sabotajes en marcha: los paneles que hay que arreglar pitan, y el reactor suena en toda la nave y cuenta los segundos. */
    sabCues(dt) {
        const g = this.game, sab = g.sab, me = this.mePl, sc = this.scene, T = this.timers;
        if (!sab) return;
        if ((T.panel -= dt) <= 0) {
            T.panel = sab.kind === 'reactor' ? 1.3 : 2.2;
            const held = g.reactorHeld();
            SHIP.panels.filter(x => x.sab === sab.kind && !held.includes(x.id)).forEach((x, k) => setTimeout(() => {
                if (this.stopped || this.frozen) return;
                sc?.at(x.x, x.y, ShipSounds.panel(sab.kind), { ref: 4, wall: !shipSight(me.x, me.y, x.x, x.y, g.closed) });
            }, k * 260));
        }
        if (sab.kind !== 'reactor') return;
        const left = sab.until - g.time, r = SHIP.byId.reactor;
        if ((T.alarm -= dt) <= 0) {
            T.alarm = left < 10 ? 0.6 : 1.4;
            sc?.at(r.cx, r.cy, ShipSounds.siren(left < 10), { ref: 14, roll: 0.6 });
        }
        for (const n of [30, 20, 10, 5]) {
            if (left > n || left < n - 1 || this.sabSaid[n] || sab.until - sab.t0 < n + 2) continue;
            this.sabSaid[n] = true;
            this.tell(`El reactor estalla en ${n} segundos.`, { interrupt: n <= 10 });
        }
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
        if (G.kind === 'panel' && !(g.sab && SHIP.panels.find(x => x.id === G.id)?.sab === g.sab.kind)) {
            this.guide = null; Board.status(this.statusIdle()); return;
        }
        if ((G.kind === 'panel' || G.kind === 'console') && Math.hypot(G.x - me.x, G.y - me.y) <= IMPOSTOR_CONSOLE - 0.25) {
            // Al llegar, nearCue dice qué es y cómo se usa.
            this.guide = null;
            this.scene?.here(ShipSounds.arrive());
            Board.status(this.statusIdle());
            return;
        }
        if ((G.replan -= dt) <= 0) {
            G.replan = 0.5;
            // Los fantasmas van en línea recta; los vivos, por los pasillos (y, si hay puertas cerradas, hasta la puerta).
            G.path = !me.alive ? [{ x: G.x, y: G.y }] : shipPath(me.x, me.y, G.x, G.y, g.closed) || shipPath(me.x, me.y, G.x, G.y);
        }
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
                if (me.alive && !shipClear(me.x, me.y, x, y, IMPOSTOR_RADIUS + 0.02)) return best;
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
            // Las de una sala con las puertas cerradas no hacen tic.
            (area?.doors || []).filter(d => !this.doorShut(d)).forEach((d, k) => setTimeout(() => { if (!this.stopped && !this.frozen) sc.at(d.x, d.y, ShipSounds.door()); }, k * 170));
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
        // Quien pasa por el escáner suena mientras tanto.
        if (this.scanning.size && (T.scan -= dt) <= 0) {
            T.scan = 1.1;
            for (const p of this.scanning.keys()) this.otherSound(p, ShipSounds.scan());
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
        // Los fantasmas atraviesan las paredes: no las rozan.
        if (!me.alive || me.vent != null) { IMP_SIDES.forEach((_, k) => sc.setLoop('wall' + k, { level: 0 })); return; }
        IMP_SIDES.forEach(([dx, dy], k) => {
            let d = null;
            for (let r = 0.35; r <= 1.6; r += 0.1) if (shipSolid(Math.floor(me.x + dx * r), Math.floor(me.y + dy * r), g.closed)) { d = r; break; }
            const level = d == null ? 0 : clamp((1.6 - d) / 1.2, 0, 1) * 0.3;
            sc.setLoop('wall' + k, { x: me.x + dx * (d ?? 2), y: me.y + dy * (d ?? 2), level });
        });
    }

    /**
     * Al llegar junto a algo que se usa (una tarea tuya, el panel de un sabotaje, una consola o, de impostor, un conducto),
     * suena una campanita y se dice qué es.
     */
    nearCue() {
        const g = this.game, me = this.mePl;
        let key = null, name = '', how = '';
        if (!this.task && me.vent == null && g.phase === 'ship') {
            const panel = me.alive ? g.panelHere(this.me) : null, t = g.taskHere(this.me), c = g.consoleHere(this.me);
            const v = this.amImpostor && me.alive && g.rules.vents ? g.ventHere(this.me) : null;
            if (panel) { key = 'panel:' + panel.id; name = cap(panel.name); how = `${this.press('E', 'Usar')} para ${panel.sab === 'lights' ? 'arreglarlas' : 'poner la mano'}`; }
            else if (t) { key = t.i; name = this.taskName(t); how = `${this.press('E', 'Usar')} para empezar`; }
            else if (c) { key = 'console:' + c.id; name = cap(c.name); how = `${this.press('E', 'Usar')} para mirar`; }
            else if (v) { key = 'vent:' + v.id; name = 'Un conducto'; how = `${this.press('V', 'Conducto')} para entrar`; }
        }
        if (key === this.nearKey) return;
        this.nearKey = key;
        Board.render(this);
        if (key == null) { if (!this.task) Board.status(this.statusIdle()); return; }
        this.scene?.here(ShipSounds.hit());
        this.tell(`${name}.${this.hint('use' + String(key).split(':')[0], `${cap(how)}.`)}`, { interrupt: !this.speech.busy });
        Board.status(`${cap(how)}: ${name}`);
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
                // Sin voz, el papel y las tareas se leen juntos en un cuadro, al llegar las tareas.
                if (this.visual) this.roleIntro = { title: e.role === 'impostor' ? (e.impostors === 1 ? 'Eres el impostor' : 'Eres impostor') : 'Eres tripulante', text: this.roleText(e) };
                else await this.say(this.roleText(e), { keep: true });
                break;
            case 'tasks':
                if (e.p === me) {
                    Board.render(this);
                    const list = g.pending(me).map(t => `${this.taskName(t)}, ${inPlace(this.areaName(t.spot.area))}`);
                    const what = e.fake ? 'Tus tareas de mentira, para disimular' : 'Tus tareas';
                    const text = `${what}: ${impList(list)}.${this.hint('guide', `${cap(this.press('G', 'Guía'))} y la guía te lleva a la que quieras.`)}`;
                    if (this.visual) {
                        const R = this.roleIntro;
                        this.roleIntro = null;
                        await Dialog.open({ title: R ? R.title : 'Tus tareas', text: R ? `${R.text} ${text}` : text, items: [{ label: 'Empezar', value: 'go' }], cancel: 'go' });
                    } else await this.say(text, { keep: true });
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
                else if (e.task === 'escaner') this.otherScan(e);
                else this.otherSound(e.p, ShipSounds.beep());
                break;
            case 'taskStop':
                this.scanning.delete(e.p);
                if (e.p === me) this.closeTask();
                break;
            case 'taskStep':
                if (e.p === me) {
                    this.closeTask();
                    this.scene?.here(ShipSounds.done());
                    if (this.guide?.kind === 'task' && this.guide.i === e.i) this.setGuide(null);
                    this.tell(`Primera parte hecha. Ahora, ${IMPOSTOR_TASKS[e.task].steps[e.step].toLowerCase()}, ${inPlace(this.areaName(e.area))}.${this.hint('step', `${cap(this.press('G', 'Guía'))} y la guía te lleva.`)}`, { keep: true });
                } else this.otherSound(e.p, ShipSounds.clink());
                break;
            case 'sabotage': this.presentSab(e); break;
            case 'fixHold': this.presentHold(e); break;
            case 'fixed': this.presentFixed(e); break;
            case 'doors': this.presentDoors(e); break;
            case 'doorsOpen': this.presentDoorsOpen(e); break;
            case 'vent': this.presentVent(e); break;
            case 'console': if (e.p === me) this.showConsole(e); break;
            case 'taskDone':
                this.scanning.delete(e.p);
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
                this.scanning.clear();
                this.closeTask();
                this.setGuide(null);
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
                if (e.reason === 'reactor') { this.flat(ShipSounds.kill()); Board.banner('¡Ha estallado el reactor!', `Ganan los impostores: ${Txt.list(e.impostors.map(q => q === me ? 'tú' : this.seats[q].name))}`); }
                else if (e.side === 'impostors') Board.banner('¡Ganan los impostores!', Txt.list(e.impostors.map(q => q === me ? 'tú' : this.seats[q].name)));
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
        this.scanning.delete(e.target);
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

    // ── Los sabotajes, las puertas, los conductos y el escáner ──
    /** Alguien sabotea: las luces o el reactor. */
    presentSab(e) {
        const g = this.game, me = this.mePl, mine = e.by === this.me, imp = this.amImpostor;
        this.sabSaid = {};
        this.timers.alarm = 0; this.timers.panel = 0.4;
        const by = mine ? '' : imp ? `${this.Nm(e.by)} ha ` : '';
        let t;
        if (e.kind === 'lights') {
            this.flat(ShipSounds.lightsOff());
            Board.banner('¡Sin luces!', imp ? 'La tripulación casi no ve' : 'Se arreglan en Electricidad');
            if (imp) t = `${mine ? 'Has apagado' : by + 'apagado'} las luces: la tripulación casi no ve, y tú sí. A oscuras, sus pasos suenan todos igual.`;
            else t = `¡Se han apagado las luces! Casi no ves, y los pasos de quien no ves suenan todos igual. Se arreglan en el cuadro de Electricidad.${me.alive ? this.hint('lights', `Con ${this.touch ? 'Guía' : 'la G'}, la guía te lleva.`) : ''}`;
        } else {
            const secs = Math.round(e.until - g.time);
            Board.banner('¡El reactor!', `Estalla en ${secs} segundos`);
            if (imp) t = `${mine ? 'Has saboteado' : by + 'saboteado'} el reactor: si nadie lo arregla en ${secs} segundos, ganáis. Mientras, no se puede pedir una reunión.`;
            else t = `¡El reactor va a estallar! Tenéis ${secs} segundos. Hacen falta dos personas a la vez, una en cada panel del Reactor.${me.alive ? this.hint('reactor', `Con ${this.touch ? 'Guía' : 'la G'}, la guía te lleva al panel libre.`) : ''}`;
        }
        if (!me.alive && !imp) t += ' Como eres un fantasma, no puedes arreglarlo.';
        this.tell(t, { keep: true });
        Board.status(this.statusIdle());
        Board.render(this);
    }

    /** Alguien pone la mano en un panel del reactor, o la quita. */
    presentHold(e) {
        const g = this.game, panel = SHIP.panels.find(x => x.id === e.panel), me = this.mePl;
        if (e.held) this.scene?.at(panel.x, panel.y, ShipSounds.hold());
        if (e.p === this.me) {
            if (!e.held) { this.closeTask(); this.tell('Quitas la mano del panel.'); return; }
            // Si ya había alguien en el otro panel, se arregla al momento: lo cuenta «fixed».
            if (this.game.sab?.kind === 'reactor') this.openPanel('reactor', { panel: e.panel, hold: true });
            return;
        }
        // Lo sabes si estás en el Reactor o tienes la mano en el otro panel.
        if (me.area !== 'reactor' && !this.task?.hold) return;
        this.notice(`${this.Nm(e.p)} ${e.held ? 'pone la mano en' : 'quita la mano de'} ${panel.name}.`);
        if (this.task?.hold) this.taskUI({ text: this.reactorText(), art: this.reactorArt() });
    }

    /** Sabotaje arreglado. */
    presentFixed(e) {
        const g = this.game, me = this.me, lights = e.kind === 'lights';
        if (this.task?.panel) this.closeTask();
        if (this.guide?.kind === 'panel') this.setGuide(null);
        this.flat(lights ? ShipSounds.lightsOn() : ShipSounds.fixed());
        Board.banner(lights ? 'Vuelve la luz' : '¡Reactor arreglado!', e.by === me ? 'Lo has arreglado tú' : '');
        let t;
        if (lights) t = e.by === me ? 'Has encendido las luces.' : 'Vuelve la luz.';
        else t = this.amImpostor ? 'La tripulación ha arreglado el reactor.' : '¡Reactor arreglado! Lo habéis conseguido.';
        this.tell(t);
        Board.status(this.statusIdle());
        Board.render(this);
    }

    /** ¿Está cerrada esta puerta? */
    doorShut(d) { const D = this.game.doorsShut; return !!D && d.room === D.room; }

    /** Se cierran las puertas de una sala: un portazo en cada una. */
    presentDoors(e) {
        const g = this.game, me = this.mePl, r = SHIP.byId[e.room], sc = this.scene;
        for (const d of r.doors) {
            if (Math.hypot(d.x - me.x, d.y - me.y) > g.hearing * 1.6) continue;
            sc?.at(d.x, d.y, ShipSounds.doorSlam(), { wall: !shipSight(me.x, me.y, d.x, d.y) });
            this.ripple(d.x, d.y, 'bump');
        }
        const near = me.area === r.id || r.doors.some(d => d.corridor === me.area);
        if (this.guide) this.guide.replan = 0;
        if (e.by === this.me) this.tell(`Has cerrado las puertas ${ofWhom(r.name)} durante ${Math.round(e.until - g.time)} segundos.`);
        else if (this.isMate(e.by)) this.notice(`${this.Nm(e.by)} ha cerrado las puertas ${ofWhom(r.name)}.`);
        else if (near && me.alive) this.tell(`¡Se han cerrado las puertas ${ofWhom(r.name)}! Se abrirán solas dentro de ${Math.round(e.until - g.time)} segundos.`);
        Board.render(this);
    }

    presentDoorsOpen(e) {
        const g = this.game, me = this.mePl, r = SHIP.byId[e.room];
        if (!r) return;
        for (const d of r.doors) if (Math.hypot(d.x - me.x, d.y - me.y) <= g.hearing) this.scene?.at(d.x, d.y, ShipSounds.doorOpen(), { wall: !shipSight(me.x, me.y, d.x, d.y) });
        if (this.guide) this.guide.replan = 0;
        if (me.alive && (me.area === r.id || r.doors.some(d => d.corridor === me.area))) this.notice(`Se abren las puertas ${ofWhom(r.name)}.`);
        Board.render(this);
    }

    /** Las salidas de un conducto: «al Reactor, detrás». */
    ventExits(v) {
        return v.to.map((id, k) => {
            const o = SHIP.vents[id];
            return `${k + 1}, ${toPlace(this.areaName(o.area))}, ${impDir(o.x - v.x, o.y - v.y)}`;
        });
    }

    /** Alguien entra en un conducto, va por dentro o sale. */
    presentVent(e) {
        const g = this.game, me = this.mePl, v = SHIP.vents[e.vent], sc = this.scene;
        if (e.p === this.me) {
            this.nearKey = undefined;
            this.inRange = null;
            const seen = e.witnesses?.length ? ` Cuidado: te ${e.witnesses.length === 1 ? `ha visto ${this.seats[e.witnesses[0]].name}` : `han visto ${Txt.list(e.witnesses.map(q => this.seats[q].name))}`}.` : '';
            if (e.kind === 'out') {
                sc?.here(ShipSounds.vent());
                this.saidArea = me.area;
                this.tell(`Sales del conducto, ${inPlace(this.areaName(e.area))}.${seen}`);
            } else {
                sc?.here(e.kind === 'in' ? ShipSounds.vent() : ShipSounds.ventMove());
                const how = this.touch ? 'La cruceta te lleva al que está hacia ese lado; Conducto, para salir.' : 'Pulsa su número, o la flecha hacia donde está; la V, para salir.';
                this.tell(`${e.kind === 'in' ? 'Estás dentro del' : 'Llegas al'} ${ventName(v).replace(/^el /, '')}. Lleva ${impList(this.ventExits(v))}.${seen}${this.hint('vent', how)}`);
            }
            Board.status(this.statusIdle());
            Board.render(this);
            return;
        }
        if (e.kind === 'move') return;
        // Se oye la tapa del conducto, desde su sitio.
        const d = Math.hypot(e.x - me.x, e.y - me.y);
        if (d <= g.hearing) sc?.at(e.x, e.y, ShipSounds.vent(), { wall: !shipSight(me.x, me.y, e.x, e.y, g.closed) });
        const sees = e.witnesses?.includes(this.me) || (!me.alive && d <= g.visionOf(this.me));
        if (!sees) return;
        if (me.alive && !this.amImpostor) this.ventSaw = { who: e.p, area: e.area };
        const mate = this.isMate(e.p) ? ', tu compañero impostor,' : '';
        this.tell(`¡${this.Nm(e.p)}${mate} ${e.kind === 'in' ? 'se ha metido en' : 'ha salido de'} un conducto, ${this.rel(e.x, e.y)}!${me.alive && !this.amImpostor ? this.hint('ventSaw', 'Solo los impostores van por los conductos. Cuéntalo en la reunión.') : ''}`, { keep: true });
    }

    /** Otro pasa por el escáner: si lo ves, sabes que es tripulante. Un impostor se puede poner, pero el escáner no hace nada. */
    otherScan(e) {
        const g = this.game;
        if (e.visible) this.scanning.set(e.p, true);
        this.otherSound(e.p, e.visible ? ShipSounds.scan() : ShipSounds.beep());
        if (!g.perceive(this.me).seen.includes(e.p)) return;
        this.tell(e.visible ? `${this.Nm(e.p)} está pasando por el escáner: es tripulante.` : `${this.Nm(e.p)} se ha puesto en el escáner, pero el escáner no hace nada.`);
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
        if (r.side === 'impostors') t = r.reason === 'reactor' ? `Ha estallado el reactor: ganan los impostores. ${who}` : `Ganan los impostores: ya son tantos como los tripulantes que quedan. ${who}`;
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
            case 'vent': return aboutMe ? `¡Te he visto en un conducto${area ? `, ${area}` : ''}!` : `¡He visto ${toWhom(w)} en un conducto${area ? `, ${area}` : ''}!`;
            case 'scan': return aboutMe ? 'Te vi pasar por el escáner: eres de fiar.' : `Vi ${toWhom(w)} pasar por el escáner: es de fiar.`;
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
                { label: 'He visto a alguien en un conducto', value: 'vent' },
                { label: 'Sospecho de alguien', value: 'sus' },
                ...(M.kind === 'body' ? [{ label: `Vi a alguien ${inPlace(this.areaName(M.area))}`, value: 'saw' }] : []),
                { label: 'Alguien estaba conmigo', value: 'with' },
                { label: 'Vi a alguien pasar por el escáner', value: 'scan' },
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
        const title = {
            kill: '¿A quién has visto matar?', vent: '¿A quién has visto en un conducto?', sus: '¿De quién sospechas?',
            saw: `¿A quién viste ${inPlace(this.areaName(M.area))}?`, with: '¿Quién estaba contigo?', scan: '¿A quién viste pasar por el escáner?',
        }[kind];
        const who = await Dialog.open({
            title,
            // A quien viste en un conducto, el primero.
            items: [...g.living().filter(q => q !== this.me).sort((a, b) => (kind === 'vent' && b === this.ventSaw?.who) - (kind === 'vent' && a === this.ventSaw?.who)).map(q => ({ label: this.voteLabel(q), value: 'p' + q })), { label: 'Volver', value: 'back' }],
            cancel: 'back',
        });
        if (!who || who === 'back') return null;
        const q = +who.slice(1);
        // Si lo viste tú en un conducto, se dice dónde.
        const area = kind === 'saw' ? M.area : kind === 'vent' && this.ventSaw?.who === q ? this.ventSaw.area : null;
        return { kind, who: q, ...(area ? { area } : {}) };
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
        const shut = d => this.doorShut(d) ? ', con la puerta cerrada' : '';
        if (me.vent != null) {
            const v = SHIP.vents[me.vent];
            parts.push(`Estás dentro ${ofWhom(ventName(v))}. Lleva ${impList(this.ventExits(v))}. ${cap(this.press('V', 'Conducto'))} para salir.`);
        } else if (!a) parts.push(me.alive ? 'Estás junto a una pared.' : 'Estás dentro de una pared: los fantasmas las atraviesan.');
        else if (a.kind === 'room') {
            parts.push(`Estás ${inPlace(a.name)}.`);
            parts.push(`Salidas: ${impList(a.doors.map(d => `hacia ${this.areaName(d.to)}, ${this.rel(d.x, d.y)}${shut(d)}`))}.`);
        } else {
            const [d1, d2] = a.doors;
            parts.push(`Estás en ${a.name}. ${cap(this.areaName(d1.room))} está ${this.rel(d1.x, d1.y)}${shut(d1)}; y ${this.areaName(d2.room)}, ${this.rel(d2.x, d2.y)}${shut(d2)}.`);
        }
        // Lo que está en marcha: un sabotaje.
        if (g.sab) {
            const held = g.reactorHeld(), list = SHIP.panels.filter(x => x.sab === g.sab.kind);
            const where = x => me.area === x.area ? this.rel(x.x, x.y) : inPlace(this.areaName(x.area));
            if (g.sab.kind === 'lights') parts.push(`Las luces están apagadas: se arreglan en ${list[0].name}, ${where(list[0])}.`);
            else parts.push(`¡El reactor estalla en ${Math.ceil(g.sab.until - g.time)} segundos! ${impList(list.map(x => {
                const who = g.players.find(pl => pl.busy?.fix === x.id);
                return `${cap(x.name)}, ${who ? `con ${who.index === this.me ? 'tu mano' : `la mano ${ofWhom(this.seats[who.index].name)}`}` : 'libre'}, ${where(x)}`;
            }))}.`);
        }
        for (const f of SHIP.furniture) if (f.area === me.area) {
            const x = clamp(me.x, f.x, f.x + f.w), y = clamp(me.y, f.y, f.y + f.h);
            parts.push(`${cap(f.name)} está ${this.rel(x, y)}.`);
        }
        if (me.area === SHIP.button.area && g.impostorCount() && me.alive) parts.push('En la mesa está el botón de emergencia.');
        for (const c of SHIP.consoles) if (c.area === me.area) {
            const one = c.name.startsWith('el ');
            parts.push(c.table ? `En ${c.table.name} se ${one ? 'mira' : 'miran'} ${c.name}.` : `${cap(c.name)} ${one ? 'está' : 'están'} ${this.rel(c.x, c.y)}.`);
        }
        if (me.vent == null) for (const v of SHIP.vents) if (v.area === me.area) parts.push(`Hay un conducto ${this.rel(v.x, v.y)}.`);
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
        if (this.amImpostor && g.rules.sabotages) parts.push(this.sabWaitText());
        if (this.guide?.carrot) parts.push(`La guía te lleva ${this.guide.to}: sigue ${impDir(this.guide.carrot.x - me.x, this.guide.carrot.y - me.y)}.`);
        this.tell(parts.join(' '), { keep: true });
    }

    /** M: cómo es la nave. */
    describeShip() {
        const a = SHIP.byId[this.mePl.area];
        this.tell(`${IMP_SHIP_TEXT}${a ? ` Ahora estás ${inPlace(a.name)}.` : ''}`, { keep: true });
    }

    sayTasks() {
        const me = this.mePl;
        if (!me.tasks.length) { this.tell('Todavía no tienes tareas.'); return; }
        const list = me.tasks.map(t => {
            const s = SHIP.spots[t.spot], name = t.done ? IMPOSTOR_TASKS[t.type].name : this.taskName(t);
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
        if (g.sab?.kind === 'lights') parts.push('Las luces están apagadas.');
        if (g.sab?.kind === 'reactor') parts.push(`El reactor estalla en ${Math.ceil(g.sab.until - g.time)} segundos.`);
        if (g.doorsShut) parts.push(`Están cerradas las puertas ${ofWhom(this.areaName(g.doorsShut.room))}.`);
        if (this.amImpostor && g.rules.sabotages) parts.push(this.sabWaitText());
        const a = SHIP.byId[me.area];
        if (me.vent != null) parts.push(`Estás dentro ${ofWhom(ventName(SHIP.vents[me.vent]))}.`);
        else if (a) parts.push(`Estás ${inPlace(a.name)}.`);
        const dead = g.players.filter(pl => !pl.alive && pl.knownDead).map(pl => pl.index);
        parts.push(`En la nave estáis ${g.n}: ${Txt.list(this.names)}.${dead.length ? ` Se sabe que han muerto o que los han echado: ${Txt.list(dead.map(p => this.v.name(p)))}.` : ''}`);
        this.tell(parts.join(' '), { keep: true });
    }

    /** Cuándo puede sabotear el impostor. */
    sabWaitText() {
        const g = this.game, w = g.sabWait('lights'), d = g.sabWait('doors');
        const a = w == null ? 'ya hay un sabotaje en marcha' : w > 0 ? `para apagar las luces o sabotear el reactor faltan ${Math.ceil(w)} segundos` : 'puedes apagar las luces o sabotear el reactor';
        const b = d == null ? 'ya hay unas puertas cerradas' : d > 0 ? `para cerrar puertas faltan ${Math.ceil(d)}` : 'puedes cerrar puertas';
        return `${cap(a)}; ${b}.`;
    }

    keysHelp() {
        const t = [
            'W, A, S y D, o las flechas: andar. W va hacia delante, que es arriba en la pantalla; S, hacia detrás; A, a la izquierda, y D, a la derecha. Lo que suena a tu derecha está a tu derecha.',
            'E o Enter: usar lo que tienes al lado: una tarea, el panel de un sabotaje o una consola. Junto a la mesa del Comedor, pedir una reunión de emergencia.',
            'R: avisar de un cuerpo que tienes cerca. Si eres impostor: Q, matar a quien tienes a tu alcance; X, sabotear, y V, entrar en un conducto o salir. Dentro de un conducto, las flechas o los números te llevan a otro.',
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
        if (me.vent != null) { this.notice('Estás dentro de un conducto: la guía funciona fuera.'); return; }
        const dist = (x, y) => { const path = me.alive ? shipPath(me.x, me.y, x, y) : null; return path ? pathLength(me.x, me.y, path) : me.alive ? 99 : Math.hypot(x - me.x, y - me.y); };
        const tasks = g.pending(this.me).map(t => { const s = shipStandAt(t.spot); return { t, s, d: dist(s.x, s.y) }; }).sort((a, b) => a.d - b.d);
        // Con un sabotaje en marcha, lo primero: el panel que lo arregla (en el reactor, el que está libre).
        const held = g.reactorHeld();
        const panels = g.sab && me.alive ? SHIP.panels.filter(x => x.sab === g.sab.kind && !held.includes(x.id)).map(x => { const s = shipStandAt(x); return { x, s, d: dist(s.x, s.y) }; }).sort((a, b) => a.d - b.d) : [];
        const items = [
            ...panels.map(({ x, d }) => ({ label: `Arreglar ${IMP_SAB[x.sab]}: ${x.name}, ${impDist(d)}`, value: 'panel:' + x.id })),
            ...tasks.map(({ t, d }) => ({ label: `${this.taskName(t)}, ${inPlace(this.areaName(t.spot.area))}, ${impDist(d)}`, value: 'task:' + t.i })),
            ...SHIP.areas.filter(a => a.kind === 'room' && a.id !== me.area).map(a => ({ label: `Ir ${toPlace(a.name)}`, value: 'room:' + a.id })),
            ...SHIP.consoles.map(c => ({ label: `Ir a mirar ${c.name}, ${inPlace(this.areaName(c.area))}`, value: 'console:' + c.id })),
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
        } else if (kind === 'panel') {
            const { x, s } = panels.find(o => o.x.id === v);
            this.setGuide({ kind, id: v, x: s.x, y: s.y, to: toPlace(x.name) });
        } else if (kind === 'console') {
            const c = SHIP.consoles.find(o => o.id === v);
            const s = c.table ? this.tableSpot(c.table) : shipStandAt(c);
            this.setGuide({ kind, id: v, x: s.x, y: s.y, to: `a ${c.name}` });
        } else {
            const a = SHIP.byId[v], p = impRoomPoint(a);
            this.setGuide({ kind, id: v, x: p.x, y: p.y, to: toPlace(a.name) });
        }
        this.tell(`Te llevo ${this.guide.to}. Sigue el pitido.${this.hint('ping', 'Suena hacia donde tienes que andar, y más deprisa cuanto más cerca estás. Al llegar, suena una campanita.')}`, { keep: true });
    }

    /** Un sitio libre junto a una mesa (para las consolas que son una mesa): el lado más cerca de ti. */
    tableSpot(t) {
        const me = this.mePl, opts = [];
        for (let x = t.x - 0.6; x <= t.x + t.w + 0.6; x += 0.5) for (const y of [t.y - 0.6, t.y + t.h + 0.6]) opts.push({ x, y });
        for (let y = t.y; y <= t.y + t.h; y += 0.5) for (const x of [t.x - 0.6, t.x + t.w + 0.6]) opts.push({ x, y });
        const ok = opts.filter(o => !shipBlocked(o.x, o.y, IMPOSTOR_RADIUS + 0.06) && shipArea(o.x, o.y));
        return ok.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0] || { x: t.x - 0.6, y: t.y };
    }

    // ── Andar ─────────────────────────────────────────
    walkNudge(k) {
        if (this.game.phase !== 'ship') return;
        if (this.mePl.vent != null) { this.ventMove(k); return; }
        if (this.task?.fake || this.task?.local) this.leavePanel();
        else if (this.task) { this.busyNotice(); return; }
        const [dx, dy] = IMP_MOVE[k];
        this.nudge = { dx, dy, t: 0.45 };
        this.audio.unlock();
    }

    busyNotice() {
        if (this.clock - (this.busySaid || -9) < 2) return;
        this.busySaid = this.clock;
        if (this.task?.hold) this.notice(`Tienes la mano en el panel. Para quitarla, ${this.press('Escape', 'Quitar la mano')}.`);
        else this.notice(`Estás con una tarea. Para irte, ${this.press('Escape', 'Dejar la tarea')}.`);
    }

    /** Al andar, el impostor deja de fingir, y se deja la consola o el cuadro de las luces. */
    leavePanel() {
        const T = this.task;
        if (!T) return;
        if (T.local) this.closeTask();
        else this.act({ type: 'cancelTask', p: this.me });
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
        const g = this.game, me = this.mePl;
        if (g.phase !== 'ship') { this.explainCant(); return; }
        if (me.vent != null) { this.tell(`Estás dentro de un conducto. ${cap(this.press('V', 'Conducto'))} para salir.`); return; }
        const panel = g.panelHere(this.me);
        if (panel && me.alive) {
            if (panel.sab === 'lights') this.openPanel('luces', { panel: panel.id, local: true });
            else this.act({ type: 'fix', p: this.me, panel: panel.id });
            return;
        }
        const t = g.taskHere(this.me);
        if (t) { this.act({ type: 'startTask', p: this.me, i: t.i }); return; }
        const c = g.consoleHere(this.me);
        if (c) { this.act({ type: 'console', p: this.me, id: c.id }); return; }
        if (panel) { this.audio.error(); this.tell('Los fantasmas no pueden arreglar los sabotajes: eso les toca a los vivos.'); return; }
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
        if (g.sab?.kind === 'reactor') { this.audio.error(); this.tell('Con el reactor a punto de estallar no se puede pedir una reunión: primero, a arreglarlo.'); return; }
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
        if (me.vent != null) { this.audio.error(); this.tell(`Desde un conducto no se mata. ${cap(this.press('V', 'Conducto'))} para salir.`); return; }
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
        if (me.vent != null) { this.audio.error(); this.tell(`Estás dentro de un conducto. ${cap(this.press('V', 'Conducto'))} para salir.`); return; }
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
        const name = this.taskName(this.mePl.tasks[i] || { type });
        $('imp-task-title').textContent = name;
        Board.status(name);
        this[type + 'Start'](T);
        Board.render(this);
    }

    /**
     * Un panel que no es una tarea: el cuadro de las luces, la mano en el reactor o una consola.
     * local: la partida no sabe que estás en él (se deja sin avisar a nadie).
     */
    openPanel(type, opts = {}) {
        this.releaseKeys();
        const T = this.task = { type, fake: false, easy: !!this.game.rules.easyTasks, ...opts };
        $('imp-task').hidden = false;
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
        if (T.panel) this.act({ type: 'fix', p: this.me, panel: T.panel });
        else this.act({ type: 'task', p: this.me, i: T.i });
    }

    cancelPick() {
        const T = this.task;
        if (!T) return false;
        if (T.local) { this.closeTask(); this.tell(T.type === 'consola' ? 'Dejas la consola.' : 'Dejas el cuadro de las luces.'); return true; }
        this.act({ type: 'cancelTask', p: this.me });
        if (!T.hold) this.tell(T.fake ? 'Dejas de fingir.' : 'Dejas la tarea. Puedes volver cuando quieras.');
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
        const leave = this.task?.hold ? 'Quitar la mano' : this.task?.type === 'consola' ? 'Dejar la consola' : this.task?.panel ? 'Dejarlo' : 'Dejar la tarea';
        for (const b of [...buttons, { k: 'Escape', label: leave, cls: 'imp-leave' }]) {
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

    // · Pasar por el escáner: quieto mientras te escanea. Quien te ve sabe que eres tripulante.
    escanerStart(T) {
        T.t = 0; T.dur = T.easy ? 6 : 10; T.mark = 0; T.beat = 0;
        this.taskUI({ text: 'Quédate quieto mientras el escáner te pasa. Quien te vea sabrá que eres tripulante.', art: this.barArt(0), buttons: [{ k: ' ', label: 'Cuánto falta' }] });
        this.tell(`Pasar por el escáner. Quédate quieto unos segundos.${this.hint('escaner', 'Quien te vea pasar por él sabrá que eres tripulante.')}`);
    }
    escanerKey(T, k) { if (k === ' ' || k === 'Enter') this.tell(`Va por el ${Math.round(T.t / T.dur * 100)} por ciento.`); }
    escanerTick(T, dt) {
        T.t += dt;
        if ((T.beat -= dt) <= 0) { T.beat = 1.1; this.sound(ShipSounds.scan()); }
        const x = Math.min(1, T.t / T.dur);
        $('imp-task-art').innerHTML = this.barArt(x);
        if (x >= 1) this.finishTask();
    }

    // · Repostar el motor: llenar la lata en el Almacén y echarla en un motor. Cada parte, pulsar y esperar.
    combustibleStart(T) {
        const t = this.mePl.tasks[T.i];
        T.step = t?.step || 0; T.t = 0; T.dur = T.easy ? 3 : 5; T.running = false; T.drip = 0;
        const fill = T.step === 0;
        this.taskUI({ text: `${this.touch ? 'Toca Empezar' : 'Pulsa E o Enter'} y espera a que ${fill ? 'se llene la lata' : 'se vacíe la lata en el motor'}.`, art: this.fuelArt(T, fill ? 0 : 1), buttons: [{ k: 'Enter', label: 'Empezar' }] });
        this.tell(`${IMPOSTOR_TASKS.combustible.steps[T.step]}.${this.hint('combustible', `${cap(this.press('E', 'Empezar'))} y espera.`)}`);
    }
    combustibleKey(T, k) {
        if (k !== 'Enter' && k !== ' ') return;
        if (T.running) { this.tell(`Va por el ${Math.round(T.t / T.dur * 100)} por ciento.`); return; }
        T.running = true;
        this.sound(ShipSounds.key());
        this.taskUI({ text: T.step === 0 ? 'Llenando la lata.' : 'Echando el combustible.', buttons: [{ k: 'Enter', label: 'Cuánto falta' }] });
        this.tell(T.step === 0 ? 'Llenando.' : 'Echando.');
    }
    combustibleTick(T, dt) {
        if (!T.running) return;
        T.t += dt;
        const x = Math.min(1, T.t / T.dur), level = T.step === 0 ? x : 1 - x;
        // El gorgoteo sube al llenar y baja al vaciar.
        if ((T.drip -= dt) <= 0) { T.drip = 0.16; this.sound(ShipSounds.fuel(level)); }
        $('imp-task-art').innerHTML = this.fuelArt(T, level);
        if (x >= 1) this.finishTask();
    }
    fuelArt(T, level) {
        const h = 90, y = 10 + h * (1 - level);
        return `<svg viewBox="0 0 200 110"><rect x="70" y="10" width="60" height="${h}" rx="8" fill="#1b2233" stroke="#3a4560" stroke-width="3"/><rect x="73" y="${y.toFixed(1)}" width="54" height="${Math.max(0, h - 3 - (y - 10)).toFixed(1)}" rx="5" fill="#f08a3c"/><text x="100" y="62" text-anchor="middle" font-size="18" font-weight="800" fill="#fff">${Math.round(level * 100)} %</text></svg>`;
    }

    // · Interruptores: los de las luces y los de los escudos. Cada uno, con su número; hay que encenderlos todos.
    switchesStart(T, { n, word, intro, hint }) {
        T.sw = Array.from({ length: n }, () => this.uiRng.chance(0.5));
        if (T.sw.every(Boolean)) T.sw[this.uiRng.int(n)] = false;
        T.word = word;
        const btns = T.sw.map((_, k) => ({ k: String(k + 1), label: String(k + 1), cls: 'imp-key' }));
        this.taskUI({ text: this.switchesText(T), art: this.switchesArt(T), buttons: [...btns, { k: ' ', label: 'Cómo están', cls: 'imp-wide' }] });
        this.tell(`${intro} ${this.switchesState(T)}${this.hint(hint, `${this.touch ? 'Toca' : 'Pulsa'} el número de cada uno: suena agudo al encenderse y grave al apagarse. ${this.touch ? 'Cómo están' : 'Espacio'} te dice cuáles faltan.`)}`);
    }
    switchesState(T) {
        const off = T.sw.map((on, k) => on ? null : k + 1).filter(x => x != null);
        return off.length ? `${off.length === 1 ? 'Falta' : 'Faltan'} ${off.length === 1 ? 'el' : 'los'} ${Txt.list(off.map(String))}.` : 'Todos encendidos.';
    }
    switchesText(T) { return `Enciende todos ${T.word}. ${this.switchesState(T)}`; }
    switchesKey(T, k) {
        if (k === ' ' || k === 'Enter') { this.tell(this.switchesState(T)); return; }
        const i = +k - 1;
        if (!(i >= 0 && i < T.sw.length)) return;
        T.sw[i] = !T.sw[i];
        this.sound(ShipSounds.flip(T.sw[i]));
        this.taskUI({ text: this.switchesText(T), art: this.switchesArt(T) });
        if (T.sw.every(Boolean)) { this.finishTask(); return; }
        this.tell(`${i + 1}, ${T.sw[i] ? 'encendido' : 'apagado'}.`, { interrupt: true });
    }
    switchesArt(T) {
        const n = T.sw.length, w = 200 / n;
        return `<svg viewBox="0 0 200 90">${T.sw.map((on, k) => {
            const x = k * w + w / 2;
            return `<rect x="${(x - 14).toFixed(1)}" y="8" width="28" height="56" rx="8" fill="#1b2233" stroke="${on ? '#5cc46a' : '#e05656'}" stroke-width="3"/><rect x="${(x - 9).toFixed(1)}" y="${on ? 13 : 37}" width="18" height="22" rx="5" fill="${on ? '#5cc46a' : '#e05656'}"/><text x="${x.toFixed(1)}" y="84" text-anchor="middle" font-size="15" font-weight="800" fill="#fff">${k + 1}</text>`;
        }).join('')}</svg>`;
    }
    // Encender los escudos (una tarea) y arreglar las luces (el sabotaje de Electricidad).
    escudosStart(T) { this.switchesStart(T, { n: T.easy ? 5 : 7, word: 'los escudos', intro: 'Encender los escudos.', hint: 'escudos' }); }
    escudosKey(T, k) { this.switchesKey(T, k); }
    lucesStart(T) {
        $('imp-task-title').textContent = 'El cuadro de las luces';
        Board.status('Arregla las luces');
        this.switchesStart(T, { n: T.easy ? 4 : 5, word: 'los interruptores', intro: 'El cuadro de las luces: enciende todos los interruptores.', hint: 'luces' });
    }
    lucesKey(T, k) { this.switchesKey(T, k); }

    // · La mano en el panel del reactor: hasta que haya otra persona en el otro panel.
    reactorStart(T) {
        $('imp-task-title').textContent = 'El panel del reactor';
        Board.status('Mano en el panel del reactor');
        T.beat = 0;
        this.taskUI({ text: this.reactorText(), art: this.reactorArt(), buttons: [{ k: ' ', label: 'Cómo va' }] });
        const panel = SHIP.panels.find(x => x.id === T.panel);
        this.tell(`Pones la mano en ${panel.name}. ${this.reactorText()}${this.hint('hold', `No te muevas hasta que se arregle. Para quitar la mano, ${this.press('Escape', 'Quitar la mano')}.`)}`);
    }
    reactorText() {
        const g = this.game, other = SHIP.panels.find(x => x.sab === 'reactor' && x.id !== this.task?.panel);
        const who = other && g.players.find(pl => pl.busy?.fix === other.id);
        const left = g.sab ? Math.max(0, Math.ceil(g.sab.until - g.time)) : 0;
        return `${who ? `${this.Nm(who.index)} tiene la mano en ${other.name}.` : `Falta alguien en ${other?.name}.`} Quedan ${left} segundos.`;
    }
    reactorKey(T, k) { if (k === ' ' || k === 'Enter') this.tell(this.reactorText()); }
    reactorTick(T, dt) {
        if ((T.beat -= dt) > 0) return;
        T.beat = 1;
        this.sound(ShipSounds.target());
        this.taskUI({ text: this.reactorText(), art: this.reactorArt() });
    }
    reactorArt() {
        const held = this.game.reactorHeld();
        return `<svg viewBox="0 0 200 90">${SHIP.panels.filter(x => x.sab === 'reactor').map((x, k) => {
            const on = held.includes(x.id), cx = 50 + k * 100;
            return `<rect x="${cx - 34}" y="8" width="68" height="62" rx="10" fill="#1b2233" stroke="${on ? '#5cc46a' : '#e05656'}" stroke-width="4"/><path d="M ${cx - 12} 56 L ${cx - 12} 28 M ${cx - 4} 56 L ${cx - 4} 20 M ${cx + 4} 56 L ${cx + 4} 22 M ${cx + 12} 56 L ${cx + 12} 30" stroke="${on ? '#5cc46a' : '#56627e'}" stroke-width="6" stroke-linecap="round"/><text x="${cx}" y="86" text-anchor="middle" font-size="12" fill="#fff">${k ? 'Derecho' : 'Izquierdo'}</text>`;
        }).join('')}</svg>`;
    }

    // · Las consolas: el mapa con cuántos hay en cada sala, las cámaras de los pasillos y las constantes vitales.
    /** Lo que dice la consola, la primera vez que la miras o cuando la vuelves a mirar. */
    showConsole(e) {
        const T = this.task;
        if (T?.type === 'consola' && T.id === e.id) { T.data = e.data; this.taskUI({ text: this.consoleText(e.id, e.data), art: this.consoleArt(e.id, e.data) }); return; }
        if (T) return;
        this.openPanel('consola', { id: e.id, data: e.data, local: true });
    }
    consolaStart(T) {
        const c = SHIP.consoles.find(x => x.id === T.id);
        $('imp-task-title').textContent = cap(c.name);
        Board.status(cap(c.name));
        T.t = 0; T.last = this.consoleSig(T.id, T.data);
        this.sound(ShipSounds.console());
        this.taskUI({ text: this.consoleText(T.id, T.data), art: this.consoleArt(T.id, T.data), buttons: [{ k: ' ', label: 'Repetir' }] });
        this.tell(`${this.consoleText(T.id, T.data)}${this.hint('console', `Se pone al día sola; ${this.touch ? 'Repetir' : 'Espacio'} lo vuelve a decir. Para irte, anda.`)}`, { keep: true });
    }
    consolaKey(T, k) { if (k === ' ' || k === 'Enter') this.tell(this.consoleText(T.id, T.data), { keep: true }); }
    /** Cada segundo, la consola se pone al día; si cambia algo, se dice. */
    consolaTick(T, dt) {
        if ((T.t -= dt) > 0) return;
        T.t = 1;
        const res = this.game.act({ type: 'console', p: this.me, id: T.id });
        if (!res.ok) { this.closeTask(); return; }
        T.data = res.events[0].data;
        const key = this.consoleSig(T.id, T.data);
        this.taskUI({ text: this.consoleText(T.id, T.data), art: this.consoleArt(T.id, T.data) });
        if (key === T.last) return;
        T.last = key;
        this.sound(ShipSounds.console());
        if (!this.speech.busy || T.id === 'cams') this.tell(this.consoleText(T.id, T.data, true));
    }
    consoleSig(id, d) { return JSON.stringify(d); }
    whoName(p) { return p === this.me ? 'tú' : this.seats[p].name; }
    consoleText(id, d, short = false) {
        if (id === 'admin') {
            const rooms = SHIP.areas.filter(a => a.kind === 'room' && d.counts[a.id]);
            const list = rooms.map(a => `${this.areaName(a.id)}, ${d.counts[a.id]}`);
            return `${short ? '' : 'El mapa de la nave: cuántos hay en cada sala. '}${list.length ? cap(impList(list)) : 'No hay nadie en las salas'}.${short ? '' : ' En las demás, nadie. En los pasillos y en los conductos no se ve.'}`;
        }
        if (id === 'cams') {
            const parts = d.cams.filter(c => c.seen.length || c.bodies.length).map(c => {
                const a = SHIP.byId[c.area], what = [...c.seen.map(p => this.whoName(p)), ...c.bodies.map(p => `el cuerpo ${ofWhom(this.whoName(p))}`)];
                return `en ${a.name}, ${Txt.list(what)}`;
            });
            if (short) return `Cámaras: ${parts.length ? impList(parts) : 'no se ve a nadie'}.`;
            return `Las cámaras de los pasillos: ${impList(d.cams.map(c => this.areaName(c.area).replace(/^el pasillo /, '')))}. ${parts.length ? cap(impList(parts)) : 'No se ve a nadie'}.`;
        }
        const dead = d.dead.map(p => this.whoName(p));
        return `${short ? '' : 'Las constantes vitales: quién vive y quién no, aunque nadie haya encontrado el cuerpo. '}Vivos, ${d.alive.length}: ${Txt.list(d.alive.map(p => this.whoName(p)))}.${dead.length ? ` Muertos: ${Txt.list(dead)}.` : ' No ha muerto nadie.'}`;
    }
    consoleArt(id, d) {
        if (id === 'admin') {
            const s = 3.3, X = x => (x * s).toFixed(1), Y = y => (y * s).toFixed(1);
            const rooms = SHIP.areas.filter(a => a.kind === 'room').map(a => {
                const n = d.counts[a.id] || 0;
                return `<rect x="${X(a.x)}" y="${Y(a.y)}" width="${X(a.w)}" height="${Y(a.h)}" rx="3" fill="${n ? '#2f6b3a' : '#1b2233'}" stroke="#3a4560" stroke-width="1.5"/>${n ? `<text x="${X(a.cx)}" y="${(+Y(a.cy) + 7).toFixed(1)}" text-anchor="middle" font-size="20" font-weight="800" fill="#fff">${n}</text>` : ''}`;
            }).join('');
            return `<svg viewBox="0 0 ${X(58)} ${Y(40)}">${rooms}</svg>`;
        }
        if (id === 'cams') {
            return `<ul class="imp-list">${d.cams.map(c => `<li><b>${impEsc(cap(this.areaName(c.area).replace(/^el pasillo entre /, '')))}</b>: ${impEsc([...c.seen.map(p => this.whoName(p)), ...c.bodies.map(p => `cuerpo ${ofWhom(this.whoName(p))}`)].join(', ') || 'nadie')}</li>`).join('')}</ul>`;
        }
        return `<ul class="imp-list">${this.game.players.map(pl => `<li class="${d.dead.includes(pl.index) ? 'dead' : 'ok'}">${impEsc(cap(this.whoName(pl.index)))}: ${d.dead.includes(pl.index) ? 'muerto' : 'vivo'}</li>`).join('')}</ul>`;
    }

    // ── Los conductos y los sabotajes ─────────────────
    /** V: entrar en el conducto que tienes al lado, o salir del que estás. */
    ventKey() {
        const g = this.game, me = this.mePl;
        if (g.phase !== 'ship') { this.explainCant(); return; }
        if (!this.amImpostor) { this.audio.error(); this.tell(g.impostorCount() ? 'Solo los impostores van por los conductos. Tú eres tripulante.' : 'En esta partida no hay impostores.'); return; }
        if (!me.alive) { this.audio.error(); this.tell('Los fantasmas atraviesan las paredes: no necesitan conductos.'); return; }
        if (!g.rules.vents) { this.audio.error(); this.tell('En esta partida no se usan los conductos.'); return; }
        if (me.vent != null) { this.act({ type: 'vent', p: this.me }); return; }
        if (this.task?.fake) this.act({ type: 'cancelTask', p: this.me });
        else if (this.task?.local) this.closeTask();
        else if (this.task) { this.busyNotice(); return; }
        const v = g.ventHere(this.me);
        if (v) { this.act({ type: 'vent', p: this.me }); return; }
        this.audio.error();
        const near = SHIP.vents.map(o => ({ o, d: pathLength(me.x, me.y, shipPath(me.x, me.y, o.x, o.y, g.closed) || []) || Math.hypot(o.x - me.x, o.y - me.y) })).sort((a, b) => a.d - b.d)[0];
        this.tell(`Aquí no hay ningún conducto. El más cercano está ${near.o.area === me.area ? this.rel(near.o.x, near.o.y) : `${inPlace(this.areaName(near.o.area))}, ${impDist(near.d)}`}.`);
    }

    /** Dentro de un conducto, una flecha te lleva al conducto que está hacia ese lado. */
    ventMove(k) {
        const me = this.mePl, v = SHIP.vents[me.vent], [dx, dy] = IMP_MOVE[k];
        let best = null, bd = 0.35;
        for (const id of v.to) {
            const o = SHIP.vents[id], d = Math.hypot(o.x - v.x, o.y - v.y), dot = ((o.x - v.x) * dx + (o.y - v.y) * dy) / d;
            if (dot > bd) { bd = dot; best = o; }
        }
        if (!best) { this.audio.error(); this.tell(`Por ahí no va ningún conducto. Este lleva ${impList(this.ventExits(v))}.`); return; }
        this.act({ type: 'ventTo', p: this.me, to: best.id });
    }
    ventPick(k) {
        const v = SHIP.vents[this.mePl.vent], id = v.to[k];
        if (id == null) { this.audio.error(); this.tell(`Este conducto lleva ${impList(this.ventExits(v))}.`); return; }
        this.act({ type: 'ventTo', p: this.me, to: id });
    }

    /** X: sabotear. La partida se para mientras eliges. */
    async sabotageMenu() {
        const g = this.game, me = this.mePl;
        if (g.phase !== 'ship' || Dialog.active) { if (g.phase !== 'ship') this.explainCant(); return; }
        if (!this.amImpostor) { this.audio.error(); this.tell(g.impostorCount() ? 'Solo los impostores sabotean. Tú eres tripulante.' : 'En esta partida no hay impostores.'); return; }
        if (!g.rules.sabotages) { this.audio.error(); this.tell('En esta partida no hay sabotajes.'); return; }
        const label = (k, text) => {
            const w = g.sabWait(k);
            if (w == null) return `${text} (${k === 'doors' ? 'ya hay puertas cerradas' : 'ya hay un sabotaje'})`;
            return w > 0 ? `${text} (faltan ${Math.ceil(w)} segundos)` : text;
        };
        const kind = await Dialog.open({
            title: 'Sabotear',
            text: 'Elige un sabotaje. Las luces dejan a la tripulación casi a ciegas; el reactor estalla si no lo arreglan a tiempo, y las puertas encierran una sala unos segundos.',
            items: [
                { label: label('lights', 'Apagar las luces'), value: 'lights', disabled: g.sabWait('lights') !== 0 },
                { label: label('reactor', `Que estalle el reactor, en ${g.rules.reactorTime} segundos`), value: 'reactor', disabled: g.sabWait('reactor') !== 0 },
                { label: label('doors', 'Cerrar las puertas de una sala'), value: 'doors', disabled: g.sabWait('doors') !== 0 },
                { label: 'Volver', value: 'back' },
            ],
            cancel: 'back',
        });
        if (!kind || kind === 'back' || this.stopped || g.phase !== 'ship') return;
        let room = null;
        if (kind === 'doors') {
            const rooms = SHIP.areas.filter(a => a.kind === 'room').sort((a, b) => Math.hypot(a.cx - me.x, a.cy - me.y) - Math.hypot(b.cx - me.x, b.cy - me.y));
            room = await Dialog.open({
                title: '¿Qué sala cierras?',
                text: `Sus puertas se quedan cerradas ${IMPOSTOR_DOORS_TIME} segundos: nadie entra ni sale.`,
                items: [...rooms.map(a => ({ label: `${cap(a.name)}${a.id === me.area ? ', donde estás' : ''}`, value: a.id })), { label: 'Volver', value: 'back' }],
                cancel: 'back',
            });
            if (!room || room === 'back' || this.stopped || g.phase !== 'ship') return;
        }
        this.act({ type: 'sabotage', p: this.me, kind, ...(room ? { room } : {}) });
    }

    // ── Teclado ───────────────────────────────────────
    gameKey(k, e) {
        const inVent = this.game.phase === 'ship' && this.mePl.vent != null;
        if (IMP_MOVE[k]) {
            e.preventDefault();
            if (this.game.phase !== 'ship') return true;
            // Dentro de un conducto, cada flecha lleva a otro conducto.
            if (inVent) { if (!e.repeat) this.ventMove(k); return true; }
            // Al andar, el impostor deja de fingir la tarea, y se deja la consola o el cuadro de las luces.
            if (this.task?.fake || this.task?.local) this.leavePanel();
            else if (this.task) { this.busyNotice(); return true; }
            this.held.add(k);
            this.audio.unlock();
            return true;
        }
        if (inVent && /^[1-9]$/.test(k)) { e.preventDefault(); this.ventPick(+k - 1); return true; }
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
        if (k === 'v') { e.preventDefault(); this.ventKey(); return true; }
        if (k === 'x') { e.preventDefault(); this.sabotageMenu(); return true; }
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
        c.beginPath();
        [[1, 1], [57, 1], [57, 26], [43, 26], [43, 39], [1, 39]].forEach(([x, y], k) => k ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)));
        c.closePath(); c.fill();
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
        // Las puertas: una raya en el suelo; las cerradas, una barra roja.
        c.strokeStyle = 'rgba(159,180,217,.45)'; c.lineWidth = Math.max(1.5, S * 0.07); c.setLineDash([S * 0.25, S * 0.2]);
        c.beginPath();
        for (const d of SHIP.doors) { if (this.doorShut(d)) continue; const px = -d.ny * 1.5, py = d.nx * 1.5; c.moveTo(X(d.x - px), Y(d.y - py)); c.lineTo(X(d.x + px), Y(d.y + py)); }
        c.stroke(); c.setLineDash([]);
        for (const d of SHIP.doors) {
            if (!this.doorShut(d)) continue;
            // La barra ocupa las casillas del pasillo que se han vuelto pared.
            const ox2 = d.nx * 0.5, oy2 = d.ny * 0.5, px = -d.ny * 1.5, py = d.nx * 1.5;
            c.strokeStyle = '#e05656'; c.lineWidth = S * 0.9; c.lineCap = 'butt';
            c.beginPath(); c.moveTo(X(d.x + ox2 - px), Y(d.y + oy2 - py)); c.lineTo(X(d.x + ox2 + px), Y(d.y + oy2 + py)); c.stroke();
            c.strokeStyle = 'rgba(255,215,208,.8)'; c.lineWidth = Math.max(1.5, S * 0.06);
            c.beginPath(); c.moveTo(X(d.x + ox2 - px), Y(d.y + oy2 - py)); c.lineTo(X(d.x + ox2 + px), Y(d.y + oy2 + py)); c.stroke();
            c.lineCap = 'round';
        }
        // Los muebles.
        for (const f of SHIP.furniture) {
            c.fillStyle = '#7a5a3a'; c.strokeStyle = '#a07a50'; c.lineWidth = Math.max(2, S * 0.08);
            c.beginPath(); c.roundRect?.(X(f.x) + 2, Y(f.y) + 2, f.w * S - 4, f.h * S - 4, S * 0.4); c.fill(); c.stroke();
        }
        // Los conductos: una rejilla en el suelo.
        for (const v of SHIP.vents) {
            const w2 = S * 0.42, h2 = S * 0.3, mine = me.vent === v.id;
            c.fillStyle = '#0b1020'; c.strokeStyle = mine ? '#ff8a8a' : '#8da2c9'; c.lineWidth = Math.max(1.5, S * 0.06);
            c.fillRect(X(v.x) - w2, Y(v.y) - h2, w2 * 2, h2 * 2); c.strokeRect(X(v.x) - w2, Y(v.y) - h2, w2 * 2, h2 * 2);
            c.beginPath();
            for (let k = -2; k <= 2; k++) { c.moveTo(X(v.x) + k * w2 * 0.38, Y(v.y) - h2 * 0.7); c.lineTo(X(v.x) + k * w2 * 0.38, Y(v.y) + h2 * 0.7); }
            c.stroke();
        }
        // Los paneles de los sabotajes: rojos y parpadeando si hay que arreglarlos; verdes si alguien tiene la mano puesta.
        const held = g.reactorHeld();
        for (const x of SHIP.panels) {
            const live = g.sab?.kind === x.sab, on = held.includes(x.id), r = S * 0.3;
            c.fillStyle = live ? (on ? '#5cc46a' : `rgba(240,70,70,${0.6 + 0.4 * Math.sin(now * 7)})`) : '#56627e';
            c.strokeStyle = '#0b1020'; c.lineWidth = 2;
            c.fillRect(X(x.x) - r, Y(x.y) - r * 1.2, r * 2, r * 2.4); c.strokeRect(X(x.x) - r, Y(x.y) - r * 1.2, r * 2, r * 2.4);
            if (live && !on) {
                c.strokeStyle = `rgba(240,70,70,${0.4 + 0.4 * Math.sin(now * 7)})`; c.lineWidth = 3;
                c.beginPath(); c.arc(X(x.x), Y(x.y), S * 0.75, 0, Math.PI * 2); c.stroke();
            }
        }
        // Las consolas: el mapa, las pantallas de las cámaras y el monitor de las constantes vitales.
        for (const k of SHIP.consoles) {
            c.fillStyle = '#45c9c9'; c.strokeStyle = '#0b1020'; c.lineWidth = 2;
            if (k.id === 'admin') {
                const t = k.table;
                c.globalAlpha = 0.85;
                for (const a of SHIP.areas) if (a.kind === 'room') c.fillRect(X(t.x + 0.3 + a.x / 58 * (t.w - 0.6)), Y(t.y + 0.3 + a.y / 40 * (t.h - 0.6)), a.w / 58 * (t.w - 0.6) * S, a.h / 40 * (t.h - 0.6) * S);
                c.globalAlpha = 1;
            } else if (k.id === 'cams') {
                const t = k.table;
                for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#2f7fb0' : '#45c9c9'; c.fillRect(X(t.x + 0.15 + i), Y(t.y + 0.15), S * 0.7, S * 0.6); }
            } else {
                c.fillRect(X(k.x) - S * 0.35, Y(k.y) - S * 0.28, S * 0.7, S * 0.56); c.strokeRect(X(k.x) - S * 0.35, Y(k.y) - S * 0.28, S * 0.7, S * 0.56);
                c.strokeStyle = '#0b1020'; c.beginPath(); c.moveTo(X(k.x) - S * 0.28, Y(k.y)); c.lineTo(X(k.x) - S * 0.08, Y(k.y)); c.lineTo(X(k.x), Y(k.y) - S * 0.18); c.lineTo(X(k.x) + S * 0.08, Y(k.y) + S * 0.14); c.lineTo(X(k.x) + S * 0.28, Y(k.y)); c.stroke();
            }
        }
        // Las cámaras, con su luz roja.
        for (const k of SHIP.cameras) {
            c.fillStyle = '#c9c9c9'; c.beginPath(); c.arc(X(k.x), Y(k.y), S * 0.16, 0, Math.PI * 2); c.fill();
            c.fillStyle = `rgba(240,70,70,${Math.sin(now * 3) > 0 ? 0.95 : 0.3})`; c.beginPath(); c.arc(X(k.x), Y(k.y), S * 0.07, 0, Math.PI * 2); c.fill();
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
        // Quien pasa por el escáner: un haz verde.
        for (const p of this.scanning.keys()) {
            const pl = g.players[p];
            if (p !== this.me && !this.seenNow.has(p)) continue;
            const k = (now * 1.6) % 1;
            c.strokeStyle = `rgba(92,196,106,${0.9 - k * 0.6})`; c.lineWidth = 3;
            c.beginPath(); c.moveTo(X(pl.x) - S * 0.55, Y(pl.y) - S * 0.5 + k * S); c.lineTo(X(pl.x) + S * 0.55, Y(pl.y) - S * 0.5 + k * S); c.stroke();
        }
        if (this.task?.type === 'escaner') {
            const k = (now * 1.6) % 1;
            c.strokeStyle = `rgba(92,196,106,${0.9 - k * 0.6})`; c.lineWidth = 3;
            c.beginPath(); c.moveTo(X(me.x) - S * 0.55, Y(me.y) - S * 0.5 + k * S); c.lineTo(X(me.x) + S * 0.55, Y(me.y) - S * 0.5 + k * S); c.stroke();
        }
        // Dentro de un conducto: flechas hacia los conductos a los que lleva.
        if (me.vent != null) {
            const v = SHIP.vents[me.vent];
            c.strokeStyle = '#ff8a8a'; c.fillStyle = '#ff8a8a'; c.lineWidth = Math.max(2, S * 0.1);
            for (const id of v.to) {
                const o = SHIP.vents[id], d = Math.hypot(o.x - v.x, o.y - v.y), ux = (o.x - v.x) / d, uy = (o.y - v.y) / d;
                const x0 = X(v.x) + ux * S * 0.9, y0 = Y(v.y) + uy * S * 0.9, x1 = X(v.x) + ux * S * 2.3, y1 = Y(v.y) + uy * S * 2.3;
                c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
                c.beginPath(); c.moveTo(x1 + ux * S * 0.35, y1 + uy * S * 0.35); c.lineTo(x1 - uy * S * 0.25, y1 + ux * S * 0.25); c.lineTo(x1 + uy * S * 0.25, y1 - ux * S * 0.25); c.closePath(); c.fill();
                c.font = `700 ${Math.round(S * 0.36)}px system-ui, sans-serif`;
                c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 3;
                const lab = cap(this.areaName(o.area));
                c.strokeText(lab, x1 + ux * S * 0.9, y1 + uy * S * 0.9); c.fillText(lab, x1 + ux * S * 0.9, y1 + uy * S * 0.9);
                c.strokeStyle = '#ff8a8a'; c.lineWidth = Math.max(2, S * 0.1);
            }
        }
        // Los tripulantes que ves, y tú. Los fantasmas, medio transparentes; tú, dentro de un conducto, también.
        for (const pl of g.players) {
            if (pl.index !== this.me && !this.seenNow.has(pl.index)) continue;
            c.globalAlpha = pl.alive && pl.vent == null ? 1 : 0.45;
            this.drawCrew(c, X(pl.x), Y(pl.y), S, pl, pl.index === this.me);
            c.globalAlpha = 1;
        }
        // Siendo impostor, un aro rojo en quien tienes a tu alcance.
        const tg = this.inRange != null ? g.players[this.inRange] : null;
        if (tg && this.seenNow.has(tg.index)) {
            c.strokeStyle = `rgba(240,70,70,${0.6 + 0.3 * Math.sin(now * 8)})`; c.lineWidth = 3;
            c.beginPath(); c.arc(X(tg.x), Y(tg.y), S * 0.62, 0, Math.PI * 2); c.stroke();
        }
        // La niebla: más allá de lo que ves, se ve oscuro; sin luces, casi negro.
        const vis = g.visionOf(this.me), dark = g.lightsOff && me.alive && !this.amImpostor;
        const fog = c.createRadialGradient(w / 2, h / 2, vis * S * 0.75, w / 2, h / 2, vis * S * 1.15);
        fog.addColorStop(0, 'rgba(4,7,15,0)');
        fog.addColorStop(1, dark ? 'rgba(2,3,8,.94)' : 'rgba(4,7,15,.72)');
        c.fillStyle = fog;
        c.fillRect(0, 0, w, h);
        // El reactor a punto de estallar: la pantalla se enciende de rojo.
        if (g.phase === 'ship' && g.sab?.kind === 'reactor') {
            c.fillStyle = `rgba(200,30,30,${0.1 + 0.1 * Math.sin(now * (g.sab.until - g.time < 10 ? 12 : 6))})`;
            c.fillRect(0, 0, w, h);
        }
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
