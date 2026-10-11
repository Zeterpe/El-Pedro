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
        return s;
    },

    /** «siete de bastos», sin artículo. */
    cardShort(c) { return c ? `${RANK_NAME[c.rank]} de ${c.suit}` : 'nada'; },

    rankWord(r) { return (FEMININE_RANK[r] ? 'una ' : 'un ') + RANK_NAME[r]; },

    list(items) {
        if (items.length <= 1) return items.join('');
        return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
    },

    number(n) { return String(n).replace('.', ','); },

    points(n) { return n === 1 ? '1 punto' : `${n} puntos`; },

    /** Las reglas de una mesa, en pocas frases. */
    rules(r) {
        const yes = v => v ? 'sí' : 'no';
        return [
            `Baraja de ${r.deck} cartas. ${r.handSize} cartas para cada uno; al empezar miras ${r.peekStart}.`,
            `Poderes de las figuras: ${yes(r.powers)}.`,
            r.burn ? `Quemar: sí${r.burnOthers ? ', también las cartas de los demás' : ', solo las tuyas'}${r.burnOthers && r.burnGive ? ', y al quemar la de otro le das una tuya' : ''}. Si fallas, ${r.penaltyCards === 1 ? 'una carta' : r.penaltyCards + ' cartas'} de castigo.` : 'Quemar: no.',
            `Tiempo para quemar: ${r.burnTime ? r.burnTime + ' segundos' : 'sin límite'}.`,
            `Coger la carta de la mesa: ${yes(r.takeFromTable)}.`,
            r.allEqualOne ? 'Si todas tus cartas son del mismo número, valen 1 punto.' : '',
            `Si se acaba el mazo, ${r.deckOut === 'end' ? 'se descubren las cartas' : 'se barajan las de la mesa'}.`,
            r.winsToWin ? `Gana la partida quien gane ${r.winsToWin === 1 ? 'una ronda' : r.winsToWin + ' rondas'}.` : 'Se juega sin límite de rondas.',
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
