/* =============================================
   EL PEDRO — match.js
   Una partida en la mesa: reparte, da el turno,
   mueve a los rivales de la máquina, abre la
   ventana para quemar, cuenta lo que pasa con voz
   y sonido y dibuja la mesa.
   ============================================= */
'use strict';

const POWER_TEXT = {
    10: 'Si la tiras, puedes cambiar dos cartas de sitio: tuyas o de los demás.',
    11: 'Si la tiras, puedes mirar una carta: tuya o de otro.',
    12: 'Si la tiras, puedes mirar una carta y después cambiar dos.',
};

class Match {
    constructor(app, { rivals, rules, seed = (Date.now() ^ 0x5eed) >>> 0, practice = false }) {
        this.app = app;
        this.settings = app.settings;
        this.speech = app.speech;
        this.audio = app.audio;
        this.rivals = rivals;
        this.practice = practice;
        this.me = 0;
        this.game = new PedroGame({ players: [{ name: 'tú' }, ...rivals.map(c => ({ name: c.name }))], rules, seed });
        this.names = ['tú', ...rivals.map(c => c.name)];
        this.v = new Voice(this.names, 0);
        this.bots = [null, ...rivals.map((c, i) => new Bot(this.game, i + 1, c, makeRng(seed + 101 * (i + 1))))];
        this.helper = new Memory(0, {});          // memoria perfecta: para la ayuda de memoria
        this.audio.setPlayers(this.game.n);
        this.stopped = false;
        this.paused = false;
        this.want = null;                          // lo que se espera del jugador
        this.burnReq = null;                       // pidió quemar ('burn') o pasar ('pass')
        this.shown = new Map();                    // cartas boca arriba un momento: 'p:s' → carta
        this.highlight = null;
        this.hintCount = {};
        this.turnsPlayed = 0;
        this.lastReveal = null;
        this.onEnd = null;
    }

    get timeScale() { return this.app.timeScale; }
    get speed() { return { lenta: 1.6, normal: 1, rapida: 0.55 }[this.settings.botSpeed] ?? 1; }
    get brief() { return this.settings.verbosity === 'breve'; }

    // ── Tiempo (se para con la pausa y con los diálogos) ──
    async sleep(ms) {
        let left = ms * this.timeScale;
        while (left > 0 && !this.stopped) {
            await new Promise(r => setTimeout(r, Math.min(50, left)));
            if (!this.paused && !Dialog.active) left -= 50;
        }
    }
    think(ms) { return this.sleep(ms * this.speed); }

    async gate() { while ((this.paused || Dialog.active) && !this.stopped) await new Promise(r => setTimeout(r, 50)); }

    /** Dice algo y espera a que termine. keep: se puede repetir con Espacio. */
    async say(text, { keep = false, pitch = 1, rate = 1, interrupt = false, force = false } = {}) {
        if (this.stopped || !text) return;
        if (this.justPeeked && !force) keep = false;   // hasta tu primera jugada, Espacio repite tus cartas
        await this.speech.say(text, { interrupt, keep, pitch, rate });
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
    }

