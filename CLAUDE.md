# El Pedro — guía para trabajar en el proyecto

Salón de juegos de cartas con baraja española, **en español**, pensado para personas ciegas y jugable por cualquiera. Se publica con GitHub Pages desde `main`: <https://zeterpe.github.io/El-Pedro/>.

Hay seis juegos: **El Pedro** (memoria), **la Brisca** (bazas), **el Parchís** (dado y fichas), **el Trivial** (preguntas y quesitos), **el Virus** (cartas de órganos, virus y medicinas) y **El Impostor** (una nave en tiempo real que se recorre con el oído, con impostores, sabotajes, conductos, cuerpos y reuniones). Los sonidos, la voz, la mesa y las salas son comunes; cada juego pone sus reglas, sus rivales y cómo se cuenta lo que pasa. Para añadir otro juego, mira «Cómo se añade un juego».

**Prioridades, por este orden:** que se pueda jugar sin ver la pantalla, que sea divertido, y lo demás.

## Tecnología

- HTML + CSS + JavaScript **sin compilación ni dependencias**.
- Los archivos de `js/` son *scripts clásicos* que comparten el ámbito global, así que **el orden de los `<script>` en `index.html` importa**: rules → brisca → ai → brisca-ai → parchis → parchis-ai → trivial/(geografia, espectaculos, historia, arte, ciencia, deportes) → trivial → trivial-ai → virus → virus-ai → impostor → impostor-ai → snapshot → speech → audio → space-audio → texts → ui → vendor/peerjs → net → mirror → cards → board → match → pedro → brisca-match → parchis-match → trivial-match → virus-match → impostor-match → news → games → online → app.
- Única dependencia: PeerJS (MIT), copiada en `js/vendor/peerjs.min.js`. No se carga de ningún CDN.
- `rules.js`, `ai.js`, `brisca.js`, `brisca-ai.js`, `parchis.js`, `parchis-ai.js`, `trivial.js`, `trivial-ai.js`, `virus.js`, `virus-ai.js`, `impostor.js`, `impostor-ai.js`, `snapshot.js` y las preguntas de `js/trivial/` no tocan la pantalla y también se cargan con Node (`require`), para probarlos sin navegador. `node tests/brisca.test.js` juega cientos de partidas de Brisca y comprueba puntos, bazas y lo que ve cada jugador; `node tests/parchis.test.js` prueba cada regla del Parchís con tableros preparados y juega más de cien partidas; `node tests/trivial.test.js` revisa el banco de preguntas, el tablero y cada regla del Trivial, y juega más de cien partidas; `node tests/virus.test.js` prueba el mazo, cada carta y cada tratamiento con mesas preparadas, y juega más de cien partidas; `node tests/impostor.test.js` prueba la nave, los caminos, andar y chocar, ver y oír, las tareas (también las de dos sitios y el escáner), matar, avisar, el botón, los sabotajes, las puertas, los conductos, las consolas, los fantasmas, la reunión y la votación, el tiempo de la reunión, el oxígeno y las comunicaciones, la barra, las tareas nuevas, la sala de espera (`lobby`, el color de cada uno) y la partida en una sala (`remoteMove`, `ImpostorMirror` y lo que sabe cada uno), y juega sesenta partidas sin impostores y ciento veinte con ellos; `node tests/snapshot.test.js` copia a mitad de partida cada juego con sus rivales y comprueba que la copia sigue exactamente igual que la de verdad.
- Sonido: todo se sintetiza con Web Audio en `js/audio.js` (y el sonido 3D de El Impostor, en `js/space-audio.js`). No hay archivos de audio.
- Voz: `speechSynthesis` o el lector de pantalla (regiones `aria-live`), en `js/speech.js`.

