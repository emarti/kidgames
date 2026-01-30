import http from 'http';
import { WebSocketServer } from 'ws';
import { parseJsonMessage, safeSend } from './shared.js';
import { logEvent } from './logging/events_log.js';
import { coarseGeoFromRequest } from './logging/geo.js';
import { createSnakeHost } from './games/snake.js';
import { createMazeHost } from './games/maze.js';
import { createCometHost } from './games/comet.js';
import { createArchimedesHost } from './games/archimedes.js';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
if (!Number.isFinite(port) || port <= 0) throw new Error(`Invalid PORT: ${process.env.PORT}`);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('ok');
});

const wss = new WebSocketServer({ server });

const hosts = new Map();
for (const host of [createSnakeHost(), createMazeHost(), createCometHost(), createArchimedesHost()]) {
  hosts.set(host.gameId, host);
}

function attachHost(ws, gameId) {
  const host = hosts.get(gameId);
  if (!host) return null;
  ws.__gameId = gameId;
  ws.__host = host;
  host.onConnect(ws);
  return host;
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  // Coarse geo (country/region) used for join analytics. Does not store IP.
  ws.__geo = coarseGeoFromRequest(req);

  ws.__host = null;
  ws.__gameId = null;

  ws.on('message', (raw) => {
    const msg = parseJsonMessage(raw);
    if (!msg) return;

    if (!ws.__host) {
      if (msg.type !== 'hello') {
        safeSend(ws, { type: 'error', message: 'Missing hello handshake' });
        ws.close();
        return;
      }

      const gameId = String(msg.gameId ?? '');
      const host = attachHost(ws, gameId);
      if (!host) {
        safeSend(ws, { type: 'error', message: `Unknown game: ${gameId}` });
        ws.close();
        return;
      }

      safeSend(ws, { type: 'hello_ack', gameId });
      return;
    }

    ws.__host.handleMessage(ws, msg);

    // Log joins after the host has had a chance to assign ws.room/ws.playerId.
    if ((msg.type === 'create_room' || msg.type === 'join_room') && ws.room && ws.playerId) {
      const key = `${ws.__gameId || ''}:${ws.room}:${ws.playerId}`;
      if (ws.__lastJoinLogKey !== key) {
        ws.__lastJoinLogKey = key;
        logEvent({
          event: 'player_joined',
          gameId: ws.__gameId,
          roomId: ws.room,
          playerId: ws.playerId,
          geo: ws.__geo,
          reason: msg.type,
        });
      }
    }
  });

  ws.on('close', () => {
    if (ws.__host) ws.__host.onClose(ws);
  });
});

// Heartbeat keeps idle connections alive through proxies.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(port, () => {
  console.log(`Games WS server listening on port ${port}`);
});