    // ── Bucle principal ───────────────────────────────
    async run() {
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
            const p = this.actor();
            if (p === this.me) await this.humanStep(); else await this.botStep(p);
        }
    }

    actor() {
        const g = this.game;
        if (g.phase === 'power') return g.power.by;
        if (g.phase === 'give') return g.give.by;
        return g.current;
    }

    async intro() {
        const seats = this.rivals.map((c, i) => {
            const seat = SEAT_WORD[this.audio.seatOf(i + 1)];
            return `${c.name}, ${seat}`;
        });
        const goal = this.game.rules.winsToWin;
        const goalText = goal > 0 ? ` Gana quien consiga antes ${goal === 1 ? 'una ronda' : goal + ' rondas'}.` : '';
        let text = `Juegas contra ${Txt.list(seats)}.${goalText}`;
        if (this.practice) text = 'Partida de práctica: la ayuda de memoria está activada, así que el juego te recuerda las cartas que has visto. ' + text;
        await this.say(text, { keep: true });
    }

    /** Aplica el resultado de una acción: memorias, sonido, voz y dibujo. */
    async apply(res) {
        if (!res || this.stopped) return res;
        if (!res.ok) { this.audio.error(); await this.say(res.error, { interrupt: true }); return res; }
        for (const e of res.events) {
            for (const b of this.bots) b?.observe(e);
            this.helper.observe(e);
        }
        for (const e of res.events) {
            if (this.stopped) break;
            await this.present(e);
            Board.render(this);
        }
        Board.render(this);
        return res;
    }

    act(a) { return this.apply(this.game.act(a)); }

    // ── Lo que pasa, contado ──────────────────────────
    cardAt(p, s) { return this.game.card(p, s); }

    flash(p, s, card, ms = 3500) {
        const k = p + ':' + s;
        this.shown.set(k, card);
        Board.render(this);
        setTimeout(() => { if (this.shown.get(k) === card) { this.shown.delete(k); Board.render(this); } }, ms * Math.max(0.3, this.timeScale));
    }

    async present(e) {
        const g = this.game, me = this.me, v = this.v, A = this.audio;
        const pan = p => A.panOf(p);
        switch (e.t) {
            case 'round': {
                this.shown.clear();
                this.justPeeked = false;
                A.shuffle();
                await this.sleep(950);
                A.deal(g.n, g.rules.handSize);
                const dealer = e.dealer === me ? 'Repartes tú' : `Reparte ${g.players[e.dealer].name}`;
                A.card(e.top, 0, 0.4 + g.n * g.rules.handSize * 0.09);
                await this.say(`Ronda ${e.round}. ${dealer}. En la mesa, ${Txt.card(e.top)}.`, { keep: true });
                break;
            }
            case 'turn': {
                if (e.p === me) {
                    A.yourTurn();
                    this.turnsPlayed++;
                    const last = e.last ? ' Es tu última jugada: alguien ha cantado Pedro.' : '';
                    const top = g.top ? ` En la mesa, ${Txt.card(g.top)}.` : '';
                    const hint = this.hint('turn', g.caller === null
                        ? 'Pulsa R para robar del mazo, o P para cantar Pedro si crees que tienes la suma más baja.'
                        : 'Pulsa R para robar.');
                    this.say(`Tu turno.${last}${top}${hint}`, { keep: true });   // sin esperar: puedes jugar mientras habla
                } else {
                    A.otherTurn(e.p);
                    const last = e.last ? 'Última vuelta. ' : '';
                    await this.say(this.brief ? `${last}${cap(v.name(e.p))}.` : `${last}Turno de ${v.name(e.p)}.`);
                }
                break;
            }
            case 'draw': {
                if (e.p === me) {
                    this.justPeeked = false;
                    A.flick(0);
                    A.card(e.card, 0, 0.12);
                    if (e.from === 'table') {
                        this.say(`Coges de la mesa ${Txt.card(e.card)}. Elige por cuál de tus cartas la cambias, con los números.`, { keep: true });
                    } else {
                        const pw = g.rules.powers && POWER_TEXT[e.card.rank] ? ' ' + POWER_TEXT[e.card.rank] : '';
                        const hint = this.hint('drawn', 'Pulsa el número de una de tus cartas para cambiarla por esta, o T para tirarla a la mesa.');
                        this.say(`Has robado ${Txt.card(e.card)}.${pw}${hint}`, { keep: true });
                    }
                } else {
                    A.flick(pan(e.p));
                    if (e.from === 'table') { A.card(e.card, pan(e.p)); await this.say(`${v.Name(e.p)} coge de la mesa ${Txt.card(e.card)}.`); }
                    // El sonido ya dice que roba; la frase siguiente cuenta qué hace con la carta.
                }
                break;
            }
            case 'swap': {
                A.place(0);
                A.card(e.card, 0, 0.1);
                if (e.p === me) await this.say(`Te la quedas en tu sitio ${e.slot + 1} y tiras ${Txt.card(e.card)}.`, { keep: true });
                else await this.say(this.brief
                    ? `Cambia su ${e.slot + 1}. Tira ${Txt.card(e.card)}.`
                    : `${v.Name(e.p)} se la queda en su carta ${e.slot + 1} y tira ${Txt.card(e.card)}.`, { keep: true });
                break;
            }
            case 'discard': {
                A.place(0);
                A.card(e.card, 0, 0.1);
                if (e.p === me) await this.say(`Tiras ${Txt.card(e.card)}.`);
                else await this.say(`${v.Name(e.p)} la tira: ${Txt.card(e.card)}.`, { keep: true });
                break;
            }
            case 'power': {
                if (e.p !== me) break;
                // El jugador elige en humanStep.
                break;
            }
            case 'peekDone': {
                if (e.p !== me) break;
                const peeks = this._startPeeks || [];
                this._startPeeks = [];
                peeks.forEach((x, i) => { A.card(x.card, A.slotPan(x.target.s, g.players[me].slots.length), i * 0.6); this.flash(me, x.target.s, x.card, 6000); });
                const text = peeks.map(x => `Tu carta ${x.target.s + 1}: ${Txt.card(x.card)}`).join('. ') + '.';
                this.justPeeked = true;
                await this.say(`${text} ¡Recuérdalas! Pulsa Espacio para oírlas otra vez.`, { keep: true, interrupt: true, force: true });
                await this.sleep(500);
                break;
            }
            case 'peek': {
                if (e.start) { if (e.by === me) (this._startPeeks ||= []).push(e); break; }
                const t = e.target;
                A.peek(t.p === me ? A.slotPan(t.s, g.players[me].slots.length) : pan(t.p));
                if (e.by === me) {
                    A.card(e.card, t.p === me ? 0 : pan(t.p), 0.2);
                    this.flash(t.p, t.s, e.card);
                    await this.say(`Miras ${v.slot(t.p, t.s, me)}: ${Txt.card(e.card)}.`, { keep: true });
                } else {
                    await this.say(`${v.Name(e.by)} mira ${v.slot(t.p, t.s, e.by)}.`, { keep: true });
                }
                break;
            }
            case 'swapCards': {
                const pa = e.a.p === me ? A.slotPan(e.a.s, g.players[me].slots.length) : pan(e.a.p);
                const pb = e.b.p === me ? A.slotPan(e.b.s, g.players[me].slots.length) : pan(e.b.p);
                A.swap(pa, pb);
                this.highlight = [e.a, e.b];
                setTimeout(() => { this.highlight = null; Board.render(this); }, 2500 * Math.max(0.3, this.timeScale));
                const who = e.by === me ? 'Cambias' : `${v.Name(e.by)} cambia`;
                await this.say(`${who} ${v.slot(e.a.p, e.a.s, e.by)} por ${v.slot(e.b.p, e.b.s, e.by)}.`, { keep: true });
                break;
            }
            case 'pass': {
                A.pass();
                const what = e.step === 'look' ? 'no mira ninguna carta' : 'no cambia ninguna carta';
                if (e.p === me) await this.say(e.step === 'look' ? 'No miras ninguna carta.' : 'No cambias ninguna carta.');
                else await this.say(`${v.Name(e.p)} ${what}.`);
                break;
            }
            case 'burnOpen': A.burnOpen(); break;
            case 'burn': {
                const t = e.target;
                A.burnOk(t.p === me ? 0 : pan(t.p));
                A.card(e.card, 0, 0.3);
                if (e.by === me) await this.say(`¡Bien! Quemas ${v.slot(t.p, t.s, me)}: ${Txt.card(e.card, { value: false })}.`, { keep: true });
                else {
                    await this.say(`¡${v.Name(e.by)} quema ${v.slot(t.p, t.s, e.by)}! Era ${Txt.card(e.card, { value: false })}.`, { keep: true });
                    if (t.p !== me && t.p !== e.by) await this.quip(t.p, 'burned', 0.5);
                }
                break;
            }
            case 'giveAsk': break;
            case 'give': {
                const pf = e.by === me ? A.slotPan(e.from, g.players[me].slots.length) : pan(e.by);
                const pt = e.to.p === me ? A.slotPan(e.to.s, g.players[me].slots.length) : pan(e.to.p);
                A.swap(pf, pt);
                if (e.by === me) await this.say(`Le das tu carta ${e.from + 1} a ${v.name(e.to.p)}.`);
                else if (e.to.p === me) await this.say(`${v.Name(e.by)} te da su carta ${e.from + 1}. Ahora es tu carta ${e.to.s + 1}, y no sabes cuál es.`, { keep: true });
                else await this.say(`${v.Name(e.by)} le da su carta ${e.from + 1} a ${v.name(e.to.p)}.`);
                break;
            }
            case 'burnFail': {
                const t = e.target;
                A.burnFail(e.by === me ? 0 : pan(e.by));
                A.card(e.card, t.p === me ? 0 : pan(t.p), 0.4);
                this.flash(t.p, t.s, e.card, 2500);
                if (e.by === me) await this.say(`¡Fallas! ${cap(v.slot(t.p, t.s, me))} era ${Txt.card(e.card, { value: false })}.`, { keep: true });
                else {
                    await this.say(`${v.Name(e.by)} intenta quemar ${v.slot(t.p, t.s, e.by)} y falla: era ${Txt.card(e.card, { value: false })}.`, { keep: true });
                    await this.quip(e.by, 'burnFail', 0.6);
                }
                break;
            }
            case 'penalty': {
                A.penalty(e.p === me ? 0 : pan(e.p));
                const n = e.slots.length;
                if (e.p === me) await this.say(`Te llevas ${n === 1 ? 'una carta' : n + ' cartas'} de castigo, sin mirarla, en tu sitio ${Txt.list(e.slots.map(s => s + 1))}.`, { keep: true });
                else await this.say(`${v.Name(e.p)} se lleva ${n === 1 ? 'una carta' : n + ' cartas'} de castigo.`);
                break;
            }
            case 'burnClose': break;
            case 'call': {
                A.call(e.p === me ? 0 : pan(e.p));
                this.justPeeked = false;
                if (e.p === me) await this.say('¡Pedro! Has cantado Pedro. Los demás juegan una última vuelta y después se descubren las cartas. Nadie puede tocar tus cartas.', { keep: true });
                else {
                    await this.quip(e.p, 'call', 1);
                    await this.say(`${v.Name(e.p)} canta Pedro. Última vuelta: cada uno juega una vez más. Sus cartas ya no se pueden tocar.`, { keep: true });
                }
                break;
            }
            case 'reshuffle': A.shuffle(); await this.say('Se ha acabado el mazo: se barajan las cartas de la mesa.'); break;
            case 'reveal': await this.presentReveal(e); break;
            case 'gameOver': break;
        }
    }

    async quip(p, kind, chance) {
        if (!this.settings.quips || p === this.me) return;
        const b = this.bots[p];
        if (!b || !b.rng.chance(chance)) return;
        const q = b.quip(kind);
        if (q) await this.say(q, { pitch: b.char.pitch, rate: b.char.rate });
    }

    async presentReveal(e) {
        const g = this.game, me = this.me, v = this.v, A = this.audio;
        this.lastReveal = e;
        Board.render(this);
        A.shuffle();
        const why = e.reason === 'call' ? 'Se descubren las cartas.' : 'No quedan cartas: se descubren todas.';
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
                const total = allEq ? 'Todas del mismo número: 1 punto.' : `${p === me ? 'Suman' : 'Suman'} ${Txt.points(e.scores[p])}.`;
                text = `${v.Name(p)}: ${list}. ${total}`;
            }
            await this.say(text);
        }
        const w = e.winners;
        const best = e.scores[w[0]];
        let res;
        if (w.length === 1) res = w[0] === me ? `¡Ganas la ronda con ${Txt.points(best)}!` : `Gana la ronda ${v.name(w[0])}, con ${Txt.points(best)}.`;
        else {
            const names = w.map(p => v.name(p));
            res = `Empate a ${Txt.points(best)} entre ${Txt.list(names)}. ${w.includes(me) ? 'Ganáis' : 'Ganan'} la ronda.`;
        }
        if (e.caller !== null && !w.includes(e.caller)) res += e.caller === me ? ' Cantaste Pedro, pero alguien tenía menos.' : ` ${v.Name(e.caller)} cantó Pedro, pero no tenía la suma más baja.`;
        if (w.includes(me)) A.win(); else A.lose();
        const wins = 'Rondas ganadas: ' + Txt.list(order.map(p => `${v.name(p)} ${e.wins[p]}`)) + '.';
        this.app.recordRound(e.scores[me], w.includes(me));
        await this.say(`${res} ${wins}`, { keep: true });
        if (w.includes(me) && w.length === 1) await this.sleep(300);
        else await this.quip(w.find(p => p !== me), 'win', 0.7);
    }

    async afterRound() {
        if (this.stopped) return false;
        const r = await Dialog.open({
            title: `Fin de la ronda ${this.game.round}`,
            text: this.speech.last,
            speak: `Fin de la ronda ${this.game.round}.`,
            items: [
                { label: 'Siguiente ronda', value: 'next' },
                { label: 'Repetir el resultado', value: 'repeat', key: 'r' },
                { label: 'Salir al menú', value: 'menu' },
            ],
            cancel: 'menu',
        });
        if (r === 'repeat') { await this.say(this.speech.last, { interrupt: true }); return this.afterRound(); }
        this.lastReveal = null;
        if (r === 'next') return true;
        this.app.leaveMatch();
        return false;
    }

    async afterGame() {
        const g = this.game, me = this.me;
        const won = g.winners.includes(me);
        if (won) this.audio.win(); else this.audio.lose();
        this.app.recordGame(won);
        const who = won ? (g.winners.length > 1 ? '¡Has ganado la partida, empatado con ' + Txt.list(g.winners.filter(p => p !== me).map(p => this.v.name(p))) + '!' : '¡Has ganado la partida!')
            : `Gana la partida ${Txt.list(g.winners.map(p => this.v.name(p)))}.`;
        await this.say(who, { keep: true });
        const r = await Dialog.open({
            title: 'Fin de la partida',
            text: who,
            speak: 'Fin de la partida.',
            items: [
                { label: 'Jugar otra vez con los mismos rivales', value: 'again' },
                { label: 'Salir al menú', value: 'menu' },
            ],
            cancel: 'menu',
        });
        if (this.stopped) return;
        if (r === 'again') this.app.startMatch({ rivals: this.rivals, practice: this.practice });
        else this.app.leaveMatch();
    }

    // ── Mirar al empezar ──────────────────────────────
    async peekPhase() {
        const g = this.game, me = this.me, k = Math.min(g.rules.peekStart, g.rules.handSize);
        for (const b of this.bots) if (b && g.peekPending.has(b.me)) await this.apply(g.act({ type: 'peekStart', p: b.me, slots: b.choosePeekStart(k) }));
        if (!g.peekPending.has(me)) return;
        const slots = [];
        this.say(`Mira ${k === 1 ? 'una de tus cartas' : ({ 2: 'dos', 3: 'tres' }[k] || k) + ' de tus cartas'}. Elige ${k === 1 ? 'cuál' : 'la primera'} con las teclas del 1 al ${g.players[me].slots.length}, o tocándola.`, { keep: true, interrupt: true });
        while (slots.length < k && !this.stopped) {
            const a = await this.wait(['slot']);
            if (!a) return;
            if (!g.card(me, a.slot)) { this.audio.error(); await this.say(`No tienes carta ${a.slot + 1}.`, { interrupt: true }); continue; }
            if (slots.includes(a.slot)) { this.audio.error(); await this.say('Esa ya la has elegido.', { interrupt: true }); continue; }
            slots.push(a.slot);
            this.audio.slot(a.slot, g.players[me].slots.length);
            this.highlight = slots.map(s => ({ p: me, s }));
            Board.render(this);
            if (slots.length < k) this.say(`Carta ${a.slot + 1}. Ahora elige otra.`, { interrupt: true });
        }
        this.highlight = null;
        this.speech.cancel();
        await this.act({ type: 'peekStart', p: me, slots });
    }

    // ── El jugador ────────────────────────────────────

    /** Espera una entrada del jugador. kinds: lo que vale ahora (slot, draw, call, take, discard). */
    wait(kinds) {
        return new Promise(resolve => { this.want = { kinds: new Set(kinds), resolve }; Board.render(this); });
    }

    /** Llega una entrada (tecla o botón). Devuelve true si se ha usado. */
    input(kind, arg = null) {
        if (this.stopped) return false;
        if (this.game.phase === 'burn' && (kind === 'burn' || kind === 'pass')) {
            if (kind === 'burn' && !this.game.canBurn(this.me)) {
                this.audio.error();
                this.say(this.game.isProtected(this.me) ? 'Has cantado Pedro: no puedes quemar.' : 'Ahora no puedes quemar.', { interrupt: true });
                return true;
            }
            this.burnReq = kind;
            return true;
        }
        const w = this.want;
        if (!w || !w.kinds.has(kind)) return false;
        this.want = null;
        if (kind !== 'slot' || this.game.phase !== 'peek') this.speech.cancel();   // corta lo que se estaba diciendo
        w.resolve({ kind, ...(arg || {}) });
        Board.render(this);
        return true;
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
                        text: 'Si cantas, ya no robas: los demás juegan una vez más y se descubren las cartas. Gana la suma más baja.',
                        items: [{ label: 'Sí, ¡Pedro!', value: true, key: 'p' }, { label: 'No, seguir jugando', value: false }],
                        cancel: false,
                    });
                    if (ok) await this.act({ type: 'call', p: me });
                    else await this.say('Vale. Pulsa R para robar.', { interrupt: true });
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
                if (!g.card(me, a.slot)) { this.audio.error(); await this.say(`En el sitio ${a.slot + 1} no tienes carta.`, { interrupt: true }); return; }
                await this.act({ type: 'swap', p: me, slot: a.slot });
                return;
            }
            case 'power': return this.humanPower();
            case 'give': {
                const to = g.give.to;
                const slot = await this.pickOwn(`¿Qué carta le das a ${this.v.name(to.p)}?`, 'Ocupará el sitio de la carta que has quemado.', false);
                await this.act({ type: 'give', p: me, slot: slot ?? g.slotsOf(me)[0] });
                return;
            }
        }
    }

    async humanPower() {
        const g = this.game, me = this.me, step = g.power.step, rank = g.power.rank;
        if (step === 'look') {
            const t = await this.pickCard({
                title: rank === 12 ? 'Poder del rey: primero, mirar' : 'Poder del caballo: mirar una carta',
                text: '¿De quién es la carta que quieres mirar?',
                kind: 'look', none: 'No mirar ninguna',
            });
            if (!t) await this.act({ type: 'pass', p: me });
            else await this.act({ type: 'peek', p: me, target: t });
            return;
        }
        const title = rank === 12 ? 'Poder del rey: ahora, cambiar' : 'Poder de la sota: cambiar dos cartas';
        const a = await this.pickCard({ title, text: 'Elige la primera carta del cambio. ¿De quién es?', kind: 'swap', none: 'No cambiar nada' });
        if (!a) { await this.act({ type: 'pass', p: me }); return; }
        const b = await this.pickCard({ title, text: `Has elegido ${this.v.slot(a.p, a.s, me)}. ¿Por cuál la cambias? Tiene que ser de otro jugador.`, kind: 'swap', none: 'No cambiar nada', exclude: a.p });
        if (!b) { await this.act({ type: 'pass', p: me }); return; }
        await this.act({ type: 'swapCards', p: me, a, b });
    }

    /** Elige una carta tuya. Devuelve el sitio o null. */
    async pickOwn(title, text, cancellable = true) {
        const g = this.game, me = this.me;
        const items = g.slotsOf(me).map(s => ({ label: this.ownLabel(s), value: s, key: String(s + 1) }));
        if (cancellable) items.push({ label: 'Cancelar', value: null });
        return Dialog.open({ title, text, items, cancel: cancellable ? null : undefined });
    }

    ownLabel(s) {
        const known = this.settings.memoryHelp || this.practice ? this.helper.get(this.me, s) : null;
        return `Tu carta ${s + 1}${known ? ': ' + Txt.cardShort(known) : ''}`;
    }

    /** Elige una carta de cualquiera, en dos pasos: de quién y cuál. */
    async pickCard({ title, text, kind, none, exclude = null, burn = false }) {
        const g = this.game, me = this.me;
        const targets = g.targets(kind, me).filter(t => t.p !== exclude);
        const players = [...new Set(targets.map(t => t.p))];
        for (;;) {
            const items = [];
            if (players.includes(me)) {
                for (const s of targets.filter(t => t.p === me).map(t => t.s)) items.push({ label: this.ownLabel(s), value: { p: me, s }, key: String(s + 1) });
            }
            for (const p of players.filter(p => p !== me)) {
                const n = g.countOf(p);
                items.push({ label: `Una carta de ${this.names[p]}, que tiene ${n === 1 ? '1 carta' : n + ' cartas'}`, value: { p } });
            }
            items.push({ label: none, value: null });
            const r = await Dialog.open({ title, text, items, cancel: null });
            if (!r || this.stopped) return null;
            if (r.s != null) return r;
            const slots = targets.filter(t => t.p === r.p).map(t => t.s);
            const items2 = slots.map(s => ({ label: `Carta ${s + 1} de ${this.names[r.p]}`, value: { p: r.p, s }, key: String(s + 1) }));
            items2.push({ label: 'Volver', value: 'back' });
            const r2 = await Dialog.open({ title: `Cartas de ${this.names[r.p]}`, text: burn ? '¿Cuál es igual a la de la mesa?' : '¿Cuál?', items: items2, cancel: 'back' });
            if (this.stopped) return null;
            if (r2 && r2 !== 'back') return r2;
        }
    }

    // ── Rivales ───────────────────────────────────────
    async botStep(p) {
        const g = this.game, b = this.bots[p];
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
        const W = (this.settings.burnWindow || 0) * 1000;   // 0: hasta que pases
        let elapsed = 0, deadline = W, lastTick = 0;
        let passed = false;
        this.burnReq = null;
        const plan = () => {
            const value = g.burnWin?.value;
            return this.bots.filter(Boolean).map(b => {
                const d = b.chooseBurn(value);
                return d ? { b, at: elapsed + d.delay * this.speed, target: d.target } : null;
            }).filter(Boolean).sort((x, y) => x.at - y.at);
        };
        let schedule = plan();
        if (g.canBurn(me)) {
            const hint = this.hint('burn', `Si tienes una carta igual a la de la mesa, ${RANK_NAME[g.burnWin.value]}, pulsa Q para quemarla. Para seguir, pulsa N.`);
            if (hint) await this.say(hint.trim());
        }
        Board.render(this);
        while (g.phase === 'burn' && !this.stopped) {
            await this.gate();
            // ¿El jugador quiere quemar?
            if (this.burnReq === 'burn') {
                this.burnReq = null;
                const t = await this.pickBurn();
                if (t) {
                    const r = await this.act({ type: 'burn', p: me, target: t });
                    if (g.phase === 'give') await this.humanStep();
                    if (r.ok) { schedule = plan(); deadline = elapsed + Math.max(W, 1500); }
                }
                continue;
            }
            if (this.burnReq === 'pass') { this.burnReq = null; passed = true; Board.render(this); }
            const humanCan = g.canBurn(me) && !passed;
            // Le toca a un rival que ha visto una carta igual.
            if (schedule.length && schedule[0].at <= elapsed && (W === 0 || schedule[0].at <= deadline)) {
                const { b } = schedule.shift();
                const d = b.chooseBurn(g.burnWin.value);   // vuelve a pensarlo: algo pudo cambiar
                if (d) {
                    const r = await this.act({ type: 'burn', p: b.me, target: d.target });
                    if (g.phase === 'give') await this.botStep(b.me);
                    if (r.ok) { schedule = plan(); deadline = elapsed + Math.max(W, 1500); }
                }
                continue;
            }
            const botsPending = schedule.some(x => W === 0 || x.at <= deadline);
            if (!humanCan && !botsPending) break;
            if (W > 0 && elapsed >= deadline) break;
            await this.sleep(50);
            elapsed += 50;
            if (humanCan && W > 0 && this.settings.burnTicks && elapsed - lastTick >= 1000) { lastTick = elapsed; this.audio.tick(deadline - elapsed <= 1000); }
        }
        this.burnReq = null;
        if (g.phase === 'burn') await this.apply(g.act({ type: 'endBurn' }));
    }

    async pickBurn() {
        const g = this.game, top = g.top;
        const text = `En la mesa, ${Txt.cardShort(top)}. ¿Qué carta es igual?`;
        return this.pickCard({ title: 'Quemar', text, kind: 'burn', none: 'Cancelar', burn: true });
    }

    // ── Información a petición ────────────────────────
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

    describeSlot(s) {
        const g = this.game, me = this.me;
        this.audio.slot(s, g.players[me].slots.length);
        if (!g.card(me, s)) { this.speech.say(`En el sitio ${s + 1} no tienes carta.`, { interrupt: true }); return; }
        this.speech.say(this.ownLabel(s) + '.', { interrupt: true });
    }

    keysHelp() {
        const g = this.game;
        const t = [
            'R: robar del mazo.', 'P: cantar Pedro, antes de robar.',
            g.rules.takeFromTable ? 'M: coger la carta de la mesa.' : '',
            'Del 1 al 4: tus cartas. Con una carta robada, la cambias por esa.', 'T: tirar la carta robada.',
            'Q: quemar una carta igual a la de la mesa. N: seguir sin quemar.',
            'I: cómo va la partida. C: tus cartas. Espacio: repetir lo último. Escape: pausa.',
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
                { label: 'Teclas', value: 'keys' },
                { label: 'Cómo va la partida', value: 'info' },
                { label: 'Salir al menú', value: 'menu' },
            ],
            cancel: 'go',
        });
        this.paused = false;
        if (r === 'keys') this.keysHelp();
        else if (r === 'info') this.info();
        else if (r === 'menu') this.app.leaveMatch();
        else this.speech.say('Seguimos.', { interrupt: true });
    }

    // ── Teclado ───────────────────────────────────────
    onKey(e) {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (k === 'Escape') { e.preventDefault(); this.pause(); return true; }
        if (/^[1-9]$/.test(k)) {
            e.preventDefault();
            const s = +k - 1;
            if (!this.input('slot', { slot: s })) this.describeSlot(s);
            return true;
        }
        const map = { r: 'draw', p: 'call', m: 'take', t: 'discard', q: 'burn', n: 'pass' };
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
        else if (kind === 'burn' || kind === 'pass') t = 'Solo justo después de que caiga una carta en la mesa.';
        if (this.speech.history[this.speech.history.length - 1] !== t) this.speech.say(t, { interrupt: false });   // sin cortar lo que se está contando
    }
}

