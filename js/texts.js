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
