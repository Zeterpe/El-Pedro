/* =============================================
   EL PEDRO — ai.js
   La memoria de cada jugador (lo que sabe de cada
   carta de la mesa) y los rivales de la máquina.
   Los rivales solo saben lo que verían en una mesa
   de verdad: lo que han mirado, lo que se tira a la
   mesa y por dónde se mueven las cartas. Según su
   dificultad, se les olvidan cosas o se confunden.
   ============================================= */
'use strict';

/**
 * Lo que un jugador sabe de cada carta. Sigue las cartas cuando se cambian
 * de sitio, aunque no sepa cuáles son (sabe que «su 3 ahora está en la mano de Paco»).
 */
class Memory {
    constructor(me, { forget = 0, mistake = 0, rng = null } = {}) {
        this.me = me;
        this.forget = forget;
        this.mistake = mistake;
        this.rng = rng || makeRng(Date.now() + me * 7919);
        this.known = new Map();   // 'p:s' → { rank, suit }
        this.drawn = null;        // carta que tengo robada ahora mismo
    }

    static key(p, s) { return p + ':' + s; }
    get(p, s) { return this.known.get(Memory.key(p, s)) || null; }
    rank(p, s) { return this.get(p, s)?.rank ?? null; }
    set(p, s, card) {
        let c = { rank: card.rank, suit: card.suit };
        if (this.mistake && this.rng.chance(this.mistake)) {
            // Se confunde de número (y no se da cuenta).
            const d = this.rng.chance(0.5) ? 1 : -1;
            c = { rank: Math.min(12, Math.max(1, c.rank + d)), suit: c.suit, wrong: true };
        }
        this.known.set(Memory.key(p, s), c);
    }
    del(p, s) { this.known.delete(Memory.key(p, s)); }
    swap(a, b) {
        const ka = Memory.key(a.p, a.s), kb = Memory.key(b.p, b.s);
        const va = this.known.get(ka), vb = this.known.get(kb);
        this.known.delete(ka); this.known.delete(kb);
        if (vb) this.known.set(ka, vb);
        if (va) this.known.set(kb, va);
    }

    /** Se olvida de algunas cartas (se llama una vez por turno propio). */
    fade() {
        if (!this.forget) return;
        for (const k of [...this.known.keys()]) if (this.rng.chance(this.forget)) this.known.delete(k);
    }

    observe(e) {
        const me = this.me;
        switch (e.t) {
            case 'round': this.known.clear(); this.drawn = null; break;
            case 'peek': if (e.by === me) this.set(e.target.p, e.target.s, e.card); break;
            case 'draw':
                if (e.p === me) this.drawn = { rank: e.card.rank, suit: e.card.suit };
                break;
            case 'swap':
                if (e.p === me) { this.known.set(Memory.key(me, e.slot), { rank: e.drawn.rank, suit: e.drawn.suit }); this.drawn = null; }
                else if (!e.secret) this.set(e.p, e.slot, e.drawn);
                else this.del(e.p, e.slot);
                break;
            case 'discard': if (e.p === me) this.drawn = null; break;
            case 'swapCards': this.swap(e.a, e.b); break;
            case 'burn': this.del(e.target.p, e.target.s); break;
            case 'burnFail': this.set(e.target.p, e.target.s, e.card); break;
            case 'penalty': for (const s of e.slots) this.del(e.p, s); break;
            case 'give': {
                const v = this.known.get(Memory.key(e.by, e.from));
                this.del(e.by, e.from);
                if (v) this.known.set(Memory.key(e.to.p, e.to.s), v); else this.del(e.to.p, e.to.s);
                break;
            }
            case 'reveal': this.known.clear(); this.drawn = null; break;
        }
    }
}

// ── Personajes ────────────────────────────────────────

const BOT_LEVELS = {
    // forget: probabilidad de olvidar cada carta en cada turno · mistake: de recordarla mal
    // sloppy: de despistarse al decidir · react: lo que tarda en quemar (ms)
    facil:   { label: 'fácil',   forget: 0.30, mistake: 0.20, sloppy: 0.30, callAt: 11, margin: 0,   react: [2200, 3800], bluff: 0.03 },
    normal:  { label: 'normal',  forget: 0.08, mistake: 0.04, sloppy: 0.08, callAt: 7,  margin: 1,   react: [1300, 2500], bluff: 0.04 },
    dificil: { label: 'difícil', forget: 0,    mistake: 0,    sloppy: 0,    callAt: 5,  margin: 1.5, react: [800, 1600],  bluff: 0.02 },
};

