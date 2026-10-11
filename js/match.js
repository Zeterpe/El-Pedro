/* =============================================
   EL PEDRO — match.js
   Una partida en la mesa: reparte, da el turno,
   mueve a los rivales de la máquina, abre la
   ventana para quemar y cuenta lo que pasa con
   voz, sonido y animaciones. También juega en una
   sala: como anfitrión (la baraja está aquí) o como
   invitado (el anfitrión manda lo que pasa).

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

/**
 * mode: 'local' (tú y la máquina), 'host' (has creado una sala: la baraja está en tu navegador)
 * o 'client' (te has unido a una sala: el anfitrión te manda lo que pasa).
 * seats: [{ name, kind: 'me' | 'bot' | 'remote', char }] en el orden de la mesa.
 */
class Match {
    constructor(app, { seats, me = 0, mode = 'local', online = null, rules, seed = (Date.now() ^ 0x5eed) >>> 0, practice = false }) {
        this.app = app;
        this.settings = app.settings;
        this.speech = app.speech;
        this.audio = app.audio;
        this.mode = mode;
        this.online = online;
        this.seats = seats.map(s => ({ ...s }));
        this.practice = practice;
        this.me = me;
        this.names = this.seats.map((s, i) => i === me ? 'tú' : s.name);
        this.v = new Voice(this.names, me);
        this.game = mode === 'client'
            ? new MirrorGame({ names: this.seats.map(s => s.name), rules, me })
            : new PedroGame({ players: this.seats.map(s => ({ name: s.name })), rules, seed });
        this.seed = seed;
        this.bots = this.seats.map((s, i) => s.kind === 'bot' && mode !== 'client' ? new Bot(this.game, i, s.char, makeRng(seed + 101 * (i + 1))) : null);
        this.helper = new Memory(me, {});         // memoria perfecta: para la ayuda de memoria
        this.audio.setPlayers(this.game.n, me);
        this.inbox = [];                           // anfitrión: lo que mandan los demás jugadores
        this._wake = null;
        this.seq = 0;                              // número del último paquete enviado o recibido
        this.sentFor = -1;                         // invitado: ya ha respondido a este paquete
        this.prompting = false;
        this.stopped = false;
        this.paused = false;
        this.want = null;                          // lo que se espera del jugador (teclas o botones)
        this.picking = null;                       // elegir cartas tocándolas
        this.burnReq = null;                       // quiere quemar una carta ({ target }) o pasar ('pass')
        this.passedBurn = false;
        this.shown = new Map();                    // cartas boca arriba un momento: 'p:s' → carta
        this.highlight = null;
        this.hintCount = {};
        this.lastReveal = null;
        this.gid = 0;                              // número de partida en la sala (para no mezclar con la anterior)
    }

    get timeScale() { return this.app.timeScale; }
    get speed() { return { lenta: 1.6, normal: 1, rapida: 0.55 }[this.settings.botSpeed] ?? 1; }
    get brief() { return this.settings.verbosity === 'breve'; }
    get visual() { return this.speech.mode === 'visual'; }
    isHuman(p) { return p === this.me || this.seats[p].kind === 'remote'; }

    // ── Tiempo (se para con la pausa y con los diálogos) ──
    async sleep(ms) {
        let left = ms * this.timeScale;
        while (left > 0 && !this.stopped) {
            await new Promise(r => setTimeout(r, Math.min(50, left)));
            if (!this.paused && !Dialog.active) left -= 50;
        }
    }
    think(ms) { return this.sleep(ms * this.speed); }
    /** Sin voz, cada cosa que pasa dura un momento para que se vea. */
    beat(t) { return this.visual && VISUAL_BEAT[t] ? this.sleep(VISUAL_BEAT[t] * this.speed) : Promise.resolve(); }

    async gate() { while ((this.paused || Dialog.active) && !this.stopped) await new Promise(r => setTimeout(r, 50)); }

    /** Dice algo y espera a que termine. keep: se puede repetir con Espacio. */
    async say(text, { keep = false, pitch = 1, rate = 1, interrupt = false, force = false } = {}) {
        if (this.stopped || !text) return;
        if (this.justPeeked && !force) keep = false;   // hasta tu primera jugada, Espacio repite tus cartas
        await this.speech.say(text, { interrupt, keep, pitch, rate });
    }

