/* =============================================
   EL PEDRO — net.js
   Conexión entre jugadores con PeerJS (WebRTC):
   quien crea la sala abre una «mesa» con un código
   de 5 cifras y los demás se conectan directamente
   a su navegador. No hacen falta cuentas.
   ============================================= */
'use strict';

const NET_PREFIX = 'elpedro-';

const Net = {
    /** Servidor de rebote propio (TURN), leído de turn.json. null si no hay. */
    turn: null,
    turnLoaded: false,

    /** Lee turn.json una vez. Se pide sin caché: así se puede cambiar la contraseña sin subir la versión. */
    async loadTurn() {
        if (this.turnLoaded) return;
        this.turnLoaded = true;
        try {
            const r = await fetch(`turn.json?u=${Date.now()}`, { cache: 'no-store' });
            const t = r.ok ? await r.json() : null;
            if (t?.username && t?.credential && t?.urls?.length) this.turn = { urls: t.urls, username: t.username, credential: t.credential };
        } catch (_) { /* sin turn.json: se usan los servidores públicos */ }
    },

    /**
     * Opciones de PeerJS. Para pruebas se pueden cambiar en localStorage['elpedro.peer'].
     * relay: solo por el servidor de rebote (cuando la conexión directa no se une).
     */
    options({ relay = false } = {}) {
        let o = {};
        try { o = JSON.parse(localStorage.getItem('elpedro.peer') || '{}'); } catch (_) { o = {}; }
        // Para conectar dos casas distintas hacen falta servidores que digan a cada navegador cómo
        // le ven desde fuera (STUN) y, para las redes que no dejan conectar directamente (muchas de
        // datos móviles), un servidor de rebote (TURN) que pase los mensajes. Pocos servidores y
        // buenos: con muchos, la conexión tarda más en decidirse.
        const base = window.peerjs?.util?.defaultConfig || { iceServers: [] };
        const turn = this.turn ? [this.turn] : base.iceServers.filter(x => !String(x.urls).startsWith('stun:'));
        const config = {
            ...base,
            iceServers: [
                { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
                ...turn,
            ],
        };
        if (relay) config.iceTransportPolicy = 'relay';
        return { debug: 0, config, ...o };
    },
    available() { return typeof Peer === 'function'; },
    /** Si hay algún servidor de rebote (el de turn.json o el que trae PeerJS). */
    hasTurn() { return this.options().config.iceServers.some(s => [].concat(s.urls).some(u => /^turns?:/.test(u))); },
    /** Código de sala: 5 cifras, fácil de dictar y de escribir en el móvil. */
    newCode() { return String(10000 + Math.floor(Math.random() * 90000)); },
    explain(err) {
        const t = Net.kind(err);
        if (t === 'peer-unavailable') return 'No hay ninguna sala abierta con ese código. Comprueba el código y que quien creó la sala tiene el juego abierto en pantalla.';
        if (t === 'ice') return 'Se ha encontrado la sala, pero vuestras conexiones no han conseguido unirse, ni siquiera por el servidor de rebote. Usad los dos el botón Probar la conexión, en Jugar con amigos: os dirá qué falla.';
        if (t === 'timeout') return 'La sala no contesta. Comprueba que quien la creó tiene el juego abierto en pantalla, y vuelve a probar.';
        if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'No se ha podido conectar con el servidor de salas. Comprueba tu conexión a internet.';
        if (t === 'browser-incompatible') return 'Este navegador no permite jugar online.';
        return `No se ha podido conectar. Código del fallo: ${t || 'desconocido'}.`;
    },
    /**
     * Prueba la conexión: el servidor de salas, cómo te ven desde fuera y el servidor de rebote.
     * Devuelve { text, signal, srflx, relay }.
     */
    async diagnose() {
        await this.loadTurn();
        const out = { signal: false, host: false, srflx: false, relay: false, turn: this.hasTurn() };
        if (this.available()) {
            out.signal = await new Promise(resolve => {
                let peer;
                const done = ok => { clearTimeout(t); try { peer?.destroy(); } catch (_) { /* nada */ } resolve(ok); };
                const t = setTimeout(() => done(false), 9000);
                try {
                    peer = new Peer(this.options());
                    peer.on('open', () => done(true));
                    peer.on('error', () => done(false));
                } catch (_) { done(false); }
            });
        }
        if (typeof RTCPeerConnection === 'function') {
            await new Promise(resolve => {
                let pc;
                const done = () => { clearTimeout(t); try { pc?.close(); } catch (_) { /* nada */ } resolve(); };
                const t = setTimeout(done, 9000);
                try {
                    pc = new RTCPeerConnection({ iceServers: this.options().config.iceServers });
                    pc.createDataChannel('prueba');
                    pc.onicecandidate = e => {
                        if (!e.candidate) { done(); return; }
                        const type = e.candidate.type || / typ (\w+)/.exec(e.candidate.candidate)?.[1];
                        if (type) out[type] = true;
                        if (out.relay && out.srflx) done();
                    };
                    pc.createOffer().then(o => pc.setLocalDescription(o)).catch(done);
                } catch (_) { done(); }
            });
        }
        console.info('Prueba de conexión:', out);
        let text;
        if (!out.signal) text = 'No se llega al servidor de salas. Comprueba tu conexión a internet. Si estás en una red de empresa o de colegio, puede que no lo deje: prueba con los datos del móvil.';
        else if (out.relay) text = 'Todo bien: llegas al servidor de salas y al servidor de rebote. Puedes jugar con amigos de cualquier red.';
        else if (out.srflx && !out.turn) text = 'Tu conexión funciona, pero el juego no tiene servidor de rebote. Con amigos de tu misma red irá bien; con otras redes, como los datos del móvil, puede que no conecte.';
        else if (out.srflx) text = 'Llegas al servidor de salas, pero el servidor de rebote no contesta. Con amigos de tu misma red irá bien; con otras redes puede fallar. Avisa a quien cuida el juego: puede que la cuenta del servidor de rebote haya caducado.';
        else text = 'Llegas al servidor de salas, pero tu red no deja salir las conexiones del juego. Prueba con otra red, por ejemplo los datos del móvil.';
        return { text, ...out };
    },

    /** Tipo de fallo. Si la sala se encontró pero las conexiones no se unieron, PeerJS lo llama de varias formas: aquí todas son 'ice'. */
    kind(err) {
        const t = err?.type || '';
        return ['negotiation-failed', 'webrtc'].includes(t) ? 'ice' : t;
    },
};

/** La mesa de quien crea la sala. */
class HostNet {
    constructor({ onConnect, onMessage, onClose }) {
        this.onConnect = onConnect; this.onMessage = onMessage; this.onClose = onClose;
        this.peer = null; this.code = null;
        this.conns = new Set();
    }

    async open() {
        await Net.loadTurn();
        for (let attempt = 0; attempt < 5; attempt++) {
            const code = Net.newCode();
            try {
                await this.#tryOpen(code);
                this.code = code;
                return code;
            } catch (e) {
                if (e?.type !== 'unavailable-id') throw e;   // código ocupado: se prueba otro
            }
        }
        throw { type: 'unavailable-id' };
    }

    #tryOpen(code) {
        return new Promise((resolve, reject) => {
            const peer = new Peer(NET_PREFIX + code, Net.options());
            let done = false;
            const timer = setTimeout(() => { if (!done) { done = true; peer.destroy(); reject({ type: 'network' }); } }, 15000);
            peer.on('open', () => {
                if (done) return;
                done = true; clearTimeout(timer);
                if (this.closed) { peer.destroy(); reject({ type: 'cancelled' }); return; }
                this.peer = peer;
                peer.on('connection', conn => this.#accept(conn));
                // Si se pierde el servidor de salas, las conexiones abiertas siguen funcionando; se reintenta.
                peer.on('disconnected', () => { try { if (!peer.destroyed) peer.reconnect(); } catch (_) { /* nada */ } });
                resolve();
            });
            peer.on('error', err => {
                if (!done) { done = true; clearTimeout(timer); peer.destroy(); reject(err); }
            });
        });
    }

    #accept(conn) {
        conn.on('open', () => { this.conns.add(conn); this.onConnect?.(conn); });
        conn.on('data', d => { if (d && typeof d === 'object') this.onMessage?.(conn, d); });
        const gone = () => { if (this.conns.delete(conn)) this.onClose?.(conn); };
        conn.on('close', gone);
        conn.on('error', gone);
        // En algunos móviles la conexión muere sin avisar: se vigila el estado de WebRTC.
        const pc = conn.peerConnection;
        if (pc) pc.addEventListener('connectionstatechange', () => { if (['failed', 'closed'].includes(pc.connectionState)) gone(); });
    }

    send(conn, msg) { try { if (conn?.open) conn.send(msg); } catch (_) { /* conexión cerrada */ } }

    close() {
        this.closed = true;
        for (const c of this.conns) { try { c.close(); } catch (_) { /* nada */ } }
        this.conns.clear();
        try { this.peer?.destroy(); } catch (_) { /* nada */ }
        this.peer = null;
    }
}

