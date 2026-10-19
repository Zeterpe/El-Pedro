/* =============================================
   EL PEDRO — pedro.js
   Una partida de El Pedro en la mesa: reparte, da
   el turno, mueve a los rivales de la máquina, deja
   quemar en cualquier momento y cuenta lo que pasa
   con voz, sonido y animaciones.

   Tus cartas y las de los demás se eligen tocándolas
   (o con el teclado): para mirar, cambiar, quemar o
   dar una carta no hay menús.
   ============================================= */
'use strict';

const POWER_TEXT = {
    10: 'Si la tiras, puedes cambiar dos cartas de sitio: tuyas o de los demás.',
    11: 'Si la tiras, puedes mirar una carta: tuya o de otro.',
    12: 'Si la tiras, puedes mirar una carta y después cambiar dos.',
};

/** Lo que dura cada momento sin voz (modo visual), en milisegundos. */
const VISUAL_BEAT = {
    turn: 250, draw: 450, swap: 850, discard: 750, peek: 900, swapCards: 1100, pass: 450,
    burn: 950, burnFail: 1400, penalty: 650, give: 850, call: 1500, reshuffle: 900,
};

class PedroMatch extends Match {
    static get kind() { return 'pedro'; }
    get beats() { return VISUAL_BEAT; }
    get playPhases() { return ['turn', 'drawn', 'power', 'give']; }

    setup() {
        this.helper = new Memory(this.me, {});    // memoria perfecta: para la ayuda de memoria
        this.picking = null;                       // elegir cartas tocándolas
        this.burnQ = [];                           // cartas que alguien quiere quemar, en orden de llegada
        this.plannedTop = null;                    // carta de la mesa para la que ya piensan quemar los rivales
        this.shown = new Map();                    // cartas boca arriba un momento: 'p:s' → carta
        this.highlight = null;
        this.lastReveal = null;
    }

    makeGame(rules, seed) { Txt.pedroRules = rules; return new PedroGame({ players: this.seats.map(s => ({ name: s.name })), rules, seed }); }
    get watchKeys() { return [['q', 'qué carta hay en la mesa']]; }
    makeMirror(rules) { Txt.pedroRules = rules; return new MirrorGame({ names: this.seats.map(s => s.name), rules, me: this.me }); }
    makeBot(p, char, rng) { return new Bot(this.game, p, char, rng); }
    eventFor(e, seat) { return eventFor(e, seat); }
    observe(e) { this.helper.observe(e); }
    afterApply() { this.planBots(); }
    afterBatch() { if (this.game.phase !== 'roundOver' && this.game.phase !== 'gameOver') this.lastReveal = null; }
    onStop() { if (this.picking) { const p = this.picking; this.picking = null; p.resolve(null); } }
    lateAction(a) { return a?.type === 'peekStart'; }
    botTookOver(p) { this.bots[p].myTurns = 3; }   // empieza sin recordar nada, pero puede cantar Pedro

    actor() {
        const g = this.game;
        if (g.phase === 'power') return g.power.by;
        if (g.phase === 'give') return g.give.by;
        return g.current;
    }

    async say(text, { keep = false, pitch = 1, rate = 1, interrupt = false, force = false } = {}) {
        if (this.justPeeked && !force) keep = false;   // hasta tu primera jugada, Espacio repite tus cartas
        return super.say(text, { keep, pitch, rate, interrupt });
    }

    introText() {
        const goal = this.game.rules.winsToWin;
        const goalText = goal > 0 ? ` Gana quien consiga antes ${goal === 1 ? 'una ronda' : goal + ' rondas'}.` : '';
        let text = super.introText() + goalText;
        if (this.game.rules.sevenMinus) text += ' En esta mesa, el siete vale menos 1 punto.';
        if (this.practice) text = 'Partida de práctica: la ayuda de memoria está activada, así que el juego te recuerda las cartas que has visto. ' + text;
        return text;
    }

    async preStep() {
        if (this.burnQ.length) { await this.processBurns(); return true; }
        return false;
    }

    async phaseStep(phase) {
        if (phase === 'peek') { await this.peekPhase(); return true; }
        return false;
    }

    // ── La mesa ───────────────────────────────────────
    actionsDef() {
        return [
            { kind: 'draw', label: 'Robar', key: 'R', cls: 'main' },
            { kind: 'call', label: '¡Cantar Pedro!', key: 'P', cls: 'call' },
            { kind: 'take', label: 'Coger de la mesa', key: 'M' },
            { kind: 'discard', label: 'Tirar a la mesa', key: 'T', cls: 'main' },
            { kind: 'cancel', label: 'Cancelar', key: 'Esc' },
            { kind: 'info', label: 'Cómo va', key: 'I', cls: 'small talk' },
            { kind: 'cards', label: 'Mis cartas', key: 'C', cls: 'small talk' },
            { kind: 'repeat', label: 'Repetir', key: 'Espacio', cls: 'small talk' },
            { kind: 'menu', label: 'Pausa', key: 'Esc', cls: 'small' },
        ];
    }

    button(kind) {
        if (kind === 'cancel') return this.cancelPick();
        return super.button(kind);
    }

    buildCenter(center) {
        center.innerHTML = `
            <button id="deck-btn" class="pile pile-btn nav" aria-label="Mazo">
                <span class="pile-card" id="deck-card">${CardArt.back()}</span>
                <span class="pile-cap">Mazo: <span id="deck-count">0</span></span>
            </button>
            <button id="table-btn" class="pile pile-btn nav" aria-label="Mesa">
                <span class="pile-card"></span>
                <span class="pile-cap">Mesa</span>
            </button>
            <div id="drawn-area" class="pile drawn" aria-hidden="true" hidden></div>`;
        // Tocar el mazo es robar; tocar la mesa, cogerla (si las reglas lo dejan) o tirar a ella la carta robada.
        $('deck-btn').addEventListener('click', () => { if (!this.input('draw')) { this.audio.error(); this.explainCant('draw'); } });
        $('table-btn').addEventListener('click', () => { if (!this.input('discard') && !this.input('take')) this.describeTable(); });
    }