// ═══════════════════════════════════════════════════════
// Board: dibuja la mesa (para quien ve) y los botones.
// ═══════════════════════════════════════════════════════

const Board = {
    match: null,

    build(match) {
        this.match = match;
        const n = match.game.n;
        for (const seat of ['top', 'left', 'right']) { $('seat-' + seat).innerHTML = ''; $('seat-' + seat).hidden = true; }
        for (let p = 1; p < n; p++) {
            const seat = match.audio.seatOf(p);
            const el = $('seat-' + seat);
            el.hidden = false;
            el.innerHTML = `<div class="seat-name"><span class="nm"></span> <span class="wins"></span></div><div class="hand rival" aria-hidden="true"></div>`;
            el.querySelector('.nm').textContent = cap(match.names[p]);
        }
        document.body.dataset.players = n;
        this.render(match);
    },

    cardEl(card, { back = false, small = false, label = null, empty = false } = {}) {
        const d = document.createElement('div');
        d.className = 'card' + (back ? ' back' : '') + (small ? ' small' : '') + (empty ? ' empty' : '');
        if (empty) return d;
        if (back || !card) {
            if (label) { const l = document.createElement('span'); l.className = 'memo'; l.textContent = label; d.appendChild(l); }
            return d;
        }
        d.classList.add('face', 's-' + card.suit);
        d.innerHTML = `<span class="rank">${card.rank}</span><svg class="suit" aria-hidden="true"><use href="#suit-${card.suit}"/></svg><span class="rname">${RANK_NAME[card.rank]}</span>`;
        return d;
    },

    render(match = this.match) {
        if (!match || match !== this.match) return;
        const g = match.game, me = match.me, reveal = match.lastReveal;
        const hl = k => match.highlight?.some(t => t.p + ':' + t.s === k);
        const faceFor = (p, s) => {
            if (reveal) { const h = reveal.hands[p].find(x => x.s === s); if (h) return h.card; }
            return match.shown.get(p + ':' + s) || null;
        };
        // Rivales
        for (let p = 1; p < g.n; p++) {
            const el = $('seat-' + match.audio.seatOf(p));
            if (!el) continue;
            el.classList.toggle('active', (g.phase === 'turn' || g.phase === 'drawn' || g.phase === 'power') && match.actor() === p);
            el.classList.toggle('caller', g.caller === p);
            el.querySelector('.wins').textContent = '★'.repeat(g.players[p].wins);
            const hand = el.querySelector('.hand');
            hand.innerHTML = '';
            g.players[p].slots.forEach((c, s) => {
                const face = c && faceFor(p, s);
                const ce = this.cardEl(face, { back: !face, small: true, empty: !c });
                if (hl(p + ':' + s)) ce.classList.add('hl');
                hand.appendChild(ce);
            });
        }
        // Centro
        $('deck-count').textContent = g.deck.length;
        const disc = $('discard');
        disc.innerHTML = '';
        disc.appendChild(g.top ? this.cardEl(g.top) : this.cardEl(null, { empty: true }));
        disc.classList.toggle('burnable', g.phase === 'burn');
        const drawn = $('drawn-area');
        drawn.innerHTML = '';
        if (g.drawn && g.phase === 'drawn') {
            const mine = g.current === me;
            const ce = this.cardEl(mine || g.drawnFrom === 'table' ? g.drawn : null, { back: !(mine || g.drawnFrom === 'table') });
            drawn.appendChild(ce);
            const cap2 = document.createElement('span'); cap2.className = 'drawn-cap';
            cap2.textContent = mine ? 'Tu carta robada' : `Robada por ${match.names[g.current]}`;
            drawn.appendChild(cap2);
        }
        // Tu mano (se reutilizan los botones para no perder el foco)
        const help = match.settings.memoryHelp || match.practice;
        const hand = $('my-hand');
        const want = match.want?.kinds;
        const slots = g.players[me].slots;
        while (hand.children.length > slots.length) hand.lastChild.remove();
        slots.forEach((c, s) => {
            let b = hand.children[s];
            if (!b) {
                b = document.createElement('button');
                b.className = 'slot nav';
                b.dataset.slot = s;
                b.addEventListener('click', () => { const m = this.match; if (m && !m.input('slot', { slot: s })) m.describeSlot(s); });
                hand.appendChild(b);
            }
            const face = c && faceFor(me, s);
            const known = help && c ? match.helper.get(me, s) : null;
            const ce = this.cardEl(face, { back: !face, empty: !c, label: known ? `${known.rank} ${known.suit}` : null });
            if (hl(me + ':' + s)) ce.classList.add('hl');
            const num = document.createElement('span'); num.className = 'slot-num'; num.textContent = s + 1;
            b.replaceChildren(ce, num);
            let label = c ? match.ownLabel(s) : `Sitio ${s + 1}, sin carta`;
            if (want?.has('slot') && c) label += g.phase === 'drawn' ? '. Cambiar por la robada' : '. Elegir';
            b.setAttribute('aria-label', label);
            b.disabled = !c;
        });
        $('seat-me').classList.toggle('active', match.actor() === me && ['turn', 'drawn', 'power', 'give'].includes(g.phase));
        $('seat-me').classList.toggle('caller', g.caller === me);
        $('my-wins').textContent = '★'.repeat(g.players[me].wins);
        // Botones
        const can = k => !!want?.has(k);
        const show = (id, on) => { const el = $(id); if (el) el.hidden = !on; };
        show('act-draw', can('draw'));
        show('act-call', can('call'));
        show('act-take', can('take'));
        show('act-discard', can('discard'));
        const burnOpen = g.phase === 'burn' && g.canBurn(me);
        show('act-burn', burnOpen);
        show('act-pass', burnOpen);
        // Si el botón enfocado ha desaparecido, el foco pasa al siguiente que tenga sentido (sin leerlo).
        const f = document.activeElement;
        if (UI.current === 'game' && !Dialog.active && (!f || f === document.body || f.hidden || f.disabled || !document.contains(f))) {
            const next = [...document.querySelectorAll('#actions .act.main')].find(x => !x.hidden) || $('my-hand');
            UI.focus(next, { silent: true });
        }
    },
};