| Archivo | Qué contiene |
| --- | --- |
| `js/rules.js` | Reglas de El Pedro: baraja, reparto, turnos, poderes, quemar, cantar Pedro, puntos. `DEFAULT_RULES`, `GAME_VERSION`, azar con semilla (`makeRng`), `makeDeck`, `SUITS` |
| `js/brisca.js` | Reglas de la Brisca (`BriscaGame`, `BRISCA_DEFAULT_RULES`), lo que ve cada uno (`briscaEventFor`) y la mesa del invitado (`BriscaMirror`) |
| `js/ai.js` | Memoria de cada jugador (`Memory`), rivales de El Pedro (`Bot`) y los personajes (`CHARACTERS`), que son los mismos en todos los juegos |
| `js/brisca-ai.js` | Rivales de la Brisca (`BriscaBot`): cuentan cartas, cargan puntos y guardan triunfos según la dificultad |
| `js/parchis.js` | Reglas del Parchís (`ParchisGame`, `PARCHIS_DEFAULT_RULES`): tablero, salidas, seguros, barreras, comer y contar, meta, parejas. También la mesa del invitado (`ParchisMirror`); en el Parchís no hay nada oculto |
| `js/parchis-ai.js` | Rivales del Parchís (`ParchisBot`): puntúan cada jugada (comer, meta, salir, peligro) según la dificultad |
| `js/trivial.js` | Reglas del Trivial (`TrivialGame`, `TRIVIAL_DEFAULT_RULES`): la rueda (`TRIVIAL_BOARD`), los movimientos (`trivialMoves`), las preguntas por categoría, quesitos, equipos y la final. También la mesa del invitado (`TrivialMirror`); la respuesta buena solo la sabe el anfitrión hasta que se contesta |
| `js/trivial-ai.js` | Rivales del Trivial (`TrivialBot`): aciertan más o menos según la dificultad y su categoría favorita, y eligen casilla buscando quesitos |
| `js/trivial/*.js` | El banco de preguntas, un archivo por categoría (`TRIVIAL_BANK`): `[pregunta, buena, mala, mala, mala, nivel]`, nivel de 1 (fácil) a 3 (difícil) |
| `js/virus.js` | Reglas del Virus (`VirusGame`, `VIRUS_DEFAULT_RULES`): el mazo de 68 cartas (`makeVirusDeck`), qué hace cada virus y medicina (`virusEffect`), los tratamientos, lo que ve cada uno (`virusEventFor`) y la mesa del invitado (`VirusMirror`) |
| `js/virus-ai.js` | Rivales del Virus (`VirusBot`): prueban cada jugada y miden cómo queda su cuerpo y el del rival que va por delante |
| `js/impostor.js` | Reglas de El Impostor (`ImpostorGame`, `IMPOSTOR_DEFAULT_RULES`), lo que sabe cada uno (`impostorEventFor`) y la nave del invitado (`ImpostorMirror`): la nave (`SHIP`, salas, pasillos, puertas, muebles, sitios de las tareas, paneles, consolas, cámaras, conductos y el botón), andar y chocar (`tick`), los caminos (`shipPath`, `shipStandAt`), ver y oír (`perceive`), las tareas, los papeles (`impostorsFor`), matar, los sabotajes y las puertas, los conductos, las consolas, los cuerpos, la reunión con su tiempo y la votación, los colores y gorros (`IMPOSTOR_COLORS`, `IMPOSTOR_HATS`), los papeles especiales (`IMPOSTOR_ROLES`) y el escondite |
| `js/impostor-ai.js` | Compañeros de El Impostor (`ImpostorBot`): van a sus tareas por el camino más corto y pasean; recuerdan a quién han visto y dónde; corren a arreglar los sabotajes; como impostores, fingen tareas, matan a quien anda solo, sabotean (`sabThink`) y huyen por los conductos (`ventThink`). En la reunión dicen dónde estaban, pillan mentiras por el tiempo que se tarda en andar (`contradicts`), se defienden y votan (`meetingLines`, `react`, `vote`) |
| `js/snapshot.js` | `Snapshot`: la copia de la partida entera (las reglas y los rivales), para seguirla en otro navegador si se va quien lleva la sala. Guarda quién apunta a quién, los `Set`, los `Map`, el azar (`makeRng` con `save` y `load`) y la clase de cada objeto; lo que es igual en todos los navegadores (`externs`: la nave, los personajes, las preguntas) no se copia |
| `js/audio.js` | Sonidos: palo de cada carta, sitios de la mesa, momentos del juego |
| `js/space-audio.js` | Sonido 3D de El Impostor (`SpaceAudio`, con HRTF): el oído siempre mira al norte, lo de detrás suena apagado y lo de tras una pared, amortiguado. Cada sonido va en su grupo (`SOUND_GROUPS`), con su volumen (`setMix`). También los sonidos de la nave (`ShipSounds`), los pasos de cada uno (`STEP_TIMBRES`), la nota de cada uno (`PRESENCE_NOTES`) y el ambiente de cada sala (`ROOM_AMBIENCE`) |
| `js/speech.js` | Voz del juego o lector de pantalla |
| `js/texts.js` | Cómo se dicen las cartas y los sitios («la sota de oros», «tu carta 2») |
| `js/ui.js` | Pantallas, foco, `Dialog` (preguntas con opciones) y `OptionList` (opciones) |
| `js/cards.js` | Dibujo SVG propio de las cartas españolas (`CardArt.face`, `CardArt.back`) |
| `js/board.js` | La mesa común: sitios, botones de acción (`actionsDef` de cada juego), animaciones (volar, destello, cartel, confeti), bocadillos, cursor de teclado |
| `js/match.js` | `Match`: lo común a una partida de cualquier juego. Bucle de turnos, voz y pausas, fin de ronda y de partida, teclado, salas (`local`, `host`, `client`) y quien se va o vuelve |
| `js/pedro.js` | `PedroMatch`: la mesa de El Pedro. Elegir cartas tocándolas (`pick`), quemar en cualquier momento, poderes y lo que se cuenta |
| `js/brisca-match.js` | `BriscaMatch`: la mesa de la Brisca. Mazo con la muestra, baza en el centro, tocar dos veces para jugar, consejos en la práctica |
| `js/parchis-match.js` | `ParchisMatch` y `ParchisArt`: el tablero en SVG (girado para que tu casa quede abajo a la derecha), fichas que andan casilla a casilla, dado, peligros y consejos |
| `js/trivial-match.js` | `TrivialMatch` y `TrivialArt`: la rueda en SVG, la tarjeta de la pregunta con sus cuatro respuestas, elegir casilla y los quesitos de cada uno |
| `js/virus-match.js` | `VirusMatch` y `VirusArt`: las cartas en SVG (órganos con cara, virus, medicinas y tratamientos), los cuerpos de cada uno, elegir carta y después dónde va, paso a paso, y descartar |
| `js/impostor-match.js` | `ImpostorMatch` e `ImpostorArt`: la nave en un canvas que sigue a tu personaje, el bucle en tiempo real, las teclas que se mantienen pulsadas, el joystick y la cruceta, la guía, lo que hay cerca (F), a quién ves y si hay cuerpos (Z, `whoHere`), los trece minijuegos de las tareas, los paneles de los sabotajes y las consolas, matar (Q), avisar (R), sabotear (X), los conductos (V), los cuerpos, la reunión con su reloj y sus diálogos, las cámaras en directo (`drawCams`), los poderes (B), el escondite y la partida en una sala (`runClient`) |
| `js/news.js` | `NEWS`: las novedades de cada juego, de la más nueva a la más antigua, y las de todo el salón (`salon`). `newsFor(id)` las junta por fechas. Se ven en la pestaña Novedades del menú de cada juego |
| `js/games.js` | `GAMES`: cada juego con su nombre, reglas de la casa, opciones de la partida y el texto de «Cómo se juega» |
| `js/net.js` | Conexión con PeerJS: `HostNet` (abre la sala `elpedro-NNNNN`) y `ClientNet` |
| `js/mirror.js` | `MirrorGame`: la mesa tal como la ve un invitado, sin cartas ocultas. `eventFor()` quita a cada jugador las cartas que no puede ver |
| `js/online.js` | Salas: crear, unirse con código o enlace (`?sala=`), elegir juego, sala de espera, reglas de la mesa, reparto de mensajes, volver a entrar |
| `js/app.js` | Portada (cómo jugar), nombre, salón, menú de cada juego, ajustes guardados (`DEFAULT_SETTINGS`), estadísticas por juego y teclado |
| `tests/brisca.test.js` | Pruebas de la Brisca con Node |
| `tests/parchis.test.js` | Pruebas del Parchís con Node |
| `tests/trivial.test.js` | Pruebas del Trivial con Node |
| `tests/virus.test.js` | Pruebas del Virus con Node |
| `tests/impostor.test.js` | Pruebas de El Impostor con Node |
| `tests/snapshot.test.js` | Pruebas de la copia de la partida con Node |

### Cómo funcionan las reglas

Cada juego es una máquina de estados con `act()` y `view(seat)`. Cada `act` devuelve los **sucesos** que ha provocado; un suceso con `secret: true` lleva una carta que solo debe conocer quien la ve. La mesa (`Match`) solo cuenta lo que dicen esos sucesos.

