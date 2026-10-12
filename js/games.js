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
                { label: 'Si todas tus cartas son del mismo número, valen 1 punto', values: [true, false], get: () => r.allEqualOne, set: v => { r.allEqualOne = v; }, text: yesNo },
                { label: 'Si se acaba el mazo', values: ['reshuffle', 'end'], get: () => r.deckOut, set: v => { r.deckOut = v; }, text: v => v === 'reshuffle' ? 'se barajan las cartas de la mesa y se sigue' : 'se descubren las cartas' },
                { label: 'Rondas para ganar la partida', values: [1, 3, 5, 0], get: () => r.winsToWin, set: v => { r.winsToWin = v; }, text: v => winsText(v, 'ronda') },
            ];
        },
        rulesHtml: `
            <h2>El objetivo</h2>
            <p>Gana la ronda quien tenga menos puntos al final. Cada carta vale su número: el as vale 1 y el rey vale 12. La sota vale 10 y el caballo 11.</p>
            <p>Si todas tus cartas son del mismo número, por ejemplo tres caballos, valen solo 1 punto.</p>
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
            </ul>
            <p>En el móvil, todo tiene su botón en la pantalla.</p>`,
    },
};

const GAME_IDS = Object.keys(GAMES);
