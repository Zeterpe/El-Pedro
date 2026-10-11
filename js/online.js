/* =============================================
   EL PEDRO — online.js
   Jugar con amigos: crear una sala (te da un código),
   unirse con el código o con un enlace, la sala de
   espera y el reparto de mensajes durante la partida.
   Quien crea la sala tiene la baraja en su navegador:
   reparte, decide y manda a cada jugador solo lo que
   puede ver.
   ============================================= */
'use strict';

const Online = {
    app: null,
    role: null,            // 'host' | 'client' | null
    net: null,
    code: null,
    table: [],             // anfitrión: [{ name, kind: 'me' | 'remote' | 'bot', conn, char }]
    acks: new Map(),       // anfitrión: conexión → último paquete que ha oído
    seq: 0,
    queue: [],             // invitado: mensajes para la partida
    _waiter: null,
    lobby: null,           // invitado: la sala tal como la manda el anfitrión

    init(app) { this.app = app; },

    get active() { return !!this.role; },

    reset() {
        this.role = null; this.net = null; this.code = null; this.table = [];
        this.acks = new Map(); this.seq = 0; this.queue = []; this.lobby = null;
        const w = this._waiter; this._waiter = null; w?.(null);
    },

    // ═══ Anfitrión ═══════════════════════════════════

    async create() {
        if (!Net.available()) { UI.say('No se ha podido cargar la parte online del juego. Recarga la página.'); return; }
        this.role = 'host';
        this.showLobbyStatus('Abriendo la sala…');
        const net = this.net = new HostNet({
            onMessage: (c, m) => this.hostMessage(c, m),
            onClose: c => this.hostClose(c),
        });
        let code;
        try {
            code = await net.open();
        } catch (e) {
            if (this.net !== net) return;   // se canceló mientras abría
            const why = Net.explain(e);
            this.reset();
            this.app.openFriends(why);
            return;
        }
        if (this.net !== net) { net.close(); return; }   // se canceló mientras abría: se cierra esa sala
        this.code = code;
        this.table = [{ name: this.cleanName(this.app.settings.playerName), kind: 'me' }];
        this.showLobby(true);
    },

    cleanName(n) {
        const s = String(n || '').replace(/[<>\n\r\t]/g, '').trim().slice(0, 16);
        return s || 'Jugador';
    },

    uniqueName(name) {
        const used = new Set(this.table.map(s => s.name.toLowerCase()));
        if (!used.has(name.toLowerCase())) return name;
        for (let i = 2; i < 10; i++) if (!used.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
        return name + ' ' + Math.floor(Math.random() * 90 + 10);
    },

    refuse(conn, text) {
        this.net.send(conn, { t: 'refused', text });
        setTimeout(() => { try { conn.close(); } catch (_) { /* nada */ } }, 600);
    },

    hostMessage(conn, m) {
        if (m.t === 'hello') {
            if (m.v !== GAME_VERSION.id) return this.refuse(conn, 'Tenéis versiones distintas del juego. Recargad la página los dos y volved a intentarlo.');
            if (this.app.match && this.app.match.mode === 'host') return this.refuse(conn, 'La partida de esa sala ya ha empezado. Espera a que acabe.');
            if (this.table.length >= MAX_PLAYERS) return this.refuse(conn, `La mesa está llena: caben ${MAX_PLAYERS} jugadores.`);
            if (this.table.some(s => s.conn === conn)) return;
            const name = this.uniqueName(this.cleanName(m.name));
            this.table.push({ name, kind: 'remote', conn });
            this.app.audio.select();
            UI.say(`${name} se ha sentado a la mesa.`, { interrupt: false });
            this.broadcastLobby();
            this.renderLobby();
            return;
        }
        if (m.t === 'ack') { if (m.gid === this.gid) this.acks.set(conn, Math.max(this.acks.get(conn) || 0, m.seq | 0)); return; }
        if (m.t === 'bye') { this.hostClose(conn); try { conn.close(); } catch (_) { /* nada */ } return; }
        const match = this.app.match;
        if (match && match.mode === 'host') {
            const seat = match.seats.findIndex(s => s.conn === conn && s.kind === 'remote');
            if (seat >= 0) match.onRemote(seat, m);
        }
    },

    hostClose(conn) {
        if (this.role !== 'host') return;
        const i = this.table.findIndex(s => s.conn === conn);
        if (i < 0) return;
        const { name } = this.table[i];
        this.table.splice(i, 1);
        const match = this.app.match;
        if (match && match.mode === 'host') {
            const seat = match.seats.findIndex(s => s.conn === conn && s.kind === 'remote');
            if (seat >= 0) match.seatLeft(seat);
        } else {
            UI.say(`${name} se ha ido de la sala.`, { interrupt: false });
            this.broadcastLobby();
            this.renderLobby();
        }
    },

    lobbyMessage() {
        return {
            t: 'lobby', code: this.code, rules: { ...this.app.settings.rules },
            players: this.table.map(s => ({ name: s.name, kind: s.kind === 'me' ? 'host' : s.kind })),
        };
    },

    broadcastLobby() {
        const msg = this.lobbyMessage();
        this.table.forEach((s, i) => { if (s.kind === 'remote' && s.conn) this.net?.send(s.conn, { ...msg, you: i }); });
    },

    broadcastAll(msg) {
        for (const s of this.table) if (s.kind === 'remote' && s.conn) this.net?.send(s.conn, msg);
    },

    addBot() {
        if (this.table.length >= MAX_PLAYERS) { this.app.audio.error(); UI.say(`La mesa está llena: caben ${MAX_PLAYERS} jugadores.`); return; }
        const used = new Set(this.table.filter(s => s.kind === 'bot').map(s => s.char.id));
        const rng = this.rng ||= makeRng(Date.now());
        const char = pickRivals(CHARACTERS.length, this.app.settings.difficulty, rng).find(c => !used.has(c.id));
        if (!char) { this.app.audio.error(); UI.say('No quedan más rivales de la máquina.'); return; }
        this.table.push({ name: this.uniqueName(char.name), kind: 'bot', char });
        this.app.audio.select();
        UI.say(`${cap(char.name)} se sienta a la mesa.`);
        this.broadcastLobby();
        this.renderLobby();
    },

    removeBot() {
        const i = this.table.map(s => s.kind).lastIndexOf('bot');
        if (i < 0) { this.app.audio.error(); UI.say('No hay rivales de la máquina en la mesa.'); return; }
        const [s] = this.table.splice(i, 1);
        UI.say(`${cap(s.name)} se levanta de la mesa.`);
        this.broadcastLobby();
        this.renderLobby();
    },

    start() {
        if (this.table.length < 2) {
            this.app.audio.error();
            UI.say('Necesitas al menos otro jugador: espera a tus amigos o añade un rival de la máquina.');
            return;
        }
        const rules = { ...this.app.settings.rules };
        const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
        const seats = this.table.map(s => ({ name: s.name, kind: s.kind, char: s.char, conn: s.conn }));
        this.gid = (this.gid || 0) + 1;
        seats.forEach((s, i) => {
            if (s.kind !== 'remote') return;
            this.net.send(s.conn, {
                t: 'start', me: i, rules, gid: this.gid,
                seats: seats.map((x, j) => ({ name: x.name, kind: j === i ? 'me' : (x.kind === 'bot' ? 'bot' : 'remote') })),
            });
        });
        this.acks = new Map();
        this.seq = 0;
        this.app.startOnline({ mode: 'host', seats, me: 0, rules, seed, gid: this.gid });
    },

    restart() { this.app.match?.stop(); this.app.match = null; this.start(); },

    backToLobby() {
        this.app.match?.stop();
        this.app.match = null;
        this.broadcastLobby();
        this.showLobby(true);
    },

    /** Manda a cada jugador lo que ha pasado (sin las cartas que no puede ver) y la mesa. */
    broadcast(match, events) {
        this.seq++;
        const view = match.game.view();
        match.seats.forEach((s, i) => {
            if (s.kind === 'remote' && s.conn) this.net.send(s.conn, { t: 'batch', seq: this.seq, events: events.map(e => eventFor(e, i)), view });
        });
        return this.seq;
    },

    sendTo(seat, msg) {
        const s = this.app.match?.seats[seat];
        if (s?.conn) this.net.send(s.conn, msg);
    },

    /** Espera a que todos hayan oído el paquete seq (o a que pase el tiempo). */
    waitAcks(seq, ms) {
        const pending = () => (this.app.match?.seats || []).some(s => s.kind === 'remote' && s.conn && (this.acks.get(s.conn) || 0) < seq);
        return new Promise(resolve => {
            const t0 = Date.now();
            const tick = () => {
                if (!pending() || Date.now() - t0 > ms || !this.app.match || this.app.match.stopped) resolve();
                else setTimeout(tick, 60);
            };
            tick();
        });
    },

    close() {
        if (this.role === 'host') {
            this.broadcastAll({ t: 'closed' });
            const net = this.net;
            setTimeout(() => net?.close(), 400);
        } else if (this.role === 'client') {
            this.net?.send({ t: 'bye' });
            const net = this.net;
            setTimeout(() => net?.close(), 200);
        }
        this.reset();
    },

    // ═══ Invitado ════════════════════════════════════

    async join(code) {
        code = String(code || '').replace(/\D/g, '');
        if (code.length !== 5) { this.app.audio.error(); this.app.joinStatus('El código tiene 5 cifras.'); return; }
        if (!Net.available()) { this.app.joinStatus('No se ha podido cargar la parte online del juego. Recarga la página.'); return; }
        this.role = 'client';
        this.app.joinStatus('Conectando con la sala…');
        const net = this.net = new ClientNet({ onMessage: m => this.clientMessage(m), onClose: () => this.clientClosed() });
        try {
            await net.connect(code);
        } catch (e) {
            if (this.net !== net) return;   // ya habías cancelado
            this.reset();
            this.app.audio.error();
            this.app.joinStatus(Net.explain(e));
            return;
        }
        if (this.net !== net) return;
        this.code = code;
        net.send({ t: 'hello', name: this.app.settings.playerName, v: GAME_VERSION.id });
    },

    clientMessage(m) {
        if (this.role !== 'client') return;
        switch (m.t) {
            case 'lobby': {
                this.dropWaiter();
                const first = !this.lobby;
                this.lobby = m;
                if (this.app.match) { this.app.match.stop(); this.app.match = null; Dialog.close(undefined, true); }
                this.showLobby(false, first);
                break;
            }
            case 'refused':
                this.app.audio.error();
                this.close();
                this.app.openFriends(m.text);
                break;
            case 'start':
                this.dropWaiter();
                this.queue = [];
                this.app.startOnline({ mode: 'client', seats: m.seats, me: m.me, rules: m.rules, online: this, gid: m.gid });
                break;
            case 'closed': this.clientClosed(true); break;
            default:
                if (this._waiter) { const w = this._waiter; this._waiter = null; w(m); } else this.queue.push(m);
        }
    },

    /** La partida que se acaba deja de esperar mensajes (los siguientes son para la nueva). */
    dropWaiter() { const w = this._waiter; this._waiter = null; w?.(null); },

    /** La partida del invitado pide el siguiente mensaje. */
    next() {
        if (this.queue.length) return Promise.resolve(this.queue.shift());
        if (this.role !== 'client') return Promise.resolve(null);
        return new Promise(resolve => { this._waiter = resolve; });
    },

    send(msg) { this.net?.send(msg); },

    clientClosed(byHost = false) {
        if (this.role !== 'client') return;
        const host = this.lobby?.players?.[0]?.name;
        this.reset();
        const m = this.app.match;
        if (m) { m.stop(); this.app.match = null; }
        Dialog.close(undefined, true);
        this.app.audio.error();
        this.app.showMenu(false, byHost ? `${host || 'Quien creó la sala'} ha cerrado la sala.` : 'Se ha perdido la conexión con la sala.');
    },

    // ═══ La sala de espera ═══════════════════════════

    codeSpoken() { return (this.code || '').split('').join(', '); },
    link() { return `${location.origin}${location.pathname}?sala=${this.code}`; },

    showLobbyStatus(text) {
        $('lobby-title').textContent = 'Sala';
        $('lobby-info').textContent = text;
        $('lobby-players').innerHTML = '';
        for (const id of ['lobby-share', 'lobby-addbot', 'lobby-delbot', 'lobby-rules', 'lobby-start']) $(id).hidden = true;
        $('lobby-leave').textContent = 'Cancelar';
        UI.show('lobby', { intro: text, focus: 'lobby-leave' });
    },

    showLobby(host, first = true) {
        this.renderLobby();
        const players = this.playersText();
        let intro;
        if (host) intro = `Sala abierta. Tu código es ${this.codeSpoken()}. Díselo a tus amigos o comparte el enlace. En la mesa: ${players}.`;
        else intro = first ? `Te has sentado en la mesa de ${this.lobby.players[0]?.name}. En la mesa: ${players}. Espera a que empiece la partida.` : `De vuelta en la sala. En la mesa: ${players}.`;
        UI.show('lobby', { intro, focus: host ? 'lobby-share' : 'lobby-leave' });
    },

    playersOf() {
        if (this.role === 'host') return this.table.map(s => ({ name: s.name, kind: s.kind === 'me' ? 'host' : s.kind, me: s.kind === 'me' }));
        return (this.lobby?.players || []).map((p, i) => ({ ...p, me: i === this.lobby.you }));
    },

    playersText() {
        return Txt.list(this.playersOf().map(p => p.me ? 'tú' : p.kind === 'bot' ? `${p.name}, de la máquina` : p.name));
    },

    renderLobby() {
        if (UI.current !== 'lobby' && !document.getElementById('screen-lobby')) return;
        const host = this.role === 'host';
        $('lobby-title').textContent = `Sala ${this.code || ''}`;
        $('lobby-info').textContent = host
            ? `Dile a tus amigos el código ${this.code}, o compárteles el enlace. Caben ${MAX_PLAYERS} jugadores.`
            : `Estás en la mesa de ${this.lobby?.players[0]?.name || 'tu amigo'}. Espera a que empiece la partida.`;
        const ul = $('lobby-players');
        ul.innerHTML = '';
        for (const p of this.playersOf()) {
            const li = document.createElement('li');
            li.textContent = p.me ? `${p.name} (tú)` : p.kind === 'bot' ? `${p.name}, de la máquina` : p.kind === 'host' ? `${p.name}, quien ha creado la sala` : p.name;
            ul.appendChild(li);
        }
        for (const id of ['lobby-share', 'lobby-addbot', 'lobby-delbot', 'lobby-rules', 'lobby-start']) $(id).hidden = !host;
        const rules = host ? this.app.settings.rules : this.lobby?.rules;
        $('lobby-rules-text').textContent = rules ? Txt.rules({ ...DEFAULT_RULES, ...rules }) : '';
        $('lobby-listen').hidden = host || !rules;
        $('lobby-leave').textContent = host ? 'Cerrar la sala' : 'Salir de la sala';
    },

    async share() {
        const url = this.link();
        const text = `Únete a mi mesa de El Pedro con el código ${this.code}`;
        try {
            if (navigator.share) { await navigator.share({ title: 'El Pedro', text, url }); return; }
        } catch (_) { /* cancelado */ }
        try {
            await navigator.clipboard.writeText(`${text}: ${url}`);
            UI.say('Enlace copiado. Pégalo en un mensaje a tus amigos.');
        } catch (_) {
            UI.say(`Tu enlace es ${url}`);
        }
    },
};
