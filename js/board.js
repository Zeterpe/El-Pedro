/* =============================================
   EL PEDRO — board.js
   La mesa que se ve: los sitios de los jugadores,
   cada carta como un botón (se toca o se elige con
   el teclado), el mazo, la mesa, la carta robada,
   animaciones (dar la vuelta, volar de un sitio a
   otro), bocadillos con lo que hace cada uno y la
   línea de estado.
   ============================================= */
'use strict';

const SEAT_IDS = ['right', 'topright', 'top', 'topleft', 'left'];

const Board = {
    match: null,
    els: {},            // 'p:s' → botón de la carta
    _cursor: null,

    build(match) {
        this.match = match;
        this.els = {};
        CardArt.installDefs();
        const n = match.game.n;
        for (const id of SEAT_IDS) { const el = $('seat-' + id); el.innerHTML = ''; el.hidden = true; el.dataset.p = ''; }
        const me = $('seat-me');
        me.dataset.p = match.me;
        $('my-hand').innerHTML = '';
        $('my-name').textContent = match.seats[match.me]?.name || 'Tú';
        for (let p = 0; p < n; p++) {
            if (p === match.me) continue;
            const el = $('seat-' + match.audio.seatOf(p));
            el.hidden = false;
            el.dataset.p = p;
            el.innerHTML = `<div class="seat-name"><span class="nm"></span> <span class="wins"></span><span class="score"></span></div><div class="hand rival" role="group"></div><div class="bubble" aria-hidden="true"></div>`;
            el.querySelector('.nm').textContent = cap(match.names[p]);
            el.querySelector('.hand').setAttribute('aria-label', `Cartas de ${match.names[p]}`);
        }
        $('deck-card').innerHTML = CardArt.back();
        document.body.dataset.players = n;
        document.body.dataset.output = match.speech.mode;
        $('log').innerHTML = '';
        this.status('');
        this.render(match);
    },

    seatEl(p) { return p === this.match.me ? $('seat-me') : $('seat-' + this.match.audio.seatOf(p)); },
    handEl(p) { return p === this.match.me ? $('my-hand') : this.seatEl(p)?.querySelector('.hand'); },
    slotEl(p, s) { return this.els[p + ':' + s] || this.handEl(p); },

    status(text) { const el = $('status'); if (el) el.textContent = text || ''; },

    bubble(p, text, ms = 1700) {
        const el = this.seatEl(p)?.querySelector('.bubble');
        if (!el || !text) return;
        el.textContent = text;
        el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), ms * Math.max(0.3, this.match?.timeScale ?? 1));
    },

    /** Una carta vuela de un sitio a otro (solo se ve; no cambia nada). */
    fly(from, to, card = null, ms = 450) {
        if (!from || !to || document.hidden) return Promise.resolve();
        const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
        if (!a.width || !b.width) return Promise.resolve();
        const w = 64, h = 96;
        const ghost = document.createElement('div');
        ghost.className = 'ghost';
        ghost.innerHTML = card ? CardArt.face(card) : CardArt.back();
        ghost.style.width = w + 'px'; ghost.style.height = h + 'px';
        const x0 = a.left + a.width / 2 - w / 2, y0 = a.top + a.height / 2 - h / 2;
        const x1 = b.left + b.width / 2 - w / 2, y1 = b.top + b.height / 2 - h / 2;
        ghost.style.left = x0 + 'px'; ghost.style.top = y0 + 'px';
        document.body.appendChild(ghost);
        const dur = ms * Math.max(0.2, this.match?.timeScale ?? 1);
        const anim = ghost.animate([
            { transform: 'translate(0,0) scale(.9)', opacity: 0.95 },
            { transform: `translate(${(x1 - x0) / 2}px, ${(y1 - y0) / 2 - 30}px) scale(1.05)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${x1 - x0}px, ${y1 - y0}px) scale(.9)`, opacity: 0.9 },
        ], { duration: dur, easing: 'ease-in-out' });
        return anim.finished.catch(() => { }).then(() => ghost.remove());
    },

    pulse(el, cls = 'pulse') {
        if (!el) return;
        el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), 900);
    },

    /** Crea (o reutiliza) el botón de una carta. Reutilizarlo deja que se dé la vuelta con animación y no pierde el foco. */
    slotButton(p, s, hand) {
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
        return b;
    },

    render(match = this.match) {
        if (!match || match !== this.match) return;
        const g = match.game, me = match.me, reveal = match.lastReveal;
        const pick = match.picking;
        const hl = match.highlight || [];
        const burnOpen = g.phase === 'burn' && g.canBurn(me) && !match.passedBurn;
        const help = match.settings.memoryHelp || match.practice;
        const faceFor = (p, s) => {
            if (reveal) { const h = reveal.hands[p]?.find(x => x.s === s); if (h) return h.card; }
            return match.shown.get(p + ':' + s) || null;
        };
        const actor = match.actor();
        for (let p = 0; p < g.n; p++) {
            const seat = this.seatEl(p);
            if (!seat) continue;
            const active = ['turn', 'drawn', 'power', 'give'].includes(g.phase) && actor === p;
            seat.classList.toggle('active', active);
            seat.classList.toggle('caller', g.caller === p);
            seat.classList.toggle('winner', !!reveal && reveal.winners.includes(p));
            const wins = seat.querySelector('.wins');
            if (wins) wins.textContent = '★'.repeat(g.players[p].wins);
            const score = seat.querySelector('.score');
            if (score) score.textContent = reveal ? ` · ${Txt.points(reveal.scores[p])}` : '';
            const hand = this.handEl(p);
            const slots = g.players[p].slots;
            // Quita los botones de sitios que ya no existen.
            for (const [k, el] of Object.entries(this.els)) {
                const [kp, ks] = k.split(':').map(Number);
                if (kp === p && ks >= slots.length) { el.remove(); delete this.els[k]; }
            }
            slots.forEach((c, s) => {
                const b = this.slotButton(p, s, hand);
                if (b.parentNode !== hand || hand.children[s] !== b) hand.insertBefore(b, hand.children[s] || null);
                const face = c ? faceFor(p, s) : null;
                const front = b.querySelector('.front');
                const fk = face ? face.suit + face.rank : '';
                if (front.dataset.k !== fk) { front.dataset.k = fk; front.innerHTML = face ? CardArt.face(face) : ''; }
                b.classList.toggle('up', !!face);
                b.classList.toggle('empty', !c);
                b.classList.toggle('small', p !== me);
                const key = { p, s };
                const can = !!pick && pick.allowed(p, s);
                const chosen = !!pick && pick.chosen.some(t => t.p === p && t.s === s);
                b.classList.toggle('pickable', !!c && (can || chosen));
                b.classList.toggle('chosen', !!chosen);
                b.classList.toggle('hl', hl.some(t => t.p === p && t.s === s));
                b.classList.toggle('burnable', !!c && burnOpen && !pick && (p === me || (g.rules.burnOthers && !g.isProtected(p))));
                const known = help && c && p === me && !face ? match.helper.get(me, s) : null;
                b.querySelector('.memo').textContent = known ? `${known.rank} ${known.suit}` : '';
                b.disabled = !c;
                b.setAttribute('aria-label', match.cardLabel(p, s, key));
            });
        }
        // Centro: mazo, mesa y carta robada.
        $('deck-count').textContent = g.deck.length;
        const want = match.want?.kinds;
        const deck = $('deck-btn');
        deck.classList.toggle('ready', !!want?.has('draw'));
        deck.setAttribute('aria-label', want?.has('draw') ? `Mazo, ${g.deck.length} cartas. Robar` : `Mazo, ${g.deck.length} cartas`);
        const table = $('table-btn');
        const top = g.top;
        const tk = top ? top.suit + top.rank : '';
        if (table.dataset.k !== tk) { table.dataset.k = tk; table.querySelector('.pile-card').innerHTML = top ? CardArt.face(top) : ''; this.pulse(table, 'land'); }
        table.classList.toggle('burnable', g.phase === 'burn');
        table.classList.toggle('ready', !!want?.has('take'));
        table.setAttribute('aria-label', top ? `Mesa: ${Txt.cardShort(top)}${want?.has('take') ? '. Coger' : ''}` : 'Mesa vacía');
        const drawn = $('drawn-area');
        if (g.phase === 'drawn') {
            const mine = g.current === me;
            const face = (mine || g.drawnFrom === 'table') ? g.drawn : null;
            const k = (face ? face.suit + face.rank : 'x') + g.current;
            if (drawn.dataset.k !== k) {
                drawn.dataset.k = k;
                drawn.innerHTML = `<div class="pile-card">${face ? CardArt.face(face) : CardArt.back()}</div><span class="pile-cap">${mine ? 'Tu carta robada' : 'Robada por ' + match.names[g.current]}</span>`;
            }
            drawn.hidden = false;
        } else { drawn.hidden = true; drawn.dataset.k = ''; drawn.innerHTML = ''; }
        $('my-wins').textContent = '★'.repeat(g.players[me].wins);
        const myScore = $('my-score');
        if (myScore) myScore.textContent = reveal ? ` · ${Txt.points(reveal.scores[me])}` : '';
        // Botones
        const can = k => !!want?.has(k);
        const show = (id, on, label) => { const el = $(id); if (!el) return; el.hidden = !on; if (label) el.firstChild.textContent = label + ' '; };
        show('act-draw', can('draw'));
        show('act-call', can('call'));
        show('act-take', can('take'));
        show('act-discard', can('discard'));
        show('act-pass', burnOpen && !pick);
        show('act-cancel', !!pick && pick.cancel != null, pick?.cancelLabel);
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