**El Pedro.** `PedroGame` tiene estas fases: `peek` → `turn` → `drawn` → `power` → … → `roundOver` → `gameOver`.

- Cada `act({ type, p, … })` devuelve sus sucesos (`draw`, `swap`, `burn`, `reveal`…).
- Los rivales y la ayuda de memoria solo aprenden de esos sucesos, como en una mesa de verdad.
- **Quemar no tiene ventana ni tiempo:** se puede en `turn`, `drawn` y `power` (`BURN_PHASES`), también en el turno de otro. La acción `burn` lleva `top`, el id de la carta de la mesa que veía el jugador; si ya ha cambiado, no vale.
- Si quemas la carta de otro, la fase pasa a `give` y, al dar tu carta, vuelve a la que había.
- Si alguien se queda sin cartas, se acaba la ronda al momento (`reveal` con `reason: 'empty'`).
- En `PedroMatch`, las quemas van a una cola (`queueBurn`) y el bucle principal las atiende antes que el turno (`processBurns`). Los rivales de la máquina se preparan cada vez que cambia la carta de la mesa (`planBots`).
- Quien canta Pedro juega su turno; después nadie toca sus cartas (`isProtected`) y esa persona ya no quema (`isFrozen`).

**La Brisca.** `BriscaGame` tiene las fases `turn` → `roundOver` → `gameOver`.

- Las acciones son `play` (con `slot`), `swapTrump` (cambiar la muestra) y `cante` (las 20 o las 40). La regla `swapWhen` dice si la muestra se cambia en cualquier turno tuyo (`turno`) o solo al salir (`salir`). `legal(p)` y `playable(p)` dicen lo que vale; con arrastre, `playable` obliga a asistir y montar.
- Cada mano tiene sus sucesos: `round` (triunfo y cartas quitadas para repartir igual), `deal`, `play`, `trick`, `draw`, `deckOut`, `swapTrump`, `cante` y `handOver`.
- Por parejas (4 o 6 jugadores con `pairs`), el equipo de cada uno es `p % 2`: vas con quien tienes enfrente.
- `BriscaMatch` cuenta los sucesos con algo de retraso respecto al juego, así que dibuja desde su propia copia (`this.shown`), que se pone al día suceso a suceso.

**El Parchís.** `ParchisGame` tiene las fases `roll` → `move` → `bonus` → … → `gameOver`.

- **El tablero.** 68 casillas. Los colores van en este orden: amarillo, azul, rojo y verde, con salidas en la 5, 22, 39 y 56. Cada color entra en su pasillo después de la casilla que está 5 antes de su salida (68, 17, 34 y 51). Los seguros son las salidas, las entradas a los pasillos y las casillas 12, 29, 46 y 63.
- **Dónde está cada ficha** (`pos`): -1 en casa, de 0 a 63 por el tablero contando desde su salida, de 64 a 70 en el pasillo y 71 en la meta. `parchisSquare(color, pos)` da la casilla del tablero.
- **Las acciones** son `roll` y `move` (con `o`, de quién es la ficha, e `i`, cuál). `options` dice las jugadas que valen; si no hay ninguna, se pasa solo (`noMove`).
- **Las reglas que obligan:** con un 5, si hay fichas en casa, hay que sacar; con un 6 y una barrera tuya, hay que abrirla (`openBarrier`). Si la salida está llena con una ficha de otro, al salir se come la última que llegó.
- **Comer y meta.** Al comer se cuentan `eatCount` casillas (20) y al llegar a la meta `metaCount` (10), con la ficha que quieras: fase `bonus`. Si ninguna puede, se pierden (`bonusLost`).
- **El 6.** Se vuelve a tirar; sin fichas en casa cuenta 7 (`sixSeven`); el tercer 6 seguido manda a casa la última ficha movida, salvo si ya está en el pasillo (`threeSixes`).
- **Por parejas** (4 jugadores con `pairs`), el equipo es `p % 2`. No se come a la pareja y, quien acaba, mueve las fichas de su pareja (`controlled`).
- Sucesos: `round`, `turn`, `roll`, `noMove`, `move` (`kind`: `out`, `roll` o `bonus`), `capture`, `meta`, `bonus`, `bonusLost`, `penalty`, `finished` y `gameOver`.
- Como la Brisca, `ParchisMatch` dibuja desde `this.shown` y mueve las fichas casilla a casilla mientras lo cuenta.

**El Trivial.** `TrivialGame` tiene las fases `roll` → `move` → (`pick`) → `answer` → … → `gameOver`.

- **El tablero** (`TRIVIAL_BOARD`, 73 casillas): el centro es la 0; el anillo, de la 1 a la 42, con un quesito cada 7 casillas; los seis radios, de la 43 a la 72, cinco casillas cada uno. En el anillo hay casillas de «vuelve a tirar». Se mueve la cuenta justa sin volver atrás (`trivialMoves`).
- **Las categorías**, en orden: geografía (azul), espectáculos (rosa), historia (amarillo), arte y literatura (marrón), ciencia (verde) y deportes (naranja). Cada una tiene su mazo; las preguntas ya vistas en este aparato (`localStorage['elpedro.trivial.seen']`) van al final.
- **Las acciones** son `roll`, `move` (con `to`), `pick` (con `cat`, en el centro o la final) y `answer` (con `choice`, de 0 a 3). El suceso `question` no lleva la respuesta buena; la dice `answer` al contestar.
- **El turno.** Si aciertas, vuelves a tirar (`rollAgain`), pero tras `streak` aciertos seguidos (3) pasa el turno aunque aciertes: suceso `streak`.
- **La dificultad** de las preguntas (`level`): `todas`, `faciles`, `medias` o `dificiles`. Se elige al preparar la partida y en las reglas de la casa (en una sala, las del anfitrión). Hay unas 3800 preguntas: más de 130 de cada nivel en cada categoría, y en Espectáculos también anime y series.
- **Quesitos y final.** Se gana el quesito acertando en su casilla. Con `wedges` quesitos se va al centro y, con `hubFinal`, se gana acertando la final; la categoría la eligen los rivales, el azar o tú (`finalPick`).
- **Por equipos** (4 o 6 jugadores con `teams`), el equipo es `p % 2` y cada equipo lleva una sola ficha; contestan por turnos.
- Como el Parchís, `TrivialMatch` dibuja desde `this.shown` y mueve la ficha casilla a casilla.

**El Virus.** `VirusGame` tiene las fases `turn` → `roundOver` → `gameOver`.