/** La conexión de quien se une a una sala. */
class ClientNet {
    constructor({ onMessage, onClose }) {
        this.onMessage = onMessage; this.onClose = onClose;
        this.peer = null; this.conn = null; this.closed = false;
    }

    /**
     * Se une a la sala. Si no la encuentra, lo reintenta un par de veces (quien la creó puede estar
     * reconectando). Si la encuentra pero las conexiones no se unen, lo intenta solo por el servidor
     * de rebote, que funciona con casi todas las redes.
     */
    async connect(code, { onRetry = null } = {}) {
        await Net.loadTurn();
        let relay = false;
        for (let attempt = 0; ; attempt++) {
            try { return await this.#connectOnce(code, relay); } catch (e) {
                const kind = Net.kind(e);
                if (this.closed || attempt >= 3 || !['peer-unavailable', 'ice', 'timeout'].includes(kind)) throw e;
                if (kind === 'ice' && !relay && Net.hasTurn()) { relay = true; onRetry?.('No se unen las conexiones directamente. Probando por el servidor de rebote…'); }
                else if (kind === 'ice' && relay) throw e;
                else onRetry?.('Buscando la sala otra vez…');
                await new Promise(r => setTimeout(r, kind === 'ice' ? 500 : 2500));
                if (this.closed) throw e;
            }
        }
    }

