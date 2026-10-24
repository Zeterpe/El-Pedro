/* =============================================
   EL PEDRO — impostor.js
   Las reglas de El Impostor, sin pantalla ni sonido.
   Una nave vista desde arriba, con salas, pasillos y
   paredes, por la que todos andan a la vez y en
   tiempo real. La tripulación hace sus tareas y busca
   a los impostores; los impostores matan sin que los
   vean. Quien encuentra un cuerpo avisa, y en la
   reunión se habla y se vota a quién echar de la nave.

   Gana la tripulación si hace todas las tareas o echa
   a todos los impostores. Ganan los impostores si
   llegan a ser tantos como los tripulantes vivos, o si
   nadie arregla a tiempo el reactor o el oxígeno. Los
   impostores también sabotean (apagan las luces, cortan
   las comunicaciones, cierran puertas) y van por los
   conductos.
   La reunión tiene un tiempo para hablar y otro para
   votar; quien no vota a tiempo, salta el voto.
   En una sala, cada invitado anda en su navegador y
   manda dónde está (remoteMove); lo demás lo decide el
   anfitrión. ImpostorMirror es la nave tal como la ve
   un invitado: solo con quien tiene a la vista o al oído.
   Los muertos siguen como fantasmas: nadie los ve ni
   los oye, atraviesan las paredes y los tripulantes
   pueden acabar sus tareas.

   Las medidas van en metros: cada casilla mide uno.
   x crece hacia la derecha (este) e y hacia abajo
   (sur). El norte, arriba en la pantalla, es lo que
   tienes delante.
   Usa el azar con semilla de rules.js.
   ============================================= */
'use strict';

const IMPOSTOR_DEFAULT_RULES = {
    tasks: 3,                 // tareas de cada tripulante, de 2 a 5
    easyTasks: false,         // tareas fáciles: más margen y menos que hacer en cada una
    speed: 1,                 // velocidad al andar
    vision: 1,                // hasta dónde se ve y se oye a los demás
    impostors: 'auto',        // cuántos impostores: 'auto' (1, y 2 desde 7 jugadores), 0 (solo tareas), 1, 2 o 3
    killCooldown: 25,         // segundos de espera entre muerte y muerte
    killRange: 'medio',       // alcance para matar: corto, medio (normal), largo (un poco más) o muylargo (más)
    meetings: 1,              // reuniones de emergencia que puede pedir cada uno
    buttonWait: 15,           // segundos, al empezar y tras cada reunión, antes de poder pedir una
    confirmEjects: true,      // al echar a alguien, se dice si era impostor
    anonymousVotes: false,    // en la votación no se dice quién ha votado a quién
    sabotages: true,          // los impostores pueden apagar las luces, hacer que estalle el reactor, dejar la nave sin oxígeno, cortar las comunicaciones y cerrar puertas
    reactorTime: 45,          // segundos para arreglar el reactor o el oxígeno antes de que ganen los impostores
    vents: true,              // los impostores pueden ir por los conductos
    discussTime: 120,         // segundos para hablar en la reunión antes de votar (0: se vota al momento)
    voteTime: 60,             // segundos para votar; quien no vota a tiempo, salta el voto
    phrases: 'auto',          // las frases de la reunión: 'auto' (contra la máquina, sí; en una sala, no: habláis en la llamada), true o false
    barUpdates: 'siempre',    // la barra de tareas: 'siempre', 'reuniones' (se pone al día al empezar cada reunión) o 'nunca' (no se ve)
    mode: 'normal',           // el modo de juego: 'normal' o 'escondite' (el impostor se sabe y caza; la tripulación se esconde hasta que se acaba el tiempo)
    hideTime: 300,            // en el escondite, segundos que hay que aguantar (cada tarea hecha quita unos pocos)
    commonTasks: 1,           // de las tareas de cada uno, cuántas son comunes: las mismas, en el mismo sitio, para toda la tripulación
    longTasks: 1,             // y cuántas son largas: en dos sitios, con espera o de varias rondas; las demás son cortas
    visualTasks: true,        // tareas que se ven: quien te ve hacer el escáner, vaciar la basura o encender los escudos sabe que eres tripulante
    roleScientist: 0,         // papeles especiales: cuántos hay de cada uno (0, 1 o 2). Científico: mira las constantes vitales desde cualquier sitio
    roleEngineer: 0,          // ingeniero: va por los conductos
    roleNoisemaker: 0,        // ruidoso: al morir, suena una alarma desde su cuerpo
    roleAngel: 0,             // ángel de la guarda: de fantasma, protege a alguien un rato
    roleShapeshifter: 0,      // cambiaformas (impostor): se transforma en otro
    rolePhantom: 0,           // espectro (impostor): se vuelve invisible un rato
    dummies: false,           // práctica de impostor: los compañeros de la máquina son muñecos que pasean (ni avisan ni hacen tareas)
    lobby: false,             // la sala de espera de una sala: todos en el Comedor, con las puertas cerradas, sin papeles ni tareas (no es una regla de la casa: la pone la sala)
};

/**
 * Cuántos impostores hay con n jugadores: ninguno con menos de 4; como mucho 1 hasta 6, 2 hasta 8 y 3 con 9 o 10.
 * En el escondite, siempre uno, desde dos jugadores.
 */
function impostorsFor(n, r = 'auto', mode = 'normal') {
    if (mode === 'escondite') return n >= 2 ? 1 : 0;
    if (n < 4) return 0;
    const max = n <= 6 ? 1 : n <= 8 ? 2 : 3;
    const want = r === 'auto' || r == null ? (n >= 7 ? 2 : 1) : r | 0;
    return clampN(want, 0, max);
}

const IMPOSTOR_SPEED = 3.2;           // metros por segundo
const IMPOSTOR_RADIUS = 0.3;          // lo que ocupa cada jugador
const IMPOSTOR_VISION = 6;            // hasta dónde se ve; a los demás solo se les oye si se les ve, como en la pantalla
const IMPOSTOR_USE = 1.4;             // a qué distancia se puede usar una tarea
const IMPOSTOR_REPORT = 3;            // a qué distancia de un cuerpo se puede avisar (viéndolo)
const IMPOSTOR_BUTTON = 1.6;          // a qué distancia de la mesa del Comedor se pide una reunión
const IMPOSTOR_IMP_VISION = 1.3;      // los impostores ven un poco más lejos
const IMPOSTOR_KILL_RANGE = { corto: 1.2, medio: 1.8, largo: 2.6, muylargo: 3.4 };
const IMPOSTOR_SAY_MAX = 4;           // lo que puede decir cada uno en una reunión
const IMPOSTOR_VENT_USE = 1.2;        // a qué distancia de un conducto se puede entrar
const IMPOSTOR_CONSOLE = 1.6;         // a qué distancia de una consola o de un panel se usa
const IMPOSTOR_LIGHTS = 0.35;         // con las luces apagadas, la tripulación ve así de lejos (de lo normal)
const IMPOSTOR_SAB_COOLDOWN = 30;     // segundos entre sabotaje y sabotaje
const IMPOSTOR_DOORS_TIME = 10;       // segundos que se quedan cerradas las puertas
const IMPOSTOR_DOORS_COOLDOWN = 25;   // segundos antes de poder volver a cerrar puertas
const IMPOSTOR_CAMERA = 6;            // hasta dónde ve cada cámara
const IMPOSTOR_WATCH = 1.6;           // quien ha mirado las cámaras hace menos de esto, las sigue mirando (la mesa las pide cada segundo)
/** En el escondite: el impostor espera quieto al empezar; al final, sabe dónde está cada uno; cada tarea quita tiempo. */
const IMPOSTOR_HIDE = { start: 10, final: 60, task: 8, killCd: 8, ping: 4, danger: 14 };
/**
 * Los papeles especiales: de qué lado son, cuánto dura su poder (dur) y cuánto hay que esperar para volver a usarlo (cd).
 * El científico mira las constantes vitales; el ingeniero va por los conductos (dur: lo que puede estar dentro);
 * el ruidoso hace sonar una alarma al morir; el ángel, de fantasma, protege a alguien que tenga cerca (range);
 * el cambiaformas se transforma en otro y el espectro se vuelve invisible.
 */
const IMPOSTOR_ROLES = {
    scientist: { side: 'crew', rule: 'roleScientist', name: 'científico', dur: 10, cd: 15 },
    engineer: { side: 'crew', rule: 'roleEngineer', name: 'ingeniero', dur: 15, cd: 15 },
    noisemaker: { side: 'crew', rule: 'roleNoisemaker', name: 'ruidoso' },
    angel: { side: 'crew', rule: 'roleAngel', name: 'ángel de la guarda', dur: 10, cd: 30, range: 3 },
    shapeshifter: { side: 'impostor', rule: 'roleShapeshifter', name: 'cambiaformas', dur: 30, cd: 25 },
    phantom: { side: 'impostor', rule: 'rolePhantom', name: 'espectro', dur: 10, cd: 25 },
};
/** Los colores de los tripulantes: cada uno con su nota y sus pasos (en space-audio.js, por su número). */
const IMPOSTOR_COLORS = [
    { id: 'rojo', name: 'rojo', hex: '#e05656' },
    { id: 'azul', name: 'azul', hex: '#4f8fe0' },
    { id: 'verde', name: 'verde', hex: '#5cc46a' },
    { id: 'amarillo', name: 'amarillo', hex: '#f2c94c' },
    { id: 'naranja', name: 'naranja', hex: '#f08a3c' },
    { id: 'morado', name: 'morado', hex: '#a46fe0' },
    { id: 'rosa', name: 'rosa', hex: '#f07fbf' },
    { id: 'cian', name: 'cian', hex: '#45c9c9' },
    { id: 'blanco', name: 'blanco', hex: '#e8edf5' },
    { id: 'marron', name: 'marrón', hex: '#a8743f' },
];
/** Los gorros (el primero, ninguno). */
const IMPOSTOR_HATS = ['ninguno', 'una gorra', 'un sombrero de copa', 'una corona', 'un gorro de lana', 'una flor', 'unos cuernos', 'unos auriculares'];

/**
 * El color y el gorro de cada uno: quien pide un color libre se lo queda (por orden de sitio) y los demás,
 * el primero que quede. wants: [{ color, hat }] (color: el número en IMPOSTOR_COLORS, o null).
 */
function impostorLooks(wants, rng = null) {
    const used = new Set(), out = wants.map(() => null);
    wants.forEach((w, i) => {
        const c = w?.color;
        if (Number.isInteger(c) && c >= 0 && c < IMPOSTOR_COLORS.length && !used.has(c)) { used.add(c); out[i] = c; }
    });
    const free = IMPOSTOR_COLORS.map((_, i) => i).filter(i => !used.has(i));
    const order = rng ? rng.shuffle(free.slice()) : free;
    return wants.map((w, i) => {
        const color = out[i] ?? order.shift() ?? i % IMPOSTOR_COLORS.length;
        const h = w?.hat;
        const hat = Number.isInteger(h) && h >= 0 && h < IMPOSTOR_HATS.length ? h : rng ? rng.int(IMPOSTOR_HATS.length) : 0;
        return { color, hat };
    });
}
/** Los sabotajes que hay; los que se cuentan (el reactor y el oxígeno) dan la partida a los impostores si nadie los arregla. */
const IMPOSTOR_SABOTAGES = ['lights', 'reactor', 'oxygen', 'comms', 'doors'];
const IMPOSTOR_CRITICAL = new Set(['reactor', 'oxygen']);
const IMPOSTOR_ACTIONS = new Set(['startTask', 'cancelTask', 'task', 'kill', 'report', 'button', 'say', 'vote', 'ready',
    'sabotage', 'fix', 'vent', 'ventTo', 'console', 'power', 'look']);
/** La sala de espera: en esta sala, con sus puertas cerradas. */
const IMPOSTOR_LOBBY_ROOM = 'comedor';
/** Lo que se puede decir en una reunión. */
const IMPOSTOR_LINES = new Set(['where', 'saw', 'kill', 'vent', 'with', 'scan', 'sus', 'agree', 'lie', 'deny', 'nothing', 'skip']);

// ── La nave ───────────────────────────────────────
// Once salas unidas por quince pasillos de tres metros de ancho:
//
//   Motores ─── Comedor ─── Puente de mando ─── Comunicaciones
//      │           │              │                  │
//   Electricidad ─ Almacén ─── Enfermería ──────── Oxígeno
//      │           │              │
//   Reactor ──── Seguridad ── Administración
//
// En la mesa del Comedor está el botón de emergencia.
const SHIP_W = 58, SHIP_H = 40;
const SHIP_AREAS = [
    { id: 'motores', kind: 'room', name: 'Motores', x: 2, y: 2, w: 9, h: 8, floor: 'metal' },
    { id: 'comedor', kind: 'room', name: 'el Comedor', x: 16, y: 2, w: 12, h: 9, floor: 'moqueta' },
    { id: 'puente', kind: 'room', name: 'el Puente de mando', x: 33, y: 2, w: 9, h: 8, floor: 'metal' },
    { id: 'electricidad', kind: 'room', name: 'Electricidad', x: 2, y: 17, w: 9, h: 8, floor: 'rejilla' },
    { id: 'almacen', kind: 'room', name: 'el Almacén', x: 16, y: 16, w: 12, h: 9, floor: 'metal' },
    { id: 'enfermeria', kind: 'room', name: 'la Enfermería', x: 33, y: 17, w: 9, h: 8, floor: 'moqueta' },
    { id: 'comunicaciones', kind: 'room', name: 'Comunicaciones', x: 47, y: 2, w: 9, h: 8, floor: 'metal' },
    { id: 'oxigeno', kind: 'room', name: 'Oxígeno', x: 47, y: 17, w: 9, h: 8, floor: 'rejilla' },
    { id: 'reactor', kind: 'room', name: 'el Reactor', x: 2, y: 30, w: 9, h: 8, floor: 'metal' },
    { id: 'seguridad', kind: 'room', name: 'Seguridad', x: 17, y: 30, w: 10, h: 8, floor: 'moqueta' },
    { id: 'administracion', kind: 'room', name: 'Administración', x: 33, y: 30, w: 9, h: 8, floor: 'moqueta' },
    { id: 'p-motores-comedor', kind: 'corridor', links: ['motores', 'comedor'], x: 11, y: 5, w: 5, h: 3, floor: 'rejilla' },
    { id: 'p-comedor-puente', kind: 'corridor', links: ['comedor', 'puente'], x: 28, y: 5, w: 5, h: 3, floor: 'rejilla' },
    { id: 'p-comedor-almacen', kind: 'corridor', links: ['comedor', 'almacen'], x: 20, y: 11, w: 3, h: 5, floor: 'rejilla' },
    { id: 'p-electricidad-almacen', kind: 'corridor', links: ['electricidad', 'almacen'], x: 11, y: 19, w: 5, h: 3, floor: 'rejilla' },
    { id: 'p-almacen-enfermeria', kind: 'corridor', links: ['almacen', 'enfermeria'], x: 28, y: 19, w: 5, h: 3, floor: 'rejilla' },
    { id: 'p-motores-electricidad', kind: 'corridor', links: ['motores', 'electricidad'], x: 5, y: 10, w: 3, h: 7, floor: 'rejilla' },
    { id: 'p-puente-enfermeria', kind: 'corridor', links: ['puente', 'enfermeria'], x: 36, y: 10, w: 3, h: 7, floor: 'rejilla' },
    { id: 'p-puente-comunicaciones', kind: 'corridor', links: ['puente', 'comunicaciones'], x: 42, y: 5, w: 5, h: 3, floor: 'rejilla' },
    { id: 'p-enfermeria-oxigeno', kind: 'corridor', links: ['enfermeria', 'oxigeno'], x: 42, y: 19, w: 5, h: 3, floor: 'rejilla' },
    { id: 'p-comunicaciones-oxigeno', kind: 'corridor', links: ['comunicaciones', 'oxigeno'], x: 50, y: 10, w: 3, h: 7, floor: 'rejilla' },
    { id: 'p-electricidad-reactor', kind: 'corridor', links: ['electricidad', 'reactor'], x: 5, y: 25, w: 3, h: 5, floor: 'rejilla' },
    { id: 'p-almacen-seguridad', kind: 'corridor', links: ['almacen', 'seguridad'], x: 20, y: 25, w: 3, h: 5, floor: 'rejilla' },
    { id: 'p-enfermeria-administracion', kind: 'corridor', links: ['enfermeria', 'administracion'], x: 36, y: 25, w: 3, h: 5, floor: 'rejilla' },
    { id: 'p-reactor-seguridad', kind: 'corridor', links: ['reactor', 'seguridad'], x: 11, y: 33, w: 6, h: 3, floor: 'rejilla' },
    { id: 'p-seguridad-administracion', kind: 'corridor', links: ['seguridad', 'administracion'], x: 27, y: 33, w: 6, h: 3, floor: 'rejilla' },
];
/** Los muebles: no se puede pasar por encima. La mesa del Comedor va la primera: en ella está el botón. */
const SHIP_FURNITURE = [
    { id: 'mesa', name: 'la mesa', area: 'comedor', x: 20, y: 5, w: 4, h: 3 },
    { id: 'mapa', name: 'la mesa del mapa', area: 'administracion', x: 36, y: 32, w: 3, h: 3 },
    { id: 'nucleo', name: 'el núcleo del reactor', area: 'reactor', x: 5, y: 32, w: 3, h: 3 },
    { id: 'pantallas', name: 'la mesa de las cámaras', area: 'seguridad', x: 20, y: 36, w: 4, h: 1 },
];