- **Las cartas.** 68: 5 órganos de cada color y uno multicolor, 4 virus de cada color y uno multicolor, 4 medicinas de cada color y 4 multicolores, y 10 tratamientos (3 trasplantes, 3 ladrones, 2 contagios, un guante y un error médico). Los colores son `rojo` (corazón), `azul` (cerebro), `verde` (estómago), `amarillo` (hueso) y `multi`.
- **Un órgano se dice por su dueño y su color** (`{ p, color }`): nadie tiene dos del mismo color. Su estado sale de lo que tiene encima (`organState`): libre, infectado, vacunado o inmune.
- **Las acciones** son `play` (con `slot` y, según la carta, `target`, `a` y `b` en el trasplante, o `moves` en el contagio) y `discard` (con `slots`). `playsFor(p, slot)` da todas las jugadas que valen de una carta; una carta sin jugadas no se puede jugar. Después se roba hasta tener 3; sin mazo, se da la vuelta a los descartes sin barajar (`flip`).
- **Colores.** Un virus o medicina vale sobre lo que tiene arriba el órgano: el órgano si está libre, el virus si está infectado (para curar) y la medicina si está vacunado (para romperla). Para infectar del todo e inmunizar cuenta el color del órgano. El multicolor vale con todo.
- **Ganar.** Con 4 órganos sanos se gana al momento, también en el turno de otro (un trasplante o un error médico). Por parejas (4 o 6 con `pairs`), el equipo es `p % 2`: no se atacan con virus ni se roban, y gana la pareja.
- **El guante** deja a los demás sin cartas; en su turno solo roban (`lostTurn`).
- Sucesos: `round`, `deal`, `turn`, `play` (con `effect`), `discard`, `draw`, `flip`, `lostTurn`, `roundOver` y `gameOver`.
- `VirusMatch` dibuja desde `this.shown` y lo pone al día con cada suceso (`applyShown`). Al elegir una carta, sus jugadas se ofrecen paso a paso (`pathsOf`): el trasplante pregunta primero un órgano y luego el otro, y el contagio cada virus.

**El Impostor.** `ImpostorGame` tiene las fases `ship` → `meeting` → `ship` → … → `gameOver`. A diferencia de los demás juegos, va en tiempo real.

