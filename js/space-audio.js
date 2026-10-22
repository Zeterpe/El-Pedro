/* =============================================
   EL PEDRO — space-audio.js
   El sonido 3D de El Impostor, con Web Audio (HRTF):
   cada cosa suena desde su sitio de la nave y tu
   oído es tu personaje. Con auriculares se oye si
   algo está a la izquierda o a la derecha, delante
   o detrás, cerca o lejos.
   · Siempre miras al norte: lo que está a tu derecha
     en la pantalla suena a tu derecha, lo de arriba
     suena delante y lo de abajo, detrás y más apagado.
   · Lo que está al otro lado de una pared suena
     amortiguado. A los demás jugadores solo se les
     oye si se les ve (lo decide la mesa).
   · Cada persona a la que ves suena con su nota
     (PRESENCE_NOTES), y la guía pita más agudo si hay
     que ir hacia delante y más grave hacia detrás.
   · Un cuerpo suena como un monitor plano, y una muerte,
     como un golpe sordo desde donde pasa.
   · Los sabotajes: la sirena del reactor suena desde el
     Reactor en toda la nave, y los paneles que lo
     arreglan pitan desde su sitio. Las puertas que se
     cierran dan un portazo; los conductos, un golpe de
     chapa.
   · Cada sonido va en su grupo (SOUND_GROUPS: el
     ambiente, los demás, lo tuyo, la guía y los avisos),
     con su volumen en los ajustes (setMix).
   Todo se sintetiza aquí, como en audio.js: no hay
   archivos de sonido.
   ============================================= */
'use strict';

/** Lo que tarda en apagarse cada sonido suelto, para soltar sus nodos después. */
const SPACE_TAIL = 1.6;

/**
 * Los grupos de sonidos, cada uno con su volumen (ajuste impostorSound): el ambiente de las salas, los demás
 * (sus pasos y su sonido), lo tuyo (tus pasos, los golpes y el roce de las paredes), la guía y los avisos.
 */
const SOUND_GROUPS = ['amb', 'people', 'mine', 'guide', 'cues'];
const SOUND_DEFAULTS = { amb: 1, people: 1, mine: 1, guide: 1, cues: 1 };

class SpaceAudio {
    /** x, y: dónde está tu oído al empezar. */
    constructor(engine, { x = 0, y = 0 } = {}) {
        this.engine = engine;
        this.ctx = engine.ctx;
        this.loops = new Map();     // id → sonido continuo (ambiente de cada sala, roce de las paredes)
        this.lx = 0; this.ly = 0;
        if (!this.ctx) return;
        this.root = this.ctx.createGain();
        this.root.connect(engine.bus);
        this.groups = {};
        for (const id of SOUND_GROUPS) { const g = this.groups[id] = this.ctx.createGain(); g.connect(this.root); }
        this.setListener(x, y);
    }

    /** El volumen de cada grupo: mix = { amb, people, mine, guide, cues }, con 1 el normal. */
    setMix(mix = {}) {
        if (!this.ctx) return;
        for (const id of SOUND_GROUPS) this.groups[id].gain.setTargetAtTime(clamp(+(mix[id] ?? 1), 0, 2), this.now, 0.05);
    }
    out(group) { return this.groups[group] || this.groups.cues; }

    get ok() { return !!this.ctx; }
    get k() { return this.engine.synth; }
    get now() { return this.ctx.currentTime; }

    /** Dónde está tu oído. Siempre mira al norte (arriba en la pantalla). */
    setListener(x, y) {
        this.lx = x; this.ly = y;
        if (!this.ctx) return;
        const L = this.ctx.listener, t = this.now;
        if (L.positionX) {
            L.positionX.setTargetAtTime(x, t, 0.02); L.positionY.setTargetAtTime(0, t, 0.02); L.positionZ.setTargetAtTime(y, t, 0.02);
            L.forwardX.value = 0; L.forwardY.value = 0; L.forwardZ.value = -1;
            L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
        } else {
            L.setPosition(x, 0, y);
            L.setOrientation(0, 0, -1, 0, 1, 0);
        }
    }

    /** Se calla (pausa) o vuelve a sonar. */
    setActive(on) {
        if (!this.ctx) return;
        this.root.gain.setTargetAtTime(on ? 1 : 0, this.now, 0.08);
    }