/**
 * Las tareas: qué son y dónde se hacen. Cada tipo está en uno o varios sitios.
 * visible: quien te ve hacerla sabe que eres tripulante (con la regla visualTasks). steps: se hace en dos sitios, uno detrás de otro.
 * wait: se hace en dos veces en el mismo sitio, con esos segundos de espera entre una y otra (la mitad, con tareas fáciles).
 * long: es de las largas. common: puede ser común (la misma, en el mismo sitio, para toda la tripulación).
 */
const IMPOSTOR_TASKS = {
    cables: { name: 'Arreglar los cables', short: 'los cables', common: true },
    descarga: { name: 'Descargar los datos', short: 'la descarga' },
    motor: { name: 'Calibrar el motor', short: 'el motor' },
    codigo: { name: 'Teclear el código', short: 'el código', common: true },
    escaner: { name: 'Pasar por el escáner', short: 'el escáner', visible: true },
    combustible: { name: 'Repostar el motor', short: 'el combustible', long: true, steps: ['Llenar la lata de combustible', 'Echar el combustible al motor'] },
    escudos: { name: 'Encender los escudos', short: 'los escudos', visible: true },
    secuencia: { name: 'Repetir la secuencia', short: 'la secuencia', long: true },
    rumbo: { name: 'Fijar el rumbo', short: 'el rumbo', long: true },
    basura: { name: 'Vaciar la basura', short: 'la basura', visible: true },
    filtro: { name: 'Limpiar el filtro', short: 'el filtro' },
    temperatura: { name: 'Ajustar la temperatura', short: 'la temperatura' },
    muestras: { name: 'Analizar las muestras', short: 'las muestras', long: true, steps: ['Empezar el análisis', 'Recoger los resultados'], wait: 60 },
};
const SHIP_SPOTS = [
    { type: 'cables', area: 'electricidad', x: 3.5, y: 18.5 },
    { type: 'cables', area: 'almacen', x: 26.5, y: 23.5 },
    { type: 'cables', area: 'seguridad', x: 17.5, y: 30.5 },
    { type: 'descarga', area: 'puente', x: 40.5, y: 3.5 },
    { type: 'descarga', area: 'comedor', x: 26.5, y: 2.5 },
    { type: 'descarga', area: 'comunicaciones', x: 54.5, y: 2.5 },
    { type: 'motor', area: 'motores', x: 2.5, y: 3.5 },
    { type: 'motor', area: 'motores', x: 2.5, y: 8.5 },
    { type: 'motor', area: 'reactor', x: 2.5, y: 36.5 },
    { type: 'codigo', area: 'enfermeria', x: 40.5, y: 23.5 },
    { type: 'codigo', area: 'almacen', x: 16.5, y: 16.5 },
    { type: 'codigo', area: 'administracion', x: 40.5, y: 36.5 },
    { type: 'escaner', area: 'enfermeria', x: 34.5, y: 23.5 },
    { type: 'combustible', step: 0, area: 'almacen', x: 26.5, y: 16.5 },
    { type: 'combustible', step: 1, area: 'motores', x: 10.5, y: 2.5 },
    { type: 'combustible', step: 1, area: 'reactor', x: 10.5, y: 36.5 },
    { type: 'escudos', area: 'oxigeno', x: 54.5, y: 23.5 },
    { type: 'escudos', area: 'comunicaciones', x: 47.5, y: 9.5 },
    { type: 'secuencia', area: 'puente', x: 33.5, y: 2.5 },
    { type: 'secuencia', area: 'seguridad', x: 26.5, y: 37.5 },
    { type: 'rumbo', area: 'puente', x: 37.5, y: 2.5 },
    { type: 'basura', area: 'comedor', x: 27.5, y: 10.5 },
    { type: 'basura', area: 'almacen', x: 24.5, y: 16.5 },
    { type: 'filtro', area: 'oxigeno', x: 47.5, y: 24.5 },
    { type: 'temperatura', area: 'motores', x: 6.5, y: 2.5 },
    { type: 'temperatura', area: 'electricidad', x: 10.5, y: 17.5 },
    { type: 'muestras', area: 'enfermeria', x: 39.5, y: 22 },
];
/** Los paneles para arreglar los sabotajes. */
const SHIP_PANELS = [
    { id: 'luces', sab: 'lights', name: 'el cuadro de las luces', area: 'electricidad', x: 10.5, y: 24.5 },
    { id: 'reactor0', sab: 'reactor', name: 'el panel izquierdo del reactor', area: 'reactor', x: 2.5, y: 30.5 },
    { id: 'reactor1', sab: 'reactor', name: 'el panel derecho del reactor', area: 'reactor', x: 10.5, y: 30.5 },
    { id: 'oxigeno0', sab: 'oxygen', name: 'el teclado del oxígeno de Oxígeno', area: 'oxigeno', x: 55.5, y: 17.5 },
    { id: 'oxigeno1', sab: 'oxygen', name: 'el teclado del oxígeno de Administración', area: 'administracion', x: 40.5, y: 30.5 },
    { id: 'radio', sab: 'comms', name: 'la radio de Comunicaciones', area: 'comunicaciones', x: 47.5, y: 2.5 },
];
/** Las consolas: el mapa con cuántos hay en cada sala, las cámaras y las constantes vitales. */
const SHIP_CONSOLES = [
    { id: 'admin', name: 'el mapa de la nave', area: 'administracion', table: 'mapa' },
    { id: 'cams', name: 'las cámaras', area: 'seguridad', table: 'pantallas' },
    { id: 'vitals', name: 'las constantes vitales', area: 'enfermeria', x: 40.5, y: 17.5 },
];
/** Las cámaras de Seguridad, en los pasillos más concurridos. */
const SHIP_CAMERAS = [
    { area: 'p-motores-electricidad', x: 6.5, y: 13.5 },
    { area: 'p-comedor-almacen', x: 21.5, y: 13.5 },
    { area: 'p-puente-enfermeria', x: 37.5, y: 13.5 },
    { area: 'p-almacen-seguridad', x: 21.5, y: 27.5 },
];
/** Los conductos: cada uno lleva a los de su red. */
const SHIP_VENTS = [
    { net: 'a', area: 'motores', x: 8.5, y: 8.5 },
    { net: 'a', area: 'reactor', x: 8.5, y: 36.5 },
    { net: 'b', area: 'electricidad', x: 3.5, y: 23.5 },
    { net: 'b', area: 'seguridad', x: 25.5, y: 30.5 },
    { net: 'b', area: 'enfermeria', x: 34.5, y: 17.5 },
    { net: 'c', area: 'comedor', x: 16.5, y: 9.5 },
    { net: 'c', area: 'almacen', x: 17.5, y: 23.5 },
    { net: 'c', area: 'administracion', x: 33.5, y: 36.5 },
    { net: 'd', area: 'puente', x: 34.5, y: 9.5 },
    { net: 'd', area: 'comunicaciones', x: 54.5, y: 9.5 },
    { net: 'd', area: 'oxigeno', x: 47.5, y: 17.5 },
];

/** «el Comedor» → «al Comedor»; «Motores» → «a Motores». */
const toPlace = name => name.startsWith('el ') ? 'al ' + name.slice(3) : 'a ' + name;
const inPlace = name => 'en ' + name;

/** La nave: la cuadrícula de casillas, las zonas y las puertas. */
const SHIP = (() => {
    const areas = SHIP_AREAS.map((a, i) => ({ ...a, index: i, cx: a.x + a.w / 2, cy: a.y + a.h / 2, doors: [] }));
    const byId = Object.fromEntries(areas.map(a => [a.id, a]));
    for (const a of areas) if (a.kind === 'corridor') {
        const [r1, r2] = a.links.map(id => byId[id]);
        a.name = `el pasillo entre ${r1.name.replace(/^(el|la) /, '')} y ${r2.name.replace(/^(el|la) /, '')}`;
    }
    const tiles = new Int16Array(SHIP_W * SHIP_H).fill(-1);
    for (const a of areas) for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) tiles[y * SHIP_W + x] = a.index;
    for (const f of SHIP_FURNITURE) for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) tiles[y * SHIP_W + x] = -2;
    // Una puerta donde cada pasillo toca una sala: en el centro de la línea que comparten.
    const doors = [];
    for (const c of areas.filter(a => a.kind === 'corridor')) {
        for (const rid of c.links) {
            const r = byId[rid];
            let sx = 0, sy = 0, k = 0, nx = 0, ny = 0;
            for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) {
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    if (tiles[(y + dy) * SHIP_W + x + dx] !== r.index) continue;
                    sx += x + 0.5 + dx / 2; sy += y + 0.5 + dy / 2; k++; nx = -dx; ny = -dy;
                }
            }
            const other = c.links.find(id => id !== rid);
            // Las casillas del pasillo que tocan la sala: al cerrar la puerta, se vuelven pared.
            const cells = [];
            for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) {
                if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tiles[(y + dy) * SHIP_W + x + dx] === r.index)) cells.push(y * SHIP_W + x);
            }
            const d = { id: doors.length, room: rid, corridor: c.id, to: other, x: sx / k, y: sy / k, nx, ny, cells };
            doors.push(d);
            r.doors.push(d);
            c.doors.push(d);
        }
    }
    const spots = SHIP_SPOTS.map((s, i) => ({ ...s, id: i }));
    // El botón de emergencia, en el centro de la mesa del Comedor.
    const t = SHIP_FURNITURE[0];
    const button = { area: t.area, x: t.x + t.w / 2, y: t.y + t.h / 2, table: t };
    const panels = SHIP_PANELS.map(p => ({ ...p }));
    // Las consolas que son una mesa se usan desde cualquier lado de la mesa; su punto es el centro.
    const consoles = SHIP_CONSOLES.map(c => {
        const f = c.table && SHIP_FURNITURE.find(f => f.id === c.table);
        return f ? { ...c, x: f.x + f.w / 2, y: f.y + f.h / 2, table: f } : { ...c };
    });
    const vents = SHIP_VENTS.map((v, i) => ({ ...v, id: i }));
    for (const v of vents) v.to = vents.filter(o => o.net === v.net && o !== v).map(o => o.id);
    return { w: SHIP_W, h: SHIP_H, areas, byId, tiles, doors, spots, furniture: SHIP_FURNITURE, button, panels, consoles, vents, cameras: SHIP_CAMERAS };
})();

// Las puertas cerradas (un sabotaje) son una capa encima de la nave: closed[casilla] = 1 si esa casilla es ahora pared.
// Cada función que mira paredes la recibe al final; sin ella, todas las puertas están abiertas.
function shipTile(x, y, closed = null) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= SHIP.w || ty >= SHIP.h) return -1;
    const i = ty * SHIP.w + tx;
    return closed && closed[i] ? -1 : SHIP.tiles[i];
}
const shipSolid = (tx, ty, closed = null) => tx < 0 || ty < 0 || tx >= SHIP.w || ty >= SHIP.h || SHIP.tiles[ty * SHIP.w + tx] < 0 || !!(closed && closed[ty * SHIP.w + tx]);
/** La zona (sala o pasillo) en la que está un punto, o null si es pared o mueble. */
function shipArea(x, y) { const t = shipTile(x, y); return t >= 0 ? SHIP.areas[t] : null; }

/** ¿Un círculo de radio r en (x, y) toca alguna pared o mueble? */
function shipBlocked(x, y, r = IMPOSTOR_RADIUS, closed = null) {
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
        for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
            if (!shipSolid(tx, ty, closed)) continue;
            const qx = clampN(x, tx, tx + 1), qy = clampN(y, ty, ty + 1);
            if ((x - qx) ** 2 + (y - qy) ** 2 < r * r - 1e-9) return true;
        }
    }
    return false;
}
function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** ¿Se ve un punto desde otro? (sin paredes ni puertas cerradas en medio; los muebles no tapan) */
function shipSight(x0, y0, x1, y1, closed = null) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 0.2);
    for (let i = 1; i < n; i++) {
        const t = shipTile(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, closed);
        if (t === -1) return false;
    }
    return true;
}

/** ¿Se puede ir en línea recta de un punto a otro sin rozar nada? */
function shipClear(x0, y0, x1, y1, r = IMPOSTOR_RADIUS + 0.06, closed = null) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 0.2));
    for (let i = 0; i <= n; i++) if (shipBlocked(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, r, closed)) return false;
    return true;
}

