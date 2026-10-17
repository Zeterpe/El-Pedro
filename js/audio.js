/* =============================================
   EL PEDRO — audio.js
   Todos los sonidos se crean al momento con Web
   Audio (no hay archivos de sonido).
   · Cada palo suena distinto: oros a monedas, copas
     a cristal, espadas a metal y bastos a madera.
     Cuanto más alta la carta, más agudo el sonido.
   · Cada jugador suena desde su sitio en la mesa:
     tú delante, los rivales a la derecha, enfrente
     y a la izquierda.
   ============================================= */
'use strict';

class Synth {
    constructor(ctx) {
        this.ctx = ctx;
        const sr = ctx.sampleRate, len = Math.floor(sr * 1.5);
        this.white = ctx.createBuffer(1, len, sr);
        const w = this.white.getChannelData(0);
        for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    }

    _path(param, t, spec) {
        if (typeof spec === 'number') { param.setValueAtTime(spec, t); return; }
        param.setValueAtTime(spec[0][1], t + spec[0][0]);
        for (let i = 1; i < spec.length; i++) {
            const [dt, v] = spec[i];
            if (v > 0 && spec[i - 1][1] > 0) param.exponentialRampToValueAtTime(v, t + dt);
            else param.linearRampToValueAtTime(v, t + dt);
        }
    }

    _out(out, o, t, end) {
        const c = this.ctx;
        const g = c.createGain();
        const a = o.a ?? 0.004, peak = o.peak ?? 0.3;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + a);
        g.gain.setTargetAtTime(0, t + a, (o.r ?? 0.15) / 4);
        let tail = g;
        if (o.pan != null) {
            const p = c.createStereoPanner();
            this._path(p.pan, t, o.pan);
            g.connect(p); tail = p;
        }
        tail.connect(out);
        return g;
    }

    _filter(spec, t) {
        const f = this.ctx.createBiquadFilter();
        f.type = spec.type || 'lowpass';
        f.Q.value = spec.q ?? 0.7;
        this._path(f.frequency, t, spec.f ?? 1000);
        return f;
    }

    tone(out, o) {
        const c = this.ctx, t = o.t ?? c.currentTime, dur = o.dur ?? 0.3;
        const osc = c.createOscillator();
        osc.type = o.type || 'sine';
        this._path(osc.frequency, t, o.f ?? 440);
        if (o.vib) {
            const lfo = c.createOscillator(), lg = c.createGain();
            lfo.frequency.value = o.vib.rate; lg.gain.value = o.vib.depth;
            lfo.connect(lg); lg.connect(osc.frequency);
            lfo.start(t); lfo.stop(t + dur + 0.6);
        }
        const g = this._out(out, { ...o, r: o.r ?? dur }, t, t + dur);
        if (o.filter) { const f = this._filter(o.filter, t); osc.connect(f); f.connect(g); } else osc.connect(g);
        osc.start(t); osc.stop(t + dur + 0.6);
        return t + dur;
    }

    noise(out, o) {
        const c = this.ctx, t = o.t ?? c.currentTime, dur = o.dur ?? 0.2;
        const src = c.createBufferSource();
        src.buffer = this.white; src.loop = true;
        const g = this._out(out, { ...o, r: o.r ?? dur }, t, t + dur);
        const f = this._filter(o.filter || { type: 'bandpass', f: 2000, q: 1 }, t);
        src.connect(f); f.connect(g);
        src.start(t, Math.random()); src.stop(t + dur + 0.6);
        return t + dur;
    }

    bell(out, { t, f, partials, peak = 0.3, pan }) {
        let end = t;
        for (const [ratio, amp, decay] of partials) end = Math.max(end, this.tone(out, { t, f: f * ratio, peak: peak * amp, r: decay, dur: decay, pan }));
        return end;
    }
}

