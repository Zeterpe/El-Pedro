/* =============================================
   EL PEDRO — board.js
   La mesa que se ve, común a todos los juegos: los
   sitios de los jugadores, cada carta como un botón
   (se toca o se elige con el teclado), los botones
   de acciones, animaciones (dar la vuelta, volar de
   un sitio a otro, celebrar), bocadillos con lo que
   hace cada uno y la línea de estado.
   Lo propio de cada juego (el centro de la mesa y
   cómo se pintan las cartas) lo pone su partida.
   ============================================= */
'use strict';

const SEAT_IDS = ['right', 'topright', 'top', 'topleft', 'left'];

const Board = {
    match: null,
    els: {},            // 'p:s' → botón de la carta
    acts: {},           // tipo → botón de acción

    build(match) {
        this.match = match;
        this.els = {};
        CardArt.installDefs();
        const n = match.game.n;
        for (const id of SEAT_IDS) { const el = $('seat-' + id); el.innerHTML = ''; el.hidden = true; el.dataset.p = ''; el.className = `seat seat-${id}`; }
        const me = $('seat-me');
        me.dataset.p = match.me;
        me.className = 'seat seat-me';
        $('my-hand').innerHTML = '';
        me.querySelectorAll('.vbody').forEach(el => el.remove());
        $('my-hand').setAttribute('aria-label', 'Tus cartas');
        $('my-extra').innerHTML = '';
        $('my-name').textContent = match.seats[match.me]?.name || 'Tú';
        for (let p = 0; p < n; p++) {
            if (p === match.me) continue;
            const el = $('seat-' + match.audio.seatOf(p));
            el.hidden = false;
            el.dataset.p = p;
            el.innerHTML = `<div class="seat-name"><span class="avatar" aria-hidden="true"></span><span class="nm"></span> <span class="wins"></span><span class="score"></span></div><div class="hand rival" role="group"></div><div class="seat-extra"></div><div class="bubble" aria-hidden="true"></div>`;
            el.querySelector('.nm').textContent = cap(match.names[p]);
            el.querySelector('.avatar').textContent = (match.seats[p].name || '?').replace(/^la abuela /i, '').charAt(0).toUpperCase();
            el.querySelector('.avatar').dataset.c = p % 6;
            el.querySelector('.hand').setAttribute('aria-label', `Cartas de ${match.names[p]}`);
        }
        document.body.dataset.players = n;
        document.body.dataset.output = match.speech.mode;
        document.body.dataset.game = match.kind;
        $('table').dataset.game = match.kind;
        const center = $('center');
        center.innerHTML = '';
        match.buildCenter(center);
        this.buildActions(match);
        $('log').innerHTML = '';
        this.status('');
        this.render(match);
    },

    /** Los botones de la mesa: cada acción con su tecla. */
    buildActions(match) {
        const box = $('actions');
        box.innerHTML = '';
        this.acts = {};
        for (const d of match.actionsDef()) {
            const b = document.createElement('button');
            b.className = `nav act ${d.cls || ''}`.trim();
            b.id = 'act-' + d.kind;
            b.innerHTML = `<span class="lbl"></span>${d.key ? ` <kbd></kbd>` : ''}`;
            b.querySelector('.lbl').textContent = d.label;
            if (d.key) b.querySelector('kbd').textContent = d.key;
            b._label = d.label;
            if (!/talk|small/.test(d.cls || '')) b.hidden = true;
            b.addEventListener('click', () => this.match?.button(d.kind));
            box.appendChild(b);
            this.acts[d.kind] = b;
        }
    },

    showAct(kind, on, label = null) {
        const b = this.acts[kind];
        if (!b) return;
        b.hidden = !on;
        b.querySelector('.lbl').textContent = label || b._label;
    },

    seatEl(p) { return p === this.match.me ? $('seat-me') : $('seat-' + this.match.audio.seatOf(p)); },
    handEl(p) { return p === this.match.me ? $('my-hand') : this.seatEl(p)?.querySelector('.hand'); },
    extraEl(p) { return p === this.match.me ? $('my-extra') : this.seatEl(p)?.querySelector('.seat-extra'); },
    slotEl(p, s) { return this.els[p + ':' + s] || this.handEl(p); },

    setWins(p, n) {
        const el = p === this.match.me ? $('my-wins') : this.seatEl(p)?.querySelector('.wins');
        if (!el) return;
        el.textContent = '★'.repeat(Math.min(n, 9));
        el.setAttribute('aria-hidden', 'true');
    },
    setScore(p, text) {
        const el = p === this.match.me ? $('my-score') : this.seatEl(p)?.querySelector('.score');
        if (el) el.textContent = text ? ` · ${text}` : '';
    },

    status(text) { const el = $('status'); if (el) el.textContent = text || ''; },

    bubble(p, text, ms = 1700) {
        const el = this.seatEl(p)?.querySelector('.bubble');
        if (!el || !text) return;
        el.textContent = text;
        el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), ms * Math.max(0.3, this.match?.timeScale ?? 1));
    },

    get still() { return document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches; },

    /** Una carta vuela de un sitio a otro (solo se ve; no cambia nada). */
    fly(from, to, card = null, ms = 450, { rotate = 0 } = {}) {
        if (!from || !to || this.still) return Promise.resolve();
        const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
        if (!a.width || !b.width) return Promise.resolve();
        const big = document.body.dataset.cards === 'grande' ? 1.3 : 1;
        const w = 64 * big, h = 96 * big;
        const ghost = document.createElement('div');
        ghost.className = 'ghost';
        ghost.innerHTML = this.match?.faceOf ? this.match.faceOf(card) : card ? CardArt.face(card) : CardArt.back();
        ghost.style.width = w + 'px'; ghost.style.height = h + 'px';
        const x0 = a.left + a.width / 2 - w / 2, y0 = a.top + a.height / 2 - h / 2;
        const x1 = b.left + b.width / 2 - w / 2, y1 = b.top + b.height / 2 - h / 2;
        ghost.style.left = x0 + 'px'; ghost.style.top = y0 + 'px';
        document.body.appendChild(ghost);
        const dur = ms * Math.max(0.2, this.match?.timeScale ?? 1);
        const anim = ghost.animate([
            { transform: 'translate(0,0) scale(.9) rotate(0deg)', opacity: 0.95 },
            { transform: `translate(${(x1 - x0) / 2}px, ${(y1 - y0) / 2 - 30}px) scale(1.06) rotate(${rotate / 2 + 4}deg)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${x1 - x0}px, ${y1 - y0}px) scale(.9) rotate(${rotate}deg)`, opacity: 0.9 },
        ], { duration: dur, easing: 'cubic-bezier(.35,.1,.25,1)' });
        return anim.finished.catch(() => { }).then(() => ghost.remove());
    },

    /** Reparto: las cartas salen del mazo hacia cada jugador. */
    dealAnim(n, per) {
        const from = $('deck-btn') || $('b-deck');
        if (!from || this.still) return;
        let i = 0;
        for (let k = 0; k < per; k++) for (let j = 1; j <= n; j++) {
            const p = (this.match.game.dealer + j) % n;
            const t = i++ * 90 * Math.max(0.2, this.match.timeScale);
            setTimeout(() => this.fly(from, this.seatEl(p), null, 380), t);
        }
    },

    pulse(el, cls = 'pulse') {
        if (!el) return;
        el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), 900);
    },

    shake(el) { this.pulse(el, 'shake'); },

    /** Destello dorado sobre un sitio de la mesa (quemar, ganar una baza). */
    burst(el) {
        if (!el || this.still) return;
        const r = el.getBoundingClientRect();
        const fx = document.createElement('div');
        fx.className = 'burst';
        fx.style.left = (r.left + r.width / 2) + 'px';
        fx.style.top = (r.top + r.height / 2) + 'px';
        document.body.appendChild(fx);
        setTimeout(() => fx.remove(), 900);
    },

    /** Un cartel grande en medio de la mesa («¡Pedro!», «¡Las 40!»). */
    banner(text, sub = '') {
        const el = $('banner');
        if (!el) return;
        el.innerHTML = `<strong></strong><span></span>`;
        el.querySelector('strong').textContent = text;
        el.querySelector('span').textContent = sub;
        el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), 1900 * Math.max(0.3, this.match?.timeScale ?? 1));
    },

    /** Confeti de cartas al ganar. */
    confetti() {
        if (this.still) return;
        const box = document.createElement('div');
        box.className = 'confetti';
        box.setAttribute('aria-hidden', 'true');
        const colors = ['#ffd34d', '#e0444d', '#7cc255', '#6f8fb8', '#fff4b0'];
        for (let i = 0; i < 40; i++) {
            const s = document.createElement('i');
            s.style.left = Math.random() * 100 + 'vw';
            s.style.background = colors[i % colors.length];
            s.style.animationDelay = (Math.random() * 0.6) + 's';
            s.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
            s.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
            box.appendChild(s);
        }
        document.body.appendChild(box);
        setTimeout(() => box.remove(), 3400);
    },

    /** Crea (o reutiliza) el botón de una carta y lo pone en su sitio. Reutilizarlo deja que se dé la vuelta con animación y no pierde el foco. */
    slotButton(p, s, hand, index = s) {
        const k = p + ':' + s;
        let b = this.els[k];
        if (!b || b.parentNode !== hand) {
            b = document.createElement('button');
            b.className = 'slot nav';
            b.dataset.p = p; b.dataset.s = s;
            b.innerHTML = `<div class="flip"><div class="face front"></div><div class="face back">${CardArt.back()}</div></div>${p === this.match.me ? `<span class="slot-num">${s + 1}</span>` : ''}<span class="memo"></span>`;
            b.addEventListener('click', () => this.match?.cardClick(+b.dataset.p, +b.dataset.s));
            this.els[k] = b;
        }
        if (b.parentNode !== hand || hand.children[index] !== b) hand.insertBefore(b, hand.children[index] || null);
        return b;
    },

    /** Quita los botones de sitios que ya no existen. */
    trimSlots(p, count) {
        for (const [k, el] of Object.entries(this.els)) {
            const [kp, ks] = k.split(':').map(Number);
            if (kp === p && ks >= count) { el.remove(); delete this.els[k]; }
        }
    },

    /** Pone la cara de una carta (o la deja boca abajo si face es null). */
    setFace(b, face) {
        const front = b.querySelector('.front');
        const fk = face ? face.suit + face.rank : '';
        if (front.dataset.k !== fk) { front.dataset.k = fk; front.innerHTML = face ? CardArt.face(face) + CardArt.badge(face) : ''; }
        b.classList.toggle('up', !!face);
    },

    render(match = this.match) {
        if (!match || match !== this.match) return;
        match.render();
        // Si el botón enfocado ha desaparecido, el foco pasa a algo que tenga sentido (sin leerlo).
        const f = document.activeElement;
        if (UI.current === 'game' && !Dialog.active && (!f || f === document.body || f.hidden || f.disabled || !document.contains(f))) {
            const next = [...document.querySelectorAll('#actions .act.main')].find(x => !x.hidden) || $('my-hand').querySelector('.slot:not(:disabled)') || $('my-hand');
            UI.focus(next, { silent: true });
        }
    },

    // ── Teclado: moverse por las cartas de la mesa ────
    rows() {
        const m = this.match, g = m.game, out = [];
        for (let k = 0; k < g.n; k++) {
            const p = (m.me + k) % g.n;
            const btns = [...(this.handEl(p)?.querySelectorAll('.slot:not(:disabled)') || [])];
            if (btns.length) out.push(btns);
        }
        return out;
    },

    /** dx: carta anterior o siguiente del mismo jugador · dy: jugador anterior o siguiente. */
    moveCursor(dx, dy) {
        const rows = this.rows();
        if (!rows.length) return;
        const f = document.activeElement;
        let r = rows.findIndex(row => row.includes(f)), c = r >= 0 ? rows[r].indexOf(f) : -1;
        if (r < 0) { r = 0; c = 0; }
        else if (dy) { r = (r + dy + rows.length) % rows.length; c = Math.min(c, rows[r].length - 1); }
        else c = (c + dx + rows[r].length) % rows[r].length;
        this.match.audio.move();
        UI.focus(rows[r][c]);
    },

    focusFirst(p = this.match.me, filter = null) {
        const btns = [...(this.handEl(p)?.querySelectorAll('.slot:not(:disabled)') || [])].filter(b => !filter || filter(+b.dataset.p, +b.dataset.s));
        if (btns[0]) UI.focus(btns[0], { silent: true });
    },
};
