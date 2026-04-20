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

  _normalizeWsUrl(configuredUrl) {
    if (!configuredUrl) return null;
    let u = String(configuredUrl);
    if (u.startsWith('http://'))  u = 'ws://'  + u.slice('http://'.length);
    if (u.startsWith('https://')) u = 'wss://' + u.slice('https://'.length);
    try {
      const url = new URL(u);
      const p = url.pathname || '/';
      if (!/\/ws\/?$/.test(p) && !/\/ws\//.test(p)) {
        url.pathname = '/games/gameroom/ws';
      }
      u = url.toString();
    } catch {
      // leave as-is if URL parsing fails
    }
    return u;
  }

  _flushOutbox() {
    if (!this.socket || !this.ready) return;
    while (this._outbox.length > 0) {
      const msg = this._outbox.shift();
      try {
        this.socket.send(JSON.stringify(msg));
      } catch {
        break;
      }
    }
  }

  connect() {
    if (this.socket) return;

    const configuredUrlRaw = import.meta.env.VITE_WS_URL ?? import.meta.env.VITE_API_URL;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const defaultDevUrl  = 'ws://localhost:8080';
      const defaultProdUrl = `${protocol}://${window.location.host}/games/gameroom/ws`;
    const configuredUrl  = this._normalizeWsUrl(configuredUrlRaw);
    const wsUrl = configuredUrl ?? (import.meta.env.DEV ? defaultDevUrl : defaultProdUrl);

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      this.connected = true;
      this.ready = false;
      this.socket.send(JSON.stringify({ type: 'hello', gameId: 'gameroom', protocol: 1 }));
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
    if (!this.ready && type !== 'hello') {
      this._outbox.push(msg);
      return;
    }
    this.socket.send(JSON.stringify(msg));
  }

  _handleMessage(msg) {
    if (msg.type === 'hello_ack') {
      this.ready = true;
      this.dispatchEvent(new Event('connected'));
      this._flushOutbox();
    } else if (msg.type === 'state') {
      this.latestState = msg.state;
      this.dispatchEvent(new CustomEvent('state', { detail: msg.state }));
    } else if (msg.type === 'room_joined') {
      this.roomId  = msg.roomId;
      this.playerId = msg.playerId;
      this.latestState = msg.state;
      this.dispatchEvent(new CustomEvent('room_joined', { detail: msg }));
    } else if (msg.type === 'room_list') {
      this.dispatchEvent(new CustomEvent('room_list', { detail: msg.rooms }));
    } else if (msg.type === 'hint') {
      this.dispatchEvent(new CustomEvent('hint', { detail: msg }));
    } else if (msg.type === 'error') {
      console.error('Server error:', msg.message);
      this.dispatchEvent(new CustomEvent('server_error', { detail: msg.message }));
    }
  }
}
