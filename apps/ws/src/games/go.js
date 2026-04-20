import * as Sim from './go_sim.js';
import { normalizeRoomCode } from '../shared.js';
import {
  countConnectedPlayers,
  generateRoomIdUnique,
  nowMs,
  safeBroadcast,
  send,
} from './room_utils.js';

export function createGoHost() {
  const rooms = new Map(); // roomId -> { id, state, clients: [], updatedAt }

  const ROOM_EXPIRE_MS = 30 * 60 * 1000; // 30 minutes idle

  // Turn-based game: no simulation tick needed. This loop only handles room expiry.
  setInterval(() => {
    const now = nowMs();
    const toDelete = [];
    for (const [roomId, room] of rooms) {
      if (room.clients.length === 0 && now - room.updatedAt > ROOM_EXPIRE_MS) {
        toDelete.push(roomId);
      }
    }
    for (const id of toDelete) {
      rooms.delete(id);
      console.log(`[ws][go] Room ${id} expired`);
    }
  }, 5000);

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

    // Broadcast so other players see the disconnect.
    safeBroadcast(room, { type: 'state', state: room.state });

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

        // Idempotent re-join (same socket, same room).
        if (room.clients.includes(ws) && ws.playerId) {
          send(ws, { type: 'room_joined', roomId, playerId: ws.playerId, state: room.state });
          return;
        }

        // Leave previous room cleanly.
        if (ws.room && ws.room !== roomId) onClose(ws);

        // Assign next open player slot.
        let pid = null;
        for (const p of [1, 2, 3, 4]) {
          if (!room.state.players[p].connected) { pid = p; break; }
        }
        if (!pid) {
          send(ws, { type: 'error', message: 'Room full' });
          return;
        }

        if (!room.clients.includes(ws)) room.clients.push(ws);
        ws.room = roomId;
        ws.playerId = pid;
        Sim.setPlayerConnected(room.state, pid, true);
        room.updatedAt = nowMs();

        send(ws, { type: 'room_joined', roomId, playerId: pid, state: room.state });
        // Tell other clients a new player joined.
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      case 'select_color': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        const result = Sim.selectColor(room.state, ws.playerId, msg.color ?? null);
        if (!result.ok) {
          send(ws, { type: 'error', message: result.error });
          return;
        }
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      case 'place_stone': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        const result = Sim.placeStone(room.state, ws.playerId, Number(msg.x), Number(msg.y));
        if (!result.ok) {
          send(ws, { type: 'error', message: result.error });
          return;
        }
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      case 'pass_turn': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        const result = Sim.passTurn(room.state, ws.playerId);
        if (!result.ok) {
          send(ws, { type: 'error', message: result.error });
          return;
        }
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      case 'undo_move': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        const result = Sim.undoMove(room.state);
        if (!result.ok) {
          send(ws, { type: 'error', message: result.error });
          return;
        }
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      case 'restart': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        Sim.resetGame(room.state);
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      default:
        // Ignore unknown message types.
        break;
    }
  }

  return {
    gameId: 'go',
    onConnect,
    onClose,
    handleMessage,
  };
}
