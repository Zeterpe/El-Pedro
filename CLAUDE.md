# El Pedro — guía para trabajar en el proyecto

Juego de cartas de memoria con baraja española, **en español**, pensado para personas ciegas y jugable por cualquiera. Se publica con GitHub Pages desde `main`: <https://zeterpe.github.io/El-Pedro/>.

Es el primero de una serie de juegos de cartas y de mesa que más adelante se unirán en un salón. Por eso la baraja, los sonidos, la voz y los rivales están separados de las reglas de este juego.

**Prioridades, por este orden:** que se pueda jugar sin ver la pantalla, que sea divertido, y lo demás.

## Tecnología

- HTML + CSS + JavaScript **sin compilación ni dependencias**.
- Los archivos de `js/` son *scripts clásicos* que comparten el ámbito global, así que **el orden de los `<script>` en `index.html` importa**: rules → ai → speech → audio → texts → ui → vendor/peerjs → net → mirror → cards → board → match → online → app.
- Única dependencia: PeerJS (MIT), copiada en `js/vendor/peerjs.min.js`. No se carga de ningún CDN.
- `rules.js` y `ai.js` no tocan la pantalla y también se cargan con Node (`require`), para probarlos sin navegador.
- Sonido: todo se sintetiza con Web Audio en `js/audio.js`. No hay archivos de audio.
- Voz: `speechSynthesis` o el lector de pantalla (regiones `aria-live`), en `js/speech.js`.

| Archivo | Qué contiene |
| --- | --- |
| `js/rules.js` | Reglas: baraja, reparto, turnos, poderes, quemar, cantar Pedro, puntos. `DEFAULT_RULES`, `GAME_VERSION`, azar con semilla |
| `js/ai.js` | Memoria de cada jugador (`Memory`), rivales de la máquina (`Bot`) y sus personajes (`CHARACTERS`) |
| `js/audio.js` | Sonidos: palo de cada carta, sitios de la mesa, momentos del juego |
| `js/speech.js` | Voz del juego o lector de pantalla |
| `js/texts.js` | Cómo se dicen las cartas y los sitios («la sota de oros», «tu carta 2») |
| `js/ui.js` | Pantallas, foco, `Dialog` (preguntas con opciones) y `OptionList` (opciones) |
| `js/cards.js` | Dibujo SVG propio de las cartas españolas (`CardArt.face`, `CardArt.back`) |
| `js/board.js` | La mesa que se ve: cada carta es un botón, animaciones (darse la vuelta, volar), bocadillos, cursor de teclado |
| `js/match.js` | Una partida: turnos, rivales, elegir cartas tocándolas (`pick`), ventana para quemar, lo que se cuenta. Modos `local`, `host` y `client` |
| `js/net.js` | Conexión con PeerJS: `HostNet` (abre la sala `elpedro-NNNNN`) y `ClientNet` |
| `js/mirror.js` | `MirrorGame`: la mesa tal como la ve un invitado, sin cartas ocultas. `eventFor()` quita a cada jugador las cartas que no puede ver |
| `js/online.js` | Salas: crear, unirse con código o enlace (`?sala=`), sala de espera, reglas de la mesa y reparto de mensajes |
| `js/app.js` | Portada (cómo jugar), nombre, menús, ajustes guardados (`DEFAULT_SETTINGS`), reglas de la casa, estadísticas y teclado |

### Cómo funcionan las reglas

`PedroGame` es una máquina de estados con estas fases: `peek` → `turn` → `drawn` → `power` → `burn` → … → `roundOver` → `gameOver`.

- Cada `act({ type, p, … })` devuelve los **sucesos** que ha provocado (`draw`, `swap`, `burn`, `reveal`…).
- Un suceso con `secret: true` lleva una carta que solo debe conocer quien la ve. Esto importa para el modo online.
- Los rivales y la ayuda de memoria solo aprenden de esos sucesos, como en una mesa de verdad.
- El tiempo para quemar (`rules.burnTime`) no lo cuenta `rules.js`: lo controla `Match.burnWindow()`, que cierra la ventana con `endBurn`.
- Quien canta Pedro juega su turno; después nadie toca sus cartas (`isProtected`) y esa persona ya no quema (`isFrozen`).

### Cómo funcionan las salas

- **Quien crea la sala** tiene la baraja (`PedroGame`) y decide todo. Después de cada acción manda a cada jugador un paquete `batch`, con los sucesos filtrados por `eventFor()` y la mesa (`view()`).
- **Cada invitado** guarda esa mesa en un `MirrorGame` y cuenta los sucesos a su manera, con voz o sin ella. Cuando le toca, manda su jugada (`act`) y el anfitrión la comprueba.
- **Antes de abrir cada ventana para quemar,** el anfitrión espera a que todos hayan oído la carta (`ack`). Así nadie se queda atrás porque su voz vaya más lenta.
- **Si alguien se va,** juega la máquina por esa persona (`seatLeft`).
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
d.play()              // empezar partida con los ajustes actuales
d.practice()          // partida de práctica
d.online              // la sala (Online): code, table, role
```

**Comprobación mínima antes de subir un cambio:**
- Juega una ronda en cada modo: con voz (teclado), con lector de pantalla y sin voz (tocando).
- Usa una carta de poder, quema una carta y canta Pedro.
- Prueba una sala con dos navegadores.
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
5. **No romper partidas guardadas.** Los ajustes nuevos van en `DEFAULT_SETTINGS` (`js/app.js`) y las reglas nuevas en `DEFAULT_RULES` (`js/rules.js`); `loadSaved()` rellena lo que falte.
6. **Textos en español**, tuteando al jugador y escritos para el oído: frases claras, sin símbolos ni abreviaturas.

## Forma de trabajar con Git

- **Antes de empezar, actualiza** (`git pull`) y trabaja en una **rama propia**, nunca directamente en `main`.
- Sube la rama y abre un *pull request* hacia `main`; al fusionarlo, GitHub Pages publica el juego en unos minutos.
