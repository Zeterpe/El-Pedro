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
   Quien llega con la mesa llena o a mitad de partida
   entra a mirar: ve y oye lo que ven todos, sin las
   cartas de nadie. Puede ocupar el sitio de un rival
   de la máquina: en la sala de espera, solo; a mitad
   de partida, si quien ha creado la sala se lo da.
   En El Impostor, antes de cada partida se pasa por la
   sala de espera de la nave: todos andan por el Comedor
   y eligen color hasta que quien ha creado la sala
   empieza. Quien llega o se va mientras, entra o sale
   de la nave sin cortar nada.
   Si se va quien lleva la sala (se le corta el wifi o
   sale pasándola), la lleva quien entró antes de los que
   quedan: tiene una copia escondida de la partida y la
   sigue desde ahí, con el mismo código si se puede. La
   máquina juega por quien se ha ido; si vuelve, recupera
   su sitio como invitado.
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

/** Cuántas personas más que sitios caben en la sala, para mirar. */
const MAX_WATCHERS = 6;
/** Cada cuánto dice quien lleva la sala que sigue ahí, y cuánto silencio hace pensar que se ha cortado (milisegundos). */
const HOST_PING = 2000, HOST_SILENCE = 6000;
/** Si se va quien lleva la sala: cuánto se espera a que vuelva antes de llevarla tú, y cuánto más espera el segundo. */
const HOST_WAIT = 10000, HOST_WAIT_NEXT = 15000;

