/* =============================================
   EL PEDRO — texts.js
   Cómo se dicen las cartas, los jugadores y los
   sitios. Todo pensado para el oído.
   ============================================= */
'use strict';

const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const FEMININE_RANK = { 10: true };   // «la sota»

const Txt = {
    settings: null,

    /** «el siete de bastos», «la sota de oros, que vale 10». */
    card(c, { value = null } = {}) {
        if (!c) return 'ninguna carta';
        const art = FEMININE_RANK[c.rank] ? 'la' : 'el';
        let s = `${art} ${RANK_NAME[c.rank]} de ${c.suit}`;
        const say = value ?? this.settings?.figureValues ?? true;
        if (say && c.rank >= 10) s += `, que vale ${c.rank}`;
        else if (say && c.rank === 7 && this.pedroRules?.sevenMinus) s += ', que vale menos 1';
        return s;
    },

    /** El palo con su artículo: «los oros», «las copas». */
    suitArt(suit) { return (suit === 'oros' || suit === 'bastos' ? 'los ' : 'las ') + suit; },

    /** En la Brisca: «el as de oros», y «, triunfo» si es del palo que triunfa. */
    bcard(c, trump = null) {
        if (!c) return 'ninguna carta';
        return this.card(c, { value: false }) + (trump && c.suit === trump ? ', triunfo' : '');
    },

    /** «siete de bastos», sin artículo. */
    cardShort(c) { return c ? `${RANK_NAME[c.rank]} de ${c.suit}` : 'nada'; },

    rankWord(r) { return (FEMININE_RANK[r] ? 'una ' : 'un ') + RANK_NAME[r]; },

    list(items) {
        if (items.length <= 1) return items.join('');
        return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
    },

    number(n) { return String(n).replace('.', ','); },

    points(n) { return n < 0 ? `menos ${this.points(-n)}` : n === 1 ? '1 punto' : `${n} puntos`; },

    /** Las reglas de una mesa de Parchís, en pocas frases. */
    parchisRules(r) {
        return [
            `${r.pieces} fichas cada uno.${r.pairs ? ' Con 4 jugadores, por parejas.' : ''}`,
            r.eatCount ? `Al comer cuentas ${r.eatCount}.` : 'Al comer no se cuenta nada.',
            r.metaCount ? `Al llegar a la meta cuentas ${r.metaCount}.` : 'Al llegar a la meta no se cuenta nada.',
            r.twoDice ? 'Con dos dados: se sale con un 5 o si suman 5, y los dobles repiten.' : '',
            r.sixSeven && !r.twoDice ? 'Sin fichas en casa, el 6 cuenta 7.' : '',
            r.threeSixes ? `Al tercer ${r.twoDice ? 'doble' : '6'} seguido, la última ficha movida vuelve a casa.` : '',
            r.openBarrier ? `Con ${r.twoDice ? 'dobles' : 'un 6'} hay que abrir tu barrera.` : '',
            r.exact ? 'A la meta se entra con la cuenta justa.' : 'Si te pasas de la meta, rebotas.',
        ].filter(Boolean).join(' ');
    },

    /** Las reglas de una mesa de Trivial, en pocas frases. */
    trivialRules(r) {
        return [
            `Hay que conseguir ${r.wedges} quesitos${r.hubFinal ? ' y acertar la pregunta final en el centro' : ''}.`,
            r.teams ? 'Con 4 o 6 jugadores, por equipos.' : '',
            r.hubFinal ? `La categoría de la final la elige${({ rivales: 'n los rivales', azar: ' el azar', tu: 's tú' })[r.finalPick]}.` : '',
            !r.rollAgain ? 'Aciertes o no, pasa el turno.' : r.streak ? `Si aciertas, vuelves a tirar, hasta ${r.streak} aciertos seguidos.` : 'Si aciertas, vuelves a tirar.',
            ({ todas: 'Preguntas de todas las dificultades.', faciles: 'Preguntas fáciles.', medias: 'Preguntas medias.', dificiles: 'Preguntas difíciles.' })[r.level] || '',
            r.answerTime ? `${r.answerTime} segundos para contestar.` : 'Sin límite de tiempo para contestar.',
            r.wildDie ? 'El dado va del 1 al 7, y el 7 es un quesito.' : '',
            r.rebound ? 'Si alguien falla una pregunta de quesito, rebota al siguiente.' : '',
        ].filter(Boolean).join(' ');
    },

    /** Las reglas de una mesa de Virus, en pocas frases. */
    virusRules(r) {
        return [
            'Gana quien complete antes un cuerpo con cuatro órganos sanos.',
            r.pairs ? 'Con 4 o 6 jugadores, por parejas.' : '',
            r.winsToWin ? `Gana la partida quien gane ${r.winsToWin === 1 ? 'una ronda' : r.winsToWin + ' rondas'}.` : 'Se juega sin límite de rondas.',
        ].filter(Boolean).join(' ');
    },

    /** Las reglas de una mesa, en pocas frases. */
    rules(r) {
        const yes = v => v ? 'sí' : 'no';
        return [
            `Baraja de ${r.deck} cartas. ${r.handSize} cartas para cada uno; al empezar miras ${r.peekStart}.`,
            `Poderes de las figuras: ${yes(r.powers)}.`,
            r.burn ? `Quemar: sí${r.burnOthers ? ', también las cartas de los demás' : ', solo las tuyas'}${r.burnOthers && r.burnGive ? ', y al quemar la de otro le das una tuya' : ''}. Si fallas, ${r.penaltyCards === 1 ? 'una carta' : r.penaltyCards + ' cartas'} de castigo.` : 'Quemar: no.',
            `Coger la carta de la mesa: ${yes(r.takeFromTable)}.`,
            r.sevenMinus ? 'El siete vale menos 1 punto.' : '',
            r.allEqualOne ? 'Si todas tus cartas son del mismo número, valen 1 punto.' : '',
            `Si se acaba el mazo, ${r.deckOut === 'end' ? 'se descubren las cartas' : 'se barajan las de la mesa'}.`,
            r.winsToWin ? `Gana la partida quien gane ${r.winsToWin === 1 ? 'una ronda' : r.winsToWin + ' rondas'}.` : 'Se juega sin límite de rondas.',
        ].filter(Boolean).join(' ');
    },

    /** Las reglas de una mesa de Brisca, en pocas frases. */
    briscaRules(r) {
        return [
            `Baraja de ${r.deck} cartas, 3 cartas para cada uno.`,
            r.pairs ? 'Con 4 o 6 jugadores, por parejas.' : 'Cada uno por su cuenta.',
            r.swapTrump === 'no' ? 'La muestra no se cambia.' : `La muestra se cambia con ${r.swapTrump === 'siete' ? 'el siete' : 'el siete o el dos'} de triunfo, ${r.swapWhen === 'salir' ? 'solo al salir' : 'en tu turno'}.`,
            r.cantes ? 'Se cantan las 20 y las 40.' : '',
            r.arrastre ? 'Con arrastre: al acabarse el mazo, hay que asistir y montar.' : '',
            r.lastTen ? 'Diez de últimas.' : '',
            r.showPoints ? '' : 'Los puntos se cuentan al final.',
            r.winsToWin ? `Gana la partida quien gane ${r.winsToWin === 1 ? 'una mano' : r.winsToWin + ' manos'}.` : 'Se juega sin límite de manos.',
        ].filter(Boolean).join(' ');
    },
};

/**
 * Nombres y sitios vistos desde el jugador humano (me).
 * names[p] es el nombre de cada jugador; el humano es «tú».
 */
class Voice {
    constructor(names, me = 0) { this.names = names; this.me = me; }

    name(p) { return p === this.me ? 'tú' : this.names[p]; }
    Name(p) { return cap(this.name(p)); }

    /** Una carta de alguien, dicha por el narrador cuando actúa `actor`. */
    slot(p, s, actor = null) {
        const n = s + 1;
        if (p === this.me) return `tu carta ${n}`;
        if (actor !== null && p === actor) return `su carta ${n}`;
        return `la carta ${n} de ${this.names[p]}`;
    }

    /** «a Lucía», «a ti». */
    to(p) { return p === this.me ? 'a ti' : `a ${this.names[p]}`; }
}