    /** Lo que tienes que hacer ahora: en la línea de estado y, con voz, dicho. */
    prompt(status, spoken = null, opts = {}) {
        Board.status(status);
        if (spoken !== false && !this.visual) this.say(spoken || status, { keep: true, ...opts });
    }

    hint(id, text) {
        if (!this.settings.hints || !text) return '';
        this.hintCount[id] = (this.hintCount[id] || 0) + 1;
        return this.hintCount[id] <= 2 ? ' ' + text : '';
    }

    stop() {
        this.stopped = true;
        this.speech.cancel();
        if (this.want) { const w = this.want; this.want = null; w.resolve(null); }
        if (this.picking) { const p = this.picking; this.picking = null; p.resolve(null); }
        this._wake?.();
    }

    // ── Bucle principal ───────────────────────────────
    async run() {
        if (this.mode === 'client') return this.runClient();
        Board.build(this);
        await this.intro();
        while (!this.stopped) {
            await this.gate();
            const g = this.game;
            if (g.phase === 'idle') { await this.apply(g.startRound()); continue; }
            if (g.phase === 'roundOver') {
                const go = await this.afterRound();
                if (!go || this.stopped) break;
                await this.apply(g.startRound());
                continue;
            }
            if (g.phase === 'gameOver') { await this.afterGame(); break; }
            if (g.phase === 'peek') { await this.peekPhase(); continue; }
            if (g.phase === 'burn') { await this.burnWindow(); continue; }
            await this.stepFor(this.actor());
        }
    }

    actor() {
        const g = this.game;
        if (g.phase === 'power') return g.power.by;
        if (g.phase === 'give') return g.give.by;
        return g.current;
    }

    /** Hace jugar a quien le toque (tú, otro jugador de la sala o la máquina). */
    stepFor(p) {
        if (p === this.me) return this.humanStep();
        if (this.seats[p].kind === 'remote') return this.remoteStep(p);
        return this.botStep(p);
    }

    async intro() {
        const seats = this.seats.map((s, p) => {
            if (p === this.me) return null;
            const bot = this.mode !== 'local' && s.kind === 'bot' ? ', de la máquina' : '';
            return `${s.name}${bot}, ${SEAT_WORD[this.audio.seatOf(p)]}`;
        }).filter(Boolean);
        const goal = this.game.rules.winsToWin;
        const goalText = goal > 0 ? ` Gana quien consiga antes ${goal === 1 ? 'una ronda' : goal + ' rondas'}.` : '';
        let text = `Juegas contra ${Txt.list(seats)}.${goalText}`;
        if (this.practice) text = 'Partida de práctica: la ayuda de memoria está activada, así que el juego te recuerda las cartas que has visto. ' + text;
        Board.status(this.visual ? `Juegas contra ${Txt.list(this.seats.filter((_, p) => p !== this.me).map(s => s.name))}` : '');
        await this.say(text, { keep: true });
    }

    /** Aplica el resultado de una acción: memorias, sonido, voz, animaciones y dibujo. */
    async apply(res) {
        if (!res || this.stopped) return res;
        if (!res.ok) { this.audio.error(); this.prompt(res.error, null, { interrupt: true }); return res; }
        for (const e of res.events) {
            for (const b of this.bots) b?.observe(e);
            this.helper.observe(e);
        }
        if (this.mode === 'host' && res.events.length) {
            this.seq = this.online.broadcast(this, res.events);
            if (res.events.some(e => e.t === 'burnOpen')) this.burnSeq = this.seq;
        }
        for (const e of res.events) {
            if (this.stopped) break;
            await this.present(e);
            Board.render(this);
        }
        Board.render(this);
        return res;
    }

