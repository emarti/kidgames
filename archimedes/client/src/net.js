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

    const configuredUrl = import.meta.env.VITE_WS_URL ?? import.meta.env.VITE_API_URL;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const defaultDevUrl = 'ws://localhost:8080';
    const defaultProdUrl = `${protocol}://${window.location.host}/games/archimedes/ws`;
    const wsUrl = configuredUrl ?? (import.meta.env.DEV ? defaultDevUrl : defaultProdUrl);

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      this.connected = true;
      // Unified backend expects a hello handshake selecting the game.
      this.socket.send(JSON.stringify({ type: 'hello', gameId: 'archimedes', protocol: 1 }));
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

  // Convenience method for sending input actions
  sendInput(action, data = {}) {
    this.send('input', { action, ...data });
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
      console.error('Server error:', msg.message);
      alert(msg.message);
    }
  }
}
