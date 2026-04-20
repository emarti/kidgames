import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // All graphics are procedurally drawn — nothing to preload.
  }

  create() {
    this.game.net.connect();
    this.scene.start('MenuScene');
  }
}