    act(a) {
        if (this.mode === 'client') {
            // El invitado no tiene la baraja: manda su jugada al anfitrión y espera su respuesta.
            this.sentFor = this.seq;
            this.online.send({ t: 'act', a, seq: this.seq });
            return Promise.resolve({ ok: true, events: [] });
        }
        return this.apply(this.game.act(a));
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
                this.passedBurn = false;
                A.shuffle();
                await this.sleep(950);
                A.deal(g.n, g.rules.handSize);
                const dealer = e.dealer === me ? 'Repartes tú' : `Reparte ${g.players[e.dealer].name}`;
                A.card(e.top, 0, 0.4 + g.n * g.rules.handSize * 0.09);
                B.status(`Ronda ${e.round}`);
                await this.say(`Ronda ${e.round}. ${dealer}. En la mesa, ${Txt.card(e.top)}.`, { keep: true });
                break;
            }
            case 'turn': {
                this.passedBurn = false;
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
                        const hint = this.hint('drawn', 'Pulsa el número de una de tus cartas, o tócala, para cambiarla por esta. Con la T, o con el botón Tirar, la tiras a la mesa.');
                        this.prompt(`Has robado ${Txt.cardShort(e.card)}: toca una de tus cartas para cambiarla, o tírala`, `Has robado ${Txt.card(e.card)}.${pw}${hint}`);
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
            case 'burnOpen': A.burnOpen(); break;
            case 'burn': {
                const t = e.target;
                A.burnOk(span(t.p, t.s));
                A.card(e.card, 0, 0.3);
                B.fly(B.slotEl(t.p, t.s), $('table-btn'), e.card, 450);
                B.bubble(e.by, '¡Quema!');
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
                const n = e.slots.length;
                B.bubble(e.p, `+${n} de castigo`);
                if (e.p === me) await this.say(`Te llevas ${n === 1 ? 'una carta' : n + ' cartas'} de castigo, sin mirarla, en tu sitio ${Txt.list(e.slots.map(s => s + 1))}.`, { keep: true });
                else await this.say(`${v.Name(e.p)} se lleva ${n === 1 ? 'una carta' : n + ' cartas'} de castigo.`);
                await this.beat('penalty');
                break;
            }
            case 'burnClose': break;
            case 'call': {
                A.call(e.p === me ? 0 : pan(e.p));
                this.justPeeked = false;
                B.bubble(e.p, '¡Pedro!', 2600);
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
            case 'reveal': await this.presentReveal(e); break;
            case 'gameOver': break;
        }
    }

    async quip(p, kind, chance) {
        if (!this.settings.quips || p === this.me) return;
        const b = this.bots[p];
        if (!b || !b.rng.chance(chance)) return;
        const q = b.quip(kind);
        if (!q) return;
        if (this.mode === 'host') this.online.broadcastAll({ t: 'quip', p, text: q, pitch: b.char.pitch, rate: b.char.rate });
        Board.bubble(p, q, 2600);
        await this.say(q, { pitch: b.char.pitch, rate: b.char.rate });
    }

    async presentReveal(e) {
        const g = this.game, me = this.me, v = this.v, A = this.audio;
        this.lastReveal = e;
        this.shown.clear();
        Board.render(this);
        A.shuffle();
        const why = e.reason === 'call' ? 'Se descubren las cartas.' : 'No quedan cartas: se descubren todas.';
        Board.status(why);
        await this.say(why);
        const order = [me, ...g.players.map((_, i) => i).filter(i => i !== me)];
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
        if (w.includes(me)) A.win(); else A.lose();
        const wins = 'Rondas ganadas: ' + Txt.list(order.map(p => `${v.name(p)} ${e.wins[p]}`)) + '.';
        this.app.recordRound(e.scores[me], w.includes(me));
        Board.status(res);
        await this.say(`${res} ${wins}`, { keep: true });
        if (this.visual) await this.sleep(1800);
        if (!(w.includes(me) && w.length === 1)) await this.quip(w.find(p => p !== me), 'win', 0.7);
    }

    resultText() {
        const e = this.lastReveal;
        if (!e) return this.speech.last;
        const order = [this.me, ...this.game.players.map((_, i) => i).filter(i => i !== this.me)];
        return order.map(p => `${cap(this.v.name(p))}: ${Txt.points(e.scores[p])}`).join(' · ');
    }

    async afterRound() {
        if (this.stopped) return false;
        const r = await Dialog.open({
            title: `Fin de la ronda ${this.game.round}`,
            text: this.visual ? this.resultText() : this.speech.last,
            speak: `Fin de la ronda ${this.game.round}.`,
            items: [
                { label: 'Siguiente ronda', value: 'next' },
                ...(this.visual ? [] : [{ label: 'Repetir el resultado', value: 'repeat', key: 'r' }]),
                { label: this.mode === 'host' ? 'Cerrar la sala y salir' : 'Salir al menú', value: 'menu' },
            ],
            cancel: 'menu',
        });
        if (r === 'repeat') { await this.say(this.speech.last, { interrupt: true }); return this.afterRound(); }
        if (r === 'next') return true;
        this.app.leaveMatch();   // en una sala, la cierra
        return false;
    }