    /**
     * Un punto que suena: filtro de pared → filtro de detrás → volumen → panorama 3D.
     * Devuelve la entrada (donde se conecta el sonido) y cómo moverlo.
     */
    #point(x, y, { ref = 1.5, roll = 1, max = 40, group = 'cues' } = {}) {
        const c = this.ctx;
        const wall = c.createBiquadFilter(); wall.type = 'lowpass'; wall.frequency.value = 20000; wall.Q.value = 0.5;
        const back = c.createBiquadFilter(); back.type = 'lowpass'; back.frequency.value = 20000; back.Q.value = 0.5;
        const gain = c.createGain();
        const pan = c.createPanner();
        pan.panningModel = 'HRTF';
        pan.distanceModel = 'inverse';
        pan.refDistance = ref; pan.rolloffFactor = roll; pan.maxDistance = max;
        wall.connect(back); back.connect(gain); gain.connect(pan); pan.connect(this.out(group));
        const pt = {
            input: wall, gain, pan,
            place: (px, py, smooth = false) => {
                if (pan.positionX) {
                    if (smooth) { const t = this.now; pan.positionX.setTargetAtTime(px, t, 0.03); pan.positionY.setTargetAtTime(0, t, 0.03); pan.positionZ.setTargetAtTime(py, t, 0.03); }
                    else { pan.positionX.value = px; pan.positionY.value = 0; pan.positionZ.value = py; }
                } else pan.setPosition(px, 0, py);
                // Lo que está detrás (al sur) suena más apagado: así se distingue de lo que está delante.
                const d = Math.hypot(px - this.lx, py - this.ly);
                const behind = d < 0.5 ? 0 : clamp((py - this.ly) / d, 0, 1);
                back.frequency.setTargetAtTime(18000 * Math.pow(0.12, behind), this.now, smooth ? 0.05 : 0.001);
            },
            /** Al otro lado de una pared: más bajo y sin agudos. */
            muffle: (on, smooth = true) => {
                const t = this.now, tc = smooth ? 0.12 : 0.001;
                wall.frequency.setTargetAtTime(on ? 750 : 20000, t, tc);
                gain.gain.setTargetAtTime(on ? 0.45 : 1, t, tc);
            },
            dispose: () => { try { pan.disconnect(); } catch (_) { /* ya estaba */ } },
        };
        pt.place(x, y);
        return pt;
    }

    /** Un sonido suelto en (x, y), de un grupo (los avisos, si no se dice). play(k, out, t) lo crea con el sintetizador de audio.js. */
    at(x, y, play, { wall = false, ref, roll, group } = {}) {
        if (!this.ctx) return;
        this.engine.resume();
        try {
            const pt = this.#point(x, y, { ref, roll, group });
            pt.muffle(wall, false);
            play(this.k, pt.input, this.now + 0.01);
            setTimeout(() => pt.dispose(), SPACE_TAIL * 1000);
        } catch (_) { /* sin sonido */ }
    }

    /** Un sonido en tu propio sitio (tus pasos, tus avisos): sin panorama. */
    here(play, group = 'cues') {
        if (!this.ctx) return;
        this.engine.resume();
        try { play(this.k, this.out(group), this.now + 0.01); } catch (_) { /* sin sonido */ }
    }

    /** Un sonido continuo en (x, y). build(ctx, input, synth) crea sus nodos y devuelve con qué pararlos. */
    loop(id, x, y, build, opts = {}) {
        if (!this.ctx || this.loops.has(id)) return this.loops.get(id);
        const pt = this.#point(x, y, opts);
        pt.gain.gain.value = 0;
        const stop = build(this.ctx, pt.input, this.k);
        const lp = { ...pt, x, y, level: 0, stop };
        this.loops.set(id, lp);
        return lp;
    }

    /** Mueve un sonido continuo y le pone volumen (0 lo calla) y pared. */
    setLoop(id, { x, y, level, wall } = {}) {
        const lp = this.loops.get(id);
        if (!lp) return;
        if (x != null) { lp.x = x; lp.y = y; }
        lp.place(lp.x, lp.y, true);
        if (wall != null) lp.muffle(wall);
        if (level != null) {
            const g = (wall ? 0.45 : 1) * level;
            lp.gain.gain.setTargetAtTime(g, this.now, 0.08);
            lp.level = level;
        }
    }

    /** Para un sonido continuo y lo quita. */
    unloop(id) {
        const lp = this.loops.get(id);
        if (!lp) return;
        this.loops.delete(id);
        try { lp.stop?.(); } catch (_) { /* parado */ }
        lp.dispose();
    }

    dispose() {
        for (const lp of this.loops.values()) { try { lp.stop?.(); } catch (_) { /* parado */ } lp.dispose(); }
        this.loops.clear();
        if (this.root) { try { this.root.disconnect(); } catch (_) { /* ya estaba */ } }
    }
}

// ── Los sonidos de la nave ────────────────────────
// Cada uno es una función (k, out, t) para SpaceAudio.at o .here.

/**
 * El timbre de los pasos de cada uno: el primero es el tuyo y los demás van por color (IMPOSTOR_COLORS), uno detrás
 * de otro, así que el marrón suena siempre igual en todos los aparatos.
 */
const STEP_TIMBRES = [
    { f: 1500, low: 105, q: 1.2 },   // tú
    { f: 900, low: 150, q: 2.5 },    // rojo
    { f: 2600, low: 85, q: 3 },      // azul
    { f: 1200, low: 210, q: 5 },     // verde
    { f: 3600, low: 120, q: 2 },     // amarillo
    { f: 650, low: 95, q: 4 },       // naranja
    { f: 2000, low: 180, q: 6 },     // morado
    { f: 4500, low: 140, q: 3.5 },   // rosa
    { f: 1700, low: 70, q: 8 },      // cian
    { f: 3000, low: 240, q: 1.6 },   // blanco
    { f: 800, low: 60, q: 3 },       // marrón
];
/** La nota de cada color (IMPOSTOR_COLORS): una escala pentatónica, para que no desafinen juntas. La tuya no suena. */
const PRESENCE_NOTES = [392, 440, 523, 587, 659, 784, 880, 1047, 1175, 1319];

