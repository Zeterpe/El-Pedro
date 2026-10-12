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
    /** Opciones de PeerJS. Para pruebas se pueden cambiar en localStorage['elpedro.peer']. */
    options() {
        let o = {};
        try { o = JSON.parse(localStorage.getItem('elpedro.peer') || '{}'); } catch (_) { o = {}; }
        // Para conectar dos casas distintas hacen falta servidores que digan a cada navegador cómo
        // le ven desde fuera (STUN). Se añaden varios públicos a los que trae PeerJS (que incluyen
        // su servidor de rebote, TURN, para cuando no se puede conectar directamente).
        const base = window.peerjs?.util?.defaultConfig || { iceServers: [] };
        const config = {
            ...base,
            iceServers: [
                { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
                { urls: 'stun:stun.cloudflare.com:3478' },
                ...base.iceServers.filter(x => !String(x.urls).startsWith('stun:')),
            ],
        };
        return { debug: 0, config, ...o };
    },
    available() { return typeof Peer === 'function'; },
    /** Código de sala: 5 cifras, fácil de dictar y de escribir en el móvil. */
    newCode() { return String(10000 + Math.floor(Math.random() * 90000)); },
    explain(err) {
        const t = Net.kind(err);
        if (t === 'peer-unavailable') return 'No hay ninguna sala abierta con ese código. Comprueba el código y que quien creó la sala tiene el juego abierto en pantalla.';
        if (t === 'ice') return 'Se ha encontrado la sala, pero vuestras conexiones no han conseguido unirse. Probad otra vez; si sigue fallando, probad con otra red, por ejemplo los datos del móvil.';
        if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'No se ha podido conectar con el servidor de salas. Comprueba tu conexión a internet.';
        if (t === 'browser-incompatible') return 'Este navegador no permite jugar online.';
        return `No se ha podido conectar. Código del fallo: ${t || 'desconocido'}.`;
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

    /** Se une a la sala. Si no la encuentra, lo reintenta un par de veces (quien la creó puede estar reconectando). */
    async connect(code) {
        for (let attempt = 0; ; attempt++) {
            try { return await this.#connectOnce(code); } catch (e) {
                if (this.closed || attempt >= 2 || !['peer-unavailable', 'ice'].includes(Net.kind(e))) throw e;
                await new Promise(r => setTimeout(r, 2500));
                if (this.closed) throw e;
            }
        }
    }

    #connectOnce(code) {
        return new Promise((resolve, reject) => {
            const peer = this.peer = new Peer(Net.options());
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
