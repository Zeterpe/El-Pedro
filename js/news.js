'use strict';
/*
 * Novedades de cada juego, de la más nueva a la más antigua.
 *
 * Para añadir una: pon arriba de la lista de su juego un bloque con la fecha
 * (AAAA-MM-DD) y una frase por cosa nueva, escrita para quien juega, no para
 * quien programa. Lo que cambia en todos los juegos (salas, rivales, voz,
 * teclas) va en `salon` y sale en las novedades de cada juego.
 * Si ya hay un bloque con la misma fecha, añade la frase a ese bloque.
 */
const NEWS = {
    salon: [
        {
            date: '2026-10-20', items: [
                'Salas: los rivales de la máquina guardan el sitio. Si llegas con la mesa llena, te sientas en el de uno de ellos.',
                'Salas: si llegas con la partida empezada, la miras sin ver las cartas de nadie. Quien ha creado la sala te puede dar el sitio de un rival de la máquina desde la pausa, con Escape; si no, te sientas en la siguiente partida. En El Impostor, esperas en la sala.',
                'Salas: si te vas y vuelves, recuperas tu sitio.',
                'Cada juego tiene su pestaña de novedades, esta, con todo lo nuevo que no había antes.',
            ],
        },
        {
            date: '2026-10-17', items: [
                'Once rivales nuevos, cada uno con su voz y sus comentarios: Terminator, Doraemon, Nobita, Shin-chan, el cuñado Manolo, doña Puri, el robot Chispas, el gato Michi, el abuelo Fermín, Pepa la pitonisa y el capitán Bacalao.',
                'Con lector de pantalla, las letras y los números llegan al juego en vez de mover el lector por la página. Con VoiceOver en el Mac, el juego explica cómo apagar la navegación de una tecla (Control, Opción y Q); mientras tanto se juega con el tabulador y Enter.',
            ],
        },
        {
            date: '2026-10-12', items: [
                'El salón: eliges a qué jugar, y cada juego tiene su menú, su partida de práctica, sus reglas de la casa y sus estadísticas.',
                'Salas: en la sala se elige el juego y, al acabar, se vuelve a la sala para cambiar de juego sin crear otra. Quien pierde la conexión o recarga la página vuelve a su sitio; mientras, juega la máquina por esa persona.',
                'Se puede jugar con amigos desde casas y redes distintas, también con datos del móvil, y el botón Probar la conexión dice si algo falla.',
                'Cartas grandes y alto contraste, en Opciones.',
            ],
        },
        {
            date: '2026-10-11', items: [
                'Al empezar eliges cómo jugar: con la voz del juego, con tu lector de pantalla o sin voz, solo con la vista.',
                'Jugar con amigos: creas una sala con un código de 5 cifras o un enlace, y los demás se unen.',
            ],
        },
    ],

    pedro: [
        {
            date: '2026-10-17', items: [
                'Regla de la casa nueva: que el siete valga menos 1. Viene quitada.',
            ],
        },
        {
            date: '2026-10-12', items: [
                'Puedes tocar la mesa para tirar la carta que has robado.',
            ],
        },
        {
            date: '2026-10-11', items: [
                'Quemar no tiene tiempo: se puede en cualquier momento de la ronda, también en el turno de otro, tocando la carta o con su número. Si la carta de la mesa cambia mientras tanto, no vale.',
                'Si alguien se queda sin cartas, gana la ronda al momento.',
                'Las cartas se eligen tocándolas, sin menús: mirar, cambiar con la de otro y quemar.',
                'Cantar Pedro y después jugar ese turno, como en la mesa de verdad.',
                'Mesa para el móvil, de pie y tumbado.',
            ],
        },
        {
            date: '2026-10-10', items: [
                'Primera versión de El Pedro contra la máquina: cuatro cartas, miras dos, poderes de la sota, el caballo y el rey, quemar y cantar Pedro, con rivales que recuerdan lo que han visto.',
            ],
        },
    ],

    brisca: [
        {
            date: '2026-10-12', items: [
                'El siete de triunfo se cambia por la muestra en cualquier turno tuyo, no solo al salir. En las reglas de la casa puedes dejarlo solo al salir.',
                'Llega la Brisca: con baraja de 40 o 48 cartas, por parejas, cantes de las 20 y las 40, arrastre y diez de últimas, todo ajustable en las reglas de la casa. Los rivales de la máquina cuentan cartas.',
            ],
        },
    ],

    parchis: [
        {
            date: '2026-10-19', items: [
                'Regla de la casa nueva: jugar con dos dados. Cada dado se mueve por separado, se sale con un 5 o si suman 5, los dobles repiten y los terceros dobles mandan a casa la última ficha. La D, o tocar el otro dado, cambia el dado con el que mueves.',
            ],
        },
        {
            date: '2026-10-17', items: [
                'Enter también tira el dado.',
            ],
        },
        {
            date: '2026-10-12', items: [
                'Llega el Parchís, con las reglas de aquí: 68 casillas, se sale con un 5, barreras, comer cuenta 20 y la meta cuenta 10. Solo o por parejas con cuatro jugadores, y todo ajustable en las reglas de la casa.',
            ],
        },
    ],

    trivial: [
        {
            date: '2026-10-23', items: [
                'El 7 del dado, el del quesito, sale la mitad que los demás números: una de cada 14 tiradas. En las reglas de la casa puedes hacer que salga más o menos.',
                'Si ganas un quesito, pasa el turno aunque aciertes: juega el siguiente. Se puede quitar en las reglas de la casa.',
                'En una sala, todos ven el tiempo que le queda a quien contesta, también quien mira la partida. Con la I se oye, a los 10 segundos se avisa y en los últimos cinco suena el reloj.',
            ],
        },
        {
            date: '2026-10-20', items: [
                'Unas 1700 preguntas nuevas: ya hay unas 3800, con más preguntas difíciles en cada categoría y, en Espectáculos, anime y series famosas.',
                'Seis casillas de volver a tirar en vez de doce: una entre cada dos quesitos.',
                'El dado va del 1 al 7. El 7 es un quesito: eliges uno que te falta y te hacen una pregunta muy difícil, sin moverte.',
                'Si alguien falla una pregunta de quesito, rebota al siguiente, que se lo lleva si acierta.',
                'Tiempo para contestar, 60 segundos desde que se acaba de leer la pregunta, con aviso a los 10.',
                'La O dice dónde estás y a cuánto está cada quesito que te falta. Al elegir casilla, se dice si te acerca.',
                'El dado del 7, el rebote y el tiempo se cambian en las reglas de la casa.',
            ],
        },
        {
            date: '2026-10-17', items: [
                'Después de tres aciertos seguidos pasa el turno, aunque aciertes. Se cambia en las reglas de la casa.',
                'La dificultad de las preguntas se elige al preparar la partida: fáciles, medias, difíciles o de todo un poco.',
                'Más de 800 preguntas nuevas.',
                'Enter también tira el dado.',
            ],
        },
        {
            date: '2026-10-12', items: [
                'Llega el Trivial: seis categorías, el tablero de rueda con sus quesitos, la final en el centro y equipos para 4 o 6 jugadores.',
            ],
        },
    ],

    virus: [
        {
            date: '2026-10-17', items: [
                'Llega el Virus, con las reglas del juego original: órganos, virus, medicinas y tratamientos, con sus cartas dibujadas, jugadas paso a paso y por parejas en las reglas de la casa.',
            ],
        },
    ],

    impostor: [
        {
            date: '2026-10-23', items: [
                'En una sala, antes de cada partida, entráis todos en la sala de espera de la nave: andáis juntos por el Comedor, os oís los pasos y la nota de cada uno, y quien ha creado la sala empieza la partida con la E cuando estéis todos. Al acabar, volvéis a ella.',
                'En la sala de espera, la C cambia tu color y tu gorro, y los demás lo oyen al momento. Al pasar por cada color suena su nota, que es como te oirán. Un color que ya tiene otra persona no se puede coger; el de un rival de la máquina, sí: te lo cambia por el tuyo.',
                'Los sonidos de la nave son de cada uno: cada persona los ajusta en su aparato, en la pausa o en la sala, sin cambiárselos a nadie más.',
            ],
        },
        {
            date: '2026-10-22', items: [
                'Cada uno elige su color y su gorro, al preparar la partida o en la sala de espera. Cada color suena siempre igual, con su nota y sus pasos, en todos los aparatos. La P dice el color de cada uno.',
                'Papeles especiales, cada uno se pone o se quita en las reglas: el científico mira las constantes vitales desde cualquier sitio, el ingeniero va por los conductos, el ruidoso hace sonar una alarma si le matan, y el ángel de la guarda, de fantasma, protege a los vivos. Entre los impostores, el cambiaformas se transforma en otro y el espectro se vuelve invisible. Los poderes se usan con la B.',
                'Nuevo modo escondite: uno busca, y todos saben quién es, y los demás aguantan hasta que se acabe el tiempo. Si se te acerca, suena tu corazón cada vez más deprisa.',
                'Tareas comunes, largas y cortas: en las reglas se elige cuántas hay de cada clase, y si hay tareas que se ven, como el escáner, la basura y los escudos.',
                'Las cámaras, en directo: cuatro pantallas con quién pasa, de su color y hacia dónde va. Si alguien mata o se mete en un conducto delante de una cámara, se ve y se dice. Mientras alguien las mira, las cámaras de la nave se encienden y zumban.',
                'Práctica de impostor, con compañeros que no hacen nada, para aprender a matar, sabotear e ir por los conductos.',
            ],
        },
        {
            date: '2026-10-20', items: [
                'La Z (o el botón Quién hay) dice solo lo fundamental: la sala, a quién ves, hacia dónde y a qué distancia, y si hay cuerpos a la vista. Con las luces apagadas, solo quien está muy cerca.',
                'A los demás solo se les oye si se les ve, como en la pantalla: ni a través de una pared ni más lejos de lo que se ve. Con las luces apagadas, la tripulación ve y oye a menos distancia.',
                'Los rivales de la máquina ya no siguen pasos que oyen: van adonde han visto a alguien hace poco.',
                'Sonidos de la nave: el volumen del ambiente, de los demás, de lo tuyo, de la guía y de los avisos, al preparar la partida y en la pausa.',
                'Cada persona a la que ves suena con su nota, más deprisa cuanto más cerca está. La P toca las notas, y se puede quitar.',
                'La guía pita más agudo si hay que ir hacia delante y más grave hacia detrás.',
                'Los pasos de los demás suenan más fuertes, y el ambiente de los motores, el reactor, el almacén y el oxígeno, más bajo.',
            ],
        },
        {
            date: '2026-10-19', items: [
                'Se juega en las salas con amigos: cada uno anda en su navegador.',
                'La reunión tiene un tiempo para hablar, 120 segundos, y otro para votar, 60. Quien no vota a tiempo salta el voto, y se puede decir que quieres votar ya.',
                'En las salas no hay frases en la reunión, porque se habla en la llamada. Se pueden poner en las reglas de la casa.',
                'Sabotajes nuevos: el oxígeno y las comunicaciones.',
                'Seis tareas nuevas: repetir la secuencia, fijar el rumbo, vaciar la basura, limpiar el filtro, ajustar la temperatura y analizar las muestras.',
                'Reglas de la casa nuevas: el tiempo para hablar y para votar, las frases y cuándo se pone al día la barra de tareas.',
            ],
        },
        {
            date: '2026-10-18', items: [
                'La nave entera: once salas y quince pasillos, con puertas.',
                'Los impostores sabotean con la X (las luces, el reactor y las puertas) y van por los conductos con la V.',
                'Tres consolas: el mapa de Administración, las cámaras de Seguridad y las constantes vitales.',
                'Tareas nuevas: el escáner, el combustible y los escudos.',
                'Llegan los impostores: matan con la Q, los cuerpos suenan y con la R se avisa. En el Comedor está el botón de emergencia.',
                'La reunión: los compañeros de la máquina hablan con su voz, tú eliges frases y se vota.',
                'Los muertos siguen como fantasmas y pueden acabar sus tareas.',
                'Primera versión: una nave que se recorre a ciegas con sonido 3D, la guía con la G, lo que hay cerca con la F y cuatro tareas de oído.',
            ],
        },
    ],
};

/** Las novedades de un juego con las de todo el salón, por fechas, de la más nueva a la más antigua. */
function newsFor(id) {
    const days = new Map();
    const add = (list, shared) => {
        for (const n of list || []) {
            if (!days.has(n.date)) days.set(n.date, []);
            days.get(n.date).push(...n.items.map(text => ({ text, shared })));
        }
    };
    add(NEWS[id], false);
    // Lo del salón, solo desde que existe el juego.
    const first = (NEWS[id] || []).map(n => n.date).sort()[0] || '';
    add((NEWS.salon).filter(n => n.date >= first), true);
    return [...days.keys()].sort().reverse().map(date => ({ date, items: days.get(date) }));
}

const NEWS_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «2026-10-20» → «20 de octubre de 2026». */
function newsDate(date) {
    const [y, m, d] = date.split('-').map(Number);
    return `${d} de ${NEWS_MONTHS[m - 1]} de ${y}`;
}

if (typeof module !== 'undefined') module.exports = { NEWS, newsFor, newsDate };
