/**
 * gameroom.js — Multi-game board game room host.
 *
 * Supports multiple game types via delegated sim modules. Only the game
 * selected for the room is active at a time.
 *
 * Currently implemented sim: go
 * Planned: checkers, chess, morris, cchk, foxgeese, hex, reversi
 */

import * as GoSim from './go_sim.js';
import { suggestMove as goHintSuggest } from './go_hint.js';
import * as MorrisSim from './morris_sim.js';
import * as FoxGeeseSim from './foxgeese_sim.js';
import * as PiratesBulgarsSim from './piratesbulgars_sim.js';
import * as HexSim from './hex_sim.js';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const _dir = dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = join(_dir, 'mcts_worker.js');

// Run a synchronous MCTS hint in a Worker thread so the main event loop
// (comet ticks, snake ticks, etc.) is never blocked during the search.
function mctsInWorker(hintModuleRelPath, state) {
  return new Promise((resolve, reject) => {
    const moduleUrl = new URL(hintModuleRelPath, import.meta.url).href;
    const worker = new Worker(WORKER_SCRIPT, { workerData: { module: moduleUrl, state } });
    worker.once('message', (msg) => {
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg);
    });
    worker.once('error', reject);
  });
}
import { normalizeRoomCode } from '../shared.js';
import {
  countConnectedPlayers,
  generateRoomIdUnique,
  nowMs,
  safeBroadcast,
  send,
} from './room_utils.js';

// ─── Game registry ────────────────────────────────────────────────────────────

const GAME_TYPES = ['go', 'checkers', 'chess', 'morris', 'cchk', 'foxgeese', 'hex', 'piratesbulgars'];
const IMPLEMENTED = new Set(['go', 'morris', 'foxgeese', 'piratesbulgars', 'hex']);

// Build initial sim state for a given game type.
function newGameSimState(gameType) {
  if (gameType === 'go')              return GoSim.newGameState();
  if (gameType === 'morris')          return MorrisSim.newGameState();
  if (gameType === 'foxgeese')        return FoxGeeseSim.newGameState();
  if (gameType === 'piratesbulgars')  return PiratesBulgarsSim.newGameState();
  if (gameType === 'hex')             return HexSim.newGameState();
  // Placeholder: other games return null until their sim modules are added.
  return null;
}

// ─── Room model ───────────────────────────────────────────────────────────────

function newRoomState() {
  return {
    tick: 0,
    gameType: null,       // null until host selects a game
    players: {
      1: { connected: false, side: null },
      2: { connected: false, side: null },
      3: { connected: false, side: null },
      4: { connected: false, side: null },
    },
    game: null,           // the active game's sim state
  };
}

/**
 * Execute a game action with temporary "both"-side color override.
 * If the player's side is 'both', temporarily sets their sim color to
 * `actingColor`, runs the action, and restores on failure.
 */
function withBothSide(room, ws, actingColor, actionFn) {
  const playerSide = room.state.players[ws.playerId]?.side;
  if (playerSide === 'both') {
    const original = room.state.game.players[ws.playerId].color;
    room.state.game.players[ws.playerId].color = actingColor;
    const result = actionFn();
    if (!result.ok) room.state.game.players[ws.playerId].color = original;
    return result;
  }
  return actionFn();
}

// ─── Host factory ─────────────────────────────────────────────────────────────