/** Rivales con nombre y carácter. pitch y rate cambian su voz en los comentarios. */
const CHARACTERS = [
    {
        id: 'paco', name: 'Paco', level: 'facil', pitch: 0.8, rate: 1.0,
        intro: 'Paco, que se despista con una mosca',
        quips: {
            call: ['¡Pedro! Creo. Sí, sí, Pedro.', 'Pedro, y que sea lo que Dios quiera.'],
            burnFail: ['Ay, que juraría que era esa.', 'Uy. Esa no era.'],
            win: ['¡Anda! ¡He ganado yo!', 'Ni yo me lo creo.'],
            burned: ['¿Mi carta? ¿Por qué mi carta?'],
            cut: ['¡Toma triunfo!', 'Uy, que tenía triunfo.'],
            bigTrick: ['¡Mira lo que me llevo!', 'Esto pesa, esto pesa.'],
            cante: ['¡Que canto! ¿Se canta así?'],
            eat: ['¡Ñam! ¿Era tuya?', 'Uy, me la he comido sin querer.'],
            eaten: ['¿Otra vez a casa? Si acababa de salir.'],
            meta: ['¡Una dentro! No sé ni cómo.'],
            right: ['¡Lo sabía! Bueno, casi.', '¡Toma ya!'],
            wrong: ['Pues yo habría jurado que era esa.', 'Me la sabía, me la sabía…'],
            wedge: ['¡Un quesito! ¡Qué rico!', '¡Este para la colección!'],
            virusAttack: ['¡Achís! Perdón, se me ha escapado un virus.', 'Uy, ¿eso era tuyo?'],
            virusHit: ['¿Mi corazón? ¿Dónde está mi corazón?'],
            immune: ['¡Ya no me lo toca nadie! Creo.'],
        },
    },
    {
        id: 'lucia', name: 'Lucía', level: 'normal', pitch: 1.25, rate: 1.05,
        intro: 'Lucía, que juega rápido y sonriendo',
        quips: {
            call: ['¡Pedro! Contad bien vuestras cartas.', 'Pedro. Ya me diréis.'],
            burnFail: ['Vaya, me he precipitado.'],
            win: ['¡Toma! Esa me la llevo.', 'Lo sabía.'],
            burned: ['Oye, que esa la tenía controlada.'],
            cut: ['Fallo, y sin pestañear.'],
            bigTrick: ['Para el saco.', 'Muy rica esta baza.'],
            cante: ['Las tenía guardadas.'],
            eat: ['¡Te pillé!', 'Veinte para mí.'],
            eaten: ['Vale, vale, me la apunto.'],
            meta: ['Una menos.', 'Para dentro.'],
            right: ['¡Facilísima!', 'Esa la vi el otro día en una serie.'],
            wrong: ['¡Anda ya! ¿En serio?', 'Vale, esa no.'],
            wedge: ['¡Quesito para mí!', 'Uno más, uno más.'],
            virusAttack: ['Toma virus, y sin vacunar.', 'Esto te pasa por no lavarte las manos.'],
            virusHit: ['Vale, vale, me lo apunto.'],
            immune: ['Inmune. Ni lo intentéis.'],
        },
    },
    {
        id: 'carmen', name: 'la abuela Carmen', level: 'dificil', pitch: 1.1, rate: 0.95,
        intro: 'la abuela Carmen, que no olvida ni una carta',
        quips: {
            call: ['Pedro, cariño.', 'Pedro. Y no me pongáis esa cara.'],
            burnFail: ['Hasta la abuela se equivoca, hijo.'],
            win: ['Lo que no sepa la abuela...', 'Cincuenta años jugando, mi vida.'],
            burned: ['Muy bien visto, muy bien.'],
            cut: ['Triunfo, hijo, triunfo.'],
            bigTrick: ['Esto para la abuela.', 'Ay, qué bien me viene.'],
            cante: ['Las cuarenta, como en los buenos tiempos.'],
            eat: ['Lo siento, cariño, pero a casa.', 'Ay, hijo, que te la estaba viendo venir.'],
            eaten: ['Bien comida, bien comida.'],
            meta: ['Despacito y buena letra.'],
            right: ['Eso lo aprendí yo en la escuela, hijo.', 'Muy fácil, cariño.'],
            wrong: ['Ay, qué cabeza la mía.', 'Eso antes no lo enseñaban.'],
            wedge: ['Otro quesito para la abuela.', 'Ay, qué bien, otro quesito.'],
            virusAttack: ['Hijo, abrígate, que pillas de todo.', 'Un virusito, nada grave.'],
            virusHit: ['A mi edad, un órgano más o menos…'],
            immune: ['Esto con caldito se cura.', 'Inmune, como la abuela.'],
        },
    },
    {
        id: 'toni', name: 'Toni', level: 'normal', pitch: 0.9, rate: 1.1, bluff: 0.22, callBonus: 3,
        intro: 'Toni, que canta Pedro antes de tiempo para despistar',
        quips: {
            call: ['¡Pedro! ¿Qué pasa? ¿Os da miedo?', '¡Pedro! A ver quién se atreve.'],
            burnFail: ['Era una prueba. Para ver si estabais atentos.'],
            win: ['Farol del bueno, señores.', '¡Os lo dije!'],
            burned: ['Eso no lo he visto venir.'],
            cut: ['¡Zas! Fallo.', 'Os lo esperabais, ¿eh?'],
            bigTrick: ['¿Quién da más?', 'Baza gorda para Toni.'],
            cante: ['¡Cantando, que es gerundio!'],
            eat: ['¡Zas! A casa.', '¿Quién dijo miedo?'],
            eaten: ['Era un farol. Quería que me la comieras.'],
            meta: ['¡Toni mete otra!'],
            right: ['¿Lo dudabais?', 'Pregunta de primero.'],
            wrong: ['La pregunta estaba mal hecha.', 'Os he dejado ganar esa.'],
            wedge: ['¡Quesito para Toni!', '¿Quién da más?'],
            virusAttack: ['¡Contagio express!', 'Ese órgano tiene mala cara.'],
            virusHit: ['Era un farol. No lo necesitaba.'],
            immune: ['Blindado, señores.'],
        },
    },
    {
        id: 'marta', name: 'Marta', level: 'dificil', pitch: 1.15, rate: 1.15,
        intro: 'Marta, que cuenta todas las cartas',
        quips: {
            call: ['Pedro. Los números no mienten.', 'Pedro. Lo tengo calculado.'],
            burnFail: ['Error de cálculo. No volverá a pasar.'],
            win: ['Estadística pura.', 'Como estaba previsto.'],
            burned: ['Interesante jugada.'],
            cut: ['Fallo calculado.'],
            bigTrick: ['Todo según lo previsto.'],
            cante: ['Cante. Puntos asegurados.'],
            eat: ['Una probabilidad entre seis. Me ha salido.', 'Cuento veinte.'],
            eaten: ['Riesgo asumido.'],
            meta: ['Una más en la meta. Según lo previsto.'],
            right: ['Dato correcto.', 'Evidente.'],
            wrong: ['Tomo nota. No volverá a pasar.', 'Interesante. Lo repasaré.'],
            wedge: ['Quesito asegurado.', 'Uno más. Según lo previsto.'],
            virusAttack: ['Infección prevista.', 'Según lo calculado.'],
            virusHit: ['Riesgo asumido.'],
            immune: ['Inmunizado. Según lo previsto.'],
        },
    },
    {
        id: 'rafa', name: 'Rafa', level: 'facil', pitch: 1.0, rate: 0.95,
        intro: 'Rafa, que acaba de aprender a jugar',
        quips: {
            call: ['¿Así se canta? Pues ¡Pedro!', 'Pedro, ¿vale?'],
            burnFail: ['Perdón, perdón, sigo aprendiendo.'],
            win: ['¿Gano yo? ¡Qué ilusión!'],
            burned: ['¿Se puede hacer eso?'],
            cut: ['¿Esto es fallar? ¡Pues fallo!'],
            bigTrick: ['¡Me la llevo yo! ¿Verdad?'],
            cante: ['¿Puedo cantar? ¡Pues canto!'],
            eat: ['¿Me la puedo comer? ¡Me la como!'],
            eaten: ['¿Ya? ¿Tan pronto?'],
            meta: ['¡Ha llegado! ¿Ha llegado?'],
            right: ['¿He acertado? ¡He acertado!', 'Lo he puesto a suerte, ¿eh?'],
            wrong: ['¿No era esa? Vaya.', 'Esa no me la sabía.'],
            wedge: ['¿Esto es un quesito? ¡Qué bonito!'],
            virusAttack: ['¿Esto se pega? Pues toma.', 'Ay, perdona, que estornudo.'],
            virusHit: ['¿Ya? ¿Tan pronto?'],
            immune: ['¡Qué bonito me ha quedado!'],
        },
    },
    {
        id: 'terminator', name: 'Terminator', level: 'dificil', pitch: 0.5, rate: 0.9,
        intro: 'Terminator, que ha venido del futuro a ganarte',
        quips: {
            call: ['Pedro. Hasta la vista, baby.', 'Pedro. Objetivo localizado.'],
            burnFail: ['Error en el sistema. Reiniciando.'],
            win: ['Misión cumplida.', 'Volveré. Y volveré a ganar.'],
            burned: ['Daño registrado. Volveré.'],
            cut: ['Triunfo. Resistencia inútil.'],
            bigTrick: ['Baza eliminada.', 'Análisis completo. Me la llevo.'],
            cante: ['Cante detectado. Procesando puntos.'],
            eat: ['Hasta la vista, ficha.', 'Objetivo eliminado.'],
            eaten: ['Volveré.'],
            meta: ['Objetivo alcanzado.'],
            right: ['Dato confirmado.', 'Mi base de datos no falla.'],
            wrong: ['Fallo de memoria. Actualizando.', 'Esa pregunta no estaba en mi programa.'],
            wedge: ['Quesito asimilado.', 'Uno más para la máquina.'],
            virusAttack: ['Virus enviado. Sin piedad.', 'Infección programada.'],
            virusHit: ['Sistema dañado. Volveré.'],
            immune: ['Blindaje total.', 'Soy una máquina. No me pongo malo.'],
        },
    },
    {
        id: 'doraemon', name: 'Doraemon', level: 'normal', pitch: 1.4, rate: 1.05,
        intro: 'Doraemon, que saca un invento del bolsillo para cada jugada',
        quips: {
            call: ['¡Pedro! Y sin usar ningún invento.', 'Pedro. Lo he visto con mis gafas del futuro.'],
            burnFail: ['Este invento no funciona bien.'],
            win: ['¡Lo sabía! Me lo dijo la máquina del tiempo.', '¡Gané! Esto lo celebro con un pastelito.'],
            burned: ['¡Oye! ¿Quién ha tocado mi bolsillo?'],
            cut: ['¡Triunfo! Lo tenía en el bolsillo.'],
            bigTrick: ['¡Al bolsillo mágico!', 'Esta baza me cabe en el bolsillo.'],
            cante: ['¡Cante! Como en el siglo veintidós.'],
            eat: ['¡Puerta mágica, y a casa!', 'Perdona, ha sido el invento.'],
            eaten: ['¡Ay! ¿No había un ratón por ahí?'],
            meta: ['¡Dentro! Con el gorrocóptero se llega antes.'],
            right: ['¡Eso lo sé! Soy del futuro.', '¡Fácil, fácil!'],
            wrong: ['En mi siglo eso era distinto.', 'Se me ha estropeado el traductor.'],
            wedge: ['¡Quesito! Casi tan rico como un pastelito.', '¡Otro para el bolsillo!'],
            virusAttack: ['Un virus del futuro. No tiene cura todavía.', 'Uy, se me ha escapado del bolsillo.'],
            virusHit: ['¡Mi órgano! ¿Dónde está la medicina del futuro?'],
            immune: ['Vacuna del siglo veintidós.', '¡Inmune! Gracias, bolsillo.'],
        },
    },
    {
        id: 'nobita', name: 'Nobita', level: 'facil', pitch: 1.2, rate: 1.0,
        intro: 'Nobita, que preferiría estar durmiendo la siesta',
        quips: {
            call: ['¡Pedro! ¿Puedo volver a la cama?', 'Pedro, y ya no juego más.'],
            burnFail: ['¡Doraemon, ayúdame!', 'Siempre me pasa a mí.'],
            win: ['¿He ganado? ¡Que se lo digan a mi madre!', '¡Por fin gano algo!'],
            burned: ['¿Por qué siempre a mí?'],
            cut: ['¡Triunfo! Y sin hacer los deberes.'],
            bigTrick: ['¡Me la llevo! ¡Qué suerte!'],
            cante: ['¿Esto cuenta como deberes?'],
            eat: ['¡Uy! No quería, de verdad.'],
            eaten: ['Siempre me pasa a mí.', '¡Doraemon, haz algo!'],
            meta: ['¡Ha llegado! Ahora, siesta.'],
            right: ['¿La he acertado? ¡Saco un diez!', '¡Esa sí que me la sabía!'],
            wrong: ['Otro cero. Mi madre me va a reñir.', 'Eso no entraba en el examen.'],
            wedge: ['¡Un quesito! Me lo como luego.'],
            virusAttack: ['¡Toma! Bueno, perdón.', 'Me han obligado, de verdad.'],
            virusHit: ['¡Doraemon, una medicina!'],
            immune: ['¡Ya no me pongo malo! Pero mañana no voy al cole.'],
        },
    },
    {
        id: 'shinchan', name: 'Shin-chan', level: 'facil', pitch: 1.6, rate: 1.1,
        intro: 'Shin-chan, que hace el baile del culito cuando gana',
        quips: {
            call: ['¡Pedro! Ji ji ji.', '¡Pedro, Pedrito, Pedrolo!'],
            burnFail: ['Era una broma. Ji ji.', '¡Ups! Que no se entere mi madre.'],
            win: ['¡Baile del culito!', '¡He ganado! ¡Chocolatinas para mí!'],
            burned: ['¡Oye, guapa, esa carta era mía!'],
            cut: ['¡Triunfo, y a bailar!'],
            bigTrick: ['¡Me lo llevo todo! Ji ji ji.'],
            cante: ['¡Canto! La la la.'],
            eat: ['¡Ñam! Como las galletas de chocolate.', '¡A casa! Ji ji.'],
            eaten: ['¡Mamá! Me han comido.'],
            meta: ['¡Dentro! ¡Baile del culito!'],
            right: ['¡Lo sé todo! Ji ji ji.', '¡Toma ya, señorita!'],
            wrong: ['Eso no lo sabe nadie de cinco años.', '¡Ay! ¿Me das una chocolatina igualmente?'],
            wedge: ['¡Un quesito! ¿Tiene chocolate?'],
            virusAttack: ['¡Achís! Ji ji ji.', '¡Toma virus, y sin lavarse las manos!'],
            virusHit: ['¡Mamá! Me duele la barriga.'],
            immune: ['¡Soy Supershin! Nada me hace daño.'],
        },
    },
    {
        id: 'manolo', name: 'el cuñado Manolo', level: 'normal', pitch: 0.85, rate: 1.1,
        intro: 'el cuñado Manolo, que sabe de todo más que nadie',
        quips: {
            call: ['Pedro. Esto lo hago yo con los ojos cerrados.', 'Pedro. Ya os lo explico luego.'],
            burnFail: ['Eso es que la baraja está mal hecha.'],
            win: ['Lo que yo os diga. Lo que yo os diga.', 'Es que esto tiene su técnica.'],
            burned: ['Bueno, bueno, eso lo he dejado yo a propósito.'],
            cut: ['Triunfo. De primero de cuñado.'],
            bigTrick: ['Para casa. Como tiene que ser.'],
            cante: ['Las cuarenta. Esto ya lo hacía mi abuelo.'],
            eat: ['A casa, que no sabes jugar.', 'Esto es de manual.'],
            eaten: ['Eso es suerte. Pura suerte.'],
            meta: ['Lo que yo decía. Para dentro.'],
            right: ['Eso lo sabe todo el mundo.', 'Os lo podría haber dicho yo.'],
            wrong: ['La respuesta está mal. Lo he leído yo.', 'Eso depende de a quién le preguntes.'],
            wedge: ['Quesito. Ya os lo dije.'],
            virusAttack: ['Te lo dije, ponte una chaqueta.', 'Esto antes no pasaba.'],
            virusHit: ['Eso es la corriente, que entra por la ventana.'],
            immune: ['Inmune. Yo es que me cuido.'],
        },
    },
    {
        id: 'puri', name: 'doña Puri', level: 'dificil', pitch: 1.3, rate: 1.2,
        intro: 'doña Puri, la vecina que se entera de todo',
        quips: {
            call: ['Pedro. Que yo me entero de todo.', 'Pedro, y no se lo digáis a nadie.'],
            burnFail: ['Ay, pues me habían dicho que era esa.'],
            win: ['Esto lo tiene que saber todo el barrio.', 'Ya os lo dije en el portal.'],
            burned: ['Uy, uy, uy. Esto lo cuento yo en la escalera.'],
            cut: ['Triunfo. Me lo contó un pajarito.'],
            bigTrick: ['Me la llevo, y ya veréis lo que cuento.'],
            cante: ['Cante. Como en las bodas de antes.'],
            eat: ['A casa, hijo. Y que te vea tu madre.', 'Ay, perdona, que estaba mirando por la ventana.'],
            eaten: ['Esto se lo digo yo a la del cuarto.'],
            meta: ['Dentro. Como la ropa al tendedero.'],
            right: ['Eso lo sabe la portera y lo sé yo.', 'Me lo contaron en la peluquería.'],
            wrong: ['Pues en la peluquería me dijeron otra cosa.'],
            wedge: ['Quesito. Y el del tercero sin ninguno.'],
            virusAttack: ['Te lo pegó la del segundo.', 'Ahí va, para que tengas algo que contar.'],
            virusHit: ['Ay, que me va a dar algo.'],
            immune: ['Inmune. Como las que vamos a misa de ocho.'],
        },
    },
    {
        id: 'chispas', name: 'el robot Chispas', level: 'facil', pitch: 1.5, rate: 1.25,
        intro: 'el robot Chispas, un aspirador que se choca con todas las patas de la mesa',
        quips: {
            call: ['Pi pi. Pedro. Pi.', 'Pedro. Batería al quince por ciento.'],
            burnFail: ['Error. Me he chocado con la mesa.'],
            win: ['Pi pi pi. Victoria. Vuelvo a mi base.', '¡He ganado! Y he aspirado debajo del sofá.'],
            burned: ['Pi. ¿Mi carta? Error, error.'],
            cut: ['Triunfo aspirado.'],
            bigTrick: ['Aspirando baza. Brrrrr.'],
            cante: ['Pi pi. Cante. Pi pi.'],
            eat: ['¡Aspirada! Brrrrr.', 'Ficha aspirada. Depósito lleno.'],
            eaten: ['Pi. Me he quedado atascado.'],
            meta: ['Llegando a la base. Pi pi.'],
            right: ['Respuesta correcta. Pi.', 'Datos aspirados del sofá.'],
            wrong: ['Error. Necesito vaciar el depósito.', 'Pi. Me he enredado con un calcetín.'],
            wedge: ['Quesito aspirado. Pi pi.'],
            virusAttack: ['Soltando polvo. Achís.', 'Virus encontrado debajo de la cama.'],
            virusHit: ['Pi pi. Fallo en el motor.'],
            immune: ['Filtro antivirus activado.'],
        },
    },
    {
        id: 'michi', name: 'el gato Michi', level: 'facil', pitch: 1.7, rate: 1.0,
        intro: 'el gato Michi, que se tumba encima de las cartas',
        quips: {
            call: ['Miau. Pedro. Miau.', 'Prrrr. Pedro.'],
            burnFail: ['Miau. Ha sido sin querer.'],
            win: ['Miau miau. Ahora, a dormir encima del teclado.', '¡Miau! Quiero mi premio en latas.'],
            burned: ['¡Ffff! Esa carta era mía.'],
            cut: ['Zarpazo de triunfo. Miau.'],
            bigTrick: ['Prrrr. Para mi cama.'],
            cante: ['Miau miau miau. Eso es cantar.'],
            eat: ['¡Zarpazo! A casa.', 'Miau. Era como un ratón.'],
            eaten: ['¡Ffff!'],
            meta: ['Miau. Dentro, como en mi caja.'],
            right: ['Miau. Evidente.', 'Prrrr.'],
            wrong: ['Miau. Me da igual.', 'Bostezo. Prrrr.'],
            wedge: ['Miau. Prefiero pescado, pero vale.'],
            virusAttack: ['¡Pelo de gato! Achís.', 'Miau. Ahí va una bola de pelo.'],
            virusHit: ['Miau. Me quedan seis vidas.'],
            immune: ['Miau. Tengo siete vidas.'],
        },
    },
    {
        id: 'fermin', name: 'el abuelo Fermín', level: 'normal', pitch: 0.75, rate: 0.85,
        intro: 'el abuelo Fermín, que cuenta una batallita en cada jugada',
        quips: {
            call: ['Pedro. En la mili cantaba Pedro todos los días.', 'Pedro, que me acuerdo yo de cuando esto costaba una peseta.'],
            burnFail: ['En mis tiempos eso valía.'],
            win: ['Como en el cuarenta y siete, en el bar del pueblo.', 'Y eso que no llevo las gafas.'],
            burned: ['Esto en mi pueblo no se hacía.'],
            cut: ['Triunfo. Como me enseñó mi padre.'],
            bigTrick: ['Esto me recuerda a una vez, en la mili…'],
            cante: ['Las cuarenta, y me acuerdo de tu abuela.'],
            eat: ['A casa, chaval. Que ya es tarde.', 'Esto en la mili era de lo más normal.'],
            eaten: ['Cuando yo era joven, corría más.'],
            meta: ['Llegué. Como el tren de los domingos.'],
            right: ['Eso lo daban en la escuela del pueblo.', 'Esto lo sé yo de antes de la guerra.'],
            wrong: ['En mis tiempos la respuesta era otra.', 'Eso lo han cambiado. Seguro.'],
            wedge: ['Quesito. Como el de las cabras de mi tío.'],
            virusAttack: ['Esto antes se curaba con un vaso de vino.', 'Ahí va, chaval. Abrígate.'],
            virusHit: ['Esto es el reúma, que avisa.'],
            immune: ['Inmune. Yo de pequeño comía tierra.'],
        },
    },
    {
        id: 'pepa', name: 'Pepa la pitonisa', level: 'normal', pitch: 1.2, rate: 0.9,
        intro: 'Pepa la pitonisa, que dice que ya sabe cómo acaba la partida',
        quips: {
            call: ['Pedro. Lo dicen las cartas.', 'Pedro. Lo he visto en mi bola de cristal.'],
            burnFail: ['Hoy los astros no están de mi parte.'],
            win: ['Ya lo vi en tu mano.', 'Lo sabía. Lo ponía en el horóscopo.'],
            burned: ['Eso no salía en mi bola de cristal.'],
            cut: ['Triunfo. Estaba escrito.'],
            bigTrick: ['Veo… veo una baza muy grande. Para mí.'],
            cante: ['Las cartas me hablan, y dicen cuarenta.'],
            eat: ['Lo vi venir. Literalmente.', 'Tu ficha tenía mala estrella.'],
            eaten: ['Mercurio retrógrado. Seguro.'],
            meta: ['Dentro. Lo dicen los astros.'],
            right: ['Lo vi en el poso del café.', 'Mi bola de cristal no falla.'],
            wrong: ['La bola de cristal estaba empañada.', 'Eso es culpa de la luna.'],
            wedge: ['Un quesito. Lo predije el martes.'],
            virusAttack: ['Veo… un virus en tu futuro.', 'Mala racha, cariño. Lo dicen las cartas.'],
            virusHit: ['Ya me lo decía el horóscopo.'],
            immune: ['Protegida por los astros.'],
        },
    },
    {
        id: 'bacalao', name: 'el capitán Bacalao', level: 'dificil', pitch: 0.6, rate: 0.95,
        intro: 'el capitán Bacalao, un pirata que no suelta un tesoro',
        quips: {
            call: ['¡Pedro, por todos los mares!', '¡Pedro! ¡Al abordaje!'],
            burnFail: ['¡Rayos y truenos! Me ha fallado el catalejo.'],
            win: ['¡El tesoro es mío, grumetes!', '¡Victoria! Ron para todos.'],
            burned: ['¡Motín a bordo!'],
            cut: ['¡Triunfo, y al abordaje!'],
            bigTrick: ['¡Al cofre del tesoro!', '¡Botín para el capitán!'],
            cante: ['¡Las cuarenta, como canta un loro!'],
            eat: ['¡A pasear por la tabla!', '¡Al agua, marinero!'],
            eaten: ['¡Rayos y truenos!'],
            meta: ['¡Tierra a la vista!'],
            right: ['¡Eso lo sabe cualquier pirata!', '¡Correcto, grumete!'],
            wrong: ['¡Rayos! Esa no estaba en el mapa.'],
            wedge: ['¡Un doblón de oro! Bueno, un quesito.'],
            virusAttack: ['¡Escorbuto para ti, marinero!', '¡Peste a bordo!'],
            virusHit: ['¡Rayos! Me han hundido un órgano.'],
            immune: ['¡Duro como la madera de mi pata!'],
        },
    },
];

