import * as Sim from './snake_sim.js';
import { normalizeRoomCode } from '../shared.js';
import { countConnectedPlayers, generateRoomIdUnique, nowMs, safeBroadcast, send } from './room_utils.js';

export function createSnakeHost() {
  const rooms = new Map(); // roomId -> { id, state, clients: [], updatedAt }

  const ROOM_EXPIRE_MS = 10 * 60 * 1000;

  function generateRoomIdUniqueForHost() {
    return generateRoomIdUnique(rooms);
  }

  // Fixed tick loop for all snake rooms.
  // NOTE: The snake sim uses integer ticks-per-move; using a smaller host tick
  // interval allows a wider range of speeds (e.g. very_fast) while preserving
  // the existing slow/medium/fast timings.
  setInterval(() => {
    const now = nowMs();
    const toDelete = [];

    for (const [roomId, room] of rooms) {
      if (room.clients.length === 0) {
        if (now - room.updatedAt > ROOM_EXPIRE_MS) toDelete.push(roomId);
        continue;
      }

      room.updatedAt = now;
      const didUpdate = Sim.step(room.state);
      if (didUpdate) safeBroadcast(room, { type: 'state', state: room.state });
    }

    for (const id of toDelete) {
      rooms.delete(id);
      console.log(`[ws][snake] Room ${id} expired`);
    }
  }, 75);

  function onConnect(ws) {
    ws.room = null;
    ws.playerId = null;
  }

  function onClose(ws) {
    if (!ws.room) return;
    const room = rooms.get(ws.room);
    if (!room) return;

    room.clients = room.clients.filter((c) => c !== ws);
    if (ws.playerId) Sim.setPlayerConnected(room.state, ws.playerId, false);
    room.updatedAt = nowMs();

    ws.room = null;
    ws.playerId = null;
  }

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
        const roomId = generateRoomIdUniqueForHost();
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
        const roomId = normalizeRoomCode(msg.roomId);
        if (!roomId) {
          send(ws, { type: 'error', message: 'Invalid room code (must be 4 digits)' });
          return;
        }

        const room = rooms.get(roomId);
        if (!room) {
          send(ws, { type: 'error', message: 'Room not found' });
          return;
        }

        // Idempotent join: if this socket is already in the room, just re-ack.
        if (room.clients.includes(ws) && ws.playerId) {
          ws.room = roomId;
          send(ws, { type: 'room_joined', roomId, playerId: ws.playerId, state: room.state });
          return;
        }

        if (ws.room && ws.room !== roomId) {
          // Leave previous room cleanly
          onClose(ws);
        }

        // Determine player ID
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
        ws.room = roomId;
        ws.playerId = pid;
        Sim.setPlayerConnected(room.state, pid, true);

        send(ws, { type: 'room_joined', roomId, playerId: pid, state: room.state });
        break;
      }

      case 'input': {
        if (!ws.room) return;
        const r = rooms.get(ws.room);
        if (r && ws.playerId) Sim.queueInput(r.state, ws.playerId, msg.dir);
        break;
      }

      case 'pause': {
        if (!ws.room) return;
        const r = rooms.get(ws.room);
        if (r && ws.playerId) {
          Sim.togglePause(r.state, ws.playerId);
          // Ensure clients update overlays immediately.
          safeBroadcast(r, { type: 'state', state: r.state });
        }
        break;
      }

      case 'resume': {
        if (!ws.room) return;
        const r = rooms.get(ws.room);
        if (r && ws.playerId) {
          Sim.resumeGame(r.state, ws.playerId);
          // Ensure clients update overlays immediately.
          safeBroadcast(r, { type: 'state', state: r.state });
        }
        break;
      }

      case 'restart': {
        if (!ws.room) return;
        const r = rooms.get(ws.room);
        if (r) {
          r.state = Sim.newGame(r.state);
          safeBroadcast(r, { type: 'state', state: r.state });
        }
        break;
      }

      case 'select_speed': {
        if (!ws.room) return;
        const r = rooms.get(ws.room);
        if (r) {
          const changed = Sim.tryLockSpeed(r.state, msg.speed);
          if (changed) safeBroadcast(r, { type: 'state', state: r.state });
        }
        break;
      }

      case 'select_walls_mode': {
        if (!ws.room) return;
        const r = rooms.get(ws.room);
        if (r) {
          const changed = Sim.setWallsMode(r.state, msg.mode);
          if (changed) safeBroadcast(r, { type: 'state', state: r.state });
        }
        break;
      }

      case 'select_skin': {
        if (!ws.room) return;
        const r = rooms.get(ws.room);
        if (r && ws.playerId) {
          const res = Sim.trySelectSkin(r.state, ws.playerId, msg.skin);
          if (res && res.ok) safeBroadcast(r, { type: 'state', state: r.state });
        }
        break;
      }

      case 'request_respawn': {
        if (!ws.room) return;
        const r = rooms.get(ws.room);
        if (r && ws.playerId) {
          Sim.requestRespawn(r.state, ws.playerId);
          safeBroadcast(r, { type: 'state', state: r.state });
        }
        break;
      }

      default:
        // ignore unknown
        break;
    }
  }

  return {
    gameId: 'snake',
    onConnect,
    onClose,
    handleMessage,
  };
}
