import * as Sim from './wallmover_sim.js';
import { normalizeRoomCode } from '../shared.js';
import { countConnectedPlayers, generateRoomIdUnique, nowMs, safeBroadcast, send } from './room_utils.js';

export function createWallmoverHost() {
  const rooms = new Map(); // roomId -> { id, state, clients: [], updatedAt, saves: [], savesByCode }

  const ROOM_EXPIRE_MS = 10 * 60 * 1000;

  function generateRoomIdUniqueForHost() {
    return generateRoomIdUnique(rooms);
  }

  function generateSaveCode_(room) {
    const used = room?.savesByCode;
    for (let i = 0; i < 50; i++) {
      const n = Math.floor(Math.random() * 100000000);
      const code = String(n).padStart(8, '0');
      if (!used?.has(code)) return code;
    }
    // Fallback (should be extremely rare).
    return String(Math.floor(Date.now() % 100000000)).padStart(8, '0');
  }

  function clonePoints_(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => ({ x: Math.floor(p.x), y: Math.floor(p.y) }));
  }

  function takeCollectiblesSnapshot_(state) {
    if (!state) return null;
    return {
      apples: clonePoints_(state.apples),
      treasures: clonePoints_(state.treasures),
      batteries: clonePoints_(state.batteries),
      fishes: clonePoints_(state.fishes),
      ducks: clonePoints_(state.ducks),
      applesCollected: Number(state.applesCollected ?? 0),
      treasuresCollected: Number(state.treasuresCollected ?? 0),
      batteriesCollected: Number(state.batteriesCollected ?? 0),
      fishesCollected: Number(state.fishesCollected ?? 0),
      ducksCollected: Number(state.ducksCollected ?? 0),
    };
  }

  function restoreCollectiblesSnapshot_(state, snap) {
    if (!state || !snap) return false;
    state.apples = clonePoints_(snap.apples);
    state.treasures = clonePoints_(snap.treasures);
    state.batteries = clonePoints_(snap.batteries);
    state.fishes = clonePoints_(snap.fishes);
    state.ducks = clonePoints_(snap.ducks);

    // Reset counters to their pre-run values (typically 0).
    state.applesCollected = Math.max(0, Math.floor(Number(snap.applesCollected ?? 0)));
    state.treasuresCollected = Math.max(0, Math.floor(Number(snap.treasuresCollected ?? 0)));
    state.batteriesCollected = Math.max(0, Math.floor(Number(snap.batteriesCollected ?? 0)));
    state.fishesCollected = Math.max(0, Math.floor(Number(snap.fishesCollected ?? 0)));
    state.ducksCollected = Math.max(0, Math.floor(Number(snap.ducksCollected ?? 0)));
    return true;
  }

  // Fixed tick loop for all wallmover rooms
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
      console.log(`[ws][wallmover] Room ${id} expired`);
    }
  }, 150);

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
        const room = {
          id: roomId,
          state,
          clients: [ws],
          updatedAt: nowMs(),
          saves: [],
          savesByCode: new Map(),
          runSnapshot: null,
        };
        rooms.set(roomId, room);

        ws.room = roomId;
        ws.playerId = 1;
        Sim.setPlayerConnected(state, 1, true);

        send(ws, { type: 'room_joined', roomId, playerId: 1, state });
        break;
      }

      case 'join_room': {
        const requestedId = normalizeRoomCode(msg.roomId);
        if (!requestedId) {
          send(ws, { type: 'error', message: 'Invalid room code (must be 4 digits)' });
          return;
        }

        if (ws.room && ws.room !== requestedId) {
          onClose(ws);
        }

        const room = rooms.get(requestedId);
        if (!room) {
          send(ws, { type: 'error', message: 'Room not found' });
          return;
        }

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

      case 'select_level': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        room.runSnapshot = null;
        Sim.setLevel(room.state, msg.level);
        break;
      }

      case 'restart': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        room.runSnapshot = null;
        Sim.restart(room.state);
        break;
      }

      case 'pause': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        if (ws.playerId) Sim.togglePause(room.state, ws.playerId);
        break;
      }

      case 'resume': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        if (ws.playerId) Sim.resumeGame(room.state, ws.playerId);
        break;
      }

      case 'start_play': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        room.runSnapshot = takeCollectiblesSnapshot_(room.state);
        if (ws.playerId) Sim.startPlay(room.state, ws.playerId);
        break;
      }

      case 'set_mode': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        room.runSnapshot = null;
        Sim.setMode(room.state, msg.mode);
        break;
      }

      case 'edit_set_wall': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        Sim.setWallEdge(room.state, msg.x, msg.y, msg.dir, msg.on);
        break;
      }

      case 'edit_place': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        Sim.placeCollectible(room.state, msg.kind, msg.x, msg.y);
        break;
      }

      case 'save_layout': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        const mode = String(room.state?.mode || 'freeform').toLowerCase();
        if (mode !== 'freeform') {
          send(ws, { type: 'error', message: 'Save is only available in Free mode.' });
          return;
        }

        const snapshot = Sim.serializeFreeformLayout(room.state);
        if (!snapshot) {
          send(ws, { type: 'error', message: 'Could not save this layout.' });
          return;
        }

        const code = generateSaveCode_(room);
        const savedAt = nowMs();
        const entry = { code, savedAt, snapshot };

        room.savesByCode.set(code, entry);
        room.saves = [entry, ...(room.saves || []).filter((e) => e?.code !== code)];

        const MAX_SAVES = 25;
        while (room.saves.length > MAX_SAVES) {
          const removed = room.saves.pop();
          if (removed?.code) room.savesByCode.delete(removed.code);
        }

        send(ws, { type: 'save_layout_ok', code, savedAt });
        break;
      }

      case 'list_saves': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        const mode = String(room.state?.mode || 'freeform').toLowerCase();
        if (mode !== 'freeform') {
          send(ws, { type: 'save_list', saves: [] });
          return;
        }
        const saves = (room.saves || []).map((e) => ({ code: e.code, savedAt: e.savedAt }));
        send(ws, { type: 'save_list', saves });
        break;
      }

      case 'load_layout': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        const mode = String(room.state?.mode || 'freeform').toLowerCase();
        if (mode !== 'freeform') {
          send(ws, { type: 'error', message: 'Load is only available in Free mode.' });
          return;
        }

        const code = String(msg.code || '').trim();
        if (!/^[0-9]{8}$/.test(code)) {
          send(ws, { type: 'error', message: 'Invalid save code (must be 8 digits).' });
          return;
        }

        const entry = room.savesByCode?.get(code);
        if (!entry?.snapshot) {
          send(ws, { type: 'error', message: 'Save not found.' });
          return;
        }

        const ok = Sim.loadFreeformLayout(room.state, entry.snapshot);
        if (!ok) {
          send(ws, { type: 'error', message: 'Could not load this layout.' });
          return;
        }

        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        send(ws, { type: 'load_layout_ok', code });
        break;
      }

      case 'autoplay_start': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        room.runSnapshot = takeCollectiblesSnapshot_(room.state);
        if (ws.playerId) Sim.autoplayStart(room.state, ws.playerId);
        break;
      }

      case 'autoplay_stop': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        Sim.autoplayStop(room.state);
        break;
      }

      case 'solver_start': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        room.runSnapshot = takeCollectiblesSnapshot_(room.state);
        Sim.solverStart(room.state);
        break;
      }

      case 'solver_stop': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        Sim.solverStop(room.state);
        break;
      }

      case 'solver_reset': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        room.runSnapshot = null;
        Sim.solverReset(room.state);
        break;
      }

      case 'next_level': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        room.runSnapshot = null;
        Sim.nextLevel(room.state);
        break;
      }

      case 'stop_test': {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        Sim.stopTest(room.state);

        // Restore collectibles eaten during the run.
        if (room.runSnapshot) {
          restoreCollectiblesSnapshot_(room.state, room.runSnapshot);
          room.runSnapshot = null;
        }
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
        // ignore
        break;
    }
  }

  return {
    gameId: 'wallmover',
    onConnect,
    onClose,
    handleMessage,
  };
}