/** Elige los rivales según la dificultad: facil, normal, dificil o mezcla. */
function pickRivals(count, difficulty, rng) {
    const pool = CHARACTERS.filter(c => difficulty === 'mezcla' || c.level === difficulty);
    const order = rng.shuffle(pool.slice());
    if (difficulty === 'mezcla') {
        // Que haya de todo: una de cada dificultad si caben.
        order.sort((a, b) => ['facil', 'normal', 'dificil'].indexOf(a.level) - ['facil', 'normal', 'dificil'].indexOf(b.level));
        const byLevel = ['normal', 'facil', 'dificil'].map(l => order.filter(c => c.level === l));
        const out = [];
        while (out.length < count && byLevel.some(l => l.length)) for (const l of byLevel) if (l.length && out.length < count) out.push(l.shift());
        return out;
    }
    const out = order.slice(0, count);
    // Si no hay bastantes de esa dificultad, se completan con otros jugando a ese nivel.
    for (const c of rng.shuffle(CHARACTERS.filter(c => !out.includes(c)))) {
        if (out.length >= count) break;
        out.push({ ...c, level: difficulty });
    }
    return out;
}

// ── El rival de la máquina ────────────────────────────

class Bot {
    constructor(game, me, character, rng) {
        this.game = game;
        this.me = me;
        this.char = character;
        this.level = { ...BOT_LEVELS[character.level || 'normal'] };
        if (character.bluff != null) this.level.bluff = character.bluff;
        if (character.callBonus) this.level.callAt += character.callBonus;
        this.rng = rng;
        this.mem = new Memory(me, { forget: this.level.forget, mistake: this.level.mistake, rng });
        this.myTurns = 0;
    }

