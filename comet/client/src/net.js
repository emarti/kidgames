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

    // WebSocket endpoint selection:
    // - If VITE_WS_URL/VITE_API_URL is set, use it (e.g. ws://localhost:8080 for dev).
    // - Otherwise, default to localhost:8080 in dev.
    // - In production, use same-origin and a stable path behind the reverse proxy.
    const configuredUrl = import.meta.env.VITE_WS_URL ?? import.meta.env.VITE_API_URL;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const defaultDevUrl = 'ws://localhost:8080';
    const defaultProdUrl = `${protocol}://${window.location.host}/games/comet/ws`;
    const wsUrl = configuredUrl ?? (import.meta.env.DEV ? defaultDevUrl : defaultProdUrl);

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      this.connected = true;
      // Unified backend expects a hello handshake selecting the game.
      this.socket.send(JSON.stringify({ type: 'hello', gameId: 'comet', protocol: 1 }));
      this.dispatchEvent(new Event('connected'));
    };

    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('Net parse error', e);
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
      return;
    }

    if (msg.type === 'room_joined') {
      this.roomId = msg.roomId;
      this.playerId = msg.playerId;
      this.latestState = msg.state;
      this.dispatchEvent(new CustomEvent('room_joined', { detail: msg }));
      return;
    }

    if (msg.type === 'room_list') {
      this.dispatchEvent(new CustomEvent('room_list', { detail: msg.rooms }));
      return;
    }

    if (msg.type === 'error') {
      console.error('Server error:', msg.message);
      alert(msg.message);
    }
  }
}