export function createGameRoomHost() {
  const rooms = new Map(); // roomId -> { id, state, clients: [], updatedAt }

  const ROOM_EXPIRE_MS = 30 * 60 * 1000;

  // Turn-based — expiry-only tick loop.
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
      console.log(`[ws][gameroom] Room ${id} expired`);
    }
  }, 5000);

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  function onConnect(ws) {
    ws.room = null;
    ws.playerId = null;
  }

  function onClose(ws) {
    if (!ws.room) return;
    const room = rooms.get(ws.room);
    if (!room) return;

    room.clients = room.clients.filter((c) => c !== ws);
    if (ws.playerId) {
      room.state.players[ws.playerId].connected = false;
      // Also tell the active sim.
      if (room.state.gameType === 'go' && room.state.game) {
        GoSim.setPlayerConnected(room.state.game, ws.playerId, false);
      } else if (room.state.gameType === 'morris' && room.state.game) {
        MorrisSim.setPlayerConnected(room.state.game, ws.playerId, false);
      } else if (room.state.gameType === 'foxgeese' && room.state.game) {
        FoxGeeseSim.setPlayerConnected(room.state.game, ws.playerId, false);
      } else if (room.state.gameType === 'piratesbulgars' && room.state.game) {
        PiratesBulgarsSim.setPlayerConnected(room.state.game, ws.playerId, false);
      } else if (room.state.gameType === 'hex' && room.state.game) {
        HexSim.setPlayerConnected(room.state.game, ws.playerId, false);
      }
    }
    room.updatedAt = nowMs();
    safeBroadcast(room, { type: 'state', state: room.state });
    ws.room = null;
    ws.playerId = null;
  }

  // ── Message router ───────────────────────────────────────────────────────────

  function handleMessage(ws, msg) {
    switch (msg.type) {

      case 'get_rooms': {
        const list = [];
        for (const [id, r] of rooms) {
          list.push({
            id,
            players: countConnectedPlayers(r.state),
            gameType: r.state.gameType,
          });
        }
        send(ws, { type: 'room_list', rooms: list });
        break;
      }

      case 'create_room': {
        const roomId = generateRoomIdUnique(rooms);
        const state  = newRoomState();
        const room   = { id: roomId, state, clients: [ws], updatedAt: nowMs() };
        rooms.set(roomId, room);

        ws.room = roomId;
        ws.playerId = 1;
        state.players[1].connected = true;

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
        room.state.players[pid].connected = true;
        if (room.state.gameType === 'go' && room.state.game) {
          GoSim.setPlayerConnected(room.state.game, pid, true);
        } else if (room.state.gameType === 'morris' && room.state.game) {
          MorrisSim.setPlayerConnected(room.state.game, pid, true);
        } else if (room.state.gameType === 'foxgeese' && room.state.game) {
          FoxGeeseSim.setPlayerConnected(room.state.game, pid, true);
        } else if (room.state.gameType === 'piratesbulgars' && room.state.game) {
          PiratesBulgarsSim.setPlayerConnected(room.state.game, pid, true);
        } else if (room.state.gameType === 'hex' && room.state.game) {
          HexSim.setPlayerConnected(room.state.game, pid, true);
        }

        // Auto-assign a side if none is taken yet (player can always change it).
        const _joinSims = { go: GoSim, morris: MorrisSim, foxgeese: FoxGeeseSim, piratesbulgars: PiratesBulgarsSim, hex: HexSim };
        if (_joinSims[room.state.gameType] && room.state.game) {
          const Sim = _joinSims[room.state.gameType];
          const playerList = Object.values(room.state.players);
          const hasBlack = playerList.some(p => p.side === 'black');
          const hasWhite = playerList.some(p => p.side === 'white');
          const autoSide = !hasBlack ? 'black' : !hasWhite ? 'white' : null;
          if (autoSide) {
            room.state.players[pid].side = autoSide;
            Sim.selectColor(room.state.game, pid, autoSide);
          }
        }

        room.updatedAt = nowMs();

        send(ws, { type: 'room_joined', roomId, playerId: pid, state: room.state });
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      // ── Game selection ───────────────────────────────────────────────────────

      case 'select_game': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room) return;
        const gameType = String(msg.gameType ?? '');
        if (!GAME_TYPES.includes(gameType)) {
          send(ws, { type: 'error', message: `Unknown game: ${gameType}` });
          return;
        }
        if (!IMPLEMENTED.has(gameType)) {
          send(ws, { type: 'error', message: `${gameType} is not yet implemented` });
          return;
        }
        room.state.gameType = gameType;
        room.state.game = newGameSimState(gameType);
        // Reset all player sides when game changes.
        for (const p of [1, 2, 3, 4]) room.state.players[p].side = null;
        // Re-sync player connections into the new sim.
        const _selectSims = { go: GoSim, morris: MorrisSim, foxgeese: FoxGeeseSim, piratesbulgars: PiratesBulgarsSim, hex: HexSim };
        if (_selectSims[gameType]) {
          const Sim = _selectSims[gameType];
          for (const p of [1, 2, 3, 4]) {
            if (room.state.players[p].connected) {
              Sim.setPlayerConnected(room.state.game, p, true);
            }
          }
          // Auto-assign the first connected player to black.
          for (const p of [1, 2, 3, 4]) {
            if (room.state.players[p].connected) {
              room.state.players[p].side = 'black';
              Sim.selectColor(room.state.game, p, 'black');
              break;
            }
          }
        }
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      // ── Side selection (generalises select_color) ────────────────────────────

      case 'select_side': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room || !room.state.game) return;
        const side = msg.side ?? null;
        room.state.players[ws.playerId].side = side;
        // Sync into the active sim's own player state.
        // 'both' is a room-level concept; the sim gets null (spectator/unset).
        const _sideSims = { go: GoSim, morris: MorrisSim, foxgeese: FoxGeeseSim, piratesbulgars: PiratesBulgarsSim, hex: HexSim };
        if (_sideSims[room.state.gameType]) {
          const simColor = (side === 'both') ? null : side;
          _sideSims[room.state.gameType].selectColor(room.state.game, ws.playerId, simColor);
        }
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      // ── Morris game actions ───────────────────────────────────────────────────

      case 'place_piece': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room || room.state.gameType !== 'morris' || !room.state.game) return;
        const pointIndex = Number(msg.pointIndex);
        const result = withBothSide(room, ws, room.state.game.turn, () =>
          MorrisSim.placePiece(room.state.game, ws.playerId, pointIndex)
        );
        if (!result.ok) { send(ws, { type: 'error', message: result.error }); return; }
        room.state.tick++;
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      case 'move_piece': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room || !room.state.game) return;
        const from = Number(msg.from);
        const to   = Number(msg.to);
        let result;
        if (room.state.gameType === 'morris') {
          result = withBothSide(room, ws, room.state.game.turn, () =>
            MorrisSim.movePiece(room.state.game, ws.playerId, from, to)
          );
        } else if (room.state.gameType === 'foxgeese') {
          // actingColor = fox's turn; pendingJump keeps turn='black' so game.turn is always correct.
          result = withBothSide(room, ws, room.state.game.turn, () =>
            FoxGeeseSim.movePiece(room.state.game, ws.playerId, from, to)
          );
        } else if (room.state.gameType === 'piratesbulgars') {
          result = withBothSide(room, ws, room.state.game.turn, () =>
            PiratesBulgarsSim.movePiece(room.state.game, ws.playerId, from, to)
          );
        } else {
          return;
        }
        if (!result.ok) { send(ws, { type: 'error', message: result.error }); return; }
        room.state.tick++;
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      case 'remove_piece': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room || room.state.gameType !== 'morris' || !room.state.game) return;
        const pointIndex = Number(msg.pointIndex);
        const result = withBothSide(room, ws, room.state.game.pendingRemove, () =>
          MorrisSim.removePiece(room.state.game, ws.playerId, pointIndex)
        );
        if (!result.ok) { send(ws, { type: 'error', message: result.error }); return; }
        room.state.tick++;
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      // ── Go-specific game actions ─────────────────────────────────────────────

      case 'place_stone': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room || !room.state.game) return;
        let result;
        if (room.state.gameType === 'go') {
          const x = Number(msg.x);
          const y = Number(msg.y);
          result = withBothSide(room, ws, room.state.game.turn, () =>
            GoSim.placeStone(room.state.game, ws.playerId, x, y)
          );
        } else if (room.state.gameType === 'hex') {
          const row = Number(msg.row);
          const col = Number(msg.col);
          result = withBothSide(room, ws, room.state.game.turn, () =>
            HexSim.placeStone(room.state.game, ws.playerId, row, col)
          );
        } else {
          return;
        }
        if (!result.ok) { send(ws, { type: 'error', message: result.error }); return; }
        room.state.tick++;
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      case 'pass_turn': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room || room.state.gameType !== 'go' || !room.state.game) return;
        const result = withBothSide(room, ws, room.state.game.turn, () =>
          GoSim.passTurn(room.state.game, ws.playerId)
        );
        if (!result.ok) { send(ws, { type: 'error', message: result.error }); return; }
        room.state.tick++;
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      case 'undo_move': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room || !room.state.game) return;
        let result;
        if (room.state.gameType === 'go')           result = GoSim.undoMove(room.state.game);
        else if (room.state.gameType === 'morris')   result = MorrisSim.undoMove(room.state.game);
        else if (room.state.gameType === 'foxgeese') result = FoxGeeseSim.undoMove(room.state.game);
        else if (room.state.gameType === 'piratesbulgars') result = PiratesBulgarsSim.undoMove(room.state.game);
        else if (room.state.gameType === 'hex')      result = HexSim.undoMove(room.state.game);
        else result = { ok: false, error: 'Undo not yet implemented for this game' };
        if (!result.ok) { send(ws, { type: 'error', message: result.error }); return; }
        room.state.tick++;
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      case 'redo_move': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room || !room.state.game) return;
        let result;
        if (room.state.gameType === 'go')           result = GoSim.redoMove(room.state.game);
        else if (room.state.gameType === 'morris')   result = MorrisSim.redoMove(room.state.game);
        else if (room.state.gameType === 'foxgeese') result = FoxGeeseSim.redoMove(room.state.game);
        else if (room.state.gameType === 'piratesbulgars') result = PiratesBulgarsSim.redoMove(room.state.game);
        else if (room.state.gameType === 'hex')      result = HexSim.redoMove(room.state.game);
        else result = { ok: false, error: 'Redo not yet implemented for this game' };
        if (!result.ok) { send(ws, { type: 'error', message: result.error }); return; }
        room.state.tick++;
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      case 'restart': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room || !room.state.game) return;
        if (room.state.gameType === 'go')           GoSim.resetGame(room.state.game);
        else if (room.state.gameType === 'morris')   MorrisSim.resetGame(room.state.game);
        else if (room.state.gameType === 'foxgeese') FoxGeeseSim.resetGame(room.state.game);
        else if (room.state.gameType === 'piratesbulgars') PiratesBulgarsSim.resetGame(room.state.game);
        else if (room.state.gameType === 'hex')      HexSim.resetGame(room.state.game);
        room.state.tick++;
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      case 'toggle_flying': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room || room.state.gameType !== 'morris' || !room.state.game) return;
        room.state.game.flyingAlways = !room.state.game.flyingAlways;
        MorrisSim.refreshPhase(room.state.game);
        room.state.tick++;
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      case 'toggle_hex_size': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room || room.state.gameType !== 'hex' || !room.state.game) return;
        const newSize = room.state.game.boardSize === 11 ? 9 : 11;
        HexSim.setBoardSize(room.state.game, newSize);
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      case 'request_hint': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room || !room.state.game) return;
        if (room.state.game.gameOver) {
          send(ws, { type: 'hint', x: null, y: null, move: null });
          return;
        }
        const snap = JSON.parse(JSON.stringify(room.state.game));
        if (room.state.gameType === 'go') {
          goHintSuggest(snap).then((move) => {
            if (ws.room) safeBroadcast(room, { type: 'hint', x: move?.x ?? null, y: move?.y ?? null });
          }).catch((e) => {
            console.error('[gameroom] hint error', e);
            if (ws.room) safeBroadcast(room, { type: 'hint', x: null, y: null });
          });
        } else if (room.state.gameType === 'morris') {
          mctsInWorker('./morris_hint.js', snap)
            .then((result) => { if (ws.room) safeBroadcast(room, { type: 'hint', move: result.move ?? null }); })
            .catch((e) => { console.error('[gameroom] morris hint error', e); if (ws.room) safeBroadcast(room, { type: 'hint', move: null }); });
        } else if (room.state.gameType === 'foxgeese') {
          mctsInWorker('./foxgeese_hint.js', snap)
            .then((result) => { if (ws.room) safeBroadcast(room, { type: 'hint', move: result.move ?? null }); })
            .catch((e) => { console.error('[gameroom] foxgeese hint error', e); if (ws.room) safeBroadcast(room, { type: 'hint', move: null }); });
        } else if (room.state.gameType === 'piratesbulgars') {
          mctsInWorker('./piratesbulgars_hint.js', snap)
            .then((result) => { if (ws.room) safeBroadcast(room, { type: 'hint', move: result.move ?? null }); })
            .catch((e) => { console.error('[gameroom] piratesbulgars hint error', e); if (ws.room) safeBroadcast(room, { type: 'hint', move: null }); });
        } else if (room.state.gameType === 'hex') {
          mctsInWorker('./hex_hint.js', snap)
            .then((result) => { if (ws.room) safeBroadcast(room, { type: 'hint', move: result.move ?? null }); })
            .catch((e) => { console.error('[gameroom] hex hint error', e); if (ws.room) safeBroadcast(room, { type: 'hint', move: null }); });
        }
        break;
      }

      case 'end_jump': {
        if (!ws.room || !ws.playerId) return;
        const room = rooms.get(ws.room);
        if (!room || room.state.gameType !== 'piratesbulgars' || !room.state.game) return;
        const result = withBothSide(room, ws, 'white', () =>
          PiratesBulgarsSim.endJump(room.state.game, ws.playerId)
        );
        if (!result.ok) { send(ws, { type: 'error', message: result.error }); return; }
        room.state.tick++;
        room.updatedAt = nowMs();
        safeBroadcast(room, { type: 'state', state: room.state });
        break;
      }

      default:
        break;
    }
  }

  return {
    gameId: 'gameroom',
    onConnect,
    onClose,
    handleMessage,
  };
}
