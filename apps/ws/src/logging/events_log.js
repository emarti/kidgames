import fs from 'fs';
import path from 'path';

const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_MAX_EVENTS_PER_DAY = 20000;
const DEFAULT_MAX_EVENTS_PER_ROOM_PER_MIN = 120;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateStampUTC(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function sanitizeValue(v) {
  if (v == null) return '';
  return String(v)
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function toInt(v, fallback) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

const logDir = process.env.GAMES_LOG_DIR || path.resolve(process.cwd(), '..', '..', 'logs');
const retentionDays = Math.max(1, toInt(process.env.GAMES_LOG_RETENTION_DAYS, DEFAULT_RETENTION_DAYS));
const maxEventsPerDay = Math.max(100, toInt(process.env.GAMES_LOG_MAX_EVENTS_PER_DAY, DEFAULT_MAX_EVENTS_PER_DAY));
const maxPerRoomPerMin = Math.max(10, toInt(process.env.GAMES_LOG_MAX_EVENTS_PER_ROOM_PER_MIN, DEFAULT_MAX_EVENTS_PER_ROOM_PER_MIN));

let currentDate = null;
let currentFile = null;
let dayCount = 0;

// Key: `${gameId}:${roomId}:${minuteBucket}` -> count
const perRoomMinute = new Map();

function ensureDir() {
  fs.mkdirSync(logDir, { recursive: true });
}

function rolloverIfNeeded(ms) {
  const d = dateStampUTC(ms);
  if (currentDate === d && currentFile) return;

  ensureDir();
  currentDate = d;
  currentFile = path.join(logDir, `events-${currentDate}.log`);
  dayCount = 0;
  perRoomMinute.clear();

  cleanupOldLogsSafe();
}

function cleanupOldLogsSafe() {
  try {
    const files = fs.readdirSync(logDir);
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    for (const f of files) {
      const m = f.match(/^events-(\d{4}-\d{2}-\d{2})\.log$/);
      if (!m) continue;

      const stamp = m[1];
      const t = Date.parse(`${stamp}T00:00:00.000Z`);
      if (!Number.isFinite(t)) continue;
      if (t < cutoffMs) {
        try {
          fs.unlinkSync(path.join(logDir, f));
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
}

function canLog(gameId, roomId, ms) {
  if (dayCount >= maxEventsPerDay) return false;

  const minuteBucket = Math.floor(ms / 60000);
  const key = `${gameId || ''}:${roomId || ''}:${minuteBucket}`;
  const n = (perRoomMinute.get(key) || 0) + 1;
  perRoomMinute.set(key, n);
  if (n > maxPerRoomPerMin) return false;

  return true;
}

function formatLine(fields) {
  // Human-readable, grep-friendly key=value format.
  // Example:
  // 2026-01-25T12:34:56.789Z event=player_joined game=maze room=1234 player=2 country=US region=CA reason=ws_close
  const ts = sanitizeValue(fields.ts);
  const parts = [ts];

  const orderedKeys = [
    'event',
    'game',
    'room',
    'player',
    'country',
    'region',
    'city',
    'reason',
    'note',
    'age_s',
    'idle_s',
  ];

  for (const k of orderedKeys) {
    const v = fields[k];
    if (v == null || v === '') continue;
    parts.push(`${k}=${sanitizeValue(v)}`);
  }

  return parts.join(' ');
}

export function logEvent(evt) {
  const ms = Number.isFinite(evt?.tsMs) ? evt.tsMs : Date.now();
  rolloverIfNeeded(ms);

  const gameId = sanitizeValue(evt?.gameId);
  const roomId = sanitizeValue(evt?.roomId);

  if (!canLog(gameId, roomId, ms)) return;

  dayCount++;

  const geo = evt?.geo || null;

  const line = formatLine({
    ts: new Date(ms).toISOString(),
    event: evt?.event,
    game: gameId,
    room: roomId,
    player: evt?.playerId,
    country: geo?.country,
    region: geo?.region,
    city: geo?.city,
    reason: evt?.reason,
    note: evt?.note,
    age_s: evt?.ageS,
    idle_s: evt?.idleS,
  });

  try {
    fs.appendFile(currentFile, `${line}\n`, (err) => {
      if (err) {
        // Keep logging failures non-fatal.
        // eslint-disable-next-line no-console
        console.error('[logs] failed to append', err?.message || err);
      }
    });
  } catch {
    // ignore
  }
}

// Periodic cleanup in case the process runs forever.
setInterval(() => {
  cleanupOldLogsSafe();
}, 6 * 60 * 60 * 1000);