const ShipSounds = {
    /** Un paso. floor: metal, rejilla o moqueta. vol: 1 normal. */
    step(timbre, floor, vol = 1) {
        return (k, out, t) => {
            const soft = floor === 'moqueta';
            k.noise(out, { t, dur: soft ? 0.06 : 0.045, peak: 0.32 * vol, filter: { type: 'bandpass', f: timbre.f * (soft ? 0.45 : 1), q: timbre.q } });
            k.tone(out, { t, f: [[0, timbre.low], [0.05, timbre.low * 0.6]], dur: 0.06, peak: 0.22 * vol });
            if (floor === 'metal') k.tone(out, { t: t + 0.005, f: timbre.f * 1.9, dur: 0.05, peak: 0.035 * vol });
            if (floor === 'rejilla') k.noise(out, { t: t + 0.03, dur: 0.025, peak: 0.12 * vol, filter: { type: 'bandpass', f: 3800, q: 4 } });
        };
    },
    /** Un golpe contra la pared (o contra la mesa, que suena a madera). */
    bump(what) {
        return (k, out, t) => {
            if (what === 'mesa') {
                k.tone(out, { t, f: 260, type: 'triangle', dur: 0.12, peak: 0.45 });
                k.tone(out, { t, f: 690, dur: 0.05, peak: 0.12 });
            } else {
                k.tone(out, { t, f: [[0, 95], [0.1, 55]], dur: 0.14, peak: 0.55 });
                k.noise(out, { t, dur: 0.07, peak: 0.3, filter: { type: 'lowpass', f: 900 } });
            }
        };
    },
    /** El tic de una puerta: dos golpecitos agudos. */
    door() {
        return (k, out, t) => {
            k.tone(out, { t, f: 2400, dur: 0.02, peak: 0.13 });
            k.tone(out, { t: t + 0.07, f: 1800, dur: 0.02, peak: 0.1 });
        };
    },
    /** Una tarea tuya, que te llama bajito. */
    task() {
        return (k, out, t) => {
            k.bell(out, { t, f: 1047, partials: [[1, 1, 0.25], [2, 0.3, 0.12]], peak: 0.09 });
            k.bell(out, { t: t + 0.13, f: 1319, partials: [[1, 1, 0.3], [2, 0.3, 0.15]], peak: 0.09 });
        };
    },
    /**
     * La baliza de la guía: un pitido de sonar. semis sube o baja el tono en semitonos: más agudo si hay que ir
     * hacia delante, más grave hacia detrás, y el de siempre a los lados.
     */
    ping(semis = 0) {
        const f = 1320 * Math.pow(2, semis / 12);
        return (k, out, t) => {
            k.tone(out, { t, f, dur: 0.14, peak: 0.26 });
            k.tone(out, { t, f: f * 2, dur: 0.06, peak: 0.04 });
        };
    },
    /** El sonido de alguien a quien ves: un toque suave con su nota (PRESENCE_NOTES), que se repite más deprisa cuanto más cerca está. */
    presence(f) {
        return (k, out, t) => {
            k.tone(out, { t, f, dur: 0.09, peak: 0.12, type: 'triangle' });
            k.tone(out, { t, f: f * 3, dur: 0.04, peak: 0.02 });
        };
    },
    /** La guía pasa al siguiente tramo. */
    waypoint() { return (k, out, t) => k.tone(out, { t, f: 1760, dur: 0.04, peak: 0.08 }); },
    /** Has llegado adonde te llevaba la guía. */
    arrive() {
        return (k, out, t) => {
            k.bell(out, { t, f: 1568, partials: [[1, 1, 0.4], [2.01, 0.4, 0.25]], peak: 0.16 });
            k.bell(out, { t: t + 0.12, f: 2093, partials: [[1, 1, 0.5], [2.01, 0.4, 0.3]], peak: 0.14 });
        };
    },
    /** Alguien aparece a la vista: un pequeño destello. */
    appear() { return (k, out, t) => k.tone(out, { t, f: [[0, 700], [0.08, 1100]], dur: 0.1, peak: 0.06 }); },
    // Los ruidos de cada sala, sueltos de vez en cuando.
    clink() { return (k, out, t) => k.bell(out, { t, f: 2200 + Math.random() * 900, partials: [[1, 1, 0.18], [2.7, 0.4, 0.1]], peak: 0.05 }); },
    beep() { return (k, out, t) => k.tone(out, { t, f: [880, 1175, 1397, 988][Math.floor(Math.random() * 4)], dur: 0.08, peak: 0.05, type: 'square', filter: { type: 'lowpass', f: 2500 } }); },
    monitor() { return (k, out, t) => k.tone(out, { t, f: 1000, dur: 0.11, peak: 0.07 }); },
    crackle() {
        return (k, out, t) => {
            for (let i = 0; i < 4; i++) k.noise(out, { t: t + i * 0.025 + Math.random() * 0.02, dur: 0.012, peak: 0.12, filter: { type: 'highpass', f: 2500 } });
        };
    },
    // Los minijuegos de las tareas.
    note(f, dur = 0.35) { return (k, out, t) => { k.tone(out, { t, f, dur, peak: 0.2, type: 'triangle' }); k.tone(out, { t, f: f * 2, dur: dur * 0.6, peak: 0.04 }); }; },
    plug() { return (k, out, t) => { k.noise(out, { t, dur: 0.05, peak: 0.25, filter: { type: 'bandpass', f: 1800, q: 2 } }); k.tone(out, { t: t + 0.04, f: 1320, dur: 0.12, peak: 0.12 }); }; },
    zap() { return (k, out, t) => k.tone(out, { t, f: [[0, 220], [0.25, 110]], type: 'sawtooth', dur: 0.28, peak: 0.1, filter: { type: 'lowpass', f: 1400 } }); },
    hit() { return (k, out, t) => { k.bell(out, { t, f: 1175, partials: [[1, 1, 0.35], [2, 0.5, 0.2]], peak: 0.16 }); }; },
    done() {
        return (k, out, t) => {
            [784, 988, 1175, 1568].forEach((f, i) => k.tone(out, { t: t + i * 0.08, f, dur: 0.2, peak: 0.14 }));
        };
    },
    progress(x) { return (k, out, t) => k.tone(out, { t, f: 400 + 900 * x, dur: 0.07, peak: 0.08 }); },
    key() { return (k, out, t) => k.tone(out, { t, f: 1400, dur: 0.03, peak: 0.08, type: 'square', filter: { type: 'lowpass', f: 3000 } }); },
    // Los impostores y las reuniones.
    /** Un golpe sordo y un quejido: alguien muere. */
    kill() {
        return (k, out, t) => {
            k.tone(out, { t, f: [[0, 120], [0.18, 45]], dur: 0.22, peak: 0.6 });
            k.noise(out, { t, dur: 0.12, peak: 0.35, filter: { type: 'lowpass', f: [[0, 2400], [0.1, 400]] } });
            k.tone(out, { t: t + 0.05, f: [[0, 520], [0.5, 180]], type: 'sawtooth', dur: 0.55, peak: 0.12, filter: { type: 'bandpass', f: 900, q: 3 } });
        };
    },
    /** La alarma de la reunión. */
    alarm() {
        return (k, out, t) => {
            for (let i = 0; i < 3; i++) {
                k.tone(out, { t: t + i * 0.36, f: 660, type: 'square', dur: 0.16, peak: 0.1, filter: { type: 'lowpass', f: 2200 } });
                k.tone(out, { t: t + i * 0.36 + 0.18, f: 880, type: 'square', dur: 0.16, peak: 0.1, filter: { type: 'lowpass', f: 2200 } });
            }
        };
    },
    /** Un voto: un sello sobre la mesa. */
    vote() {
        return (k, out, t) => {
            k.tone(out, { t, f: [[0, 300], [0.06, 140]], dur: 0.08, peak: 0.3 });
            k.noise(out, { t, dur: 0.03, peak: 0.15, filter: { type: 'lowpass', f: 1800 } });
        };
    },
    /** Alguien sale de la nave por la escotilla. */
    eject() {
        return (k, out, t) => {
            k.noise(out, { t, a: 0.25, dur: 1.4, r: 2.4, peak: 0.28, filter: { type: 'bandpass', f: [[0, 400], [1.3, 3200]], q: 1.5 } });
            k.tone(out, { t: t + 0.05, f: [[0, 90], [1, 40]], dur: 1.1, r: 1.6, peak: 0.25 });
        };
    },
    /** Eres tripulante: unas notas que suben, claras. */
    roleCrew() { return (k, out, t) => [523, 659, 784, 1047].forEach((f, i) => k.tone(out, { t: t + i * 0.11, f, dur: 0.3, peak: 0.12, type: 'triangle' })); },
    /** Eres impostor: un acorde grave y oscuro. */
    roleImpostor() {
        return (k, out, t) => {
            for (const f of [55, 65.4, 82.4]) k.tone(out, { t, f, dur: 1.4, r: 2.2, peak: 0.16, type: 'sawtooth', filter: { type: 'lowpass', f: 420 } });
            k.tone(out, { t: t + 0.4, f: [[0, 932], [0.6, 880]], dur: 0.7, peak: 0.05, vib: { rate: 5, depth: 6 } });
        };
    },
    /** Ya puedes matar: el filo de un cuchillo. */
    knife() {
        return (k, out, t) => {
            k.noise(out, { t, dur: 0.25, r: 0.3, peak: 0.1, filter: { type: 'highpass', f: [[0, 2000], [0.2, 7000]] } });
            k.bell(out, { t: t + 0.12, f: 2637, partials: [[1, 1, 0.5], [2.4, 0.3, 0.3]], peak: 0.05 });
        };
    },
    /** Alguien está a tu alcance: dos latidos. */
    target() {
        return (k, out, t) => {
            k.tone(out, { t, f: 70, dur: 0.1, peak: 0.28 });
            k.tone(out, { t: t + 0.18, f: 58, dur: 0.1, peak: 0.22 });
        };
    },
    // Los sabotajes, las puertas y los conductos.
    /** Se apagan las luces: un zumbido que se hunde y un chasquido. */
    lightsOff() {
        return (k, out, t) => {
            k.tone(out, { t, f: [[0, 520], [0.9, 60]], type: 'sawtooth', dur: 1, peak: 0.12, filter: { type: 'lowpass', f: 1600 } });
            k.noise(out, { t: t + 0.9, dur: 0.05, peak: 0.25, filter: { type: 'bandpass', f: 2200, q: 2 } });
        };
    },
    /** Vuelve la luz: el zumbido sube. */
    lightsOn() {
        return (k, out, t) => {
            k.noise(out, { t, dur: 0.04, peak: 0.2, filter: { type: 'bandpass', f: 2200, q: 2 } });
            k.tone(out, { t: t + 0.05, f: [[0, 80], [0.6, 520]], type: 'sawtooth', dur: 0.7, peak: 0.1, filter: { type: 'lowpass', f: 1600 } });
            [784, 1175].forEach((f, i) => k.tone(out, { t: t + 0.65 + i * 0.1, f, dur: 0.18, peak: 0.1 }));
        };
    },
    /** La sirena del reactor; más deprisa cuando quedan pocos segundos. */
    siren(fast = false) {
        return (k, out, t) => {
            const d = fast ? 0.2 : 0.42;
            k.tone(out, { t, f: 740, type: 'square', dur: d * 0.9, peak: 0.07, filter: { type: 'lowpass', f: 2000 } });
            k.tone(out, { t: t + d, f: 988, type: 'square', dur: d * 0.9, peak: 0.07, filter: { type: 'lowpass', f: 2000 } });
        };
    },
    /** Un panel que hay que arreglar te llama: el del reactor pita y el de las luces chisporrotea. */
    panel(kind) {
        return (k, out, t) => {
            if (kind === 'reactor') {
                k.tone(out, { t, f: 1245, type: 'square', dur: 0.06, peak: 0.08, filter: { type: 'lowpass', f: 3000 } });
                k.tone(out, { t: t + 0.12, f: 1245, type: 'square', dur: 0.06, peak: 0.08, filter: { type: 'lowpass', f: 3000 } });
            } else if (kind === 'oxygen') {
                // El teclado del oxígeno: tres pitidos que bajan.
                [1568, 1319, 1047].forEach((f, i) => k.tone(out, { t: t + i * 0.09, f, dur: 0.07, peak: 0.07, type: 'triangle' }));
            } else if (kind === 'comms') {
                // La radio sin señal: estática y un pitido.
                k.noise(out, { t, dur: 0.22, peak: 0.08, filter: { type: 'bandpass', f: 2200, q: 0.8 } });
                k.tone(out, { t: t + 0.24, f: 2637, dur: 0.05, peak: 0.05 });
            } else {
                k.tone(out, { t, f: 196, type: 'square', dur: 0.16, peak: 0.07, filter: { type: 'lowpass', f: 1200 } });
                for (let i = 0; i < 3; i++) k.noise(out, { t: t + i * 0.04, dur: 0.012, peak: 0.1, filter: { type: 'highpass', f: 3000 } });
            }
        };
    },
    /** Se acaba el oxígeno: una alarma que sube y baja, sin sitio. */
    oxygenAlarm() {
        return (k, out, t) => {
            k.tone(out, { t, f: [[0, 520], [0.35, 880]], dur: 0.4, peak: 0.06, type: 'triangle' });
            k.tone(out, { t: t + 0.45, f: [[0, 880], [0.35, 520]], dur: 0.4, peak: 0.06, type: 'triangle' });
        };
    },
    /** El reloj de la votación, en los últimos segundos. */
    tick() { return (k, out, t) => k.tone(out, { t, f: 2000, dur: 0.02, peak: 0.07, type: 'square', filter: { type: 'lowpass', f: 3500 } }); },
    /** Una hoja seca que se mueve en el filtro. */
    leaf() { return (k, out, t) => { for (let i = 0; i < 3; i++) k.noise(out, { t: t + i * 0.07, a: 0.01, dur: 0.06, r: 0.05, peak: 0.12, filter: { type: 'bandpass', f: 3200 + Math.random() * 1500, q: 2 } }); }; },
    /** La palanca de la basura: un rugido que sube mientras la mantienes. */
    trash(x) { return (k, out, t) => k.noise(out, { t, dur: 0.2, peak: 0.14, filter: { type: 'lowpass', f: 300 + 900 * x } }); },
    /** La radio: más estática cuanto más lejos de la frecuencia buena (d de 0 a 1); en ella, un tono limpio. */
    tuner(d) {
        return (k, out, t) => {
            if (d > 0) k.noise(out, { t, dur: 0.35, peak: 0.03 + 0.12 * d, filter: { type: 'bandpass', f: 1800, q: 0.7 } });
            k.tone(out, { t, f: 880, dur: 0.35, peak: 0.12 * (1 - d) * (1 - d) });
        };
    },
    /** Alguien pone la mano en un panel. */
    hold() { return (k, out, t) => k.tone(out, { t, f: [[0, 900], [0.12, 1400]], dur: 0.16, peak: 0.12 }); },
    /** Sabotaje arreglado. */
    fixed() { return (k, out, t) => [659, 880, 1109, 1319].forEach((f, i) => k.tone(out, { t: t + i * 0.07, f, dur: 0.22, peak: 0.12, type: 'triangle' })); },
    /** Una puerta que se cierra de golpe. */
    doorSlam() {
        return (k, out, t) => {
            k.tone(out, { t, f: [[0, 85], [0.2, 40]], dur: 0.25, peak: 0.6 });
            k.noise(out, { t, dur: 0.18, peak: 0.35, filter: { type: 'bandpass', f: [[0, 1800], [0.15, 500]], q: 1.5 } });
            k.bell(out, { t: t + 0.02, f: 320, partials: [[1, 1, 0.3], [2.76, 0.4, 0.2]], peak: 0.08 });
        };
    },
    /** Una puerta que se abre: un soplido de aire. */
    doorOpen() { return (k, out, t) => k.noise(out, { t, dur: 0.35, r: 0.2, peak: 0.16, filter: { type: 'highpass', f: [[0, 4000], [0.3, 1200]] } }); },
    /** La tapa de un conducto: un golpe de chapa. */
    vent() {
        return (k, out, t) => {
            k.tone(out, { t, f: [[0, 210], [0.12, 150]], type: 'triangle', dur: 0.16, peak: 0.4 });
            k.bell(out, { t, f: 540, partials: [[1, 1, 0.25], [2.4, 0.6, 0.18], [3.9, 0.3, 0.1]], peak: 0.12 });
            k.noise(out, { t, dur: 0.06, peak: 0.2, filter: { type: 'bandpass', f: 2600, q: 2 } });
        };
    },
    /** Por dentro de un conducto: te arrastras por la chapa. */
    ventMove() { return (k, out, t) => k.noise(out, { t, a: 0.05, dur: 0.45, r: 0.2, peak: 0.2, filter: { type: 'bandpass', f: [[0, 300], [0.4, 1100]], q: 2 } }); },
    /** El escáner de la Enfermería: un barrido que sube. */
    scan() {
        return (k, out, t) => {
            k.tone(out, { t, f: [[0, 420], [0.5, 1500]], type: 'triangle', dur: 0.55, peak: 0.07 });
            k.tone(out, { t, f: [[0, 425], [0.5, 1510]], dur: 0.55, peak: 0.03 });
        };
    },
    /** El combustible que entra o sale de la lata. */
    fuel(x) { return (k, out, t) => k.noise(out, { t, dur: 0.07, peak: 0.12, filter: { type: 'bandpass', f: 280 + 700 * x, q: 6 } }); },
    /** Un interruptor que se enciende (agudo) o se apaga (grave). */
    flip(on) {
        return (k, out, t) => {
            k.noise(out, { t, dur: 0.02, peak: 0.25, filter: { type: 'bandpass', f: 3000, q: 3 } });
            k.tone(out, { t: t + 0.02, f: on ? 1320 : 330, dur: 0.12, peak: 0.12, type: on ? 'sine' : 'square', filter: { type: 'lowpass', f: 2500 } });
        };
    },
    /** Una consola: dos pitidos suaves. */
    console() { return (k, out, t) => { k.tone(out, { t, f: 1568, dur: 0.05, peak: 0.07 }); k.tone(out, { t: t + 0.08, f: 2093, dur: 0.05, peak: 0.06 }); }; },
    /** Los pasos de un fantasma: un soplo, sin suelo. */
    ghostStep(vol = 1) { return (k, out, t) => k.noise(out, { t, a: 0.03, dur: 0.12, r: 0.12, peak: 0.08 * vol, filter: { type: 'bandpass', f: 2400, q: 1.5 } }); },
    // Los ruidos de las salas nuevas.
    radio() {
        return (k, out, t) => {
            k.noise(out, { t, dur: 0.18, peak: 0.05, filter: { type: 'bandpass', f: 1800, q: 1.2 } });
            k.tone(out, { t: t + 0.2, f: [1047, 1568, 1319][Math.floor(Math.random() * 3)], dur: 0.06, peak: 0.04 });
        };
    },
    bubble() { return (k, out, t) => k.tone(out, { t, f: [[0, 300 + Math.random() * 200], [0.08, 700 + Math.random() * 300]], dur: 0.09, peak: 0.05 }); },
    hiss() { return (k, out, t) => k.noise(out, { t, a: 0.1, dur: 0.6, r: 0.4, peak: 0.07, filter: { type: 'highpass', f: 2500 } }); },
    // Los papeles y el escondite.
    /** El latido del escondite: más deprisa y más fuerte cuanto más cerca está quien busca (x, de 0 a 1). */
    heartbeat(x) {
        return (k, out, t) => {
            k.tone(out, { t, f: 62, dur: 0.09, peak: 0.12 + 0.25 * x });
            k.tone(out, { t: t + 0.16, f: 52, dur: 0.09, peak: 0.08 + 0.2 * x });
        };
    },
    /** La alarma del ruidoso: un pitido que sube y baja muy deprisa, desde su cuerpo. */
    noiseAlarm() {
        return (k, out, t) => {
            for (let i = 0; i < 6; i++) k.tone(out, { t: t + i * 0.2, f: i % 2 ? 1760 : 1320, type: 'square', dur: 0.17, peak: 0.08, filter: { type: 'lowpass', f: 3500 } });
        };
    },
    /** El cambiaformas toma otra cara: un barrido que se retuerce. */
    shift() {
        return (k, out, t) => {
            k.tone(out, { t, f: [[0, 200], [0.3, 900], [0.6, 300]], type: 'sawtooth', dur: 0.65, peak: 0.08, filter: { type: 'lowpass', f: 1800 }, vib: { rate: 9, depth: 20 } });
            k.noise(out, { t, dur: 0.5, peak: 0.08, filter: { type: 'bandpass', f: [[0, 600], [0.5, 2600]], q: 2 } });
        };
    },
    /** El espectro desaparece (un soplo que se va) o aparece (que vuelve). */
    vanish(on) {
        return (k, out, t) => {
            const f = on ? [[0, 1400], [0.5, 300]] : [[0, 300], [0.5, 1400]];
            k.noise(out, { t, a: 0.05, dur: 0.5, r: 0.2, peak: 0.12, filter: { type: 'bandpass', f, q: 3 } });
            k.tone(out, { t, f, dur: 0.5, peak: 0.04 });
        };
    },
    /** El escudo del ángel: una campana clara. */
    shield() {
        return (k, out, t) => {
            k.bell(out, { t, f: 1568, partials: [[1, 1, 0.8], [2.01, 0.5, 0.5], [3, 0.2, 0.4]], peak: 0.1 });
            k.bell(out, { t: t + 0.1, f: 2349, partials: [[1, 1, 0.8]], peak: 0.06 });
        };
    },
    /** El escudo para un cuchillo: un golpe de metal contra cristal. */
    shieldHit() {
        return (k, out, t) => {
            k.noise(out, { t, dur: 0.05, peak: 0.3, filter: { type: 'highpass', f: 3000 } });
            k.bell(out, { t, f: 1865, partials: [[1, 1, 0.6], [2.7, 0.6, 0.4]], peak: 0.16 });
        };
    },
    /** Escondite: empieza la búsqueda (un gong grave) y la última parte (un gong doble). */
    gong(twice) {
        return (k, out, t) => {
            for (let i = 0; i < (twice ? 2 : 1); i++) k.bell(out, { t: t + i * 0.5, f: 110, partials: [[1, 1, 2.5], [2.4, 0.5, 1.6], [3.9, 0.3, 1]], peak: 0.25 });
        };
    },
    /** Escondite: quien busca nota dónde está alguien, un toque de sonar grave. */
    seekPing() { return (k, out, t) => { k.tone(out, { t, f: 660, dur: 0.2, peak: 0.12 }); k.tone(out, { t: t + 0.03, f: 330, dur: 0.25, peak: 0.08 }); }; },
    /** Un poder que vuelve a estar listo. */
    ready() { return (k, out, t) => { k.tone(out, { t, f: 988, dur: 0.06, peak: 0.08 }); k.tone(out, { t: t + 0.07, f: 1319, dur: 0.08, peak: 0.08 }); }; },
    /** Te han matado: ahora eres un fantasma. */
    ghost() {
        return (k, out, t) => {
            k.tone(out, { t, f: [[0, 880], [1.2, 440]], dur: 1.3, r: 1.8, peak: 0.08, vib: { rate: 6, depth: 8 } });
            k.tone(out, { t: t + 0.2, f: [[0, 1320], [1.2, 660]], dur: 1.1, r: 1.6, peak: 0.04, vib: { rate: 5, depth: 10 } });
        };
    },
};

