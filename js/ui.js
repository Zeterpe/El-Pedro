/* =============================================
   EL PEDRO — ui.js
   Pantallas, foco, lectura de botones, diálogos
   con listas y listas de opciones. Todo se maneja
   con flechas, Enter y Escape, o tocando.
   ============================================= */
'use strict';

const $ = id => document.getElementById(id);

/** Texto que se lee de un elemento. */
function labelOf(el) {
    if (!el) return '';
    return el.getAttribute('aria-label') || el.textContent.replace(/\s+/g, ' ').trim();
}

const UI = {
    speech: null, audio: null, settings: null,
    screens: {},
    current: 'splash',
    backHandlers: {},
    _silentFocus: false,

    init({ speech, audio, settings }) {
        this.speech = speech; this.audio = audio; this.settings = settings;
        this.keytrap = $('keytrap');
        // En el Mac de sobremesa (no en el iPad, que se toca); para probarlo en otro aparato, localStorage['elpedro.keytrap'] = '1'.
        let force = null;
        try { force = localStorage.getItem('elpedro.keytrap'); } catch { }
        this.trapWanted = force != null ? force === '1' : /Mac/.test(navigator.platform || navigator.userAgent) && !navigator.maxTouchPoints;
        this.keytrap?.addEventListener('input', () => { this.keytrap.value = ''; });
        // VoiceOver trata role="application" a su manera (hay que «interactuar» con ella); en el Mac basta con el campo.
        if (this.trapWanted) $('screen-game').removeAttribute('role');
        document.querySelectorAll('.screen').forEach(el => { this.screens[el.id.replace('screen-', '')] = el; });
        document.addEventListener('focusin', e => this._onFocus(e));
        speech.onCaption = text => this.caption(text);
    },

    show(name, { focus = null, intro = null, silent = false } = {}) {
        for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('active', k === name);
        if (name !== 'game') this.setVirtual(null);
        this.current = name;
        document.body.dataset.screen = name;
        window.scrollTo(0, 0);
        if (intro) this.say(intro);
        const scr = this.screens[name];
        if (typeof focus === 'function') focus = focus();
        const target = typeof focus === 'string' ? $(focus) : (focus || this.navItems(scr)[0] || scr.querySelector('h1,h2'));
        if (target) this.focus(target, { silent: silent || !!intro, queue: !!intro });
    },

    say(text, opts) { return this.speech.say(text, opts); },

    // ── Teclas con VoiceOver ──────────────────────────
    // VoiceOver en el Mac se queda las letras y los números para moverse por la página
    // (navegación rápida), aunque la mesa sea una aplicación. En un campo de texto sí los deja pasar.
    // Así que, con lector de pantalla en el Mac, el foco de la mesa se queda en un campo invisible
    // (keytrap) y el sitio en el que estás es «virtual»: se ve con su marco y se dice en voz alta.
    keytrap: null,
    virtual: null,
    trapWanted: false,
    // Si VoiceOver tiene puesta la navegación de una tecla, se queda las letras y los números igualmente (en Safari).
    VO_TIP: 'Con VoiceOver, apaga la navegación de una tecla pulsando a la vez Control, Opción y Q, para que las letras y los números lleguen al juego. Si las flechas tampoco responden, pulsa a la vez flecha izquierda y flecha derecha. Mientras tanto, puedes moverte por la mesa con el tabulador y elegir con Enter.',

    get trapping() {
        // También con la voz del juego: hay quien la usa con VoiceOver encendido. Sin voz no hace falta.
        return this.trapWanted && !!this.keytrap && this.speech?.mode !== 'visual' && this.current === 'game' && !Dialog.active;
    },

    /** Vuelve a enfocar el campo aunque ya tuviera el foco, para que el cursor de VoiceOver regrese a la mesa. */
    regrab() {
        if (!this.trapping || document.activeElement !== this.keytrap) return;
        this._silentFocus = true;
        this.keytrap.blur();
        this.keytrap.focus({ preventScroll: true });
        this._silentFocus = false;
    },

    /** El elemento en el que estás: el enfocado o, con el campo invisible, el virtual. */
    active() {
        const f = document.activeElement;
        if (!this.trapping || f !== this.keytrap) return f;
        const v = this.virtual;
        return v && document.contains(v) && !v.hidden && !v.disabled && v.offsetParent !== null ? v : document.body;
    },

    setVirtual(el) {
        if (this.virtual === el) return;
        this.virtual?.classList.remove('vfocus');
        this.virtual = el;
        el?.classList.add('vfocus');
    },

    /** Enfoca un elemento. silent: no lo lee. queue: lo lee después de lo que se esté diciendo. */
    focus(el, { silent = false, queue = false } = {}) {
        if (!el) return;
        if (this.trapping && el !== this.keytrap && this.screens.game.contains(el)) {
            this.setVirtual(el);
            if (document.activeElement !== this.keytrap) {
                this._silentFocus = true;
                this.keytrap.focus({ preventScroll: true });
                this._silentFocus = false;
            }
            el.scrollIntoView?.({ block: 'nearest' });
            if (!silent) { const t = labelOf(el); if (t) this.say(t, { interrupt: !queue }); }
            return;
        }
        if (!el.matches('button, input, select, textarea, a[href], [tabindex]')) el.setAttribute('tabindex', '-1');
        this._silentFocus = silent;
        this._queueFocus = queue;
        const already = document.activeElement === el;
        el.focus({ preventScroll: false });
        if (already && !silent) this._speakEl(el, queue);
        this._silentFocus = false;
        this._queueFocus = false;
        el.scrollIntoView?.({ block: 'nearest' });
    },

    _onFocus(e) {
        if (this._silentFocus) return;
        const el = e.target;
        if (!el || el === document.body) return;
        this._speakEl(el, this._queueFocus);
    },

    /** Con la voz del juego, lee el elemento enfocado (con lector de pantalla ya lo hace él). */
    _speakEl(el, queue) {
        if (!this.speech.useTTS) return;
        const t = labelOf(el);
        if (t) this.say(t, { interrupt: !queue });
    },

    navItems(container) {
        if (!container) return [];
        return [...container.querySelectorAll('.nav')].filter(el => !el.hidden && !el.disabled && el.offsetParent !== null);
    },

    moveFocus(delta, container = this.screens[this.current]) {
        const items = this.navItems(container);
        if (!items.length) return;
        let i = items.indexOf(this.active());
        i = i < 0 ? (delta > 0 ? 0 : items.length - 1) : (i + delta + items.length) % items.length;
        this.audio.move();
        this.focus(items[i]);
    },

    back() {
        const h = this.backHandlers[this.current];
        if (h) { this.audio.back(); h(); }
    },

    /** Lo último que se ha dicho, a la vista (sin voz es la única forma de enterarse). */
    caption(text) {
        const el = $('log');
        if (!el || !text || !text.trim()) return;
        const li = document.createElement('li');
        li.textContent = text;
        el.prepend(li);
        while (el.children.length > 6) el.lastChild.remove();
    },
};

