/* =============================================
   EL PEDRO — app.js
   Arranque (cómo jugar, tu nombre), el salón con
   los juegos, el menú de cada juego, ajustes
   guardados, opciones, reglas de la casa,
   estadísticas, partidas y teclado.
   ============================================= */
'use strict';

const STORAGE_KEY = 'elpedro.v1';

const DEFAULT_SETTINGS = {
    settingsVersion: 2,
    firstRun: true,
    output: 'voz',            // voz: la del juego · sr: tu lector de pantalla · visual: sin voz
    playerName: '',
    speechRate: 1.3,
    speechVolume: 1,
    voiceURI: '',
    sfxVolume: 0.8,
    mono: false,
    verbosity: 'normal',      // normal · breve
    figureValues: true,       // decir cuánto valen la sota, el caballo y el rey
    hints: true,
    quips: true,              // comentarios de los rivales
    memoryHelp: false,        // el juego te recuerda las cartas que has visto
    botSpeed: 'normal',
    rivals: 2,                // El Pedro: rivales de la máquina
    difficulty: 'mezcla',
    rules: { ...DEFAULT_RULES },              // reglas de El Pedro
    game: 'pedro',            // el último juego elegido
    briscaRivals: 1,
    briscaRules: { ...BRISCA_DEFAULT_RULES },
    confirmPlay: true,        // Brisca, Parchís, Trivial y Virus: el primer toque dice la carta (la ficha o la respuesta) y el segundo la juega
    parchisRivals: 3,
    parchisRules: { ...PARCHIS_DEFAULT_RULES },
    trivialRivals: 2,
    trivialRules: { ...TRIVIAL_DEFAULT_RULES },
    virusRivals: 2,
    virusRules: { ...VIRUS_DEFAULT_RULES },
    cardSize: 'normal',       // normal · grande
    contrast: 'normal',       // normal · alto
};

const DEFAULT_GAME_STATS = { games: 0, gamesWon: 0, rounds: 0, roundsWon: 0, best: null, answered: 0, right: 0 };

function loadSaved() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) { raw = null; }
    const settings = { ...DEFAULT_SETTINGS, ...(raw?.settings || {}) };
    settings.rules = { ...DEFAULT_RULES, ...(raw?.settings?.rules || {}) };
    settings.briscaRules = { ...BRISCA_DEFAULT_RULES, ...(raw?.settings?.briscaRules || {}) };
    settings.parchisRules = { ...PARCHIS_DEFAULT_RULES, ...(raw?.settings?.parchisRules || {}) };
    settings.trivialRules = { ...TRIVIAL_DEFAULT_RULES, ...(raw?.settings?.trivialRules || {}) };
    settings.virusRules = { ...VIRUS_DEFAULT_RULES, ...(raw?.settings?.virusRules || {}) };
    if (!GAMES[settings.game]) settings.game = 'pedro';
    settings.settingsVersion = DEFAULT_SETTINGS.settingsVersion;
    // Las estadísticas eran solo de El Pedro: pasan a su juego.
    const old = raw?.stats || {};
    const stats = {};
    for (const id of GAME_IDS) stats[id] = { ...DEFAULT_GAME_STATS, ...(old[id] || {}) };
    if (typeof old.games === 'number') stats.pedro = { ...stats.pedro, games: old.games, gamesWon: old.gamesWon || 0, rounds: old.rounds || 0, roundsWon: old.roundsWon || 0, best: old.bestWin ?? null };
    return { settings, stats };
}

