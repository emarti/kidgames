export function randInt(n) {
  return Math.floor(Math.random() * n);
}

export function nowMs() {
  return Date.now();
}

export function make4DigitRoomId() {
  let out = '';
  for (let i = 0; i < 4; i++) out += String(randInt(10));
  return out;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