// ═══════════════════════════════════════════════════════
// Dialog: ventana con un título, un texto y una lista de opciones.
// open() devuelve una promesa con el valor elegido (o el de cancelar).
// ═══════════════════════════════════════════════════════

const Dialog = {
    active: false,
    _resolve: null,
    _cancel: undefined,
    _prevFocus: null,
    _items: [],

    /** dock: abajo y sin tapar la mesa (en la reunión de El Impostor, para ver el panel mientras eliges). */
    open({ title, text = '', items, cancel = undefined, speak = true, focusIndex = 0, dock = false }) {
        if (this.active) this.close(this._cancel, true);
        const box = $('dialog'), list = $('dialog-items');
        box.classList.toggle('dock', !!dock);
        $('dialog-title').textContent = title;
        $('dialog-text').textContent = text;
        $('dialog-text').hidden = !text;
        list.innerHTML = '';
        this._items = items;
        items.forEach((it, i) => {
            const b = document.createElement('button');
            b.className = 'nav dialog-item';
            b.textContent = it.label;
            if (it.hint) b.setAttribute('aria-label', `${it.label}. ${it.hint}`);
            if (it.disabled) b.disabled = true;
            // Al pasar por una opción, algo que suena (en El Impostor, la nota de cada color).
            if (it.onFocus) b.addEventListener('focus', it.onFocus);
            b.addEventListener('click', () => { UI.audio.select(); this.close(it.value); });
            list.appendChild(b);
        });
        this._cancel = cancel;
        this._prevFocus = document.activeElement;
        this.active = true;
        box.hidden = false;
        document.body.classList.add('dialog-open');
        return new Promise(resolve => {
            this._resolve = resolve;
            const first = UI.navItems(list)[focusIndex] || UI.navItems(list)[0];
            if (speak) {
                const intro = typeof speak === 'string' ? speak : [title, text].filter(Boolean).join(/[.?!:]$/.test(title) ? ' ' : '. ');
                UI.say(intro);
                UI.focus(first, { queue: true });
            } else UI.focus(first, { silent: true });
        });
    },

    close(value, silent = false) {
        if (!this.active) return;
        this.active = false;
        $('dialog').hidden = true;
        document.body.classList.remove('dialog-open');
        const r = this._resolve;
        this._resolve = null;
        const prev = this._prevFocus;
        if (prev && document.contains(prev) && prev.offsetParent !== null) UI.focus(prev, { silent: true });
        // En la mesa el foco no se pierde: así el lector de pantalla sigue pasando las teclas al juego.
        else if (UI.current === 'game') UI.focus($('my-hand'), { silent: true });
        if (!silent || r) r?.(value);
    },

    onKey(e) {
        const k = e.key;
        if (k === 'ArrowDown' || k === 'ArrowRight') { e.preventDefault(); UI.moveFocus(1, $('dialog-items')); return true; }
        if (k === 'ArrowUp' || k === 'ArrowLeft') { e.preventDefault(); UI.moveFocus(-1, $('dialog-items')); return true; }
        if (k === 'Escape' || k === 'Backspace') {
            e.preventDefault();
            if (this._cancel !== undefined) { UI.audio.back(); this.close(this._cancel); }
            else UI.audio.error();
            return true;
        }
        if (k === 'Home' || k === 'End') {
            e.preventDefault();
            const items = UI.navItems($('dialog-items'));
            UI.focus(k === 'Home' ? items[0] : items[items.length - 1]);
            return true;
        }
        // Atajos: un número o una letra elige directamente.
        const it = this._items.find(x => x.key && x.key.toLowerCase() === k.toLowerCase() && !x.disabled);
        if (it) { e.preventDefault(); UI.audio.select(); this.close(it.value); return true; }
        return false;
    },
};