const App = {
    settings: null, stats: null, speech: null, audio: null,
    match: null,
    gameId: 'pedro',          // el juego del que estás viendo el menú
    timeScale: 1,
    started: false,

    init() {
        const saved = loadSaved();
        this.settings = saved.settings;
        this.stats = saved.stats;
        this.gameId = this.settings.game;
        Txt.settings = this.settings;
        this.speech = new Speech(this.settings);
        this.speech.override = 'voz';            // en la portada, por si no ves la pantalla
        this.audio = new AudioEngine(this.settings);
        UI.init({ speech: this.speech, audio: this.audio, settings: this.settings });
        Online.init(this);
        CardArt.installDefs();
        this.applyLook();
        $('version').textContent = `Versión del ${GAME_VERSION.spoken}`;
        $('splash-fan').innerHTML = CardArt.fan(SUITS.map(suit => ({ rank: 1, suit })), { spread: 16 });
        this.pendingRoom = (new URLSearchParams(location.search).get('sala') || '').replace(/\D/g, '').slice(0, 5) || null;
        this.checkUpdate();
        this.buildTiles();
        this.bindMenus();
        this.bindKeys();
        window.Pedro = { debug: this.debugApi() };
        // El sonido solo puede empezar tras un toque o una tecla.
        const unlock = () => { this.audio.unlock(); this.speech.unlock(); };
        for (const ev of ['touchend', 'click', 'keydown']) document.addEventListener(ev, unlock, { capture: true });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) return;
            this.audio.resume();
            if (this.wantAwake) this.keepAwake(true);
        });
        document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => this.chooseMode(b.dataset.mode)));
        if (this.pendingRoom) $('splash-room').textContent = `Te han invitado a la sala ${this.pendingRoom}. Elige cómo quieres jugar y entrarás.`;
        const last = document.querySelector(`[data-mode="${this.settings.output}"]`) || document.querySelector('[data-mode="voz"]');
        UI.focus(last, { silent: true });
    },

    /** Tamaño de las cartas y contraste. */
    applyLook() {
        document.body.dataset.cards = this.settings.cardSize;
        document.body.dataset.contrast = this.settings.contrast;
    },

    /** Si el navegador tiene guardada una versión vieja del juego, carga la nueva: con versiones distintas no se puede jugar en una sala. */
    checkUpdate() {
        if (!/^https?:$/.test(location.protocol)) return;
        fetch(`js/rules.js?u=${Date.now()}`, { cache: 'no-store' })
            .then(r => r.ok ? r.text() : '')
            .then(t => {
                const v = /id:\s*'(\w+)'/.exec(t)?.[1];
                if (v && v > GAME_VERSION.id && !this.match && !Online.role) this.reloadFor(v, this.pendingRoom);
            })
            .catch(() => { /* sin conexión: se sigue con esta versión */ });
    },

    /** Recarga la página con la versión v (y la sala, si ibas a unirte a una). Devuelve false si ya se intentó. */
    reloadFor(v, room = null) {
        let tried = null;
        try { tried = sessionStorage.getItem('elpedro.update'); } catch (_) { /* sin almacenamiento */ }
        if (tried === v) return false;   // ya se intentó: no se recarga una y otra vez
        try { sessionStorage.setItem('elpedro.update', v); } catch (_) { /* sin almacenamiento */ }
        const u = new URL(location.href);
        u.searchParams.set('v', v);   // otra dirección: el navegador no usa la copia guardada
        if (room) u.searchParams.set('sala', room);
        location.replace(u.href);
        return true;
    },

    save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: this.settings, stats: this.stats })); } catch (_) { /* sin almacenamiento */ }
    },

    /** La pantalla no se apaga mientras juegas o tienes una sala abierta (en el móvil, apagarla corta la conexión). */
    async keepAwake(on) {
        this.wantAwake = on;
        try {
            if (on && !this.wakeLock && navigator.wakeLock && !document.hidden) {
                this.wakeLock = await navigator.wakeLock.request('screen');
                this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
            } else if (!on && this.wakeLock) { await this.wakeLock.release(); this.wakeLock = null; }
        } catch (_) { /* el navegador no lo permite */ }
    },

    /** Primera tecla en la portada: se presenta en voz alta, por si no ves la pantalla. */
    splashIntro() {
        if (this.introSaid) return;
        this.introSaid = true;
        this.audio.unlock(); this.speech.unlock();
        this.speech.say('El Pedro, salón de juegos de cartas. Elige cómo quieres jugar. Pulsa Enter para jugar con la voz del juego. Con las flechas puedes elegir jugar con tu lector de pantalla, o sin voz, solo con la vista.');
    },

    /** Paso 1: cómo te habla el juego. */
    chooseMode(mode) {
        this.audio.unlock(); this.speech.unlock();
        this.started = true;
        this.speech.cancel();
        this.speech.override = null;
        this.settings.output = mode;
        this.settings.firstRun = false;
        this.save();
        this.audio.select();
        this.openName(true);
    },

    /** Paso 2: tu nombre (el que verán tus amigos en las salas). */
    openName(fromStart = false) {
        this.nameFromStart = fromStart;
        const input = $('name-input');
        input.value = this.settings.playerName || '';
        const how = fromStart ? { voz: 'Te hablará la voz del juego.', sr: 'Te hablará tu lector de pantalla.', visual: 'Jugarás sin voz.' }[this.settings.output] + ' ' : '';
        UI.show('name', { intro: `${how}¿Cómo te llamas? Escribe tu nombre y pulsa Enter.${input.value ? ' Ahora pone ' + input.value + '.' : ''}`, focus: 'name-input' });
    },

    saveName() {
        const name = Online.cleanName($('name-input').value);
        this.settings.playerName = name;
        this.save();
        this.audio.select();
        if (!this.nameFromStart) { this.speech.say(`Tu nombre es ${name}.`); this.openOptions(); return; }
        if (this.pendingRoom) {
            const code = this.pendingRoom;
            this.pendingRoom = null;
            this.openJoin(code);
            Online.join(code);
            return;
        }
        this.showMenu(true, `Hola, ${name}.`);
    },

    // ── El salón ──────────────────────────────────────
    buildTiles() {
        const box = $('game-tiles');
        box.innerHTML = '';
        for (const id of GAME_IDS) {
            const G = GAMES[id];
            const b = document.createElement('button');
            b.className = 'nav game-tile';
            b.dataset.game = id;
            b.innerHTML = `<span class="tile-art">${gameArt(G, 12)}</span><span class="tile-text"><span class="tile-kind"></span><strong class="tile-name"></strong><span class="tile-tag"></span><span class="tile-players"></span></span>`;
            b.querySelector('.tile-kind').textContent = G.kind;
            b.querySelector('.tile-name').textContent = G.name;
            b.querySelector('.tile-tag').textContent = G.tagline;
            b.querySelector('.tile-players').textContent = G.players;
            b.setAttribute('aria-label', `${G.name}. ${G.kind}. ${G.tagline} ${G.players}.`);
            b.addEventListener('click', () => { this.audio.select(); this.openGame(id); });
            box.appendChild(b);
        }
    },

    showMenu(welcome = false, before = '') {
        this.keepAwake(false);
        $('menu-hello').textContent = this.settings.playerName ? `Hola, ${this.settings.playerName}` : 'Hola';
        const intro = welcome
            ? `El salón. Elige juego: ${Txt.list(GAME_IDS.map(id => GAMES[id].name))}. O juega con amigos. Muévete con las flechas y elige con Enter.`
            : 'El salón.';
        const focus = document.querySelector(`#game-tiles [data-game="${this.gameId}"]`);
        UI.show('menu', { intro: before ? before + ' ' + intro : intro, focus });
    },

    /** El menú de un juego: jugar, practicar, cómo se juega y reglas de la casa. */
    openGame(id, focus = null) {
        const G = GAMES[id];
        this.gameId = id;
        this.settings.game = id;
        this.save();
        $('gm-title').textContent = G.name;
        $('gm-kind').textContent = G.kind;
        $('gm-tagline').textContent = G.tagline;
        $('gm-fan').innerHTML = gameArt(G, 14);
        document.body.dataset.menuGame = id;
        UI.show('gamemenu', { intro: `${G.name}. ${G.tagline}`, focus });
    },

    // ── Jugar con amigos ──────────────────────────────
    openFriends(message = '') {
        this.keepAwake(false);
        $('net-test').textContent = '';
        UI.show('friends', { intro: (message ? message + ' ' : '') + 'Jugar con amigos. Crea una sala y dales el código, o únete a la sala de un amigo. En la sala se elige a qué jugar, y podéis cambiar de juego sin salir.' });
    },

    openJoin(code = '') {
        $('join-code').value = code;
        $('join-status').textContent = '';
        UI.show('join', { intro: code ? `Uniéndote a la sala ${code.split('').join(', ')}.` : 'Escribe el código de 5 cifras que te ha dado tu amigo y pulsa Enter.', focus: 'join-code' });
    },

    joinStatus(text) {
        $('join-status').textContent = text;
        if (UI.current !== 'join') this.openJoin($('join-code').value);
        this.speech.say(text, { interrupt: true });
    },

    leaveLobby() {
        Online.close();
        this.openFriends();
    },

    async testConnection() {
        const out = $('net-test');
        out.textContent = 'Probando la conexión…';
        this.speech.say('Probando la conexión. Tarda unos segundos.', { interrupt: true });
        const r = await Net.diagnose();
        out.textContent = r.text;
        this.speech.say(r.text, { interrupt: true });
    },

    // ── Menús ─────────────────────────────────────────
    bindMenus() {
        document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => this.menuAction(b.dataset.act)));
        document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => UI.back()));
        UI.backHandlers = {
            gamemenu: () => this.showMenu(),
            setup: () => this.openGame(this.gameId, 'gm-play'),
            options: () => this.showMenu(),
            house: () => (this.houseBack || (() => this.openSetup(true)))(),
            rules: () => this.openGame(this.gameId, 'gm-rules'),
            stats: () => this.showMenu(),
            name: () => this.nameFromStart ? this.showMenu() : this.openOptions(),
            friends: () => this.showMenu(),
            join: () => { if (Online.role === 'client') Online.close(); this.openFriends(); },
            lobby: () => this.leaveLobby(),
        };
        $('name-go').addEventListener('click', () => this.saveName());
        $('gm-play').addEventListener('click', () => { this.audio.select(); this.houseBack = null; this.openSetup(); });
        $('gm-practice').addEventListener('click', () => this.startPractice(this.gameId));
        $('gm-rules').addEventListener('click', () => { this.audio.select(); this.openRules(this.gameId); });
        $('gm-house').addEventListener('click', () => { this.audio.select(); this.houseBack = () => this.openGame(this.gameId, 'gm-house'); this.openHouse(this.gameId); });
        $('btn-create').addEventListener('click', () => { this.audio.select(); Online.create(); });
        $('btn-join').addEventListener('click', () => { this.audio.select(); this.openJoin(); });
        $('btn-nettest').addEventListener('click', () => this.testConnection());
        $('join-go').addEventListener('click', () => Online.join($('join-code').value));
        $('lobby-share').addEventListener('click', () => Online.share());
        $('lobby-addbot').addEventListener('click', () => Online.addBot());
        $('lobby-delbot').addEventListener('click', () => Online.removeBot());
        $('lobby-shuffle').addEventListener('click', () => Online.shuffleSeats());
        $('lobby-rules').addEventListener('click', () => { this.houseBack = () => Online.showLobby(true); this.openHouse(Online.game); });
        $('lobby-start').addEventListener('click', () => Online.start());
        $('lobby-listen').addEventListener('click', () => this.speech.say($('lobby-rules-text').textContent, { interrupt: true }));
        $('lobby-leave').addEventListener('click', () => this.leaveLobby());
        // Con la voz del juego, se oye lo que escribes.
        for (const id of ['name-input', 'join-code']) {
            $(id).addEventListener('input', e => {
                if (!this.speech.useTTS) return;
                const v = e.target.value;
                if (e.inputType && e.inputType.startsWith('delete')) this.speech.say(v ? 'Borrado. Queda ' + v : 'Vacío', { interrupt: true });
                else if (v) this.speech.say(v.slice(-1), { interrupt: true });
            });
        }
        $('btn-go').addEventListener('click', () => this.startMatch({ game: this.gameId }));
        $('btn-rules-listen').addEventListener('click', () => this.readRules());
        $('btn-suits').addEventListener('click', () => this.suitsDemo());
        $('btn-practice').addEventListener('click', () => this.startPractice(this.gameId));
    },

    menuAction(act) {
        UI.audio.select();
        if (act === 'friends') this.openFriends();
        else if (act === 'options') this.openOptions();
        else if (act === 'stats') this.openStats();
    },

    rulesOf(id) { return this.settings[GAMES[id].rulesKey]; },

    openSetup(back = false) {
        const s = this.settings, id = this.gameId, G = GAMES[id], r = this.rulesOf(id);
        const key = G.rivalsKey;
        const max = G.maxPlayers - 1;
        const rivalText = v => {
            const base = v === 1 ? '1 rival' : `${v} rivales`;
            return G.pairs?.(r, v + 1) ? `${base}, por parejas` : base;
        };
        const defs = [
            { label: 'Rivales', values: Array.from({ length: max }, (_, i) => i + 1), get: () => s[key], set: v => { s[key] = v; }, text: rivalText },
            {
                label: G.rivalLevelLabel || 'Dificultad', values: ['facil', 'normal', 'dificil', 'mezcla'], get: () => s.difficulty, set: v => { s.difficulty = v; },
                text: v => ({ facil: 'fácil', normal: 'normal', dificil: 'difícil', mezcla: 'de todo un poco' })[v],
            },
            ...G.setupDefs(s, r),
            { label: 'Reglas de la casa', action: () => { this.houseBack = null; this.openHouse(id); } },
        ];
        $('setup-title').textContent = `${G.name}: nueva partida`;
        OptionList.render($('setup-list'), defs, () => this.save());
        UI.show('setup', { intro: back ? 'Nueva partida.' : `${G.name}: nueva partida. Elige con las flechas: izquierda y derecha cambian cada opción.`, focus: back ? 'btn-go' : null });
    },

    openHouse(id = this.gameId) {
        const G = GAMES[id];
        const r = this.rulesOf(id);
        const defs = [
            ...G.houseDefs(r),
            {
                label: 'Volver a las reglas de siempre', action: () => {
                    this.settings[G.rulesKey] = { ...G.defaults };
                    this.save(); this.houseChanged(); this.speech.say('Reglas de siempre.'); this.openHouse(id);
                },
            },
        ];
        $('house-title').textContent = `Reglas de la casa: ${G.name}`;
        OptionList.render($('house-list'), defs, () => { this.save(); this.houseChanged(); });
        UI.show('house', { intro: `Reglas de la casa de ${G.name}. Cada grupo juega un poco distinto: ajústalas a las vuestras.` });
    },

    /** En una sala, los demás ven al momento las reglas que cambia quien la ha creado. */
    houseChanged() { if (Online.role === 'host') Online.broadcastLobby(); },

    openRules(id) {
        const G = GAMES[id];
        $('rules-title').textContent = `Cómo se juega: ${G.name}`;
        $('rules-text').innerHTML = G.rulesHtml;
        $('btn-suits').hidden = !!G.art;   // los palos, solo en los juegos de cartas
        UI.show('rules', { intro: `Cómo se juega ${G.name}. Puedes escuchar las reglas, oír cómo suena cada palo o jugar una partida de práctica. Las reglas están debajo de los botones.` });
    },

    openOptions() {
        const s = this.settings;
        const voices = () => ['', ...this.speech.spanishVoices.map(v => v.voiceURI)];
        const defs = [
            {
                label: 'Cómo te habla el juego', values: ['voz', 'sr', 'visual'], get: () => s.output, set: v => { s.output = v; },
                text: v => ({ voz: 'con la voz del juego', sr: 'con tu lector de pantalla', visual: 'sin voz, solo en pantalla' })[v],
            },
            { label: `Tu nombre: ${s.playerName || 'sin nombre'}`, action: () => this.openName(false) },
            { label: 'Velocidad de la voz', values: [0.8, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5, 3], get: () => s.speechRate, set: v => { s.speechRate = v; }, text: v => Txt.number(v) },
            {
                label: 'Voz', get: () => s.voiceURI, set: v => { s.voiceURI = v; }, wrap: true,
                get values() { return voices(); },
                text: v => v ? (App.speech.spanishVoices.find(x => x.voiceURI === v)?.name || v) : 'la del sistema',
            },
            { label: 'Volumen de los sonidos', values: [0, 0.2, 0.4, 0.6, 0.8, 1], get: () => s.sfxVolume, set: v => { s.sfxVolume = v; this.audio.applySettings(); }, text: v => `${Math.round(v * 100)} por ciento`, preview: () => this.audio.card({ suit: 'copas', rank: 5 }) },
            { label: 'Sonido en mono, para un solo auricular', values: [false, true], get: () => s.mono, set: v => { s.mono = v; this.audio.applySettings(); }, text: yesNo },
            { label: 'Tamaño de las cartas', values: ['normal', 'grande'], get: () => s.cardSize, set: v => { s.cardSize = v; this.applyLook(); }, text: v => v === 'grande' ? 'grandes, para ver mejor' : 'normal' },
            { label: 'Contraste', values: ['normal', 'alto'], get: () => s.contrast, set: v => { s.contrast = v; this.applyLook(); }, text: v => v === 'alto' ? 'alto: números grandes en las cartas y bordes marcados' : 'normal' },
            { label: 'Anuncios', values: ['normal', 'breve'], get: () => s.verbosity, set: v => { s.verbosity = v; }, text: v => v === 'normal' ? 'completos' : 'breves' },
            { label: 'Decir cuánto valen las figuras en El Pedro', values: [true, false], get: () => s.figureValues, set: v => { s.figureValues = v; }, text: yesNo },
            { label: 'Brisca, Parchís, Trivial y Virus: tocar dos veces para jugar', values: [true, false], get: () => s.confirmPlay, set: v => { s.confirmPlay = v; }, text: v => v ? 'sí: el primer toque te dice la carta, adónde va la ficha, la respuesta o la jugada' : 'no: se juega al tocarla' },
            { label: 'Velocidad de los rivales', values: ['lenta', 'normal', 'rapida'], get: () => s.botSpeed, set: v => { s.botSpeed = v; }, text: v => ({ lenta: 'lenta', normal: 'normal', rapida: 'rápida' })[v] },
            { label: 'Comentarios de los rivales', values: [true, false], get: () => s.quips, set: v => { s.quips = v; }, text: yesNo },
            { label: 'Pistas', values: [true, false], get: () => s.hints, set: v => { s.hints = v; }, text: yesNo },
            { label: 'Probar la voz', action: () => this.speech.say(`Esta es la voz del juego: ${this.speech.voiceName()}. Has robado el rey de copas, que vale 12.`, { interrupt: true }) },
        ];
        OptionList.render($('options-list'), defs, () => this.save());
        UI.show('options', { intro: 'Opciones. Izquierda y derecha cambian cada opción.' });
    },

    openStats() {
        const pct = (a, b) => `, el ${Math.round(a / b * 100)} por ciento`;
        const html = [], spoken = [];
        for (const id of GAME_IDS) {
            const G = GAMES[id], st = this.stats[id], w = G.roundWord;
            const lines = [
                `Partidas jugadas: ${st.games}. Ganadas: ${st.gamesWon}${st.games ? pct(st.gamesWon, st.games) : ''}.`,
            ];
            // El Trivial cuenta también las preguntas.
            if (st.answered) lines.push(`Preguntas contestadas: ${st.answered}. Acertadas: ${st.right}${pct(st.right, st.answered)}.`);
            // El Parchís y el Trivial no tienen rondas ni manos: solo partidas.
            if (w) lines.push(
                st.rounds ? `${cap(w)}s jugadas: ${st.rounds}. Ganadas: ${st.roundsWon}${pct(st.roundsWon, st.rounds)}.` : `Aún no has jugado ninguna ${w}.`,
                id === 'virus' ? (st.rounds && !st.roundsWon ? `Aún no has ganado ninguna ${w}.` : '') : st.best == null ? (st.rounds ? `Aún no has ganado ninguna ${w}.` : '') : id === 'pedro' ? `Tu mejor ronda ganada: ${Txt.points(st.best)}.` : `Tu mejor mano: ${Txt.points(st.best)}.`,
            );
            html.push(`<section class="stat-card" data-game="${id}"><h2>${G.name}</h2>${lines.filter(Boolean).map(l => `<p>${l}</p>`).join('')}</section>`);
            spoken.push(`${G.name}. ${lines.filter(Boolean).join(' ')}`);
        }
        $('stats-text').innerHTML = html.join('');
        UI.show('stats', { intro: 'Estadísticas. ' + spoken.join(' ') });
    },

    readRules() {
        const parts = [...document.querySelectorAll('#rules-text h2, #rules-text p, #rules-text li')].map(el => el.textContent.trim() + (el.tagName === 'H2' ? '.' : ''));
        this.speech.say(parts.join(' '), { interrupt: true });
    },

    async suitsDemo() {
        this.speech.cancel();
        const s = ['Oros suenan a monedas.', 'Copas, a cristal.', 'Espadas, a metal.', 'Bastos, a madera.'];
        for (let i = 0; i < 4; i++) {
            await this.speech.say(s[i], { interrupt: false });
            this.audio.card({ suit: SUITS[i], rank: 5 });
            await new Promise(r => setTimeout(r, 1100));
        }
        await this.speech.say('Y cuanto más alta es la carta, más agudo suena. Así suena el as de oros', { interrupt: false });
        this.audio.card({ suit: 'oros', rank: 1 });
        await new Promise(r => setTimeout(r, 900));
        await this.speech.say('y así el rey de oros.', { interrupt: false });
        this.audio.card({ suit: 'oros', rank: 12 });
    },

    // ── Partida ───────────────────────────────────────
    startPractice(game = this.gameId) {
        const rng = makeRng(Date.now());
        const rivals = pickRivals(1, 'facil', rng);
        this.startMatch({ game, rivals, practice: true });
    },

    startMatch({ game = this.gameId, rivals = null, practice = false }) {
        if (this.match) this.match.stop();
        const s = this.settings, G = GAMES[game];
        this.gameId = game;
        const rng = makeRng(Date.now());
        rivals = rivals || pickRivals(s[G.rivalsKey], s.difficulty, rng);
        let rules = { ...this.rulesOf(game) };
        if (practice) rules = G.practice(rules);
        const seats = [{ name: s.playerName || 'Tú', kind: 'me' }, ...rivals.map(c => ({ name: c.name, kind: 'bot', char: c }))];
        this.runMatch(new G.Match(this, { seats, rules, practice }));
    },

    /** Partida en una sala: mode 'host' (la has creado) o 'client' (te has unido). */
    startOnline({ game, mode, seats, me, rules, seed, online = Online, gid = 0, rejoin = false, hostSeat = 0 }) {
        if (this.match) this.match.stop();
        Dialog.close(undefined, true);
        const G = GAMES[game] || GAMES.pedro;
        const m = new G.Match(this, { mode, seats, me, rules, seed, online });
        m.gid = gid;
        m.rejoin = rejoin;
        m.hostSeat = mode === 'host' ? me : hostSeat;
        this.runMatch(m);
        return m;
    },

    runMatch(m) {
        this.match = m;
        this.keepAwake(true);
        UI.show('game', { silent: true, focus: 'my-hand' });
        m.run().catch(err => { console.error(err); this.speech.say('Ha habido un error en la partida. Vuelve al salón.'); });
    },

    leaveMatch() {
        if (this.match) { this.match.stop(); this.match = null; }
        Dialog.close(undefined, true);
        if (Online.active) Online.close();
        this.showMenu();
    },

    recordRound(game, won, score) {
        const st = this.stats[game];
        if (!st) return;
        st.rounds++;
        if (won) {
            st.roundsWon++;
            // En El Pedro, la mejor ronda es la de menos puntos; en la Brisca, la de más.
            if (score != null) st.best = st.best == null ? score : game === 'pedro' ? Math.min(st.best, score) : Math.max(st.best, score);
        }
        this.save();
    },

    /** Trivial: una pregunta que has contestado tú. */
    recordAnswer(game, ok) {
        const st = this.stats[game];
        if (!st) return;
        st.answered = (st.answered || 0) + 1;
        if (ok) st.right = (st.right || 0) + 1;
        this.save();
    },

    recordGame(game, won) {
        const st = this.stats[game];
        if (!st) return;
        st.games++;
        if (won) st.gamesWon++;
        this.save();
    },

    // ── Teclado ───────────────────────────────────────
    bindKeys() {
        // Si el foco se pierde en la mesa (una carta que desaparece), vuelve a tus cartas,
        // para que el lector de pantalla siga en la mesa y le pase las teclas al juego.
        $('screen-game').addEventListener('focusout', () => setTimeout(() => {
            const f = UI.active();
            if (UI.current === 'game' && this.match && !Dialog.active && (!f || f === document.body)) UI.focus($('my-hand'), { silent: true });
        }, 0));
        // Con el campo invisible (VoiceOver), al tocar algo de la mesa el foco vuelve al campo, para que las teclas sigan llegando.
        $('screen-game').addEventListener('click', e => {
            const el = e.target.closest?.('button');
            if (!el || !UI.trapping) return;
            setTimeout(() => {
                if (UI.trapping && document.activeElement !== UI.keytrap) UI.focus(document.contains(el) ? el : $('my-hand'), { silent: true });
            }, 0);
        });
        document.addEventListener('keydown', e => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (!this.started) {
                // Portada: la primera tecla presenta el juego en voz alta; Enter elige.
                if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Tab') this.splashIntro();
                if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); UI.moveFocus(1); }
                if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); UI.moveFocus(-1); }
                return;
            }
            if (Dialog.active) { Dialog.onKey(e); return; }
            // Escribiendo: Enter confirma y Escape vuelve; el resto de teclas son para el texto.
            const typing = e.target && e.target !== UI.keytrap && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
            if (typing) {
                if (e.key === 'Enter') { e.preventDefault(); (e.target.id === 'name-input' ? $('name-go') : $('join-go')).click(); }
                else if (e.key === 'Escape') { e.preventDefault(); UI.back(); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); UI.moveFocus(1); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); UI.moveFocus(-1); }
                return;
            }
            if (UI.current === 'game' && this.match) {
                if (UI.trapping) {
                    // Una tecla que llega desde un botón de la mesa devuelve el foco al campo invisible.
                    if (e.target !== UI.keytrap && $('screen-game').contains(e.target)) UI.focus(e.target, { silent: true });
                    if (e.key === 'Tab') { e.preventDefault(); UI.moveFocus(e.shiftKey ? -1 : 1, $('screen-game')); return; }
                    const v = UI.active();
                    if (e.key === 'Enter' && v?.matches?.('button')) { e.preventDefault(); v.click(); return; }
                }
                if (this.match.onKey(e)) return;
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    UI.moveFocus(e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1, $('screen-game'));
                }
                return;
            }
            if (OptionList.onKey(e)) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); UI.moveFocus(1); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); UI.moveFocus(-1); return; }
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                // En el salón, las fichas de los juegos también se recorren de lado.
                if (document.activeElement?.classList.contains('game-tile')) { e.preventDefault(); UI.moveFocus(e.key === 'ArrowRight' ? 1 : -1); return; }
            }
            if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); UI.back(); }
        });
    },

    // ── Pruebas desde la consola ──────────────────────
    debugApi() {
        const app = this;
        return {
            get app() { return app; },
            get match() { return app.match; },
            get game() { return app.match?.game; },
            get settings() { return app.settings; },
            get online() { return Online; },
            setTimeScale(x) { app.timeScale = x; app.speech.timeScale = x; },
            chooseMode: m => app.chooseMode(m),
            play: opts => app.startMatch(opts || {}),
            brisca: opts => app.startMatch({ game: 'brisca', ...(opts || {}) }),
            parchis: opts => app.startMatch({ game: 'parchis', ...(opts || {}) }),
            trivial: opts => app.startMatch({ game: 'trivial', ...(opts || {}) }),
            virus: opts => app.startMatch({ game: 'virus', ...(opts || {}) }),
            practice: (game = 'pedro') => app.startPractice(game),
        };
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