/** Un cuerpo: un zumbido grave que tiembla y el pitido largo de un monitor plano. Suena cuando lo tienes a la vista. */
function bodyDrone(c, out) {
    const nodes = [];
    const g = c.createGain(); g.gain.value = 0.07; g.connect(out);
    for (const f of [98, 101.5]) { const o = c.createOscillator(); o.frequency.value = f; o.connect(g); nodes.push(o); }
    const lfo = c.createOscillator(); lfo.frequency.value = 1.1;
    const lg = c.createGain(); lg.gain.value = 0.035; lfo.connect(lg); lg.connect(g.gain); nodes.push(lfo);
    const beep = c.createOscillator(); beep.frequency.value = 1320;
    const bg = c.createGain(); bg.gain.value = 0.018; beep.connect(bg); bg.connect(out); nodes.push(beep);
    nodes.forEach(o => o.start());
    return () => nodes.forEach(o => o.stop());
}

/** Una cámara encendida porque alguien la mira: un zumbido fino con un tic de vez en cuando. */
function camHum(c, out) {
    const o = c.createOscillator(); o.frequency.value = 1900;
    const g = c.createGain(); g.gain.value = 0.012; o.connect(g); g.connect(out);
    const m = c.createOscillator(); m.type = 'square'; m.frequency.value = 60;
    const mg = c.createGain(); mg.gain.value = 0.006; m.connect(mg); mg.connect(g.gain);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const h = c.createOscillator(); h.type = 'sawtooth'; h.frequency.value = 120;
    const hg = c.createGain(); hg.gain.value = 0.02; h.connect(lp); lp.connect(hg); hg.connect(out);
    [o, m, h].forEach(n => n.start());
    return () => [o, m, h].forEach(n => n.stop());
}

