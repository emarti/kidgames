// Tile type constants (mirrored from server)
const T = { WALL: 0, DOT: 1, POWER: 2, EMPTY: 3, HOUSE: 4, DOOR: 5, TUNNEL: 6, PORTAL: 7 };

const WALL_COLOR    = 0x0000CC;
const WALL_LIGHT    = 0x4444FF;
const DOT_COLOR     = 0xFFDDAA;
const POWER_COLOR   = 0xFFFFFF;
const HOUSE_COLOR   = 0x220022;
const DOOR_COLOR    = 0xFF88FF;
const TUNNEL_COLOR  = 0x000033;

// Ghost mode colors
const GHOST_FRIGHT_COLOR = 0x0000FF;
const GHOST_FRIGHT_FLASH = 0xFFFFFF;
const GHOST_EYES_COLOR   = 0xFFFFFF;
const GHOST_PUPILS_COLOR = 0x0000CC;

/**
 * Convert a CSS hex color string to a Phaser integer.
 */
function hexToInt(str) {
    return parseInt(String(str).replace('#', ''), 16);
}

/**
 * Convert server pixel coords to canvas coords given layout.
 * The server uses TILE_PX=16 virtual units; we scale to cellSize.
 */
function srv2canvas(sx, sy, layout) {
    const scale = layout.cellSize / 16;
    return {
        x: layout.offsetX + sx * scale,
        y: layout.offsetY + sy * scale,
    };
}

// ---------------------------------------------------------------
// MAZE
// ---------------------------------------------------------------

export function drawMaze(g, state, layout) {
    const { cellSize, offsetX, offsetY } = layout;
    const tiles = state.tiles;
    if (!tiles) return;

    const GRID_H = tiles.length;
    const GRID_W = tiles[0]?.length ?? 0;

    for (let row = 0; row < GRID_H; row++) {
        for (let col = 0; col < GRID_W; col++) {
            const tile = tiles[row][col];
            const px = offsetX + col * cellSize;
            const py = offsetY + row * cellSize;

            switch (tile) {
                case T.WALL: {
                    g.fillStyle(WALL_COLOR, 1);
                    g.fillRect(px, py, cellSize, cellSize);
                    // Subtle inner highlight
                    g.fillStyle(WALL_LIGHT, 0.25);
                    g.fillRect(px + 1, py + 1, cellSize - 2, 2);
                    break;
                }
                case T.HOUSE: {
                    g.fillStyle(HOUSE_COLOR, 1);
                    g.fillRect(px, py, cellSize, cellSize);
                    break;
                }
                case T.DOOR: {
                    g.fillStyle(HOUSE_COLOR, 1);
                    g.fillRect(px, py, cellSize, cellSize);
                    // Pink door stripe
                    g.fillStyle(DOOR_COLOR, 1);
                    g.fillRect(px, py + Math.floor(cellSize * 0.4), cellSize, Math.floor(cellSize * 0.2));
                    break;
                }
                case T.TUNNEL: {
                    g.fillStyle(TUNNEL_COLOR, 1);
                    g.fillRect(px, py, cellSize, cellSize);
                    break;
                }
                case T.PORTAL: {
                    // Portals are used as topological side tunnels; keep them visually quiet.
                    g.fillStyle(TUNNEL_COLOR, 1);
                    g.fillRect(px, py, cellSize, cellSize);
                    break;
                }
                case T.DOT: {
                    // Black bg
                    g.fillStyle(0x000011, 1);
                    g.fillRect(px, py, cellSize, cellSize);
                    const r = Math.max(1, Math.floor(cellSize * 0.12));
                    g.fillStyle(DOT_COLOR, 1);
                    g.fillCircle(px + cellSize / 2, py + cellSize / 2, r);
                    break;
                }
                case T.POWER: {
                    g.fillStyle(0x000011, 1);
                    g.fillRect(px, py, cellSize, cellSize);
                    const pr = Math.max(2, Math.floor(cellSize * 0.32));
                    // Pulsate: use tick for phase
                    const phase = (state.tick * 3) % 360;
                    const alpha = 0.6 + 0.4 * Math.sin(phase * Math.PI / 180);
                    g.fillStyle(POWER_COLOR, alpha);
                    g.fillCircle(px + cellSize / 2, py + cellSize / 2, pr);
                    break;
                }
                default: {
                    // EMPTY
                    g.fillStyle(0x000011, 1);
                    g.fillRect(px, py, cellSize, cellSize);
                    break;
                }
            }
        }
    }
}

// ---------------------------------------------------------------
// GHOSTS
// ---------------------------------------------------------------

