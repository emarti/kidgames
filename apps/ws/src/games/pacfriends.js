import * as Sim from './pacfriends_sim.js';
import { normalizeRoomCode } from '../shared.js';
import { countConnectedPlayers, generateRoomIdUnique, nowMs, safeBroadcast, send } from './room_utils.js';

export function createPacfriendsHost() {
  const rooms = new Map(); // roomId -> { id, state, clients: [], updatedAt }
  const ROOM_EXPIRE_MS = 10 * 60 * 1000;
  const TICK_MS = 50;

  function generateRoomId() {
    return generateRoomIdUnique(rooms);
  }

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
      if (didUpdate) {
        safeBroadcast(room, { type: 'state', state: room.state });
      }
    }

    for (const id of toDelete) {
      rooms.delete(id);
      console.log(`[ws][pacfriends] Room ${id} expired`);
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

    room.clients = room.clients.filter(c => c !== ws);
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
        for (const [id, r] of rooms) {
          list.push({ id, players: countConnectedPlayers(r.state) });
        }
        send(ws, { type: 'room_list', rooms: list });
        break;
      }

      case 'create_room': {
        const roomId = generateRoomId();
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
          send(ws, { type: 'room_joined', roomId, playerId: ws.playerId, state: room.state });
          return;
        }
        if (ws.room && ws.room !== roomId) onClose(ws);

        let pid = null;
        for (const id of [1, 2, 3, 4]) {
          if (!room.state.players[id].connected) { pid = id; break; }
        }
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
          Sim.pauseGame(r.state, ws.playerId);
          safeBroadcast(r, { type: 'state', state: r.state });
        }
        break;
      }

      case 'resume': {
        if (!ws.room) return;
        const r = rooms.get(ws.room);
        if (r && ws.playerId) {
          Sim.resumeGame(r.state, ws.playerId);
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

      case 'select_color': {
        if (!ws.room) return;
        const r = rooms.get(ws.room);
        if (r && ws.playerId) {
          const ok = Sim.setPlayerColor(r.state, ws.playerId, msg.color);
          if (ok) safeBroadcast(r, { type: 'state', state: r.state });
        }
        break;
      }

      case 'select_decoration': {
        if (!ws.room) return;
        const r = rooms.get(ws.room);
        if (r && ws.playerId) {
          const ok = Sim.setPlayerDecoration(r.state, ws.playerId, msg.decoration);
          if (ok) safeBroadcast(r, { type: 'state', state: r.state });
        }
        break;
      }

      case 'select_difficulty': {
        if (!ws.room) return;
        const r = rooms.get(ws.room);
        if (r) {
          const ok = Sim.setDifficulty(r.state, msg.difficulty);
          if (ok) safeBroadcast(r, { type: 'state', state: r.state });
        }
        break;
      }

      case 'select_speed': {
        if (!ws.room) return;
        const r = rooms.get(ws.room);
        if (r) {
          const ok = Sim.setSpeed(r.state, msg.speed);
          if (ok) safeBroadcast(r, { type: 'state', state: r.state });
        }
        break;
      }

      case 'select_level': {
        if (!ws.room) return;
        const r = rooms.get(ws.room);
        if (!r) return;
        const ok = Sim.setLevel(r.state, msg.level);
        if (!ok) return;
        // If still in lobby, rebuild the game state with the new level's tiles
        if (r.state.paused && r.state.reasonPaused === 'start') {
          const prev = r.state;
          const fresh = Sim.newGameState({ level: msg.level, difficulty: prev.difficulty, speed: prev.speed });
          for (const pid of [1, 2, 3, 4]) {
            fresh.players[pid].color = prev.players[pid].color;
            fresh.players[pid].decoration = prev.players[pid].decoration;
            if (prev.players[pid].connected) Sim.setPlayerConnected(fresh, pid, true);
          }
          r.state = fresh;
        }
        safeBroadcast(r, { type: 'state', state: r.state });
        break;
      }

      case 'next_level': {
        if (!ws.room) return;
        const r = rooms.get(ws.room);
        if (r && r.state.reasonPaused === 'levelcomplete') {
          const prev = r.state;
          const nextLevel = prev.level + 1;
          const next = Sim.newGameState({ level: nextLevel, difficulty: prev.difficulty, speed: prev.speed });
          for (const pid of [1, 2, 3, 4]) {
            next.players[pid].color = prev.players[pid].color;
            next.players[pid].decoration = prev.players[pid].decoration;
            if (prev.players[pid].connected) {
              Sim.setPlayerConnected(next, pid, true);
            }
          }
          next.paused = false;
          next.reasonPaused = null;
          r.state = next;
          safeBroadcast(r, { type: 'state', state: r.state });
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
        break;
    }
  }

  return { gameId: 'pacfriends', onConnect, onClose, handleMessage };
}