const Online = {
    app: null,
    role: null,            // 'host' | 'client' | null
    net: null,
    code: null,
    game: 'pedro',         // el juego de la sala
    table: [],             // anfitrión: [{ name, kind: 'me' | 'remote' | 'bot', conn, char, cid, watch, viewing, away }]
    acks: new Map(),       // anfitrión: conexión → último paquete que ha oído
    seq: 0,
    queue: [],             // invitado: mensajes para la partida
    _waiter: null,
    lobby: null,           // invitado: la sala tal como la manda el anfitrión
    base: null,            // el código con el que se abrió la sala (los de reserva salen de él)
    joinN: 0,              // anfitrión: orden de llegada (quien llegó antes lleva la sala si te vas)
    backup: null,          // invitado: la copia de la sala y la partida, por si se va quien la lleva
    handover: null,        // anfitrión que ha cogido la sala: { from } (quién la llevaba)
    handoverTo: null,      // invitado: quien lleva la sala se ha ido pasándotela a ti o a otro (su id)

    init(app) { this.app = app; },

    get active() { return !!this.role; },
    get playing() { return !!(this.app.match && this.app.match.mode === 'host' && !this.app.match.stopped); },
    get G() { return GAMES[this.game] || GAMES.pedro; },
    get rules() { return this.app.settings[this.G.rulesKey]; },
    /** ¿Se puede mirar la partida empezada y ocupar el sitio de la máquina? (En El Impostor, no.) */
    get lateJoin() { return this.G.lateJoin !== false; },
    /** ¿Tiene este juego sala de espera en la nave antes de empezar? (El Impostor) */
    get waitRoom() { return !!this.G.waitRoom; },
    /** Anfitrión: ¿estáis en la sala de espera de la nave? */
    get waiting() { const m = this.app.match; return !!(m && m.mode === 'host' && !m.stopped && m.lobby); },

    /** Anfitrión: quienes tienen sitio en la mesa y quienes solo miran (watch). */
    seated() { return this.table.filter(s => !s.away && !s.watch); },
    watchers() { return this.table.filter(s => !s.away && s.watch); },

    reset() {
        this.role = null; this.net = null; this.code = null; this.table = [];
        this.acks = new Map(); this.seq = 0; this.queue = []; this.lobby = null;
        this.reconnecting = false;
        this.base = null; this.backup = null; this.handover = null; this.handoverTo = null; this.displacing = false;
        this.stopBeats();
        const w = this._waiter; this._waiter = null; w?.(null);
    },

    // ═══ Anfitrión ═══════════════════════════════════

    async create() {
        if (!Net.available()) { UI.say('No se ha podido cargar la parte online del juego. Recarga la página.'); return; }
        this.role = 'host';
        this.game = GAMES[this.app.settings.game]?.online === false ? 'pedro' : this.app.settings.game || 'pedro';
        this.showLobbyStatus('Abriendo la sala…');
        const net = this.net = this.hostNet();
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
        this.code = this.base = code;
        this.joinN = 0;
        this.table = [{ name: this.cleanName(this.app.settings.playerName), kind: 'me', cid: clientId(), look: this.myLook(), n: 0 }];
        this.app.keepAwake(true);
        this.startBeats();
        this.showLobby(true);
    },

    hostNet() {
        const net = new HostNet({
            onMessage: (c, m) => { if (this.net === net) this.hostMessage(c, m); },
            onClose: c => { if (this.net === net) { this.hostClose(c); this.backupSoon(); } },
            onLost: () => { if (this.net === net) this.displaced(); },
        });
        return net;
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
        if (m.t === 'hello') { this.hello(conn, m); this.backupSoon(); return; }
        if (m.t === 'look') return this.takeLook(this.table.find(s => s.conn === conn), m);
        if (m.t === 'ack') { if (m.gid === this.gid) this.acks.set(conn, Math.max(this.acks.get(conn) || 0, m.seq | 0)); return; }
        if (m.t === 'bye') { this.hostClose(conn, true); this.backupSoon(); try { conn.close(); } catch (_) { /* nada */ } return; }
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
            if (m.look) old.look = this.cleanLook(m.look);
            if (prev && prev !== conn) { try { prev.close(); } catch (_) { /* nada */ } }
            const match = this.app.match;
            const seat = this.playing ? match.seats.findIndex(s => s.cid === cid) : -1;
            if (seat >= 0 && !old.watch) {
                const s = match.seats[seat];
                if (s.left) match.seatBack(seat, conn); else s.conn = conn;
                this.sendStart(seat, true);
                this.net.send(conn, { t: 'batch', seq: this.seq, events: [], view: match.game.view(seat), sync: true, pending: match.inbox.some(x => x.p === seat && x.t === 'act') });
                return;
            }
            if (this.playing && old.watch && this.lateJoin) { this.sendWatch(old, true); return; }
            this.sendLobby(old);
            this.renderLobby();
            return;
        }
        if (this.table.filter(s => !s.away).length >= this.G.maxPlayers + MAX_WATCHERS) return this.refuse(conn, 'La sala está llena: no caben más personas, ni siquiera a mirar.');
        const name = this.uniqueName(this.cleanName(m.name));
        const entry = { name, kind: 'remote', conn, cid, watch: true, look: this.cleanLook(m.look), n: ++this.joinN };
        this.table.push(entry);
        this.app.audio.select();
        if (this.waiting) {
            // En la sala de espera de la nave: entra en ella con los demás, si hay sitio.
            const [placed] = this.seatWatchers();
            if (placed) this.refreshWaiting(`${name} ha entrado en la sala de espera.`);
            else { this.app.match.notice(`${name} ha entrado en la sala: la mesa está llena, así que espera fuera.`); this.sendLobby(entry); }
            return;
        }
        if (this.playing) {
            const match = this.app.match;
            // Se había ido de la partida con «salir» y vuelve: recupera su sitio.
            const back = cid ? match.seats.findIndex(s => s.left && s.cid === cid) : -1;
            if (back >= 0 && this.lateJoin && match.freeSeats().includes(back)) {
                entry.watch = false;
                match.seatBack(back, conn);
                this.sendStart(back, true);
                this.net.send(conn, { t: 'batch', seq: this.seq, events: [], view: match.game.view(back), sync: true });
                return;
            }
            if (!this.lateJoin) {
                // En este juego no se mira desde fuera: espera en la sala a la siguiente partida.
                match.notice(`${name} ha entrado en la sala: jugará en la siguiente partida.`);
                this.sendLobby(entry);
                return;
            }
            // Están jugando: entra a mirar. Quien ha creado la sala le puede dar el sitio de un rival de la máquina.
            this.sendWatch(entry, true);
            match.notice(match.freeSeats().length
                ? `${name} ha entrado a mirar la partida. Si quieres que juegue ya, dale el sitio de un rival de la máquina en el menú de pausa.`
                : `${name} ha entrado a mirar la partida. Jugará en la siguiente, si hay sitio.`);
            return;
        }
        const [placed] = this.seatWatchers();
        if (!placed) UI.say(`${name} ha entrado a mirar: la mesa está llena. Si quitas un rival de la máquina, se sentará.`, { interrupt: false });
        else UI.say(this.seatedText(placed), { interrupt: false });
        this.broadcastLobby();
        this.renderLobby();
    },

    /**
     * Sala de espera: quien mira se sienta si hay sitio o, con la mesa llena, en el sitio
     * de un rival de la máquina (el último), sin cambiar el orden de la mesa.
     * Devuelve a quién ha sentado: [{ who, bot }].
     */
    seatWatchers() {
        const out = [];
        for (const w of this.watchers()) {
            if (this.seated().length < this.G.maxPlayers) { w.watch = false; out.push({ who: w }); continue; }
            if (!this.lateJoin) break;
            const bot = this.table.findLast(s => s.kind === 'bot');
            if (!bot) break;
            this.table.splice(this.table.indexOf(w), 1);
            this.table.splice(this.table.indexOf(bot), 1, w);
            w.watch = false;
            out.push({ who: w, bot });
        }
        return out;
    },

    seatedText({ who, bot }) {
        return bot ? `${who.name} se sienta en el sitio de ${bot.name}, que se levanta de la mesa.` : `${who.name} se ha sentado a la mesa.`;
    },

    hostClose(conn, bye = false) {
        if (this.role !== 'host') return;
        const i = this.table.findIndex(s => s.conn === conn);
        if (i < 0) return;
        const entry = this.table[i];
        const match = this.app.match;
        if (this.waiting) {
            // De la sala de espera se sale sin más: la nave empieza otra vez sin esa persona.
            this.table.splice(i, 1);
            const sat = this.seatWatchers().map(x => this.seatedText(x));
            if (match.seats.some(s => s.conn === conn)) this.refreshWaiting([`${entry.name} se ha ido de la sala.`, ...sat].join(' '));
            return;
        }
        const seat = this.playing ? match.seats.findIndex(s => s.conn === conn && s.kind === 'remote') : -1;
        if (seat >= 0) {
            // En plena partida: juega la máquina por esa persona y le guardamos el sitio por si vuelve.
            entry.conn = null;
            if (bye) this.table.splice(i, 1); else entry.away = true;
            match.seatLeft(seat);
            if (!bye) this.watchAlone();
            return;
        }
        if (!bye) this.watchAlone();
        this.table.splice(i, 1);
        if (this.playing) return;
        UI.say([`${entry.name} se ha ido de la sala.`, ...this.seatWatchers().map(x => this.seatedText(x))].join(' '), { interrupt: false });
        this.broadcastLobby();
        this.renderLobby();
    },

    lobbyMessage() {
        return {
            t: 'lobby', code: this.code, base: this.base, game: this.game, rules: { ...this.rules }, playing: this.playing,
            players: this.table.filter(s => !s.away).map(s => ({ name: s.name, kind: s.kind === 'me' ? 'host' : s.kind, watch: !!s.watch, ...this.lookOf(s) })),
        };
    },

    // ── El color y el gorro (El Impostor) ─────────────
    /** Los tuyos, de tus ajustes. */
    myLook() { return { color: this.app.settings.impostorColor ?? null, hat: this.app.settings.impostorHat || 0 }; },
    /** Lo que manda un invitado, sin nada raro. */
    cleanLook(l) {
        const c = l?.color, h = l?.hat;
        return { color: Number.isInteger(c) && c >= 0 && c < IMPOSTOR_COLORS.length ? c : null, hat: Number.isInteger(h) && h >= 0 && h < IMPOSTOR_HATS.length ? h : 0 };
    },
    lookOf(s) { return s.look ? { color: s.look.color, hat: s.look.hat } : {}; },
    /** Anfitrión: alguien ha cambiado de color en la sala de espera de la nave (seat: su sitio en la partida). */
    lookTaken(seat, look) {
        const e = this.entryOf(seat);
        if (e) e.look = this.cleanLook(look);
    },
    /** La persona (o el rival de la máquina) de la sala que tiene un sitio de la partida. */
    entryOf(seat) {
        if (!seat) return null;
        if (seat.kind === 'me') return this.table.find(s => s.kind === 'me');
        if (seat.kind === 'bot') return this.table.find(s => s.kind === 'bot' && s.char?.id === seat.char?.id);
        return this.table.find(s => s.kind === 'remote' && (seat.cid ? s.cid === seat.cid : s.conn === seat.conn));
    },
    /** Anfitrión: alguien cambia de color o de gorro en la sala. */
    takeLook(entry, m) {
        if (!entry) return;
        entry.look = this.cleanLook(m);
        if (this.playing) return;
        this.broadcastLobby();
        this.renderLobby();
    },
    /** En la sala de El Impostor: elige tu color y tu gorro. Los colores que ya tiene otro se dicen; si pides uno, se lo queda quien está antes. */
    async pickLook() {
        const s = this.app.settings, ps = this.playersOf();
        const taken = new Map(ps.filter(p => !p.me && p.color != null).map(p => [p.color, { name: p.name, person: p.kind !== 'bot' }]));
        const look = await impostorLookDialog(this.app, { taken, random: true, color: s.impostorColor, hat: s.impostorHat || 0 });
        if (!look) return;
        s.impostorColor = look.color;
        s.impostorHat = look.hat;
        this.app.save();
        UI.say(`Tu color: ${look.color == null ? 'al azar' : `${IMPOSTOR_COLORS[look.color].name}, con la nota ${IMP_NOTE_NAMES[look.color]}`}${look.hat ? `, y ${IMPOSTOR_HATS[look.hat]}` : ''}.`);
        if (this.role === 'host') { const me = this.table.find(x => x.kind === 'me'); if (me) this.takeLook(me, look); }
        else this.net?.send({ t: 'look', ...look });
    },

    sendLobby(entry) {
        const list = this.table.filter(s => !s.away);
        if (entry.conn) this.net?.send(entry.conn, { ...this.lobbyMessage(), you: list.indexOf(entry) });
    },

    /** Manda la sala a todos, si no se está jugando (a los que juegan o miran no se les interrumpe). */
    broadcastLobby() {
        this.backupSoon();
        if (this.playing) return;
        for (const s of this.table) if (s.kind === 'remote' && s.conn) this.sendLobby(s);
    },

    /** A todos los que están en la partida, jugando o mirando. */
    broadcastAll(msg, except = null) {
        for (const s of this.table) if (s.kind === 'remote' && s.conn && s.conn !== except && (!s.watch || s.viewing)) this.net?.send(s.conn, msg);
    },

    setGame(id) {
        if (!GAMES[id] || GAMES[id].online === false) return;
        this.game = id;
        this.app.settings.game = id;
        this.app.save();
        const sat = this.seatWatchers();
        if (sat.length) UI.say(sat.map(x => this.seatedText(x)).join(' '), { interrupt: false });
        this.broadcastLobby();
        this.renderLobby();
    },

    addBot() {
        if (this.seated().length >= this.G.maxPlayers) { this.app.audio.error(); UI.say(`La mesa está llena: caben ${this.G.maxPlayers} jugadores.`); return; }
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
        UI.say([`${cap(s.name)} se levanta de la mesa.`, ...this.seatWatchers().map(x => this.seatedText(x))].join(' '));
        this.broadcastLobby();
        this.renderLobby();
    },

    /** Cambia a todos de sitio al azar (en la Brisca por parejas, así cambian las parejas). */
    shuffleSeats() {
        if (this.seated().length < 3) { this.app.audio.error(); UI.say('Hacen falta al menos tres jugadores para cambiar de sitio.'); return; }
        const rng = this.rng ||= makeRng(Date.now());
        this.table = [...rng.shuffle(this.seated()), ...this.watchers()];
        this.app.audio.shuffle();
        UI.say(`Nuevos sitios: ${this.playersText()}.${this.pairsText() ? ' ' + this.pairsText() : ''}`);
        this.broadcastLobby();
        this.renderLobby();
    },

    /** Empezar: en El Impostor, primero la sala de espera de la nave; si ya estáis en ella, la partida. */
    start() { return this.begin(this.waitRoom && !this.waiting); },

    /** Desde la sala de espera de la nave: empieza la partida. */
    startGame() {
        if (!this.waiting) return;
        this.syncLooks();
        this.begin(false);
    },

    /** Lo que llevaba cada uno en la sala de espera (los de la máquina, también): color, gorro y dónde estaba. */
    syncLooks() {
        const m = this.app.match;
        if (!m?.lobby) return;
        m.seats.forEach((seat, p) => {
            const e = this.entryOf(seat), pl = m.game.players[p];
            if (!e || !pl) return;
            e.look = { color: pl.color, hat: pl.hat };
            e.at = { x: pl.x, y: pl.y };
        });
    },

    /** Alguien entra o se va de la sala de espera: la nave empieza otra vez con quien hay, cada uno donde estaba. */
    refreshWaiting(note) {
        this.syncLooks();
        this.begin(true, note);
    },

    /** lobby: a la sala de espera de la nave (note: lo que se dice a quien ya estaba en ella). */
    begin(lobby = false, note = null) {
        const was = this.waiting;
        this.table = this.table.filter(s => !s.away);
        // Quien miraba la partida anterior se sienta, si hay sitio o un rival de la máquina.
        this.seatWatchers();
        const table = this.seated();
        if (!was) for (const s of this.table) delete s.at;
        // En la sala de espera puedes estar solo, esperando a tus amigos.
        if (table.length < (lobby ? 1 : 2)) {
            this.app.audio.error();
            UI.say('Necesitas al menos otro jugador: espera a tus amigos o añade un rival de la máquina.');
            return;
        }
        if (table.length > this.G.maxPlayers) { this.app.audio.error(); UI.say(`En ${this.G.name} caben ${this.G.maxPlayers} jugadores.`); return; }
        for (const s of this.table) s.viewing = false;
        const rules = { ...this.rules, ...(lobby ? { lobby: true } : {}) };
        const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
        const seats = table.map(s => ({ name: s.name, kind: s.kind, char: s.char, conn: s.conn, cid: s.cid, ...this.lookOf(s), ...(lobby && s.at ? { at: s.at } : {}) }));
        const me = table.findIndex(s => s.kind === 'me');
        this.gid = (this.gid || 0) + 1;
        this.seats = seats;
        this.startRules = rules;
        this.acks = new Map();
        this.seq = 0;
        // Quien ya estaba en la sala de espera solo oye quién ha entrado o se ha ido; quien llega, todo.
        this.startNote = lobby && was ? note : null;
        seats.forEach((s, i) => { if (s.kind === 'remote') this.sendStart(i, false, null, s.at ? this.startNote : null); });
        this.app.startOnline({ game: this.game, mode: 'host', seats, me, rules, seed, gid: this.gid, note: this.startNote });
        if (!lobby) for (const s of this.table) delete s.at;
        for (const w of this.watchers()) {
            if (this.lateJoin) this.sendWatch(w, false);
            else this.sendLobby(w);
        }
    },

    /** Le dice a un jugador que empieza la partida (o que vuelve a ella; took: ocupa el sitio de ese rival). */
    sendStart(i, rejoin = false, took = null, note = null) {
        const seats = this.app.match?.seats && rejoin ? this.app.match.seats : this.seats;
        const host = seats.findIndex(x => x.kind === 'me');
        this.net.send(seats[i].conn, {
            t: 'start', game: this.game, me: i, rules: this.app.match?.game?.rules && rejoin ? this.app.match.game.rules : this.startRules, gid: this.gid, host, rejoin, took, note, base: this.base,
            migrated: rejoin ? this.handover?.from || null : null,
            seats: seats.map((x, j) => ({ name: x.name, kind: j === i ? 'me' : (x.kind === 'bot' ? 'bot' : 'remote') })),
        });
    },

    /** Quien mira recibe la partida sin sitio (me: -1). sync: ya ha empezado, se le manda la mesa como está. */
    sendWatch(entry, sync) {
        const match = this.app.match;
        if (!entry.conn || !match) return;
        entry.viewing = true;
        const seats = match.seats;
        this.net.send(entry.conn, {
            t: 'start', game: this.game, me: -1, watch: true, rules: sync ? match.game.rules : this.startRules, gid: this.gid,
            host: seats.findIndex(x => x.kind === 'me'), rejoin: sync, base: this.base, migrated: sync ? this.handover?.from || null : null,
            seats: seats.map(x => ({ name: x.name, kind: x.kind === 'bot' ? 'bot' : 'remote' })),
        });
        if (sync) this.net.send(entry.conn, { t: 'batch', seq: this.seq, events: [], view: match.game.view(-1), sync: true });
    },

    /** A mitad de partida, quien mira ocupa el sitio p, que llevaba la máquina. */
    giveSeat(entry, p) {
        const match = this.app.match;
        if (!this.playing || !entry?.conn || !entry.watch || !this.table.includes(entry) || !match.freeSeats().includes(p)) return false;
        const s = match.seats[p], was = s.name;
        // En la sala, ocupa el sitio del rival (para la siguiente partida, el mismo orden).
        this.table.splice(this.table.indexOf(entry), 1);
        const bot = this.table.findIndex(e => e.kind === 'bot' && s.char && e.char?.id === s.char.id);
        if (bot >= 0) this.table.splice(bot, 1, entry);
        else this.table.splice(Math.min(p, this.table.length), 0, entry);
        entry.watch = false; entry.viewing = false;
        match.seatTaken(p, entry);
        this.sendStart(p, true, was);
        this.net.send(entry.conn, { t: 'batch', seq: this.seq, events: [], view: match.game.view(p), sync: true });
        return true;
    },

    restart() { this.app.match?.stop(); this.app.match = null; this.start(); },

    backToLobby() {
        this.app.match?.stop();
        this.app.match = null;
        Dialog.close(undefined, true);
        this.table = this.table.filter(s => !s.away);
        for (const s of this.table) s.viewing = false;
        this.seatWatchers();
        this.broadcastLobby();
        this.showLobby(true, false);
    },

    /** Manda a cada jugador lo que ha pasado (sin las cartas que no puede ver) y la mesa. */
    broadcast(match, events) {
        this.seq++;
        // La copia va con cada jugada (en El Impostor, que no para, una vez por segundo).
        if (match.kind === 'impostor') this.backupSoon(); else this.sendBackup();
        match.seats.forEach((s, i) => {
            if (s.kind === 'remote' && s.conn) this.net.send(s.conn, { t: 'batch', seq: this.seq, events: events.map(e => match.eventFor(e, i)).filter(Boolean), view: match.game.view(i) });
        });
        // Quien mira ve lo que ven todos: ninguna carta oculta.
        const watching = this.watchers().filter(s => s.conn && s.viewing);
        if (watching.length) {
            const msg = { t: 'batch', seq: this.seq, events: events.map(e => match.eventFor(e, -1)), view: match.game.view(-1) };
            for (const s of watching) this.net.send(s.conn, msg);
        }
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
        this.stopBeats();
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
        let net = this.net = this.clientNet();
        try {
            await net.connect(code, { onRetry: why => { if (this.net === net) this.app.joinStatus(why); } });
        } catch (e) {
            if (this.net !== net) return;   // ya habías cancelado
            // Puede que se fuera quien la llevaba y la sala siga en uno de sus códigos de reserva.
            const found = Net.kind(e) === 'peer-unavailable' ? await this.tryCodes(Net.roomCodes(code).slice(1), { wait: 12000 }).catch(() => null) : null;
            if (this.role !== 'client' || this.net !== net) { found?.net.close(); return; }
            if (!found) {
                this.reset();
                this.app.audio.error();
                this.app.joinStatus(Net.explain(e));
                return;
            }
            net = this.net = found.net;
            code = found.code;
        }
        if (this.net !== net) return;
        this.code = code;
        this.app.keepAwake(true);
        this.sayHello();
    },

    /** Invitado: saluda a quien lleva la sala (con tu identificador, para que te devuelva tu sitio). */
    sayHello() {
        this.heard();
        this.net?.send({ t: 'hello', name: this.app.settings.playerName, v: GAME_VERSION.id, id: clientId(), look: this.myLook() });
        this.startWatchdog();
    },

    /**
     * Invitado: prueba a entrar en una de estas salas a la vez (los códigos de una sala). La primera que contesta, vale.
     * Devuelve { net, code }; si no contesta ninguna, el fallo que más dice (la sala estaba pero no se unió, que no estaba…).
     */
    tryCodes(codes, opts = {}) {
        return new Promise((resolve, reject) => {
            const errs = [];
            let left = codes.length, done = false;
            const nets = codes.map(() => this.clientNet());
            nets.forEach((net, k) => net.once(codes[k], opts).then(() => {
                if (done) { net.close(); return; }
                done = true;
                for (const o of nets) if (o !== net) o.close();
                resolve({ net, code: codes[k] });
            }, e => {
                errs.push(e);
                if (--left || done) return;
                const kind = e2 => Net.kind(e2);
                reject(errs.find(x => kind(x) === 'ice') || errs.find(x => kind(x) === 'peer-unavailable') || errs[0]);
            }));
            if (!codes.length) reject({ type: 'peer-unavailable' });
        });
    },

    clientNet() {
        const net = new ClientNet({ onMessage: m => { if (this.net === net) this.clientMessage(m); }, onClose: () => { if (this.net === net) this.clientClosed(); } });
        return net;
    },

    clientMessage(m) {
        if (this.role !== 'client') return;
        this.heard();
        switch (m.t) {
            case 'ping': break;
            // La copia de la sala y de la partida: si se va quien la lleva, la llevas tú.
            case 'bk': {
                const p = this.bkParts?.id === m.id ? this.bkParts : (this.bkParts = { id: m.id, got: [], left: m.n });
                if (p.got[m.i] == null) { p.got[m.i] = String(m.d || ''); p.left--; }
                if (p.left > 0) break;
                this.bkParts = null;
                try { const b = JSON.parse(p.got.join('')); if (b.t === 'backup') this.backup = b; } catch (_) { /* copia rota: vale la anterior */ }
                break;
            }
            // Quien lleva la sala se va y se la pasa a alguien: si eres tú, la coges al momento.
            case 'handover': this.handoverTo = String(m.heir || ''); this.handoverFrom = m.from; break;
            case 'lobby': {
                this.dropWaiter();
                const first = !this.lobby;
                this.lobby = m;
                if (m.base) this.base = m.base;
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
                if (m.base) this.base = m.base;
                if (this.keepMatch(m)) break;
                this.dropWaiter();
                this.queue = [];
                this.hostSeat = m.host ?? 0;
                this.app.startOnline({ game: m.game, mode: 'client', seats: m.seats, me: m.me, rules: m.rules, online: this, gid: m.gid, rejoin: !!m.rejoin, hostSeat: this.hostSeat, watch: !!m.watch, took: m.took || null, note: m.note ? String(m.note).slice(0, 300) : null });
                break;
            }
            case 'closed': this.clientClosed(true); break;
            // La cuenta atrás de quien contesta en el Trivial: se enseña al momento, sin esperar a que se acabe de contar lo anterior.
            case 'clock': this.app.match?.clockFrom?.(m.p | 0, m); break;
            default:
                if (this._waiter) { const w = this._waiter; this._waiter = null; w(m); } else this.queue.push(m);
        }
    },

    /**
     * Invitado: ahora lleva la sala otra persona (se fue quien la llevaba) y tu partida es la misma:
     * se sigue en tu mesa como estaba, sin empezar otra vez. Lo que ha cambiado llega después (la mesa, con sync).
     */
    keepMatch(m) {
        const match = this.app.match;
        if (!m.migrated || !m.rejoin || !match || match.stopped || match.mode !== 'client') return false;
        if (match.gid !== m.gid || match.kind !== m.game || match.me !== (m.watch ? -1 : m.me)) return false;
        this.hostSeat = match.hostSeat = m.host ?? 0;
        m.seats.forEach((x, p) => { if (match.seats[p] && p !== match.me) match.seats[p].kind = x.kind === 'bot' ? 'bot' : 'remote'; });
        match.sentFor = -1;
        const host = match.seats[this.hostSeat]?.name || 'otra persona';
        match.notice(`${cap(String(m.migrated).slice(0, 40))} ya no lleva la sala: ahora la lleva ${host}, y la partida sigue.`);
        return true;
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
        if (!byHost && this.code && !this.reconnecting) {
            // Si quien la llevaba se ha ido pasándola, no se ha cortado nada: se entra sin decir nada en la sala que sigue.
            this.reconnect(this.handoverTo ? null : undefined);
            return;
        }
        const host = this.lobby?.players?.find(p => p.kind === 'host')?.name;
        this.reset();
        const m = this.app.match;
        if (m) { m.stop(); this.app.match = null; }
        Dialog.close(undefined, true);
        this.app.audio.error();
        this.app.showMenu(false, byHost ? `${host || 'Quien creó la sala'} ha cerrado la sala.` : 'Se ha perdido la conexión con la sala.');
    },

    /**
     * Invitado: se ha cortado la conexión con la sala. Se busca otra vez en sus códigos (si se fue quien la llevaba,
     * puede estar en uno de reserva). Si se ha ido y te toca a ti, la llevas tú: primero a quien entró antes;
     * el segundo, si el primero tampoco aparece.
     */
    async reconnect(note = 'Se ha cortado la conexión con la sala. Intentando volver a entrar.') {
        this.reconnecting = true;
        this.stopBeats();
        const codes = Net.roomCodes(this.base || this.code), t0 = Date.now();
        if (note) { this.app.audio.error(); this.say(note); }
        // kind: cómo falló el último intento; tried: cuándo empezó (si la sala se abrió después, no cuenta).
        let kind = null, tried = 0;
        for (let i = 0; this.role === 'client' && this.reconnecting && Date.now() - t0 < 120000; i++) {
            if (this.shouldTakeOver(tried, kind)) { await this.takeOver(); return; }
            tried = Date.now() - t0;
            try {
                const { net, code } = await this.tryCodes(codes, { wait: 6000, relay: i % 3 === 2 && Net.hasTurn() });
                if (this.role !== 'client' || !this.reconnecting) { net.close(); return; }
                this.net = net; this.code = code;
                this.sayHello();
                this.reconnecting = false;
                if (note) this.say('Conexión recuperada.');
                return;
            } catch (e) { kind = Net.kind(e); }
            if (this.role !== 'client' || !this.reconnecting) return;
            await new Promise(r => setTimeout(r, this.handoverTo ? 600 : 1500));
        }
        if (this.role !== 'client') return;
        this.reconnecting = 'failed';
        this.clientClosed(false);
    },

    say(t) { if (this.app.match && !this.app.match.stopped) this.app.match.notice(t); else UI.say(t, { interrupt: false }); },

    /**
     * ¿Te toca llevar la sala? Solo si tienes la copia y eres de los dos primeros en llevarla. Si te la han pasado,
     * al momento. Si no, cuando quien la llevaba no ha vuelto en HOST_WAIT (y llegas al servidor de salas: si eres tú
     * quien no tiene conexión, no). El segundo espera un poco más, por si aparece el primero.
     */
    shouldTakeOver(elapsed, kind) {
        if (!kind && !this.handoverTo) return false;
        const b = this.backup, rank = b?.heirs?.indexOf(clientId()) ?? -1;
        if (rank < 0 || rank > 1) return false;
        if (this.handoverTo) return this.handoverTo === clientId() || elapsed >= HOST_WAIT_NEXT * rank + 4000;
        return ['peer-unavailable', 'ice'].includes(kind) && elapsed >= HOST_WAIT + HOST_WAIT_NEXT * rank;
    },

    // ═══ Pasar la sala ═══════════════════════════════

    /** Anfitrión: quién llevaría la sala si te vas, por orden de llegada (quien mira, solo si no queda nadie jugando). */
    heirs() {
        const live = this.table.filter(s => s.kind === 'remote' && s.conn && !s.away);
        const by = (a, b) => (a.n ?? 999) - (b.n ?? 999);
        const seated = live.filter(s => !s.watch).sort(by);
        return seated.length ? seated : live.filter(s => s.watch).sort(by);
    },

    /** Lo que es igual en todos los navegadores y lo que se copia de la partida. */
    snapCtx() {
        return this._snapCtx ||= {
            classes: { PedroGame, BriscaGame, ParchisGame, TrivialGame, VirusGame, ImpostorGame, Bot, Memory, BriscaBot, ParchisBot, TrivialBot, VirusBot, ImpostorBot },
            externs: [['SHIP', SHIP], ['CHARACTERS', CHARACTERS], ['TRIVIAL_BANK', globalThis.TRIVIAL_BANK || {}], ['TRIVIAL_BOARD', TRIVIAL_BOARD], ['IMPOSTOR_TASKS', IMPOSTOR_TASKS],
                ['IMPOSTOR_ROLES', IMPOSTOR_ROLES], ['IMPOSTOR_COLORS', IMPOSTOR_COLORS], ['POWERS', POWERS], ['BOT_LEVELS', BOT_LEVELS], ['IMPOSTOR_LEVELS', IMPOSTOR_LEVELS]],
        };
    },

    /** Anfitrión: manda la copia a los dos primeros que llevarían la sala, como mucho una vez por segundo. */
    backupSoon() {
        if (this.role !== 'host' || this.backupT) return;
        const wait = Math.max(0, 1000 - (Date.now() - (this.backupAt || 0)));
        this.backupT = setTimeout(() => { this.backupT = null; this.sendBackup(); }, wait);
    },

    sendBackup() {
        if (this.role !== 'host' || !this.net) return;
        const heirs = this.heirs();
        if (!heirs.length) return;
        this.backupAt = Date.now();
        const m = this.app.match;
        let match = null;
        // Con la partida en marcha, también la partida (no la sala de espera de la nave: esa se empieza otra vez).
        if (this.playing && !this.waiting && m.game.phase !== 'idle') {
            const { data, lost } = Snapshot.encode({ game: m.game, bots: m.bots }, this.snapCtx());
            if (lost.length) console.warn('La copia de la partida no lleva:', lost);
            match = { seats: m.seats.map(s => ({ name: s.name, kind: s.kind, cid: s.cid || null, char: s.char || null, color: s.color, hat: s.hat, left: !!s.left })), host: m.me, seed: m.seed, snap: data };
        }
        const msg = {
            t: 'backup', heirs: heirs.map(h => h.cid), base: this.base, code: this.code, game: this.game, gid: this.gid, seq: this.seq, rules: this.startRules || null,
            table: this.table.map(e => ({ name: e.name, kind: e.kind, cid: e.cid || null, char: e.char || null, look: e.look || null, watch: !!e.watch, away: !!e.away, n: e.n ?? 999 })),
            match,
        };
        // Por la sala no pasan mensajes muy largos: la copia va en trozos.
        const text = JSON.stringify(msg), size = 12000, n = Math.ceil(text.length / size), id = (this.backupN = (this.backupN || 0) + 1);
        for (const h of heirs.slice(0, 2)) for (let i = 0; i < n; i++) this.net.send(h.conn, { t: 'bk', id, i, n, d: text.slice(i * size, (i + 1) * size) });
    },

    /** Anfitrión: te vas y pasas la sala a quien entró antes. Devuelve su nombre. */
    handOver() {
        if (this.role !== 'host') return null;
        const heir = this.heirs()[0];
        if (!heir) { this.close(); return null; }
        clearTimeout(this.backupT); this.backupT = null;
        this.sendBackup();
        const from = this.table.find(s => s.kind === 'me')?.name || 'Quien llevaba la sala';
        for (const s of this.table) if (s.kind === 'remote' && s.conn) this.net.send(s.conn, { t: 'handover', heir: heir.cid, from });
        const net = this.net;
        setTimeout(() => net?.close(), 800);
        this.app.keepAwake(false);
        this.reset();
        return heir.name;
    },

    /**
     * Invitado: se ha ido quien llevaba la sala y ahora la llevas tú. Se abre con el mismo código (o uno de
     * reserva, o uno nuevo, que se dice), con la gente de antes, y la partida sigue desde la copia.
     */
    async takeOver() {
        const b = this.backup, me = clientId(), old = this.app.match;
        const handed = this.handoverTo === me;
        this.reconnecting = false;
        this.handoverTo = null;
        this.backup = null;
        this.dropWaiter();
        this.queue = [];
        this.role = 'host';
        const net = this.net = this.hostNet();
        // Si te la ha pasado, su código queda libre en un momento: se espera un poco para seguir con el mismo.
        if (handed) await new Promise(r => setTimeout(r, 1500));
        let code;
        try { code = await net.open(Net.roomCodes(b.base || b.code)); } catch (e) {
            if (this.net !== net) return;
            old?.stop(); this.app.match = null; Dialog.close(undefined, true);
            const why = Net.explain(e);
            this.reset();
            this.app.audio.error();
            this.app.showMenu(false, `Se ha perdido la conexión con la sala. ${why}`);
            return;
        }
        if (this.net !== net) { net.close(); return; }
        const was = b.table.find(e => e.kind === 'me');
        this.code = code; this.base = b.base || b.code;
        this.game = b.game; this.gid = b.gid || 0; this.seq = b.seq || 0; this.startRules = b.rules;
        this.acks = new Map(); this.lobby = null;
        this.table = b.table.map(e => ({
            name: e.name, kind: e.cid === me ? 'me' : e.kind === 'bot' ? 'bot' : 'remote', char: e.char, cid: e.cid, look: e.look, watch: e.cid === me ? false : e.watch,
            // Los demás, hasta que vuelvan a entrar, como si se les hubiera cortado.
            away: e.kind !== 'bot' && e.cid !== me, conn: null, n: e.n,
        }));
        this.joinN = Math.max(0, ...this.table.map(e => e.n === 999 ? 0 : e.n || 0));
        this.handover = { from: was?.name || 'Quien llevaba la sala' };
        this.startBeats();
        const newCode = code !== b.code ? ` Ahora el código de la sala es ${this.codeSpoken()}: díselo a los demás por si no entran solos.` : '';
        const intro = `${cap(this.handover.from)} ${handed ? 'te ha pasado la sala' : 'se ha ido de la sala y ahora la llevas tú'}.${newCode}`;
        const seat = b.match ? b.match.seats.findIndex(s => s.cid === me) : -1;
        if (seat >= 0 && GAMES[b.game]) { this.resumeMatch(b, old, seat, intro); return; }
        // Sin partida (o mirabas): a la sala, donde los demás irán volviendo.
        old?.stop(); this.app.match = null; Dialog.close(undefined, true);
        this.showLobby(true, false, intro);
    },

    /** Sigue la partida desde la copia, en tu navegador: tu sitio es el tuyo y por quien llevaba la sala juega la máquina. */
    resumeMatch(b, old, me, intro) {
        const G = GAMES[b.game], snap = Snapshot.decode(b.match.snap, this.snapCtx());
        const gone = b.match.host;
        const seats = b.match.seats.map((s, p) => {
            if (p === me) return { ...s, kind: 'me', left: false };
            if (p === gone) return { ...s, kind: 'bot', left: true, char: absentChar(s.name) };
            return { ...s, conn: null };
        });
        old?.stop();
        this.app.match = null;
        Dialog.close(undefined, true);
        const m = new G.Match(this.app, { mode: 'host', seats, me, rules: snap.game.rules, seed: b.match.seed, online: this, restore: snap });
        m.gid = this.gid;
        m.migrated = intro;
        m.hostSeat = me;
        this.seats = m.seats;
        m.inherit?.(old);
        m.restored?.(gone);
        m.botTookOver?.(gone);
        this.app.runMatch(m);
        // Quien no vuelve a entrar en un rato, se ha ido: juega la máquina por esa persona.
        setTimeout(() => {
            if (this.app.match !== m || m.stopped) return;
            m.seats.forEach((s, p) => { if (s.kind === 'remote' && !s.conn) m.seatLeft(p); });
        }, 20000);
    },

    /**
     * Anfitrión: se te cortó la conexión y la sala ya la lleva otra persona (tu código lo tiene otro, o te has
     * quedado solo y la sala está en uno de reserva). Vuelves a entrar como invitado, a tu sitio.
     * net, code: la conexión con la sala nueva, si ya la tienes.
     */
    async displaced(net = null, code = null) {
        if (this.role !== 'host' || this.displacing) return;
        this.displacing = true;
        const mine = this.net, m = this.app.match;
        this.stopBeats();
        clearTimeout(this.aloneT);
        if (m) { m.stop(); this.app.match = null; }
        Dialog.close(undefined, true);
        const base = this.base, was = this.code;
        this.reset();
        try { mine?.close(); } catch (_) { /* nada */ }
        this.role = 'client'; this.base = base; this.code = code || was;
        const note = 'Se te cortó la conexión y ahora lleva la sala otra persona. Vuelves a entrar, a tu sitio.';
        if (net) { this.net = net; this.sayHello(); this.say(note); return; }
        await this.reconnect(note);
    },

    /** Anfitrión: se ha cortado alguien. Si te quedas sin nadie, puede que seas tú quien se ha cortado: se busca la sala en los códigos de reserva. */
    watchAlone() {
        clearTimeout(this.aloneT);
        let tries = 0;
        const probe = async () => {
            const alone = () => this.role === 'host' && !this.table.some(s => s.kind === 'remote' && s.conn);
            if (!alone()) return;
            const codes = Net.roomCodes(this.base).filter(c => c !== this.code);
            const found = await this.tryCodes(codes, { wait: 6000 }).catch(() => null);
            if (found && alone()) { this.displaced(found.net, found.code); return; }
            found?.net.close();
            if (++tries < 4 && alone()) this.aloneT = setTimeout(probe, 15000);
        };
        this.aloneT = setTimeout(probe, 15000);
    },

    /** Anfitrión: cada poco, a todos, que sigues ahí. Invitado: si no se oye nada en un rato, se ha cortado. */
    startBeats() {
        this.stopBeats();
        if (this.role === 'host') this.pingT = setInterval(() => { for (const s of this.table) if (s.kind === 'remote' && s.conn) this.net?.send(s.conn, { t: 'ping' }); }, HOST_PING);
    },
    startWatchdog() {
        clearInterval(this.dogT);
        this.dogT = setInterval(() => {
            if (this.role !== 'client' || this.reconnecting || !this.net || Date.now() - (this.lastHeard || 0) < HOST_SILENCE) return;
            const net = this.net;
            this.net = null;
            net.close();
            this.clientClosed(false);
        }, 1000);
    },
    stopBeats() { clearInterval(this.pingT); clearInterval(this.dogT); clearTimeout(this.backupT); clearTimeout(this.aloneT); this.pingT = this.dogT = this.backupT = this.aloneT = null; },
    heard() { this.lastHeard = Date.now(); },

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
        for (const id of ['lobby-share', 'lobby-addbot', 'lobby-delbot', 'lobby-shuffle', 'lobby-rules', 'lobby-start', 'lobby-listen', 'lobby-look', 'lobby-sound']) $(id).hidden = true;
        $('lobby-leave').textContent = 'Cancelar';
        UI.show('lobby', { intro: text, focus: 'lobby-leave' });
    },

    /** lead: lo que se dice antes (al coger la sala de quien se ha ido). */
    showLobby(host, first = true, lead = '') {
        this.renderLobby();
        const players = this.playersText();
        const G = host ? this.G : GAMES[this.lobby?.game] || GAMES.pedro;
        let intro;
        if (host) intro = first
            ? `Sala abierta. Tu código es ${this.codeSpoken()}. Díselo a tus amigos o comparte el enlace. Juego: ${G.name}. En la mesa: ${players}.`
            : `De vuelta en la sala. Juego: ${G.name}. En la mesa: ${players}. Puedes elegir otro juego.`;
        else {
            const hostName = this.lobby.players.find(p => p.kind === 'host')?.name || 'tu amigo';
            const mine = this.lobby.players[this.lobby.you];
            const wait = this.lobby.playing ? 'Están jugando una partida: entrarás en la siguiente.' : mine?.watch ? 'La mesa está llena: mirarás la partida y te sentarás si queda un sitio libre.' : 'Espera a que empiece la partida.';
            intro = first ? `Te has sentado en la mesa de ${hostName}. Juego: ${G.name}. En la mesa: ${players}. ${wait}` : `De vuelta en la sala. Juego: ${G.name}. En la mesa: ${players}.`;
        }
        if (lead) intro = `${lead} Los demás irán entrando. Juego: ${G.name}.`;
        UI.show('lobby', { intro, focus: host ? (first ? 'lobby-share' : 'lobby-start') : 'lobby-leave' });
    },

    playersOf() {
        if (this.role === 'host') return this.table.filter(s => !s.away).map(s => ({ name: s.name, kind: s.kind === 'me' ? 'host' : s.kind, me: s.kind === 'me', watch: !!s.watch, ...this.lookOf(s) }));
        return (this.lobby?.players || []).map((p, i) => ({ ...p, me: i === this.lobby.you }));
    },

    playersText() {
        const ps = this.playersOf(), seated = ps.filter(p => !p.watch), watching = ps.filter(p => p.watch);
        const text = Txt.list(seated.map(p => p.me ? 'tú' : p.kind === 'bot' ? `${p.name}, de la máquina` : p.name));
        if (!watching.length) return text;
        return `${text}. ${watching.length > 1 ? 'Miran' : 'Mira'} ${Txt.list(watching.map(p => p.me ? 'tú' : p.name))}`;
    },

    /** Por parejas (en la Brisca o el Parchís), quién va con quién (sitios alternos). */
    pairsText() {
        const id = this.role === 'host' ? this.game : this.lobby?.game;
        const rules = this.role === 'host' ? this.rules : this.lobby?.rules;
        const ps = this.playersOf().filter(p => !p.watch);
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
            : this.lobby?.playing ? `Estás en la sala de ${hostName}. Están jugando: entrarás en la siguiente partida.`
                : this.lobby?.players?.[this.lobby.you]?.watch ? `Estás en la sala de ${hostName}. La mesa está llena: mirarás la partida y te sentarás si queda un sitio libre.`
                    : `Estás en la sala de ${hostName}. Espera a que empiece la partida.`;
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
        // En El Impostor, cada uno con el color que ha pedido.
        const looks = G.id === 'impostor';
        this.playersOf().forEach((p, i) => {
            const li = document.createElement('li');
            const tag = p.me ? ' (tú)' : p.kind === 'bot' ? ', de la máquina' : p.kind === 'host' ? ', quien ha creado la sala' : '';
            const col = looks && p.color != null ? IMPOSTOR_COLORS[p.color] : null;
            li.innerHTML = `<span class="avatar" aria-hidden="true" data-c="${i % 6}"></span><span class="pl-name"></span>`;
            li.querySelector('.avatar').textContent = p.name.replace(/^la abuela /i, '').charAt(0).toUpperCase();
            if (col) { li.querySelector('.avatar').style.background = col.hex; li.querySelector('.avatar').style.color = '#0b1020'; }
            const look = looks && p.kind !== 'bot' ? `, ${col ? col.name : 'color al azar'}${p.hat ? `, con ${IMPOSTOR_HATS[p.hat]}` : ''}` : '';
            li.querySelector('.pl-name').textContent = `${p.name}${tag}${look}${p.watch ? ', mira la partida' : ''}`;
            ul.appendChild(li);
        });
        $('lobby-look').hidden = !looks;
        $('lobby-sound').hidden = !looks;
        $('lobby-pairs').textContent = this.pairsText();
        for (const id of ['lobby-share', 'lobby-addbot', 'lobby-delbot', 'lobby-shuffle', 'lobby-rules', 'lobby-start']) $(id).hidden = !host;
        const rules = host ? this.rules : this.lobby?.rules;
        $('lobby-rules-title').textContent = `Reglas de esta mesa: ${G.name}`;
        $('lobby-rules-text').textContent = rules ? G.summary(rules) : '';
        $('lobby-listen').hidden = host || !rules;
        $('lobby-start').querySelector('.lbl').textContent = G.waitRoom ? `Entrar en la sala de espera: ${G.name}` : `Empezar: ${G.name}`;
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
