/* =============================================
   EL PEDRO — snapshot.js
   Una copia de la partida entera (las reglas y los
   rivales de la máquina) que se puede mandar por la
   sala y seguir en otro navegador. Si se va quien ha
   creado la sala, el siguiente sigue la partida desde
   esta copia.
   Guarda lo que hay en cada objeto, también quién
   apunta a quién (una carta en una mano y en el
   historial es la misma), los Set, los Map, el azar
   con semilla de cada uno y la clase de cada objeto.
   Lo que es igual en todos los navegadores (la nave,
   los personajes, las preguntas) no se copia: se dice
   qué es y el otro lo pone de los suyos.
   ============================================= */
'use strict';

const Snapshot = {
    /**
     * Convierte root en algo que se puede pasar a JSON.
     * ctx: { classes: { Nombre: Clase }, externs: [[nombre, objeto]] }.
     * Devuelve { data, lost }: lost dice dónde había algo que no se puede copiar (una función).
     */
    encode(root, ctx = {}) {
        const ids = new Map(), ext = this.externs(ctx), lost = [];
        let next = 0;
        const enc = (v, where) => {
            if (v === undefined) return { $u: 1 };
            if (typeof v === 'number') return Number.isFinite(v) ? v : { $n: String(v) };
            if (v === null || typeof v !== 'object') {
                if (typeof v === 'function') { lost.push(where); return { $u: 1 }; }
                if (typeof v === 'bigint' || typeof v === 'symbol') { lost.push(where); return { $u: 1 }; }
                return v;
            }
            if (ext.has(v)) return { $x: ext.get(v) };
            if (ids.has(v)) return { $ref: ids.get(v) };
            const $i = next++;
            ids.set(v, $i);
            if (Array.isArray(v)) return { $i, $a: v.map((x, k) => enc(x, `${where}[${k}]`)) };
            if (ArrayBuffer.isView(v)) return { $i, $t: v.constructor.name, $d: Array.from(v) };
            if (v instanceof Set) return { $i, $s: [...v].map((x, k) => enc(x, `${where}<${k}>`)) };
            if (v instanceof Map) return { $i, $m: [...v].map(([k, x], j) => [enc(k, `${where}{${j}}`), enc(x, `${where}{${j}}`)]) };
            if (typeof v.next === 'function' && typeof v.shuffle === 'function' && typeof v.save === 'function') return { $i, $r: v.save() };
            const proto = Object.getPrototypeOf(v);
            const out = { $i, $o: {} };
            if (proto && proto !== Object.prototype) {
                const name = proto.constructor?.name;
                if (name && ctx.classes?.[name]) out.$c = name;
                else lost.push(`${where} (clase ${name || '?'})`);
            }
            for (const k of Object.keys(v)) out.$o[k] = enc(v[k], `${where}.${k}`);
            return out;
        };
        return { data: enc(root, 'root'), lost };
    },

    /** Lo contrario de encode, con el mismo ctx. */
    decode(data, ctx = {}) {
        const objs = new Map(), ext = this.externList(ctx);
        const dec = v => {
            if (v === null || typeof v !== 'object') return v;
            if (v.$u) return undefined;
            if ('$n' in v) return Number(v.$n);
            if ('$x' in v) return ext[v.$x];
            if ('$ref' in v) return objs.get(v.$ref);
            if (v.$a) { const a = []; objs.set(v.$i, a); for (const x of v.$a) a.push(dec(x)); return a; }
            if (v.$t) { const T = globalThis[v.$t] || Array; const a = T === Array ? v.$d.slice() : T.from(v.$d); objs.set(v.$i, a); return a; }
            if (v.$s) { const s = new Set(); objs.set(v.$i, s); for (const x of v.$s) s.add(dec(x)); return s; }
            if (v.$m) { const m = new Map(); objs.set(v.$i, m); for (const [k, x] of v.$m) m.set(dec(k), dec(x)); return m; }
            if ('$r' in v) { const r = (ctx.makeRng || makeRng)(1); r.load(v.$r); objs.set(v.$i, r); return r; }
            const C = v.$c && ctx.classes?.[v.$c];
            const o = C ? Object.create(C.prototype) : {};
            objs.set(v.$i, o);
            for (const k of Object.keys(v.$o || {})) o[k] = dec(v.$o[k]);
            return o;
        };
        return dec(data);
    },

    /** Todos los objetos que cuelgan de lo que es igual en todos los navegadores, con su número (siempre el mismo orden). */
    externList(ctx) {
        if (ctx._extList) return ctx._extList;
        const list = [], seen = new Set();
        const walk = v => {
            if (v === null || typeof v !== 'object' || seen.has(v)) return;
            seen.add(v);
            list.push(v);
            if (ArrayBuffer.isView(v) || v instanceof Set || v instanceof Map) return;
            for (const k of Object.keys(v)) walk(v[k]);
        };
        for (const [, root] of ctx.externs || []) walk(root);
        ctx._extList = list;
        return list;
    },
    externs(ctx) {
        if (ctx._ext) return ctx._ext;
        ctx._ext = new Map(this.externList(ctx).map((o, i) => [o, i]));
        return ctx._ext;
    },
};

if (typeof module !== 'undefined') module.exports = { Snapshot };
