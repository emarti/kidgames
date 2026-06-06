export class Net extends EventTarget {
    constructor() {
        super();
        this.socket = null;
        this.connected = false;
        this.ready = false;
        this._outbox = [];
        this.playerId = null;
        this.roomId = null;
        this.latestState = null;
    }

    connect() {
        if (this.socket) return;

        const configuredUrlRaw = import.meta.env.VITE_WS_URL ?? import.meta.env.VITE_API_URL;
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const defaultDevUrl = 'ws://localhost:8080';
        const defaultProdUrl = `${protocol}://${window.location.host}/games/pacfriends/ws`;

        let wsUrl = defaultProdUrl;
        if (configuredUrlRaw) {
            let u = String(configuredUrlRaw);
            if (u.startsWith('http://')) u = 'ws://' + u.slice(7);
            if (u.startsWith('https://')) u = 'wss://' + u.slice(8);
            try {
                const url = new URL(u);
                if (!/\/ws\/?$/.test(url.pathname)) url.pathname = '/games/pacfriends/ws';
                wsUrl = url.toString();
            } catch {
                wsUrl = u;
            }
        } else if (import.meta.env.DEV) {
            wsUrl = defaultDevUrl;
        }

        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            this.connected = true;
            this.ready = false;
            this.socket.send(JSON.stringify({ type: 'hello', gameId: 'pacfriends', protocol: 1 }));
            this.dispatchEvent(new Event('connected'));
        };

        this.socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this._handleMessage(msg);
            } catch (e) {
                console.error('Net parse error', e);
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
        if (!this.ready) {
            this._outbox.push(msg);
            return;
        }
        try { this.socket.send(JSON.stringify(msg)); } catch { /* ignore */ }
    }

    _flushOutbox() {
        if (!this.socket || !this.ready) return;
        while (this._outbox.length > 0) {
            const msg = this._outbox.shift();
            try { this.socket.send(JSON.stringify(msg)); } catch { break; }
        }
    }

    _handleMessage(msg) {
        if (msg.type === 'hello_ack') {
            this.ready = true;
            this._flushOutbox();
            return;
        }
        if (msg.type === 'room_joined') {
            this.playerId = msg.playerId;
            this.roomId = msg.roomId;
            if (msg.state) this.latestState = msg.state;
            this.dispatchEvent(new CustomEvent('room_joined', { detail: msg }));
            return;
        }
        if (msg.type === 'state') {
            this.latestState = msg.state;
            this.dispatchEvent(new CustomEvent('state', { detail: msg.state }));
            return;
        }
        if (msg.type === 'room_list') {
            this.dispatchEvent(new CustomEvent('room_list', { detail: msg.rooms }));
            return;
        }
        if (msg.type === 'error') {
            this.dispatchEvent(new CustomEvent('net_error', { detail: msg.message }));
            return;
        }
    }
}
