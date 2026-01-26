export class Net extends EventTarget {
    constructor() {
        super();
        this.socket = null;
        this.connected = false;
        this.ready = false; // hello_ack received
        this._outbox = [];
        this.playerId = null;
        this.roomId = null;
        this.latestState = null;
    }

    normalizeWsUrl_(configuredUrl) {
        if (!configuredUrl) return null;
        let u = String(configuredUrl);

        // If an HTTP(S) base URL is provided, convert to WS(S) and append path.
        if (u.startsWith('http://')) u = 'ws://' + u.slice('http://'.length);
        if (u.startsWith('https://')) u = 'wss://' + u.slice('https://'.length);

        // If it doesn't explicitly include a WS path, treat it as an origin/base
        // and force the canonical snake WS endpoint.
        // Examples that should work:
        // - VITE_API_URL=https://example.com
        // - VITE_API_URL=https://example.com/games
        // - VITE_WS_URL=ws://localhost:8080
        // - VITE_WS_URL=ws://localhost:8080/games/snake/ws
        try {
            const url = new URL(u);
            const p = url.pathname || '/';
            const hasWsPath = /\/ws\/?$/.test(p) || /\/ws\//.test(p);
            if (!hasWsPath) {
                url.pathname = '/games/snake/ws';
            }
            u = url.toString();
        } catch {
            // If URL parsing fails (e.g. relative), just use it as-is.
        }

        return u;
    }

    flushOutbox_() {
        if (!this.socket || !this.ready) return;
        while (this._outbox.length > 0) {
            const msg = this._outbox.shift();
            try {
                this.socket.send(JSON.stringify(msg));
            } catch {
                // If sending fails, stop flushing.
                break;
            }
        }
    }

    connect() {
        if (this.socket) return;

        // WebSocket endpoint selection:
        // - If VITE_API_URL is set, use it (e.g. ws://localhost:8080 for dev).
        // - Otherwise, default to localhost:8080 in dev.
        // - In production, use same-origin and a stable path behind the reverse proxy.
        const configuredUrlRaw = import.meta.env.VITE_WS_URL ?? import.meta.env.VITE_API_URL;
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const defaultDevUrl = 'ws://localhost:8080';
        const defaultProdUrl = `${protocol}://${window.location.host}/games/snake/ws`;
        const configuredUrl = this.normalizeWsUrl_(configuredUrlRaw);
        const wsUrl = configuredUrl ?? (import.meta.env.DEV ? defaultDevUrl : defaultProdUrl);

        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            this.connected = true;
            this.ready = false;
            // Unified backend expects a hello handshake selecting the game.
            this.socket.send(JSON.stringify({ type: 'hello', gameId: 'snake', protocol: 1 }));
            console.log("WS Open (handshaking)");
        };

        this.socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleMessage(msg);
            } catch (e) {
                console.error("Net parse error", e);
            }
        };

        this.socket.onclose = () => {
            this.connected = false;
            this.ready = false;
            this._outbox = [];
            this.socket = null;
            this.dispatchEvent(new Event('disconnected'));
        };
    }

    send(type, payload = {}) {
        if (!this.socket || !this.connected) return;
        const msg = { type, ...payload };
        // Queue until hello_ack so create/join can't race the handshake.
        if (!this.ready && type !== 'hello') {
            this._outbox.push(msg);
            return;
        }
        this.socket.send(JSON.stringify(msg));
    }

    handleMessage(msg) {
        if (msg.type === 'hello_ack') {
            this.ready = true;
            console.log('WS Connected');
            this.dispatchEvent(new Event('connected'));
            this.flushOutbox_();
        } else if (msg.type === 'state') {
            this.latestState = msg.state;
            this.dispatchEvent(new CustomEvent('state', { detail: msg.state }));
        } else if (msg.type === 'room_joined') {
            this.roomId = msg.roomId;
            this.playerId = msg.playerId;
            this.latestState = msg.state;
            this.dispatchEvent(new CustomEvent('room_joined', { detail: msg }));
        } else if (msg.type === 'room_list') {
            this.dispatchEvent(new CustomEvent('room_list', { detail: msg.rooms }));
        } else if (msg.type === 'error') {
            console.error("Server error:", msg.message);
            alert(msg.message);
        }
    }
}
