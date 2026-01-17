import { WebSocketServer } from 'ws';
import * as Sim from './sim.js';
import { make4DigitRoomId, nowMs } from './utils.js';

const wss = new WebSocketServer({ port: 8080 });

// Rooms: roomId -> { id, state, clients, updatedAt }
const rooms = new Map();

console.log('Maze server running on port 8080');

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const client of room.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function countConnectedPlayers(state) {
  let n = 0;
  for (const pid of [1, 2, 3, 4]) {
    if (state.players?.[pid]?.connected) n++;
  }
  return n;
}

function generateRoomIdUnique() {
  // Avoid collisions in the in-memory map.
  for (let i = 0; i < 1000; i++) {
    const id = make4DigitRoomId();
    if (!rooms.has(id)) return id;
  }
  // Worst-case fallback.
  return make4DigitRoomId();
}

// Fixed tick loop for all rooms (broadcast + time-based events)
setInterval(() => {
  const now = nowMs();
  const toDelete = [];

  for (const [roomId, room] of rooms) {
    if (room.clients.length === 0) {
      // 2 minutes expiry
      if (now - room.updatedAt > 120000) toDelete.push(roomId);
      continue;
    }

    room.updatedAt = now;
    Sim.step(room.state, now);
    broadcast(room, { type: 'state', state: room.state });
  }

  for (const id of toDelete) {
    rooms.delete(id);
    console.log(`Room ${id} expired`);
  }
}, 150);

wss.on('connection', (ws) => {
  ws.room = null;
  ws.playerId = null;

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      handleMessage(ws, msg);
    } catch (e) {
      console.error('Invalid message:', e);
    }
  });

  ws.on('close', () => {
    if (!ws.room) return;
    const room = rooms.get(ws.room);
    if (!room) return;

    room.clients = room.clients.filter((c) => c !== ws);

    if (ws.playerId) {
      Sim.setPlayerConnected(room.state, ws.playerId, false);
    }

    room.updatedAt = nowMs();
  });
});

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'get_rooms': {
      const list = [];
      for (const [id, r] of rooms) {
        list.push({ id, players: countConnectedPlayers(r.state) });
      }
      send(ws, { type: 'room_list', rooms: list });
      break;
    }

    case 'create_room': {
      const roomId = generateRoomIdUnique();
      const state = Sim.newGameState();
      const room = { id: roomId, state, clients: [ws], updatedAt: nowMs() };
      rooms.set(roomId, room);

      ws.room = roomId;
      ws.playerId = 1;
      Sim.setPlayerConnected(state, 1, true);

      send(ws, { type: 'room_joined', roomId, playerId: 1, state });
      break;
    }

    case 'join_room': {
      const requestedId = String(msg.roomId ?? '');
      if (!/^\d{4}$/.test(requestedId)) {
        send(ws, { type: 'error', message: 'Invalid room code (must be 4 digits)' });
        return;
      }

      // If the socket was previously in a room, leave it cleanly.
      if (ws.room && ws.room !== requestedId) {
        const prev = rooms.get(ws.room);
        if (prev) {
          prev.clients = prev.clients.filter((c) => c !== ws);
          if (ws.playerId) Sim.setPlayerConnected(prev.state, ws.playerId, false);
          prev.updatedAt = nowMs();
        }
        ws.room = null;
        ws.playerId = null;
      }

      const room = rooms.get(requestedId);
      if (!room) {
        send(ws, { type: 'error', message: 'Room not found' });
        return;
      }

      // Already joined this room: just re-send join info.
      if (room.clients.includes(ws) && ws.playerId) {
        send(ws, { type: 'room_joined', roomId: room.id, playerId: ws.playerId, state: room.state });
        return;
      }

      let pid = null;
      if (!room.state.players[1].connected) pid = 1;
      else if (!room.state.players[2].connected) pid = 2;
      else if (!room.state.players[3].connected) pid = 3;
      else if (!room.state.players[4].connected) pid = 4;

      if (!pid) {
        send(ws, { type: 'error', message: 'Room full' });
        return;
      }

      if (!room.clients.includes(ws)) room.clients.push(ws);
      ws.room = room.id;
      ws.playerId = pid;
      Sim.setPlayerConnected(room.state, pid, true);

      send(ws, { type: 'room_joined', roomId: room.id, playerId: pid, state: room.state });
      break;
    }

    case 'select_vision_mode': {
      if (!ws.room) return;
      const room = rooms.get(ws.room);
      if (!room) return;
      Sim.setVisionMode(room.state, msg.mode);
      break;
    }

    case 'select_avatar': {
      if (!ws.room || !ws.playerId) return;
      const room = rooms.get(ws.room);
      if (!room) return;
      Sim.trySelectAvatar(room.state, ws.playerId, msg.avatar);
      break;
    }

    case 'select_color': {
      if (!ws.room || !ws.playerId) return;
      const room = rooms.get(ws.room);
      if (!room) return;
      Sim.trySelectColor(room.state, ws.playerId, msg.color);
      break;
    }

    case 'restart': {
      if (!ws.room) return;
      const room = rooms.get(ws.room);
      if (!room) return;
      Sim.restart(room.state);
      break;
    }

    case 'pause': {
      if (!ws.room) return;
      const room = rooms.get(ws.room);
      if (!room) return;
      Sim.pause(room.state);
      break;
    }

    case 'resume': {
      if (!ws.room) return;
      const room = rooms.get(ws.room);
      if (!room) return;
      Sim.resume(room.state);
      break;
    }

    case 'input': {
      if (!ws.room) return;
      const room = rooms.get(ws.room);
      if (!room) return;
      Sim.applyInput(room.state, ws.playerId, msg.dir, nowMs());
      break;
    }

    default:
      // ignore unknown
      break;
  }
}
