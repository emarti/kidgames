# Deploy on Render (Static Site + WebSocket Service)

This repo is set up to deploy as:

- **Render Static Site**: serves the `/games/` portal + built game clients.
- **Render Web Service**: runs a single Node WebSocket backend for all games (`apps/ws`).

The clients talk to the backend using a required WebSocket **hello handshake**:
`{ "type": "hello", "gameId": "snake"|"maze", "protocol": 1 }`.

Room codes are **digits-only**: `0000`–`9999`.

---

## 1) WebSocket backend (Web Service)

Tip: a ready-to-use Render Blueprint is included as [render.yaml](render.yaml).

Create a new **Web Service** in Render:

- **Root Directory**: `apps/ws`
- **Environment**: Node
- **Build Command**: `npm install --no-audit --no-fund`
- **Start Command**: `npm start`

Notes:
- Render sets `PORT` automatically; the server reads `PORT` and defaults to `8080` locally.
- Health check: `GET /` returns `ok`.

After deploy, you’ll have a service URL like:
- `https://YOUR-WS-SERVICE.onrender.com`

The WebSocket URL will be:
- `wss://YOUR-WS-SERVICE.onrender.com`

---

## 2) Frontend (Static Site)

Create a new **Static Site** in Render:

- **Root Directory**: `apps/web`
- **Build Command**: `bash ./build.sh`
- **Publish Directory**: `dist`

### Environment variable (important)

Add an env var to the Static Site so the built clients know where the WS backend is:

- `VITE_WS_URL = wss://YOUR-WS-SERVICE.onrender.com`

If you create services using the Blueprint in [render.yaml](render.yaml), Render will prompt you for `VITE_WS_URL` during the initial setup flow.

Why: the default production WS URL in the clients is same-origin (`/games/<game>/ws`), but your Render Static Site and Render Web Service are different origins.

---

## 3) Verifying after deploy

- Open your Static Site URL and go to `/games/`.
- Launch Snake and Maze.
- Create a room (you should see a 4-digit code).
- Join the room from another browser/device using the same 4 digits.

If the browser console shows `Missing hello handshake`, it means something is connecting to the WS backend without sending the initial hello message.

---

## 4) Local dev quick notes

- Unified WS backend (direct):
  - `cd apps/ws && npm install && npm run dev`
  - clients default to `ws://localhost:8080` in dev.

- Docker gateway (Caddy) + unified backend:
  - `docker compose up --build`
  - optional cleanup if you previously had separate backends:
    - `docker compose up --build --remove-orphans`

---

## Debugging note

In practice, the fastest way to debug gameplay issues is usually browser devtools
(console + Network → WS frames).