    render() {
        const g = this.game, me = this.me, reveal = this.lastReveal;
        const pick = this.picking;
        const hl = this.highlight || [];
        const help = this.settings.memoryHelp || this.practice;
        const faceFor = (p, s) => {
            if (reveal) { const h = reveal.hands[p]?.find(x => x.s === s); if (h) return h.card; }
            return this.shown.get(p + ':' + s) || null;
        };
        const actor = this.actor();
        for (let p = 0; p < g.n; p++) {
            const seat = Board.seatEl(p);
            if (!seat) continue;
            const active = this.playPhases.includes(g.phase) && actor === p;
            seat.classList.toggle('active', active);
            seat.classList.toggle('caller', g.caller === p);
            seat.classList.toggle('winner', !!reveal && reveal.winners.includes(p));
            Board.setWins(p, g.players[p].wins);
            Board.setScore(p, reveal ? Txt.points(reveal.scores[p]) : '');
            const hand = Board.handEl(p);
            const slots = g.players[p].slots;
            Board.trimSlots(p, slots.length);
            slots.forEach((c, s) => {
                const b = Board.slotButton(p, s, hand, s);
                const face = c ? faceFor(p, s) : null;
                Board.setFace(b, face);
                b.classList.toggle('empty', !c);
                b.classList.toggle('small', p !== me);
                const can = !!pick && pick.allowed(p, s);
                const chosen = !!pick && pick.chosen.some(t => t.p === p && t.s === s);
                b.classList.toggle('pickable', !!c && (can || chosen));
                b.classList.toggle('chosen', !!chosen);
                b.classList.toggle('hl', hl.some(t => t.p === p && t.s === s));
                const known = help && c && p === me && !face ? this.helper.get(me, s) : null;
                b.querySelector('.memo').textContent = known ? `${known.rank} ${known.suit}` : '';
                b.disabled = !c;
                b.setAttribute('aria-label', this.cardLabel(p, s));
            });
        }
        // Centro: mazo, mesa y carta robada.
        $('deck-count').textContent = g.phase === 'idle' ? 'barajando' : g.deck.length;
        const want = this.want?.kinds;
        const deck = $('deck-btn');
        deck.classList.toggle('ready', !!want?.has('draw'));
        deck.setAttribute('aria-label', want?.has('draw') ? `Mazo, ${g.deck.length} cartas. Robar` : `Mazo, ${g.deck.length} cartas`);
        const table = $('table-btn');
        const top = g.top;
        const tk = top ? top.suit + top.rank : '';
        if (table.dataset.k !== tk) { table.dataset.k = tk; table.querySelector('.pile-card').innerHTML = top ? CardArt.face(top) : ''; Board.pulse(table, 'land'); }
        table.classList.toggle('ready', !!want?.has('take'));
        table.setAttribute('aria-label', top ? `Mesa: ${Txt.cardShort(top)}${want?.has('take') ? '. Coger' : ''}` : 'Mesa vacía');
        const drawn = $('drawn-area');
        if (g.phase === 'drawn') {
            const mine = g.current === me;
            const face = (mine || g.drawnFrom === 'table') ? g.drawn : null;
            const k = (face ? face.suit + face.rank : 'x') + g.current;
            if (drawn.dataset.k !== k) {
                drawn.dataset.k = k;
                drawn.innerHTML = `<div class="pile-card">${face ? CardArt.face(face) : CardArt.back()}</div><span class="pile-cap">${mine ? 'Tu carta robada' : 'Robada por ' + this.names[g.current]}</span>`;
            }
            drawn.hidden = false;
        } else { drawn.hidden = true; drawn.dataset.k = ''; drawn.innerHTML = ''; }
        // Botones
        const can = k => !!want?.has(k);
        Board.showAct('draw', can('draw'));
        Board.showAct('call', can('call'));
        Board.showAct('take', can('take'));
        Board.showAct('discard', can('discard'));
        Board.showAct('cancel', !!pick && pick.cancel != null, pick?.cancelLabel);
    }

    // ── Lo que pasa, contado y animado ────────────────

    /** Enseña una carta boca arriba unos segundos y vuelve a darle la vuelta. */
    flash(p, s, card, ms = 5000) {
        const k = p + ':' + s;
        this.shown.set(k, card);
        Board.render(this);
        setTimeout(() => { if (this.shown.get(k) === card) { this.shown.delete(k); Board.render(this); } }, ms * Math.max(0.3, this.timeScale));
    }

    mark(list, ms = 2500) {
        this.highlight = list;
        Board.render(this);
        setTimeout(() => { if (this.highlight === list) { this.highlight = null; Board.render(this); } }, ms * Math.max(0.3, this.timeScale));
    }