    get E() { return averageRank(this.game.rules.deck, this.game.rules); }

    /** Puntos de un número de carta con las reglas de la mesa (null si no se sabe). */
    pts(r) { return r == null ? null : rankPoints(r, this.game.rules); }
    /** Puntos de una carta que recuerda, o null si no la conoce. */
    known(p, s) { return this.pts(this.mem.rank(p, s)); }

    observe(e) {
        this.mem.observe(e);
        if (e.t === 'round') this.myTurns = 0;
        if (e.t === 'turn' && e.p === this.me) { this.myTurns++; this.mem.fade(); }
    }

    /** Valor que cree que tiene una carta (la media si no la conoce). */
    guess(p, s) { const r = this.known(p, s); return r == null ? this.E : r; }

    estimate(p) {
        const g = this.game, slots = g.slotsOf(p);
        if (!slots.length) return 0;
        const ranks = slots.map(s => this.mem.rank(p, s));
        const known = ranks.map(r => this.pts(r));
        if (g.rules.allEqualOne && slots.length >= 2 && ranks.every(r => r != null && r === ranks[0])) return Math.min(1, known.reduce((a, v) => a + v, 0));
        // Los demás también mejoran su mano con el tiempo: se les supone algo mejor que la media.
        const unknown = p === this.me ? this.E : Math.max(Math.min(3.5, this.E), this.E - g.turns / g.n * 0.35);
        return known.reduce((a, r) => a + (r == null ? unknown : r), 0);
    }

