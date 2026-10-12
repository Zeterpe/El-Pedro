# El Pedro — guía para trabajar en el proyecto

Salón de juegos de cartas con baraja española, **en español**, pensado para personas ciegas y jugable por cualquiera. Se publica con GitHub Pages desde `main`: <https://zeterpe.github.io/El-Pedro/>.

Hay tres juegos: **El Pedro** (memoria), **la Brisca** (bazas) y **el Parchís** (dado y fichas). Los sonidos, la voz, la mesa y las salas son comunes; cada juego pone sus reglas, sus rivales y cómo se cuenta lo que pasa. Para añadir otro juego, mira «Cómo se añade un juego».

**Prioridades, por este orden:** que se pueda jugar sin ver la pantalla, que sea divertido, y lo demás.

## Tecnología

- HTML + CSS + JavaScript **sin compilación ni dependencias**.
- Los archivos de `js/` son *scripts clásicos* que comparten el ámbito global, así que **el orden de los `<script>` en `index.html` importa**: rules → brisca → ai → brisca-ai → parchis → parchis-ai → speech → audio → texts → ui → vendor/peerjs → net → mirror → cards → board → match → pedro → brisca-match → parchis-match → games → online → app.
- Única dependencia: PeerJS (MIT), copiada en `js/vendor/peerjs.min.js`. No se carga de ningún CDN.
- `rules.js`, `ai.js`, `brisca.js`, `brisca-ai.js`, `parchis.js` y `parchis-ai.js` no tocan la pantalla y también se cargan con Node (`require`), para probarlos sin navegador. `node tests/brisca.test.js` juega cientos de partidas de Brisca y comprueba puntos, bazas y lo que ve cada jugador; `node tests/parchis.test.js` prueba cada regla del Parchís con tableros preparados y juega más de cien partidas.
- Sonido: todo se sintetiza con Web Audio en `js/audio.js`. No hay archivos de audio.
- Voz: `speechSynthesis` o el lector de pantalla (regiones `aria-live`), en `js/speech.js`.

| Archivo | Qué contiene |
| --- | --- |
| `js/rules.js` | Reglas de El Pedro: baraja, reparto, turnos, poderes, quemar, cantar Pedro, puntos. `DEFAULT_RULES`, `GAME_VERSION`, azar con semilla (`makeRng`), `makeDeck`, `SUITS` |
| `js/brisca.js` | Reglas de la Brisca (`BriscaGame`, `BRISCA_DEFAULT_RULES`), lo que ve cada uno (`briscaEventFor`) y la mesa del invitado (`BriscaMirror`) |
| `js/ai.js` | Memoria de cada jugador (`Memory`), rivales de El Pedro (`Bot`) y los personajes (`CHARACTERS`), que son los mismos en todos los juegos |
| `js/brisca-ai.js` | Rivales de la Brisca (`BriscaBot`): cuentan cartas, cargan puntos y guardan triunfos según la dificultad |
| `js/parchis.js` | Reglas del Parchís (`ParchisGame`, `PARCHIS_DEFAULT_RULES`): tablero, salidas, seguros, barreras, comer y contar, meta, parejas. También la mesa del invitado (`ParchisMirror`); en el Parchís no hay nada oculto |
| `js/parchis-ai.js` | Rivales del Parchís (`ParchisBot`): puntúan cada jugada (comer, meta, salir, peligro) según la dificultad |
| `js/audio.js` | Sonidos: palo de cada carta, sitios de la mesa, momentos del juego |
| `js/speech.js` | Voz del juego o lector de pantalla |
| `js/texts.js` | Cómo se dicen las cartas y los sitios («la sota de oros», «tu carta 2») |
| `js/ui.js` | Pantallas, foco, `Dialog` (preguntas con opciones) y `OptionList` (opciones) |
| `js/cards.js` | Dibujo SVG propio de las cartas españolas (`CardArt.face`, `CardArt.back`) |
| `js/board.js` | La mesa común: sitios, botones de acción (`actionsDef` de cada juego), animaciones (volar, destello, cartel, confeti), bocadillos, cursor de teclado |
| `js/match.js` | `Match`: lo común a una partida de cualquier juego. Bucle de turnos, voz y pausas, fin de ronda y de partida, teclado, salas (`local`, `host`, `client`) y quien se va o vuelve |
| `js/pedro.js` | `PedroMatch`: la mesa de El Pedro. Elegir cartas tocándolas (`pick`), quemar en cualquier momento, poderes y lo que se cuenta |
| `js/brisca-match.js` | `BriscaMatch`: la mesa de la Brisca. Mazo con la muestra, baza en el centro, tocar dos veces para jugar, consejos en la práctica |
| `js/parchis-match.js` | `ParchisMatch` y `ParchisArt`: el tablero en SVG (girado para que tu casa quede abajo a la derecha), fichas que andan casilla a casilla, dado, peligros y consejos |
| `js/games.js` | `GAMES`: cada juego con su nombre, reglas de la casa, opciones de la partida y el texto de «Cómo se juega» |
| `js/net.js` | Conexión con PeerJS: `HostNet` (abre la sala `elpedro-NNNNN`) y `ClientNet` |
| `js/mirror.js` | `MirrorGame`: la mesa tal como la ve un invitado, sin cartas ocultas. `eventFor()` quita a cada jugador las cartas que no puede ver |
| `js/online.js` | Salas: crear, unirse con código o enlace (`?sala=`), elegir juego, sala de espera, reglas de la mesa, reparto de mensajes, volver a entrar |
| `js/app.js` | Portada (cómo jugar), nombre, salón, menú de cada juego, ajustes guardados (`DEFAULT_SETTINGS`), estadísticas por juego y teclado |
| `tests/brisca.test.js` | Pruebas de la Brisca con Node |
| `tests/parchis.test.js` | Pruebas del Parchís con Node |

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