    async present(e) {
        const g = this.game, me = this.me, v = this.v, A = this.audio;
        const pan = p => A.panOf(p);
        const span = (p, s) => p === me ? A.slotPan(s, g.players[me].slots.length) : pan(p);
        const B = Board;
        switch (e.t) {
            case 'round': {
                this.shown.clear();
                this.lastReveal = null;
                this.justPeeked = false;
                this.burnQ = [];
                this.plannedTop = null;
                A.shuffle();
                B.dealAnim(g.n, g.rules.handSize);
                await this.sleep(950);
                A.deal(g.n, g.rules.handSize);
                const dealer = e.dealer === me ? 'Repartes tú' : `Reparte ${g.players[e.dealer].name}`;
                A.card(e.top, 0, 0.4 + g.n * g.rules.handSize * 0.09);
                B.status(`Ronda ${e.round}`);
                await this.say(`Ronda ${e.round}. ${dealer}. En la mesa, ${Txt.card(e.top)}.`, { keep: true });
                break;
            }
            case 'turn': {
                if (e.p === me) {
                    A.yourTurn();
                    const last = e.last ? ' Es tu última jugada: alguien ha cantado Pedro.' : '';
                    const top = g.top ? ` En la mesa, ${Txt.card(g.top)}.` : '';
                    const hint = this.hint('turn', g.caller === null
                        ? 'Pulsa R, o toca el mazo, para robar. Si crees que tienes la suma más baja, canta Pedro con la P antes de robar.'
                        : 'Pulsa R, o toca el mazo, para robar.');
                    // Sin esperar: puedes jugar mientras habla.
                    this.prompt(e.last ? 'Tu última jugada: roba una carta' : (g.caller === null ? 'Tu turno: toca el mazo para robar, o canta Pedro' : 'Tu turno: roba una carta'),
                        `Tu turno.${last}${top}${hint}`);
                } else {
                    A.otherTurn(e.p);
                    B.status(`${e.last ? 'Última vuelta. ' : ''}Turno de ${this.names[e.p]}`);
                    await this.say(this.brief ? `${e.last ? 'Última vuelta. ' : ''}${cap(v.name(e.p))}.` : `${e.last ? 'Última vuelta. ' : ''}Turno de ${v.name(e.p)}.`);
                    await this.beat('turn');
                }
                break;
            }
            case 'draw': {
                if (e.p === me) {
                    this.justPeeked = false;
                    A.flick(0);
                    A.card(e.card, 0, 0.12);
                    B.fly(e.from === 'table' ? $('table-btn') : $('deck-btn'), $('drawn-area').hidden ? $('seat-me') : $('drawn-area'), e.card, 380);
                    if (e.from === 'table') this.prompt('Toca la carta tuya por la que la cambias', `Coges de la mesa ${Txt.card(e.card)}. Elige por cuál de tus cartas la cambias: con su número, o tocándola.`);
                    else {
                        const pw = g.rules.powers && POWER_TEXT[e.card.rank] ? ' ' + POWER_TEXT[e.card.rank] : '';
                        const hint = this.hint('drawn', 'Pulsa el número de una de tus cartas, o tócala, para cambiarla por esta. Con la T, con el botón Tirar o tocando la mesa, la tiras.');
                        this.prompt(`Has robado ${Txt.cardShort(e.card)}: toca una de tus cartas para cambiarla, o toca la mesa para tirarla`, `Has robado ${Txt.card(e.card)}.${pw}${hint}`);
                    }
                } else {
                    A.flick(pan(e.p));
                    B.fly(e.from === 'table' ? $('table-btn') : $('deck-btn'), B.seatEl(e.p), e.from === 'table' ? e.card : null, 380);
                    B.bubble(e.p, e.from === 'table' ? 'Coge de la mesa' : 'Roba');
                    if (e.from === 'table') { A.card(e.card, pan(e.p)); await this.say(`${v.Name(e.p)} coge de la mesa ${Txt.card(e.card)}.`); }
                    await this.beat('draw');
                }
                break;
            }
            case 'swap': {
                A.place(0);
                A.card(e.card, 0, 0.1);
                B.fly(B.slotEl(e.p, e.slot), $('table-btn'), e.card, 450);
                B.render(this);   // la mesa cambia en cuanto cae la carta, sin esperar a la voz
                this.mark([{ p: e.p, s: e.slot }], 1500);
                if (e.p === me) await this.say(`Te la quedas en tu sitio ${e.slot + 1} y tiras ${Txt.card(e.card)}.`, { keep: true });
                else {
                    B.bubble(e.p, `Cambia su carta ${e.slot + 1}`);
                    await this.say(this.brief
                        ? `Cambia su ${e.slot + 1}. Tira ${Txt.card(e.card)}.`
                        : `${v.Name(e.p)} se la queda en su carta ${e.slot + 1} y tira ${Txt.card(e.card)}.`, { keep: true });
                    await this.beat('swap');
                }
                break;
            }
            case 'discard': {
                A.place(0);
                A.card(e.card, 0, 0.1);
                B.fly(e.p === me ? $('drawn-area') : B.seatEl(e.p), $('table-btn'), e.card, 420);
                B.render(this);
                if (e.p === me) await this.say(`Tiras ${Txt.card(e.card)}.`);
                else {
                    B.bubble(e.p, e.power ? 'Tira y usa el poder' : 'La tira');
                    await this.say(`${v.Name(e.p)} la tira: ${Txt.card(e.card)}.`, { keep: true });
                    await this.beat('discard');
                }
                break;
            }
            case 'power': break;   // tú eliges en humanPower; de los demás se cuenta lo que hacen
            case 'peekAsk': break;
            case 'peekDone': {
                if (e.p !== me) break;
                const peeks = this._startPeeks || [];
                this._startPeeks = [];
                peeks.forEach((x, i) => { A.card(x.card, A.slotPan(x.target.s, g.players[me].slots.length), i * 0.6); this.flash(me, x.target.s, x.card, 5000); });
                const text = peeks.map(x => `Tu carta ${x.target.s + 1}: ${Txt.card(x.card)}`).join('. ') + '.';
                this.justPeeked = true;
                Board.status('¡Recuérdalas! Se darán la vuelta en 5 segundos');
                await this.say(`${text} ¡Recuérdalas! Pulsa Espacio para oírlas otra vez.`, { keep: true, interrupt: true, force: true });
                await this.sleep(this.visual ? 1200 : 500);
                break;
            }
            case 'peek': {
                if (e.start) { if (e.by === me) (this._startPeeks ||= []).push(e); break; }
                const t = e.target;
                A.peek(span(t.p, t.s));
                if (e.by === me) {
                    A.card(e.card, span(t.p, t.s), 0.2);
                    this.flash(t.p, t.s, e.card, 5000);
                    Board.status(`${cap(v.slot(t.p, t.s, me))}: ${Txt.cardShort(e.card)}`);
                    await this.say(`Miras ${v.slot(t.p, t.s, me)}: ${Txt.card(e.card)}.`, { keep: true });
                } else {
                    this.mark([t], 1800);
                    B.bubble(e.by, t.p === me ? `Mira tu carta ${t.s + 1}` : t.p === e.by ? `Mira su carta ${t.s + 1}` : `Mira una de ${this.names[t.p]}`);
                    await this.say(`${v.Name(e.by)} mira ${v.slot(t.p, t.s, e.by)}.`, { keep: true });
                    await this.beat('peek');
                }
                break;
            }
            case 'swapCards': {
                A.swap(span(e.a.p, e.a.s), span(e.b.p, e.b.s));
                B.fly(B.slotEl(e.a.p, e.a.s), B.slotEl(e.b.p, e.b.s), null, 600);
                B.fly(B.slotEl(e.b.p, e.b.s), B.slotEl(e.a.p, e.a.s), null, 600);
                this.mark([e.a, e.b]);
                const who = e.by === me ? 'Cambias' : `${v.Name(e.by)} cambia`;
                if (e.by !== me) B.bubble(e.by, 'Cambia cartas');
                await this.say(`${who} ${v.slot(e.a.p, e.a.s, e.by)} por ${v.slot(e.b.p, e.b.s, e.by)}.`, { keep: true });
                if (e.by !== me) await this.beat('swapCards');
                break;
            }
            case 'pass': {
                A.pass();
                if (e.p === me) await this.say(e.step === 'look' ? 'No miras ninguna carta.' : 'No cambias ninguna carta.');
                else {
                    B.bubble(e.p, e.step === 'look' ? 'No mira' : 'No cambia');
                    await this.say(`${v.Name(e.p)} ${e.step === 'look' ? 'no mira ninguna carta' : 'no cambia ninguna carta'}.`);
                    await this.beat('pass');
                }
                break;
            }
            case 'burn': {
                const t = e.target;
                A.burnOk(span(t.p, t.s));
                A.card(e.card, 0, 0.3);
                B.fly(B.slotEl(t.p, t.s), $('table-btn'), e.card, 450);
                B.render(this);
                B.bubble(e.by, '¡Quema!');
                B.burst($('table-btn'));
                if (e.by === me) await this.say(`¡Bien! Quemas ${v.slot(t.p, t.s, me)}: ${Txt.card(e.card, { value: false })}.`, { keep: true });
                else {
                    await this.say(`¡${v.Name(e.by)} quema ${v.slot(t.p, t.s, e.by)}! Era ${Txt.card(e.card, { value: false })}.`, { keep: true });
                    if (t.p !== me && t.p !== e.by) await this.quip(t.p, 'burned', 0.5);
                }
                await this.beat('burn');
                break;
            }
            case 'giveAsk': break;
            case 'give': {
                A.swap(e.by === me ? A.slotPan(e.from, g.players[me].slots.length) : pan(e.by), span(e.to.p, e.to.s));
                B.fly(B.seatEl(e.by), B.slotEl(e.to.p, e.to.s), null, 500);
                B.render(this);
                this.mark([e.to], 1800);
                if (e.by === me) await this.say(`Le das tu carta ${e.from + 1} a ${v.name(e.to.p)}.`);
                else if (e.to.p === me) { B.bubble(e.by, 'Te da una carta'); await this.say(`${v.Name(e.by)} te da su carta ${e.from + 1}. Ahora es tu carta ${e.to.s + 1}, y no sabes cuál es.`, { keep: true }); }
                else { B.bubble(e.by, `Da una carta a ${this.names[e.to.p]}`); await this.say(`${v.Name(e.by)} le da su carta ${e.from + 1} a ${v.name(e.to.p)}.`); }
                await this.beat('give');
                break;
            }
            case 'burnFail': {
                const t = e.target;
                A.burnFail(e.by === me ? 0 : pan(e.by));
                A.card(e.card, span(t.p, t.s), 0.4);
                this.flash(t.p, t.s, e.card, 2500);
                B.bubble(e.by, '¡Falla!');
                B.shake(B.slotEl(t.p, t.s));
                if (e.by === me) await this.say(`¡Fallas! ${cap(v.slot(t.p, t.s, me))} era ${Txt.card(e.card, { value: false })}.`, { keep: true });
                else {
                    await this.say(`${v.Name(e.by)} intenta quemar ${v.slot(t.p, t.s, e.by)} y falla: era ${Txt.card(e.card, { value: false })}.`, { keep: true });
                    await this.quip(e.by, 'burnFail', 0.6);
                }
                await this.beat('burnFail');
                break;
            }
            case 'penalty': {
                A.penalty(e.p === me ? 0 : pan(e.p));
                B.fly($('deck-btn'), B.seatEl(e.p), null, 450);
                B.render(this);
                const n = e.slots.length;
                B.bubble(e.p, `+${n} de castigo`);
                if (e.p === me) await this.say(`Te llevas ${n === 1 ? 'una carta' : n + ' cartas'} de castigo, sin mirarla, en tu sitio ${Txt.list(e.slots.map(s => s + 1))}.`, { keep: true });
                else await this.say(`${v.Name(e.p)} se lleva ${n === 1 ? 'una carta' : n + ' cartas'} de castigo.`);
                await this.beat('penalty');
                break;
            }
            case 'call': {
                A.call(e.p === me ? 0 : pan(e.p));
                this.justPeeked = false;
                B.bubble(e.p, '¡Pedro!', 2600);
                B.banner('¡Pedro!', e.p === me ? 'Has cantado' : `Canta ${this.names[e.p]}`);
                if (e.p === me) {
                    this.prompt('¡Pedro! Ahora juega tu turno: roba una carta',
                        '¡Pedro! Has cantado Pedro. Ahora juega tu turno: roba una carta. Después los demás juegan una vez más y se descubren las cartas. Nadie más puede tocar tus cartas.');
                } else {
                    Board.status(`¡${this.names[e.p]} ha cantado Pedro! Última vuelta`);
                    await this.quip(e.p, 'call', 1);
                    await this.say(`${v.Name(e.p)} canta Pedro. Juega su turno y después cada uno jugáis una vez más. Sus cartas ya no se pueden tocar.`, { keep: true });
                    await this.beat('call');
                }
                break;
            }
            case 'reshuffle': A.shuffle(); B.bubble(me, 'Se baraja la mesa'); await this.say('Se ha acabado el mazo: se barajan las cartas de la mesa.'); await this.beat('reshuffle'); break;
            case 'reveal': this.burnQ = []; await this.presentReveal(e); break;
            case 'gameOver': break;
        }
    }