    async afterGame() {
        const g = this.game, me = this.me;
        const won = g.winners.includes(me);
        if (won) this.audio.win(); else this.audio.lose();
        this.app.recordGame(won);
        const who = won ? (g.winners.length > 1 ? '¡Has ganado la partida, empatado con ' + Txt.list(g.winners.filter(p => p !== me).map(p => this.v.name(p))) + '!' : '¡Has ganado la partida!')
            : `Gana la partida ${Txt.list(g.winners.map(p => this.v.name(p)))}.`;
        Board.status(who);
        await this.say(who, { keep: true });
        const items = this.mode === 'host'
            ? [{ label: 'Otra partida en esta mesa', value: 'again' }, { label: 'Volver a la sala', value: 'lobby' }, { label: 'Cerrar la sala y salir', value: 'menu' }]
            : [{ label: 'Jugar otra vez con los mismos rivales', value: 'again' }, { label: 'Salir al menú', value: 'menu' }];
        const r = await Dialog.open({ title: 'Fin de la partida', text: who, speak: 'Fin de la partida.', items, cancel: 'menu' });
        if (this.stopped) return;
        if (this.mode === 'host') {
            if (r === 'again') this.online.restart();
            else if (r === 'lobby') this.online.backToLobby();
            else this.app.leaveMatch();
            return;
        }
        if (r === 'again') this.app.startMatch({ rivals: this.seats.filter(s => s.kind === 'bot').map(s => s.char), practice: this.practice });
        else this.app.leaveMatch();
    }

    // ═══ El jugador ════════════════════════════════════

    /** Espera una entrada del jugador. kinds: lo que vale ahora (slot, draw, call, take, discard). */
    wait(kinds) {
        return new Promise(resolve => { this.want = { kinds: new Set(kinds), resolve }; Board.render(this); });
    }

    /** Llega una entrada (tecla o botón). Devuelve true si se ha usado. */
    input(kind, arg = null) {
        if (this.stopped) return false;
        if (this.game.phase === 'burn' && kind === 'pass') {
            if (!this.game.canBurn(this.me) || this.passedBurn) return false;
            this.passedBurn = true;
            this.audio.pass();
            if (this.mode === 'client') this.online.send({ t: 'pass', seq: this.seq });
            else this.burnReq = 'pass';
            Board.render(this);
            return true;
        }
        const w = this.want;
        if (!w || !w.kinds.has(kind)) return false;
        this.want = null;
        this.speech.cancel();   // corta lo que se estaba diciendo
        w.resolve({ kind, ...(arg || {}) });
        Board.render(this);
        return true;
    }

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
        // Ventana para quemar: tocar una carta es intentar quemarla.
        if (g.phase === 'burn' && g.canBurn(me) && !this.passedBurn) {
            if (!g.card(p, s)) return;
            if (p !== me && (!g.rules.burnOthers || g.isProtected(p))) {
                this.audio.error();
                const why = g.isProtected(p) ? 'Las cartas de quien ha cantado Pedro no se tocan.' : 'Con estas reglas solo puedes quemar tus cartas.';
                if (this.visual) Board.status(why); else this.speech.say(why, { interrupt: true });
                return;
            }
            this.audio.select();
            const target = { p, s };
            if (this.mode === 'client') this.online.send({ t: 'act', a: { type: 'burn', p: me, target }, seq: this.seq });
            else this.burnReq = { target };
            return;
        }
        if (p === me && this.input('slot', { slot: s })) return;
        if (p === me && this.want?.kinds.has('draw')) { this.audio.error(); this.prompt('Primero roba una carta: toca el mazo', 'Primero roba una carta: pulsa R o toca el mazo.', { interrupt: true }); return; }
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
                if (!a) return;
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
                if (!a) return;
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

    // ── Rivales de la máquina ─────────────────────────
    async botStep(p) {
        const g = this.game, b = this.bots[p];
        if (!b) return;
        switch (g.phase) {
            case 'turn': await this.think(450); await this.act(b.chooseTurn()); break;
            case 'drawn': await this.think(750); await this.act(b.chooseDrawn(g.drawn)); break;
            case 'power': await this.think(700); await this.act(b.choosePower(g.power.step)); break;
            case 'give': await this.think(500); await this.act(b.chooseGive()); break;
        }
    }