    unknownOwn() { return this.game.slotsOf(this.me).filter(s => this.mem.rank(this.me, s) == null); }

    /** La carta propia que más conviene quitarse: la de mayor valor (conocida o supuesta). */
    worstOwn() {
        let best = null, bestV = -Infinity;
        for (const s of this.game.slotsOf(this.me)) {
            const r = this.known(this.me, s);
            const v = r == null ? this.E + 0.01 : r;   // a igualdad, mejor la conocida
            if (v > bestV || (v === bestV && r != null)) { bestV = v; best = s; }
        }
        return best == null ? null : { s: best, v: bestV, known: this.known(this.me, best) != null };
    }

    // ── Decisiones ────────────────────────────────────

    choosePeekStart(count) {
        return this.rng.shuffle(this.game.slotsOf(this.me).slice()).slice(0, count);
    }

    chooseTurn() {
        const g = this.game;
        if (g.caller === null && this.shouldCall()) return { type: 'call', p: this.me };
        if (g.rules.takeFromTable && g.top && g.countOf(this.me)) {
            const w = this.worstOwn();
            const t = this.pts(g.top.rank);
            if (w && t <= 3 && w.v > t + 2) return { type: 'take', p: this.me };
        }
        return { type: 'draw', p: this.me };
    }

    shouldCall() {
        const g = this.game, L = this.level;
        const mine = this.estimate(this.me);
        const rivals = g.players.map((_, i) => i).filter(i => i !== this.me).map(i => this.estimate(i));
        const best = Math.min(...rivals);
        const unknown = this.unknownOwn().length;
        if (this.myTurns < 2 && !(mine <= 2 && unknown === 0)) return false;
        if (mine <= 2 && unknown === 0) return true;
        // Si la ronda se alarga mucho, se conforma con menos.
        const patience = Math.max(0, (g.turns - 40) / 8);
        if (mine <= L.callAt + patience && mine < best - L.margin + patience) return true;
        // Farol: cantar con una mano regular para meter prisa.
        return mine <= L.callAt + 5 && this.rng.chance(L.bluff);
    }