    async presentReveal(e) {
        const g = this.game, me = this.me, v = this.v, A = this.audio;
        this.lastReveal = e;
        this.shown.clear();
        this.justPeeked = false;   // el resultado es lo que se repite con Espacio
        Board.render(this);
        A.shuffle();
        const empty = e.empty || [];
        const why = e.reason === 'call' ? 'Se descubren las cartas.'
            : e.reason === 'empty' ? (empty.includes(me) ? '¡Te has quedado sin cartas! Se descubren todas.' : `¡${cap(Txt.list(empty.map(p => this.names[p])))} se ha quedado sin cartas! Se descubren todas.`)
                : 'No quedan cartas: se descubren todas.';
        Board.status(why);
        await this.say(why);
        const order = [this.pov, ...g.players.map((_, i) => i).filter(i => i !== this.pov)];
        for (const p of order) {
            if (this.stopped) return;
            const cards = e.hands[p].map(x => x.card);
            cards.forEach((c, i) => A.card(c, p === me ? A.slotPan(i, cards.length) : A.panOf(p), i * 0.25));
            let text;
            if (!cards.length) text = `${v.Name(p)}: no ${p === me ? 'tienes' : 'tiene'} cartas. 0 puntos.`;
            else {
                const list = Txt.list(cards.map(c => Txt.cardShort(c)));
                const allEq = g.rules.allEqualOne && cards.length >= 2 && e.scores[p] === 1 && cards.every(c => c.rank === cards[0].rank);
                const total = allEq ? 'Todas del mismo número: 1 punto.' : `Suman ${Txt.points(e.scores[p])}.`;
                text = `${v.Name(p)}: ${list}. ${total}`;
            }
            await this.say(text);
            if (this.visual) await this.sleep(500);
        }
        const w = e.winners;
        const best = e.scores[w[0]];
        let res;
        if (w.length === 1) res = w[0] === me ? `¡Ganas la ronda con ${Txt.points(best)}!` : `Gana la ronda ${v.name(w[0])}, con ${Txt.points(best)}.`;
        else res = `Empate a ${Txt.points(best)} entre ${Txt.list(w.map(p => v.name(p)))}. ${w.includes(me) ? 'Ganáis' : 'Ganan'} la ronda.`;
        if (e.caller !== null && !w.includes(e.caller)) res += e.caller === me ? ' Cantaste Pedro, pero alguien tenía menos.' : ` ${v.Name(e.caller)} cantó Pedro, pero no tenía la suma más baja.`;
        if (w.includes(me)) { A.win(); Board.confetti(); } else A.lose();
        const wins = 'Rondas ganadas: ' + Txt.list(order.map(p => `${v.name(p)} ${e.wins[p]}`)) + '.';
        this.app.recordRound('pedro', w.includes(me), e.scores[me]);
        Board.status(res);
        await this.say(`${res} ${wins}`, { keep: true });
        if (this.visual) await this.sleep(1800);
        if (!(w.includes(me) && w.length === 1)) await this.quip(w.find(p => p !== me), 'win', 0.7);
    }