/**
 * El camino más corto de un punto a otro, como una lista de puntos por los que pasar
 * (sin el de salida). Sirve para la guía y para los rivales de la máquina. null si no hay camino.
 */
function shipPath(x0, y0, x1, y1, closed = null) {
    const W = SHIP.w, start = Math.floor(y0) * W + Math.floor(x0), goal = Math.floor(y1) * W + Math.floor(x1);
    if (shipSolid(Math.floor(x1), Math.floor(y1), closed) || shipSolid(Math.floor(x0), Math.floor(y0), closed)) return null;
    const prev = new Int32Array(W * SHIP.h).fill(-1);
    prev[start] = start;
    const queue = [start];
    for (let qi = 0; qi < queue.length && prev[goal] < 0; qi++) {
        const cur = queue[qi], cx = cur % W, cy = (cur - cx) / W;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (shipSolid(nx, ny, closed)) continue;
            if (dx && dy && (shipSolid(cx + dx, cy, closed) || shipSolid(cx, cy + dy, closed))) continue;   // sin cortar esquinas
            const ni = ny * W + nx;
            if (prev[ni] >= 0) continue;
            prev[ni] = cur;
            queue.push(ni);
        }
    }
    if (prev[goal] < 0) return null;
    const cells = [];
    for (let c = goal; c !== start; c = prev[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map(c => ({ x: c % W + 0.5, y: Math.floor(c / W) + 0.5 }));
    if (pts.length) pts[pts.length - 1] = { x: x1, y: y1 };
    // Se quitan los puntos intermedios que no hacen falta: de cada punto se salta al más lejano que se ve en línea recta.
    const out = [];
    let fx = x0, fy = y0, i = 0;
    while (i < pts.length) {
        let j = pts.length - 1;
        while (j > i && !shipClear(fx, fy, pts[j].x, pts[j].y, undefined, closed)) j--;
        out.push(pts[j]);
        fx = pts[j].x; fy = pts[j].y;
        i = j + 1;
    }
    return out;
}

/** Hacia qué sala va quien anda por un pasillo, mirando hacia (fx, fy); null si no va hacia ninguna. */
function camHeading(areaId, fx, fy) {
    const a = SHIP.byId[areaId];
    if (!a?.links) return null;
    let best = null, bd = 0.3;
    for (const id of a.links) {
        const r = SHIP.byId[id], dx = r.cx - a.cx, dy = r.cy - a.cy, d = Math.hypot(dx, dy) || 1;
        const dot = (dx * fx + dy * fy) / d;
        if (dot > bd) { bd = dot; best = id; }
    }
    return best;
}

/** Lo cerca que estás de una mesa (0 si la tocas). */
function tableDist(t, x, y) {
    const dx = Math.max(t.x - x, 0, x - (t.x + t.w)), dy = Math.max(t.y - y, 0, y - (t.y + t.h));
    return Math.hypot(dx, dy);
}

/** Un sitio libre junto a la consola de una tarea, para ponerse delante y no encima. */
function shipStandAt(spot) {
    if (!shipBlocked(spot.x, spot.y, IMPOSTOR_RADIUS + 0.06)) return { x: spot.x, y: spot.y };
    for (const [dx, dy] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) {
        if (!shipBlocked(spot.x + dx, spot.y + dy, IMPOSTOR_RADIUS + 0.06)) return { x: spot.x + dx, y: spot.y + dy };
    }
    return { x: spot.x, y: spot.y };
}

/** Lo largo que es un camino desde (x, y). */
function pathLength(x, y, pts) {
    let d = 0;
    for (const p of pts || []) { d += Math.hypot(p.x - x, p.y - y); x = p.x; y = p.y; }
    return d;
}

class ImpostorGame {
    /**
     * players: [{ name, role, remote, color, hat }]; role ('impostor' o 'crew') es lo que prefiere ese jugador, si lo hay;
     * remote: anda en otro navegador (en una sala) y dice él mismo dónde está; color y hat, el que ha elegido (impostorLooks).
     * bot: es de la máquina (en la sala de espera, cede su color a quien lo pida). at: { x, y }, dónde estaba en la sala de espera.
     */
    constructor({ players, rules = {}, seed = Date.now() }) {
        this.rules = { ...IMPOSTOR_DEFAULT_RULES, ...rules };
        this.seed = seed >>> 0;
        this.rng = makeRng(this.seed);
        const looks = impostorLooks(players.map(p => ({ color: p.color, hat: p.hat })), makeRng(this.seed + 31));
        this.players = players.map((p, i) => ({
            name: p.name, index: i, want: p.role || null, x: 0, y: 0, ix: 0, iy: 0, fx: 0, fy: -1,
            area: null, busy: null, tasks: [], bumpT: 0, moved: 0, vent: null,
            role: 'crew', alive: true, knownDead: false, killCd: 0, meetingsLeft: 0,
            remote: !!p.remote, warp: 0, netMoved: 0, stepT: -99,
            color: looks[i].color, hat: looks[i].hat, bot: !!p.bot, at: p.at || null,
            // Los papeles especiales: el poder, su espera y hasta cuándo dura; el cambiaformas (shape: en quién se ha
            // transformado), el espectro (hidden), el escudo del ángel (shieldUntil, shieldBy) y los conductos del ingeniero.
            special: null, powerCd: 0, powerUntil: 0, shape: null, hidden: false, shieldUntil: 0, shieldBy: null,
            ventCd: 0, ventIn: 0, camsAt: -99,
        }));
        this.round = 0;
        this.phase = 'idle';
        this.time = 0;
        this.turns = 0;
        this.current = 0;
        this.bodies = [];
        this.meeting = null;
        this.meetings = 0;
        this.buttonAt = 0;
        this.sab = null;                // el sabotaje en marcha: { kind: 'lights' o 'reactor', by, t0, until }
        this.sabCd = 0;                 // segundos hasta poder sabotear otra vez
        this.doorsShut = null;          // las puertas cerradas: { room, by, until }
        this.doorCd = 0;
        this.closed = new Uint8Array(SHIP_W * SHIP_H);   // las casillas de las puertas cerradas
        this.barShown = { done: 0, total: 0 };              // la barra de tareas tal como la ven todos (según la regla barUpdates)
        this.hide = null;               // el escondite: { go, until, final, pingT } (cuándo sale el impostor, cuándo se acaba)
        this.winners = null;
        this.result = null;
    }

    get n() { return this.players.length; }
    /** El modo escondite: el impostor se sabe, no hay reuniones y la tripulación aguanta hasta que se acaba el tiempo. */
    get hideSeek() { return this.rules.mode === 'escondite' && !this.rules.lobby; }
    /** La sala de espera: se anda por el Comedor y se elige color, nada más. */
    get lobby() { return !!this.rules.lobby; }
    get speed() { return IMPOSTOR_SPEED * this.rules.speed; }
    get vision() { return IMPOSTOR_VISION * this.rules.vision; }
    get killRange() { return IMPOSTOR_KILL_RANGE[this.rules.killRange] || IMPOSTOR_KILL_RANGE.medio; }
    areaOf(p) { return SHIP.byId[this.players[p].area] || null; }
    isImpostor(p) { return this.players[p]?.role === 'impostor'; }
    /** Hasta dónde ve cada uno: los impostores, un poco más lejos; con las luces apagadas, la tripulación viva casi nada. */
    visionOf(p) {
        const pl = this.players[p];
        if (this.isImpostor(p)) return this.vision * (this.hideSeek ? 1 : IMPOSTOR_IMP_VISION);
        return this.vision * (this.sab?.kind === 'lights' && pl?.alive ? IMPOSTOR_LIGHTS : 1);
    }
    get lightsOff() { return this.sab?.kind === 'lights'; }
    /** Sin comunicaciones no funcionan el mapa, las cámaras ni la lista de tareas. */
    get commsDown() { return this.sab?.kind === 'comms'; }
    /** Un sabotaje que se cuenta: el reactor o el oxígeno. */
    get critical() { return !!this.sab && IMPOSTOR_CRITICAL.has(this.sab.kind); }
    get voteSecs() { return Math.max(5, +this.rules.voteTime || 60); }
    impostors() { return this.players.filter(pl => pl.role === 'impostor').map(pl => pl.index); }
    living() { return this.players.filter(pl => pl.alive).map(pl => pl.index); }

    /** Cuántos impostores hay con estos jugadores: con menos de 4 no hay ninguno (en el escondite, uno desde 2). */
    impostorCount() { return this.lobby ? 0 : impostorsFor(this.n, this.rules.impostors, this.rules.mode); }
    /** Cómo se ve a alguien: él mismo o, si es un cambiaformas transformado, aquel en quien se ha transformado. */
    shown(p) { return this.players[p]?.shape ?? p; }
    /** ¿Tiene una tarea que se ve (si la regla las deja ver)? */
    visualTask(type) { return !!this.rules.visualTasks && !!IMPOSTOR_TASKS[type]?.visible; }
    /** ¿Puede ir por los conductos? Los impostores vivos (no en el escondite), los ingenieros y, en el escondite, la tripulación. */
    canVent(p) {
        const pl = this.players[p];
        if (!pl?.alive || !this.rules.vents || pl.hidden) return false;
        if (pl.role === 'impostor') return !this.hideSeek;
        return pl.special === 'engineer' || this.hideSeek;
    }
    /** ¿Tiene que ir con cuidado por los conductos? (el ingeniero y la tripulación del escondite: poco rato y con espera) */
    ventLimited(p) { return this.players[p]?.role !== 'impostor'; }
    /** En el escondite, el impostor espera quieto al empezar. */
    frozen(pl) { return !!this.hide && pl.role === 'impostor' && this.time < this.hide.go; }
    /** ¿Está mirando las cámaras? (la mesa las pide cada segundo mientras miras) */
    watchingCams(p) {
        const pl = this.players[p];
        return !!pl && this.time - pl.camsAt < IMPOSTOR_WATCH && this.consoleHere(p)?.id === 'cams';
    }
    /** ¿Hay alguien mirando las cámaras? Se les enciende la luz roja. */
    get camsOn() { return this.phase === 'ship' && !this.commsDown && this.players.some(pl => this.watchingCams(pl.index)); }
    /** Lo cerca que está el impostor de un tripulante, de 0 a 1 (en el escondite, el latido; atraviesa las paredes). */
    dangerOf(p) {
        const me = this.players[p];
        if (!this.hide || !me?.alive || me.role === 'impostor') return 0;
        let best = 0;
        for (const pl of this.players) if (pl.role === 'impostor' && pl.alive) best = Math.max(best, 1 - Math.hypot(pl.x - me.x, pl.y - me.y) / IMPOSTOR_HIDE.danger);
        return clampN(best, 0, 1);
    }

    /** La barra de tareas: cuántas hay hechas de todas las de la tripulación (las de los impostores son de mentira). */
    taskBar() {
        let done = 0, total = 0;
        for (const pl of this.players) {
            if (pl.role === 'impostor') continue;
            for (const t of pl.tasks) { total++; if (t.done) done++; }
        }
        return { done, total };
    }
    pending(p) { return this.players[p].tasks.map((t, i) => ({ ...t, i, spot: SHIP.spots[t.spot] })).filter(t => !t.done); }

    /** La barra como la ven todos, si ha cambiado: con 'siempre', al momento (salvo sin comunicaciones); con 'reuniones', en cada reunión. */
    syncBar() {
        const mode = this.rules.barUpdates, real = this.taskBar(), b = this.barShown;
        if (mode === 'nunca' || (real.done === b.done && real.total === b.total)) return [];
        this.barShown = real;
        return [this.barEvent()];
    }
    barEvent() { return { type: 'taskBar', done: this.barShown.done, total: this.barShown.total, mode: this.rules.barUpdates }; }

    // ── Empezar ───────────────────────────────────────
    startRound() {
        this.round++;
        this.phase = 'ship';
        this.time = 0;
        this.winners = null;
        this.result = null;
        this.bodies = [];
        this.meeting = null;
        this.meetings = 0;
        this.buttonAt = this.rules.buttonWait;
        this.sab = null; this.sabCd = 15;
        this.doorsShut = null; this.doorCd = 15;
        this.closed.fill(0);
        const hs = this.hideSeek;
        this.hide = hs ? { go: IMPOSTOR_HIDE.start, until: Math.max(60, +this.rules.hideTime || 300), final: false, went: false, pingT: 0 } : null;
        // Los impostores: primero quien quiere serlo, luego al azar entre quien no ha pedido ser tripulante.
        const nImp = this.impostorCount();
        const want = this.rng.shuffle(this.players.filter(pl => pl.want === 'impostor').map(pl => pl.index));
        const free = this.rng.shuffle(this.players.filter(pl => !pl.want).map(pl => pl.index));
        const crewOnly = this.rng.shuffle(this.players.filter(pl => pl.want === 'crew').map(pl => pl.index));
        const imps = new Set([...want, ...free, ...crewOnly].slice(0, nImp));
        const common = this.commonTasks();
        for (const pl of this.players) {
            pl.role = imps.has(pl.index) ? 'impostor' : 'crew';
            pl.alive = true; pl.knownDead = false;
            pl.meetingsLeft = this.rules.meetings | 0;
            pl.killCd = hs ? IMPOSTOR_HIDE.start : Math.min(10, this.rules.killCooldown);
            pl.tasks = this.lobby ? [] : this.dealTasks(common);
            Object.assign(pl, { special: null, powerCd: 10, powerUntil: 0, shape: null, hidden: false, shieldUntil: 0, shieldBy: null, ventCd: 0, ventIn: 0, camsAt: -99 });
        }
        // Los papeles especiales (en el escondite no hay): los de la tripulación, entre la tripulación, y los de los impostores, entre ellos.
        if (!hs && nImp) for (const [id, R] of Object.entries(IMPOSTOR_ROLES)) {
            const free = this.rng.shuffle(this.players.filter(pl => !pl.special && (pl.role === 'impostor') === (R.side === 'impostor')));
            for (const pl of free.slice(0, clampN(this.rules[R.rule] | 0, 0, 2))) pl.special = id;
        }
        this.gather();
        if (this.lobby) this.shutLobby();
        const events = [{ type: 'round', round: this.round, impostors: nImp, mode: this.rules.mode, ...(this.lobby ? { lobby: true } : {}), ...(hs ? { seekers: [...imps], until: this.hide.until, go: this.hide.go } : {}) }];
        for (const pl of this.players) {
            const mates = pl.role === 'impostor' ? [...imps].filter(q => q !== pl.index) : [];
            events.push({ type: 'role', p: pl.index, role: pl.role, special: pl.special, mates, impostors: nImp, secret: true });
        }
        for (const pl of this.players) events.push({ type: 'tasks', p: pl.index, tasks: pl.tasks.map(t => ({ ...t })), fake: pl.role === 'impostor', secret: true });
        this.barShown = { done: 0, total: this.taskBar().total };
        events.push(this.barEvent());
        return { ok: true, events };
    }

    /** La sala de espera: las puertas del Comedor, cerradas mientras dure. */
    shutLobby() {
        for (const d of SHIP.byId[IMPOSTOR_LOBBY_ROOM].doors) for (const c of d.cells) this.closed[c] = 1;
        this.doorsShut = { room: IMPOSTOR_LOBBY_ROOM, by: null, until: 1e9 };
    }

    /** Las tareas comunes de esta partida: las mismas, en el mismo sitio, para todos. */
    commonTasks() {
        if (this.lobby) return [];
        const pool = this.rng.shuffle(Object.keys(IMPOSTOR_TASKS).filter(t => IMPOSTOR_TASKS[t].common));
        const n = clampN(this.rules.commonTasks | 0, 0, Math.min(pool.length, this.taskCount()));
        return pool.slice(0, n).map(type => ({ type, spot: this.rng.pick(SHIP.spots.filter(s => s.type === type)).id, done: false, common: true }));
    }
    taskCount() { return clampN(this.rules.tasks | 0, 1, Object.keys(IMPOSTOR_TASKS).length); }

    /** Las tareas de cada uno: las comunes, las largas que digan las reglas y, hasta completar, cortas. */
    dealTasks(common) {
        const count = this.taskCount(), types = Object.keys(IMPOSTOR_TASKS), taken = new Set(common.map(t => t.type));
        const nLong = clampN(this.rules.longTasks | 0, 0, count - common.length);
        const long = this.rng.shuffle(types.filter(t => IMPOSTOR_TASKS[t].long && !taken.has(t))).slice(0, nLong);
        for (const t of long) taken.add(t);
        // Las cortas; si no quedan bastantes, las que sobren.
        const short = this.rng.shuffle(types.filter(t => !IMPOSTOR_TASKS[t].long && !taken.has(t)));
        const rest = this.rng.shuffle(types.filter(t => IMPOSTOR_TASKS[t].long && !taken.has(t)));
        const fill = [...short, ...rest].slice(0, count - common.length - long.length);
        return [...common.map(t => ({ ...t })), ...[...long, ...fill].map(type => this.makeTask(type))];
    }

    makeTask(type) {
        const at = SHIP.spots.filter(s => s.type === type), T = IMPOSTOR_TASKS[type];
        if (!T.steps) return { type, spot: this.rng.pick(at).id, done: false };
        // Una tarea con espera: dos veces en el mismo sitio.
        if (T.wait) { const s = this.rng.pick(at).id; return { type, spot: s, next: [s], step: 0, done: false }; }
        // Una tarea en dos sitios: se empieza en uno y se acaba en otro.
        const [first, ...rest] = T.steps.map((_, k) => this.rng.pick(at.filter(s => s.step === k)).id);
        return { type, spot: first, next: rest, step: 0, done: false };
    }

    /** Todos alrededor de la mesa del Comedor: al empezar y después de cada reunión. */
    gather() {
        const n = this.n, t = SHIP.furniture[0], cx = t.x + t.w / 2, cy = t.y + t.h / 2;
        // En la sala de espera, quien ya estaba sigue donde estaba (al entrar alguien, se empieza otra vez).
        const okAt = at => at && Number.isFinite(at.x) && Number.isFinite(at.y) && shipArea(at.x, at.y)?.id === IMPOSTOR_LOBBY_ROOM && !shipBlocked(at.x, at.y);
        const stay = new Set(this.lobby ? this.players.filter(pl => okAt(pl.at)).map(pl => pl.index) : []);
        const ring = k => { const ang = -Math.PI / 2 + k * 2 * Math.PI / n; return { x: cx + Math.cos(ang) * 3.3, y: cy + Math.sin(ang) * 2.8 }; };
        const placed = this.players.filter(pl => stay.has(pl.index)).map(pl => ({ ...pl.at }));
        this.rng.shuffle(this.players.map((_, i) => i)).forEach((p, k) => {
            const pl = this.players[p];
            let at = stay.has(p) ? pl.at : ring(k);
            // Quien llega a la sala de espera, al sitio de la mesa más lejos de los demás.
            if (stay.size && !stay.has(p)) {
                const far = q => Math.min(99, ...placed.map(o => Math.hypot(o.x - q.x, o.y - q.y)));
                at = Array.from({ length: 12 }, (_, j) => { const ang = j * Math.PI / 6; return { x: cx + Math.cos(ang) * 3.3, y: cy + Math.sin(ang) * 2.8 }; })
                    .filter(q => !shipBlocked(q.x, q.y)).sort((a, b) => far(b) - far(a))[0] || at;
                placed.push(at);
            }
            pl.x = at.x; pl.y = at.y;
            pl.ix = pl.iy = 0; pl.fx = 0; pl.fy = -1; pl.busy = null; pl.moved = 0; pl.vent = null; pl.warp++;
            pl.area = shipArea(pl.x, pl.y)?.id || null;
        });
    }

    // ── Andar ─────────────────────────────────────────
    /** Hacia dónde quiere andar un jugador: (dx, dy) entre -1 y 1. Se mantiene hasta que cambie. */
    input(p, dx, dy) {
        const pl = this.players[p];
        if (!pl) return;
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        pl.ix = dx || 0; pl.iy = dy || 0;
    }

    /**
     * El tiempo avanza dt segundos. Devuelve lo que ha pasado: cambios de zona y choques;
     * en la reunión, cuándo se empieza a votar y, al acabar el tiempo, los votos.
     */
    tick(dt) {
        if (this.phase === 'meeting') return this.meetingTick(dt);
        if (this.phase !== 'ship') return [];
        this.time += dt;
        const events = [];
        // Los sabotajes: el reactor estalla y el oxígeno se acaba si nadie los arregla, y las puertas se abren solas.
        if (!this.sab) this.sabCd = Math.max(0, this.sabCd - dt);
        if (!this.doorsShut) this.doorCd = Math.max(0, this.doorCd - dt);
        if (this.sab?.until != null && this.time >= this.sab.until) return this.finish('impostors', this.sab.kind);
        if (this.doorsShut && this.time >= this.doorsShut.until) events.push(this.openDoors());
        if (this.hide) {
            const H = this.hide;
            if (this.time >= H.until) return this.finish('crew', 'time');
            if (!H.went && this.time >= H.go) { H.went = true; events.push({ type: 'hideGo' }); }
            if (!H.final && this.time >= H.until - IMPOSTOR_HIDE.final) { H.final = true; H.pingT = 0; events.push({ type: 'finalHide', until: H.until }); }
            // En el escondite final, el impostor sabe dónde está cada uno, cada pocos segundos.
            if (H.final && (H.pingT -= dt) <= 0) {
                H.pingT = IMPOSTOR_HIDE.ping;
                const at = this.players.filter(q => q.alive && q.role !== 'impostor').map(q => ({ p: q.index, x: q.x, y: q.y, area: q.area }));
                for (const q of this.impostors()) if (this.players[q].alive) events.push({ type: 'ping', p: q, at, secret: true });
            }
        }
        events.push(...this.powerTick(dt));
        for (const pl of this.players) {
            if (pl.role === 'impostor' && pl.alive) pl.killCd = Math.max(0, pl.killCd - dt);
            // Quien anda en otro navegador ya ha dicho por dónde va (remoteMove).
            if (pl.remote) { pl.bumpT = 0; pl.moved = pl.netMoved; pl.netMoved = 0; continue; }
            events.push(...this.moveOne(pl, dt));
        }
        return events;
    }

    /**
     * Los poderes con el tiempo: se recargan, se acaban (el cambiaformas vuelve a ser él, el espectro se deja ver,
     * el científico se queda sin batería), se acaba el escudo del ángel y el ingeniero sale del conducto.
     */
    powerTick(dt) {
        const events = [];
        for (const pl of this.players) {
            if (pl.special && !(pl.powerUntil > this.time)) pl.powerCd = Math.max(0, pl.powerCd - dt);
            if (pl.vent == null) pl.ventCd = Math.max(0, pl.ventCd - dt);
            if (pl.powerUntil && this.time >= pl.powerUntil) events.push(...this.endPower(pl));
            if (pl.shieldUntil && this.time >= pl.shieldUntil) {
                pl.shieldUntil = 0;
                if (pl.shieldBy != null) events.push({ type: 'shieldOff', p: pl.shieldBy, target: pl.index, secret: true });
                pl.shieldBy = null;
            }
            if (pl.vent != null && this.ventLimited(pl.index) && this.time - pl.ventIn >= IMPOSTOR_ROLES.engineer.dur) {
                const r = this.ventInOut({ p: pl.index, forced: true }, pl);
                if (r.ok) events.push(...r.events);
            }
        }
        return events;
    }

    /** Se acaba el poder de alguien (o lo deja él). */
    endPower(pl, early = false) {
        const R = IMPOSTOR_ROLES[pl.special], events = [];
        pl.powerUntil = 0;
        if (!R) return events;
        pl.powerCd = R.cd || 0;
        if (pl.special === 'shapeshifter' && pl.shape != null) {
            const as = pl.shape;
            pl.shape = null;
            events.push({ type: 'unshift', p: pl.index, as, x: pl.x, y: pl.y, early, witnesses: this.witnesses(pl.x, pl.y, [pl.index]) });
        } else if (pl.special === 'phantom' && pl.hidden) {
            pl.hidden = false;
            events.push({ type: 'appear', p: pl.index, x: pl.x, y: pl.y, early, witnesses: this.witnesses(pl.x, pl.y, [pl.index]) });
        } else if (pl.special === 'scientist') events.push({ type: 'power', p: pl.index, on: false, secret: true });
        return events;
    }

    /** Al empezar una reunión se acaban todos los poderes y los escudos, sin avisar. */
    clearPowers() {
        for (const pl of this.players) {
            if (pl.powerUntil) pl.powerCd = IMPOSTOR_ROLES[pl.special]?.cd || 0;
            pl.powerUntil = 0; pl.shape = null; pl.hidden = false; pl.shieldUntil = 0; pl.shieldBy = null;
            pl.ventCd = 0;
        }
    }

    /** Un jugador anda dt segundos hacia donde quiere ir. Devuelve sus choques y cambios de zona. */
    moveOne(pl, dt) {
        pl.bumpT = Math.max(0, pl.bumpT - dt);
        pl.moved = 0;
        if (pl.busy || pl.vent != null || (!pl.ix && !pl.iy) || this.frozen(pl)) return [];
        const events = [];
        const len = Math.hypot(pl.ix, pl.iy);
        pl.fx = pl.ix / len; pl.fy = pl.iy / len;
        const step = this.speed * dt;
        const x0 = pl.x, y0 = pl.y;
        let hit = null;
        if (!pl.alive) {
            // Los fantasmas atraviesan las paredes, pero no salen de la nave.
            pl.x = clampN(pl.x + pl.ix * step, 1.3, SHIP.w - 1.3);
            pl.y = clampN(pl.y + pl.iy * step, 1.3, SHIP.h - 1.3);
        } else {
            // Cada eje por separado: así, al rozar una pared, se resbala a lo largo de ella.
            // Si andas recto contra una esquina (el borde de una puerta o de la mesa), te desvías un poco y la rodeas.
            const nx = pl.x + pl.ix * step;
            if (!shipBlocked(nx, pl.y, undefined, this.closed)) pl.x = nx;
            else if (pl.iy || !this.slideCorner(pl, nx, pl.y, 0, 1, step)) hit = { x: pl.x + Math.sign(pl.ix) * IMPOSTOR_RADIUS, y: pl.y };
            const ny = pl.y + pl.iy * step;
            if (!shipBlocked(pl.x, ny, undefined, this.closed)) pl.y = ny;
            else if (pl.ix || !this.slideCorner(pl, pl.x, ny, 1, 0, step)) hit = hit || { x: pl.x, y: pl.y + Math.sign(pl.iy) * IMPOSTOR_RADIUS };
        }
        pl.moved = Math.hypot(pl.x - x0, pl.y - y0);
        if (pl.moved > 0) pl.stepT = this.time;
        if (hit && pl.bumpT <= 0) {
            pl.bumpT = 0.4;
            const what = SHIP.furniture.find(f => hit.x >= f.x - 0.4 && hit.x <= f.x + f.w + 0.4 && hit.y >= f.y - 0.4 && hit.y <= f.y + f.h + 0.4);
            const door = !what && this.doorsShut ? SHIP.byId[this.doorsShut.room].doors.find(d => Math.hypot(d.x - hit.x, d.y - hit.y) < 2.2) : null;
            events.push({ type: 'bump', p: pl.index, x: hit.x, y: hit.y, what: what ? what.id : door ? 'puerta' : 'pared' });
        }
        const a = shipArea(pl.x, pl.y);
        if (a && a.id !== pl.area) {
            const from = pl.area;
            pl.area = a.id;
            events.push({ type: 'area', p: pl.index, area: a.id, from });
        }
        return events;
    }

    /** ¿Anda ahora? (o ha andado hace un momento: lo que dice quien juega en otro navegador llega a saltos) */
    walking(pl) { return pl.moved > 0 || this.time - pl.stepT < 0.25; }

    /**
     * En una sala, quien anda en otro navegador dice dónde está: m = { x, y, fx, fy, w }, con w el número de su
     * último salto (warp). Se acepta si es creíble: si no ha andado más de lo que se puede en el tiempo que ha
     * pasado (el, en segundos) ni se ha metido en una pared. Si no, se le devuelve a donde estaba (otro salto).
     * Devuelve true si se ha aceptado.
     */
    remoteMove(p, m, el) {
        const pl = this.players[p];
        if (!pl || !m || this.phase !== 'ship' || pl.busy || pl.vent != null || m.w !== pl.warp) return false;
        if (this.frozen(pl)) { if (Math.hypot(+m.x - pl.x, +m.y - pl.y) > 0.05) pl.warp++; return false; }
        const x = +m.x, y = +m.y;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
        const d = Math.hypot(x - pl.x, y - pl.y);
        const max = this.speed * clampN(el, 0, 2) * 1.6 + 0.6;
        const bad = d > max || (pl.alive ? shipBlocked(x, y, IMPOSTOR_RADIUS - 0.05, this.closed) : x < 1.25 || y < 1.25 || x > SHIP.w - 1.25 || y > SHIP.h - 1.25);
        if (bad) { pl.warp++; return false; }
        pl.netMoved += d;
        if (d > 0.001) pl.stepT = this.time;
        pl.x = x; pl.y = y;
        const fl = Math.hypot(+m.fx || 0, +m.fy || 0);
        if (fl > 0.1) { pl.fx = m.fx / fl; pl.fy = m.fy / fl; }
        pl.area = shipArea(x, y)?.id || pl.area;
        return true;
    }

    /**
     * Andas recto hacia (x, y) y una esquina te lo impide: si un poco hacia un lado (ux, uy) está libre,
     * te mueves hacia ese lado. Devuelve true si te has movido.
     */
    slideCorner(pl, x, y, ux, uy, step) {
        for (const off of [0.15, 0.3, 0.45, 0.6]) {
            for (const s of [-1, 1]) {
                if (shipBlocked(x + s * ux * off, y + s * uy * off, undefined, this.closed)) continue;
                const d = Math.min(step, off);
                if (shipBlocked(pl.x + s * ux * d, pl.y + s * uy * d, undefined, this.closed)) continue;
                pl.x += s * ux * d; pl.y += s * uy * d;
                return true;
            }
        }
        return false;
    }

    // ── Ver y oír ─────────────────────────────────────
    /**
     * A quién ve un jugador (cerca y sin paredes en medio) y qué cuerpos ve. Lo que se oye de los demás (sus
     * pasos, su nota, sus tareas) llega hasta donde se ve, ni más ni menos: así quien no ve sabe lo mismo que
     * quien mira la pantalla, también con las luces apagadas. Los vivos no ven ni oyen a los fantasmas; los
     * fantasmas ven a todos los que tienen cerca.
     */
    perceive(p) {
        const me = this.players[p], seen = [], bodies = [], vis = this.visionOf(p);
        // Los fantasmas ven a través de las paredes lo que tienen cerca.
        const sees = (x, y) => !me.alive || shipSight(me.x, me.y, x, y, this.closed);
        // Al espectro invisible solo lo ven los impostores y los fantasmas.
        const seesHidden = !me.alive || me.role === 'impostor';
        for (const pl of this.players) {
            // known: en la mesa de un invitado, si sabe dónde está (si no, su sitio es de hace rato).
            if (pl === me || (!pl.alive && me.alive) || pl.vent != null || pl.known === false || (pl.hidden && !seesHidden)) continue;
            const d = Math.hypot(pl.x - me.x, pl.y - me.y);
            if (d <= vis && sees(pl.x, pl.y)) seen.push(pl.index);
        }
        for (const b of this.bodies) if (Math.hypot(b.x - me.x, b.y - me.y) <= vis && sees(b.x, b.y)) bodies.push(b.p);
        return { seen, bodies };
    }

    /** Quién ve un punto: los vivos que lo tienen a la vista, menos los de except. */
    witnesses(x, y, except = []) {
        return this.players.filter(pl => pl.alive && pl.vent == null && !except.includes(pl.index)
            && Math.hypot(pl.x - x, pl.y - y) <= this.visionOf(pl.index) && shipSight(pl.x, pl.y, x, y, this.closed)).map(pl => pl.index);
    }

    /** La tarea pendiente más cercana que se puede usar desde donde estás, o null. */
    taskHere(p) {
        const pl = this.players[p];
        let best = null, bd = IMPOSTOR_USE;
        for (const t of this.pending(p)) {
            const d = Math.hypot(t.spot.x - pl.x, t.spot.y - pl.y);
            if (d <= bd) { bd = d; best = t; }
        }
        return best;
    }

    /** A quién puede matar ahora un impostor: tripulantes vivos a su alcance y a la vista, el más cercano primero. */
    killTargets(p) {
        const me = this.players[p];
        if (!me || me.role !== 'impostor' || !me.alive || me.vent != null || me.hidden || this.frozen(me)) return [];
        return this.players.filter(pl => pl.alive && pl.role !== 'impostor' && pl.known !== false && pl.vent == null && Math.hypot(pl.x - me.x, pl.y - me.y) <= this.killRange && shipSight(me.x, me.y, pl.x, pl.y, this.closed))
            .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y)).map(pl => pl.index);
    }

    /** El cuerpo del que puede avisar un jugador desde donde está, o null. */
    bodyHere(p) {
        const me = this.players[p];
        let best = null, bd = IMPOSTOR_REPORT;
        for (const b of this.bodies) {
            const d = Math.hypot(b.x - me.x, b.y - me.y);
            if (d <= bd && shipSight(me.x, me.y, b.x, b.y, this.closed)) { bd = d; best = b; }
        }
        return best;
    }

    /** ¿Está al lado de la mesa del botón de emergencia? */
    atButton(p) {
        const pl = this.players[p];
        return tableDist(SHIP.button.table, pl.x, pl.y) <= IMPOSTOR_BUTTON;
    }
    /** Los segundos que faltan para poder pedir una reunión (0 si ya se puede). */
    buttonWait() { return Math.max(0, this.buttonAt - this.time); }

    /** El conducto en el que puede meterse un jugador desde donde está, o null. */
    ventHere(p) {
        const pl = this.players[p];
        let best = null, bd = IMPOSTOR_VENT_USE;
        for (const v of SHIP.vents) { const d = Math.hypot(v.x - pl.x, v.y - pl.y); if (d <= bd) { bd = d; best = v; } }
        return best;
    }
    /** El panel de un sabotaje en marcha que tiene al lado un jugador, o null. */
    panelHere(p) {
        const pl = this.players[p];
        if (!this.sab) return null;
        return SHIP.panels.find(x => x.sab === this.sab.kind && !this.sab.done?.includes(x.id) && Math.hypot(x.x - pl.x, x.y - pl.y) <= IMPOSTOR_CONSOLE) || null;
    }
    /** La consola que tiene al lado un jugador, o null. */
    consoleHere(p) {
        const pl = this.players[p];
        return SHIP.consoles.find(c => (c.table ? tableDist(c.table, pl.x, pl.y) : Math.hypot(c.x - pl.x, c.y - pl.y)) <= IMPOSTOR_CONSOLE) || null;
    }
    /** Los paneles del reactor en los que hay alguien con la mano puesta. */
    reactorHeld() {
        return [...new Set(this.players.filter(pl => pl.alive && pl.busy?.fix).map(pl => pl.busy.fix))];
    }

    // ── Acciones ──────────────────────────────────────
    act(a) {
        if (!a || !IMPOSTOR_ACTIONS.has(a.type)) return { ok: false, error: 'Eso no se puede hacer.' };
        const pl = this.players[a.p];
        if (!pl) return { ok: false, error: 'Ese jugador no está en la nave.' };
        if (a.type === 'say' || a.type === 'vote' || a.type === 'ready') return this.meetingAct(a, pl);
        if (this.phase !== 'ship') return { ok: false, error: 'Ahora no.' };
        if (a.type === 'look') return this.look(a, pl);
        if (this.lobby) return { ok: false, error: 'En la sala de espera solo se anda y se elige color. La partida la empieza quien ha creado la sala.' };
        if (a.type === 'sabotage') return this.sabotage(a, pl);
        if (a.type === 'vent') return this.ventInOut(a, pl);
        if (a.type === 'ventTo') return this.ventTo(a, pl);
        if (a.type === 'power') return this.power(a, pl);
        if (pl.vent != null) return { ok: false, error: 'Estás dentro de un conducto: sal primero.' };
        if (a.type === 'kill') return this.kill(a, pl);
        if ((a.type === 'report' || a.type === 'button') && this.hideSeek) return { ok: false, error: 'En el escondite no hay reuniones: escóndete y aguanta.' };
        if (pl.hidden && a.type !== 'cancelTask') return { ok: false, error: 'Mientras eres invisible, solo puedes andar y sabotear.' };
        if (a.type === 'report') return this.report(a, pl);
        if (a.type === 'button') return this.button(a, pl);
        if (a.type === 'fix') return this.fix(a, pl);
        if (a.type === 'console') return this.console(a, pl);
        if (a.type === 'cancelTask') {
            if (!pl.busy) return { ok: false, error: 'No estás haciendo ninguna tarea.' };
            const b = pl.busy;
            pl.busy = null;
            if (b.fix) return { ok: true, events: [{ type: 'fixHold', p: a.p, panel: b.fix, held: false }] };
            return { ok: true, events: [{ type: 'taskStop', p: a.p, i: b.i }] };
        }
        const t = pl.tasks[a.i];
        if (!t) return { ok: false, error: 'Esa tarea no es tuya.' };
        if (t.done) return { ok: false, error: 'Esa tarea ya está hecha.' };
        const spot = SHIP.spots[t.spot];
        if (Math.hypot(spot.x - pl.x, spot.y - pl.y) > IMPOSTOR_USE + 0.2) return { ok: false, error: 'Estás demasiado lejos de esa tarea.' };
        if (a.type === 'startTask') {
            if (pl.busy) return { ok: false, error: 'Ya estás con una tarea.' };
            if (t.readyAt != null && this.time < t.readyAt) return { ok: false, error: `Las muestras todavía se están analizando: faltan ${Math.ceil(t.readyAt - this.time)} segundos.` };
            pl.busy = { i: a.i, since: this.time };
            pl.ix = pl.iy = 0;
            // Una tarea que se ve (el escáner, la basura, los escudos): quien te mira sabe que eres tripulante. Un impostor no puede fingirla.
            const visible = this.visualTask(t.type) && pl.role !== 'impostor';
            return { ok: true, events: [{ type: 'taskStart', p: a.p, i: a.i, task: t.type, step: t.step || 0, fake: pl.role === 'impostor', visible, visual: this.visualTask(t.type) }] };
        }
        // 'task': la tarea está hecha.
        if (pl.role === 'impostor') return { ok: false, error: 'Los impostores no hacen tareas: solo lo fingen.' };
        if (!pl.busy || pl.busy.i !== a.i) return { ok: false, error: 'Primero tienes que empezar la tarea.' };
        pl.busy = null;
        this.turns++;
        // Una tarea en dos sitios: hecha la primera parte, queda la otra en el sitio siguiente.
        if (t.next?.length) {
            t.spot = t.next[0];
            t.next = t.next.slice(1);
            t.step++;
            const to = SHIP.spots[t.spot];
            const e = { type: 'taskStep', p: a.p, i: a.i, task: t.type, step: t.step, spot: t.spot, area: to.area, from: spot.area };
            // Una tarea con espera (las muestras): la segunda parte, cuando pase el tiempo.
            const wait = IMPOSTOR_TASKS[t.type].wait;
            if (wait) { e.wait = this.rules.easyTasks ? wait / 2 : wait; t.readyAt = e.readyAt = this.time + e.wait; }
            return { ok: true, events: [e] };
        }
        t.done = true;
        // Al científico, cada tarea le recarga la batería.
        if (pl.special === 'scientist' && !(pl.powerUntil > this.time)) pl.powerCd = 0;
        const events = [{ type: 'taskDone', p: a.p, i: a.i, task: t.type, area: spot.area }];
        // En el escondite, cada tarea quita tiempo (sin llegar al final de golpe).
        if (this.hide) {
            this.hide.until = Math.max(this.time + 5, this.hide.until - IMPOSTOR_HIDE.task);
            events[0].hideUntil = this.hide.until;
            return { ok: true, events };
        }
        // La barra se mueve al momento (si está así en las reglas y funcionan las comunicaciones).
        if (this.rules.barUpdates === 'siempre' && !this.commsDown) events.push(...this.syncBar());
        const bar = this.taskBar();
        if (bar.done >= bar.total) events.push(...this.finish('crew', 'tasks'));
        return { ok: true, events };
    }

    // ── Los sabotajes ─────────────────────────────────
    /** Los segundos que faltan para poder hacer un sabotaje (0 si ya se puede), o null si ahora no se puede. */
    sabWait(kind) {
        if (!this.rules.sabotages || this.phase !== 'ship' || this.hideSeek) return null;
        if (kind === 'doors') return this.doorsShut ? null : this.doorCd;
        if (this.sab) return null;
        return this.sabCd;
    }

    /**
     * a.kind: 'lights' (apagar las luces), 'reactor' (que estalle), 'oxygen' (que se acabe el oxígeno),
     * 'comms' (cortar las comunicaciones) o 'doors' (cerrar las puertas de la sala a.room).
     */
    sabotage(a, pl) {
        if (pl.role !== 'impostor') return { ok: false, error: 'Solo los impostores sabotean.' };
        if (!this.rules.sabotages || this.hideSeek) return { ok: false, error: 'En esta partida no hay sabotajes.' };
        const kind = a.kind;
        if (!IMPOSTOR_SABOTAGES.includes(kind)) return { ok: false, error: 'Ese sabotaje no existe.' };
        const w = this.sabWait(kind);
        if (w == null) return { ok: false, error: kind === 'doors' ? 'Ya hay puertas cerradas.' : 'Ya hay un sabotaje en marcha.' };
        if (w > 0) return { ok: false, error: `Todavía no puedes sabotear: faltan ${Math.ceil(w)} segundos.` };
        this.turns++;
        if (kind === 'doors') {
            const r = SHIP.byId[a.room];
            if (!r || r.kind !== 'room') return { ok: false, error: 'Esa sala no está en la nave.' };
            return { ok: true, events: [this.closeDoors(r, pl.index)] };
        }
        // El reactor y el oxígeno se cuentan; en el oxígeno, done son los teclados ya arreglados.
        this.sab = { kind, by: pl.index, t0: this.time, until: IMPOSTOR_CRITICAL.has(kind) ? this.time + this.rules.reactorTime : null, done: [] };
        return { ok: true, events: [{ type: 'sabotage', kind, by: pl.index, until: this.sab.until }] };
    }

    /**
     * En la sala de espera, alguien cambia de color o de gorro (color: el número en IMPOSTOR_COLORS; hat, en IMPOSTOR_HATS).
     * Un color de otra persona no se puede coger; el de un rival de la máquina, sí: se lo cambia por el tuyo (swap).
     */
    look(a, pl) {
        if (!this.lobby) return { ok: false, error: 'El color se elige en la sala de espera, antes de empezar.' };
        const c = a.color, h = a.hat;
        if (!Number.isInteger(c) || c < 0 || c >= IMPOSTOR_COLORS.length) return { ok: false, error: 'Ese color no existe.' };
        if (!Number.isInteger(h) || h < 0 || h >= IMPOSTOR_HATS.length) return { ok: false, error: 'Ese gorro no existe.' };
        const other = this.players.find(q => q !== pl && q.color === c);
        if (other && !other.bot) return { ok: false, error: `El ${IMPOSTOR_COLORS[c].name} ya lo tiene ${other.name}. Elige otro.` };
        let swap = null;
        if (other) { other.color = pl.color; swap = { p: other.index, color: other.color }; }
        pl.color = c; pl.hat = h;
        return { ok: true, events: [{ type: 'look', p: pl.index, color: c, hat: h, swap }] };
    }

    /** Se cierran todas las puertas de una sala. Quien está justo en la puerta se queda a un lado. */
    closeDoors(r, by) {
        for (const d of r.doors) for (const c of d.cells) this.closed[c] = 1;
        this.doorsShut = { room: r.id, by, until: this.time + IMPOSTOR_DOORS_TIME };
        for (const pl of this.players) {
            if (!pl.alive || pl.vent != null || !shipBlocked(pl.x, pl.y, undefined, this.closed)) continue;
            const d = r.doors.reduce((b, d) => Math.hypot(d.x - pl.x, d.y - pl.y) < Math.hypot(b.x - pl.x, b.y - pl.y) ? d : b);
            // Se le aparta hacia dentro de la sala o hacia el pasillo, lo que esté más cerca.
            for (let k = 1; k <= 12; k++) {
                const off = k * 0.15;
                const opts = [[-d.nx, -d.ny], [d.nx, d.ny]].map(([ux, uy]) => ({ x: pl.x + ux * off, y: pl.y + uy * off }));
                const ok = opts.find(o => !shipBlocked(o.x, o.y, undefined, this.closed));
                if (ok) { pl.x = ok.x; pl.y = ok.y; pl.area = shipArea(pl.x, pl.y)?.id || pl.area; pl.warp++; break; }
            }
        }
        return { type: 'doors', room: r.id, by, until: this.doorsShut.until };
    }

    openDoors() {
        const room = this.doorsShut?.room ?? null;
        this.closed.fill(0);
        this.doorsShut = null;
        this.doorCd = IMPOSTOR_DOORS_COOLDOWN;
        return { type: 'doorsOpen', room };
    }

    /** Se acaba el sabotaje: quien tenía la mano en un panel la quita. Al volver las comunicaciones, la barra se pone al día. */
    endSab(by) {
        const kind = this.sab.kind;
        for (const pl of this.players) if (pl.busy?.fix) pl.busy = null;
        this.sab = null;
        this.sabCd = IMPOSTOR_SAB_COOLDOWN;
        this.turns++;
        const events = [{ type: 'fixed', kind, by }];
        if (kind === 'comms' && this.rules.barUpdates === 'siempre') events.push(...this.syncBar());
        return events;
    }

    /**
     * Arreglar un sabotaje en su panel: las luces y las comunicaciones, de una vez; el oxígeno, con un código en
     * cada uno de sus dos teclados; el reactor, con dos personas a la vez, una en cada panel.
     */
    fix(a, pl) {
        if (!pl.alive) return { ok: false, error: 'Los fantasmas no pueden arreglar los sabotajes.' };
        if (!this.sab) return { ok: false, error: 'No hay nada que arreglar.' };
        const panel = SHIP.panels.find(x => x.id === a.panel) || this.panelHere(a.p);
        if (!panel || panel.sab !== this.sab.kind) return { ok: false, error: 'Ese panel no arregla este sabotaje.' };
        if (Math.hypot(panel.x - pl.x, panel.y - pl.y) > IMPOSTOR_CONSOLE + 0.2) return { ok: false, error: 'Estás demasiado lejos del panel.' };
        if (pl.busy) return { ok: false, error: 'Ya estás con otra cosa.' };
        const kind = this.sab.kind;
        if (kind === 'lights' || kind === 'comms') return { ok: true, events: this.endSab(pl.index) };
        if (kind === 'oxygen') {
            if (this.sab.done.includes(panel.id)) return { ok: false, error: 'Ese teclado ya está arreglado.' };
            this.sab.done.push(panel.id);
            this.turns++;
            const left = SHIP.panels.filter(x => x.sab === 'oxygen' && !this.sab.done.includes(x.id));
            const events = [{ type: 'fixPart', p: pl.index, kind, panel: panel.id, left: left.map(x => x.id) }];
            if (!left.length) events.push(...this.endSab(pl.index));
            return { ok: true, events };
        }
        pl.busy = { fix: panel.id, since: this.time };
        pl.ix = pl.iy = 0;
        const events = [{ type: 'fixHold', p: pl.index, panel: panel.id, held: true }];
        const held = this.reactorHeld();
        if (SHIP.panels.filter(x => x.sab === 'reactor').every(x => held.includes(x.id))) events.push(...this.endSab(pl.index));
        return { ok: true, events };
    }

    // ── Los conductos ─────────────────────────────────
    /**
     * Entrar en el conducto que tienes al lado, o salir del conducto en el que estás. Los impostores, cuando quieran;
     * el ingeniero (y la tripulación del escondite), un rato como mucho y con espera entre vez y vez.
     */
    ventInOut(a, pl) {
        if (!pl.alive) return { ok: false, error: 'Los fantasmas no necesitan conductos.' };
        if (!this.rules.vents) return { ok: false, error: 'En esta partida no se usan los conductos.' };
        if (pl.vent != null) {
            const v = SHIP.vents[pl.vent];
            const witnesses = this.witnesses(v.x, v.y, [pl.index]);
            pl.vent = null;
            pl.x = v.x; pl.y = v.y; pl.area = v.area; pl.warp++;
            if (this.ventLimited(pl.index)) pl.ventCd = IMPOSTOR_ROLES.engineer.cd;
            this.turns++;
            return { ok: true, events: [{ type: 'vent', p: pl.index, kind: 'out', vent: v.id, x: v.x, y: v.y, area: v.area, witnesses, cams: this.camsSee(v.x, v.y), ...(a.forced ? { forced: true } : {}) }] };
        }
        if (pl.hidden) return { ok: false, error: 'Mientras eres invisible no puedes meterte en un conducto.' };
        if (!this.canVent(pl.index)) return { ok: false, error: pl.role === 'impostor' ? 'En el escondite, el impostor no va por los conductos.' : 'Solo los impostores van por los conductos.' };
        if (this.frozen(pl)) return { ok: false, error: 'Todavía no puedes moverte.' };
        if (pl.ventCd > 0) return { ok: false, error: `Todavía no puedes volver a meterte en un conducto: faltan ${Math.ceil(pl.ventCd)} segundos.` };
        if (pl.busy) return { ok: false, error: 'Ya estás con otra cosa.' };
        const v = this.ventHere(a.p);
        if (!v) return { ok: false, error: 'No hay ningún conducto cerca.' };
        const witnesses = this.witnesses(v.x, v.y, [pl.index]);
        pl.vent = v.id; pl.ventIn = this.time;
        pl.x = v.x; pl.y = v.y; pl.area = v.area; pl.ix = pl.iy = 0; pl.warp++;
        this.turns++;
        return { ok: true, events: [{ type: 'vent', p: pl.index, kind: 'in', vent: v.id, x: v.x, y: v.y, area: v.area, witnesses, cams: this.camsSee(v.x, v.y), limit: this.ventLimited(pl.index) ? IMPOSTOR_ROLES.engineer.dur : null }] };
    }

    /** Las cámaras que ven un punto (sus números en SHIP.cameras). */
    camsSee(x, y) {
        if (this.commsDown) return [];
        return SHIP.cameras.map((c, i) => Math.hypot(x - c.x, y - c.y) <= IMPOSTOR_CAMERA && shipSight(c.x, c.y, x, y, this.closed) ? i : -1).filter(i => i >= 0);
    }

    /** Lo que se ve ahora en cada cámara, para quien mira: quién (con su sitio, hacia dónde mira y si anda) y los cuerpos. */
    camFeed() {
        if (this.commsDown) return null;
        const out = this.players.filter(q => q.alive && q.vent == null && !q.hidden);
        return SHIP.cameras.map((cam, i) => {
            const sees = (x, y) => Math.hypot(x - cam.x, y - cam.y) <= IMPOSTOR_CAMERA && shipSight(cam.x, cam.y, x, y, this.closed);
            return {
                i, area: cam.area,
                people: out.filter(q => sees(q.x, q.y)).map(q => ({ p: q.index, x: q.x, y: q.y, fx: q.fx, fy: q.fy, mv: this.walking(q), busy: !!q.busy, as: q.shape })),
                bodies: this.bodies.filter(b => sees(b.x, b.y)).map(b => ({ p: b.p, x: b.x, y: b.y })),
            };
        });
    }

    /** Dentro de un conducto, ir a otro de la misma red (a.to). */
    ventTo(a, pl) {
        if (pl.vent == null) return { ok: false, error: 'No estás en un conducto.' };
        const from = SHIP.vents[pl.vent], v = SHIP.vents[a.to];
        if (!v || !from.to.includes(v.id)) return { ok: false, error: 'Ese conducto no está unido a este.' };
        pl.vent = v.id;
        pl.x = v.x; pl.y = v.y; pl.area = v.area; pl.warp++;
        this.turns++;
        return { ok: true, events: [{ type: 'vent', p: pl.index, kind: 'move', vent: v.id, from: from.id, x: v.x, y: v.y, area: v.area, witnesses: [] }] };
    }

    // ── Las consolas ──────────────────────────────────
    /**
     * Mirar una consola. Solo lo sabe quien mira:
     * el mapa dice cuántos hay en cada sala; las cámaras, a quién se ve en cada pasillo;
     * las constantes vitales, quién está vivo y quién muerto (aunque nadie haya encontrado el cuerpo).
     */
    console(a, pl) {
        const c = SHIP.consoles.find(x => x.id === a.id) || this.consoleHere(a.p);
        // El científico mira las constantes vitales desde cualquier sitio mientras le dura la batería.
        const remote = c?.id === 'vitals' && pl.special === 'scientist' && pl.powerUntil > this.time;
        if (!c || (!remote && this.consoleHere(a.p) !== c)) return { ok: false, error: 'No estás junto a esa consola.' };
        if (c.id === 'cams') pl.camsAt = this.time;
        let data;
        const out = this.players.filter(q => q.alive && q.vent == null);
        // Sin comunicaciones, el mapa y las cámaras no tienen señal.
        if (this.commsDown && c.id !== 'vitals') data = { down: true };
        else if (c.id === 'admin') {
            const counts = {};
            for (const q of out) { const r = SHIP.byId[q.area]; if (r?.kind === 'room') counts[r.id] = (counts[r.id] || 0) + 1; }
            data = { counts };
        } else if (c.id === 'cams') {
            // De cada uno, cómo se le ve (el cambiaformas, como otro) y hacia qué sala va, si anda.
            data = {
                cams: this.camFeed().map(f => ({
                    area: f.area,
                    seen: f.people.map(q => q.as ?? q.p),
                    going: f.people.map(q => q.mv ? camHeading(f.area, q.fx, q.fy) : null),
                    bodies: f.bodies.map(b => b.p),
                })),
            };
        } else {
            data = { alive: this.living(), dead: this.players.filter(q => !q.alive).map(q => q.index) };
        }
        return { ok: true, events: [{ type: 'console', p: pl.index, id: c.id, data, secret: true }] };
    }

    kill(a, pl) {
        if (pl.role !== 'impostor') return { ok: false, error: 'Solo los impostores pueden matar.' };
        if (!pl.alive) return { ok: false, error: 'Los fantasmas no pueden matar.' };
        if (pl.hidden) return { ok: false, error: 'Mientras eres invisible no puedes matar: déjate ver primero.' };
        if (this.frozen(pl)) return { ok: false, error: 'Todavía no puedes salir a cazar.' };
        if (pl.killCd > 0) return { ok: false, error: `Todavía no puedes matar: faltan ${Math.ceil(pl.killCd)} segundos.` };
        const v = this.players[a.target];
        if (!v || !v.alive) return { ok: false, error: 'Ahí no hay nadie a quien matar.' };
        if (v.role === 'impostor') return { ok: false, error: 'Es de los tuyos: otro impostor.' };
        if (!this.killTargets(a.p).includes(v.index)) return { ok: false, error: 'Está demasiado lejos.' };
        this.turns++;
        // Un ángel de la guarda lo protege: no muere, y el impostor tiene que esperar otra vez.
        if (v.shieldUntil > this.time) {
            pl.killCd = Math.min(this.rules.killCooldown, 10);
            return { ok: true, events: [{ type: 'shielded', p: pl.index, target: v.index, angel: v.shieldBy, x: v.x, y: v.y }] };
        }
        // Quien lo ve: los vivos que tienen a la vista el sitio (antes de que caiga).
        const witnesses = this.witnesses(v.x, v.y, [pl.index, v.index]);
        v.alive = false; v.busy = null; v.ix = v.iy = 0; v.shape = null;
        if (v.special === 'angel') v.powerCd = 10;
        if (v.vent != null) v.vent = null;
        const body = { p: v.index, x: v.x, y: v.y, area: v.area, t: this.time };
        this.bodies.push(body);
        // El impostor se lanza sobre su víctima.
        pl.busy = null;
        pl.x = v.x; pl.y = v.y; pl.area = v.area; pl.warp++;
        pl.killCd = this.hide ? IMPOSTOR_HIDE.killCd : this.rules.killCooldown;
        const events = [{ type: 'kill', p: pl.index, target: v.index, x: v.x, y: v.y, area: v.area, witnesses, as: pl.shape, cams: this.camsSee(v.x, v.y) }];
        // El ruidoso: al morir, suena una alarma desde su cuerpo, para todos.
        if (v.special === 'noisemaker') events.push({ type: 'alarm', p: v.index, x: v.x, y: v.y, area: v.area });
        events.push(...this.checkWin());
        return { ok: true, events };
    }

    // ── Los poderes de los papeles especiales ─────────
    /**
     * B: el poder de cada uno. El científico enciende las constantes vitales (y las apaga); el ángel, de fantasma,
     * protege a quien tiene más cerca (o a a.target); el cambiaformas se transforma en a.as (o vuelve a ser él) y
     * el espectro se vuelve invisible (o se deja ver).
     */
    power(a, pl) {
        const id = pl.special, R = IMPOSTOR_ROLES[id];
        if (!R || !R.cd) return { ok: false, error: id === 'engineer' ? 'Tu poder son los conductos: ve a uno y métete con la V.' : id === 'noisemaker' ? 'Tu poder es la alarma: sonará sola si te matan.' : 'No tienes ningún poder.' };
        if (pl.vent != null) return { ok: false, error: 'Dentro de un conducto no puedes.' };
        if (id === 'angel') {
            if (pl.alive) return { ok: false, error: 'Cuando seas fantasma, podrás proteger a los vivos.' };
        } else if (!pl.alive) return { ok: false, error: 'Los fantasmas ya no tienen ese poder.' };
        // Lo que está en marcha se deja antes de tiempo.
        if (pl.powerUntil > this.time && id !== 'angel') { this.turns++; return { ok: true, events: this.endPower(pl, true) }; }
        if (pl.powerCd > 0) return { ok: false, error: `Tu poder estará listo dentro de ${Math.ceil(pl.powerCd)} segundos.` };
        this.turns++;
        if (id === 'scientist') {
            pl.powerUntil = this.time + R.dur;
            return { ok: true, events: [{ type: 'power', p: pl.index, on: true, until: pl.powerUntil, secret: true }] };
        }
        if (id === 'angel') {
            const near = this.players.filter(q => q.alive && Math.hypot(q.x - pl.x, q.y - pl.y) <= R.range)
                .sort((x, y) => Math.hypot(x.x - pl.x, x.y - pl.y) - Math.hypot(y.x - pl.x, y.y - pl.y));
            const t = a.target != null ? near.find(q => q.index === a.target) : near[0];
            if (!t) { this.turns--; return { ok: false, error: 'No tienes a nadie cerca a quien proteger: acércate a alguien vivo.' }; }
            t.shieldUntil = this.time + R.dur; t.shieldBy = pl.index;
            pl.powerCd = R.cd;
            return { ok: true, events: [{ type: 'protect', p: pl.index, target: t.index, until: t.shieldUntil, secret: true }] };
        }
        if (id === 'shapeshifter') {
            const q = this.players[a.as];
            if (!q || q === pl || !q.alive) { this.turns--; return { ok: false, error: 'Solo puedes transformarte en alguien que está vivo.' }; }
            const witnesses = this.witnesses(pl.x, pl.y, [pl.index]);
            pl.shape = q.index; pl.powerUntil = this.time + R.dur;
            pl.busy = null;
            return { ok: true, events: [{ type: 'shift', p: pl.index, as: q.index, x: pl.x, y: pl.y, until: pl.powerUntil, witnesses }] };
        }
        // El espectro: quien lo ve desaparecer, lo sabe.
        const witnesses = this.witnesses(pl.x, pl.y, [pl.index]);
        pl.hidden = true; pl.powerUntil = this.time + R.dur;
        pl.busy = null;
        return { ok: true, events: [{ type: 'vanish', p: pl.index, x: pl.x, y: pl.y, until: pl.powerUntil, witnesses }] };
    }

    report(a, pl) {
        if (!pl.alive) return { ok: false, error: 'Los fantasmas no pueden avisar.' };
        const b = this.bodyHere(a.p);
        if (!b) return { ok: false, error: 'No hay ningún cuerpo cerca.' };
        return { ok: true, events: this.startMeeting(a.p, 'body', b) };
    }

    button(a, pl) {
        if (!pl.alive) return { ok: false, error: 'Los fantasmas no pueden pedir una reunión.' };
        if (!this.atButton(a.p)) return { ok: false, error: 'El botón de emergencia está en la mesa del Comedor.' };
        if (pl.meetingsLeft <= 0) return { ok: false, error: 'Ya no te quedan reuniones de emergencia.' };
        if (this.critical) return { ok: false, error: this.sab.kind === 'oxygen' ? 'Sin oxígeno no se puede pedir una reunión: primero, a arreglarlo.' : 'Con el reactor a punto de estallar no se puede pedir una reunión: primero, a arreglarlo.' };
        const w = this.buttonWait();
        if (w > 0) return { ok: false, error: `El botón de emergencia estará listo dentro de ${Math.ceil(w)} segundos.` };
        pl.meetingsLeft--;
        return { ok: true, events: this.startMeeting(a.p, 'button', null) };
    }

    // ── Las reuniones ─────────────────────────────────
    /**
     * Empieza una reunión. Primero se habla (discussTime segundos; nadie vota) y luego se vota (voteTime);
     * si todos dicen que quieren votar ya (ready), se vota antes.
     */
    startMeeting(by, kind, body) {
        this.phase = 'meeting';
        this.turns++;
        // En la reunión se sabe quién ha muerto: los cuerpos encontrados y los que no.
        const dead = this.players.filter(pl => !pl.alive && !pl.knownDead).map(pl => pl.index);
        for (const p of dead) this.players[p].knownDead = true;
        const talk = Math.max(0, +this.rules.discussTime || 0);
        const M = this.meeting = {
            n: ++this.meetings, by, kind, body: body ? body.p : null, area: body ? body.area : SHIP.button.area,
            start: this.time, said: [], votes: new Map(), ready: new Set(), timeout: [],
            stage: talk > 0 ? 'talk' : 'vote', talkUntil: this.time + talk, voteUntil: this.time + talk + this.voteSecs,
        };
        this.bodies = [];
        this.clearPowers();
        // La reunión acaba con los sabotajes y abre las puertas; después, hay que esperar un poco para el siguiente.
        const sab = this.sab?.kind || null, doors = this.doorsShut?.room || null;
        this.sab = null; this.sabCd = Math.max(this.sabCd, 15);
        if (this.doorsShut) { this.closed.fill(0); this.doorsShut = null; }
        this.doorCd = Math.max(this.doorCd, 10);
        this.gather();
        const events = [{ type: 'meeting', by, kind, body: M.body, area: M.area, dead, n: M.n, sab, doors, stage: M.stage, talkUntil: M.talkUntil, voteUntil: M.voteUntil }];
        // La barra de tareas se pone al día en cada reunión (y, si se habían cortado las comunicaciones, vuelve).
        events.push(...this.syncBar());
        return events;
    }

    /** El reloj de la reunión: al acabar el tiempo de hablar, se vota; al acabar el de votar, quien no ha votado salta el voto. */
    meetingTick(dt) {
        const M = this.meeting;
        if (!M) return [];
        this.time += dt;
        if (M.stage === 'talk' && this.time >= M.talkUntil) return this.startVote();
        if (M.stage === 'vote' && this.time >= M.voteUntil) {
            for (const q of this.living()) if (!M.votes.has(q)) { M.votes.set(q, -1); M.timeout.push(q); }
            return this.endVote();
        }
        return [];
    }

    startVote() {
        const M = this.meeting;
        M.stage = 'vote';
        M.voteUntil = this.time + this.voteSecs;
        this.turns++;
        return [{ type: 'voteStart', until: M.voteUntil }];
    }

    meetingAct(a, pl) {
        const M = this.meeting;
        if (this.phase !== 'meeting' || !M) return { ok: false, error: 'Eso solo se hace en una reunión.' };
        if (!pl.alive) return { ok: false, error: 'Los fantasmas no hablan ni votan en la reunión.' };
        if (M.stage === 'result') return { ok: false, error: 'La votación ya ha acabado.' };
        if (a.type === 'say') {
            const line = a.line || {};
            if (!IMPOSTOR_LINES.has(line.kind)) return { ok: false, error: 'Eso no se puede decir.' };
            if (line.who != null && !this.players[line.who]) return { ok: false, error: 'Ese jugador no está en la nave.' };
            if (line.area != null && !SHIP.byId[line.area]) return { ok: false, error: 'Esa sala no está en la nave.' };
            if (M.said.filter(x => x.p === a.p).length >= IMPOSTOR_SAY_MAX) return { ok: false, error: 'Ya has dicho bastante en esta reunión: ahora, a votar.' };
            const clean = { kind: line.kind, ...(line.who != null ? { who: line.who } : {}), ...(line.area != null ? { area: line.area } : {}) };
            M.said.push({ p: a.p, line: clean, t: this.time });
            return { ok: true, events: [{ type: 'say', p: a.p, line: clean }] };
        }
        if (a.type === 'ready') {
            // Quiere votar ya: si lo quieren todos, se acaba el tiempo de hablar.
            if (M.stage !== 'talk') return { ok: false, error: 'Ya se está votando.' };
            if (M.ready.has(a.p)) return { ok: false, error: 'Ya has dicho que quieres votar.' };
            M.ready.add(a.p);
            const events = [{ type: 'ready', p: a.p }];
            if (this.living().every(q => M.ready.has(q))) events.push(...this.startVote());
            return { ok: true, events };
        }
        // 'vote': a alguien vivo, o -1 para saltar el voto.
        if (M.stage === 'talk') return { ok: false, error: `Todavía estáis hablando: la votación empieza dentro de ${Math.max(1, Math.ceil(M.talkUntil - this.time))} segundos.` };
        if (M.votes.has(a.p)) return { ok: false, error: 'Ya has votado.' };
        const target = a.target ?? -1;
        if (target !== -1 && !this.players[target]?.alive) return { ok: false, error: 'Solo se vota a alguien que está vivo.' };
        M.votes.set(a.p, target);
        this.turns++;
        const events = [{ type: 'vote', p: a.p, target: this.rules.anonymousVotes ? null : target }];
        if (this.living().every(q => M.votes.has(q))) events.push(...this.endVote());
        return { ok: true, events };
    }

    /**
     * Se cuentan los votos: sale el más votado si nadie le empata y le ganan a saltar el voto.
     * La reunión se queda en 'result' hasta que la mesa la acaba (resumeShip), cuando todos lo han oído.
     */
    endVote() {
        const M = this.meeting, counts = {};
        let skip = 0;
        for (const t of M.votes.values()) { if (t === -1) skip++; else counts[t] = (counts[t] || 0) + 1; }
        const top = Math.max(0, ...Object.values(counts));
        const best = Object.keys(counts).filter(k => counts[k] === top).map(Number);
        const ejected = top > 0 && best.length === 1 && top > skip ? best[0] : null;
        const anon = this.rules.anonymousVotes;
        const events = [{
            type: 'voteResult', counts, skip, ejected, tie: top > 0 && (best.length > 1 || top === skip),
            votes: anon ? null : [...M.votes.entries()], timeout: anon ? null : M.timeout.slice(),
        }];
        if (ejected != null) {
            const pl = this.players[ejected];
            pl.alive = false; pl.knownDead = true;
            if (pl.special === 'angel') pl.powerCd = 10;
            const left = this.players.filter(q => q.role === 'impostor' && q.alive).length;
            events.push({ type: 'eject', p: ejected, impostor: this.rules.confirmEjects ? pl.role === 'impostor' : null, left: this.rules.confirmEjects ? left : null });
        }
        M.stage = 'result';
        this.turns++;
        const win = this.checkWin();
        if (win.length) { this.meeting = null; return [...events, ...win]; }
        return events;
    }

    /** Después de contar los votos, todos vuelven a la nave, alrededor de la mesa del Comedor. */
    resumeShip() {
        if (this.phase !== 'meeting' || this.meeting?.stage !== 'result') return [];
        this.phase = 'ship';
        this.meeting = null;
        this.buttonAt = this.time + this.rules.buttonWait;
        for (const pl of this.players) if (pl.role === 'impostor') pl.killCd = this.rules.killCooldown;
        this.gather();
        this.turns++;
        return [{ type: 'resume' }];
    }

    // ── Quién gana ────────────────────────────────────
    checkWin() {
        if (this.phase === 'gameOver' || !this.impostors().length) return [];
        const imp = this.players.filter(pl => pl.alive && pl.role === 'impostor').length;
        const crew = this.players.filter(pl => pl.alive && pl.role !== 'impostor').length;
        if (!imp) return this.finish('crew', 'ejected');
        // En el escondite, el impostor tiene que cazarlos a todos.
        if (this.hideSeek) return crew ? [] : this.finish('impostors', 'kills');
        if (imp >= crew) return this.finish('impostors', 'kills');
        return [];
    }

    finish(side, reason) {
        this.phase = 'gameOver';
        this.winners = this.players.filter(pl => (pl.role === 'impostor') === (side === 'impostors')).map(pl => pl.index);
        this.result = { side, reason };
        return [{ type: 'gameOver', side, reason, winners: this.winners.slice(), impostors: this.impostors(), bar: this.taskBar() }];
    }

    // ── Lo que sabe cada uno (en una sala) ───────────
    /**
     * De quién sabe dónde está un jugador: de sí mismo y de quien ve (con un metro de margen, para que en su mesa
     * aparezca al momento). Los fantasmas, de todos los que tienen cerca, a través de las paredes. Fuera de la nave
     * (en la reunión), de todos.
     */
    knownBy(seat) {
        const me = this.players[seat], out = new Set([seat]);
        if (!me || this.phase !== 'ship') { for (const pl of this.players) out.add(pl.index); return out; }
        const vis = this.visionOf(seat) + 1, seesHidden = !me.alive || me.role === 'impostor';
        for (const pl of this.players) {
            if (pl === me || pl.vent != null || (!pl.alive && me.alive) || (pl.hidden && !seesHidden)) continue;
            const d = Math.hypot(pl.x - me.x, pl.y - me.y);
            if (d <= vis && (!me.alive || shipSight(me.x, me.y, pl.x, pl.y, this.closed))) out.add(pl.index);
        }
        return out;
    }

    /**
     * La mesa tal como la ve un jugador: su papel, sus tareas y dónde está; de los demás, dónde están solo
     * los que conoce (knownBy), y los cuerpos que tiene a la vista. light: sin las reglas ni lo dicho en la reunión
     * (es lo que se manda muchas veces por segundo).
     */
    view(seat, light = false) {
        const me = this.players[seat], imp = this.isImpostor(seat), ghost = !!me && !me.alive;
        const known = this.knownBy(seat), M = this.meeting;
        const range = Math.max(me ? this.visionOf(seat) : 0, IMPOSTOR_REPORT) + 1;
        const hs = this.hideSeek, watching = me && this.watchingCams(seat);
        const v = {
            phase: this.phase, round: this.round, time: this.time, winners: this.winners, result: this.result,
            meetings: this.meetings, buttonAt: this.buttonAt, mode: this.rules.mode,
            hide: this.hide ? { go: this.hide.go, until: this.hide.until, final: this.hide.final } : null,
            danger: me ? this.dangerOf(seat) : 0, camsOn: this.camsOn, feed: watching ? this.camFeed() : null,
            bar: this.rules.barUpdates === 'nunca' ? null : { ...this.barShown },
            bodies: me ? this.bodies.filter(b => Math.hypot(b.x - me.x, b.y - me.y) <= range && (ghost || shipSight(me.x, me.y, b.x, b.y, this.closed))).map(b => ({ ...b })) : [],
            sab: this.sab ? { kind: this.sab.kind, until: this.sab.until, t0: this.sab.t0, done: this.sab.done.slice() } : null,
            held: this.reactorHeld(),
            doors: this.doorsShut ? { room: this.doorsShut.room, until: this.doorsShut.until } : null,
            sabCd: imp ? this.sabCd : null, doorCd: imp ? this.doorCd : null,
            impostors: this.phase === 'gameOver' ? this.impostors() : null,
            meeting: M ? {
                n: M.n, by: M.by, kind: M.kind, body: M.body, area: M.area, start: M.start, stage: M.stage,
                talkUntil: M.talkUntil, voteUntil: M.voteUntil, voted: [...M.votes.keys()], ready: [...M.ready],
                ...(light ? {} : { said: M.said.map(s => ({ ...s, line: { ...s.line } })) }),
            } : null,
            players: this.players.map(pl => {
                const self = pl.index === seat, k = known.has(pl.index), mate = imp && pl.role === 'impostor';
                const e = {
                    name: pl.name, known: k, fix: pl.busy?.fix || null, color: pl.color, hat: pl.hat,
                    alive: self || ghost ? pl.alive : pl.alive || !pl.knownDead,
                    // En el escondite, todos saben quién es el impostor.
                    role: self || mate || (hs && pl.role === 'impostor') ? pl.role : null,
                };
                if (k) Object.assign(e, { x: pl.x, y: pl.y, fx: pl.fx, fy: pl.fy, area: pl.area, busy: !!pl.busy, mv: this.walking(pl), vent: self || mate ? pl.vent : null, as: pl.shape, hidden: self || mate ? pl.hidden : false });
                // El ángel sabe a quién protege.
                if (me && pl.shieldBy === seat && pl.shieldUntil > this.time) e.shield = pl.shieldUntil;
                if (self) Object.assign(e, {
                    busy: pl.busy ? { ...pl.busy } : null, warp: pl.warp, tasks: pl.tasks.map(t => ({ ...t, next: t.next?.slice() })), killCd: pl.killCd, meetingsLeft: pl.meetingsLeft,
                    special: pl.special, powerCd: pl.powerCd, powerUntil: pl.powerUntil, ventCd: pl.ventCd, ventIn: pl.ventIn, shape: pl.shape,
                });
                if (mate && !self) Object.assign(e, { special: pl.special, shape: pl.shape });
                return e;
            }),
        };
        if (!light) v.rules = { ...this.rules };
        return v;
    }
}

