/* =============================================
   EL PEDRO — match.js
   Lo que comparten todos los juegos del salón:
   una partida en la mesa con turnos, rivales de la
   máquina, voz, pausa, fin de ronda y de partida,
   y el juego en una sala: como anfitrión (la baraja
   está aquí) o como invitado (el anfitrión manda lo
   que pasa).

   Cada juego es una clase hija (PedroMatch,
   BriscaMatch) que dice cómo se cuenta y se dibuja
   lo que pasa y qué puede hacer el jugador.
   ============================================= */
'use strict';

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
        this.seed = seed;
        this.game = mode === 'client' ? this.makeMirror(rules) : this.makeGame(rules, seed);
        this.bots = this.seats.map((s, i) => s.kind === 'bot' && mode !== 'client' ? this.makeBot(i, s.char, makeRng(seed + 101 * (i + 1))) : null);
        this.audio.setPlayers(this.game.n, me);
        this.inbox = [];                           // anfitrión: lo que mandan los demás jugadores
        this._wake = null;
        this.seq = 0;                              // número del último paquete enviado o recibido
        this.sentFor = -1;                         // invitado: ya ha respondido a este paquete
        this.prompting = false;
        this.stopped = false;
        this.paused = false;
        this.want = null;                          // lo que se espera del jugador (teclas o botones)
        this.hintCount = {};
        this.gid = 0;                              // número de partida en la sala (para no mezclar con la anterior)
        this.setup();
    }

    // ── Lo que cada juego tiene que decir ─────────────
    static get kind() { return 'base'; }
    get kind() { return this.constructor.kind; }
    get title() { return GAMES[this.kind]?.name || ''; }
    /** 'ronda' en el Pedro, 'mano' en la Brisca. */
    get roundWord() { return 'ronda'; }
    /** Lo que dura cada momento sin voz (modo visual), en milisegundos. */
    get beats() { return {}; }
    setup() { }
    makeGame() { throw new Error('makeGame'); }
    makeMirror() { throw new Error('makeMirror'); }
    makeBot() { return null; }
    actor() { return this.game.current; }
    /** Las fases en las que alguien tiene que hacer algo (no son el fin de ronda). */
    get playPhases() { return ['turn']; }
    /** Lo que se ve de un suceso desde el sitio seat (en una sala). */
    eventFor(e) { return e; }
    /** Cambia cuando alguien juega: sirve para saber si el que se esperaba ya ha jugado. */
    stateKey() { const g = this.game; return `${g.phase}|${g.round}|${g.turns}`; }
    buildCenter() { }
    render() { }
    async present() { }
    async humanStep() { }
    async botStep() { }
    /** Botones de la mesa: [{ kind, label, key, cls }]. Cada tecla tiene su botón. */
    actionsDef() { return []; }
    resultText() { return this.speech.last; }
    recordRound() { }
    info() { }
    myCards() { }
    keysHelp() { }
    gameKey() { return false; }

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
    beat(t) { const ms = this.beats[t]; return this.visual && ms ? this.sleep(ms * this.speed) : Promise.resolve(); }

    async gate() { while ((this.paused || Dialog.active) && !this.stopped) await new Promise(r => setTimeout(r, 50)); }

    /** Dice algo y espera a que termine. keep: se puede repetir con Espacio. */
    async say(text, { keep = false, pitch = 1, rate = 1, interrupt = false } = {}) {
        if (this.stopped || !text) return;
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

    /** Un aviso corto sin cortar lo que se está contando. */
    notice(text) {
        if (this.visual) { Board.status(text); return; }
        if (this.speech.history[this.speech.history.length - 1] !== text) this.speech.say(text, { interrupt: false });
    }

    stop() {
        this.stopped = true;
        this.speech.cancel();
        if (this.want) { const w = this.want; this.want = null; w.resolve(null); }
        this.onStop?.();
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
            if (await this.preStep()) continue;
            if (g.phase === 'idle') { await this.apply(g.startRound()); continue; }
            if (g.phase === 'roundOver') {
                const go = await this.afterRound();
                if (!go || this.stopped) break;
                await this.apply(g.startRound());
                continue;
            }
            if (g.phase === 'gameOver') { await this.afterGame(); break; }
            if (await this.phaseStep(g.phase)) continue;
            await this.stepFor(this.actor());
        }
    }

    /** Algo que se atiende antes del turno (en el Pedro, las quemas). Devuelve true si ha hecho algo. */
    async preStep() { return false; }
    /** Una fase especial (en el Pedro, mirar al empezar). Devuelve true si la ha atendido. */
    async phaseStep() { return false; }

    /** Hace jugar a quien le toque (tú, otro jugador de la sala o la máquina). */
    stepFor(p) {
        if (p === this.me) return this.humanStep();
        if (this.seats[p].kind === 'remote') return this.remoteStep(p);
        return this.botStep(p);
    }

    introText() {
        const seats = this.seats.map((s, p) => {
            if (p === this.me) return null;
            const bot = this.mode !== 'local' && s.kind === 'bot' ? ', de la máquina' : '';
            return `${s.name}${bot}, ${SEAT_WORD[this.audio.seatOf(p)]}`;
        }).filter(Boolean);
        return `Juegas contra ${Txt.list(seats)}.`;
    }

    async intro() {
        if (this.rejoin) {
            Board.status('Has vuelto a la partida');
            await this.say(`Has vuelto a tu sitio en la partida de ${this.title}. Mientras no estabas, jugaba la máquina por ti.`, { keep: true });
            return;
        }
        Board.status(this.visual ? `${this.title}: juegas contra ${Txt.list(this.seats.filter((_, p) => p !== this.me).map(s => s.name))}` : '');
        await this.say(`${this.title}. ${this.introText()}`, { keep: true });
    }

    /** Aplica el resultado de una acción: memorias, sonido, voz, animaciones y dibujo. */
    async apply(res) {
        if (!res || this.stopped) return res;
        if (!res.ok) { this.audio.error(); this.prompt(res.error, null, { interrupt: true }); return res; }
        for (const e of res.events) {
            for (const b of this.bots) b?.observe(e);
            this.observe(e);
        }
        if (this.mode === 'host' && res.events.length) this.seq = this.online.broadcast(this, res.events);
        for (const e of res.events) {
            if (this.stopped) break;
            await this.present(e);
            Board.render(this);
        }
        Board.render(this);
        this.afterApply();
        return res;
    }

    /** Lo que aprende la ayuda de un suceso (en el Pedro, la ayuda de memoria). */
    observe() { }
    afterApply() { }

    act(a) {
        if (this.mode === 'client') {
            // El invitado no tiene la baraja: manda su jugada al anfitrión y espera su respuesta.
            this.sentFor = this.seq;
            this.online.send({ t: 'act', a, seq: this.seq });
            this.watchReply();
            return Promise.resolve({ ok: true, events: [] });
        }
        return this.apply(this.game.act(a));
    }

    /** Invitado: si tu jugada no tiene respuesta, se pide la mesa otra vez (por si se perdió por el camino). */
    watchReply() {
        clearTimeout(this.replyTimer);
        const seq = this.seq;
        this.replyTimer = setTimeout(() => {
            if (this.stopped || this.sentFor !== seq || this.seq !== seq) return;
            this.online.send({ t: 'resync', seq });
            this.watchReply();
        }, 8000);
    }

    async quip(p, kind, chance) {
        if (!this.settings.quips || p === this.me || p == null) return;
        const b = this.bots[p];
        if (!b || !b.rng.chance(chance)) return;
        const q = b.quip(kind);
        if (!q) return;
        if (this.mode === 'host') this.online.broadcastAll({ t: 'quip', p, text: q, pitch: b.char.pitch, rate: b.char.rate });
        Board.bubble(p, q, 2600);
        await this.say(q, { pitch: b.char.pitch, rate: b.char.rate });
    }

    // ── Fin de ronda y de partida ─────────────────────
    async afterRound() {
        if (this.stopped) return false;
        const host = this.mode === 'host';
        const r = await Dialog.open({
            title: `Fin de la ${this.roundWord} ${this.game.round}`,
            text: this.visual ? this.resultText() : this.speech.last,
            speak: `Fin de la ${this.roundWord} ${this.game.round}.`,
            items: [
                { label: `Siguiente ${this.roundWord}`, value: 'next' },
                ...(this.visual ? [] : [{ label: 'Repetir el resultado', value: 'repeat', key: 'r' }]),
                ...(host ? [{ label: 'Volver a la sala para elegir otro juego', value: 'lobby' }] : []),
                { label: host ? 'Cerrar la sala y salir' : 'Salir al salón', value: 'menu' },
            ],
            cancel: host ? 'lobby' : 'menu',
        });
        if (r === 'repeat') { await this.say(this.speech.last, { interrupt: true }); return this.afterRound(); }
        if (r === 'next') return true;
        if (r === 'lobby' && host) { this.online.backToLobby(); return false; }
        this.app.leaveMatch();   // en una sala, la cierra
        return false;
    }

    async afterGame() {
        const g = this.game, me = this.me;
        const won = (g.winners || []).includes(me);
        if (won) this.audio.win(); else this.audio.lose();
        this.app.recordGame(this.kind, won);
        const who = this.gameOverText(won);
        Board.status(who);
        await this.say(who, { keep: true });
        const items = this.mode === 'host'
            ? [{ label: 'Otra partida en esta mesa', value: 'again' }, { label: 'Volver a la sala para elegir otro juego', value: 'lobby' }, { label: 'Cerrar la sala y salir', value: 'menu' }]
            : [{ label: 'Jugar otra vez con los mismos rivales', value: 'again' }, { label: 'Salir al salón', value: 'menu' }];
        const r = await Dialog.open({ title: 'Fin de la partida', text: this.visual ? `${who} ${this.resultText()}` : who, speak: 'Fin de la partida.', items, cancel: this.mode === 'host' ? 'lobby' : 'menu' });
        if (this.stopped) return;
        if (this.mode === 'host') {
            if (r === 'again') this.online.restart();
            else if (r === 'lobby') this.online.backToLobby();
            else this.app.leaveMatch();
            return;
        }
        if (r === 'again') this.app.startMatch({ game: this.kind, rivals: this.seats.filter(s => s.kind === 'bot').map(s => s.char), practice: this.practice });
        else this.app.leaveMatch();
    }

    gameOverText(won) {
        const g = this.game, me = this.me;
        const ws = g.winners || [];
        if (!ws.length) return 'La partida acaba en empate.';
        if (won) {
            const others = ws.filter(p => p !== me);
            return others.length ? `¡Habéis ganado la partida, ${Txt.list([...others.map(p => this.v.name(p)), 'tú'])}!` : '¡Has ganado la partida!';
        }
        return `${ws.length > 1 ? 'Ganan' : 'Gana'} la partida ${Txt.list(ws.map(p => this.v.name(p)))}.`;
    }

    // ═══ El jugador ════════════════════════════════════

    /** Espera una entrada del jugador. kinds: lo que vale ahora. */
    wait(kinds) {
        return new Promise(resolve => { this.want = { kinds: new Set(kinds), resolve }; Board.render(this); });
    }

    /** Llega una entrada (tecla o botón). Devuelve true si se ha usado. */
    input(kind, arg = null) {
        if (this.stopped) return false;
        const w = this.want;
        if (!w || !w.kinds.has(kind)) return false;
        this.want = null;
        this.speech.cancel();   // corta lo que se estaba diciendo
        w.resolve({ kind, ...(arg || {}) });
        Board.render(this);
        return true;
    }

    /** Si el juego te estaba esperando, deja de esperar (la mesa ha cambiado y se vuelve a decidir). */
    interruptWait() {
        if (this.want) { const w = this.want; this.want = null; w.resolve({ kind: 'interrupt' }); }
    }

    /** Un botón de la mesa. */
    button(kind) {
        if (kind === 'info') return this.info();
        if (kind === 'cards') return this.myCards();
        if (kind === 'repeat') return this.repeat();
        if (kind === 'menu') return this.pause();
        if (!this.input(kind)) { this.audio.error(); this.explainCant(kind); }
    }

    repeat() { this.speech.say(this.speech.last || 'Nada que repetir.', { interrupt: true }); }

    explainCant() {
        const t = 'Ahora no.';
        if (this.visual) { Board.status(t); return; }
        this.notice(t);
    }

    // ═══ Anfitrión: los demás jugadores de la sala ═════
    onRemote(p, msg) {
        if (msg.t === 'resync') { this.resync(p); return; }
        if (this.remoteInstant(p, msg)) return;
        if (msg.t === 'pass') return;
        this.inbox.push({ ...msg, p });   // el sitio sale de la conexión, no de lo que diga el mensaje
        const w = this._wake; this._wake = null; w?.();
    }

    /** Un invitado no ha tenido respuesta a su jugada: se le manda la mesa como está y si su jugada ya ha llegado. */
    resync(p) {
        const pending = this.inbox.some(x => x.p === p && x.t === 'act');
        this.online.sendTo(p, { t: 'batch', seq: this.online.seq, events: [], view: this.game.view(p), sync: true, pending });
    }

    /** Mensajes que se atienden al momento (en el Pedro, quemar). */
    remoteInstant() { return false; }
    /** ¿Hay algo que atender antes de seguir esperando a un jugador de la sala? */
    interruptRemote() { return false; }

    takeInbox(pred) {
        const i = this.inbox.findIndex(pred);
        return i < 0 ? null : this.inbox.splice(i, 1)[0];
    }

    waitInbox(ms = 200) {
        return new Promise(r => { this._wake = r; setTimeout(r, ms); });
    }

    wake() { const w = this._wake; this._wake = null; w?.(); }

    async remoteStep(p) {
        const key = this.stateKey();
        while (!this.stopped && this.seats[p].kind === 'remote' && this.stateKey() === key && this.actor() === p) {
            await this.gate();
            if (this.interruptRemote()) return;
            const m = this.takeInbox(x => x.p === p && x.t === 'act');
            if (m) {
                if (this.lateAction(m.a)) continue;
                const res = this.game.act({ ...m.a, p });
                if (!res.ok) { this.online.sendTo(p, { t: 'error', text: res.error }); continue; }
                await this.apply(res);
                return;
            }
            await this.waitInbox(250);
        }
    }

    /** Una jugada que llega tarde y ya no vale. */
    lateAction() { return false; }

    /** Un jugador se ha ido de la sala: juega la máquina por esa persona. */
    async seatLeft(p) {
        const s = this.seats[p];
        if (!s || s.kind !== 'remote') return;
        s.kind = 'bot';
        s.left = true;
        s.char = { id: 'ausente', name: s.name, level: 'normal', pitch: 1, rate: 1, quips: {} };
        this.bots[p] = this.makeBot(p, s.char, makeRng(this.seed + 977 * (p + 1)));
        this.botTookOver?.(p);
        this.wake();
        this.online?.broadcastAll({ t: 'left', p });
        Board.bubble(p, 'Se ha ido');
        await this.say(`${cap(s.name)} se ha ido de la mesa. Juega la máquina por esa persona hasta que vuelva.`);
    }

    /** Vuelve a la mesa quien se había ido: recupera su sitio. */
    async seatBack(p, conn) {
        const s = this.seats[p];
        if (!s || !s.left) return false;
        s.kind = 'remote'; s.conn = conn; s.left = false;
        this.bots[p] = null;
        this.online?.broadcastAll({ t: 'back', p });
        Board.bubble(p, 'Ha vuelto');
        this.say(`${cap(s.name)} ha vuelto a la mesa.`);
        this.wake();
        return true;
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
                    if (msg.sync) {
                        this.syncShown?.();   // has vuelto a la sala: la mesa se pone como está
                        if (!msg.pending) this.sentFor = -1;   // tu jugada no llegó: se te vuelve a preguntar
                    }
                    for (const e of msg.events) { this.game.observe(e); this.observe(e); }
                    this.seq = msg.seq;
                    for (const e of msg.events) {
                        if (this.stopped) break;
                        await this.present(e);
                        Board.render(this);
                    }
                    this.afterBatch();
                    Board.render(this);
                    if (!this.stopped) this.online.send({ t: 'ack', seq: msg.seq, gid: this.gid });
                    // La mesa ha cambiado: lo que se esperaba de ti se vuelve a decidir.
                    this.interruptWait();
                    this.clientPrompt();
                    break;
                }
                case 'quip':
                    Board.bubble(msg.p, msg.text, 2600);
                    if (this.settings.quips) await this.say(msg.text, { pitch: msg.pitch, rate: msg.rate });
                    break;
                case 'burnError':
                    this.audio.error();
                    this.notice(msg.text);
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
                    await this.say(`${cap(this.names[msg.p])} se ha ido de la mesa. Juega la máquina por esa persona hasta que vuelva.`);
                    break;
                }
                case 'back': {
                    if (this.seats[msg.p]) this.seats[msg.p].kind = 'remote';
                    Board.bubble(msg.p, 'Ha vuelto');
                    if (msg.p !== this.me) await this.say(`${cap(this.names[msg.p])} ha vuelto a la mesa.`);
                    break;
                }
            }
        }
    }

    afterBatch() { }

    /** Después de cada paquete: ¿te toca hacer algo? */
    clientPrompt() {
        if (this.prompting || this.stopped || this.sentFor === this.seq) return;
        const task = this.clientTask();
        if (!task) return;
        this.prompting = true;
        Promise.resolve().then(task).catch(err => console.error(err)).finally(() => {
            this.prompting = false;
            setTimeout(() => this.clientPrompt(), 0);   // por si la mesa cambió mientras tanto
        });
    }

    clientTask() {
        const g = this.game;
        if (this.playPhases.includes(g.phase) && this.actor() === this.me) return () => this.humanStep();
        if (g.phase === 'roundOver' || g.phase === 'gameOver') return () => this.clientWait();
        return null;
    }

    /** Fin de ronda o de partida en una sala: decide el anfitrión. */
    async clientWait() {
        const g = this.game, host = this.names[this.hostSeat ?? 0];
        const phase = g.phase, round = g.round;
        const over = phase === 'gameOver';
        if (over && !this._recorded) {
            this._recorded = true;
            const won = (g.winners || []).includes(this.me);
            this.app.recordGame(this.kind, won);
            const who = this.gameOverText(won);
            Board.status(who);
            await this.say(who, { keep: true });
        }
        this.waitDialog = true;
        const r = await Dialog.open({
            title: over ? 'Fin de la partida' : `Fin de la ${this.roundWord} ${g.round}`,
            text: `${this.visual ? (over ? `${this.gameOverText((g.winners || []).includes(this.me))} ${this.resultText()}` : this.resultText()) : this.speech.last} Espera a que ${host} ${over ? 'decida si jugáis otra' : 'empiece la siguiente'}.`,
            speak: `${over ? 'Fin de la partida' : `Fin de la ${this.roundWord}`}. Espera a que ${host} ${over ? 'decida si jugáis otra' : 'empiece la siguiente'}.`,
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

    // ═══ Pausa y teclado ═══════════════════════════════
    async pause() {
        if (this.paused || Dialog.active) return;
        this.paused = true;
        this.speech.cancel();
        const host = this.mode === 'host';
        const r = await Dialog.open({
            title: 'Pausa', speak: true,
            items: [
                { label: 'Seguir jugando', value: 'go' },
                ...(this.visual ? [] : [{ label: 'Teclas', value: 'keys' }, { label: 'Cómo va la partida', value: 'info' }]),
                ...(host ? [{ label: 'Volver a la sala para elegir otro juego', value: 'lobby' }] : []),
                { label: host ? 'Cerrar la sala y salir' : this.mode === 'client' ? 'Salir de la sala' : 'Salir al salón', value: 'menu' },
            ],
            cancel: 'go',
        });
        this.paused = false;
        if (r === 'keys') this.keysHelp();
        else if (r === 'info') this.info();
        else if (r === 'lobby') this.online.backToLobby();
        else if (r === 'menu') this.app.leaveMatch();
        else if (!this.visual) this.speech.say('Seguimos.', { interrupt: true });
    }

    cancelPick() { return false; }

    onKey(e) {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (this.gameKey(k, e)) return true;
        if (k === 'Escape') { e.preventDefault(); if (!this.cancelPick()) this.pause(); return true; }
        if (k === 'i') { e.preventDefault(); this.info(); return true; }
        if (k === 'c') { e.preventDefault(); this.myCards(); return true; }
        if (k === 'h') { e.preventDefault(); this.keysHelp(); return true; }
        if (k === ' ') { e.preventDefault(); this.repeat(); return true; }
        return false;
    }
}