    resultText() {
        const e = this.lastReveal;
        if (!e) return this.speech.last;
        const order = [this.pov, ...this.game.players.map((_, i) => i).filter(i => i !== this.pov)];
        return order.map(p => `${cap(this.v.name(p))}: ${Txt.points(e.scores[p])}`).join(' · ');
    }

    // ═══ El jugador ════════════════════════════════════

    /**
     * Elegir cartas tocándolas (o con el teclado): sin menús.
     * allowed(p, s, chosen) dice qué cartas valen. count: cuántas. cancel: valor si se cancela (null = no se puede).
     */
    pick({ count = 1, allowed, status, spoken, next = null, cancel = null, cancelLabel = 'Cancelar', focus = 'me' }) {
        return new Promise(resolve => {
            const pk = this.picking = {
                count, chosen: [], cancel, cancelLabel, status, spoken, next,
                allowed: (p, s) => !!this.game.card(p, s) && allowed(p, s, pk.chosen) && !pk.chosen.some(t => t.p === p && t.s === s),
                resolve,
            };
            this.prompt(status, spoken);
            Board.render(this);
            const firstP = focus === 'me' ? this.me : null;
            if (firstP !== null) Board.focusFirst(firstP, (p, s) => pk.allowed(p, s));
        });
    }

    cancelPick() {
        const pk = this.picking;
        if (!pk || pk.cancel == null) return false;
        this.picking = null;
        this.audio.back();
        Board.render(this);
        pk.resolve(pk.cancel);
        return true;
    }

    /** Has tocado (o elegido con el teclado) una carta. */
    cardClick(p, s) {
        if (this.stopped) return;
        const g = this.game, me = this.me;
        const pk = this.picking;
        if (pk) {
            const i = pk.chosen.findIndex(t => t.p === p && t.s === s);
            if (i >= 0) {
                // Te has arrepentido: deja de estar elegida y vuelves a elegir.
                pk.chosen.splice(i, 1);
                this.audio.back();
                this.prompt(pk.status, `${cap(this.v.slot(p, s, me))}, ya no. ${pk.spoken || pk.status}`, { interrupt: true });
                Board.render(this);
                return;
            }
            if (!pk.allowed(p, s)) {
                this.audio.error();
                const why = !g.card(p, s) ? 'Ahí no hay carta.' : (g.isProtected(p) && p !== me) ? 'Las cartas de quien ha cantado Pedro no se tocan.' : 'Esa carta no vale aquí.';
                this.prompt(pk.status, why, { interrupt: true });
                return;
            }
            pk.chosen.push({ p, s });
            this.audio.select();
            if (pk.chosen.length >= pk.count) {
                this.picking = null;
                Board.render(this);
                pk.resolve(pk.chosen.slice());
                return;
            }
            const nx = pk.next?.(pk.chosen) || {};
            pk.status = nx.status || pk.status;
            pk.spoken = nx.spoken || pk.spoken;
            this.prompt(pk.status, pk.spoken, { interrupt: true });
            Board.render(this);
            return;
        }
        if (p === me && this.input('slot', { slot: s })) return;
        // Fuera de eso, tocar una carta es intentar quemarla: en cualquier momento.
        if (g.canBurn(me)) {
            if (!g.card(p, s)) return;
            if (p !== me && (!g.rules.burnOthers || g.isProtected(p))) {
                this.audio.error();
                this.notice(g.isProtected(p) ? 'Las cartas de quien ha cantado Pedro no se tocan.' : 'Con estas reglas solo puedes quemar tus cartas.');
                return;
            }
            this.audio.select();
            const a = { type: 'burn', p: me, target: { p, s }, top: g.top.id };
            if (this.mode === 'client') this.online.send({ t: 'act', a, seq: this.seq });
            else this.queueBurn(a);
            return;
        }
        this.describeCard(p, s);
    }