/**
 * Lo que sabe de un suceso cada jugador de una sala (seat), o null si no se entera.
 * Una muerte o un conducto los saben quien lo hace, quien muere, quien lo ve, los otros impostores y los
 * fantasmas; los demás no se enteran: lo que no se ve tampoco se oye. De las tareas de los demás se sabe poco,
 * y solo de quien se ve: que está con una, y si es el escáner (que se ve). Quién sabotea solo lo saben los impostores.
 */
function impostorEventFor(g, e, seat) {
    if (e.secret) return e.p === seat ? e : null;
    const me = g.players[seat];
    if (!me) return e;
    const ghost = !me.alive, imp = g.isImpostor(seat);
    const sees = p => !!g.players[p] && g.knownBy(seat).has(p);
    // Quien mira las cámaras ve lo que pasa delante de ellas.
    const onCams = () => !!e.cams?.length && g.watchingCams(seat);
    switch (e.type) {
        case 'kill':
            return e.p === seat || e.target === seat || imp || ghost || e.witnesses.includes(seat) || onCams() ? e : null;
        case 'vent':
            return e.p === seat || imp || ghost || e.witnesses?.includes(seat) || onCams() ? e : null;
        // Transformarse, desaparecer y aparecer: quien lo hace, sus compañeros, quien lo ve y los fantasmas.
        case 'shift': case 'unshift': case 'vanish': case 'appear':
            return e.p === seat || imp || ghost || e.witnesses?.includes(seat) ? e : null;
        // El escudo del ángel: lo saben el impostor que lo ha intentado y el ángel.
        case 'shielded':
            return e.p === seat || e.angel === seat ? e : null;
        // Con su sitio, para que suene desde donde está.
        case 'taskStart':
            if (e.p === seat) return e;
            return sees(e.p) ? { type: 'taskStart', p: e.p, task: e.visual ? e.task : null, visible: e.visible, ...(e.visual ? { visual: true } : {}), x: g.players[e.p].x, y: g.players[e.p].y } : null;
        case 'taskStop': case 'taskStep': case 'taskDone':
            if (e.p === seat) return e;
            return sees(e.p) ? { type: e.type, p: e.p, x: g.players[e.p].x, y: g.players[e.p].y } : null;
        case 'sabotage': case 'doors':
            return imp ? e : { ...e, by: null };
        default:
            return e;
    }
}