    chooseDrawn(card) {
        const g = this.game, me = this.me, rank = card.rank, v = this.pts(rank);
        const slots = g.slotsOf(me);
        if (!slots.length) return { type: 'discard', p: me };
        const fromTable = g.drawnFrom === 'table';
        if (this.rng.chance(this.level.sloppy)) {
            // Despiste: decide sin pensar mucho.
            if (fromTable || this.rng.chance(0.5)) return { type: 'swap', p: me, slot: this.rng.pick(slots) };
            return { type: 'discard', p: me };
        }
        const w = this.worstOwn();
        // Las figuras con poder casi siempre se tiran para usar el poder.
        if (!fromTable && g.rules.powers && POWERS[rank] && !(w && w.known && w.v > v + 1)) return { type: 'discard', p: me };
        // ¿Hace pareja con todas las demás conocidas? (todas iguales valen 1)
        if (g.rules.allEqualOne && slots.length >= 2) {
            const others = slots.map(s => this.mem.rank(me, s));
            const counts = others.filter(r => r === rank).length;
            const odd = slots.filter(s => this.mem.rank(me, s) !== rank);
            if (counts === slots.length - 1 && odd.length === 1) return { type: 'swap', p: me, slot: odd[0] };
        }
        if (w && w.v > v) return { type: 'swap', p: me, slot: w.s };
        if (fromTable) return { type: 'swap', p: me, slot: w ? w.s : slots[0] };
        return { type: 'discard', p: me };
    }

