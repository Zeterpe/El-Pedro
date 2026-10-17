/* =============================================
   EL PEDRO — games.js
   Los juegos del salón: nombre, cómo se presentan,
   sus reglas de la casa, cómo se explican y qué
   partida los juega. Para añadir un juego nuevo se
   añade aquí, con sus reglas y su partida.
   ============================================= */
'use strict';

const yesNo = v => v ? 'sí' : 'no';
const winsText = (v, word) => v === 0 ? 'sin límite' : v === 1 ? `1 ${word}` : `${v} ${word}s`;

const GAMES = {
    pedro: {
        id: 'pedro',
        name: 'El Pedro',
        kind: 'Juego de memoria',
        tagline: 'Cartas boca abajo: recuerda las tuyas, quema las iguales y canta Pedro cuando tengas la suma más baja.',
        players: 'De 2 a 6 jugadores',
        fan: [{ rank: 1, suit: 'oros' }, null, { rank: 12, suit: 'copas' }, null],
        defaults: DEFAULT_RULES,
        rulesKey: 'rules',
        rivalsKey: 'rivals',
        roundWord: 'ronda',
        maxPlayers: MAX_PLAYERS,
        get Match() { return PedroMatch; },
        summary: r => Txt.rules({ ...DEFAULT_RULES, ...r }),
        practice(r) { return { ...r, winsToWin: 1 }; },
        setupDefs(s, r) {
            return [
                { label: 'Ayuda de memoria', values: [false, true], get: () => s.memoryHelp, set: v => { s.memoryHelp = v; }, text: v => v ? 'sí, recordarme las cartas que he visto' : 'no' },
                { label: 'Rondas para ganar', values: [1, 3, 5, 0], get: () => r.winsToWin, set: v => { r.winsToWin = v; }, text: v => winsText(v, 'ronda') },
            ];
        },
        houseDefs(r) {
            return [
                { label: 'Baraja', values: [48, 40], get: () => r.deck, set: v => { r.deck = v; }, text: v => v === 48 ? 'del 1 al 12, 48 cartas' : 'sin ochos ni nueves, 40 cartas' },
                { label: 'Cartas para cada jugador', values: [4, 5, 6], get: () => r.handSize, set: v => { r.handSize = v; r.peekStart = Math.min(r.peekStart, v); } },
                { label: 'Cartas que miras al empezar', values: [0, 1, 2, 3], get: () => r.peekStart, set: v => { r.peekStart = Math.min(v, r.handSize); } },
                { label: 'Poderes de las figuras', values: [true, false], get: () => r.powers, set: v => { r.powers = v; }, text: v => v ? 'sí: la sota cambia, el caballo mira y el rey hace las dos cosas' : 'no' },
                { label: 'Quemar cartas', values: [true, false], get: () => r.burn, set: v => { r.burn = v; }, text: yesNo },
                { label: 'Quemar cartas de los demás', values: [true, false], get: () => r.burnOthers, set: v => { r.burnOthers = v; }, text: yesNo },
                { label: 'Al quemar la carta de otro, le das una tuya', values: [true, false], get: () => r.burnGive, set: v => { r.burnGive = v; }, text: yesNo },
                { label: 'Cartas de castigo por quemar mal', values: [1, 2], get: () => r.penaltyCards, set: v => { r.penaltyCards = v; } },
                { label: 'Las cartas de quien canta Pedro no se tocan', values: [true, false], get: () => r.protectCaller, set: v => { r.protectCaller = v; }, text: yesNo },
                { label: 'Se puede coger la carta de la mesa', values: [false, true], get: () => r.takeFromTable, set: v => { r.takeFromTable = v; }, text: yesNo },
                { label: 'El siete vale menos 1 punto', values: [false, true], get: () => r.sevenMinus, set: v => { r.sevenMinus = v; }, text: v => v ? 'sí: el siete resta un punto en vez de sumar 7' : 'no, vale 7 como siempre' },
                { label: 'Si todas tus cartas son del mismo número, valen 1 punto', values: [true, false], get: () => r.allEqualOne, set: v => { r.allEqualOne = v; }, text: yesNo },
                { label: 'Si se acaba el mazo', values: ['reshuffle', 'end'], get: () => r.deckOut, set: v => { r.deckOut = v; }, text: v => v === 'reshuffle' ? 'se barajan las cartas de la mesa y se sigue' : 'se descubren las cartas' },
                { label: 'Rondas para ganar la partida', values: [1, 3, 5, 0], get: () => r.winsToWin, set: v => { r.winsToWin = v; }, text: v => winsText(v, 'ronda') },
            ];
        },
        rulesHtml: `
            <h2>El objetivo</h2>
            <p>Gana la ronda quien tenga menos puntos al final. Cada carta vale su número: el as vale 1 y el rey vale 12. La sota vale 10 y el caballo 11.</p>
            <p>Si todas tus cartas son del mismo número, por ejemplo tres caballos, valen solo 1 punto.</p>
            <p>En Reglas de la casa, quien crea la mesa puede hacer que el siete valga menos 1 punto: entonces el siete es la mejor carta, porque resta. Si todas tus cartas son sietes, suman lo que valen, que es menos que 1.</p>
            <h2>El reparto</h2>
            <p>Cada jugador recibe 4 cartas boca abajo. Al empezar solo puedes mirar 2, una vez. ¡Recuérdalas! Las cartas no se cambian de sitio: tu carta 1 sigue siendo tu carta 1.</p>
            <h2>Tu turno</h2>
            <p>Robas una carta del mazo. Puedes cambiarla por una de las tuyas, y la tuya va a la mesa, o tirarla a la mesa sin quedártela.</p>
            <h2>Los poderes</h2>
            <p>Si robas una figura del mazo y la tiras a la mesa, puedes usar su poder. Es opcional.</p>
            <ul>
                <li>La sota: cambias dos cartas de sitio sin mirarlas. Pueden ser tuyas y de otro, o de dos rivales.</li>
                <li>El caballo: miras una carta, tuya o de otro.</li>
                <li>El rey: miras una carta y después puedes cambiar dos.</li>
            </ul>
            <h2>Quemar</h2>
            <p>Si tienes una carta igual a la de arriba de la mesa, puedes quemarla: la sueltas en la mesa y te la quitas de encima. Puedes quemar en cualquier momento, también en el turno de otro, y tantas veces como quieras. Basta con tocar la carta. Puedes quemar tus cartas o las de los demás, si sabes cuáles son.</p>
            <p>Si quemas la carta de otro, le das una de las tuyas a cambio. Si te equivocas, la carta vuelve a su sitio y te llevas una carta de castigo.</p>
            <p>Si alguien se queda sin cartas, gana la ronda al momento y se descubren todas.</p>
            <h2>Cantar Pedro</h2>
            <p>Cuando creas que tienes la suma más baja, canta Pedro al empezar tu turno, antes de robar. Los demás juegan una vez más y, cuando vuelve a ti, se descubren todas las cartas. Desde que cantas, nadie puede tocar tus cartas.</p>
            <p>Gana la ronda la suma más baja. Cada ronda ganada te da una victoria.</p>
            <h2>Las teclas</h2>
            <ul>
                <li>R: robar del mazo. P: cantar Pedro.</li>
                <li>Del 1 al 4: tus cartas. Con una carta robada, la cambias por esa. T: tirarla a la mesa.</li>
                <li>Para quemar, en cualquier momento: tu carta con su número, o la de otro con las flechas y Enter. Q: te dice qué carta hay en la mesa.</li>
                <li>I: cómo va la partida. C: tus cartas. Espacio: repetir lo último. H: las teclas. Escape: pausa.</li>
                <li>Con lector de pantalla, la mesa recibe las teclas directamente. Si alguna no responde, pasa al modo foco (en NVDA y JAWS, la tecla del lector y Espacio) o quita la navegación rápida de VoiceOver (flecha izquierda y flecha derecha a la vez, o VO Q).</li>
            </ul>
            <p>En el móvil, todo tiene su botón en la pantalla.</p>`,
    },

    brisca: {
        id: 'brisca',
        name: 'La Brisca',
        kind: 'Juego de bazas',
        tagline: 'Tres cartas en la mano y un triunfo que manda: llévate las bazas con más puntos y pasa de 60.',
        players: 'De 2 a 6 jugadores, también por parejas',
        fan: [{ rank: 1, suit: 'espadas' }, { rank: 3, suit: 'bastos' }, { rank: 7, suit: 'copas' }],
        defaults: BRISCA_DEFAULT_RULES,
        rulesKey: 'briscaRules',
        rivalsKey: 'briscaRivals',
        roundWord: 'mano',
        maxPlayers: 6,
        pairs: (r, n) => !!r.pairs && n >= 4 && n % 2 === 0,
        get Match() { return BriscaMatch; },
        summary: r => Txt.briscaRules({ ...BRISCA_DEFAULT_RULES, ...r }),
        practice(r) { return { ...r, winsToWin: 1, showPoints: true }; },
        setupDefs(s, r) {
            return [
                { label: 'Manos para ganar', values: [1, 2, 3, 5, 0], get: () => r.winsToWin, set: v => { r.winsToWin = v; }, text: v => winsText(v, 'mano') },
                { label: 'Con 3 o 5 rivales, por parejas', values: [true, false], get: () => r.pairs, set: v => { r.pairs = v; }, text: v => v ? 'sí: tu compañero es el de enfrente' : 'no, cada uno por su cuenta' },
                { label: 'Tocar dos veces para jugar una carta', values: [true, false], get: () => s.confirmPlay, set: v => { s.confirmPlay = v; }, text: v => v ? 'sí: el primer toque te la dice' : 'no: se juega al tocarla' },
            ];
        },
        houseDefs(r) {
            return [
                { label: 'Baraja', values: [40, 48], get: () => r.deck, set: v => { r.deck = v; }, text: v => v === 40 ? 'sin ochos ni nueves, 40 cartas' : 'del 1 al 12, 48 cartas' },
                { label: 'Con 4 o 6 jugadores, por parejas', values: [true, false], get: () => r.pairs, set: v => { r.pairs = v; }, text: v => v ? 'sí: cada uno con el de enfrente' : 'no' },
                { label: 'Cambiar la muestra', values: ['sieteYDos', 'siete', 'no'], get: () => r.swapTrump, set: v => { r.swapTrump = v; }, text: v => ({ sieteYDos: 'con el siete de triunfo las altas, y con el dos las bajas', siete: 'solo con el siete de triunfo', no: 'no' })[v] },
                { label: 'Cuándo se cambia la muestra', values: ['turno', 'salir'], get: () => r.swapWhen, set: v => { r.swapWhen = v; }, text: v => v === 'turno' ? 'en cualquier turno tuyo, antes de jugar' : 'solo al salir, después de ganar una baza' },
                { label: 'Cantar las 20 y las 40', values: [false, true], get: () => r.cantes, set: v => { r.cantes = v; }, text: v => v ? 'sí: rey y caballo del mismo palo, después de ganar una baza' : 'no' },
                { label: 'Arrastre: al acabarse el mazo, asistir y montar', values: [false, true], get: () => r.arrastre, set: v => { r.arrastre = v; }, text: yesNo },
                { label: 'Diez de últimas', values: [false, true], get: () => r.lastTen, set: v => { r.lastTen = v; }, text: v => v ? 'sí: la última baza vale 10 puntos más' : 'no' },
                { label: 'Contar los puntos durante la mano', values: [true, false], get: () => r.showPoints, set: v => { r.showPoints = v; }, text: v => v ? 'sí' : 'no, solo al final' },
                { label: 'Manos para ganar la partida', values: [1, 2, 3, 5, 0], get: () => r.winsToWin, set: v => { r.winsToWin = v; }, text: v => winsText(v, 'mano') },
            ];
        },
        rulesHtml: `
            <h2>El objetivo</h2>
            <p>Llevarte bazas con cartas que valen puntos. En la baraja hay 120 puntos: gana la mano quien consiga más de 60. Si hay empate a 60, nadie gana.</p>
            <h2>Lo que vale cada carta</h2>
            <p>El as vale 11 puntos, el tres 10, el rey 4, el caballo 3 y la sota 2. Las demás no valen puntos.</p>
            <p>Para ganar una baza manda este orden, de mayor a menor: el as, el tres, el rey, el caballo, la sota, el siete, el seis, el cinco, el cuatro y el dos. El tres gana al rey.</p>
            <h2>El reparto y el triunfo</h2>
            <p>Se juega con la baraja de 40 cartas. Cada jugador recibe 3 cartas, que solo ves tú. La siguiente se pone boca arriba debajo del mazo: es la muestra, y su palo es el triunfo, el que manda.</p>
            <p>Si sois 3 jugadores, se quita el dos de oros para que el reparto sea igual.</p>
            <h2>Cada baza</h2>
            <p>Sale el jugador que va después de quien reparte. Cada uno juega una carta, por turno. No hace falta jugar del mismo palo.</p>
            <p>Gana la baza el triunfo más alto. Si nadie ha jugado triunfo, gana la carta más alta del palo que salió. Jugar un triunfo cuando ha salido otro palo se llama fallar.</p>
            <p>Quien gana la baza se la lleva, roba primero y sale en la siguiente. Después de cada baza, todos roban una carta. La última carta del mazo es la muestra.</p>
            <h2>Cambiar la muestra</h2>
            <p>Si tienes el siete de triunfo, puedes cambiarlo por la muestra cuando es una figura, un tres o un as. Con el dos de triunfo, puedes cambiarlo cuando la muestra es un cuatro, un cinco, un seis o un siete. Se hace en tu turno, antes de jugar, mientras quede mazo. En Reglas de la casa puedes dejarlo solo para cuando sales, después de ganar una baza.</p>
            <h2>Por parejas</h2>
            <p>Con 4 o 6 jugadores se juega por parejas: tu compañero es el de enfrente, y sumáis los puntos de vuestras bazas.</p>
            <h2>Reglas de la casa</h2>
            <p>Puedes jugar con la baraja de 48 cartas, cantar las 20 y las 40 como en el tute, jugar con arrastre al final, con las diez de últimas, o sin contar los puntos hasta el final.</p>
            <h2>Las teclas</h2>
            <ul>
                <li>Del 1 al 3: tus cartas. La primera vez te dice cuál es y la segunda la juega. Enter juega la carta elegida.</li>
                <li>M: las cartas de la mesa y quién va ganando. U: la última baza. T: el triunfo y la muestra. P: los puntos.</li>
                <li>X: cambiar la muestra. V: cantar las 20 o las 40, si se juega con cantes.</li>
                <li>I: cómo va la partida. C: tus cartas. Espacio: repetir lo último. H: las teclas. Escape: pausa.</li>
                <li>Con lector de pantalla, la mesa recibe las teclas directamente. Si alguna no responde, pasa al modo foco (en NVDA y JAWS, la tecla del lector y Espacio) o quita la navegación rápida de VoiceOver (flecha izquierda y flecha derecha a la vez, o VO Q).</li>
            </ul>
            <p>En el móvil, todo tiene su botón en la pantalla.</p>`,
    },

    parchis: {
        id: 'parchis',
        name: 'El Parchís',
        kind: 'Juego de tablero',
        tagline: 'Sal con un 5, come y cuenta 20, mete tus fichas en la meta y cuenta 10. Cada uno por su cuenta o por parejas.',
        players: 'De 2 a 4 jugadores, también por parejas',
        art: () => ParchisArt.tile(),
        defaults: PARCHIS_DEFAULT_RULES,
        rulesKey: 'parchisRules',
        rivalsKey: 'parchisRivals',
        roundWord: null,
        maxPlayers: 4,
        pairs: (r, n) => !!r.pairs && n === 4,
        get Match() { return ParchisMatch; },
        summary: r => Txt.parchisRules({ ...PARCHIS_DEFAULT_RULES, ...r }),
        practice(r) { return { ...r, pieces: 2 }; },
        setupDefs(s, r) {
            return [
                { label: 'Con 3 rivales, por parejas', values: [false, true], get: () => r.pairs, set: v => { r.pairs = v; }, text: v => v ? 'sí: tu pareja es el de enfrente' : 'no, cada uno por su cuenta' },
                { label: 'Fichas para cada uno', values: [4, 3, 2], get: () => r.pieces, set: v => { r.pieces = v; }, text: v => v === 4 ? '4, las de siempre' : `${v}, para una partida más corta` },
                { label: 'Tocar dos veces para mover una ficha', values: [true, false], get: () => s.confirmPlay, set: v => { s.confirmPlay = v; }, text: v => v ? 'sí: el primer toque te dice adónde va' : 'no: se mueve al tocarla' },
            ];
        },
        houseDefs(r) {
            return [
                { label: 'Fichas para cada uno', values: [4, 3, 2], get: () => r.pieces, set: v => { r.pieces = v; }, text: v => v === 4 ? '4, las de siempre' : `${v}, para una partida más corta` },
                { label: 'Con 4 jugadores, por parejas', values: [false, true], get: () => r.pairs, set: v => { r.pairs = v; }, text: v => v ? 'sí: cada uno con el de enfrente' : 'no' },
                { label: 'Al comer una ficha, cuentas', values: [20, 10, 0], get: () => r.eatCount, set: v => { r.eatCount = v; }, text: v => v ? String(v) : 'nada' },
                { label: 'Al meter una ficha en la meta, cuentas', values: [10, 20, 0], get: () => r.metaCount, set: v => { r.metaCount = v; }, text: v => v ? String(v) : 'nada' },
                { label: 'Sin fichas en casa, el 6 cuenta 7', values: [true, false], get: () => r.sixSeven, set: v => { r.sixSeven = v; }, text: yesNo },
                { label: 'Al tercer 6 seguido, la última ficha movida vuelve a casa', values: [true, false], get: () => r.threeSixes, set: v => { r.threeSixes = v; }, text: yesNo },
                { label: 'Con un 6, hay que abrir tu barrera', values: [true, false], get: () => r.openBarrier, set: v => { r.openBarrier = v; }, text: yesNo },
                { label: 'Para entrar en la meta', values: [true, false], get: () => r.exact, set: v => { r.exact = v; }, text: v => v ? 'con la cuenta justa' : 'si te pasas, rebotas' },
            ];
        },
        rulesHtml: `
            <h2>El objetivo</h2>
            <p>Llevar tus cuatro fichas desde tu casa hasta la meta, en el centro del tablero, dando la vuelta entera. Gana quien las mete todas primero. Por parejas, gana la pareja que mete antes todas las suyas.</p>
            <h2>El tablero</h2>
            <p>Hay 68 casillas numeradas. Cada color tiene su casa en una esquina, su salida, y un pasillo de 7 casillas de su color que lleva a la meta. Las fichas avanzan en sentido contrario a las agujas del reloj. En el juego, tu casa está siempre abajo a la derecha.</p>
            <p>Los seguros son las casillas con un círculo, y también las salidas: ahí no te pueden comer.</p>
            <h2>Tu turno</h2>
            <p>Tiras el dado y mueves una ficha lo que marca. Si puedes mover, tienes que hacerlo. Con un 6 vuelves a tirar; si no te quedan fichas en casa, el 6 cuenta 7. Al tercer 6 seguido, la última ficha que has movido vuelve a casa, salvo si ya está en el pasillo.</p>
            <h2>Salir de casa</h2>
            <p>Las fichas salen de casa con un 5: si tienes fichas en casa y sacas un 5, hay que sacar una. Si en tu salida ya hay dos fichas y una es de otro color, te la comes.</p>
            <h2>Comer</h2>
            <p>Si tu ficha cae en una casilla donde hay una sola ficha de otro color, y no es un seguro, te la comes: vuelve a su casa y tú cuentas 20, es decir, avanzas 20 casillas con la ficha que quieras.</p>
            <h2>Las barreras</h2>
            <p>Dos fichas en la misma casilla forman una barrera: nadie puede pasar por ella, ni siquiera tú. En una casilla caben como mucho dos fichas. Si tienes una barrera y sacas un 6, tienes que abrirla.</p>
            <h2>La meta</h2>
            <p>A la meta se entra con la cuenta justa. Cuando metes una ficha, cuentas 10 con otra. Si no puedes contar con ninguna ficha, la cuenta se pierde.</p>
            <h2>Por parejas</h2>
            <p>Con 4 jugadores se puede jugar por parejas: vas con el de enfrente. A tu pareja no te la puedes comer, y podéis hacer barrera juntos. Cuando metes todas tus fichas, sigues tirando y mueves las de tu pareja.</p>
            <h2>Reglas de la casa</h2>
            <p>Puedes jugar con 3 o 2 fichas para que la partida sea más corta, cambiar lo que se cuenta al comer y al llegar a la meta, quitar el 7 del seis, el castigo del tercer 6 o la obligación de abrir la barrera, y jugar con rebote en la meta.</p>
            <h2>Las teclas</h2>
            <ul>
                <li>T: tirar el dado.</li>
                <li>Del 1 al 4: tus fichas. La primera vez te dice adónde va y la segunda la mueve. Enter mueve la elegida. Si solo puedes mover una, se mueve sola.</li>
                <li>M: dónde está cada ficha. P: peligros, las fichas que tienes cerca por detrás y por delante. D: el último dado.</li>
                <li>I: cómo va la partida. C: tus fichas. Espacio: repetir lo último. H: las teclas. Escape: pausa.</li>
                <li>Con lector de pantalla, la mesa recibe las teclas directamente. Si alguna no responde, pasa al modo foco (en NVDA y JAWS, la tecla del lector y Espacio) o quita la navegación rápida de VoiceOver (flecha izquierda y flecha derecha a la vez, o VO Q).</li>
            </ul>
            <p>En el móvil, todo tiene su botón en la pantalla. También puedes tocar el dado y tus fichas en el tablero.</p>`,
    },

    trivial: {
        id: 'trivial',
        name: 'El Trivial',
        kind: 'Juego de preguntas',
        tagline: 'Recorre la rueda, contesta preguntas de seis categorías con cuatro respuestas y consigue todos los quesitos. Cada uno por su cuenta o por equipos.',
        players: 'De 2 a 6 jugadores, también por equipos',
        art: () => TrivialArt.tile(),
        defaults: TRIVIAL_DEFAULT_RULES,
        rulesKey: 'trivialRules',
        rivalsKey: 'trivialRivals',
        roundWord: null,
        maxPlayers: 6,
        teamWord: 'Equipos',
        pairs: (r, n) => !!r.teams && n >= 4 && n % 2 === 0,
        get Match() { return TrivialMatch; },
        summary: r => Txt.trivialRules({ ...TRIVIAL_DEFAULT_RULES, ...r }),
        practice(r) { return { ...r, wedges: 3 }; },
        setupDefs(s, r) {
            return [
                { label: 'Con 3 o 5 rivales, por equipos', values: [false, true], get: () => r.teams, set: v => { r.teams = v; }, text: v => v ? 'sí: tu equipo son los de los sitios alternos' : 'no, cada uno por su cuenta' },
                { label: 'Quesitos para ganar', values: [6, 4, 3], get: () => r.wedges, set: v => { r.wedges = v; }, text: v => v === 6 ? '6, los de siempre' : `${v}, para una partida más corta` },
                { label: 'Preguntas', values: ['todas', 'faciles', 'dificiles'], get: () => r.level, set: v => { r.level = v; }, text: v => ({ todas: 'de todo un poco', faciles: 'solo fáciles', dificiles: 'medias y difíciles' })[v] },
                { label: 'Tocar dos veces para elegir', values: [true, false], get: () => s.confirmPlay, set: v => { s.confirmPlay = v; }, text: v => v ? 'sí: el primer toque te dice la respuesta' : 'no: se elige al tocarla' },
            ];
        },
        houseDefs(r) {
            return [
                { label: 'Quesitos para ganar', values: [6, 4, 3], get: () => r.wedges, set: v => { r.wedges = v; }, text: v => v === 6 ? '6, los de siempre' : `${v}, para una partida más corta` },
                { label: 'Con 4 o 6 jugadores, por equipos', values: [false, true], get: () => r.teams, set: v => { r.teams = v; }, text: v => v ? 'sí: los sitios alternos, con una ficha por equipo' : 'no' },
                { label: 'Pregunta final en el centro', values: [true, false], get: () => r.hubFinal, set: v => { r.hubFinal = v; }, text: v => v ? 'sí: con los quesitos, al centro a acertar la final' : 'no: ganas al conseguir el último quesito' },
                { label: 'La categoría de la final la elige', values: ['rivales', 'azar', 'tu'], get: () => r.finalPick, set: v => { r.finalPick = v; }, text: v => ({ rivales: 'el rival que juega después', azar: 'el azar', tu: 'quien la contesta' })[v] },
                { label: 'Si aciertas, vuelves a tirar', values: [true, false], get: () => r.rollAgain, set: v => { r.rollAgain = v; }, text: yesNo },
                { label: 'Preguntas', values: ['todas', 'faciles', 'dificiles'], get: () => r.level, set: v => { r.level = v; }, text: v => ({ todas: 'de todo un poco', faciles: 'solo fáciles', dificiles: 'medias y difíciles' })[v] },
            ];
        },
        rulesHtml: `
            <h2>El objetivo</h2>
            <p>Conseguir los seis quesitos, uno de cada categoría, y después llegar al centro y acertar la pregunta final. Gana quien lo consigue primero. Por equipos, gana el equipo.</p>
            <h2>Las categorías</h2>
            <p>Hay seis, cada una con su color: Geografía, en azul. Espectáculos, en rosa. Historia, en amarillo. Arte y Literatura, en marrón. Ciencias y Naturaleza, en verde. Y Deportes y Pasatiempos, en naranja. Cada pregunta tiene cuatro respuestas y solo una es la buena.</p>
            <h2>El tablero</h2>
            <p>Es una rueda. Por fuera, un anillo de 42 casillas con los seis quesitos, uno cada siete casillas. Entre dos quesitos hay cuatro casillas de categoría y dos de volver a tirar. De cada quesito sale un radio de cinco casillas que llega al centro. Todas las fichas empiezan en el centro.</p>
            <h2>Tu turno</h2>
            <p>Tiras el dado y avanzas justo lo que sale, hacia donde quieras, pero sin volver atrás en la misma tirada. Puedes pasar por el centro y por los quesitos. El juego te dice adónde puedes llegar y tú eliges.</p>
            <p>Donde caes, te hacen una pregunta de su categoría. Si aciertas, vuelves a tirar. Si fallas, pasa el turno. En las casillas de volver a tirar no hay pregunta: tiras otra vez.</p>
            <h2>Los quesitos</h2>
            <p>Si caes en la casilla de un quesito que no tienes y aciertas su pregunta, te lo llevas. Si ya lo tienes, la pregunta vale como cualquier otra.</p>
            <h2>El centro</h2>
            <p>Si llegas al centro sin todos los quesitos, eliges tú la categoría de la pregunta. Con todos, tienes que llegar al centro con la cuenta justa: el rival que juega después de ti elige la categoría de la pregunta final. Si aciertas, ganas. Si fallas, pasa el turno, sales del centro y tienes que volver.</p>
            <h2>Por equipos</h2>
            <p>Con 4 o 6 jugadores se puede jugar por equipos: los que se sientan en sitios alternos van juntos y llevan una sola ficha. Cada uno tira y contesta en su turno, y los quesitos son del equipo.</p>
            <h2>Reglas de la casa</h2>
            <p>Puedes jugar a 4 o 3 quesitos para que la partida sea más corta, ganar sin pregunta final, elegir quién pone la categoría de la final, pasar el turno aunque aciertes, o jugar solo con preguntas fáciles o solo con las difíciles. Las preguntas que ya te han salido tardan en volver a salir.</p>
            <h2>Las teclas</h2>
            <ul>
                <li>T: tirar el dado.</li>
                <li>Del 1 al 9: adónde vas, la categoría o la respuesta. La primera vez te dice cuál es y la segunda la elige. Enter elige la marcada. Las flechas recorren las opciones.</li>
                <li>P: repetir la pregunta y sus respuestas. M: dónde está cada ficha y el quesito que te falta más cerca. C: tus quesitos. D: el último dado.</li>
                <li>I: cómo va la partida. Espacio: repetir lo último. H: las teclas. Escape: pausa.</li>
                <li>Con lector de pantalla, la mesa recibe las teclas directamente. Si alguna no responde, pasa al modo foco (en NVDA y JAWS, la tecla del lector y Espacio) o quita la navegación rápida de VoiceOver (flecha izquierda y flecha derecha a la vez, o VO Q).</li>
            </ul>
            <p>En el móvil, todo tiene su botón en la pantalla. También puedes tocar el dado, las casillas marcadas del tablero y las respuestas.</p>`,
    },
};

/** El dibujo de cada juego: un abanico de cartas o su tablero. */
const gameArt = (G, spread) => G.art ? G.art() : CardArt.fan(G.fan, { spread });

const GAME_IDS = Object.keys(GAMES);
