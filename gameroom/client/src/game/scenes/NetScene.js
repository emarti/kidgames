import Phaser from 'phaser';

/**
 * Base scene that auto-tracks event listeners for clean shutdown.
 * Scenes extending this get `_on(emitter, event, cb)` for registration
 * and automatic cleanup in `shutdown()`.
 */
export default class NetScene extends Phaser.Scene {
  constructor(config) {
    super(config);
    this._listeners = [];
  }

  /** Register an event listener that will be removed on shutdown. */
  _on(emitter, event, cb) {
    emitter.addEventListener(event, cb);
    this._listeners.push({ emitter, event, cb });
  }

  shutdown() {
    for (const { emitter, event, cb } of this._listeners) {
      emitter.removeEventListener(event, cb);
    }
    this._listeners = [];
  }
}