    choosePower(step) {
        const g = this.game, me = this.me;
        if (this.rng.chance(this.level.sloppy)) return { type: 'pass', p: me };
        if (step === 'look') {
            const mine = this.unknownOwn();
            if (mine.length) return { type: 'peek', p: me, target: { p: me, s: this.rng.pick(mine) } };
            // Mira una carta desconocida del rival que parece ir mejor.
            const rivals = g.players.map((_, i) => i).filter(i => i !== me && g.countOf(i))
                .sort((a, b) => this.estimate(a) - this.estimate(b));
            for (const p of rivals) {
                const un = g.slotsOf(p).filter(s => this.mem.rank(p, s) == null);
                if (un.length) return { type: 'peek', p: me, target: { p, s: this.rng.pick(un) } };
            }
            return { type: 'pass', p: me };
        }
        // Cambiar: mi peor carta por una buena (o desconocida) de otro.
        const w = this.worstOwn();
        if (!w) return { type: 'pass', p: me };
        let target = null, gain = 0;
        for (const t of g.targets('swap', me)) {
            if (t.p === me) continue;
            const r = this.known(t.p, t.s);
            const val = r == null ? this.E : r;
            const d = w.v - val + (r != null ? 0.3 : 0);
            if (d > gain) { gain = d; target = t; }
        }
        if (target && gain >= 2.5) return { type: 'swapCards', p: me, a: { p: me, s: w.s }, b: target };
        return { type: 'pass', p: me };
    }