export function drawGhosts(g, state, layout) {
    if (!state.ghosts) return;
    const { cellSize } = layout;
    const tick = state.tick ?? 0;
    const scale = cellSize / 16;
    const r = Math.max(4, cellSize * 0.55);

    for (const ghost of state.ghosts) {
        if (ghost.mode === 'house') continue;

        const { x, y } = srv2canvas(ghost.x, ghost.y, layout);
        const frightened = ghost.mode === 'frightened';
        const eaten = ghost.mode === 'eaten';

        if (eaten) {
            // Just eyes
            drawGhostEyes(g, x, y, r * 0.5);
            continue;
        }

        // Ghost body color
        let bodyColor;
        if (frightened) {
            // Flash when nearly out of time (last 2 seconds: frightenedTimer < 2000)
            const flash = ghost.frightenedTimer < 2000 && (Math.floor(tick / 4) % 2 === 0);
            bodyColor = flash ? GHOST_FRIGHT_FLASH : GHOST_FRIGHT_COLOR;
        } else {
            bodyColor = hexToInt(ghost.color);
        }

        // Draw ghost shape: rounded top + wavy bottom
        g.fillStyle(bodyColor, 1);
        // Top half circle
        g.fillCircle(x, y - r * 0.2, r);
        // Body rectangle
        g.fillRect(x - r, y - r * 0.2, r * 2, r * 1.2);
        // Wavy bottom: 3 bumps
        const bumpR = r / 3;
        for (let i = 0; i < 3; i++) {
            const bx = x - r + bumpR + i * bumpR * 2;
            g.fillStyle(0x000011, 1);
            g.fillCircle(bx, y + r, bumpR);
        }

        // Eyes (not on frightened unless flashing white)
        if (!frightened) {
            drawGhostEyes(g, x, y - r * 0.1, r * 0.3);
        } else if (ghost.frightenedTimer < 2000 && (Math.floor(tick / 4) % 2 === 0)) {
            // White flash: draw simple dots
            g.fillStyle(0x0000FF, 1);
            g.fillCircle(x - r * 0.28, y - r * 0.1, r * 0.18);
            g.fillCircle(x + r * 0.28, y - r * 0.1, r * 0.18);
        } else {
            // Frightened face: wavy mouth line
            g.lineStyle(Math.max(1, r * 0.15), 0xFF8888, 1);
            for (let i = 0; i < 4; i++) {
                const fx = x - r * 0.5 + i * r * 0.33;
                const fy = y + r * 0.35 + (i % 2 === 0 ? r * 0.1 : -r * 0.1);
                if (i === 0) g.moveTo(fx, fy); else g.lineTo(fx, fy);
            }
            g.strokePath();
        }
    }
}

function drawGhostEyes(g, cx, cy, r) {
    // White sclera
    g.fillStyle(GHOST_EYES_COLOR, 1);
    g.fillCircle(cx - r * 1.0, cy, r);
    g.fillCircle(cx + r * 1.0, cy, r);
    // Blue pupils
    g.fillStyle(GHOST_PUPILS_COLOR, 1);
    g.fillCircle(cx - r * 1.0, cy + r * 0.25, r * 0.55);
    g.fillCircle(cx + r * 1.0, cy + r * 0.25, r * 0.55);
}

// ---------------------------------------------------------------
// PLAYERS (Pac-Man)
// ---------------------------------------------------------------

export function drawPlayers(g, state, layout) {
    const net_pid = null; // we can't know here; drawn equally
    const tick = state.tick ?? 0;
    const { cellSize } = layout;

    for (const pid of [1, 2, 3, 4]) {
        const p = state.players?.[pid];
        if (!p || !p.connected) continue;
        if (!p.alive) {
            // Draw ghost of where they died — small X
            const { x, y } = srv2canvas(p.x, p.y, layout);
            const color = hexToInt(p.color || '#FFFF00');
            g.lineStyle(2, color, 0.5);
            const s = cellSize * 0.3;
            g.lineBetween(x - s, y - s, x + s, y + s);
            g.lineBetween(x + s, y - s, x - s, y + s);
            continue;
        }

        const { x, y } = srv2canvas(p.x, p.y, layout);
        const r = Math.max(5, cellSize * 0.52);
        const color = hexToInt(p.color || '#FFFF00');

        // Mouth animation: open angle oscillates with tick
        const mouthPhase = (tick * 5) % 360;
        const mouthAngle = p.moving ? (20 + 20 * Math.abs(Math.sin(mouthPhase * Math.PI / 180))) : 10;

        // Rotation based on direction
        let rotation = 0;
        switch (p.dir) {
            case 'RIGHT': rotation = 0; break;
            case 'DOWN':  rotation = Math.PI / 2; break;
            case 'LEFT':  rotation = Math.PI; break;
            case 'UP':    rotation = -Math.PI / 2; break;
        }

        // Draw Pac-Man arc
        const startAngle = rotation + (mouthAngle * Math.PI / 180);
        const endAngle   = rotation + (2 * Math.PI) - (mouthAngle * Math.PI / 180);

        g.fillStyle(color, 1);
        g.slice(x, y, r, startAngle, endAngle, false);
        g.fillPath();

        // Power pellet glow ring
        if (p.powerTimer && p.powerTimer > 0) {
            g.lineStyle(2, 0xFFFFFF, 0.7);
            g.strokeCircle(x, y, r + 3);
        }

        // Decoration
        drawDecoration(g, p.decoration, x, y, r, rotation);
    }
}

