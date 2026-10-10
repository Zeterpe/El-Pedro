/* =============================================
   EL PEDRO — app.js
   Arranque, ajustes guardados, menús, opciones,
   reglas de la casa, estadísticas y teclado.
   ============================================= */
'use strict';

const STORAGE_KEY = 'elpedro.v1';

const DEFAULT_SETTINGS = {
    settingsVersion: 1,
    firstRun: true,
    output: 'voz',            // voz: la del juego · sr: tu lector de pantalla
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
    burnWindow: 3,            // segundos para quemar (0 = hasta que pulses N)
    burnTicks: true,
    botSpeed: 'normal',
    rivals: 2,
    difficulty: 'mezcla',
    rules: { ...DEFAULT_RULES },
};

const DEFAULT_STATS = { games: 0, gamesWon: 0, rounds: 0, roundsWon: 0, bestWin: null };

function loadSaved() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) { raw = null; }
    const settings = { ...DEFAULT_SETTINGS, ...(raw?.settings || {}) };
    settings.rules = { ...DEFAULT_RULES, ...(raw?.settings?.rules || {}) };
    const stats = { ...DEFAULT_STATS, ...(raw?.stats || {}) };
    return { settings, stats };
}

const App = {
    settings: null, stats: null, speech: null, audio: null,
    match: null,
    timeScale: 1,
    started: false,

    init() {
        const saved = loadSaved();
        this.settings = saved.settings;
        this.stats = saved.stats;
        Txt.settings = this.settings;
        this.speech = new Speech(this.settings);
        this.audio = new AudioEngine(this.settings);
        UI.init({ speech: this.speech, audio: this.audio, settings: this.settings });
        $('version').textContent = `Versión del ${GAME_VERSION.spoken}`;
        this.bindMenus();
        this.bindKeys();
        this.bindGameButtons();
        window.Pedro = { debug: this.debugApi() };
        // El sonido solo puede empezar tras un toque o una tecla.
        const unlock = () => { this.audio.unlock(); this.speech.unlock(); };
        for (const ev of ['touchend', 'click', 'keydown']) document.addEventListener(ev, unlock, { capture: true });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.audio.resume(); });
        $('btn-start').addEventListener('click', () => this.start());
        UI.focus($('btn-start'), { silent: true });
    },

    save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: this.settings, stats: this.stats })); } catch (_) { /* sin almacenamiento */ }
    },

    async start() {
        if (this.started) return;
        this.started = true;
        this.audio.unlock(); this.speech.unlock();
        if (this.settings.firstRun) {
            UI.show('menu', { silent: true });
            const sr = await Dialog.open({
                title: 'Bienvenida a El Pedro',
                text: 'Un juego de cartas de memoria con baraja española. Antes de empezar: ¿usas un lector de pantalla, como NVDA, JAWS, VoiceOver o TalkBack?',
                items: [
                    { label: 'No: que hable el juego', value: 'voz' },
                    { label: 'Sí: uso lector de pantalla', value: 'sr' },
                ],
            });
            this.settings.output = sr || 'voz';
            this.settings.firstRun = false;
            this.save();
            const how = this.settings.output === 'sr'
                ? 'Perfecto: el juego te hablará a través de tu lector de pantalla. Puedes cambiarlo en Opciones.'
                : 'Perfecto: el juego te hablará con su voz. Usa auriculares para oír por dónde suena cada jugador.';
            if (UI.current === 'menu' && !this.match) this.showMenu(true, how);
        } else this.showMenu(true);
    },

    showMenu(welcome = false, before = '') {
        const intro = welcome ? 'El Pedro. Menú principal. Muévete con las flechas y elige con Enter.' : 'Menú principal.';
        UI.show('menu', { intro: before ? before + ' ' + intro : intro });
    },

    // ── Menús ─────────────────────────────────────────
    bindMenus() {
        document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => this.menuAction(b.dataset.act)));
        document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => UI.back()));
        UI.backHandlers = {
            setup: () => this.showMenu(),
            options: () => this.showMenu(),
            house: () => this.openSetup(true),
            rules: () => this.showMenu(),
            stats: () => this.showMenu(),
        };
        $('btn-go').addEventListener('click', () => this.startMatch({}));
        $('btn-rules-listen').addEventListener('click', () => this.readRules());
        $('btn-suits').addEventListener('click', () => this.suitsDemo());
        $('btn-practice').addEventListener('click', () => this.startPractice());
    },

    menuAction(act) {
        UI.audio.select();
        if (act === 'play') this.openSetup();
        else if (act === 'practice') this.startPractice();
        else if (act === 'rules') UI.show('rules', { intro: 'Cómo se juega. Puedes escuchar las reglas, oír cómo suena cada palo o jugar una partida de práctica.' });
        else if (act === 'options') this.openOptions();
        else if (act === 'stats') this.openStats();
    },

    openSetup(back = false) {
        const s = this.settings;
        const defs = [
            { label: 'Rivales', values: [1, 2, 3], get: () => s.rivals, set: v => { s.rivals = v; }, text: v => v === 1 ? '1 rival' : `${v} rivales` },
            {
                label: 'Dificultad', values: ['facil', 'normal', 'dificil', 'mezcla'], get: () => s.difficulty, set: v => { s.difficulty = v; },
                text: v => ({ facil: 'fácil', normal: 'normal', dificil: 'difícil', mezcla: 'de todo un poco' })[v],
            },
            {
                label: 'Rondas para ganar', values: [1, 3, 5, 0], get: () => s.rules.winsToWin, set: v => { s.rules.winsToWin = v; },
                text: v => v === 0 ? 'sin límite' : v === 1 ? '1 ronda' : `${v} rondas`,
            },
            { label: 'Ayuda de memoria', values: [false, true], get: () => s.memoryHelp, set: v => { s.memoryHelp = v; }, text: v => v ? 'sí, recordarme las cartas que he visto' : 'no' },
            { label: 'Reglas de la casa', action: () => this.openHouse() },
        ];
        OptionList.render($('setup-list'), defs, () => this.save());
        UI.show('setup', { intro: back ? 'Nueva partida.' : 'Nueva partida. Elige con las flechas: izquierda y derecha cambian cada opción.', focus: back ? 'btn-go' : null });
    },

    openHouse() {
        const r = this.settings.rules;
        const yes = v => v ? 'sí' : 'no';
        const defs = [
            { label: 'Baraja', values: [48, 40], get: () => r.deck, set: v => { r.deck = v; }, text: v => v === 48 ? 'del 1 al 12, 48 cartas' : 'sin ochos ni nueves, 40 cartas' },
            { label: 'Cartas para cada jugador', values: [4, 5, 6], get: () => r.handSize, set: v => { r.handSize = v; r.peekStart = Math.min(r.peekStart, v); } },
            { label: 'Cartas que miras al empezar', values: [0, 1, 2, 3], get: () => r.peekStart, set: v => { r.peekStart = Math.min(v, r.handSize); } },
            { label: 'Poderes de las figuras', values: [true, false], get: () => r.powers, set: v => { r.powers = v; }, text: v => v ? 'sí: la sota cambia, el caballo mira y el rey hace las dos cosas' : 'no' },
            { label: 'Quemar cartas', values: [true, false], get: () => r.burn, set: v => { r.burn = v; }, text: yes },
            { label: 'Quemar cartas de los demás', values: [true, false], get: () => r.burnOthers, set: v => { r.burnOthers = v; }, text: yes },
            { label: 'Al quemar la carta de otro, le das una tuya', values: [true, false], get: () => r.burnGive, set: v => { r.burnGive = v; }, text: yes },
            { label: 'Cartas de castigo por quemar mal', values: [1, 2], get: () => r.penaltyCards, set: v => { r.penaltyCards = v; } },
            { label: 'Las cartas de quien canta Pedro no se tocan', values: [true, false], get: () => r.protectCaller, set: v => { r.protectCaller = v; }, text: yes },
            { label: 'Se puede coger la carta de la mesa', values: [false, true], get: () => r.takeFromTable, set: v => { r.takeFromTable = v; }, text: yes },
            { label: 'Si todas tus cartas son del mismo número, valen 1 punto', values: [true, false], get: () => r.allEqualOne, set: v => { r.allEqualOne = v; }, text: yes },
            { label: 'Volver a las reglas de siempre', action: () => { this.settings.rules = { ...DEFAULT_RULES, winsToWin: r.winsToWin }; this.save(); this.speech.say('Reglas de siempre.'); this.openHouse(); } },
        ];
        OptionList.render($('house-list'), defs, () => this.save());
        UI.show('house', { intro: 'Reglas de la casa. Cada grupo juega un poco distinto: ajústalas a las vuestras.' });
    },

    openOptions() {
        const s = this.settings;
        const voices = () => ['', ...this.speech.spanishVoices.map(v => v.voiceURI)];
        const defs = [
            {
                label: 'Cómo te habla el juego', values: ['voz', 'sr'], get: () => s.output, set: v => { s.output = v; },
                text: v => v === 'voz' ? 'con la voz del juego' : 'con tu lector de pantalla',
            },
            { label: 'Velocidad de la voz', values: [0.8, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5, 3], get: () => s.speechRate, set: v => { s.speechRate = v; }, text: v => Txt.number(v) },
            {
                label: 'Voz', get: () => s.voiceURI, set: v => { s.voiceURI = v; }, wrap: true,
                get values() { return voices(); },
                text: v => v ? (App.speech.spanishVoices.find(x => x.voiceURI === v)?.name || v) : 'la del sistema',
            },
            { label: 'Volumen de los sonidos', values: [0, 0.2, 0.4, 0.6, 0.8, 1], get: () => s.sfxVolume, set: v => { s.sfxVolume = v; this.audio.applySettings(); }, text: v => `${Math.round(v * 100)} por ciento`, preview: () => this.audio.card({ suit: 'copas', rank: 5 }) },
            { label: 'Sonido en mono, para un solo auricular', values: [false, true], get: () => s.mono, set: v => { s.mono = v; this.audio.applySettings(); }, text: v => v ? 'sí' : 'no' },
            { label: 'Anuncios', values: ['normal', 'breve'], get: () => s.verbosity, set: v => { s.verbosity = v; }, text: v => v === 'normal' ? 'completos' : 'breves' },
            { label: 'Decir cuánto valen las figuras', values: [true, false], get: () => s.figureValues, set: v => { s.figureValues = v; }, text: v => v ? 'sí' : 'no' },
            { label: 'Tiempo para quemar', values: [2, 3, 4, 6, 8, 0], get: () => s.burnWindow, set: v => { s.burnWindow = v; }, text: v => v === 0 ? 'sin límite: sigo con la tecla N' : `${v} segundos` },
            { label: 'Tictac mientras se puede quemar', values: [true, false], get: () => s.burnTicks, set: v => { s.burnTicks = v; }, text: v => v ? 'sí' : 'no' },
            { label: 'Velocidad de los rivales', values: ['lenta', 'normal', 'rapida'], get: () => s.botSpeed, set: v => { s.botSpeed = v; }, text: v => ({ lenta: 'lenta', normal: 'normal', rapida: 'rápida' })[v] },
            { label: 'Comentarios de los rivales', values: [true, false], get: () => s.quips, set: v => { s.quips = v; }, text: v => v ? 'sí' : 'no' },
            { label: 'Pistas', values: [true, false], get: () => s.hints, set: v => { s.hints = v; }, text: v => v ? 'sí' : 'no' },
            { label: 'Probar la voz', action: () => this.speech.say(`Esta es la voz del juego: ${this.speech.voiceName()}. Has robado el rey de copas, que vale 12.`, { interrupt: true }) },
        ];
        OptionList.render($('options-list'), defs, () => this.save());
        UI.show('options', { intro: 'Opciones. Izquierda y derecha cambian cada opción.' });
    },

    openStats() {
        const st = this.stats;
        const pct = (a, b) => b ? Math.round(a / b * 100) + ' por ciento' : 'nada todavía';
        const lines = [
            `Partidas jugadas: ${st.games}. Ganadas: ${st.gamesWon}.`,
            `Rondas jugadas: ${st.rounds}. Ganadas: ${st.roundsWon}, el ${pct(st.roundsWon, st.rounds)}.`,
            st.bestWin != null ? `Tu mejor ronda ganada: ${Txt.points(st.bestWin)}.` : 'Aún no has ganado ninguna ronda.',
        ];
        $('stats-text').innerHTML = lines.map(l => `<p>${l}</p>`).join('');
        UI.show('stats', { intro: 'Estadísticas. ' + lines.join(' ') });
    },

    readRules() {
        const parts = [...document.querySelectorAll('#rules-text p, #rules-text li')].map(el => el.textContent);
        this.speech.say(parts.join(' '), { interrupt: true });
    },

    async suitsDemo() {
        this.speech.cancel();
        const s = ['Oros suenan a monedas.', 'Copas, a cristal.', 'Espadas, a metal.', 'Bastos, a madera.'];
        const suits = ['oros', 'copas', 'espadas', 'bastos'];
        for (let i = 0; i < 4; i++) {
            await this.speech.say(s[i], { interrupt: false });
            this.audio.card({ suit: suits[i], rank: 5 });
            await new Promise(r => setTimeout(r, 1100));
        }
        await this.speech.say('Y cuanto más alta es la carta, más agudo suena. Así suena el as de oros', { interrupt: false });
        this.audio.card({ suit: 'oros', rank: 1 });
        await new Promise(r => setTimeout(r, 900));
        await this.speech.say('y así el rey de oros.', { interrupt: false });
        this.audio.card({ suit: 'oros', rank: 12 });
    },

    // ── Partida ───────────────────────────────────────
    startPractice() {
        const rng = makeRng(Date.now());
        const rivals = pickRivals(1, 'facil', rng);
        this.startMatch({ rivals, practice: true });
    },

    startMatch({ rivals = null, practice = false }) {
        if (this.match) this.match.stop();
        const s = this.settings;
        const rng = makeRng(Date.now());
        rivals = rivals || pickRivals(s.rivals, s.difficulty, rng);
        const rules = { ...s.rules };
        if (practice) rules.winsToWin = 1;
        const m = this.match = new Match(this, { rivals, rules, practice });
        UI.show('game', { silent: true, focus: 'my-hand' });
        m.run().catch(err => { console.error(err); this.speech.say('Ha habido un error en la partida. Vuelve al menú.'); });
    },

    leaveMatch() {
        if (this.match) { this.match.stop(); this.match = null; }
        Dialog.close(undefined, true);
        this.showMenu();
    },

    recordRound(score, won) {
        const st = this.stats;
        st.rounds++;
        if (won) { st.roundsWon++; st.bestWin = st.bestWin == null ? score : Math.min(st.bestWin, score); }
        this.save();
    },

    recordGame(won) {
        this.stats.games++;
        if (won) this.stats.gamesWon++;
        this.save();
    },

    // ── Teclado y botones ─────────────────────────────
    bindKeys() {
        document.addEventListener('keydown', e => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (!this.started) {
                if (e.key === 'Tab') return;
                e.preventDefault();
                this.start();
                return;
            }
            if (Dialog.active) { Dialog.onKey(e); return; }
            if (UI.current === 'game' && this.match) {
                if (this.match.onKey(e)) return;
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); UI.moveFocus(e.key === 'ArrowRight' ? 1 : -1, $('screen-game')); }
                return;
            }
            if (OptionList.onKey(e)) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); UI.moveFocus(1); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); UI.moveFocus(-1); return; }
            if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); UI.back(); }
        });
    },

    bindGameButtons() {
        const cmd = { 'act-draw': 'draw', 'act-call': 'call', 'act-take': 'take', 'act-discard': 'discard', 'act-burn': 'burn', 'act-pass': 'pass' };
        for (const [id, kind] of Object.entries(cmd)) $(id).addEventListener('click', () => this.match?.input(kind));
        $('act-info').addEventListener('click', () => this.match?.info());
        $('act-cards').addEventListener('click', () => this.match?.myCards());
        $('act-repeat').addEventListener('click', () => this.speech.say(this.speech.last || 'Nada que repetir.', { interrupt: true }));
        $('act-menu').addEventListener('click', () => this.match?.pause());
    },

    // ── Pruebas desde la consola ──────────────────────
    debugApi() {
        const app = this;
        return {
            get app() { return app; },
            get match() { return app.match; },
            get game() { return app.match?.game; },
            get settings() { return app.settings; },
            setTimeScale(x) { app.timeScale = x; },
            start: () => app.start(),
            play: opts => app.startMatch(opts || {}),
            practice: () => app.startPractice(),
        };
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
