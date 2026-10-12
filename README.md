# El Pedro · Salón de cartas

Juegos de cartas con baraja española, pensados para personas ciegas y jugables por cualquiera. Lo que ve en pantalla quien ve, lo oye quien no ve, y al revés.

**Jugar:** <https://zeterpe.github.io/El-Pedro/>

En el salón eliges a qué jugar:

- **El Pedro:** juego de memoria. Las cartas están boca abajo para todos y gana la memoria.
- **La Brisca:** el clásico de bazas, con triunfo y muestra, de 2 a 6 jugadores y también por parejas.

## El Pedro

- **El reparto.** Cada jugador recibe 4 cartas boca abajo y al empezar mira solo 2. Las cartas no se cambian de sitio.
- **Tu turno.** Robas una carta del mazo. Puedes cambiarla por una de las tuyas, que va a la mesa, o tirarla a la mesa.
- **Los poderes.** Si robas una figura del mazo y la tiras a la mesa, puedes usar su poder:
  - **la sota:** cambias dos cartas de sitio sin mirarlas, tuyas o de los demás;
  - **el caballo:** miras una carta;
  - **el rey:** miras una carta y después puedes cambiar dos.
- **Quemar.** Cuando cae una carta en la mesa, quien tenga una igual puede soltarla. Vale con tus cartas y con las de los demás.
  - Si quemas la carta de otro, le das una tuya a cambio.
  - Si fallas, te llevas una carta de castigo.
- **Cantar «¡Pedro!»** Se canta al empezar tu turno, antes de robar, y después juegas ese turno. Los demás juegan una vez más y, cuando vuelve a ti, se descubren las cartas.
- **Los puntos.** Gana la suma más baja. Si todas tus cartas son del mismo número, valen 1 punto.

## La Brisca

- **El reparto.** Tres cartas para cada uno. La siguiente se pone boca arriba bajo el mazo: es la **muestra**, y su palo es el **triunfo**.
- **Las bazas.** Cada uno juega una carta. Gana el triunfo más alto; si no hay triunfo, la carta más alta del palo que ha salido. Después todos roban, empezando por quien se ha llevado la baza, y la muestra es la última carta del mazo.
- **Los puntos.** El as vale 11, el tres 10, el rey 4, el caballo 3 y la sota 2. Hay 120 puntos y gana quien pase de 60.
- **Por parejas.** Con 4 o 6 jugadores, cada uno va con quien tiene enfrente.

En **Reglas de la casa** se ajusta cada juego. En la Brisca: baraja de 40 o 48 cartas, jugar por parejas o no, cambiar la muestra con el siete o con el dos (en cualquier turno tuyo o solo al salir), cantar las 20 y las 40, el arrastre, los diez de últimas, contar los puntos durante la mano y cuántas manos hacen falta para ganar.

## Contra la máquina o con amigos

- **Contra la máquina:** de 1 a 5 rivales con carácter propio. Por ejemplo, Paco el despistado, la abuela Carmen, que no olvida nada, o Toni, que canta Pedro de farol.
- **Con amigos:** quien crea la sala recibe un código de 5 cifras. Los demás se unen con ese código o con el enlace, desde cualquier casa.
  - En la sala se elige a qué jugar. Al acabar una partida volvéis a la sala y podéis cambiar de juego sin crear otra.
  - Caben hasta 6 jugadores, y se pueden completar con rivales de la máquina.
  - Si alguien pierde la conexión o recarga la página, vuelve a su sitio. Mientras no está, juega la máquina por esa persona.
  - **Probar la conexión** dice si tu red deja jugar con otras casas.
  - No hacen falta cuentas: los navegadores se conectan entre sí.

## Cómo se juega sin ver, o mirando

Al empezar eliges cómo quieres jugar, y cada jugador de una sala puede elegir algo distinto en su aparato:

- **Con la voz del juego.** Para quien no ve la pantalla y no usa lector de pantalla. Lo cuenta todo, y se juega con el teclado. En El Pedro: R roba, P canta Pedro, del 1 al 6 eliges tus cartas y las flechas recorren las de los demás. En la Brisca: del 1 al 3 juegas tus cartas, M cuenta la mesa, T el triunfo y U la última baza.
- **Con tu lector de pantalla:** NVDA, JAWS, VoiceOver o TalkBack. Cada carta de la mesa es un botón que tu lector lee.
- **Sin voz, solo con la vista.** La mesa limpia, sin listas de texto: las cartas se dan la vuelta y vuelan de un sitio a otro, y cada jugador tiene un bocadillo con lo que acaba de hacer.

En todos los modos se elige tocando las cartas, sin menús. En la Brisca, el primer toque te dice la carta y la levanta, y el segundo la juega (se puede quitar en Opciones).

Además:
- **Cartas grandes y alto contraste**, en Opciones: el número de cada carta se ve en grande.
- **Sonido por palo.** Cada palo suena distinto: los oros a monedas, las copas a cristal, las espadas a metal y los bastos a madera. Cuanto más alta es la carta, más agudo suena.
- **Sonido por sitio.** Con auriculares, cada jugador suena desde su sitio en la mesa. También hay modo mono.

## Para desarrollar

HTML, CSS y JavaScript, sin compilación. Para probarlo:

```bash
npx http-server -c-1 .
```

Después abre la dirección que indique. Las reglas de la Brisca se prueban sin navegador con `node tests/brisca.test.js`. La guía técnica está en [`CLAUDE.md`](CLAUDE.md).

La conexión entre jugadores usa [PeerJS](https://peerjs.com/), con licencia MIT; la copia está en `js/vendor/`.
