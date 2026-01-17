export function parseJsonMessage(raw) {
  try {
    // ws on Node delivers Buffer/Uint8Array; in browsers it'll be string.
    const text = typeof raw === 'string' ? raw : raw.toString('utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function safeSend(ws, msg) {
  try {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  } catch {
    // ignore
  }
}

export function normalizeRoomCode(roomId) {
  const s = String(roomId ?? '').trim();
  if (!/^\d{4}$/.test(s)) return null;
  return s;
}