- **La nave** (`SHIP`): una cuadrícula de 58 por 40 metros (cada casilla, uno) con once salas y quince pasillos de tres metros de ancho, y una puerta en cada boca de pasillo (`doors`, con sus `cells`). x crece hacia la derecha e y hacia abajo; el norte, arriba en la pantalla, es «delante». Las paredes son -1 y los muebles -2 (no se pisan, pero no tapan la vista).
- **Andar.** `input(p, dx, dy)` dice hacia dónde quiere ir cada uno y `tick(dt)` mueve a todos, eje por eje para resbalar por las paredes; si andas recto contra una esquina, la rodeas (`slideCorner`). Sucesos de `tick`: `area` (entras en una sala o un pasillo) y `bump` (chocas). `ImpostorMatch` llama a `tick` treinta veces por segundo desde `requestAnimationFrame`, y se para con la pausa y los diálogos.
- **Ver y oír** (`perceive`): se ve a quien está a 6 metros o menos sin pared en medio (los impostores, un 30 % más lejos); **a los demás solo se les oye si se les ve**: sus pasos, su nota, sus tareas, una muerte o la tapa de un conducto, nunca tras una pared ni más lejos de lo que se ve, para que quien oye no sepa más que quien ve. Con las luces apagadas, la tripulación viva ve y oye a menos distancia. Los vivos no ven ni oyen a los fantasmas. `perceive` también da los cuerpos a la vista.
- **Las tareas.** Acciones `startTask` y `task` (con `i`, cuál de tus tareas) y `cancelTask`. Hay que estar a 1,4 metros o menos de su sitio. Las de `steps` se hacen en dos sitios: al acabar el primero, el suceso `taskStep` da el siguiente (`spot`). Las de `visible` (el escáner) llevan `visible` en `taskStart`: quien lo ve sabe que eres tripulante; la de un impostor no lo lleva. Las tareas de los impostores son de mentira (`fake`): pueden empezarlas para que se les vea ocupados, pero no acabarlas. La barra (`taskBar`) cuenta solo las de la tripulación, también las de sus fantasmas.
- **Los papeles.** `impostorsFor(n, impostors)`: ninguno con menos de 4 jugadores; con `'auto'`, uno, y dos desde 7; como mucho 1 hasta 6, 2 hasta 8 y 3 con 9 o 10. `players[i].role` (`'crew'` o `'impostor'`) es lo que pide cada uno; el suceso `role` (secreto) dice el tuyo y, al impostor, quiénes son los otros.
- **Matar** (`kill`, con `target`): un impostor vivo, con `killCd` a 0 y a `killRange` metros o menos (corto 1,2, medio 1,8, largo 2,6) sin pared. El primero espera `min(10, killCooldown)` y los demás `killCooldown`, también después de cada reunión. El suceso `kill` lleva quién lo ha visto (`witnesses`); queda un cuerpo (`bodies`) y el impostor pasa al sitio de su víctima.
- **Los sabotajes** (`sabotage`, con `kind`; solo impostores, también de fantasma; regla `sabotages`). `lights`: la tripulación viva ve un 35 % (`IMPOSTOR_LIGHTS`) y se arregla en el cuadro de Electricidad (`fix`, con `panel`). `reactor`: estalla a los `reactorTime` segundos y ganan los impostores (`reactor`), salvo si dos ponen la mano a la vez en los dos paneles (`fix` deja `busy = { fix }`; suceso `fixHold`). `oxygen`: se acaba a los `reactorTime` segundos, como el reactor, salvo si alguien teclea el código en los dos teclados (Oxígeno y Administración), uno detrás de otro o a la vez (`sab.done`; suceso `fixPart`). `comms`: no se ve la barra ni van las consolas, salvo las constantes vitales (`commsDown`), y se arregla en la radio de Comunicaciones. El reactor y el oxígeno son los críticos (`IMPOSTOR_CRITICAL`, `critical`). Todos están en `IMPOSTOR_SABOTAGES`. Entre sabotaje y sabotaje, `IMPOSTOR_SAB_COOLDOWN`; `sabWait(kind)` dice cuánto falta (null si no se puede). Sucesos: `sabotage`, `fixPart` y `fixed`.
- **Las puertas** (`kind: 'doors'`, con `room`): se cierran las de una sala durante `IMPOSTOR_DOORS_TIME` segundos (`doorsShut`, y las casillas en `closed`, que reciben `shipSolid`, `shipSight`, `shipPath`…). Quien está en la puerta sale empujado. Se abren solas (`doorsOpen`, desde `tick`) y hay que esperar `IMPOSTOR_DOORS_COOLDOWN` para volver a cerrar. Suceso `doors`.
- **Los conductos** (`vent`: entrar o salir; `ventTo`, con `to`: ir a otro de la misma red; regla `vents`). Once, en cuatro redes (`SHIP.vents`, con `to`). Dentro no se ve ni se oye al impostor, y solo vale sabotear, `ventTo` y salir. El suceso `vent` (`kind`: `in`, `out` o `move`) lleva quién lo ha visto (`witnesses`).
- **Las consolas** (`console`, con `id`): el mapa de Administración (`admin`: cuántos hay en cada sala, sin contar pasillos ni conductos), las cámaras de Seguridad (`cams`: a quién se ve a `IMPOSTOR_CAMERA` metros de cada cámara) y las constantes vitales de la Enfermería (`vitals`). El suceso `console` es secreto y lleva `data`; la mesa lo vuelve a pedir cada segundo mientras miras.
- **Avisar y el botón.** `report` vale a 3 metros o menos de un cuerpo; `button`, a 1,6 metros o menos de la mesa del Comedor (`SHIP.button`), si te quedan reuniones (`meetings`) y han pasado `buttonWait` segundos (`buttonWait()`). Los dos empiezan la reunión: todos vuelven al Comedor, se quitan los cuerpos, se acaba el sabotaje y se abren las puertas (el suceso `meeting` lleva `sab` y `doors`). Con el reactor o el oxígeno a punto de acabarse no vale el botón.
- **La reunión** (`meeting`) tiene sus partes (`stage`): `talk`, `vote` y `result`. Primero se habla `discussTime` segundos (120; hasta `talkUntil`) y nadie vota; si todos los vivos dicen que quieren votar ya (`ready`), se vota antes (`voteStart`). Luego se vota `voteTime` segundos (60; hasta `voteUntil`) y quien no ha votado salta el voto (`timeout`). El reloj lo corre `meetingTick`, desde `tick`. Las acciones: `say` (con `line`: `kind` y, según la frase, `who` y `area`; como mucho `IMPOSTOR_SAY_MAX` por persona), `ready` y `vote` (con `target`, o -1 para saltar). Cuando han votado todos los vivos: `voteResult` y, si alguien tiene más votos que nadie y que saltar, `eject` (con `impostor`, o null si `confirmEjects` está quitado). La reunión se queda en `result` hasta que la mesa llama a `resumeShip` (suceso `resume`), cuando todos lo han oído; o `gameOver`.
- **Las frases** de la reunión (regla `phrases`): con `'auto'`, se usan contra la máquina y no en una sala, porque se habla en la llamada (`phrasesOn` en la mesa). Los rivales de la máquina hablan y votan siempre.
- **La barra de tareas** (regla `barUpdates`): `siempre`, `reuniones` (se pone al día al empezar cada reunión) o `nunca`. Lo que ve todo el mundo es `barShown` (`syncBar`, suceso `taskBar` con `mode`); `taskBar()` es la de verdad, con la que se gana.
- **Ganar.** La tripulación, con la barra llena (`tasks`) o sin impostores vivos (`ejected`); los impostores, cuando son tantos como los tripulantes vivos (`kills`) o si estalla el reactor o se acaba el oxígeno (`reactor`, `oxygen`).
- **Los fantasmas** atraviesan las paredes sin salir de la nave, ven igual con las luces apagadas y acaban sus tareas; no avisan, no votan, no arreglan sabotajes ni usan los conductos.
- **Colores y gorros.** Cada uno elige color (`IMPOSTOR_COLORS`, diez) y gorro (`IMPOSTOR_HATS`); `impostorLooks` reparte los que se repiten. Cada color suena siempre igual en todos los navegadores: sus pasos (`STEP_TIMBRES[1 + color]`) y su nota (`PRESENCE_NOTES[color]`). En la mesa, `lookText(p)` dice «el rojo, con una corona» y `ImpostorArt.crew`/`drawHat` los dibujan. Contra la máquina salen de los ajustes `impostorColor` e `impostorHat`; en una sala, cada uno lo elige con «Tu color y tu gorro» (`pickLook`, mensaje `look`, y `hello` lo lleva).
- **Los papeles especiales** (`IMPOSTOR_ROLES`, reglas `roleScientist`, `roleEngineer`, `roleNoisemaker`, `roleAngel`, `roleShapeshifter` y `rolePhantom`, de 0 a 2 cada uno): científico (las constantes vitales desde cualquier sitio), ingeniero (conductos, con tiempo dentro), ruidoso (al morir, una alarma desde su cuerpo: suceso `alarm`), ángel de la guarda (de fantasma, protege: `protect`, `shielded`, `shieldOff`), cambiaformas (toma el aspecto y la nota de otro: `shift`, `unshift`) y espectro (invisible y en silencio un rato: `vanish`, `appear`). El poder es la acción `power` (tecla B), con su duración (`dur`) y su espera (`cd`). El suceso `role` lleva `special`.
- **El escondite** (regla `mode: 'escondite'`, con `hideTime`): un impostor que todos conocen caza y la tripulación aguanta; cada tarea quita unos segundos (`IMPOSTOR_HIDE`). No hay reuniones, botón ni sabotajes, y todos van por los conductos. Al final, el cazador sabe dónde estáis (`ping`). Sucesos `hideGo` y `finalHide`. La mesa hace latir el corazón cuando el cazador está cerca (`hideCues`).
- **Clases de tareas:** `commonTasks` (las mismas para todos), `longTasks` (las demás son cortas) y `visualTasks` (el escáner, la basura y los escudos se ven: `IMP_VISUAL` en la mesa).
- **Las cámaras en directo.** Mientras alguien mira las cámaras, zumban y se encienden en la nave (`camsAt`, `camsOn`, el bucle `camHum`). La consola enseña cuatro pantallas que se dibujan cada fotograma (`drawCams`, con el mismo `drawBase` que la nave) y dice quién aparece, una muerte o un conducto vistos por cámara (`camsWatching`, `camFlash`).
- **La práctica** tiene dos modos (`practiceModes` en `GAMES`): la nave sola, o de impostor contra muñecos que pasean (regla `dummies`).
- Sucesos: `round`, `role`, `tasks` (secretas), `taskBar`, `taskStart`, `taskStep`, `taskStop`, `taskDone`, `kill`, `sabotage`, `fixHold`, `fixPart`, `fixed`, `doors`, `doorsOpen`, `vent`, `console` (secreto), `meeting`, `say`, `ready`, `voteStart`, `vote`, `voteResult`, `eject`, `resume` y `gameOver`.
- **La sala de espera** (regla interna `lobby`, que pone la sala y no sale en las reglas de la casa; `GAMES.impostor.waitRoom`): en una sala, «Empezar» no arranca la partida sino una `ImpostorGame` con `lobby: true`: todos en el Comedor (`IMPOSTOR_LOBBY_ROOM`) con sus puertas cerradas (`shutLobby`), sin impostores, tareas, papeles ni escondite, y los de la máquina pasean. Solo valen andar y `look` (con `color` y `hat`): un color de otra persona no se coge; el de uno de la máquina se cambia por el tuyo (suceso `look`, con `swap`). En la mesa (`ImpostorMatch.lobby`): la C elige color y gorro (`lobbyLook`, con `impostorLookDialog`, que hace sonar la nota de cada color al pasar por él: `IMP_NOTE_NAMES`, `impNoteSample`) y la E, solo el anfitrión, empieza (`lobbyStart` → `Online.startGame`). Si alguien entra o se va, el anfitrión la empieza otra vez con cada uno donde estaba (`Online.refreshWaiting`, `syncLooks`, `at` en cada sitio) y a quien ya estaba solo se le dice quién (`note`). Al acabar la partida, «Volver a la sala de espera de la nave» (`hostAgainLabel`) vuelve a ella. Los sonidos de la nave (`impostorSound`, `impostorPresence`) son ajustes de cada aparato: se cambian en la pausa y en la sala (`lobby-sound`), y no tocan a nadie más.
- **La orientación es fija:** el oído siempre mira al norte, así que lo que está a tu derecha en la pantalla suena a tu derecha. Las direcciones se dicen así: «delante», «delante a la derecha», «a la derecha»… (`impDir`).
- **La voz.** En la nave habla la voz del juego aunque juegues con lector de pantalla (`speech.say` con `tts: true`), porque el lector se queda atrás; con el ajuste `impostorVoice: 'lector'`, habla el lector.
- **Las tareas** son minijuegos de la mesa (`cables`, `descarga`, `motor`, `codigo`, `escaner`, `combustible`, `escudos`, `secuencia`, `rumbo`, `basura`, `filtro`, `temperatura` y `muestras`, cada uno con su `…Start`, `…Key` y `…Tick`); al acabar uno, la mesa manda `task`. Casi todas se hacen de oído: la secuencia repite tonos, el rumbo y el filtro suenan desde su lado, la basura se mantiene pulsada. Las muestras tienen dos pasos con espera (`wait`): se empiezan, se analizan 60 segundos (`readyAt`) y se recogen. Si eres impostor, la E en el sitio de una tarea te pone a fingir, y andar lo deja. En el escáner, quien te vea sabrá que no te escanea; los impostores de la máquina no lo fingen.
- **Los paneles y las consolas** se abren como una tarea (`openPanel`): el cuadro de las luces (`luces`, interruptores; al acabar manda `fix`), los teclados del oxígeno (`oxigeno`, un código), la radio de las comunicaciones (`radio`, buscar la frecuencia de oído), la mano en el reactor (`reactor`, hasta que se arregla o la quitas) y las consolas (`consola`, que se pone al día sola y dice lo que cambia). Los que llevan `local` no los sabe la partida: andar los deja.
- **Sabotear y los conductos en la mesa.** La X abre `sabotageMenu` (las puertas preguntan después qué sala). Dentro de un conducto, las flechas te llevan al conducto que está hacia ese lado (`ventMove`) y los números, a cada salida (`ventPick`); la V sale. La sirena del reactor suena desde el Reactor y la alarma del oxígeno en toda la nave (sus teclados pitan desde su sitio); las dos avisan de cuánto queda a los 30, 20, 10 y 5 segundos (`sabCues`).
- **La reunión en la mesa** (`meetingStep`): el reloj (`meetingClock`) corre la reunión, se ve arriba (`#imp-meet-clock`) y avisa a los 30 y a los 10 segundos (`meetCues`). Mientras, hablan los de la máquina (`meetingBots` y `botTalk`, con su voz; quien sale nombrado contesta) y tú tienes abajo un diálogo (`humanMeeting`, con `dock`): decir algo (`pickLine`, si hay frases), querer votar ya, votar (cuando toca), oír lo dicho o quién queda y cuánto falta. Al empezar la votación, el diálogo cambia solo. Los de la máquina votan cuando se deciden. El panel `#imp-meet` muestra a cada uno, lo último que ha dicho y sus votos; sin voz, cada frase se queda un rato para leerla (`readPause`).
- **Los cuerpos suenan** como un monitor sin pulso (`bodyDrone`), desde su sitio y solo mientras están a la vista.
- **Los grupos de sonidos** (`SOUND_GROUPS`): `amb` (el ambiente de las salas), `people` (los pasos, la nota y las tareas de los demás), `mine` (tus pasos, los golpes y el roce de las paredes), `guide` (la guía) y `cues` (lo demás: puertas, tareas, cuerpos y sabotajes). `at`, `here` y `loop` reciben su grupo; sin grupo, `cues`. El volumen de cada uno es el ajuste `impostorSound`, que se cambia en Sonidos de la nave (`impostorSoundMenu`), al preparar la partida y en la pausa (`pauseItems`); al cambiarlo, suena una muestra (`impSoundSample`). Los pasos de los demás suenan más fuertes que los tuyos, para oírse por encima del ambiente.
- **La nota de cada uno** (`presenceCues`, ajuste `impostorPresence`): cada persona a la que ves suena con su nota (`PRESENCE_NOTES`, una escala pentatónica), desde su sitio y aunque esté quieta, más deprisa cuanto más cerca está.
- **El tono de la guía** (`aheadSemis`): el pitido sube una quinta si hay que ir justo hacia delante, baja una quinta hacia detrás y es el de siempre a los lados. El rumbo de su tarea suena igual.
- **En una sala** cada uno anda en su navegador. El invitado lleva una `ImpostorMirror`: anda él mismo con las reglas de la partida (`tickSelf`) y manda dónde está quince veces por segundo (`pos`; `remoteMove` en el anfitrión, que solo lo cree si se puede llegar en ese tiempo y no es una pared; si no, le salta a su sitio con `warp`). El anfitrión le manda lo que ve (`snap`, `view(seat, true)`) quince veces por segundo en la nave y dos en la reunión, y los sucesos en `batch`, filtrados por `impostorEventFor`: una muerte, una tarea o un conducto solo le llegan a quien lo ve, y de los demás solo sabe dónde está quien ve (`knownBy`). La partida no se para en una sala (ni con la pausa ni con los diálogos). El anfitrión espera a que todos hayan oído el principio de la partida y el resultado de la votación (`ack`). Quien vuelve a entrar oye lo que es, sus tareas y dónde está (`syncView`).