/**
 * La nave tal como la ve un invitado de una sala. Lo que pasa lo decide el anfitrión, que le manda la mesa
 * (setView, con lo que ve desde su sitio) muchas veces por segundo. Entre una y otra, el invitado anda él
 * mismo con las mismas reglas de la partida (tickSelf), y los demás se mueven poco a poco hacia donde
 * estaban. Su sitio solo lo cambia el anfitrión cuando le lleva a otro (un salto: warp), como al empezar,
 * al ir por un conducto o si dice que está donde no puede estar.
 */
class ImpostorMirror {
    constructor({ names, rules = {}, me = 0 }) {
        this.rules = { ...IMPOSTOR_DEFAULT_RULES, ...rules };
        this.me = me;
        this.players = names.map((name, i) => ({
            name, index: i, x: 0, y: 0, tx: 0, ty: 0, ix: 0, iy: 0, fx: 0, fy: -1, area: null, busy: null, tasks: [],
            bumpT: 0, moved: 0, vent: null, role: i === me ? 'crew' : null, alive: true, knownDead: false, killCd: 0, meetingsLeft: 0,
            warp: -1, stepT: -99, known: i === me, fix: null, color: i % IMPOSTOR_COLORS.length, hat: 0,
            special: null, powerCd: 0, powerUntil: 0, shape: null, hidden: false, shieldUntil: 0, ventCd: 0, ventIn: 0, camsAt: -99,
        }));
        this.round = 0;
        this.phase = 'idle';
        this.time = 0;
        this.hostTime = 0;
        this.turns = 0;
        this.current = 0;
        this.bodies = [];
        this.meeting = null;
        this.meetings = 0;
        this.buttonAt = 0;
        this.sab = null; this.sabCd = 0;
        this.doorsShut = null; this.doorCd = 0;
        this.closed = new Uint8Array(SHIP_W * SHIP_H);
        this.barShown = { done: 0, total: 0 };
        this.held = [];
        this.hide = null;
        this.danger = 0;
        this.camsLit = false;
        this.feed = null;
        this.winners = null;
        this.result = null;
        this.imps = null;
        this.deadSeen = new Set();      // los muertos que sabe este jugador (los ha visto morir, o ha visto su cuerpo)
    }