    async humanStep() {
        const g = this.game, me = this.me;
        switch (g.phase) {
            case 'turn': {
                const kinds = ['draw'];
                if (g.legal(me).includes('call')) kinds.push('call');
                if (g.legal(me).includes('take')) kinds.push('take');
                const a = await this.wait(kinds);
                if (!a || a.kind === 'interrupt') return;
                if (a.kind === 'call') {
                    const ok = await Dialog.open({
                        title: '¿Cantar Pedro?', speak: true,
                        text: 'Cantas y juegas tu turno. Después los demás juegan una vez más y se descubren las cartas. Gana la suma más baja.',
                        items: [{ label: 'Sí, ¡Pedro!', value: true, key: 'p' }, { label: 'No, seguir jugando', value: false }],
                        cancel: false,
                    });
                    if (ok) await this.act({ type: 'call', p: me });
                    else this.prompt('Tu turno: toca el mazo para robar', 'Vale. Pulsa R o toca el mazo para robar.', { interrupt: true });
                    return;
                }
                await this.act({ type: a.kind, p: me });
                return;
            }
            case 'drawn': {
                const kinds = ['slot'];
                if (g.legal(me).includes('discard')) kinds.push('discard');
                const a = await this.wait(kinds);
                if (!a || a.kind === 'interrupt') return;
                if (a.kind === 'discard') { await this.act({ type: 'discard', p: me }); return; }
                if (!g.card(me, a.slot)) { this.audio.error(); this.prompt('Ahí no tienes carta', `En el sitio ${a.slot + 1} no tienes carta.`, { interrupt: true }); return; }
                await this.act({ type: 'swap', p: me, slot: a.slot });
                return;
            }
            case 'power': return this.humanPower();
            case 'give': {
                const to = g.give.to;
                const r = await this.pick({
                    allowed: p => p === me,
                    status: `Elige qué carta le das a ${this.names[to.p]}`,
                    spoken: `Elige qué carta tuya le das a ${this.v.name(to.p)}: con su número, o tocándola.`,
                });
                if (!r) return;
                await this.act({ type: 'give', p: me, slot: r[0].s });
                return;
            }
        }
    }

    async humanPower() {
        const g = this.game, me = this.me, step = g.power.step, rank = g.power.rank;
        const targets = kind => new Set(g.targets(kind, me).map(t => t.p + ':' + t.s));
        if (step === 'look') {
            const ok = targets('look');
            const r = await this.pick({
                allowed: (p, s) => ok.has(p + ':' + s),
                status: rank === 12 ? 'Poder del rey: toca la carta que quieres mirar' : 'Poder del caballo: toca la carta que quieres mirar',
                spoken: `${rank === 12 ? 'Poder del rey: primero, mirar.' : 'Poder del caballo.'} Elige la carta que quieres mirar: tuya, con su número, o de otro, con las flechas y Enter. Escape para no mirar.`,
                cancel: 'none', cancelLabel: 'No mirar',
            });
            if (!r) return;
            if (r === 'none') await this.act({ type: 'pass', p: me });
            else await this.act({ type: 'peek', p: me, target: r[0] });
            return;
        }
        const ok = targets('swap');
        const r = await this.pick({
            count: 2,
            allowed: (p, s, chosen) => ok.has(p + ':' + s) && (!chosen.length || chosen[0].p !== p),
            status: rank === 12 ? 'Poder del rey: elige la primera carta del cambio' : 'Poder de la sota: elige la primera carta del cambio',
            spoken: `${rank === 12 ? 'Poder del rey: ahora, cambiar.' : 'Poder de la sota: cambiar dos cartas.'} Elige la primera carta: tuya, con su número, o de otro, con las flechas y Enter. Escape para no cambiar.`,
            next: chosen => ({
                status: 'Ahora toca la carta de otro jugador · Si te equivocas, toca otra vez la tuya',
                spoken: `Has elegido ${this.v.slot(chosen[0].p, chosen[0].s, me)}. Ahora elige la carta de otro jugador por la que la cambias. Si te has equivocado, vuelve a elegir la misma y quedará libre.`,
            }),
            cancel: 'none', cancelLabel: 'No cambiar',
        });
        if (!r) return;
        if (r === 'none') { await this.act({ type: 'pass', p: me }); return; }
        await this.act({ type: 'swapCards', p: me, a: r[0], b: r[1] });
    }

    // ── Mirar al empezar ──────────────────────────────
    async peekPhase() {
        const g = this.game, me = this.me, k = Math.min(g.rules.peekStart, g.rules.handSize);
        for (const b of this.bots) if (b && g.peekPending.has(b.me)) await this.apply(g.act({ type: 'peekStart', p: b.me, slots: b.choosePeekStart(k) }));
        if (!g.peekPending.has(me)) {
            // Anfitrión: espera a que los demás miren sus cartas.
            if (this.mode !== 'host') return;
            const m = this.takeInbox(x => x.t === 'act' && x.a?.type === 'peekStart' && g.peekPending.has(x.p));
            if (m) await this.apply(g.act({ ...m.a, p: m.p }));
            else await this.waitInbox(250);
            return;
        }
        const word = k === 1 ? 'una de tus cartas' : ({ 2: 'dos', 3: 'tres' }[k] || k) + ' de tus cartas';
        const r = await this.pick({
            count: k,
            allowed: p => p === me,
            status: `Toca ${word} para mirarlas`,
            spoken: `Mira ${word}. Elige ${k === 1 ? 'cuál' : 'la primera'} con las teclas del 1 al ${g.players[me].slots.length}, o tocándola.`,
            next: chosen => ({ status: 'Ahora toca otra', spoken: `Carta ${chosen[chosen.length - 1].s + 1}. Ahora elige otra.` }),
        });
        if (!r) return;
        this.speech.cancel();
        await this.act({ type: 'peekStart', p: me, slots: r.map(t => t.s) });
    }

