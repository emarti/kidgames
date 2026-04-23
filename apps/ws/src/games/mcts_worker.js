/**
 * mcts_worker.js — Worker thread entry point for MCTS hint engines.
 *
 * Receives: { module: string (file:// URL), state: object }
 * Posts back: { move: object | null } or { error: string }
 *
 * Running MCTS in a worker thread prevents blocking the main event loop
 * (which would stall comet ticks, snake ticks, etc. for up to 1500ms).
 */

import { workerData, parentPort } from 'worker_threads';

const { module: moduleUrl, state } = workerData;

try {
  const mod = await import(moduleUrl);
  const result = mod.suggestMove(state);
  parentPort.postMessage({ move: result?.move ?? null });
} catch (err) {
  parentPort.postMessage({ error: String(err?.message ?? err) });
}