/** Panorama de cada sitio de la mesa según cuántos jugadores hay (0 eres tú). */
function seatLayout(n) {
    if (n === 2) return ['me', 'top'];
    if (n === 3) return ['me', 'right', 'left'];
    if (n === 4) return ['me', 'right', 'top', 'left'];
    if (n === 5) return ['me', 'right', 'topright', 'topleft', 'left'];
    return ['me', 'right', 'topright', 'top', 'topleft', 'left'];
}
const SEAT_PAN = { me: 0, right: 0.8, topright: 0.4, top: 0, topleft: -0.4, left: -0.8 };
const SEAT_WORD = { right: 'a tu derecha', topright: 'enfrente, a la derecha', top: 'enfrente', topleft: 'enfrente, a la izquierda', left: 'a tu izquierda' };

class AudioEngine {
    ctx = null;
    #master = null; #sfx = null; #k = null;
    settings;
    seats = ['me', 'top'];

    constructor(settings) { this.settings = settings; }

    get ready() { return !!this.ctx; }

    /** Hay que llamarlo tras un toque o una tecla (los navegadores lo exigen). */
    unlock() {
        if (this.ctx) { this.resume(); return true; }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) { /* no disponible */ }
        const c = this.ctx = new AC();
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4;
        this.#master = c.createGain();
        this.#master.connect(comp); comp.connect(c.destination);
        this.#sfx = c.createGain(); this.#sfx.connect(this.#master);
        this.#k = new Synth(c);
        this.applySettings();
        this.resume();
        return true;
    }

    resume() {
        if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => { });
    }

    applySettings() {
        if (!this.ctx) return;
        this.#sfx.gain.value = clamp(this.settings.sfxVolume, 0, 1);
        this.#master.channelCount = this.settings.mono ? 1 : 2;
        this.#master.channelCountMode = 'explicit';
        this.#master.channelInterpretation = 'speakers';
    }

    #go(fn) {
        if (!this.ctx) return;
        this.resume();
        try { fn(this.#k, this.#sfx, this.ctx.currentTime + 0.02); } catch (_) { /* sin sonido */ }
    }

    // ── Posiciones ────────────────────────────────────
    /** me: tu sitio. Los demás se colocan a partir de ti, en el orden del juego. */
    setPlayers(n, me = 0) { this.seats = seatLayout(n); this.n = n; this.me = me; }
    seatOf(p) { return this.seats[((p - (this.me || 0)) % this.n + this.n) % this.n] || 'top'; }
    panOf(p) { return SEAT_PAN[this.seatOf(p)]; }
    /** Tus cartas, repartidas de izquierda a derecha. */
    slotPan(s, count) { return count <= 1 ? 0 : -0.6 + 1.2 * (s / Math.max(1, count - 1)); }

    // ── Cartas ────────────────────────────────────────
    flick(pan = 0, t0 = 0) {
        this.#go((k, out, t) => {
            k.noise(out, { t: t + t0, dur: 0.07, peak: 0.22, filter: { type: 'bandpass', f: [[0, 5200], [0.06, 2200]], q: 1.2 }, pan });
            k.tone(out, { t: t + t0, f: [[0, 180], [0.05, 90]], dur: 0.06, peak: 0.12, pan });
        });
    }

    shuffle() {
        this.#go((k, out, t) => {
            for (let i = 0; i < 22; i++) {
                const dt = i * 0.035 + Math.random() * 0.01;
                k.noise(out, { t: t + dt, dur: 0.025, peak: 0.12 + Math.random() * 0.08, filter: { type: 'bandpass', f: 3000 + Math.random() * 2500, q: 1.5 }, pan: (i % 2 ? 0.25 : -0.25) });
            }
            k.noise(out, { t: t + 0.82, dur: 0.12, peak: 0.25, filter: { type: 'lowpass', f: 1600 } });
        });
    }

    deal(n, perPlayer) {
        let i = 0;
        for (let k = 0; k < perPlayer; k++) for (let p = 1; p <= n; p++) this.flick(this.panOf(p % n), (i++) * 0.09);
    }

    /** La carta cae en la mesa. */
    place(pan = 0) {
        this.#go((k, out, t) => {
            k.noise(out, { t, dur: 0.09, peak: 0.32, filter: { type: 'lowpass', f: [[0, 2600], [0.08, 700]] }, pan });
            k.tone(out, { t, f: [[0, 140], [0.08, 70]], dur: 0.1, peak: 0.18, pan });
        });
    }

    /** El sonido de una carta: su palo (timbre) y su número (altura). */
    card(card, pan = 0, t0 = 0) {
        if (!card) return;
        const semis = (card.rank - 1) * 0.85;
        const up = Math.pow(2, semis / 12);
        this.#go((k, out, t0abs) => {
            const t = t0abs + t0;
            switch (card.suit) {
                case 'oros':    // monedas
                    k.bell(out, { t, f: 1250 * up, partials: [[1, 1, 0.22], [2.76, 0.55, 0.14], [5.4, 0.3, 0.08]], peak: 0.2, pan });
                    k.bell(out, { t: t + 0.07, f: 1420 * up, partials: [[1, 0.8, 0.2], [2.9, 0.4, 0.12]], peak: 0.15, pan });
                    break;
                case 'copas':   // cristal
                    k.tone(out, { t, f: 820 * up, dur: 0.9, peak: 0.2, vib: { rate: 5, depth: 3 }, pan });
                    k.tone(out, { t, f: 820 * up * 2.32, dur: 0.6, peak: 0.08, pan });
                    k.tone(out, { t, f: 820 * up * 4.25, dur: 0.35, peak: 0.04, pan });
                    break;
                case 'espadas': // metal
                    k.noise(out, { t, dur: 0.28, peak: 0.12, filter: { type: 'bandpass', f: [[0, 2500 * up], [0.25, 7000]], q: 6 }, pan });
                    k.bell(out, { t, f: 600 * up, partials: [[1, 0.8, 0.55], [1.48, 0.6, 0.45], [2.9, 0.35, 0.3], [4.1, 0.2, 0.2]], peak: 0.16, pan });
                    break;
                case 'bastos':  // madera
                    k.tone(out, { t, f: 230 * up, type: 'triangle', dur: 0.14, peak: 0.42, pan });
                    k.tone(out, { t, f: 230 * up * 2.7, dur: 0.07, peak: 0.12, pan });
                    k.noise(out, { t, dur: 0.03, peak: 0.25, filter: { type: 'bandpass', f: 1100 * up, q: 3 }, pan });
                    k.tone(out, { t: t + 0.13, f: 230 * up * 1.02, type: 'triangle', dur: 0.1, peak: 0.2, pan });
                    break;
            }
        });
    }

    /** Muestra de los cuatro palos, para la ayuda. */
    suitsDemo() {
        ['oros', 'copas', 'espadas', 'bastos'].forEach((suit, i) => this.card({ suit, rank: 5 }, 0, i * 1.1));
    }

    // ── Momentos del juego ────────────────────────────
    yourTurn() {
        this.#go((k, out, t) => {
            k.tone(out, { t, f: 659, dur: 0.18, peak: 0.16 });
            k.tone(out, { t: t + 0.12, f: 880, dur: 0.3, peak: 0.16 });
        });
    }

    otherTurn(p) {
        const pan = this.panOf(p);
        this.#go((k, out, t) => { k.tone(out, { t, f: 392, type: 'triangle', dur: 0.1, peak: 0.1, pan }); });
    }

    burnOk(pan = 0) {
        this.#go((k, out, t) => {
            k.noise(out, { t, dur: 0.45, a: 0.03, peak: 0.3, filter: { type: 'bandpass', f: [[0, 400], [0.4, 3200]], q: 1.2 }, pan });
            k.bell(out, { t: t + 0.25, f: 1568, partials: [[1, 1, 0.5], [2, 0.4, 0.3]], peak: 0.13, pan });
        });
    }

    burnFail(pan = 0) {
        this.#go((k, out, t) => {
            k.tone(out, { t, f: [[0, 330], [0.4, 150]], type: 'sawtooth', dur: 0.45, peak: 0.12, filter: { type: 'lowpass', f: 1200 }, pan });
            k.tone(out, { t: t + 0.05, f: [[0, 335], [0.4, 152]], type: 'sawtooth', dur: 0.45, peak: 0.08, filter: { type: 'lowpass', f: 900 }, pan });
        });
    }

    penalty(pan = 0) {
        this.#go((k, out, t) => {
            k.tone(out, { t, f: [[0, 110], [0.2, 50]], dur: 0.25, peak: 0.4, pan });
            k.noise(out, { t, dur: 0.08, peak: 0.2, filter: { type: 'lowpass', f: 900 }, pan });
        });
    }

    peek(pan = 0) {
        this.#go((k, out, t) => {
            [1047, 1319, 1568].forEach((f, i) => k.tone(out, { t: t + i * 0.05, f, dur: 0.22, peak: 0.07, pan }));
        });
    }

    swap(panA, panB) {
        this.#go((k, out, t) => {
            k.noise(out, { t, dur: 0.5, a: 0.05, peak: 0.22, filter: { type: 'bandpass', f: 1400, q: 2 }, pan: [[0, panA], [0.5, panB]] });
            k.noise(out, { t, dur: 0.5, a: 0.05, peak: 0.18, filter: { type: 'bandpass', f: 2600, q: 2 }, pan: [[0, panB], [0.5, panA]] });
        });
    }

    /** Brisca: alguien falla con un triunfo. */
    trumpCut(pan = 0) {
        this.#go((k, out, t) => {
            k.noise(out, { t: t + 0.05, dur: 0.18, peak: 0.22, filter: { type: 'bandpass', f: [[0, 900], [0.15, 4200]], q: 2 }, pan });
            k.tone(out, { t: t + 0.08, f: [[0, 392], [0.12, 784]], type: 'triangle', dur: 0.22, peak: 0.12, pan });
        });
    }

    /** Brisca: alguien se lleva la baza. Cuantos más puntos, más brilla. */
    collect(pan = 0, points = 0) {
        this.#go((k, out, t) => {
            k.noise(out, { t, dur: 0.22, a: 0.02, peak: 0.2, filter: { type: 'lowpass', f: [[0, 3000], [0.2, 800]] }, pan: [[0, 0], [0.2, pan]] });
            if (!points) { k.tone(out, { t: t + 0.12, f: 294, type: 'triangle', dur: 0.15, peak: 0.08, pan }); return; }
            const notes = points >= 20 ? [784, 988, 1175, 1568] : points >= 10 ? [784, 988, 1175] : [784, 988];
            notes.forEach((f, i) => k.bell(out, { t: t + 0.12 + i * 0.07, f, partials: [[1, 1, 0.35], [2.76, 0.3, 0.15]], peak: 0.1, pan }));
        });
    }

    // ── Parchís ───────────────────────────────────────
    /** El dado rueda por la mesa y se para. */
    dice(pan = 0) {
        this.#go((k, out, t) => {
            [0, 0.07, 0.15, 0.21, 0.3, 0.36, 0.43].forEach((dt, i) => {
                k.noise(out, { t: t + dt + Math.random() * 0.02, dur: 0.03, peak: 0.17 - i * 0.012, filter: { type: 'bandpass', f: 2400 + Math.random() * 1600, q: 3 }, pan });
            });
            k.tone(out, { t: t + 0.48, f: [[0, 170], [0.08, 90]], dur: 0.1, peak: 0.2, pan });
            k.noise(out, { t: t + 0.48, dur: 0.05, peak: 0.14, filter: { type: 'lowpass', f: 1200 }, pan });
        });
    }

    /** Cada casilla que avanza una ficha: un toque de madera que sube poco a poco. */
    step(pan = 0, n = 0) {
        const f = 430 * Math.pow(2, Math.min(n, 24) / 36);
        this.#go((k, out, t) => {
            k.tone(out, { t, f, type: 'triangle', dur: 0.05, peak: 0.15, pan });
            k.noise(out, { t, dur: 0.02, peak: 0.07, filter: { type: 'bandpass', f: f * 3, q: 4 }, pan });
        });
    }

    /** Una ficha sale de casa. */
    out(pan = 0) {
        this.#go((k, out, t) => {
            k.tone(out, { t, f: [[0, 260], [0.09, 720]], type: 'triangle', dur: 0.14, peak: 0.18, pan });
            k.bell(out, { t: t + 0.1, f: 1046, partials: [[1, 1, 0.25], [2.4, 0.3, 0.12]], peak: 0.08, pan });
        });
    }

    /** Una ficha llega a un seguro. */
    safe(pan = 0) {
        this.#go((k, out, t) => { k.bell(out, { t, f: 784, partials: [[1, 1, 0.3], [2, 0.3, 0.15]], peak: 0.06, pan }); });
    }

    /** Una ficha se come a otra. */
    capture(pan = 0) {
        this.#go((k, out, t) => {
            k.noise(out, { t, dur: 0.16, peak: 0.32, filter: { type: 'lowpass', f: [[0, 2600], [0.15, 500]] }, pan });
            k.tone(out, { t, f: [[0, 520], [0.4, 120]], type: 'sawtooth', dur: 0.42, peak: 0.12, filter: { type: 'lowpass', f: 1400 }, pan });
            k.tone(out, { t: t + 0.05, f: [[0, 90], [0.2, 50]], dur: 0.22, peak: 0.3, pan });
        });
    }

    /** Una ficha llega a la meta. */
    meta(pan = 0) {
        this.#go((k, out, t) => {
            [784, 988, 1175, 1568].forEach((f, i) => k.bell(out, { t: t + i * 0.08, f, partials: [[1, 1, 0.4], [2.76, 0.3, 0.16]], peak: 0.11, pan }));
        });
    }

    // ── Trivial ───────────────────────────────────────
    /** Sale una pregunta: dos notas, distintas para cada categoría. */
    question(k = 0) {
        const base = [523, 587, 659, 698, 784, 880][k] || 523;
        this.#go((k2, out, t) => {
            k2.bell(out, { t, f: base, partials: [[1, 1, 0.45], [2, 0.35, 0.25]], peak: 0.12 });
            k2.bell(out, { t: t + 0.16, f: base * 1.5, partials: [[1, 1, 0.6], [2, 0.3, 0.3]], peak: 0.12 });
        });
    }

    /** Respuesta correcta. */
    right() {
        this.#go((k, out, t) => {
            [659, 831, 988, 1319].forEach((f, i) => k.tone(out, { t: t + i * 0.07, f, type: 'triangle', dur: 0.28, peak: 0.13 }));
        });
    }

    /** Respuesta equivocada. */
    wrong() {
        this.#go((k, out, t) => {
            k.tone(out, { t, f: [[0, 220], [0.35, 150]], type: 'sawtooth', dur: 0.4, peak: 0.11, filter: { type: 'lowpass', f: 900 } });
            k.tone(out, { t: t + 0.02, f: [[0, 226], [0.35, 154]], type: 'sawtooth', dur: 0.4, peak: 0.07, filter: { type: 'lowpass', f: 700 } });
        });
    }

    /** Un quesito más. */
    wedge() {
        this.#go((k, out, t) => {
            [523, 659, 784, 1047, 1319].forEach((f, i) => k.bell(out, { t: t + i * 0.08, f, partials: [[1, 1, 0.5], [2.76, 0.3, 0.2]], peak: 0.11 }));
            k.noise(out, { t: t + 0.35, dur: 0.5, a: 0.05, peak: 0.08, filter: { type: 'highpass', f: 6000 } });
        });
    }

    pass() {
        this.#go((k, out, t) => { k.tone(out, { t, f: [[0, 330], [0.12, 247]], dur: 0.14, peak: 0.08 }); });
    }

    call(pan = 0) {
        this.#go((k, out, t) => {
            for (let i = 0; i < 12; i++) k.noise(out, { t: t + i * 0.045, dur: 0.05, peak: 0.12 + i * 0.012, filter: { type: 'bandpass', f: 220, q: 1 }, pan });
            k.bell(out, { t: t + 0.6, f: 523, partials: [[1, 1, 1.4], [2, 0.5, 1], [3, 0.35, 0.7], [4.2, 0.2, 0.5]], peak: 0.2, pan });
        });
    }

    win() {
        this.#go((k, out, t) => {
            [523, 659, 784, 1047].forEach((f, i) => k.tone(out, { t: t + i * 0.11, f, type: 'triangle', dur: 0.4, peak: 0.16 }));
            k.tone(out, { t: t + 0.45, f: 1319, dur: 0.6, peak: 0.08 });
        });
    }

    lose() {
        this.#go((k, out, t) => {
            [440, 392, 349, 294].forEach((f, i) => k.tone(out, { t: t + i * 0.14, f, type: 'triangle', dur: 0.35, peak: 0.12 }));
        });
    }

    // ── Virus ─────────────────────────────────────────
    /** Cada color suena a su órgano: el corazón late, el cerebro chispea, el estómago gruñe y el hueso suena a madera. */
    organColor(color, pan = 0, t0 = 0) {
        this.#go((k, out, t) => {
            t += t0;
            if (color === 'rojo') {
                k.tone(out, { t, f: [[0, 90], [0.1, 55]], dur: 0.14, peak: 0.32, pan });
                k.tone(out, { t: t + 0.18, f: [[0, 80], [0.1, 50]], dur: 0.12, peak: 0.24, pan });
            } else if (color === 'azul') {
                [1568, 2093, 1760].forEach((f, i) => k.tone(out, { t: t + i * 0.05, f, dur: 0.07, peak: 0.07, type: 'triangle', pan }));
            } else if (color === 'verde') {
                k.noise(out, { t, dur: 0.35, a: 0.03, peak: 0.16, filter: { type: 'bandpass', f: [[0, 180], [0.15, 320], [0.35, 140]], q: 6 }, pan });
            } else if (color === 'amarillo') {
                k.noise(out, { t, dur: 0.05, peak: 0.3, filter: { type: 'bandpass', f: 1300, q: 8 }, pan });
                k.noise(out, { t: t + 0.09, dur: 0.05, peak: 0.22, filter: { type: 'bandpass', f: 1000, q: 8 }, pan });
            } else {
                [523, 659, 784, 1047].forEach((f, i) => k.tone(out, { t: t + i * 0.045, f, dur: 0.1, peak: 0.07, type: 'triangle', pan }));
            }
        });
    }

    /** Una carta del Virus: su color y, encima, lo que es. */
    virusCard(card, pan = 0, t0 = 0) {
        if (!card) return;
        if (card.kind === 'tratamiento') { this.treatment(pan, t0); return; }
        this.organColor(card.color, pan, t0);
        this.#go((k, out, t) => {
            t += t0 + 0.05;
            if (card.kind === 'virus') k.tone(out, { t, f: [[0, 140], [0.3, 120]], type: 'sawtooth', dur: 0.3, peak: 0.05, vib: { rate: 22, depth: 18 }, filter: { type: 'lowpass', f: 700 }, pan });
            else if (card.kind === 'medicina') k.bell(out, { t, f: 1319, partials: [[1, 1, 0.3], [2.4, 0.3, 0.15]], peak: 0.06, pan });
        });
    }

    /** Se pone un órgano en el cuerpo. */
    organ(color, pan = 0) {
        this.place(pan);
        this.organColor(color, pan, 0.08);
    }

    /** Un virus infecta: zumbido que crece y un chapoteo. */
    infect(pan = 0) {
        this.#go((k, out, t) => {
            k.tone(out, { t, f: [[0, 110], [0.35, 190]], type: 'sawtooth', dur: 0.38, peak: 0.08, vib: { rate: 26, depth: 25 }, filter: { type: 'lowpass', f: 900 }, pan });
            k.noise(out, { t: t + 0.3, dur: 0.18, peak: 0.2, filter: { type: 'lowpass', f: [[0, 1800], [0.18, 300]] }, pan });
        });
    }

    /** Un órgano destruido o una vacuna rota. */
    destroy(pan = 0, big = true) {
        this.#go((k, out, t) => {
            k.noise(out, { t, dur: big ? 0.45 : 0.25, peak: big ? 0.32 : 0.2, filter: { type: 'lowpass', f: [[0, 2600], [0.4, 200]] }, pan });
            k.tone(out, { t, f: [[0, 220], [0.4, 70]], type: 'square', dur: big ? 0.45 : 0.25, peak: 0.07, filter: { type: 'lowpass', f: 600 }, pan });
        });
    }

    /** Curar o vacunar: un brillo que sube. */
    cure(pan = 0) {
        this.#go((k, out, t) => {
            [784, 988, 1319].forEach((f, i) => k.bell(out, { t: t + i * 0.06, f, partials: [[1, 1, 0.35], [2, 0.3, 0.2]], peak: 0.09, pan }));
            k.noise(out, { t: t + 0.1, dur: 0.3, peak: 0.05, filter: { type: 'highpass', f: 7000 }, pan });
        });
    }

    /** Inmunizar: un escudo que se cierra. */
    immunize(pan = 0) {
        this.#go((k, out, t) => {
            [523, 784, 1047, 1568].forEach((f, i) => k.bell(out, { t: t + i * 0.07, f, partials: [[1, 1, 0.8], [2.76, 0.3, 0.3]], peak: 0.1, pan }));
            k.tone(out, { t: t + 0.3, f: 262, dur: 0.6, peak: 0.08, type: 'triangle', pan });
        });
    }

    /** Un tratamiento: un golpe de aire. */
    treatment(pan = 0, t0 = 0) {
        this.#go((k, out, t) => {
            t += t0;
            k.noise(out, { t, dur: 0.35, a: 0.1, peak: 0.18, filter: { type: 'bandpass', f: [[0, 400], [0.35, 3200]], q: 1.2 }, pan: [[0, -pan || -0.5], [0.35, pan || 0.5]] });
            k.tone(out, { t: t + 0.2, f: 660, dur: 0.12, peak: 0.05, type: 'triangle', pan });
        });
    }

    /** El guante de látex: un chasquido de goma. */
    glove(pan = 0) {
        this.#go((k, out, t) => {
            k.tone(out, { t, f: [[0, 900], [0.06, 180]], dur: 0.08, peak: 0.2, type: 'triangle', pan });
            k.noise(out, { t, dur: 0.06, peak: 0.25, filter: { type: 'highpass', f: 2000 }, pan });
        });
    }

    // ── Interfaz ──────────────────────────────────────
    move() { this.#go((k, out, t) => k.tone(out, { t, f: 880, dur: 0.03, peak: 0.04 })); }
    select() { this.#go((k, out, t) => { k.tone(out, { t, f: 660, dur: 0.05, peak: 0.06 }); k.tone(out, { t: t + 0.05, f: 990, dur: 0.06, peak: 0.05 }); }); }
    back() { this.#go((k, out, t) => k.tone(out, { t, f: [[0, 600], [0.08, 400]], dur: 0.09, peak: 0.05 })); }
    error() { this.#go((k, out, t) => k.tone(out, { t, f: 180, type: 'square', dur: 0.12, peak: 0.05, filter: { type: 'lowpass', f: 800 } })); }
    slot(s, count) { const pan = this.slotPan(s, count); this.#go((k, out, t) => k.noise(out, { t, dur: 0.04, peak: 0.14, filter: { type: 'bandpass', f: 1800 + s * 250, q: 2 }, pan })); }
}
