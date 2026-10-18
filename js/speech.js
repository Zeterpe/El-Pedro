/* =============================================
   EL PEDRO — speech.js
   Voz del juego (síntesis del navegador) o lector
   de pantalla (regiones aria-live). Cada frase se
   puede cortar, y las largas se trocean porque
   algunos navegadores las cortan a medias.
   ============================================= */
'use strict';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Divide un texto en fragmentos cortos que la síntesis lee sin cortarse. */
function splitSpeech(text, max = 220) {
    const sentences = String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+/);
    const pieces = [];
    for (const s of sentences) {
        if (s.length <= max) { pieces.push(s); continue; }
        let rest = s;
        while (rest.length > max) {
            let cut = Math.max(rest.lastIndexOf(', ', max), rest.lastIndexOf(' ', max));
            if (cut < 40) cut = max;
            pieces.push(rest.slice(0, cut + 1).trim());
            rest = rest.slice(cut + 1).trim();
        }
        if (rest) pieces.push(rest);
    }
    const out = [];
    for (const p of pieces) {
        if (out.length && out[out.length - 1].length + p.length + 1 <= max && out[out.length - 1].length < 90) out[out.length - 1] += ' ' + p;
        else out.push(p);
    }
    return out.filter(Boolean);
}

class Speech {
    #synth = null; #settings; #unlocked = false;
    #voices = []; #keep = new Set();
    #epoch = 0;
    #tail = Promise.resolve();
    #chunkDone = null;
    #liveA = null; #liveP = null;
    onCaption = null;
    history = [];
    last = '';            // última frase importante (para repetirla con Espacio)

    constructor(settings) {
        this.#settings = settings;
        this.#synth = ('speechSynthesis' in window) ? window.speechSynthesis : null;
        this.#liveA = document.getElementById('sr-assertive');
        this.#liveP = document.getElementById('sr-polite');
        if (this.#synth) {
            this.#loadVoices();
            try { this.#synth.onvoiceschanged = () => this.#loadVoices(); } catch (_) { /* opcional */ }
        }
    }

    override = null;      // en la portada se habla con la voz del juego, aunque no se haya elegido aún
    timeScale = 1;        // pruebas: esperas más cortas

    get available() { return !!this.#synth; }
    /** voz: la del juego · sr: el lector de pantalla · visual: nada (se lee en pantalla). */
    get mode() { return this.override || this.#settings.output; }
    get useTTS() { return this.mode === 'voz' && !!this.#synth; }
    get busy() { return !!this.#chunkDone || this.#waiting > 0; }
    #waiting = 0;

    unlock() {
        if (this.#unlocked) return;
        this.#unlocked = true;
        if (!this.#synth) return;
        try {
            const u = new SpeechSynthesisUtterance(' ');
            u.volume = 0;
            this.#synth.speak(u);
        } catch (_) { /* sin voz */ }
    }

    #loadVoices() {
        try { this.#voices = this.#synth.getVoices().filter(v => /^es([-_]|$)/i.test(v.lang)); } catch (_) { this.#voices = []; }
    }
    get spanishVoices() { return this.#voices; }
    #pickVoice() {
        const s = this.#settings;
        if (s.voiceURI) {
            const v = this.#voices.find(x => x.voiceURI === s.voiceURI);
            if (v) return v;
        }
        return this.#voices.find(v => /es[-_]ES/i.test(v.lang)) || this.#voices[0] || null;
    }
    voiceName() { const v = this.#pickVoice(); return v ? v.name : 'voz predeterminada del sistema'; }

    /** Duración estimada (ms) de un texto hablado. */
    estimate(text, rate = 1) {
        const cps = 14 * this.#settings.speechRate * rate;
        return Math.round(String(text).length / cps * 1000) + 250;
    }

    /**
     * Dice un texto. interrupt=true corta lo anterior; false lo pone a la cola.
     * keep=true lo guarda para repetirlo con Espacio. Devuelve una promesa que se resuelve al terminar.
     * tts=true usa la voz del juego aunque juegues con lector de pantalla (en El Impostor, que va en tiempo real).
     */
    say(text, { interrupt = true, pitch = 1, rate = 1, keep = false, tts = false } = {}) {
        if (!text) return Promise.resolve();
        if (keep) this.last = text;
        if (interrupt) this.cancel();
        const epoch = this.#epoch;
        const valid = () => epoch === this.#epoch;
        const p = this.#tail.then(() => valid() ? this.#speakText(text, { pitch, rate, assertive: interrupt, tts }, valid) : undefined);
        this.#tail = p.catch(() => { });
        return p.then(() => { }, () => { });
    }

    cancel() {
        this.#epoch++;
        this.#tail = Promise.resolve();
        try { this.#synth?.cancel(); } catch (_) { /* nada */ }
        const r = this.#chunkDone;
        this.#chunkDone = null;
        r?.();
    }

    async #speakText(text, { pitch, rate, assertive, tts }, valid) {
        this.history.push(text);
        if (this.history.length > 300) this.history.splice(0, 100);
        this.onCaption?.(text);
        if (!(this.useTTS || (tts && this.mode === 'sr' && this.#synth))) {
            // Lector de pantalla: región aria-live. Sin voz: solo se ve; se espera lo que se tarda en leerlo.
            const visual = this.mode === 'visual';
            if (!visual) this.#announceLive(text, assertive);
            const ms = visual ? Math.max(700, String(text).length / 30 * 1000 + 300) : this.estimate(text, rate);
            this.#waiting++;
            try { await this.#waitMs(ms * this.timeScale, () => !valid()); } finally { this.#waiting--; }
            return;
        }
        for (const chunk of splitSpeech(text)) {
            if (!valid()) return;
            await this.#speakChunk(chunk, pitch, rate);
        }
    }

    #speakChunk(text, pitch, rate) {
        return new Promise(resolve => {
            let done = false, fallback = null;
            const finish = () => {
                if (done) return;
                done = true;
                clearTimeout(fallback);
                this.#keep.delete(u);
                if (this.#chunkDone === finish) this.#chunkDone = null;
                resolve();
            };
            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'es-ES';
            const v = this.#pickVoice();
            if (v) { u.voice = v; u.lang = v.lang; }
            u.rate = clamp(this.#settings.speechRate * rate, 0.1, 10);
            u.pitch = clamp(pitch, 0, 2);
            u.volume = clamp(this.#settings.speechVolume, 0, 1);
            u.onend = finish;
            u.onerror = finish;
            fallback = setTimeout(finish, this.estimate(text, rate) * 2 + 4000);   // red de seguridad
            this.#keep.add(u);
            this.#chunkDone = finish;
            try {
                if (this.#synth.paused) this.#synth.resume();
                this.#synth.speak(u);
            } catch (_) { finish(); }
        });
    }

    #announceLive(text, assertive) {
        const el = assertive ? this.#liveA : this.#liveP;
        if (!el) return;
        el.textContent = '';
        setTimeout(() => { el.textContent = text; }, 40);
    }

    #waitMs(ms, cancelled) {
        return new Promise(resolve => {
            const start = performance.now();
            const iv = setInterval(() => {
                if (cancelled() || performance.now() - start >= ms) { clearInterval(iv); resolve(); }
            }, 50);
        });
    }
}
