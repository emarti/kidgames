/**
 * Archimedes — Module 3: Pulley Builder
 * Pure physics math — no state mutation, no side effects.
 *
 * All functions take plain data objects and return new values.
 * Import and call from archimedes_pulley_sim.js.
 */

import { clamp } from './maze_utils.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const GRAVITY               = 9.8;
export const MAX_LOAD_SPEED        = 120;
export const MOVABLE_PULLEY_OFFSET = 30;   // world units below load
export const ARRIVE_TOLERANCE      = 8;    // world units — atTop threshold
export const PLAYER_MAX_LIFT       = 12;   // kg-equivalent max a single player can lift

// ── Liftability check ─────────────────────────────────────────────────────────

/**
 * Return true if the players can lift the load with this MA and counterweight.
 * netMass = load mass after counterweight. Each player can lift PLAYER_MAX_LIFT kg-equivalent.
 */
export function canLiftLoad(loadMass, cwMass, ma, nPlayers = 1) {
  const netMass = Math.max(0, loadMass - cwMass);
  return (netMass / ma) <= PLAYER_MAX_LIFT * nPlayers;
}

// ── MA ────────────────────────────────────────────────────────────────────────

/**
 * Return the effective mechanical advantage for a rig.
 * Windlass MA is computed from drum geometry; all other levels use rig.MA.
 */
export function computeMA(rig) {
  if (rig.windlass) {
    const w = rig.windlass;
    const dr = w.drumA.radius - w.drumB.radius;
    if (Math.abs(dr) < 0.001) return 1;
    return (2 * w.handleRadius) / dr;
  }
  return rig.MA || 1;
}

/**
 * Clamp load position to [targetY, homeY] and set atTop flag.
 * Returns { y, vy, atTop }.
 */
export function clampLoad(load, newY, newVy) {
  let y  = newY;
  let vy = newVy;

  // Floor: cannot fall below home
  if (y > load.homeY) { y = load.homeY; vy = 0; }

  // Ceiling: cannot rise past target
  if (y <= load.targetY + ARRIVE_TOLERANCE) {
    y  = load.targetY;
    vy = 0;
  }

  const atTop = y <= load.targetY + ARRIVE_TOLERANCE;
  return { y, vy, atTop };
}

// ── Counterweight position ────────────────────────────────────────────────────

/**
 * When the load rises by Δ, the counterweight descends by Δ.
 * Returns the world y for the counterweight.
 */
export function computeCounterweightY(rig, loadY) {
  if (!rig.counterweight) return 0;
  const cw = rig.counterweight;
  return cw.homeY + (rig.load_homeY - loadY);
}

// ── Windlass rope pull ────────────────────────────────────────────────────────

/**
 * Given a drag delta on the crank handle, return the rope length pulled through.
 * ropeChange per radian = (drumA.radius − drumB.radius) / 2.
 */
export function computeWindlassRopePull(windlass, prevX, prevY, curX, curY) {
  const cx = windlass.centerX;
  const cy = windlass.centerY;
  const ax = prevX - cx, ay = prevY - cy;
  const bx = curX  - cx, by = curY  - cy;
  const cross = ax * by - ay * bx;
  const dot   = ax * bx + ay * by;
  const dAngle = Math.atan2(cross, dot);
  const ropePerRad = (windlass.drumA.radius - windlass.drumB.radius) / 2;
  return dAngle * ropePerRad; // positive = rope pulled = load rises
}

// ── Feasibility check ─────────────────────────────────────────────────────────

/**
 * Determine whether the current configuration can lift the load.
 * Uses canLiftLoad; returns { canLift } for the hint system.
 */
export function checkLoadFeasibility(rig, load, cwMass, nPlayers, dynamicMA) {
  const ma = dynamicMA ?? computeMA(rig);
  const canLift = canLiftLoad(load.mass, cwMass || 0, ma, Math.max(1, nPlayers || 1));
  return { canLift };
}

// ── Rope endpoint resolution ──────────────────────────────────────────────────

/**
 * Resolve a rope endpoint id to world { x, y } coordinates.
 * endpointId can be:
 *   'anchor'               — ceiling anchor
 *   'load'                 — top-center of load
 *   'ep_<id>'              — effort point
 *   'fp_<id>'              — fixed pulley node
 *   'mp_<id>'              — movable pulley node
 *   'cw'                   — counterweight top-center
 *   'windlass'             — windlass center
 *   'mp_<slotId>'          — movable pulley for a building-mechanic slot
 *   'fp_<slotId>'          — fixed pulley for a building-mechanic slot
 */
export function resolveRopeEndpoint(endpointId, rig, load) {
  if (endpointId === 'anchor') {
    return { x: rig.anchorX, y: rig.anchorY };
  }
  if (endpointId === 'load') {
    return { x: load.x, y: load.y - (load.radius || 20) };
  }
  if (endpointId === 'cw' && rig.counterweight) {
    const cw = rig.counterweight;
    return { x: cw.x, y: cw.y };
  }
  // Windlass
  if (endpointId === 'windlass' && rig.windlass) {
    return { x: rig.windlass.centerX, y: rig.windlass.centerY };
  }
  // Effort points
  const ep = rig.effortPoints?.find(e => e.id === endpointId);
  if (ep) return { x: ep.x, y: ep.y };
  // Fixed pulleys (pre-placed, e.g. 'fp1')
  const fp = rig.fixedPulleys?.find(p => p.id === endpointId);
  if (fp) return { x: fp.x, y: fp.y };
  // Movable pulleys (pre-placed, e.g. 'mp1')
  const mp = rig.movablePulleys?.find(p => p.id === endpointId);
  if (mp) return { x: mp.x, y: mp.y };

  // Building-mechanic slot pulleys: 'mp_slot1', 'fp_slot1', etc.
  if (endpointId.startsWith('mp_')) {
    const slotId = endpointId.slice(3);
    const slot = rig.pulleySlots?.find(s => s.id === slotId);
    if (slot) {
      return { x: slot.fixedX + (slot.movableXOffset || 0), y: load.y - MOVABLE_PULLEY_OFFSET };
    }
  }
  if (endpointId.startsWith('fp_')) {
    const slotId = endpointId.slice(3);
    const slot = rig.pulleySlots?.find(s => s.id === slotId);
    if (slot) {
      return { x: slot.fixedX, y: slot.fixedY };
    }
  }

  return { x: 0, y: 0 };
}
