# El Pedro

Juego de cartas **de memoria** con baraja española, pensado para personas ciegas y jugable por cualquiera. Todo se oye y todo se ve. Aquí ver no da ventaja: las cartas están boca abajo para todos y gana la memoria.

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
- **Cantar «¡Pedro!»** Se canta al empezar tu turno, antes de robar. Los demás juegan una vez más y se descubren las cartas.
- **Los puntos.** Gana la suma más baja. Si todas tus cartas son del mismo número, valen 1 punto.

Cada grupo juega un poco distinto: en **Jugar → Reglas de la casa** se puede cambiar casi todo.

## Accesibilidad

- **Voz.** El juego habla con su propia voz o a través de tu lector de pantalla: NVDA, JAWS, VoiceOver o TalkBack.
- **Sonido por palo.** Cada palo suena distinto: los oros a monedas, las copas a cristal, las espadas a metal y los bastos a madera. Cuanto más alta es la carta, más agudo suena.
- **Sonido por sitio.** Con auriculares, cada rival suena desde su sitio en la mesa. Si solo usas un auricular, hay modo mono.
- **Teclado y pantalla táctil.** Con el teclado, R roba, P canta Pedro, del 1 al 4 eliges tus cartas, T tira, Q quema, I dice cómo va la partida y Escape pausa. En el móvil, todo tiene su botón.
- **Ayuda de memoria.** Es opcional y sirve para aprender: el juego te recuerda las cartas que has visto. También hay una partida de práctica.

## Para desarrollar

HTML, CSS y JavaScript, sin compilación ni dependencias. Para probarlo:

```bash
npx http-server -c-1 .
```

Después abre la dirección que indique. La guía técnica está en [`CLAUDE.md`](CLAUDE.md).