// ═══════════════════════════════════════════════════════
// OptionList: filas que cambian de valor con izquierda/derecha o Enter.
// def: { id, label, values: [...], text(v) → texto, get(), set(v), action() }
// ═══════════════════════════════════════════════════════

const OptionList = {
    render(container, defs, onChange) {
        container.innerHTML = '';
        for (const def of defs) {
            const b = document.createElement('button');
            b.className = 'nav opt';
            b._def = def;
            b._onChange = onChange;
            this._fill(b);
            b.addEventListener('click', () => this.activate(b));
            container.appendChild(b);
        }
    },

    _fill(b) {
        const d = b._def;
        if (d.action) { b.textContent = d.label; return; }
        const v = d.get();
        const shown = d.text ? d.text(v) : String(v);
        b.innerHTML = '';
        const l = document.createElement('span'); l.className = 'opt-label'; l.textContent = d.label;
        const r = document.createElement('span'); r.className = 'opt-value'; r.textContent = shown;
        b.append(l, r);
        b.setAttribute('aria-label', `${d.label}: ${shown}`);
    },

    adjust(b, step) {
        const d = b._def;
        if (d.action) return;
        const vals = d.values;
        let i = vals.findIndex(x => x === d.get());
        if (i < 0) i = 0;
        const j = clamp(i + step, 0, vals.length - 1);
        if (j === i && !d.wrap) { UI.audio.error(); return; }
        const next = d.wrap ? vals[(i + step + vals.length) % vals.length] : vals[j];
        d.set(next);
        this._fill(b);
        UI.audio.select();
        b._onChange?.(d, next);
        const shown = d.text ? d.text(next) : String(next);
        UI.say(shown);
        d.preview?.(next);
    },

    activate(b) {
        const d = b._def;
        if (d.action) { UI.audio.select(); d.action(); return; }
        const vals = d.values;
        const i = vals.findIndex(x => x === d.get());
        d.set(vals[(i + 1) % vals.length]);
        this._fill(b);
        UI.audio.select();
        b._onChange?.(d, d.get());
        UI.say(d.text ? d.text(d.get()) : String(d.get()));
        d.preview?.(d.get());
    },

    onKey(e) {
        const el = document.activeElement;
        if (!el || !el._def) return false;
        if (e.key === 'ArrowRight') { e.preventDefault(); this.adjust(el, 1); return true; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.adjust(el, -1); return true; }
        return false;
    },
};