function drawDecoration(g, decoration, cx, cy, r, rotation) {
    if (!decoration || decoration === 'plain') return;

    // Direction vector perpendicular to movement (decoration sits on top)
    const perpX = -Math.sin(rotation);
    const perpY =  Math.cos(rotation);
    // "Top" of pac-man head
    const topX = cx + perpX * r * 0.7;
    const topY = cy + perpY * r * 0.7;

    if (decoration === 'bow') {
        // Mrs. Pac-Man style bow: two triangles + center dot, red
        g.fillStyle(0xFF2244, 1);
        // Left lobe
        g.fillTriangle(
            topX - r * 0.5, topY,
            topX,           topY - r * 0.35,
            topX,           topY + r * 0.05
        );
        // Right lobe
        g.fillTriangle(
            topX + r * 0.5, topY,
            topX,           topY - r * 0.35,
            topX,           topY + r * 0.05
        );
        // Center knot
        g.fillStyle(0xFF4466, 1);
        g.fillCircle(topX, topY - r * 0.15, r * 0.1);
    }

    if (decoration === 'beanie') {
        // Jr. Pac-Man beanie: a small rounded cap + propeller
        g.fillStyle(0xFF4400, 1);
        g.fillCircle(topX, topY, r * 0.3);
        // Propeller: 2 tiny blades
        g.fillStyle(0x44AAFF, 1);
        g.fillRect(topX - r * 0.25, topY - r * 0.45, r * 0.5, r * 0.08);
        g.fillRect(topX - r * 0.04, topY - r * 0.65, r * 0.08, r * 0.5);
    }

    if (decoration === 'bowtie') {
        // Bowtie at the front of the Pac-Man (mouth side)
        const fwX = cx + Math.cos(rotation) * r * 0.9;
        const fwY = cy + Math.sin(rotation) * r * 0.9;
        g.fillStyle(0x4444FF, 1);
        // Left wing
        g.fillTriangle(
            fwX - r * 0.35, fwY - r * 0.15,
            fwX,             fwY,
            fwX - r * 0.35, fwY + r * 0.15
        );
        // Right wing
        g.fillTriangle(
            fwX + r * 0.35, fwY - r * 0.15,
            fwX,             fwY,
            fwX + r * 0.35, fwY + r * 0.15
        );
        g.fillStyle(0x8888FF, 1);
        g.fillCircle(fwX, fwY, r * 0.08);
    }
}

// ---------------------------------------------------------------
// FRUIT
// ---------------------------------------------------------------

const FRUIT_EMOJI = { cherry: '🍒', strawberry: '🍓', orange: '🍊' };

export function drawFruit(g, state, layout) {
    if (!state.fruit) return;
    // Fruit is drawn as a text emoji by the scene (no graphics needed here)
    // We just draw a background circle so it's visible without emoji support
    const { x, y } = srv2canvas(state.fruit.x, state.fruit.y, layout);
    const r = layout.cellSize * 0.55;
    g.fillStyle(0xFFAA00, 0.25);
    g.fillCircle(x, y, r);
}

// ---------------------------------------------------------------
// POPUPS (ghost eat score, fruit score)
// ---------------------------------------------------------------

export function drawPopups(g, state, layout) {
    if (!state.popups?.length) return;
    for (const popup of state.popups) {
        const { x, y } = srv2canvas(popup.x, popup.y, layout);
        const alpha = Math.min(1, popup.ttl / 400);
        g.fillStyle(0xFFFFFF, alpha);
        // Just a highlight; text is drawn via scene.add.text in production
        // For now a simple circle marker
        g.fillCircle(x, y, 4);
    }
}