### Cómo funcionan las salas

- **En la sala se elige el juego** (`Online.game`). En El Impostor, «Empezar» lleva primero a la sala de espera de la nave (`Online.begin(true)`, `Online.waiting`); desde ella, quien ha creado la sala empieza la partida. Al acabar una partida, quien la ha creado puede volver a la sala (`backToLobby`) y elegir otro, sin crear una sala nueva.
- **Quien crea la sala** tiene la partida (`PedroGame`, `BriscaGame`, `ParchisGame`, `TrivialGame`, `VirusGame` o `ImpostorGame`) y decide todo. Después de cada acción manda a cada jugador un paquete `batch`, con los sucesos filtrados por `eventFor()` y la mesa (`view()`).
- **Cada invitado** guarda esa mesa en un `MirrorGame` (o `BriscaMirror`, `ParchisMirror`, `TrivialMirror`, `VirusMirror`, `ImpostorMirror`) y cuenta los sucesos a su manera, con voz o sin ella. Cuando le toca, manda su jugada (`act`) y el anfitrión la comprueba.
- **Quemar llega en cualquier momento:** el invitado manda `act` con `type: 'burn'` y el anfitrión lo pone en la cola. Si falla, le contesta con `burnError`.
- **Antes de que los rivales de la máquina intenten quemar,** el anfitrión espera a que todos hayan oído la carta (`ack`). Así nadie se queda atrás porque su voz vaya más lenta.
- **Si alguien se va,** juega la máquina por esa persona (`seatLeft`).
- **Si se va quien lleva la sala.** Quien la lleva manda una copia de la sala y de la partida (`sendBackup`, mensaje `backup` en trozos `bk`, con `Snapshot`) a los dos primeros que la llevarían (`heirs`: por orden de llegada, `n`; quien mira, solo si no queda nadie jugando), con cada jugada (en El Impostor, una vez por segundo). Cada dos segundos dice que sigue ahí (`ping`); el invitado que no oye nada en `HOST_SILENCE` vuelve a buscar la sala (`reconnect`) en sus tres códigos a la vez (`Net.roomCodes`: el suyo y dos de reserva que salen de él; `tryCodes`). Si quien la llevaba no aparece en `HOST_WAIT`, el primero la coge (`takeOver`): la abre con el mismo código o, si el servidor no lo ha soltado, con uno de reserva (o uno nuevo, que se dice); el segundo espera `HOST_WAIT_NEXT` más. La partida sigue desde la copia (`resumeMatch`: `Match` con `restore`, `migrated`, `inherit` y `restored` de cada juego), por quien se fue juega la máquina (`left`, con su `cid`) y a quien no vuelve en 20 segundos también. Los demás siguen en su misma mesa (`keepMatch`, con `migrated` en `start`). Quien llevaba la sala, si vuelve con el enlace, o si se queda solo y la encuentra en un código de reserva (`watchAlone`) o su código lo tiene otro (`onLost`), entra como invitado a su sitio (`displaced`). Al salir a propósito, quien la lleva elige «Salir y pasar la sala» (`leaveItems`, `passRoom` → `handOver`, mensaje `handover`: la coge al momento) o «Cerrar la sala para todos». Las reglas de la casa de la partida que sigue son las que tenía; las siguientes, las de quien lleva ahora la sala.
- **Si una jugada se pierde por el camino,** el invitado pide la mesa otra vez a los 8 segundos (`resync`). El anfitrión le contesta con la mesa y le dice si su jugada ya ha llegado (`pending`); si no, se le vuelve a preguntar.
- **Volver a entrar.** Cada aparato guarda un identificador (`localStorage['elpedro.id']`). Si se corta la conexión, el invitado vuelve a conectar solo; si recarga la página y entra con el enlace, el anfitrión lo reconoce y le devuelve su sitio (`seatBack`) con la mesa al día. También si se había ido con «salir» y su sitio sigue libre.
- **Mirar y el sitio de la máquina.** En la sala de espera, quien llega con la mesa llena se sienta en el sitio del último rival de la máquina (`seatWatchers`), sin cambiar el orden; si no hay ninguno, mira (`watch`). Quien llega con la partida empezada la mira: recibe `start` con `me: -1` y `watch`, y los paquetes con `eventFor(e, -1)` y `view(-1)`, sin cartas ocultas. Su mesa (`Match.watching`) no juega: dibuja abajo el sitio de `pov` (el del anfitrión) y solo atiende la I, Espacio, las flechas, la pausa y las teclas de `watchKeys`. El anfitrión, en la pausa, le puede dar el sitio de un rival de la máquina (`offerSeat` → `Online.giveSeat` → `seatTaken`, suceso de sala `seat`); sigue desde donde iba. Al empezar otra partida, quien miraba se sienta si hay sitio o un rival de la máquina. En El Impostor no (`lateJoin: false` en `GAMES`): quien llega espera en la sala.
- **Conexión.** Primero se prueba la conexión directa; si falla, el invitado vuelve a intentarlo solo por el servidor de rebote. **Probar la conexión** (`Net.diagnose`) dice si llega al servidor de PeerJS y si el de rebote responde.
- **Pantalla encendida.** Durante la partida y en la sala se pide al móvil que no apague la pantalla (Wake Lock), para que no se corte la sala.
- **Servidor de rebote (TURN):** para unir casas cuyas redes no se conectan directamente. Su usuario y contraseña van en `turn.json` (cuenta gratuita de Metered). Se lee sin caché, así que cambiarlo no obliga a subir la versión. Si está vacío, se usan solo los servidores públicos.
- **Para probar sin internet,** se puede usar un servidor de PeerJS local guardando esto en `localStorage['elpedro.peer']`: `{"host":"127.0.0.1","port":9000,"path":"/myapp","secure":false}`.