/** Los ambientes continuos de cada sala. Cada uno crea sus nodos y devuelve con qué pararlos. */
const ROOM_AMBIENCE = {
    motores(c, out, k) {
        const nodes = [];
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.connect(out);
        for (const [f, g] of [[46, 0.07], [92, 0.025], [69, 0.018]]) {
            const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
            const gg = c.createGain(); gg.gain.value = g; o.connect(gg); gg.connect(lp); o.start(); nodes.push(o);
        }
        nodes.push(noiseBed(c, k, out, { type: 'lowpass', f: 380 }, 0.07, 0.35, 0.03));
        return () => nodes.forEach(n => n.stop());
    },
    comedor(c, out) {
        const o = c.createOscillator(); o.frequency.value = 117;
        const g = c.createGain(); g.gain.value = 0.05; o.connect(g); g.connect(out); o.start();
        return () => o.stop();
    },
    puente(c, out, k) {
        const n = noiseBed(c, k, out, { type: 'highpass', f: 3500 }, 0.016, 0.2, 0.006);
        return () => n.stop();
    },
    electricidad(c, out, k) {
        const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 100;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 4;
        const g = c.createGain(); g.gain.value = 0.05; o.connect(bp); bp.connect(g); g.connect(out); o.start();
        const n = noiseBed(c, k, out, { type: 'bandpass', f: 6000 }, 0.015, 3, 0.012);
        return () => { o.stop(); n.stop(); };
    },
    almacen(c, out, k) {
        const n = noiseBed(c, k, out, { type: 'bandpass', f: 520, q: 0.7 }, 0.055, 0.12, 0.025);
        return () => n.stop();
    },
    enfermeria(c, out, k) {
        const n = noiseBed(c, k, out, { type: 'lowpass', f: 900 }, 0.04, 0.25, 0.015);
        return () => n.stop();
    },
    // Comunicaciones: la estática de la radio.
    comunicaciones(c, out, k) {
        const n = noiseBed(c, k, out, { type: 'bandpass', f: 2400, q: 1.8 }, 0.03, 0.6, 0.015);
        return () => n.stop();
    },
    // Oxígeno: el aire que entra y sale, como una respiración lenta.
    oxigeno(c, out, k) {
        const n = noiseBed(c, k, out, { type: 'lowpass', f: 1300 }, 0.035, 0.22, 0.026);
        return () => n.stop();
    },
    // El Reactor: un zumbido muy grave que late.
    reactor(c, out, k) {
        const nodes = [];
        const g = c.createGain(); g.gain.value = 0.065; g.connect(out);
        for (const f of [55, 57.5]) { const o = c.createOscillator(); o.frequency.value = f; o.connect(g); o.start(); nodes.push(o); }
        nodes.push(noiseBed(c, k, out, { type: 'lowpass', f: 200 }, 0.05, 0.5, 0.02));
        return () => nodes.forEach(n => n.stop());
    },
    // Seguridad: los ventiladores de las pantallas.
    seguridad(c, out, k) {
        const o = c.createOscillator(); o.frequency.value = 120;
        const g = c.createGain(); g.gain.value = 0.025; o.connect(g); g.connect(out); o.start();
        const n = noiseBed(c, k, out, { type: 'bandpass', f: 420, q: 1.2 }, 0.07, 8, 0.01);
        return () => { o.stop(); n.stop(); };
    },
    // Administración: una sala tranquila, con un zumbido suave.
    administracion(c, out, k) {
        const o = c.createOscillator(); o.frequency.value = 174;
        const g = c.createGain(); g.gain.value = 0.02; o.connect(g); g.connect(out); o.start();
        const n = noiseBed(c, k, out, { type: 'highpass', f: 5000 }, 0.012, 0.1, 0.004);
        return () => { o.stop(); n.stop(); };
    },
};

/** Un ruido de fondo que respira: filtro, volumen y un vaivén lento. */
function noiseBed(c, k, out, filt, level, rate, depth) {
    const src = c.createBufferSource(); src.buffer = k.white; src.loop = true;
    const f = c.createBiquadFilter(); f.type = filt.type; f.frequency.value = filt.f; f.Q.value = filt.q ?? 0.7;
    const g = c.createGain(); g.gain.value = level;
    const lfo = c.createOscillator(); lfo.frequency.value = rate;
    const lg = c.createGain(); lg.gain.value = depth;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(0, Math.random()); lfo.start();
    return { stop: () => { src.stop(); lfo.stop(); } };
}

/** El roce de una pared cercana: un siseo suave. */
function wallRub(c, out, k) {
    const n = noiseBed(c, k, out, { type: 'bandpass', f: 1500, q: 0.9 }, 0.12, 6, 0.03);
    return () => n.stop();
}