    #connectOnce(code, relay = false) {
        return new Promise((resolve, reject) => {
            const peer = this.peer = new Peer(Net.options({ relay }));
            let done = false, found = false;
            const fail = err => { if (!done) { done = true; clearTimeout(timer); this.#teardown(); reject(err); } };
            // Por un servidor de rebote la conexión puede tardar: se espera hasta 25 segundos.
            const timer = setTimeout(() => fail({ type: found ? 'ice' : 'timeout' }), 25000);
            peer.on('error', fail);
            peer.on('open', () => {
                found = true;
                const conn = this.conn = peer.connect(NET_PREFIX + code, { reliable: true, serialization: 'json' });
                let joined = false;
                conn.on('open', () => { if (!done) { done = joined = true; clearTimeout(timer); resolve(); } });
                conn.on('data', d => { if (d && typeof d === 'object') this.onMessage?.(d); });
                // Solo se avisa de que se ha perdido la sala si ya estabas dentro (un intento fallido no cuenta).
                const gone = () => { if (joined && !this.closed) { this.closed = true; this.onClose?.(); } };
                conn.on('close', gone);
                conn.on('error', e => { if (!done) fail(e); else gone(); });
                const watch = () => {
                    const pc = conn.peerConnection;
                    if (pc) pc.addEventListener('connectionstatechange', () => {
                        if (pc.connectionState === 'failed' && !done) fail({ type: 'ice' });
                        else if (['failed', 'closed'].includes(pc.connectionState)) gone();
                    });
                };
                setTimeout(watch, 0);
            });
            peer.on('disconnected', () => { try { if (!peer.destroyed && !this.closed) peer.reconnect(); } catch (_) { /* nada */ } });
        });
    }

    send(msg) { try { if (this.conn?.open) this.conn.send(msg); } catch (_) { /* conexión cerrada */ } }

    close() {
        this.closed = true;
        this.#teardown();
    }

    #teardown() {
        const conn = this.conn, peer = this.peer;
        this.conn = null; this.peer = null;
        try { conn?.close(); } catch (_) { /* nada */ }
        try { peer?.destroy(); } catch (_) { /* nada */ }
    }
}