    impostors() { return this.imps ? this.imps.slice() : this.players.filter(pl => pl.role === 'impostor').map(pl => pl.index); }
    taskBar() { return { ...this.barShown }; }
    reactorHeld() { return this.held.slice(); }
    dangerOf() { return this.danger; }
    get camsOn() { return this.camsLit; }
    camFeed() { return this.feed; }
    watchingCams() { return !!this.feed; }

    setView(v) {
        const fresh = v.round !== this.round;
        if (fresh) {
            this.bodies = []; this.deadSeen.clear(); this.imps = null;
            for (const pl of this.players) pl.role = pl.index === this.me ? 'crew' : null;
        }
        this.phase = v.phase; this.round = v.round; this.winners = v.winners; this.result = v.result;
        if (v.rules) this.rules = { ...IMPOSTOR_DEFAULT_RULES, ...v.rules };
        this.meetings = v.meetings; this.buttonAt = v.buttonAt;
        this.hide = v.hide ? { ...v.hide } : null;
        this.danger = v.danger || 0;
        this.camsLit = !!v.camsOn;
        this.feed = v.feed || null;
        // El reloj del anfitrión: si el tuyo se ha ido lejos, se pone en hora de golpe; si no, poco a poco (tickSelf).
        this.hostTime = v.time;
        if (fresh || Math.abs(v.time - this.time) > 1.5) this.time = v.time;
        if (v.bar) this.barShown = { ...v.bar };
        this.sab = v.sab ? { ...v.sab, done: v.sab.done.slice() } : null;
        this.held = v.held || [];
        this.setDoors(v.doors);
        if (v.sabCd != null) this.sabCd = v.sabCd;
        if (v.doorCd != null) this.doorCd = v.doorCd;
        if (v.impostors) { this.imps = v.impostors.slice(); for (const p of this.imps) this.players[p].role = 'impostor'; }
        this.meeting = v.meeting ? {
            ...v.meeting, said: v.meeting.said || (this.meeting?.n === v.meeting.n ? this.meeting.said : []),
            votes: new Map(v.meeting.voted.map(p => [p, true])), ready: new Set(v.meeting.ready),
        } : null;
        // Los cuerpos que has visto se quedan donde estaban hasta la reunión.
        if (v.phase !== 'ship') this.bodies = [];
        for (const b of v.bodies) if (!this.bodies.some(x => x.p === b.p)) { this.bodies.push({ ...b }); this.deadSeen.add(b.p); }
        v.players.forEach((e, i) => this.setPlayer(this.players[i], e, i === this.me));
    }