## Cómo probarlo

No abras `index.html` con doble clic. Desde la carpeta del proyecto:

```bash
npx http-server -c-1 .
```

En la consola del navegador, `Pedro.debug` da acceso a todo:

```js
const d = Pedro.debug;
d.settings            // ajustes
d.game                // partida actual (PedroGame)
d.match               // la mesa (Match)
d.setTimeScale(0.1)   // todo más rápido para probar
d.play()              // empezar partida de El Pedro con los ajustes actuales
d.brisca()            // empezar partida de Brisca
d.parchis()           // empezar partida de Parchís
d.trivial()           // empezar partida de Trivial
d.virus()             // empezar partida de Virus
d.impostor()          // empezar partida de El Impostor
d.practice('brisca')  // partida de práctica de un juego
d.online              // la sala (Online): code, table, role
```

**Comprobación mínima antes de subir un cambio:**
- `node tests/brisca.test.js`, `node tests/parchis.test.js`, `node tests/trivial.test.js`, `node tests/virus.test.js` y `node tests/impostor.test.js`.
- Juega una ronda de cada juego en cada modo: con voz (teclado), con lector de pantalla y sin voz (tocando).
- En El Pedro, usa una carta de poder, quema una carta y canta Pedro. En la Brisca, juega por parejas y prueba el cambio de muestra y los cantes. En el Parchís, juega por parejas y solo, come una ficha y mete otra en la meta. En el Trivial, juega por equipos, gana un quesito y llega a la final. En el Virus, juega un virus, una medicina y un tratamiento de cada clase, descarta y juega por parejas. En El Impostor, anda con auriculares sin mirar la pantalla, usa la guía y la F, y haz una tarea de cada clase; juega como tripulante (avisa de un cuerpo, pulsa el botón, arregla las luces y el reactor, arregla el oxígeno y las comunicaciones, mira las tres consolas, habla, di que quieres votar ya y vota) y como impostor (finge una tarea, mata, sabotea las luces, el reactor, el oxígeno, las comunicaciones y unas puertas, y ve por los conductos), y sigue la partida de fantasma. Prueba también cada papel especial (B), el escondite, las cámaras en directo y la práctica de impostor, y elige color y gorro en una sala.
- Prueba una sala con dos navegadores: cambia de juego en la sala y recarga la página de un invitado a mitad de partida. En El Impostor, anda con los dos a la vez, mata o haz una tarea desde el invitado y deja que se acabe el tiempo de una reunión.
- Prueba también en el móvil o con el modo móvil del navegador, y comprueba que la consola no muestra errores.

