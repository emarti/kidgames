import * as Sim from './submarine_sim.js';
import { normalizeRoomCode } from '../shared.js';
import { countConnectedPlayers, generateRoomIdUnique, nowMs, pickOpenPlayerId, safeBroadcast, send } from './room_utils.js';

export function createSubmarineHost() {
  const rooms = new Map(); // roomId -> { id, state, clients: [], updatedAt }
  const ROOM_EXPIRE_MS = 10 * 60 * 1000;
  const TICK_MS = 50;

  setInterval(() => {
    const now = nowMs();
    const toDelete = [];

    for (const [roomId, room] of rooms) {
      if (room.clients.length === 0) {
        if (now - room.updatedAt > ROOM_EXPIRE_MS) toDelete.push(roomId);
        continue;
      }

      room.updatedAt = now;
      const didUpdate = Sim.step(room.state, now);
      if (didUpdate) safeBroadcast(room, { type: 'state', state: room.state });
    }

    for (const id of toDelete) {
      rooms.delete(id);
      console.log(`[ws][submarine] Room ${id} expired`);
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

    room.clients = room.clients.filter((client) => client !== ws);
    if (ws.playerId) Sim.setPlayerConnected(room.state, ws.playerId, false);
    room.updatedAt = nowMs();
    safeBroadcast(room, { type: 'state', state: room.state });

    ws.room = null;
    ws.playerId = null;
  }

  function handleMessage(ws, msg) {
    switch (msg.type) {
      case 'get_rooms': {
        const list = [];
        for (const [id, room] of rooms) {
          list.push({ id, players: countConnectedPlayers(room.state) });
        }
        send(ws, { type: 'room_list', rooms: list });
        break;
      }

      case 'create_room': {
        const roomId = generateRoomIdUnique(rooms);
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

        if (room.clients.includes(ws) && ws.playerId) {
          ws.room = roomId;
          send(ws, { type: 'room_joined', roomId, playerId: ws.playerId, state: room.state });
          return;
        }

        if (ws.room && ws.room !== roomId) onClose(ws);

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
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      case 'pause': {
        const room = ws.room ? rooms.get(ws.room) : null;
        if (room && ws.playerId) {
          Sim.pauseGame(room.state, ws.playerId);
          safeBroadcast(room, { type: 'state', state: room.state });
        }
        break;
      }

      case 'resume': {
        const room = ws.room ? rooms.get(ws.room) : null;
        if (room && ws.playerId) {
          Sim.resumeGame(room.state, ws.playerId);
          safeBroadcast(room, { type: 'state', state: room.state });
        }
        break;
      }

      case 'restart': {
        const room = ws.room ? rooms.get(ws.room) : null;
        if (room) {
          Sim.restart(room.state);
          safeBroadcast(room, { type: 'state', state: room.state });
        }
        break;
      }

      case 'select_role': {
        const room = ws.room ? rooms.get(ws.room) : null;
        if (room && ws.playerId && Sim.selectRole(room.state, ws.playerId, msg.role)) {
          safeBroadcast(room, { type: 'state', state: room.state });
        }
        break;
      }

      case 'select_team': {
        const room = ws.room ? rooms.get(ws.room) : null;
        if (room && ws.playerId && Sim.selectTeam(room.state, ws.playerId, msg.team)) {
          safeBroadcast(room, { type: 'state', state: room.state });
        }
        break;
      }

      case 'select_visibility': {
        const room = ws.room ? rooms.get(ws.room) : null;
        if (room && Sim.selectVisibilityMode(room.state, msg.mode)) {
          safeBroadcast(room, { type: 'state', state: room.state });
        }
        break;
      }

      case 'set_fog': {
        const room = ws.room ? rooms.get(ws.room) : null;
        if (room && Sim.selectVisibilityMode(room.state, msg.enabled ? 'low' : 'clear')) {
          safeBroadcast(room, { type: 'state', state: room.state });
        }
        break;
      }

      case 'input': {
        const room = ws.room ? rooms.get(ws.room) : null;
        if (room && ws.playerId) Sim.applyInput(room.state, ws.playerId, msg);
        break;
      }

      default:
        break;
    }
  }

  return {
    gameId: 'submarine',
    onConnect,
    onClose,
    handleMessage,
  };
}