    setPlayer(pl, e, self) {
        pl.name = e.name;
        if (e.role) pl.role = e.role;
        pl.alive = e.alive && (self || !this.deadSeen.has(pl.index));
        pl.knownDead = !e.alive;
        pl.fix = e.fix;
        if (e.color != null) { pl.color = e.color; pl.hat = e.hat; }
        pl.shieldUntil = e.shield || 0;
        if (e.special !== undefined) pl.special = e.special;
        if (self) {
            pl.known = true;
            pl.tasks = e.tasks.map(t => ({ ...t }));
            pl.busy = e.busy;
            pl.killCd = e.killCd;
            pl.meetingsLeft = e.meetingsLeft;
            pl.vent = e.vent ?? null;
            pl.powerCd = e.powerCd; pl.powerUntil = e.powerUntil; pl.ventCd = e.ventCd; pl.ventIn = e.ventIn;
            pl.shape = e.shape ?? null; pl.hidden = !!e.hidden;
            // Tu sitio lo llevas tú; solo se toma el del anfitrión cuando te lleva a otro.
            if (e.warp > pl.warp) {
                pl.warp = e.warp;
                pl.x = e.x; pl.y = e.y; pl.fx = e.fx; pl.fy = e.fy; pl.area = e.area;
                pl.ix = pl.iy = 0;
                this.warped = true;
            }
            return;
        }
        const was = pl.known;
        pl.known = !!e.known;
        if (!pl.known) { pl.moved = 0; return; }
        pl.tx = e.x; pl.ty = e.y; pl.fx = e.fx; pl.fy = e.fy; pl.area = e.area; pl.busy = e.busy; pl.vent = e.vent ?? null;
        pl.shape = e.as ?? null; pl.hidden = !!e.hidden;
        // Quien aparece, o quien ha saltado lejos (por un conducto, al empezar la reunión), se pone en su sitio de golpe.
        if (!was || Math.hypot(e.x - pl.x, e.y - pl.y) > 3) { pl.x = e.x; pl.y = e.y; }
        if (e.mv) pl.stepT = this.time;
    }

