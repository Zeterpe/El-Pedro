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
                <li>Con lector de pantalla, la mesa recibe las teclas directamente. Si alguna no responde, pasa al modo foco (en NVDA y JAWS, la tecla del lector y Espacio) o, en VoiceOver, apaga la navegación de una tecla pulsando a la vez Control, Opción y Q. También puedes moverte con el tabulador y elegir con Enter.</li>
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
                <li>Con lector de pantalla, la mesa recibe las teclas directamente. Si alguna no responde, pasa al modo foco (en NVDA y JAWS, la tecla del lector y Espacio) o, en VoiceOver, apaga la navegación de una tecla pulsando a la vez Control, Opción y Q. También puedes moverte con el tabulador y elegir con Enter.</li>
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
                { label: 'Dados', values: [false, true], get: () => r.twoDice, set: v => { r.twoDice = v; }, text: v => v ? 'dos: mueves lo de cada uno, y los dobles repiten' : 'uno, el de siempre' },
                { label: 'Tocar dos veces para mover una ficha', values: [true, false], get: () => s.confirmPlay, set: v => { s.confirmPlay = v; }, text: v => v ? 'sí: el primer toque te dice adónde va' : 'no: se mueve al tocarla' },
            ];
        },
        houseDefs(r) {
            return [
                { label: 'Fichas para cada uno', values: [4, 3, 2], get: () => r.pieces, set: v => { r.pieces = v; }, text: v => v === 4 ? '4, las de siempre' : `${v}, para una partida más corta` },
                { label: 'Con 4 jugadores, por parejas', values: [false, true], get: () => r.pairs, set: v => { r.pairs = v; }, text: v => v ? 'sí: cada uno con el de enfrente' : 'no' },
                { label: 'Dados', values: [false, true], get: () => r.twoDice, set: v => { r.twoDice = v; }, text: v => v ? 'dos: mueves lo de cada uno, y los dobles repiten' : 'uno, el de siempre' },
                { label: 'Al comer una ficha, cuentas', values: [20, 10, 0], get: () => r.eatCount, set: v => { r.eatCount = v; }, text: v => v ? String(v) : 'nada' },
                { label: 'Al meter una ficha en la meta, cuentas', values: [10, 20, 0], get: () => r.metaCount, set: v => { r.metaCount = v; }, text: v => v ? String(v) : 'nada' },
                { label: 'Con un dado, sin fichas en casa, el 6 cuenta 7', values: [true, false], get: () => r.sixSeven, set: v => { r.sixSeven = v; }, text: yesNo },
                { label: 'Al tercer 6 seguido (con dos dados, a los terceros dobles), la última ficha movida vuelve a casa', values: [true, false], get: () => r.threeSixes, set: v => { r.threeSixes = v; }, text: yesNo },
                { label: 'Con un 6 (con dos dados, con dobles), hay que abrir tu barrera', values: [true, false], get: () => r.openBarrier, set: v => { r.openBarrier = v; }, text: yesNo },
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
            <h2>Con dos dados</h2>
            <p>Si lo eliges al preparar la partida, se tiran dos dados y se mueve lo de cada uno por separado, con la misma ficha o con dos distintas, en el orden que quieras. Se sale con un 5 en un dado, o si los dos suman 5; con dos cincos salen dos fichas. Los dobles hacen de 6: vuelves a tirar, obligan a abrir tu barrera y, a los terceros dobles seguidos, la última ficha que has movido vuelve a casa. El 6 no cuenta 7. Si comes o llegas a la meta con el primer dado, cuentas antes de mover el segundo. Un dado que no se puede mover se pierde.</p>
            <p>Si una ficha puede ir con los dos dados, la primera vez que la tocas te dice adónde va con cada uno. La D, o tocar el otro dado, cambia el dado con el que mueves.</p>
            <h2>Reglas de la casa</h2>
            <p>Puedes jugar con dos dados o con 3 o 2 fichas para que la partida sea más corta, cambiar lo que se cuenta al comer y al llegar a la meta, quitar el 7 del seis, el castigo del tercer 6 o la obligación de abrir la barrera, y jugar con rebote en la meta.</p>
            <h2>Las teclas</h2>
            <ul>
                <li>T o Enter: tirar el dado (o los dados).</li>
                <li>Del 1 al 4: tus fichas. La primera vez te dice adónde va y la segunda la mueve. Enter mueve la elegida. Si solo puedes mover una, se mueve sola.</li>
                <li>M: dónde está cada ficha. P: peligros, las fichas que tienes cerca por detrás y por delante. D: el último dado; con dos dados, cuando eliges ficha, cambia el dado con el que mueves.</li>
                <li>I: cómo va la partida. C: tus fichas. Espacio: repetir lo último. H: las teclas. Escape: pausa.</li>
                <li>Con lector de pantalla, la mesa recibe las teclas directamente. Si alguna no responde, pasa al modo foco (en NVDA y JAWS, la tecla del lector y Espacio) o, en VoiceOver, apaga la navegación de una tecla pulsando a la vez Control, Opción y Q. También puedes moverte con el tabulador y elegir con Enter.</li>
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
        rivalLevelLabel: 'Nivel de los rivales',
        pairs: (r, n) => !!r.teams && n >= 4 && n % 2 === 0,
        get Match() { return TrivialMatch; },
        summary: r => Txt.trivialRules({ ...TRIVIAL_DEFAULT_RULES, ...r }),
        practice(r) { return { ...r, wedges: 3 }; },
        setupDefs(s, r) {
            return [
                { label: 'Dificultad de las preguntas', values: ['todas', 'faciles', 'medias', 'dificiles'], get: () => r.level, set: v => { r.level = v; }, text: v => ({ todas: 'de todo un poco', faciles: 'fáciles', medias: 'medias', dificiles: 'difíciles' })[v] },
                { label: 'Con 3 o 5 rivales, por equipos', values: [false, true], get: () => r.teams, set: v => { r.teams = v; }, text: v => v ? 'sí: tu equipo son los de los sitios alternos' : 'no, cada uno por su cuenta' },
                { label: 'Quesitos para ganar', values: [6, 4, 3], get: () => r.wedges, set: v => { r.wedges = v; }, text: v => v === 6 ? '6, los de siempre' : `${v}, para una partida más corta` },
                { label: 'Tocar dos veces para elegir', values: [true, false], get: () => s.confirmPlay, set: v => { s.confirmPlay = v; }, text: v => v ? 'sí: el primer toque te dice la respuesta' : 'no: se elige al tocarla' },
            ];
        },
        houseDefs(r) {
            return [
                { label: 'Dificultad de las preguntas', values: ['todas', 'faciles', 'medias', 'dificiles'], get: () => r.level, set: v => { r.level = v; }, text: v => ({ todas: 'de todo un poco', faciles: 'fáciles', medias: 'medias', dificiles: 'difíciles' })[v] },
                { label: 'Quesitos para ganar', values: [6, 4, 3], get: () => r.wedges, set: v => { r.wedges = v; }, text: v => v === 6 ? '6, los de siempre' : `${v}, para una partida más corta` },
                { label: 'Con 4 o 6 jugadores, por equipos', values: [false, true], get: () => r.teams, set: v => { r.teams = v; }, text: v => v ? 'sí: los sitios alternos, con una ficha por equipo' : 'no' },
                { label: 'Pregunta final en el centro', values: [true, false], get: () => r.hubFinal, set: v => { r.hubFinal = v; }, text: v => v ? 'sí: con los quesitos, al centro a acertar la final' : 'no: ganas al conseguir el último quesito' },
                { label: 'La categoría de la final la elige', values: ['rivales', 'azar', 'tu'], get: () => r.finalPick, set: v => { r.finalPick = v; }, text: v => ({ rivales: 'el rival que juega después', azar: 'el azar', tu: 'quien la contesta' })[v] },
                { label: 'Si aciertas, vuelves a tirar', values: [true, false], get: () => r.rollAgain, set: v => { r.rollAgain = v; }, text: yesNo },
                { label: 'Aciertos seguidos antes de pasar el turno', values: [3, 2, 4, 5, 0], get: () => r.streak, set: v => { r.streak = v; }, text: v => v ? `${v}: después pasa el turno aunque aciertes` : 'sin límite: sigues mientras aciertes' },
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
            <p>Donde caes, te hacen una pregunta de su categoría. Si aciertas, vuelves a tirar, pero con tres aciertos seguidos pasa el turno, para que nadie se quede con la partida. Si fallas, pasa el turno. En las casillas de volver a tirar no hay pregunta: tiras otra vez.</p>
            <h2>Los quesitos</h2>
            <p>Si caes en la casilla de un quesito que no tienes y aciertas su pregunta, te lo llevas. Si ya lo tienes, la pregunta vale como cualquier otra.</p>
            <h2>El centro</h2>
            <p>Si llegas al centro sin todos los quesitos, eliges tú la categoría de la pregunta. Con todos, tienes que llegar al centro con la cuenta justa: el rival que juega después de ti elige la categoría de la pregunta final. Si aciertas, ganas. Si fallas, pasa el turno, sales del centro y tienes que volver.</p>
            <h2>Por equipos</h2>
            <p>Con 4 o 6 jugadores se puede jugar por equipos: los que se sientan en sitios alternos van juntos y llevan una sola ficha. Cada uno tira y contesta en su turno, y los quesitos son del equipo.</p>
            <h2>Reglas de la casa</h2>
            <p>Puedes jugar a 4 o 3 quesitos para que la partida sea más corta, ganar sin pregunta final, elegir quién pone la categoría de la final, pasar el turno aunque aciertes, cuántos aciertos seguidos se pueden hacer antes de pasar el turno, o la dificultad de las preguntas: fáciles, medias, difíciles o de todo un poco. Las preguntas que ya te han salido tardan en volver a salir.</p>
            <h2>Las teclas</h2>
            <ul>
                <li>T o Enter: tirar el dado.</li>
                <li>Del 1 al 9: adónde vas, la categoría o la respuesta. La primera vez te dice cuál es y la segunda la elige. Enter elige la marcada. Las flechas recorren las opciones.</li>
                <li>P: repetir la pregunta y sus respuestas. M: dónde está cada ficha y el quesito que te falta más cerca. C: tus quesitos. D: el último dado.</li>
                <li>I: cómo va la partida. Espacio: repetir lo último. H: las teclas. Escape: pausa.</li>
                <li>Con lector de pantalla, la mesa recibe las teclas directamente. Si alguna no responde, pasa al modo foco (en NVDA y JAWS, la tecla del lector y Espacio) o, en VoiceOver, apaga la navegación de una tecla pulsando a la vez Control, Opción y Q. También puedes moverte con el tabulador y elegir con Enter.</li>
            </ul>
            <p>En el móvil, todo tiene su botón en la pantalla. También puedes tocar el dado, las casillas marcadas del tablero y las respuestas.</p>`,
    },

    virus: {
        id: 'virus',
        name: 'El Virus',
        kind: 'Juego de cartas',
        tagline: 'Construye un cuerpo sano con cuatro órganos de colores distintos mientras infectas, robas y trasplantas los de los demás.',
        players: 'De 2 a 6 jugadores, también por parejas',
        art: () => VirusArt.tile(),
        defaults: VIRUS_DEFAULT_RULES,
        rulesKey: 'virusRules',
        rivalsKey: 'virusRivals',
        roundWord: 'ronda',
        maxPlayers: 6,
        pairs: (r, n) => !!r.pairs && n >= 4 && n % 2 === 0,
        get Match() { return VirusMatch; },
        summary: r => Txt.virusRules({ ...VIRUS_DEFAULT_RULES, ...r }),
        practice(r) { return { ...r, winsToWin: 1 }; },
        setupDefs(s, r) {
            return [
                { label: 'Rondas para ganar', values: [1, 3, 5, 0], get: () => r.winsToWin, set: v => { r.winsToWin = v; }, text: v => winsText(v, 'ronda') },
                { label: 'Con 3 o 5 rivales, por parejas', values: [false, true], get: () => r.pairs, set: v => { r.pairs = v; }, text: v => v ? 'sí: tu pareja es el de enfrente' : 'no, cada uno por su cuenta' },
                { label: 'Tocar dos veces para jugar', values: [true, false], get: () => s.confirmPlay, set: v => { s.confirmPlay = v; }, text: v => v ? 'sí: el primer toque te dice qué hace la jugada' : 'no: se juega al tocarla' },
            ];
        },
        houseDefs(r) {
            return [
                { label: 'Con 4 o 6 jugadores, por parejas', values: [false, true], get: () => r.pairs, set: v => { r.pairs = v; }, text: v => v ? 'sí: cada uno con el de enfrente, y gana la pareja' : 'no' },
                { label: 'Rondas para ganar la partida', values: [1, 3, 5, 0], get: () => r.winsToWin, set: v => { r.winsToWin = v; }, text: v => winsText(v, 'ronda') },
            ];
        },
        rulesHtml: `
            <h2>El objetivo</h2>
            <p>Ser el primero en completar tu cuerpo: cuatro órganos sanos, cada uno de un color distinto, puestos en la mesa delante de ti. Un órgano está sano si no tiene virus: libre, vacunado o inmune.</p>
            <h2>Las cartas</h2>
            <p>Hay 68 cartas. Los órganos son cuatro, cada uno con su color: el corazón es rojo, el cerebro azul, el estómago verde y el hueso amarillo. Hay 5 de cada uno y un órgano multicolor, que vale por cualquier color.</p>
            <p>Hay 4 virus de cada color y uno multicolor; 4 medicinas de cada color y 4 multicolores; y 10 tratamientos: 3 trasplantes, 3 ladrones de órganos, 2 contagios, un guante de látex y un error médico.</p>
            <h2>Tu turno</h2>
            <p>Empiezas siempre con 3 cartas. En tu turno haces una sola cosa: juegas una carta, o descartas las que quieras. Después robas hasta volver a tener 3. No se puede pasar. Cuando se acaba el mazo, se da la vuelta a los descartes, sin barajar.</p>
            <h2>Los órganos</h2>
            <p>Los pones en tu cuerpo. No puedes tener dos órganos del mismo color. Con el multicolor puedes llegar a tener cinco, y ganas si cuatro están sanos.</p>
            <h2>Los virus</h2>
            <p>Van sobre los órganos de los demás, del mismo color. Sobre un órgano libre, lo infectan. Sobre un órgano infectado, lo destruyen: el órgano y sus cartas van a los descartes. Sobre un órgano vacunado, destruyen la vacuna, si el virus es del color de la medicina. El virus multicolor sirve para cualquier color.</p>
            <h2>Las medicinas</h2>
            <p>Van sobre tus órganos. Sobre un órgano infectado, lo curan: el virus y la medicina van a los descartes; la medicina tiene que ser del color del virus. Sobre un órgano libre, lo vacunan: necesitarán dos virus para infectarlo. Sobre un órgano vacunado, lo inmunizan: ya nada lo puede tocar, ni los virus ni los tratamientos. Las multicolores sirven para cualquier color, pero cualquier virus puede romperlas.</p>
            <h2>Los tratamientos</h2>
            <ul>
                <li>Trasplante: cambia un órgano por otro entre dos jugadores cualesquiera, aunque sean de colores distintos o estén infectados o vacunados. Nadie puede quedarse con dos del mismo color, y los inmunes no se tocan.</li>
                <li>Ladrón de órganos: robas un órgano de otro jugador, sano, vacunado o infectado, pero no inmune. No puede ser de un color que ya tengas.</li>
                <li>Contagio: pasas todos los virus que puedas de tus órganos a órganos libres de los demás, del mismo color.</li>
                <li>Guante de látex: todos los demás tiran sus cartas. En su siguiente turno solo roban cartas nuevas: pierden el turno.</li>
                <li>Error médico: te cambias el cuerpo entero con otro jugador, con sus virus, vacunas y órganos inmunes.</li>
            </ul>
            <p>Si un tratamiento te deja con cuatro órganos sanos, aunque sea en el turno de otro, ganas en ese momento.</p>
            <h2>Por parejas</h2>
            <p>Con 4 o 6 jugadores se puede jugar por parejas: vas con el de enfrente. No podéis atacaros con virus ni robaros órganos, y gana la pareja en cuanto uno de los dos completa su cuerpo.</p>
            <h2>Las teclas</h2>
            <ul>
                <li>Del 1 al 3: tus cartas. Al elegir una, te digo lo que puedes hacer con ella, cada jugada con su número, y los órganos donde puede ir se marcan en la mesa.</li>
                <li>Con una carta elegida, los números eligen la jugada. La primera vez te dice qué hace y la segunda la juega. Enter confirma. Escape vuelve a tus cartas.</li>
                <li>D: descartar. Marca las cartas con su número y pulsa D o Enter para tirarlas.</li>
                <li>Flechas: tus cartas, tu cuerpo y los cuerpos de los demás. M: cómo está el cuerpo de cada uno. T: el mazo y los descartes.</li>
                <li>I: cómo va la partida. C: tus cartas y tu cuerpo. Espacio: repetir lo último. H: las teclas. Escape: pausa.</li>
                <li>Con lector de pantalla, la mesa recibe las teclas directamente. Si alguna no responde, pasa al modo foco (en NVDA y JAWS, la tecla del lector y Espacio) o, en VoiceOver, apaga la navegación de una tecla pulsando a la vez Control, Opción y Q. También puedes moverte con el tabulador y elegir con Enter.</li>
            </ul>
            <p>En el móvil, todo tiene su botón en la pantalla. También puedes tocar los órganos marcados de la mesa.</p>`,
    },

    impostor: {
        id: 'impostor',
        name: 'El Impostor',
        kind: 'Juego de nave, en tiempo real',
        tagline: 'Anda por una nave espacial guiándote por el oído y haz las tareas con tu tripulación, mientras los impostores matan a escondidas. Descúbrelos y échalos en la reunión.',
        players: 'De 4 a 10 jugadores, en una sala con amigos o con la máquina. Con menos, solo hay tareas',
        art: () => ImpostorArt.tile(),
        defaults: IMPOSTOR_DEFAULT_RULES,
        rulesKey: 'impostorRules',
        rivalsKey: 'impostorRivals',
        roundWord: null,
        maxPlayers: 10,
        lateJoin: false,                                 // ni se mira desde fuera ni se ocupa el sitio de la máquina a mitad
        rivalWords: ['compañero', 'compañeros'],
        rivalLevelLabel: 'Tus compañeros',
        levelText: { facil: 'despistados', normal: 'normales', dificil: 'listos y rápidos', mezcla: 'de todo un poco' },
        get Match() { return ImpostorMatch; },
        /** Cuántos impostores habrá con n jugadores, dicho para el oído. */
        playersNote(r, n) {
            const k = impostorsFor(n, { ...IMPOSTOR_DEFAULT_RULES, ...r }.impostors);
            return k ? `con ${k === 1 ? 'un impostor' : `${k} impostores`}` : 'sin impostores';
        },
        summary: r => {
            r = { ...IMPOSTOR_DEFAULT_RULES, ...r };
            const imp = { auto: 'Impostores según cuántos seáis', 0: 'Sin impostores', 1: 'Un impostor', 2: 'Dos impostores', 3: 'Tres impostores' }[r.impostors] || 'Impostores según cuántos seáis';
            const extra = [!r.sabotages && 'sin sabotajes', !r.vents && 'sin conductos'].filter(Boolean);
            const meet = r.discussTime > 0 ? `en la reunión, ${r.discussTime} segundos para hablar y ${r.voteTime} para votar` : `en la reunión, ${r.voteTime} segundos para votar`;
            return `${imp}; ${r.tasks} tareas para cada uno${r.easyTasks ? ', fáciles' : ''}${extra.length ? `; ${extra.join(' y ')}` : ''}; ${meet}.`;
        },
        practice(r) { return { ...r, tasks: 2, easyTasks: true, impostors: 0 }; },
        setupDefs(s, r) {
            return [
                { label: 'Tu papel', values: ['azar', 'tripulante', 'impostor'], get: () => s.impostorRole, set: v => { s.impostorRole = v; }, text: v => v === 'azar' ? 'al azar' : v === 'impostor' ? 'impostor, si hay impostores' : 'tripulante' },
                { label: 'Tareas para cada uno', values: [2, 3, 4, 5], get: () => r.tasks, set: v => { r.tasks = v; }, text: v => `${v} tareas` },
                { label: 'Roce de las paredes', values: [true, false], get: () => s.impostorWalls, set: v => { s.impostorWalls = v; }, text: v => v ? 'sí: al acercarte a una pared, suena por ese lado' : 'no' },
                { label: 'Decir quién aparece', values: [true, false], get: () => s.impostorNames, set: v => { s.impostorNames = v; }, text: v => v ? 'sí: cuando ves a alguien, se dice su nombre y hacia dónde está' : 'no, solo un sonido' },
                { label: 'Con lector de pantalla, en la nave habla', values: ['juego', 'lector'], get: () => s.impostorVoice, set: v => { s.impostorVoice = v; }, text: v => v === 'juego' ? 'la voz del juego, que va al momento' : 'tu lector de pantalla' },
                { label: 'Modo a ciegas', values: [false, true], get: () => s.impostorBlind, set: v => { s.impostorBlind = v; }, text: v => v ? 'sí: la nave no se ve, solo se oye' : 'no' },
                { label: 'Sonidos de la nave: volumen de cada uno', action: () => impostorSoundMenu(App) },
            ];
        },
        houseDefs(r) {
            return [
                {
                    label: 'Impostores', values: ['auto', 0, 1, 2, 3], get: () => r.impostors, set: v => { r.impostors = v; },
                    text: v => ({ auto: 'según cuántos seáis: uno, y dos desde siete jugadores', 0: 'ninguno: solo tareas', 1: 'uno', 2: 'dos, si sois siete o más', 3: 'tres, si sois nueve o diez' })[v],
                },
                { label: 'Espera entre muerte y muerte', values: [15, 25, 35, 45], get: () => r.killCooldown, set: v => { r.killCooldown = v; }, text: v => `${v} segundos` },
                { label: 'Alcance para matar', values: ['corto', 'medio', 'largo'], get: () => r.killRange, set: v => { r.killRange = v; }, text: v => v === 'corto' ? 'corto: casi pegado' : v === 'medio' ? 'medio' : 'largo: a un par de pasos' },
                { label: 'Reuniones de emergencia de cada uno', values: [1, 2, 3, 0], get: () => r.meetings, set: v => { r.meetings = v; }, text: v => v === 0 ? 'ninguna: solo se avisa de los cuerpos' : v === 1 ? 'una' : `${v}` },
                { label: 'Espera para el botón de emergencia', values: [10, 15, 20, 30], get: () => r.buttonWait, set: v => { r.buttonWait = v; }, text: v => `${v} segundos al empezar y después de cada reunión` },
                { label: 'Al echar a alguien, decir si era impostor', values: [true, false], get: () => r.confirmEjects, set: v => { r.confirmEjects = v; }, text: v => v ? 'sí' : 'no: nadie lo sabe hasta el final' },
                { label: 'Tiempo para hablar en la reunión', values: [120, 60, 90, 180, 0], get: () => r.discussTime, set: v => { r.discussTime = v; }, text: v => v ? `${v} segundos, sin votar todavía; si todos dicen que quieren votar, se vota antes` : 'ninguno: se vota al momento' },
                { label: 'Tiempo para votar', values: [60, 30, 45, 90, 120], get: () => r.voteTime, set: v => { r.voteTime = v; }, text: v => `${v} segundos; quien no vota a tiempo, salta el voto` },
                { label: 'Frases para hablar en la reunión', values: ['auto', true, false], get: () => r.phrases, set: v => { r.phrases = v; }, text: v => v === 'auto' ? 'contra la máquina, sí; en una sala, no, porque habláis en la llamada' : v ? 'sí, también en una sala' : 'no: se habla en la llamada' },
                { label: 'Votos secretos', values: [false, true], get: () => r.anonymousVotes, set: v => { r.anonymousVotes = v; }, text: v => v ? 'sí: solo se dice cuántos votos tiene cada uno' : 'no: se dice quién vota a quién' },
                { label: 'La barra de tareas se pone al día', values: ['siempre', 'reuniones', 'nunca'], get: () => r.barUpdates, set: v => { r.barUpdates = v; }, text: v => v === 'siempre' ? 'siempre, al acabar cada tarea' : v === 'reuniones' ? 'solo en las reuniones' : 'nunca: no se ve' },
                { label: 'Sabotajes', values: [true, false], get: () => r.sabotages, set: v => { r.sabotages = v; }, text: v => v ? 'sí: los impostores apagan las luces, cortan las comunicaciones, sabotean el reactor y el oxígeno y cierran puertas' : 'no' },
                { label: 'Tiempo para arreglar el reactor o el oxígeno', values: [45, 30, 60], get: () => r.reactorTime, set: v => { r.reactorTime = v; }, text: v => `${v} segundos` },
                { label: 'Conductos', values: [true, false], get: () => r.vents, set: v => { r.vents = v; }, text: v => v ? 'sí: los impostores van por ellos de una sala a otra' : 'no' },
                { label: 'Tareas para cada uno', values: [2, 3, 4, 5], get: () => r.tasks, set: v => { r.tasks = v; }, text: v => `${v} tareas` },
                { label: 'Tareas fáciles', values: [false, true], get: () => r.easyTasks, set: v => { r.easyTasks = v; }, text: v => v ? 'sí: menos que hacer y más margen en cada una' : 'no' },
                { label: 'Al andar, vas', values: [1, 0.8, 1.25], get: () => r.speed, set: v => { r.speed = v; }, text: v => v === 1 ? 'a paso normal' : v < 1 ? 'más despacio' : 'más deprisa' },
                { label: 'A los demás los ves y los oyes', values: [1, 0.75, 1.5], get: () => r.vision, set: v => { r.vision = v; }, text: v => v === 1 ? 'a la distancia de siempre' : v < 1 ? 'solo de cerca' : 'desde más lejos' },
            ];
        },
        rulesHtml: `
            <h2>De qué va</h2>
            <p>Una tripulación viaja en una nave espacial y tiene que arreglarla: cada tripulante tiene sus tareas, repartidas por las salas. Pero entre vosotros hay uno o más impostores, que fingen ser de la tripulación y la matan a escondidas. Todos andáis a la vez y en tiempo real, sin turnos.</p>
            <ul>
                <li>La tripulación gana si hace todas las tareas o si echa de la nave a todos los impostores.</li>
                <li>Los impostores ganan cuando son tantos como los tripulantes que quedan vivos, o si nadie arregla a tiempo el reactor o el oxígeno.</li>
            </ul>
            <p>Se juega con compañeros de la máquina o en una sala con amigos, y en una sala también puede haber compañeros de la máquina. Hacen falta al menos cuatro jugadores para que haya impostores: uno, y dos desde siete jugadores. Con menos, solo hay tareas, y sirve para aprender a moverse por la nave.</p>
            <h2>Tu papel</h2>
            <p>Al empezar se dice si eres tripulante o impostor, y lo ves arriba a la izquierda. Contra la máquina, al preparar la partida puedes pedir un papel o dejarlo al azar; en una sala, siempre es al azar. Los impostores saben quiénes son los otros impostores; la tripulación no sabe nada.</p>
            <h2>Si eres tripulante</h2>
            <p>Haz tus tareas y fíjate en quién va con quién. Si encuentras un cuerpo, avisa: todos van a una reunión para hablar y votar. Si los impostores sabotean algo, corre a arreglarlo. Las consolas te ayudan a saber dónde está cada uno.</p>
            <h2>Si eres impostor</h2>
            <ul>
                <li>Tus tareas son de mentira: en el sitio de una tarea, la E hace que finjas que la haces, y quien te vea te verá ocupado. Andar o Escape lo deja.</li>
                <li>Para matar, acércate a un tripulante y pulsa la Q. Cuando tienes a alguien a tu alcance suena un aviso y se dice su nombre. Hay que esperar para matar: diez segundos al empezar la partida, y veinticinco después de cada muerte y de cada reunión. Cuando ya puedes, suena como una navaja que se abre.</li>
                <li>Quien está cerca y a la vista lo ve todo, así que busca a quien ande solo. Tú ves un poco más lejos que la tripulación.</li>
                <li>Tras matar, aléjate, por un conducto si tienes uno cerca, o avisa tú mismo del cuerpo para disimular.</li>
                <li>Con la X saboteas, y con la V vas por los conductos. Lo cuentan los apartados de más abajo.</li>
            </ul>
            <h2>Los cuerpos y las reuniones</h2>
            <ul>
                <li>Un cuerpo suena como un monitor de hospital sin pulso: un zumbido grave y un pitido largo, desde donde está. La primera vez que lo ves se dice de quién es y dónde está.</li>
                <li>Para avisar, acércate a unos tres metros y pulsa la R.</li>
                <li>En la mesa del Comedor está el botón de emergencia. Junto a la mesa, la E pide una reunión aunque no haya cuerpo. Con las reglas de siempre, cada uno puede pedir una por partida, y hay que esperar quince segundos al empezar y después de cada reunión.</li>
            </ul>
            <h2>La reunión</h2>
            <p>Suena la alarma y todos vais al Comedor. Se dice quién la ha pedido, de quién es el cuerpo y dónde estaba, y quién más ha muerto. La reunión tiene dos partes, cada una con su reloj: primero se habla, sin votar todavía, y después se vota. Con las reglas de siempre, hay ciento veinte segundos para hablar y sesenta para votar. Se avisa cuando quedan treinta y diez segundos, y al final de la votación suena un tic tac. Si todos dicen que quieren votar ya, se vota antes. Quien no vota a tiempo salta el voto.</p>
            <p>Mientras, abajo tienes un cuadro con lo que puedes hacer: decir que quieres votar ya o, cuando toca, votar a alguien o saltar el voto. También puedes saber cuánto tiempo queda y quién queda en la nave.</p>
            <p>Contra la máquina, los compañeros hablan cada uno con su voz: dónde estaban, a quién vieron, de quién sospechan. Si alguien miente sobre dónde estaba y otro le vio en otro sitio, puede pillarle; y si acusan a alguien, se defiende. Tú hablas eligiendo frases de una lista, hasta cuatro: dónde estabas, a quién has visto matar, de quién sospechas, a quién viste cerca del cuerpo, quién estaba contigo, que tú no has sido, que no has visto nada o que mejor saltar el voto. También puedes volver a oír lo que se ha dicho.</p>
            <p>En una sala, lo normal es hablar en una llamada, así que no hay frases; se pueden poner en las reglas de la casa. Los compañeros de la máquina que haya en la sala siguen hablando y votando.</p>
            <p>Al final, quien tenga más votos sale de la nave, y se dice si era impostor. Si hay empate, o si gana saltar el voto, no sale nadie. Luego volvéis a la nave.</p>
            <h2>Los sabotajes</h2>
            <p>Los impostores, vivos o fantasmas, sabotean con la X. Contra la máquina, la partida se para mientras eligen; en una sala, no. Después de cada sabotaje hay que esperar treinta segundos para el siguiente.</p>
            <ul>
                <li>Apagar las luces: la tripulación viva casi no ve, solo lo que tiene muy cerca, y tampoco oye a nadie que esté más lejos. Los impostores ven y oyen como siempre. Se arreglan en el cuadro de las luces, en Electricidad: hay que encender todos los interruptores, cada uno con su número.</li>
                <li>Que estalle el reactor: suena una sirena desde el Reactor en toda la nave y se cuentan los segundos; con las reglas de siempre, cuarenta y cinco. Para arreglarlo hacen falta dos personas a la vez, cada una con la mano en un panel del Reactor: uno a la izquierda y otro a la derecha. Si nadie lo arregla, ganan los impostores. Mientras, no se puede pedir una reunión de emergencia.</li>
                <li>Cortar las comunicaciones: la tripulación no ve su lista de tareas ni la barra, y el mapa y las cámaras se quedan sin señal; la guía y la F siguen funcionando. Se arreglan en la radio de Comunicaciones: gira el dial con el 1 y el 2 hasta que se oiga clara, sin ruido.</li>
                <li>Dejar la nave sin oxígeno: suena una alarma en toda la nave y se cuentan los segundos, como en el reactor. Hay que teclear un código en dos teclados, uno en Oxígeno y otro en Administración, y podéis repartiros. Si no da tiempo, ganan los impostores. Mientras, no se puede pedir una reunión de emergencia.</li>
                <li>Cerrar las puertas de una sala: durante diez segundos nadie entra ni sale. Suena un portazo en cada puerta. Las puertas cerradas no se pueden cruzar ni dejan ver.</li>
            </ul>
            <p>Mientras hay un sabotaje, sus paneles pitan desde su sitio, y la guía te lleva hasta ellos. Una reunión acaba con los sabotajes y abre las puertas.</p>
            <h2>Los conductos</h2>
            <p>Solo los impostores vivos van por los conductos. Junto a uno, la V te mete dentro: nadie te ve ni te oye, pero no puedes matar ni hacer nada más. Cada conducto lleva a otros dos o tres; con las flechas vas al que está hacia ese lado, o con su número. La V otra vez te saca. Al entrar y al salir suena la tapa del conducto, pero solo la oye quien te ve, y sabrá que eres impostor.</p>
            <h2>Las consolas</h2>
            <p>Junto a una consola, la E te deja mirarla. Mientras la miras no te mueves; para irte, anda.</p>
            <ul>
                <li>El mapa de la nave, en Administración: cuántos hay en cada sala, sin decir quiénes. En los pasillos y en los conductos no se ve.</li>
                <li>Las cámaras, en Seguridad: a quién se ve en los pasillos más concurridos.</li>
                <li>Las constantes vitales, en la Enfermería: quién vive y quién ha muerto, aunque nadie haya encontrado el cuerpo.</li>
            </ul>
            <p>Lo que dicen se pone al día cada segundo, y si cambia algo, se dice. Sin comunicaciones, el mapa y las cámaras no tienen señal.</p>
            <h2>Los fantasmas</h2>
            <p>Quien muere o sale de la nave se queda como fantasma: sigue andando y atraviesa las paredes, pero los vivos no le ven ni le oyen, y no puede avisar, hablar, votar ni arreglar sabotajes. Un tripulante fantasma puede acabar sus tareas, y le cuentan para ganar. Un impostor fantasma puede seguir saboteando. Los fantasmas ven a todos, también a través de las paredes, y suenan como un soplo.</p>
            <h2>La nave</h2>
            <p>${IMP_SHIP_TEXT}</p>
            <h2>Cómo te orientas</h2>
            <p>Juega con auriculares. Siempre miras hacia arriba de la pantalla, como en un mapa: lo que suena a tu derecha está a tu derecha, lo que suena delante está arriba, y lo que está detrás suena más apagado. Lo que está al otro lado de una pared suena amortiguado.</p>
            <ul>
                <li>Tus pasos suenan distinto según el suelo: metal, rejilla o moqueta. Los de cada compañero tienen su propio sonido y se oyen más fuertes que los tuyos.</li>
                <li>Cada persona a la que ves suena además con su nota, desde donde está, aunque esté quieta: cuanto más cerca, más deprisa. Con la P oyes los pasos y la nota de cada uno.</li>
                <li>Cada sala tiene su ambiente: en Motores retumban las máquinas, en el Comedor tintinean los platos, en el Puente de mando pitan las pantallas, en Electricidad chisporrotea la corriente, en la Enfermería late un monitor, en Comunicaciones suena la radio, en Oxígeno respira el aire y burbujea el agua, en el Reactor late un zumbido muy grave, en Seguridad zumban los ventiladores y en Administración teclea alguien.</li>
                <li>Las puertas de donde estás hacen tic, cada una desde su sitio. Al entrar en una sala o en un pasillo, se dice dónde estás.</li>
                <li>Al acercarte a una pared, se oye un siseo por ese lado; si chocas, suena un golpe.</li>
                <li>Tus tareas te llaman con dos notas, cada una desde su consola. Al llegar junto a una, suena una campanita y se dice cuál es.</li>
                <li>Cuando ves a alguien, se dice su nombre y hacia dónde está. A los demás solo los oyes si los ves: sus pasos, su nota y sus tareas se oyen hasta donde llega la vista, ni a través de una pared ni más lejos, igual que en la pantalla. Así quien oye no sabe más que quien ve, ni al revés.</li>
            </ul>
            <h2>La guía y lo que hay cerca</h2>
            <p>Con la G eliges adónde ir: una de tus tareas, una sala, una consola o, si hay un sabotaje, el panel que lo arregla. Desde ese momento suena un pitido hacia donde tienes que andar, unos metros por delante de ti, siguiendo los pasillos; cuanto más cerca estás, más deprisa pita. El pitido es más agudo cuando hay que ir hacia delante, más grave hacia detrás y el de siempre a los lados. Al doblar una esquina se dice hacia dónde sigue el camino, y al llegar suena una campanita.</p>
            <p>Con la F se dice qué hay cerca: dónde estás, las salidas con su dirección y su distancia (y si alguna está cerrada), el sabotaje que haya, tus tareas, los muebles, las consolas, los conductos y quién está contigo.</p>
            <h2>Las tareas</h2>
            <p>Cuando estés junto a una tarea tuya, pulsa E para empezarla. Mientras la haces no te mueves; con Escape la dejas y puedes volver luego.</p>
            <ul>
                <li>Arreglar los cables: conecta cada cable con el enchufe de su color. Al pulsar el número de un enchufe, se dice su color y suena su nota; el bueno suena igual que el cable. La primera vez lo oyes y la segunda lo conectas.</li>
                <li>Descargar los datos: pulsa E para empezar la descarga y espera a que se llene la barra.</li>
                <li>Calibrar el motor: una aguja va de un lado a otro, y su sonido la sigue de izquierda a derecha. Pulsa Espacio cuando esté en el centro, donde suena más aguda. Hacen falta tres aciertos.</li>
                <li>Teclear el código: oyes y ves un número de cuatro cifras, y lo tecleas. Si te equivocas, se empieza otra vez. Espacio lo repite.</li>
                <li>Pasar por el escáner, en la Enfermería: quédate quieto unos segundos mientras te escanea. Se ve y se oye: quien te vea sabrá que eres tripulante. Un impostor se puede poner en el escáner, pero no hace nada, y quien lo vea lo sabrá.</li>
                <li>Repostar el motor: se hace en dos sitios. Primero llenas la lata en el Almacén y después la echas en un motor, en Motores o en el Reactor. En cada uno, pulsa E y espera.</li>
                <li>Encender los escudos, en Oxígeno o en Comunicaciones: enciende todos los escudos, cada uno con su número. Suena agudo al encenderse y grave al apagarse.</li>
                <li>Repetir la secuencia, en el Puente de mando o en Seguridad: suenan unas notas y las repites con los números del 1 al 4, que van de grave a aguda. En cada ronda hay una nota más.</li>
                <li>Fijar el rumbo, en el Puente de mando: un pitido suena hacia donde tiene que ir la nave. Gírala con el 1, a la izquierda, y el 2, a la derecha, hasta que suene justo delante, y fíjalo con Enter. Dos o tres veces.</li>
                <li>Vaciar la basura, en el Comedor o en el Almacén: mantén pulsado Espacio, Enter o la E hasta que se vacíe. Suena cada vez más grave.</li>
                <li>Limpiar el filtro, en Oxígeno: cada hoja suena desde un lado; sácala con la flecha, o con W, A, S o D, hacia ese lado.</li>
                <li>Ajustar la temperatura, en Motores o en Electricidad: bájala con el 1 o súbela con el 2 hasta la que pide el panel. Se dice cada número.</li>
                <li>Analizar las muestras, en la Enfermería: empiezas el análisis, te vas a hacer otras cosas y vuelves a recoger los resultados cuando estén, al cabo de un minuto, o de medio con tareas fáciles. Se avisa cuando están listos.</li>
            </ul>
            <p>La barra de tareas de la tripulación se llena con las tareas de todos los tripulantes; las de los impostores no cuentan. Cuando se llena, gana la tripulación. Según las reglas de la casa, se pone al día al acabar cada tarea, solo en las reuniones o nunca; sin comunicaciones no se ve.</p>
            <h2>En una sala</h2>
            <p>Como en los demás juegos, quien crea la sala elige El Impostor y las reglas, y cada uno juega en su navegador. Lo mejor es estar en una llamada, para hablar en las reuniones. En una sala la partida no se para nunca: si abres la pausa o un menú, te quedas quieto, pero los demás siguen. Si alguien se va, juega la máquina por esa persona hasta que vuelve.</p>
            <h2>Reglas de la casa</h2>
            <p>Puedes elegir cuántos impostores hay; cuánto esperan entre muerte y muerte; desde qué distancia matan; cuántas reuniones de emergencia puede pedir cada uno y cuánto hay que esperar para el botón; si al echar a alguien se dice si era impostor; cuánto tiempo hay para hablar y para votar en la reunión, si hay frases para hablar y si los votos son secretos, y cuándo se pone al día la barra de tareas. También si hay sabotajes y cuánto tiempo hay para arreglar el reactor o el oxígeno; si hay conductos; cuántas tareas tiene cada uno, de 2 a 5; hacerlas más fáciles; andar más deprisa o más despacio, y ver y oír a los demás solo de cerca o desde más lejos.</p>
            <h2>Al preparar la partida</h2>
            <p>Eliges cuántos compañeros tienes, de 1 a 9, y si son despistados o listos: los listos hacen antes las tareas, se fijan más en todo, y como impostores matan sin testigos y mienten mejor. También tu papel, si suena el roce de las paredes, si se dice el nombre de quien aparece, si con lector de pantalla habla la voz del juego, que va al momento, o tu lector, y el modo a ciegas: quien ve no ve la nave, solo la oye, para jugar todos igual.</p>
            <p>En Sonidos de la nave, aquí o en la pausa de la partida, cambias el volumen de cada clase de sonido: el ambiente de las salas, los pasos y la nota de los demás, tus pasos y las paredes, la guía, y los avisos. También puedes quitar la nota de cada persona.</p>
            <h2>Las teclas</h2>
            <ul>
                <li>W, A, S y D, o las flechas: andar. W va hacia delante, S hacia detrás, A a la izquierda y D a la derecha. Con dos a la vez vas en diagonal.</li>
                <li>E o Enter: usar lo que tienes al lado: una tarea, el panel de un sabotaje, una consola o el botón de emergencia junto a la mesa del Comedor.</li>
                <li>R: avisar de un cuerpo. Si eres impostor: Q, matar; X, sabotear; V, entrar en un conducto o salir. Dentro de un conducto, las flechas o los números te llevan a otro.</li>
                <li>F: qué hay cerca. G: la guía. T o C: tus tareas. M: cómo es la nave. P: los pasos y la nota de cada uno. I: cómo va la partida.</li>
                <li>Con una tarea abierta, juegan los números, Espacio y Enter, y en el filtro, las flechas; Escape la deja. Con la mano en el panel del reactor, Escape la quita.</li>
                <li>Espacio: repetir lo último. H: las teclas. Escape: pausa.</li>
                <li>Con lector de pantalla, la mesa recibe las teclas directamente. Si alguna no responde, pasa al modo foco (en NVDA y JAWS, la tecla del lector y Espacio) o, en VoiceOver, apaga la navegación de una tecla pulsando a la vez Control, Opción y Q. También puedes moverte con el tabulador y elegir con Enter.</li>
            </ul>
            <h2>En el móvil</h2>
            <p>Toca la nave y arrastra el dedo hacia donde quieras andar: es un joystick. También hay una cruceta con cuatro flechas: mantén pulsada una para andar, o tócala para dar unos pasos. Todo lo demás tiene su botón. Con VoiceOver o TalkBack, cada flecha de la cruceta da unos pasos al tocarla dos veces; para andar seguido, va mejor un teclado conectado al móvil.</p>
            <h2>Lo que viene</h2>
            <p>Las siguientes versiones traerán voces grabadas para cada personaje y papeles especiales.</p>`,
    },
};

/** El dibujo de cada juego: un abanico de cartas o su tablero. */
const gameArt = (G, spread) => G.art ? G.art() : CardArt.fan(G.fan, { spread });

const GAME_IDS = Object.keys(GAMES);