    clientTask() {
        const g = this.game;
        if (g.phase === 'peek' && g.peekPending.has(this.me)) return () => this.peekPhase();
        return super.clientTask();
    }

    // ── Rivales de la máquina ─────────────────────────
    async botStep(p) {
        const g = this.game, b = this.bots[p];
        if (!b) return;
        const phase = g.phase;
        await this.think({ turn: 450, drawn: 750, power: 700, give: 500 }[phase] || 0);
        // Si mientras pensaba alguien ha quemado, primero eso; después vuelve a pensar.
        if (this.stopped || g.phase !== phase || this.actor() !== p || this.bots[p] !== b || this.burnsWaiting()) return;
        switch (phase) {
            case 'turn': await this.act(b.chooseTurn()); break;
            case 'drawn': await this.act(b.chooseDrawn(g.drawn)); break;
            case 'power': await this.act(b.choosePower(g.power.step)); break;
            case 'give': await this.act(b.chooseGive()); break;
        }
    }

    // ── Quemar, en cualquier momento ──────────────────
    /** Llega una carta para quemar (tuya, de otro jugador de la sala o de un rival). */
    queueBurn(a) {
        if (this.stopped) return;
        // Un doble toque sin querer no cuenta dos veces (la misma carta, sobre la misma carta de la mesa).
        const same = x => x.p === a.p && x.top === a.top && x.target?.p === a.target?.p && x.target?.s === a.target?.s;
        if (!a.bot && this.burnQ.some(same)) return;
        this.burnQ.push(a);
        // Si el juego te estaba esperando (robar, tirar…), se atiende antes la quema.
        this.interruptWait();
        this.wake();
    }

    burnsWaiting() { return this.burnQ.length > 0 && BURN_PHASES.includes(this.game.phase); }
    interruptRemote() { return this.burnsWaiting(); }

    /** Quema, en orden de llegada, las cartas que se han pedido. */
    async processBurns() {
        const g = this.game;
        while (this.burnQ.length && !this.stopped) {
            await this.gate();
            const a = { ...this.burnQ.shift() };
            const bot = a.bot ? this.bots[a.p] : null;
            if (a.bot) {
                // El rival lo vuelve a pensar con lo que sabe ahora.
                a.target = bot && g.top?.id === a.top ? bot.burnTarget(g.top.rank) : null;
                if (!a.target) continue;
                delete a.bot;
            }
            const r = g.act(a);
            if (!r.ok) {
                if (a.p === this.me) { this.audio.error(); this.notice(r.error); }
                else if (this.seats[a.p]?.kind === 'remote') this.online.sendTo(a.p, { t: 'burnError', text: r.error });
                continue;
            }
            await this.apply(r);
            // Si ha quemado la carta de otro, le da una suya antes de seguir.
            while (g.phase === 'give' && !this.stopped) await this.stepFor(g.give.by);
        }
    }

    /** Cada vez que cambia la carta de la mesa, los rivales que creen tener una igual se preparan para quemarla. */
    async planBots() {
        const g = this.game;
        if (this.mode === 'client' || this.stopped || !g.top || !BURN_PHASES.includes(g.phase)) return;
        const id = g.top.id;
        if (this.plannedTop === id) return;
        this.plannedTop = id;
        // En una sala, empiezan a contar cuando todos han oído qué carta ha caído.
        if (this.mode === 'host') await this.online.waitAcks(this.seq, 8000);
        for (const b of this.bots) {
            const d = b?.chooseBurn(g.top?.rank);
            if (!d) continue;
            this.sleep(d.delay * this.speed).then(() => {
                if (!this.stopped && this.bots[b.me] === b && g.top?.id === id) this.queueBurn({ type: 'burn', p: b.me, top: id, bot: true });
            });
        }
    }

    // ═══ Anfitrión ═══
    remoteInstant(p, msg) {
        // Quemar se puede en cualquier momento: va directo a la cola (el sitio sale de la conexión).
        if (msg.t === 'act' && msg.a?.type === 'burn') { this.queueBurn({ type: 'burn', p, target: msg.a.target, top: msg.a.top }); return true; }
        return false;
    }

    // ═══ Información a petición ════════════════════════

    /** Cómo se lee cada carta (lector de pantalla y voz al moverse por la mesa). */
    cardLabel(p, s) {
        const g = this.game, me = this.me;
        if (!g.card(p, s)) return p === me ? `Sitio ${s + 1}, sin carta` : `Sitio ${s + 1} de ${this.names[p]}, sin carta`;
        const face = this.lastReveal ? this.lastReveal.hands[p]?.find(x => x.s === s)?.card : this.shown.get(p + ':' + s);
        let label = p === me ? `Tu carta ${s + 1}` : `${cap(this.names[p])}, carta ${s + 1}`;
        if (face) label += `: ${Txt.cardShort(face)}`;
        else if (p === me && (this.settings.memoryHelp || this.practice)) {
            const k = this.helper.get(me, s);
            if (k) label += `: ${Txt.cardShort(k)}`;
        }
        if (this.picking?.allowed(p, s)) label += '. Elegir';
        else if (this.picking?.chosen.some(t => t.p === p && t.s === s)) label += '. Elegida';
        else if (p === me && this.want?.kinds.has('slot') && g.phase === 'drawn') label += '. Cambiar por la robada';
        else if (g.canBurn(me) && (p === me || (g.rules.burnOthers && !g.isProtected(p)))) label += '. Quemar';
        return label;
    }

