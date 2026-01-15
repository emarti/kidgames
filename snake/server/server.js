import { WebSocketServer } from 'ws';
import * as Sim from './sim.js';

const wss = new WebSocketServer({ port: 8080 });

// Rooms: roomId -> { state, clients: [ws1, ws2], updatedAt }
const rooms = new Map();

console.log("Snake server running on port 8080");

function generateRoomId() {
  const chars = "0123456789";
  let result = "";
  for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const client of room.clients) {
    if (client.readyState === 1) { // OPEN
      client.send(data);
    }
  }
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// Fixed tick loop for all rooms
setInterval(() => {
  const now = Date.now();
  const toDelete = [];

  for (const [roomId, room] of rooms) {
    if (room.clients.length === 0) {
      // 2 minutes expiry
      if (now - room.updatedAt > 120000) {
        toDelete.push(roomId);
      }
      continue;
    } else {
      room.updatedAt = now;
    }

    Sim.step(room.state);

    // Broadcast state every tick (simple, robust)
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

  console.log("New client connected");

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      handleMessage(ws, msg);
    } catch (e) {
      console.error("Invalid message:", e);
    }
  });

  ws.on('close', () => {
    if (ws.room) {
      const r = rooms.get(ws.room);
      if (r) {
        // Remove client
        r.clients = r.clients.filter(c => c !== ws);

        // Notify sim
        if (ws.playerId) {
          Sim.setPlayerConnected(r.state, ws.playerId, false);
        }
        r.updatedAt = Date.now();

        // No auto-delete here, handled by interval
      }
    }
  });
});

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'get_rooms': {
      const list = [];
      for (const [id, r] of rooms) {
        list.push({
          id,
          players: r.clients.length
        });
      }
      send(ws, { type: 'room_list', rooms: list });
      break;
    }

    case 'create_room': {
      const roomId = generateRoomId();
      const state = Sim.newGameState();

      const room = {
        id: roomId,
        state,
        clients: [ws],
        updatedAt: Date.now()
      };
      rooms.set(roomId, room);

      ws.room = roomId;
      ws.playerId = 1;
      Sim.setPlayerConnected(state, 1, true);

      send(ws, { type: 'room_joined', roomId, playerId: 1, state });
      break;
    }

    case 'join_room': {
      const room = rooms.get(msg.roomId);
      if (!room) {
        send(ws, { type: 'error', message: 'Room not found' });
        return;
      }

      // Determine player ID
      let pid = null;
      if (!room.clients.includes(ws)) {
        // If room has < 2 clients, add this one.
        // Check who is connected in sim state?
        if (!room.state.players[1].connected) pid = 1;
        else if (!room.state.players[2].connected) pid = 2;
        else if (!room.state.players[3].connected) pid = 3;
        else if (!room.state.players[4].connected) pid = 4;
        else {
          send(ws, { type: 'error', message: 'Room full' });
          return;
        }

        room.clients.push(ws);
        ws.room = room.id;
        ws.playerId = pid;
        Sim.setPlayerConnected(room.state, pid, true);

        send(ws, { type: 'room_joined', roomId: room.id, playerId: pid, state: room.state });
      }
      break;
    }

    case 'input': {
      if (!ws.room) return;
      const r = rooms.get(ws.room);
      if (r && ws.playerId) {
        Sim.queueInput(r.state, ws.playerId, msg.dir);
      }
      break;
    }

    case 'pause': {
      if (!ws.room) return;
      const r = rooms.get(ws.room);
      if (r && ws.playerId) Sim.togglePause(r.state, ws.playerId);
      break;
    }

    case 'resume': { // "Resume game" button
      if (!ws.room) return;
      const r = rooms.get(ws.room);
      if (r && ws.playerId) {
        // If the player is "Dead" and stuck in countdown/waiting, effectively unpause them?
        // Actually, resume is explicit "I am ready".
        Sim.resumeGame(r.state, ws.playerId);
      }
      break;
    }

    case 'restart': { // "New game" button
      if (!ws.room) return;
      const r = rooms.get(ws.room);
      if (r) {
        const fresh = Sim.newGame(r.state);
        r.state = fresh;
      }
      break;
    }

    case 'select_speed': {
      if (!ws.room) return;
      const r = rooms.get(ws.room);
      if (r) Sim.tryLockSpeed(r.state, msg.speed);
      break;
    }

    case 'select_walls_mode': {
      if (!ws.room) return;
      const r = rooms.get(ws.room);
      if (r) Sim.setWallsMode(r.state, msg.mode);
      break;
    }

    case 'select_skin': {
      if (!ws.room) return;
      const r = rooms.get(ws.room);
      if (r && ws.playerId) Sim.trySelectSkin(r.state, ws.playerId, msg.skin);
      break;
    }

    case 'request_respawn': {
      if (!ws.room) return;
      const r = rooms.get(ws.room);
      if (r && ws.playerId) Sim.requestRespawn(r.state, ws.playerId);
      break;
    }

    default:
      console.log("Unknown msg", msg);
  }
}
