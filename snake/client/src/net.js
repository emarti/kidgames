export class Net extends EventTarget {
    constructor() {
        super();
        this.socket = null;
        this.connected = false;
        this.playerId = null;
        this.roomId = null;
        this.latestState = null;
    }

    connect() {
        if (this.socket) return;

        // Assume localhost for now, or infer from window.location
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const host = window.location.hostname;
        const port = '8080'; // Hardcoded for dev
        this.socket = new WebSocket(`${protocol}://${host}:${port}`);

        this.socket.onopen = () => {
            this.connected = true;
            console.log("WS Connected");
            this.dispatchEvent(new Event('connected'));
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
            this.dispatchEvent(new Event('disconnected'));
        };
    }

    send(type, payload = {}) {
        if (!this.connected) return;
        this.socket.send(JSON.stringify({ type, ...payload }));
    }

    handleMessage(msg) {
        if (msg.type === 'state') {
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