    // ── Ventana para quemar ───────────────────────────
    async burnWindow() {
        const g = this.game, me = this.me;
        const secs = g.rules.burnTime ?? this.settings.burnWindow ?? 4;
        const W = (secs || 0) * 1000;   // 0: hasta que pasen todos
        let elapsed = 0, deadline = W, lastTick = 0;
        const passed = new Set();
        const humans = this.seats.map((_, p) => p).filter(p => this.isHuman(p));
        this.burnReq = null;
        this.passedBurn = false;
        // En una sala, la ventana empieza cuando todos han oído qué carta ha caído.
        if (this.mode === 'host') await this.online.waitAcks(this.seq, 20000);
        const plan = () => {
            const value = g.burnWin?.value;
            return this.bots.filter(Boolean).map(b => {
                const d = b.chooseBurn(value);
                return d ? { b, at: elapsed + d.delay * this.speed, target: d.target } : null;
            }).filter(Boolean).sort((x, y) => x.at - y.at);
        };
        let schedule = plan();
        const afterBurn = async r => {
            if (g.phase === 'give') await this.stepFor(g.give.by);
            if (r.ok) {
                if (this.mode === 'host') await this.online.waitAcks(this.seq, 8000);
                schedule = plan();
                deadline = elapsed + Math.max(W, 1500);
            }
        };
        if (g.canBurn(me)) {
            const hint = this.hint('burn', `Si tienes una carta igual, ${RANK_NAME[g.burnWin.value]}, pulsa su número o tócala para quemarla. Si es de otro, llega a ella con las flechas y pulsa Enter. Si no tienes ninguna, pulsa N.`);
            this.prompt(`¿Tienes ${Txt.rankWord(g.burnWin.value)}? Tócala para quemarla`, hint ? hint.trim() : false);
        }
        Board.render(this);
        while (g.phase === 'burn' && !this.stopped) {
            await this.gate();
            // ¿Quieres quemar una carta (la has tocado)?
            if (this.burnReq && this.burnReq !== 'pass') {
                const { target } = this.burnReq;
                this.burnReq = null;
                if (g.canBurn(me)) await afterBurn(await this.act({ type: 'burn', p: me, target }));
                continue;
            }
            if (this.burnReq === 'pass') { this.burnReq = null; passed.add(me); }
            // ¿Lo quiere otro jugador de la sala? (Lo que llegue de una carta anterior ya no vale.)
            const isBurnMsg = x => x.t === 'pass' || (x.t === 'act' && x.a?.type === 'burn');
            this.inbox = this.inbox.filter(x => !isBurnMsg(x) || (x.seq | 0) >= (this.burnSeq | 0));
            const m = this.takeInbox(isBurnMsg);
            if (m) {
                if (m.t === 'pass') passed.add(m.p);
                else {
                    const r = g.act({ type: 'burn', p: m.p, target: m.a.target });
                    if (!r.ok) this.online.sendTo(m.p, { t: 'error', text: r.error });
                    else { await this.apply(r); await afterBurn(r); }
                }
                continue;
            }
            const humanCan = humans.some(p => g.canBurn(p) && !passed.has(p) && this.isHuman(p));
            // Le toca a un rival de la máquina que ha visto una carta igual.
            if (schedule.length && schedule[0].at <= elapsed && (W === 0 || schedule[0].at <= deadline)) {
                const { b } = schedule.shift();
                const d = this.bots[b.me] === b ? b.chooseBurn(g.burnWin.value) : null;   // vuelve a pensarlo
                if (d) await afterBurn(await this.act({ type: 'burn', p: b.me, target: d.target }));
                continue;
            }
            const botsPending = schedule.some(x => W === 0 || x.at <= deadline);
            if (!humanCan && !botsPending) break;
            if (W > 0 && elapsed >= deadline) break;
            await this.sleep(50);
            elapsed += 50;
            const mine = g.canBurn(me) && !passed.has(me);
            if (mine && W > 0 && this.settings.burnTicks && elapsed - lastTick >= 1000) { lastTick = elapsed; this.audio.tick(deadline - elapsed <= 1000); }
        }
        this.burnReq = null;
        if (g.phase === 'burn') await this.apply(g.act({ type: 'endBurn' }));
    }

    // ═══ Anfitrión: los demás jugadores de la sala ═════
    onRemote(p, msg) {
        this.inbox.push({ ...msg, p });   // el sitio sale de la conexión, no de lo que diga el mensaje
        const w = this._wake; this._wake = null; w?.();
    }

    takeInbox(pred) {
        const i = this.inbox.findIndex(pred);
        return i < 0 ? null : this.inbox.splice(i, 1)[0];
    }