### Cómo funcionan las salas

- **En la sala se elige el juego** (`Online.game`). Al acabar una partida, quien la ha creado puede volver a la sala (`backToLobby`) y elegir otro, sin crear una sala nueva.
- **Quien crea la sala** tiene la partida (`PedroGame`, `BriscaGame` o `ParchisGame`) y decide todo. Después de cada acción manda a cada jugador un paquete `batch`, con los sucesos filtrados por `eventFor()` y la mesa (`view()`).
- **Cada invitado** guarda esa mesa en un `MirrorGame` (o `BriscaMirror`, `ParchisMirror`) y cuenta los sucesos a su manera, con voz o sin ella. Cuando le toca, manda su jugada (`act`) y el anfitrión la comprueba.
- **Quemar llega en cualquier momento:** el invitado manda `act` con `type: 'burn'` y el anfitrión lo pone en la cola. Si falla, le contesta con `burnError`.
- **Antes de que los rivales de la máquina intenten quemar,** el anfitrión espera a que todos hayan oído la carta (`ack`). Así nadie se queda atrás porque su voz vaya más lenta.
- **Si alguien se va,** juega la máquina por esa persona (`seatLeft`).
- **Si una jugada se pierde por el camino,** el invitado pide la mesa otra vez a los 8 segundos (`resync`). El anfitrión le contesta con la mesa y le dice si su jugada ya ha llegado (`pending`); si no, se le vuelve a preguntar.
- **Volver a entrar.** Cada aparato guarda un identificador (`localStorage['elpedro.id']`). Si se corta la conexión, el invitado vuelve a conectar solo; si recarga la página y entra con el enlace, el anfitrión lo reconoce y le devuelve su sitio (`seatBack`) con la mesa al día. Quien llega con la partida empezada juega en la siguiente.
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
d.practice('brisca')  // partida de práctica de un juego
d.online              // la sala (Online): code, table, role
```

**Comprobación mínima antes de subir un cambio:**
- `node tests/brisca.test.js` y `node tests/parchis.test.js`.
- Juega una ronda de cada juego en cada modo: con voz (teclado), con lector de pantalla y sin voz (tocando).
- En El Pedro, usa una carta de poder, quema una carta y canta Pedro. En la Brisca, juega por parejas y prueba el cambio de muestra y los cantes. En el Parchís, juega por parejas y solo, come una ficha y mete otra en la meta.
- Prueba una sala con dos navegadores: cambia de juego en la sala y recarga la página de un invitado a mitad de partida.
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
5. **No romper partidas guardadas.** Los ajustes nuevos van en `DEFAULT_SETTINGS` (`js/app.js`) y las reglas nuevas en `DEFAULT_RULES` (`js/rules.js`), `BRISCA_DEFAULT_RULES` (`js/brisca.js`) o `PARCHIS_DEFAULT_RULES` (`js/parchis.js`); `loadSaved()` rellena lo que falte.
6. **Textos en español**, tuteando al jugador y escritos para el oído: frases claras, sin símbolos ni abreviaturas.

## Cómo se añade un juego

1. Las reglas, en su archivo (como `brisca.js`): una clase con `act()`, `view(seat)`, sucesos y `secret` para las cartas ocultas, más su mesa de invitado y su `eventFor`. Pruébalas con Node.
2. Los rivales, en otro archivo (como `brisca-ai.js`), usando los personajes de `CHARACTERS`.
3. La mesa, una clase que extiende `Match` (como `brisca-match.js`): `buildCenter`, `render`, `present` para cada suceso, `humanStep`, `botStep`, `actionsDef` y las teclas.
4. Su entrada en `GAMES` (`games.js`), con su dibujo para el salón (`fan`, unas cartas, o `art`, un SVG propio como el del Parchís), sus reglas en `DEFAULT_SETTINGS` y sus estadísticas, y los `<script>` en `index.html`, en su sitio del orden.

## Forma de trabajar con Git

- **Antes de empezar, actualiza** (`git pull`) y trabaja en una **rama propia**, nunca directamente en `main`.
- Sube la rama y abre un *pull request* hacia `main`; al fusionarlo, GitHub Pages publica el juego en unos minutos.
