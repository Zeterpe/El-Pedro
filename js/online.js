/* =============================================
   EL PEDRO — online.js
   Jugar con amigos: crear una sala (te da un código),
   unirse con el código o con un enlace, la sala de
   espera, elegir a qué se juega y el reparto de
   mensajes durante la partida.
   Quien crea la sala tiene la baraja en su navegador:
   reparte, decide y manda a cada jugador solo lo que
   puede ver. La sala sigue abierta entre partidas:
   se puede cambiar de juego sin crearla otra vez.
   Si a alguien se le corta la conexión, la máquina
   juega por esa persona hasta que vuelve.
   ============================================= */
'use strict';

/** Identificador de este navegador: sirve para recuperar tu sitio si se corta la conexión. */
function clientId() {
    try {
        let id = localStorage.getItem('elpedro.id');
        if (!id) { id = Math.random().toString(36).slice(2, 12); localStorage.setItem('elpedro.id', id); }
        return id;
    } catch (_) { return clientId.mem ||= Math.random().toString(36).slice(2, 12); }
}

const Online = {
    app: null,
    role: null,            // 'host' | 'client' | null
    net: null,
    code: null,
    game: 'pedro',         // el juego de la sala
    table: [],             // anfitrión: [{ name, kind: 'me' | 'remote' | 'bot', conn, char, cid, waiting, away }]
    acks: new Map(),       // anfitrión: conexión → último paquete que ha oído
    seq: 0,
    queue: [],             // invitado: mensajes para la partida
    _waiter: null,
    lobby: null,           // invitado: la sala tal como la manda el anfitrión

    init(app) { this.app = app; },

    get active() { return !!this.role; },
    get playing() { return !!(this.app.match && this.app.match.mode === 'host' && !this.app.match.stopped); },
    get G() { return GAMES[this.game] || GAMES.pedro; },
    get rules() { return this.app.settings[this.G.rulesKey]; },

    reset() {
        this.role = null; this.net = null; this.code = null; this.table = [];
        this.acks = new Map(); this.seq = 0; this.queue = []; this.lobby = null;
        this.reconnecting = false;
        const w = this._waiter; this._waiter = null; w?.(null);
    },

    // ═══ Anfitrión ═══════════════════════════════════

    async create() {
        if (!Net.available()) { UI.say('No se ha podido cargar la parte online del juego. Recarga la página.'); return; }
        this.role = 'host';
        this.game = GAMES[this.app.settings.game]?.online === false ? 'pedro' : this.app.settings.game || 'pedro';
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
        this.table = [{ name: this.cleanName(this.app.settings.playerName), kind: 'me', cid: clientId() }];
        this.app.keepAwake(true);
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

    refuse(conn, text, extra = {}) {
        this.net.send(conn, { t: 'refused', text, ...extra });
        setTimeout(() => { try { conn.close(); } catch (_) { /* nada */ } }, 600);
    },

    hostMessage(conn, m) {
        if (m.t === 'hello') return this.hello(conn, m);
        if (m.t === 'ack') { if (m.gid === this.gid) this.acks.set(conn, Math.max(this.acks.get(conn) || 0, m.seq | 0)); return; }
        if (m.t === 'bye') { this.hostClose(conn, true); try { conn.close(); } catch (_) { /* nada */ } return; }
        const match = this.app.match;
        if (match && match.mode === 'host') {
            const seat = match.seats.findIndex(s => s.conn === conn && s.kind === 'remote');
            if (seat >= 0) match.onRemote(seat, m);
        }
    },

    hello(conn, m) {
        if (m.v !== GAME_VERSION.id) {
            // Quien tenga la versión antigua la actualiza: el invitado, solo; si es la tuya, se te avisa.
            if (String(m.v) < GAME_VERSION.id) return this.refuse(conn, 'Tu juego era más antiguo que el de la sala. Recarga la página y vuelve a unirte.', { update: GAME_VERSION.id });
            UI.say('Alguien ha intentado entrar con una versión más nueva del juego. Cierra la sala, recarga la página y créala otra vez.', { interrupt: false });
            return this.refuse(conn, 'Quien ha creado la sala tiene una versión más antigua del juego. Pídele que recargue la página y cree la sala otra vez.');
        }
        if (this.table.some(s => s.conn === conn)) return;
        const cid = String(m.id || '').slice(0, 20) || null;
        // ¿Vuelve alguien a quien se le cortó la conexión?
        const old = cid ? this.table.find(s => s.kind === 'remote' && s.cid === cid) : null;
        if (old) {
            const prev = old.conn;
            old.conn = conn; old.away = false;
            if (prev && prev !== conn) { try { prev.close(); } catch (_) { /* nada */ } }
            const match = this.app.match;
            const seat = this.playing ? match.seats.findIndex(s => s.cid === cid) : -1;
            if (seat >= 0 && !old.waiting) {
                const s = match.seats[seat];
                if (s.left) match.seatBack(seat, conn); else s.conn = conn;
                this.sendStart(seat, true);
                this.net.send(conn, { t: 'batch', seq: this.seq, events: [], view: match.game.view(seat), sync: true, pending: match.inbox.some(x => x.p === seat && x.t === 'act') });
                return;
            }
            this.sendLobby(old);
            this.renderLobby();
            return;
        }
        if (this.table.filter(s => !s.away).length >= this.G.maxPlayers) return this.refuse(conn, `La mesa está llena: caben ${this.G.maxPlayers} jugadores.`);
        const name = this.uniqueName(this.cleanName(m.name));
        const seat = { name, kind: 'remote', conn, cid, waiting: this.playing };
        this.table.push(seat);
        this.app.audio.select();
        if (this.playing) {
            // Están jugando: entra en la sala y juega en la siguiente partida.
            this.app.match.notice(`${name} ha entrado en la sala: jugará en la siguiente partida.`);
            this.sendLobby(seat);
            return;
        }
        UI.say(`${name} se ha sentado a la mesa.`, { interrupt: false });
        this.broadcastLobby();
        this.renderLobby();
    },

    hostClose(conn, bye = false) {
        if (this.role !== 'host') return;
        const i = this.table.findIndex(s => s.conn === conn);
        if (i < 0) return;
        const entry = this.table[i];
        const match = this.app.match;
        const seat = this.playing ? match.seats.findIndex(s => s.conn === conn && s.kind === 'remote') : -1;
        if (seat >= 0) {
            // En plena partida: juega la máquina por esa persona y le guardamos el sitio por si vuelve.
            entry.conn = null;
            if (bye) this.table.splice(i, 1); else entry.away = true;
            match.seatLeft(seat);
            return;
        }
        this.table.splice(i, 1);
        if (this.playing) return;
        UI.say(`${entry.name} se ha ido de la sala.`, { interrupt: false });
        this.broadcastLobby();
        this.renderLobby();
    },

    lobbyMessage() {
        return {
            t: 'lobby', code: this.code, game: this.game, rules: { ...this.rules }, playing: this.playing,
            players: this.table.filter(s => !s.away).map(s => ({ name: s.name, kind: s.kind === 'me' ? 'host' : s.kind, waiting: !!s.waiting })),
        };
    },

    sendLobby(entry) {
        const list = this.table.filter(s => !s.away);
        if (entry.conn) this.net?.send(entry.conn, { ...this.lobbyMessage(), you: list.indexOf(entry) });
    },

    /** Manda la sala a quien no está jugando (a los que juegan no se les interrumpe). */
    broadcastLobby() {
        const playing = this.playing;
        for (const s of this.table) if (s.kind === 'remote' && s.conn && (!playing || s.waiting)) this.sendLobby(s);
    },

    broadcastAll(msg) {
        for (const s of this.table) if (s.kind === 'remote' && s.conn && !s.waiting) this.net?.send(s.conn, msg);
    },

    setGame(id) {
        if (!GAMES[id] || GAMES[id].online === false) return;
        this.game = id;
        this.app.settings.game = id;
        this.app.save();
        this.broadcastLobby();
        this.renderLobby();
    },

    addBot() {
        if (this.table.length >= this.G.maxPlayers) { this.app.audio.error(); UI.say(`La mesa está llena: caben ${this.G.maxPlayers} jugadores.`); return; }
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

    /** Cambia a todos de sitio al azar (en la Brisca por parejas, así cambian las parejas). */
    shuffleSeats() {
        if (this.table.length < 3) { this.app.audio.error(); UI.say('Hacen falta al menos tres jugadores para cambiar de sitio.'); return; }
        const rng = this.rng ||= makeRng(Date.now());
        rng.shuffle(this.table);
        this.app.audio.shuffle();
        UI.say(`Nuevos sitios: ${this.playersText()}.${this.pairsText() ? ' ' + this.pairsText() : ''}`);
        this.broadcastLobby();
        this.renderLobby();
    },

    start() {
        const table = this.table.filter(s => !s.away);
        if (table.length < 2) {
            this.app.audio.error();
            UI.say('Necesitas al menos otro jugador: espera a tus amigos o añade un rival de la máquina.');
            return;
        }
        if (table.length > this.G.maxPlayers) { this.app.audio.error(); UI.say(`En ${this.G.name} caben ${this.G.maxPlayers} jugadores.`); return; }
        this.table = table;
        for (const s of table) s.waiting = false;
        const rules = { ...this.rules };
        const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
        const seats = table.map(s => ({ name: s.name, kind: s.kind, char: s.char, conn: s.conn, cid: s.cid }));
        const me = table.findIndex(s => s.kind === 'me');
        this.gid = (this.gid || 0) + 1;
        this.seats = seats;
        this.startRules = rules;
        this.acks = new Map();
        this.seq = 0;
        seats.forEach((s, i) => { if (s.kind === 'remote') this.sendStart(i); });
        this.app.startOnline({ game: this.game, mode: 'host', seats, me, rules, seed, gid: this.gid });
    },

    /** Le dice a un jugador que empieza la partida (o que vuelve a ella). */
    sendStart(i, rejoin = false) {
        const seats = this.app.match?.seats && rejoin ? this.app.match.seats : this.seats;
        const host = seats.findIndex(x => x.kind === 'me');
        this.net.send(seats[i].conn, {
            t: 'start', game: this.game, me: i, rules: this.app.match?.game?.rules && rejoin ? this.app.match.game.rules : this.startRules, gid: this.gid, host, rejoin,
            seats: seats.map((x, j) => ({ name: x.name, kind: j === i ? 'me' : (x.kind === 'bot' ? 'bot' : 'remote') })),
        });
    },

    restart() { this.app.match?.stop(); this.app.match = null; this.start(); },

    backToLobby() {
        this.app.match?.stop();
        this.app.match = null;
        Dialog.close(undefined, true);
        this.table = this.table.filter(s => !s.away);
        for (const s of this.table) s.waiting = false;
        this.broadcastLobby();
        this.showLobby(true, false);
    },

    /** Manda a cada jugador lo que ha pasado (sin las cartas que no puede ver) y la mesa. */
    broadcast(match, events) {
        this.seq++;
        match.seats.forEach((s, i) => {
            if (s.kind === 'remote' && s.conn) this.net.send(s.conn, { t: 'batch', seq: this.seq, events: events.map(e => match.eventFor(e, i)).filter(Boolean), view: match.game.view(i) });
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
            for (const s of this.table) if (s.kind === 'remote' && s.conn) this.net?.send(s.conn, { t: 'closed' });
            const net = this.net;
            setTimeout(() => net?.close(), 400);
        } else if (this.role === 'client') {
            this.net?.send({ t: 'bye' });
            const net = this.net;
            setTimeout(() => net?.close(), 200);
        }
        this.app.keepAwake(false);
        this.reset();
    },

    // ═══ Invitado ════════════════════════════════════

    async join(code) {
        code = String(code || '').replace(/\D/g, '');
        if (code.length !== 5) { this.app.audio.error(); this.app.joinStatus('El código tiene 5 cifras.'); return; }
        if (!Net.available()) { this.app.joinStatus('No se ha podido cargar la parte online del juego. Recarga la página.'); return; }
        this.role = 'client';
        this.app.joinStatus('Conectando con la sala…');
        const net = this.net = this.clientNet();
        try {
            await net.connect(code, { onRetry: why => { if (this.net === net) this.app.joinStatus(why); } });
        } catch (e) {
            if (this.net !== net) return;   // ya habías cancelado
            this.reset();
            this.app.audio.error();
            this.app.joinStatus(Net.explain(e));
            return;
        }
        if (this.net !== net) return;
        this.code = code;
        this.app.keepAwake(true);
        net.send({ t: 'hello', name: this.app.settings.playerName, v: GAME_VERSION.id, id: clientId() });
    },

    clientNet() {
        const net = new ClientNet({ onMessage: m => { if (this.net === net) this.clientMessage(m); }, onClose: () => { if (this.net === net) this.clientClosed(); } });
        return net;
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
            case 'refused': {
                const code = this.code;
                this.close();
                // Tu versión es la antigua: se recarga sola con la nueva y vuelve a entrar en la sala.
                if (m.update && String(m.update) > GAME_VERSION.id && this.app.reloadFor(String(m.update), code)) {
                    UI.say('Tu juego era más antiguo que el de la sala. Se actualiza y vuelves a entrar.');
                    break;
                }
                this.app.audio.error();
                this.app.openFriends(m.text);
                break;
            }
            case 'start': {
                this.dropWaiter();
                this.queue = [];
                this.hostSeat = m.host ?? 0;
                this.app.startOnline({ game: m.game, mode: 'client', seats: m.seats, me: m.me, rules: m.rules, online: this, gid: m.gid, rejoin: !!m.rejoin, hostSeat: this.hostSeat });
                break;
            }
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
        // Se ha cortado sin que nadie cerrara la sala: se intenta volver a entrar.
        if (!byHost && this.code && !this.reconnecting) { this.reconnect(); return; }
        const host = this.lobby?.players?.find(p => p.kind === 'host')?.name;
        this.reset();
        const m = this.app.match;
        if (m) { m.stop(); this.app.match = null; }
        Dialog.close(undefined, true);
        this.app.audio.error();
        this.app.showMenu(false, byHost ? `${host || 'Quien creó la sala'} ha cerrado la sala.` : 'Se ha perdido la conexión con la sala.');
    },

    async reconnect() {
        this.reconnecting = true;
        const code = this.code;
        this.app.audio.error();
        const say = t => { if (this.app.match && !this.app.match.stopped) this.app.match.notice(t); else UI.say(t, { interrupt: false }); };
        say('Se ha cortado la conexión con la sala. Intentando volver a entrar.');
        for (let i = 0; i < 5 && this.role === 'client' && this.reconnecting; i++) {
            const net = this.net = this.clientNet();
            try {
                await net.connect(code);
                if (this.net !== net || this.role !== 'client') return;
                net.send({ t: 'hello', name: this.app.settings.playerName, v: GAME_VERSION.id, id: clientId() });
                this.reconnecting = false;
                say('Conexión recuperada.');
                return;
            } catch (_) {
                net.close();
                await new Promise(r => setTimeout(r, 2500 + i * 1500));
            }
        }
        if (this.role !== 'client') return;
        this.reconnecting = 'failed';
        this.clientClosed(false);
    },

    // ═══ La sala de espera ═══════════════════════════

    codeSpoken() { return (this.code || '').split('').join(', '); },
    link() { return `${location.origin}${location.pathname}?sala=${this.code}`; },

    showLobbyStatus(text) {
        $('lobby-title').textContent = 'Sala';
        $('lobby-code').innerHTML = '';
        $('lobby-info').textContent = text;
        $('lobby-players').innerHTML = '';
        $('lobby-game').innerHTML = '';
        $('lobby-game-text').textContent = '';
        for (const id of ['lobby-share', 'lobby-addbot', 'lobby-delbot', 'lobby-shuffle', 'lobby-rules', 'lobby-start', 'lobby-listen']) $(id).hidden = true;
        $('lobby-leave').textContent = 'Cancelar';
        UI.show('lobby', { intro: text, focus: 'lobby-leave' });
    },

    showLobby(host, first = true) {
        this.renderLobby();
        const players = this.playersText();
        const G = host ? this.G : GAMES[this.lobby?.game] || GAMES.pedro;
        let intro;
        if (host) intro = first
            ? `Sala abierta. Tu código es ${this.codeSpoken()}. Díselo a tus amigos o comparte el enlace. Juego: ${G.name}. En la mesa: ${players}.`
            : `De vuelta en la sala. Juego: ${G.name}. En la mesa: ${players}. Puedes elegir otro juego.`;
        else {
            const hostName = this.lobby.players.find(p => p.kind === 'host')?.name || 'tu amigo';
            const wait = this.lobby.playing ? 'Están jugando una partida: entrarás en la siguiente.' : 'Espera a que empiece la partida.';
            intro = first ? `Te has sentado en la mesa de ${hostName}. Juego: ${G.name}. En la mesa: ${players}. ${wait}` : `De vuelta en la sala. Juego: ${G.name}. En la mesa: ${players}.`;
        }
        UI.show('lobby', { intro, focus: host ? (first ? 'lobby-share' : 'lobby-start') : 'lobby-leave' });
    },

    playersOf() {
        if (this.role === 'host') return this.table.filter(s => !s.away).map(s => ({ name: s.name, kind: s.kind === 'me' ? 'host' : s.kind, me: s.kind === 'me', waiting: s.waiting }));
        return (this.lobby?.players || []).map((p, i) => ({ ...p, me: i === this.lobby.you }));
    },

    playersText() {
        return Txt.list(this.playersOf().map(p => p.me ? 'tú' : p.kind === 'bot' ? `${p.name}, de la máquina` : p.name));
    },

    /** Por parejas (en la Brisca o el Parchís), quién va con quién (sitios alternos). */
    pairsText() {
        const id = this.role === 'host' ? this.game : this.lobby?.game;
        const rules = this.role === 'host' ? this.rules : this.lobby?.rules;
        const ps = this.playersOf();
        if (!rules || !GAMES[id]?.pairs?.(rules, ps.length)) return '';
        const name = p => p.me ? 'tú' : p.name;
        const a = ps.filter((_, i) => i % 2 === 0).map(name), b = ps.filter((_, i) => i % 2 === 1).map(name);
        return `${GAMES[id].teamWord || 'Parejas'}: ${Txt.list(a)} contra ${Txt.list(b)}.`;
    },

    renderLobby() {
        if (!document.getElementById('screen-lobby')) return;
        const host = this.role === 'host';
        const gameId = host ? this.game : this.lobby?.game || 'pedro';
        const G = GAMES[gameId] || GAMES.pedro;
        $('lobby-title').textContent = 'Sala de juego';
        $('lobby-code').innerHTML = (this.code || '').split('').map(d => `<span>${d}</span>`).join('');
        $('lobby-code').setAttribute('aria-label', `Código de la sala: ${this.codeSpoken()}`);
        const hostName = this.lobby?.players?.find(p => p.kind === 'host')?.name || 'tu amigo';
        $('lobby-info').textContent = host
            ? `Dile a tus amigos el código, o compárteles el enlace. Caben ${G.maxPlayers} jugadores. Al acabar cada partida volvéis aquí y podéis cambiar de juego.`
            : this.lobby?.playing ? `Estás en la sala de ${hostName}. Están jugando: entrarás en la siguiente partida.` : `Estás en la sala de ${hostName}. Espera a que empiece la partida.`;
        // El juego: quien crea la sala lo elige; los demás lo ven.
        const box = $('lobby-game');
        if (host) {
            // Si ya está, solo se actualiza: así no pierde el foco al cambiar de juego.
            if (box.firstChild?._def) OptionList._fill(box.firstChild);
            else OptionList.render(box, [{ label: 'Juego', values: GAME_IDS.filter(id => GAMES[id].online !== false), get: () => this.game, set: v => this.setGame(v), text: v => GAMES[v].name }], null);
            $('lobby-game-text').textContent = '';
        } else {
            box.innerHTML = '';
            $('lobby-game-text').textContent = `Juego: ${G.name}`;
        }
        const card = $('lobby-game-card');
        if (card.dataset.game !== G.id) {
            card.dataset.game = G.id;
            card.innerHTML = `${gameArt(G, 12)}<span class="lgc-text"><strong></strong><span class="lgc-tag"></span></span>`;
            card.querySelector('strong').textContent = G.name;
            card.querySelector('.lgc-tag').textContent = G.tagline;
        }
        const ul = $('lobby-players');
        ul.innerHTML = '';
        this.playersOf().forEach((p, i) => {
            const li = document.createElement('li');
            const tag = p.me ? ' (tú)' : p.kind === 'bot' ? ', de la máquina' : p.kind === 'host' ? ', quien ha creado la sala' : '';
            li.innerHTML = `<span class="avatar" aria-hidden="true" data-c="${i % 6}"></span><span class="pl-name"></span>`;
            li.querySelector('.avatar').textContent = p.name.replace(/^la abuela /i, '').charAt(0).toUpperCase();
            li.querySelector('.pl-name').textContent = `${p.name}${tag}${p.waiting ? ', jugará en la siguiente' : ''}`;
            ul.appendChild(li);
        });
        $('lobby-pairs').textContent = this.pairsText();
        for (const id of ['lobby-share', 'lobby-addbot', 'lobby-delbot', 'lobby-shuffle', 'lobby-rules', 'lobby-start']) $(id).hidden = !host;
        const rules = host ? this.rules : this.lobby?.rules;
        $('lobby-rules-title').textContent = `Reglas de esta mesa: ${G.name}`;
        $('lobby-rules-text').textContent = rules ? G.summary(rules) : '';
        $('lobby-listen').hidden = host || !rules;
        $('lobby-start').querySelector('.lbl').textContent = `Empezar: ${G.name}`;
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