## Reglas importantes

1. **Versión.** Si cambias cualquier `.js` o `.css`, sube `GAME_VERSION.id` en `js/rules.js` (formato `AAAAMMDD` + letra) y pon **el mismo valor** en todos los `?v=` de `index.html`. Si no, los navegadores siguen usando la copia antigua.
2. **Accesibilidad en cada cambio.**
   - Todo lo que pasa en la mesa debe contarse por voz y verse, en `Match.present()`: voz, sonido, animación o bocadillo.
   - Sin voz (`settings.output === 'visual'`) no se muestran listas de lo que pasa: se ve en la mesa. Usa `Board.status()` para lo que tienes que hacer y `Board.bubble()` para lo que hace cada uno.
   - Las cartas se eligen con `Match.pick()`, sin menús. Tocar otra vez una carta elegida la deja libre.
   - Usa `UI.show`, `Dialog.open` y `UI.say`, que gestionan el foco y los anuncios.
   - Todo se maneja con teclado y con pantalla táctil; cada tecla tiene su botón.
   - Respeta los ajustes: modo lector de pantalla (`settings.output === 'sr'`), mono, anuncios breves y velocidad de la voz.
3. **Justo para todos.** El juego no recuerda tus cartas salvo con la «ayuda de memoria», que es opcional. Lo que ve en pantalla quien ve debe poder oírlo quien no ve, y al revés: una carta mirada se enseña unos segundos y también se dice, y se puede repetir con Espacio.
4. **Azar.** En la lógica de juego usa el `rng` con semilla de `rules.js` (`makeRng`). `Math.random` solo para efectos de sonido.
5. **No romper partidas guardadas.** Los ajustes nuevos van en `DEFAULT_SETTINGS` (`js/app.js`) y las reglas nuevas en `DEFAULT_RULES` (`js/rules.js`), `BRISCA_DEFAULT_RULES` (`js/brisca.js`), `PARCHIS_DEFAULT_RULES` (`js/parchis.js`) o `TRIVIAL_DEFAULT_RULES` (`js/trivial.js`), `VIRUS_DEFAULT_RULES` (`js/virus.js`) o `IMPOSTOR_DEFAULT_RULES` (`js/impostor.js`); `loadSaved()` rellena lo que falte.
6. **Textos en español**, tuteando al jugador y escritos para el oído: frases claras, sin símbolos ni abreviaturas.
7. **Novedades.** Todo cambio que note quien juega añade su entrada en `js/news.js`, arriba de la lista de su juego, con la fecha (`AAAA-MM-DD`) y una frase por cosa nueva, escrita para quien juega. Lo que cambia en todos los juegos va en `salon`. Si ya hay un bloque con esa fecha, la frase va en ese bloque. El menú del juego avisa de que hay cosas nuevas hasta que se abren.

## Cómo se añade un juego

1. Las reglas, en su archivo (como `brisca.js`): una clase con `act()`, `view(seat)`, sucesos y `secret` para las cartas ocultas, más su mesa de invitado y su `eventFor`. Pruébalas con Node.
2. Los rivales, en otro archivo (como `brisca-ai.js`), usando los personajes de `CHARACTERS`.
3. La mesa, una clase que extiende `Match` (como `brisca-match.js`): `buildCenter`, `render`, `present` para cada suceso, `humanStep`, `botStep`, `actionsDef` y las teclas.
4. Su primera novedad en `NEWS` (`news.js`). Su entrada en `GAMES` (`games.js`), con su dibujo para el salón (`fan`, unas cartas, o `art`, un SVG propio como el del Parchís), sus reglas en `DEFAULT_SETTINGS` y sus estadísticas, y los `<script>` en `index.html`, en su sitio del orden.

## Forma de trabajar con Git

- **Antes de empezar, actualiza** (`git pull`) y trabaja en una **rama propia**, nunca directamente en `main`.
- Sube la rama y abre un *pull request* hacia `main`; al fusionarlo, GitHub Pages publica el juego en unos minutos.