    waitInbox(ms = 200) {
        return new Promise(r => { this._wake = r; setTimeout(r, ms); });
    }

    async remoteStep(p) {
        const g = this.game;
        const phase = g.phase, round = g.round, turns = g.turns;
        while (!this.stopped && this.seats[p].kind === 'remote' && g.phase === phase && g.round === round && g.turns === turns && this.actor() === p) {
            await this.gate();
            const m = this.takeInbox(x => x.p === p && x.t === 'act');
            if (m) {
                if (m.a?.type === 'burn' || m.a?.type === 'peekStart') continue;   // llegó tarde: ya no vale
                const res = g.act({ ...m.a, p });
                if (!res.ok) { this.online.sendTo(p, { t: 'error', text: res.error }); continue; }
                await this.apply(res);
                return;
            }
            await this.waitInbox(250);
        }
    }

    /** Un jugador se ha ido de la sala: juega la máquina por esa persona. */
    async seatLeft(p) {
        const s = this.seats[p];
        if (!s || s.kind !== 'remote') return;
        s.kind = 'bot';
        s.char = { id: 'ausente', name: s.name, level: 'normal', pitch: 1, rate: 1, quips: {} };
        const b = this.bots[p] = new Bot(this.game, p, s.char, makeRng(this.seed + 977 * (p + 1)));
        b.myTurns = 3;   // empieza sin recordar nada, pero puede cantar Pedro
        const w = this._wake; this._wake = null; w?.();
        this.online?.broadcastAll({ t: 'left', p });
        Board.bubble(p, 'Se ha ido');
        await this.say(`${cap(s.name)} se ha ido de la mesa. Juega la máquina por esa persona.`);
    }

    // ═══ Invitado: lo que manda el anfitrión ═══════════
    async runClient() {
        Board.build(this);
        await this.intro();
        while (!this.stopped) {
            const msg = await this.online.next();
            if (!msg || this.stopped) break;
            switch (msg.t) {
                case 'batch': {
                    if (this.waitDialog) { this.waitDialog = false; Dialog.close('auto'); }
                    this.game.setView(msg.view);
                    for (const e of msg.events) { this.game.observe(e); this.helper.observe(e); }
                    this.seq = msg.seq;
                    for (const e of msg.events) {
                        if (this.stopped) break;
                        await this.present(e);
                        Board.render(this);
                    }
                    if (this.game.phase !== 'roundOver' && this.game.phase !== 'gameOver') this.lastReveal = null;
                    Board.render(this);
                    if (!this.stopped) this.online.send({ t: 'ack', seq: msg.seq, gid: this.gid });
                    this.clientPrompt();
                    break;
                }
                case 'quip':
                    Board.bubble(msg.p, msg.text, 2600);
                    if (this.settings.quips) await this.say(msg.text, { pitch: msg.pitch, rate: msg.rate });
                    break;
                case 'error':
                    this.audio.error();
                    this.prompt(msg.text, null, { interrupt: true });
                    this.sentFor = -1;
                    this.clientPrompt();
                    break;
                case 'left': {
                    if (this.seats[msg.p]) this.seats[msg.p].kind = 'bot';
                    Board.bubble(msg.p, 'Se ha ido');
                    await this.say(`${cap(this.names[msg.p])} se ha ido de la mesa. Juega la máquina por esa persona.`);
                    break;
                }
            }
        }
    }

    /** Después de cada paquete: ¿te toca hacer algo? */
    clientPrompt() {
        if (this.prompting || this.stopped || this.sentFor === this.seq) return;
        const g = this.game, me = this.me;
        let task = null;
        if (g.phase === 'peek' && g.peekPending.has(me)) task = () => this.peekPhase();
        else if (['turn', 'drawn', 'power', 'give'].includes(g.phase) && this.actor() === me) task = () => this.humanStep();
        else if (g.phase === 'roundOver' || g.phase === 'gameOver') task = () => this.clientWait();
        if (!task) return;
        this.prompting = true;
        Promise.resolve().then(task).catch(err => console.error(err)).finally(() => {
            this.prompting = false;
            setTimeout(() => this.clientPrompt(), 0);   // por si la mesa cambió mientras tanto
        });
    }

