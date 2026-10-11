# El Pedro

Juego de cartas **de memoria** con baraja española, pensado para personas ciegas y jugable por cualquiera. Aquí ver no da ventaja: las cartas están boca abajo para todos y gana la memoria.

**Jugar:** <https://zeterpe.github.io/El-Pedro/>

## Cómo se juega

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

Cada grupo juega un poco distinto: en **Reglas de la casa** se puede cambiar casi todo, también qué pasa si se acaba el mazo y cuánto tiempo hay para quemar.

## Contra la máquina o con amigos

- **Contra la máquina:** de 1 a 5 rivales con carácter propio. Por ejemplo, Paco el despistado, la abuela Carmen, que no olvida nada, o Toni, que canta Pedro de farol.
- **Con amigos:** quien crea la sala recibe un código de 5 cifras. Los demás se unen con ese código o con el enlace.
  - Caben hasta 6 jugadores, y se pueden completar con rivales de la máquina.
  - Quien crea la sala elige las reglas de la mesa.
  - No hacen falta cuentas: los navegadores se conectan entre sí.

## Cómo se juega sin ver, o mirando

Al empezar eliges cómo quieres jugar, y cada jugador de una sala puede elegir algo distinto en su aparato:

- **Con la voz del juego.** Para quien no ve la pantalla y no usa lector de pantalla. Lo cuenta todo, y se juega con el teclado: R roba, P canta Pedro, del 1 al 6 eliges tus cartas y las flechas recorren las de los demás.
- **Con tu lector de pantalla:** NVDA, JAWS, VoiceOver o TalkBack. Cada carta de la mesa es un botón que tu lector lee.
- **Sin voz, solo con la vista.** La mesa limpia, sin listas de texto: las cartas se dan la vuelta y vuelan de un sitio a otro, y cada jugador tiene un bocadillo con lo que acaba de hacer.

En todos los modos se elige tocando las cartas, sin menús:
- **Mirar una carta:** la tocas, se da la vuelta y a los 5 segundos se vuelve a tapar.
- **Cambiar dos cartas:** tocas la tuya y luego la del otro jugador. Si te equivocas, vuelves a tocar la primera.
- **Quemar una carta:** la tocas en cuanto cae una igual en la mesa.

Además:
- **Sonido por palo.** Cada palo suena distinto: los oros a monedas, las copas a cristal, las espadas a metal y los bastos a madera. Cuanto más alta es la carta, más agudo suena.
- **Sonido por sitio.** Con auriculares, cada jugador suena desde su sitio en la mesa. También hay modo mono.

## Para desarrollar

HTML, CSS y JavaScript, sin compilación. Para probarlo:

```bash
npx http-server -c-1 .
```

Después abre la dirección que indique. La guía técnica está en [`CLAUDE.md`](CLAUDE.md).

La conexión entre jugadores usa [PeerJS](https://peerjs.com/), con licencia MIT; la copia está en `js/vendor/`.
