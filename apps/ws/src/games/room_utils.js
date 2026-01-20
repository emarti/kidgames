import { safeSend } from '../shared.js';

export function nowMs() {
  return Date.now();
}

export function make4DigitRoomId() {
  const chars = '0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export function generateRoomIdUnique(rooms) {
  for (let i = 0; i < 1000; i++) {
    const id = make4DigitRoomId();
    if (!rooms.has(id)) return id;
  }
  return make4DigitRoomId();
}

export function countConnectedPlayers(state) {
  let n = 0;
  for (const pid of [1, 2, 3, 4]) {
    if (state.players?.[pid]?.connected) n++;
  }
  return n;
}

export function pickOpenPlayerId(state) {
  for (const pid of [1, 2, 3, 4]) {
    if (!state.players?.[pid]?.connected) return pid;
  }
  return null;
}

export function safeBroadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const client of room.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

export function send(ws, msg) {
  safeSend(ws, msg);
}