    setDoors(d) {
        const room = d?.room ?? null;
        this.doorsShut = d ? { ...d } : null;
        if (room === this.closedRoom) return;
        this.closedRoom = room;
        this.closed.fill(0);
        if (room) for (const dr of SHIP.byId[room].doors) for (const c of dr.cells) this.closed[c] = 1;
    }

    /** Lo que aprende de un suceso que le manda el anfitrión. */
    observe(e) {
        if (e.type === 'kill') {
            this.deadSeen.add(e.target);
            const v = this.players[e.target];
            if (v) v.alive = false;
        } else if (e.type === 'gameOver') {
            this.imps = e.impostors.slice();
            for (const p of this.imps) this.players[p].role = 'impostor';
            if (e.bar) this.finalBar = { ...e.bar };
        } else if (e.type === 'role' && e.p === this.me) {
            this.players[this.me].role = e.role;
            this.players[this.me].special = e.special || null;
            for (const q of e.mates || []) this.players[q].role = 'impostor';
        } else if (e.type === 'round' && e.seekers) {
            for (const q of e.seekers) this.players[q].role = 'impostor';
        } else if (e.type === 'taskBar') {
            this.barShown = { done: e.done, total: e.total };
        } else if (e.type === 'look') {
            Object.assign(this.players[e.p], { color: e.color, hat: e.hat });
            if (e.swap) this.players[e.swap.p].color = e.swap.color;
        }
    }

    /**
     * Entre un paquete del anfitrión y otro: corre el tiempo (al ritmo del suyo), andas tú y los demás se
     * acercan a donde estaban. Devuelve tus choques y cambios de zona, como tick.
     */
    tickSelf(dt) {
        this.hostTime += dt;
        if (this.phase !== 'ship' && this.phase !== 'meeting') return [];
        this.time += dt + (this.hostTime - this.time) * Math.min(1, dt * 2);
        if (this.phase !== 'ship') return [];
        if (!this.sab) this.sabCd = Math.max(0, this.sabCd - dt);
        if (!this.doorsShut) this.doorCd = Math.max(0, this.doorCd - dt);
        const k = Math.min(1, dt * 10), me = this.players[this.me];
        for (const pl of this.players) {
            if (pl === me) continue;
            pl.moved = 0;
            if (!pl.known) continue;
            const x0 = pl.x, y0 = pl.y;
            pl.x += (pl.tx - pl.x) * k; pl.y += (pl.ty - pl.y) * k;
            if (this.time - pl.stepT < 0.25) pl.moved = Math.hypot(pl.x - x0, pl.y - y0);
        }
        if (me.role === 'impostor' && me.alive) me.killCd = Math.max(0, me.killCd - dt);
        if (me.special && !(me.powerUntil > this.time)) me.powerCd = Math.max(0, me.powerCd - dt);
        if (me.vent == null) me.ventCd = Math.max(0, me.ventCd - dt);
        return this.moveOne(me, dt);
    }
}
// Lo que se calcula igual en la partida y en la mesa del invitado.
for (const k of ['visionOf', 'perceive', 'taskHere', 'killTargets', 'bodyHere', 'atButton', 'buttonWait', 'ventHere', 'panelHere',
    'consoleHere', 'sabWait', 'slideCorner', 'moveOne', 'input', 'walking', 'isImpostor', 'areaOf', 'pending', 'living', 'impostorCount',
    'shown', 'visualTask', 'canVent', 'ventLimited', 'frozen', 'taskCount']) {
    ImpostorMirror.prototype[k] = ImpostorGame.prototype[k];
}
for (const k of ['n', 'speed', 'vision', 'killRange', 'lightsOff', 'commsDown', 'critical', 'voteSecs', 'hideSeek', 'lobby']) {
    Object.defineProperty(ImpostorMirror.prototype, k, Object.getOwnPropertyDescriptor(ImpostorGame.prototype, k));
}

// Para las pruebas con Node (en el navegador no hace nada).
if (typeof module !== 'undefined') {
    const R = require('./rules.js');
    Object.assign(globalThis, { makeRng: R.makeRng });
    module.exports = {
        IMPOSTOR_DEFAULT_RULES, IMPOSTOR_SPEED, IMPOSTOR_RADIUS, IMPOSTOR_VISION, IMPOSTOR_USE, IMPOSTOR_TASKS,
        IMPOSTOR_REPORT, IMPOSTOR_KILL_RANGE, IMPOSTOR_IMP_VISION, IMPOSTOR_SAY_MAX, impostorsFor,
        IMPOSTOR_VENT_USE, IMPOSTOR_CONSOLE, IMPOSTOR_LIGHTS, IMPOSTOR_SAB_COOLDOWN, IMPOSTOR_DOORS_TIME, IMPOSTOR_DOORS_COOLDOWN, IMPOSTOR_CAMERA,
        IMPOSTOR_SABOTAGES, IMPOSTOR_CRITICAL, IMPOSTOR_LOBBY_ROOM, IMPOSTOR_HIDE, IMPOSTOR_ROLES, IMPOSTOR_COLORS, IMPOSTOR_HATS, IMPOSTOR_WATCH, impostorLooks, camHeading,
        SHIP, shipArea, tableDist, shipTile, shipSolid, shipBlocked, shipSight, shipClear, shipPath, shipStandAt, pathLength, toPlace, inPlace,
        ImpostorGame, ImpostorMirror, impostorEventFor,
    };
}