    /** Fin de ronda o de partida en una sala: decide el anfitrión. */
    async clientWait() {
        const g = this.game, host = this.names[0];
        const phase = g.phase, round = g.round;
        const over = phase === 'gameOver';
        if (over && !this._recorded) {
            this._recorded = true;
            const won = (g.winners || []).includes(this.me);
            this.app.recordGame(won);
            const who = won ? '¡Has ganado la partida!' : `Gana la partida ${Txt.list((g.winners || []).map(p => this.v.name(p)))}.`;
            Board.status(who);
            await this.say(who, { keep: true });
        }
        this.waitDialog = true;
        const r = await Dialog.open({
            title: over ? 'Fin de la partida' : `Fin de la ronda ${g.round}`,
            text: `${this.visual ? this.resultText() : this.speech.last} Espera a que ${host} ${over ? 'decida si jugáis otra' : 'empiece la siguiente ronda'}.`,
            speak: `${over ? 'Fin de la partida' : 'Fin de la ronda'}. Espera a que ${host} ${over ? 'decida si jugáis otra' : 'empiece la siguiente'}.`,
            items: [
                ...(this.visual ? [] : [{ label: 'Repetir el resultado', value: 'repeat', key: 'r' }]),
                { label: 'Salir de la sala', value: 'leave' },
            ],
        });
        this.waitDialog = false;
        if (r === 'repeat') {
            await this.say(this.speech.last, { interrupt: true });
            if (!this.stopped && g.phase === phase && g.round === round) return this.clientWait();
        }
        if (r === 'leave') this.app.leaveMatch();
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
        else if (g.phase === 'burn' && g.canBurn(me) && !this.passedBurn && (p === me || (g.rules.burnOthers && !g.isProtected(p)))) label += '. Quemar';
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
            'Para quemar, justo cuando cae una carta en la mesa, elige la tuya con su número o la de otro con Enter. N: no tengo ninguna.',
            'I: cómo va la partida. C: tus cartas. Espacio: repetir lo último. Escape: cancelar o pausa.',
        ].filter(Boolean);
        this.speech.say(t.join(' '), { interrupt: true });
    }

    async pause() {
        if (this.paused || Dialog.active) return;
        this.paused = true;
        this.speech.cancel();
        const r = await Dialog.open({
            title: 'Pausa', speak: true,
            items: [
                { label: 'Seguir jugando', value: 'go' },
                ...(this.visual ? [] : [{ label: 'Teclas', value: 'keys' }, { label: 'Cómo va la partida', value: 'info' }]),
                { label: this.mode === 'host' ? 'Cerrar la sala y salir' : this.mode === 'client' ? 'Salir de la sala' : 'Salir al menú', value: 'menu' },
            ],
            cancel: 'go',
        });
        this.paused = false;
        if (r === 'keys') this.keysHelp();
        else if (r === 'info') this.info();
        else if (r === 'menu') this.app.leaveMatch();
        else if (!this.visual) this.speech.say('Seguimos.', { interrupt: true });
    }

    // ── Teclado ───────────────────────────────────────
    onKey(e) {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (k === 'Escape') { e.preventDefault(); if (!this.cancelPick()) this.pause(); return true; }
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
            if (this.game.phase === 'burn' && this.game.canBurn(this.me) && !this.passedBurn) {
                Board.focusFirst(this.me);
                this.speech.say('Elige la carta que quieres quemar: la tuya con su número, o la de otro con las flechas y Enter.', { interrupt: true });
            } else { this.audio.error(); this.explainCant('burn'); }
            return true;
        }
        const map = { r: 'draw', p: 'call', m: 'take', t: 'discard', n: 'pass' };
        if (map[k]) {
            e.preventDefault();
            if (!this.input(map[k])) { this.audio.error(); this.explainCant(map[k]); }
            return true;
        }
        if (k === 'i') { e.preventDefault(); this.info(); return true; }
        if (k === 'c') { e.preventDefault(); this.myCards(); return true; }
        if (k === 'h') { e.preventDefault(); this.keysHelp(); return true; }
        if (k === ' ') { e.preventDefault(); this.speech.say(this.speech.last || 'Nada que repetir.', { interrupt: true }); return true; }
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
        else if (kind === 'burn' || kind === 'pass') t = g.isFrozen?.(me) ? 'Has cantado Pedro: ya no quemas.' : 'Solo justo después de que caiga una carta en la mesa.';
        if (this.visual) { Board.status(t); return; }
        if (this.speech.history[this.speech.history.length - 1] !== t) this.speech.say(t, { interrupt: false });   // sin cortar lo que se está contando
    }
}
