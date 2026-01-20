import * as Sim from './comet_sim.js';
import { normalizeRoomCode } from '../shared.js';
import { countConnectedPlayers, generateRoomIdUnique, nowMs, pickOpenPlayerId, safeBroadcast, send } from './room_utils.js';

export function createCometHost() {
  const rooms = new Map(); // roomId -> { id, state, clients: [], updatedAt }

  const ROOM_EXPIRE_MS = 10 * 60 * 1000;
  const TICK_MS = 50; // smoother than snake/maze; still lightweight

  function generateRoomIdUniqueForHost() {
    return generateRoomIdUnique(rooms);
  }

  // Fixed tick loop for all comet rooms
  setInterval(() => {
    const now = nowMs();
    const toDelete = [];

    for (const [roomId, room] of rooms) {
      if (room.clients.length === 0) {
        if (now - room.updatedAt > ROOM_EXPIRE_MS) toDelete.push(roomId);
        continue;
      }

      room.updatedAt = now;
      Sim.step(room.state, now);
      safeBroadcast(room, { type: 'state', state: room.state });
    }

    for (const id of toDelete) {
      rooms.delete(id);
      console.log(`[ws][comet] Room ${id} expired`);
    }
  }, TICK_MS);

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
        const state = Sim.newGameState({ now: nowMs() });
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

        // Idempotent join
        if (room.clients.includes(ws) && ws.playerId) {
          ws.room = roomId;
          send(ws, { type: 'room_joined', roomId, playerId: ws.playerId, state: room.state });
          return;
        }

        if (ws.room && ws.room !== roomId) {
          onClose(ws);
        }

        const pid = pickOpenPlayerId(room.state);
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

      case 'pause': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (room && ws.playerId) Sim.togglePause(room.state, ws.playerId);
        break;
      }

      case 'resume': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (room && ws.playerId) Sim.resumeGame(room.state, ws.playerId);
        break;
      }

      case 'restart': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (room) room.state = Sim.newGame(room.state, nowMs());
        break;
      }

      case 'select_topology': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (room) Sim.setTopology(room.state, msg.mode);
        break;
      }

      case 'select_color': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (room) Sim.trySelectColor(room.state, ws.playerId, msg.color);
        break;
      }

      case 'select_shape': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (room) Sim.trySelectShape(room.state, ws.playerId, msg.shape);
        break;
      }

      case 'input': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        Sim.applyInput(room.state, ws.playerId, {
          turn: msg.turn,
          thrust: msg.thrust,
          brake: msg.brake,
          shoot: msg.shoot,
        });
        break;
      }

      default:
        break;
    }
  }

  return {
    gameId: 'comet',
    onConnect,
    onClose,
    handleMessage,
  };
}
