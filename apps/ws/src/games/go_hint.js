/**
 * go_hint.js — Go move suggestion via GNU Go (GTP subprocess).
 *
 * Spawns `gnugo --mode gtp --level 5`, builds an SGF string from the current
 * board state (using AB/AW setup properties), loads it via `loadsgf`, then
 * calls `genmove <color>` and parses the response.
 *
 * Requirements: gnugo must be installed (apt-get install gnugo).
 * Returns: Promise<{x, y} | null>
 */

import { spawn }                  from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir }                  from 'os';
import { join }                    from 'path';

const BOARD_SIZE  = 9;
const TIMEOUT_MS  = 5000;

const GTP_LEVELS = { easy: 1, medium: 5, hard: 10 };

// ─── Fallback: nearest-to-center empty intersection ──────────────────────────

function fallbackMove(board) {
  let best = null, bestDist = Infinity;
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] !== null) continue;
      const d = Math.abs(x - 4) + Math.abs(y - 4);
      if (d < bestDist) { bestDist = d; best = { x, y }; }
    }
  }
  return best;
}

// ─── SGF builder ─────────────────────────────────────────────────────────────
// SGF coordinates: first letter = column (a=left), second = row (a=top).
// Our board[y][x]: x=column (0=left), y=row (0=top). Direct mapping → `chr(97+x)+chr(97+y)`.

function boardToSGF(state) {
  const ab = [];
  const aw = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const cell  = state.board[y][x];
      const coord = String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
      if (cell === 'black') ab.push(`[${coord}]`);
      else if (cell === 'white') aw.push(`[${coord}]`);
    }
  }
  const abStr = ab.length > 0 ? `AB${ab.join('')}` : '';
  const awStr = aw.length > 0 ? `AW${aw.join('')}` : '';
  const pl    = state.turn === 'black' ? 'B' : 'W';
  return `(;GM[1]FF[4]SZ[${BOARD_SIZE}]KM[0]PL[${pl}]${abStr}${awStr})`;
}

// ─── GTP coordinate parser ────────────────────────────────────────────────────
// GTP columns: A-T skipping I  (A=0, B=1, ..., H=7, J=8, ...)
// GTP rows: 1 = bottom (our y=BOARD_SIZE-1), BOARD_SIZE = top (our y=0).

function parseGTPCoord(coord) {
  const letter = coord[0].toUpperCase();
  let col = letter.charCodeAt(0) - 65; // A=0
  if (letter >= 'J') col--;            // skip I
  const row = parseInt(coord.slice(1), 10);
  const y   = BOARD_SIZE - row;
  if (col < 0 || col >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null;
  return { x: col, y };
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function suggestMove(gameState, level = 'medium') {
  if (gameState.gameOver) return Promise.resolve(null);

  const gtpLevel = GTP_LEVELS[level] ?? GTP_LEVELS.medium;

  // Empty board → tengen (best opening for 9×9).
  const hasStones = gameState.board.some(row => row.some(c => c !== null));
  if (!hasStones) return Promise.resolve({ x: 4, y: 4 });

  return new Promise((resolve) => {
    const sgf     = boardToSGF(gameState);
    const tmpFile = join(tmpdir(), `go_hint_${Date.now()}_${process.pid}.sgf`);
    let resolved  = false;

    const done = (result) => {
      if (resolved) return;
      resolved = true;
      try { unlinkSync(tmpFile); } catch { /* ignore */ }
      resolve(result);
    };

    try {
      writeFileSync(tmpFile, sgf, 'utf8');
    } catch (e) {
      console.error('[go_hint] Failed to write temp SGF:', e.message);
      return done(null);
    }

    let proc;
    try {
      // Use full path: Debian installs gnugo to /usr/games which isn't in Node's PATH.
      const gnugoPath = process.env.GNUGO_PATH || '/usr/games/gnugo';
      proc = spawn(gnugoPath, [
        '--mode', 'gtp',
        '--level', String(gtpLevel),
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      console.error('[go_hint] Failed to spawn gnugo:', e.message);
      return done(fallbackMove(gameState.board));
    }

    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      console.warn('[go_hint] gnugo timed out');
      done(fallbackMove(gameState.board));
    }, TIMEOUT_MS);

    let output = '';
    proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
    proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg) console.warn('[go_hint] gnugo stderr:', msg);
    });

    proc.on('close', () => {
      clearTimeout(timer);
      // GTP success: "= D5\n\n"  or  "= PASS\n\n"
      const match = output.match(/= ([A-HJ-T]\d{1,2}|PASS)/i);
      if (!match || match[1].toUpperCase() === 'PASS') {
        return done(fallbackMove(gameState.board));
      }
      done(parseGTPCoord(match[1]) ?? fallbackMove(gameState.board));
    });

    proc.on('error', (e) => {
      clearTimeout(timer);
      console.error('[go_hint] gnugo process error:', e.message);
      done(fallbackMove(gameState.board));
    });

    const color = gameState.turn === 'black' ? 'black' : 'white';
    proc.stdin.write(`loadsgf ${tmpFile}\n`);
    proc.stdin.write(`genmove ${color}\n`);
    proc.stdin.write(`quit\n`);
    proc.stdin.end();
  });
}