    /** ¿Quema algo? Devuelve el objetivo y cuánto tarda en reaccionar, o null. */
    chooseBurn(value) {
        if (!this.game.canBurn(this.me)) return null;
        if (this.rng.chance(this.level.sloppy)) return null;   // no se da cuenta
        const target = this.burnTarget(value);
        if (!target) return null;
        const [lo, hi] = this.level.react;
        const delay = this.rng.range(lo, hi) * (target.p === this.me ? 1 : 1.15);
        return { target, delay };
    }

    /** La carta que cree que es igual a value: primero las suyas, después las de los demás. */
    burnTarget(value) {
        const g = this.game, me = this.me;
        if (!g.canBurn(me)) return null;
        for (const s of g.slotsOf(me)) if (this.mem.rank(me, s) === value) return { p: me, s };
        if (g.rules.burnOthers && g.countOf(me) > 0) {
            for (const t of g.targets('burn', me)) {
                if (t.p !== me && this.mem.rank(t.p, t.s) === value) return t;
            }
        }
        return null;
    }

    chooseGive() {
        const w = this.worstOwn();
        return { type: 'give', p: this.me, slot: w ? w.s : this.game.slotsOf(this.me)[0] };
    }

    quip(kind) {
        const list = this.char.quips?.[kind];
        return list && list.length ? this.rng.pick(list) : null;
    }
}

if (typeof module !== 'undefined') {
    const R = require('./rules.js');
    Object.assign(globalThis, { makeRng: R.makeRng, averageRank: R.averageRank, rankPoints: R.rankPoints, POWERS: R.POWERS });
    module.exports = { Memory, Bot, BOT_LEVELS, CHARACTERS, pickRivals };
}
