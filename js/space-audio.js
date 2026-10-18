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
     amortiguado.
   Todo se sintetiza aquí, como en audio.js: no hay
   archivos de sonido.
   ============================================= */
'use strict';

/** Lo que tarda en apagarse cada sonido suelto, para soltar sus nodos después. */
const SPACE_TAIL = 1.6;

class SpaceAudio {
    constructor(engine) {
        this.engine = engine;
        this.ctx = engine.ctx;
        this.loops = new Map();     // id → sonido continuo (ambiente de cada sala, roce de las paredes)
        this.lx = 0; this.ly = 0;
        if (!this.ctx) return;
        this.root = this.ctx.createGain();
        this.root.connect(engine.bus);
        this.setListener(0, 0);
    }

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
    #point(x, y, { ref = 1.5, roll = 1, max = 40 } = {}) {
        const c = this.ctx;
        const wall = c.createBiquadFilter(); wall.type = 'lowpass'; wall.frequency.value = 20000; wall.Q.value = 0.5;
        const back = c.createBiquadFilter(); back.type = 'lowpass'; back.frequency.value = 20000; back.Q.value = 0.5;
        const gain = c.createGain();
        const pan = c.createPanner();
        pan.panningModel = 'HRTF';
        pan.distanceModel = 'inverse';
        pan.refDistance = ref; pan.rolloffFactor = roll; pan.maxDistance = max;
        wall.connect(back); back.connect(gain); gain.connect(pan); pan.connect(this.root);
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

    /** Un sonido suelto en (x, y). play(k, out, t) lo crea con el sintetizador de audio.js. */
    at(x, y, play, { wall = false, ref, roll } = {}) {
        if (!this.ctx) return;
        this.engine.resume();
        try {
            const pt = this.#point(x, y, { ref, roll });
            pt.muffle(wall, false);
            play(this.k, pt.input, this.now + 0.01);
            setTimeout(() => pt.dispose(), SPACE_TAIL * 1000);
        } catch (_) { /* sin sonido */ }
    }

    /** Un sonido en tu propio sitio (tus pasos, tus avisos): sin panorama. */
    here(play) {
        if (!this.ctx) return;
        this.engine.resume();
        try { play(this.k, this.root, this.now + 0.01); } catch (_) { /* sin sonido */ }
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

    dispose() {
        for (const lp of this.loops.values()) { try { lp.stop?.(); } catch (_) { /* parado */ } lp.dispose(); }
        this.loops.clear();
        if (this.root) { try { this.root.disconnect(); } catch (_) { /* ya estaba */ } }
    }
}

// ── Los sonidos de la nave ────────────────────────
// Cada uno es una función (k, out, t) para SpaceAudio.at o .here.

/** El timbre de los pasos de cada jugador: así se reconoce a cada uno sin verlo. */
const STEP_TIMBRES = [
    { f: 1500, low: 105, q: 1.2 },   // tú
    { f: 900, low: 150, q: 2.5 },
    { f: 2600, low: 85, q: 3 },
    { f: 1200, low: 210, q: 5 },
    { f: 3600, low: 120, q: 2 },
    { f: 650, low: 95, q: 4 },
    { f: 2000, low: 180, q: 6 },
    { f: 4500, low: 140, q: 3.5 },
    { f: 1700, low: 70, q: 8 },
    { f: 3000, low: 240, q: 1.6 },
];

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
    /** La baliza de la guía: un pitido de sonar. */
    ping() {
        return (k, out, t) => {
            k.tone(out, { t, f: 1320, dur: 0.14, peak: 0.26 });
            k.tone(out, { t, f: 2640, dur: 0.06, peak: 0.04 });
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
};

/** Los ambientes continuos de cada sala. Cada uno crea sus nodos y devuelve con qué pararlos. */
const ROOM_AMBIENCE = {
    motores(c, out, k) {
        const nodes = [];
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.connect(out);
        for (const [f, g] of [[46, 0.22], [92, 0.07], [69, 0.05]]) {
            const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
            const gg = c.createGain(); gg.gain.value = g; o.connect(gg); gg.connect(lp); o.start(); nodes.push(o);
        }
        nodes.push(noiseBed(c, k, out, { type: 'lowpass', f: 380 }, 0.2, 0.35, 0.08));
        return () => nodes.forEach(n => n.stop());
    },
    comedor(c, out) {
        const o = c.createOscillator(); o.frequency.value = 117;
        const g = c.createGain(); g.gain.value = 0.05; o.connect(g); g.connect(out); o.start();
        return () => o.stop();
    },
    puente(c, out, k) {
        const n = noiseBed(c, k, out, { type: 'highpass', f: 3500 }, 0.025, 0.2, 0.01);
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
        const n = noiseBed(c, k, out, { type: 'bandpass', f: 520, q: 0.7 }, 0.16, 0.12, 0.07);
        return () => n.stop();
    },
    enfermeria(c, out, k) {
        const n = noiseBed(c, k, out, { type: 'lowpass', f: 900 }, 0.04, 0.25, 0.015);
        return () => n.stop();
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