    describeTable() {
        const top = this.game.top;
        if (!this.visual) this.speech.say(top ? `En la mesa, ${Txt.card(top)}.` : 'La mesa está vacía.', { interrupt: true });
    }

    describeCard(p, s) {
        const g = this.game;
        if (p === this.me) this.audio.slot(s, g.players[this.me].slots.length);
        if (this.visual) return;
        this.speech.say(this.cardLabel(p, s).replace(/\. (Quemar|Elegir|Cambiar por la robada)$/, '') + '.', { interrupt: true });
    }

    info() {
        const g = this.game, v = this.v, me = this.me;
        const parts = [`Ronda ${g.round}.`];
        if (g.top) parts.push(`En la mesa, ${Txt.card(g.top)}.`);
        parts.push(`Quedan ${g.deck.length} cartas en el mazo.`);
        const counts = g.players.map((_, p) => {
            const n = g.countOf(p);
            return p === me ? `tú tienes ${n}` : `${v.name(p)} ${n}`;
        });
        parts.push(cap(Txt.list(counts)) + '.');
        if (g.caller !== null) parts.push(g.caller === me ? 'Has cantado Pedro: última vuelta.' : `${v.Name(g.caller)} ha cantado Pedro: última vuelta.`);
        const turn = g.phase === 'turn' || g.phase === 'drawn' ? (g.current === me ? 'Es tu turno.' : `Es el turno de ${v.name(g.current)}.`) : '';
        if (turn) parts.push(turn);
        if (g.phase === 'drawn' && g.current === me && g.drawn) parts.push(`Tienes robada ${Txt.card(g.drawn)}.`);
        parts.push('Rondas ganadas: ' + Txt.list(g.players.map((pl, p) => `${v.name(p)} ${pl.wins}`)) + '.');
        this.speech.say(parts.join(' '), { interrupt: true });
    }

    myCards() {
        const g = this.game, me = this.me;
        const slots = g.slotsOf(me);
        if (!slots.length) { this.speech.say('No tienes cartas.', { interrupt: true }); return; }
        const help = this.settings.memoryHelp || this.practice;
        let text = `Tienes ${slots.length === 1 ? '1 carta' : slots.length + ' cartas'}, en ${slots.length === 1 ? 'el sitio' : 'los sitios'} ${Txt.list(slots.map(s => s + 1))}.`;
        if (help) {
            const parts = slots.map(s => { const k = this.helper.get(me, s); return `${s + 1}: ${k ? Txt.cardShort(k) : 'no la conoces'}`; });
            text += ' ' + parts.join('. ') + '.';
            const known = slots.map(s => this.helper.get(me, s));
            if (known.every(Boolean)) text += ` Suman ${Txt.points(scoreCards(known, g.rules))}.`;
        }
        this.speech.say(text, { interrupt: true });
    }

    keysHelp() {
        const g = this.game;
        const t = [
            'R: robar del mazo. P: cantar Pedro, antes de robar.',
            g.rules.takeFromTable ? 'M: coger la carta de la mesa.' : '',
            'Del 1 al 6: tus cartas. Con una carta robada, la cambias por esa. T: tirar la carta robada.',
            'Flechas: moverte por las cartas de la mesa; arriba y abajo cambian de jugador. Enter: elegir la carta.',
            'Para quemar, en cualquier momento: tu carta con su número, o la de otro con las flechas y Enter. Q: qué carta hay en la mesa.',
            'I: cómo va la partida. C: tus cartas. Espacio: repetir lo último. Escape: cancelar o pausa.',
        ].filter(Boolean);
        this.speech.say(t.join(' ') + this.srKeysTip(), { interrupt: true });
    }

    // ── Teclado ───────────────────────────────────────
    gameKey(k, e) {
        if (/^[1-9]$/.test(k)) {
            e.preventDefault();
            const s = +k - 1;
            if (s < this.game.players[this.me].slots.length) this.cardClick(this.me, s);
            else { this.audio.error(); this.speech.say(`No tienes carta ${s + 1}.`, { interrupt: true }); }
            return true;
        }
        if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
            e.preventDefault();
            Board.moveCursor(k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0, k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0);
            return true;
        }
        if (k === 'q') {
            e.preventDefault();
            const g = this.game;
            if (g.canBurn(this.me)) {
                Board.focusFirst(this.me);
                this.speech.say(`En la mesa, ${Txt.card(g.top)}.${this.watching ? '' : ' Para quemar, tu carta con su número, o la de otro con las flechas y Enter.'}`, { interrupt: true });
            } else { this.audio.error(); this.explainCant('burn'); }
            return true;
        }
        const map = { r: 'draw', p: 'call', m: 'take', t: 'discard' };
        if (map[k]) {
            e.preventDefault();
            if (!this.input(map[k])) { this.audio.error(); this.explainCant(map[k]); }
            return true;
        }
        return false;
    }

    explainCant(kind) {
        const g = this.game, me = this.me;
        let t = 'Ahora no.';
        if (kind === 'call' && g.caller !== null) t = 'Ya se ha cantado Pedro.';
        else if (kind === 'call' && g.phase === 'drawn' && g.current === me) t = 'Pedro se canta antes de robar.';
        else if ((kind === 'draw' || kind === 'call') && g.current !== me) t = `No es tu turno: juega ${this.v.name(g.current)}.`;
        else if (kind === 'discard' && g.drawnFrom === 'table') t = 'La carta de la mesa tienes que cambiarla por una tuya.';
        else if (kind === 'take') t = g.rules.takeFromTable ? 'Solo al empezar tu turno.' : 'Con estas reglas no se coge de la mesa.';
        else if (kind === 'burn') t = g.isFrozen?.(me) ? 'Has cantado Pedro: ya no quemas.' : 'Ahora no se puede quemar.';
        if (this.visual) { Board.status(t); return; }
        if (this.speech.history[this.speech.history.length - 1] !== t) this.speech.say(t, { interrupt: false });   // sin cortar lo que se está contando
    }
}
