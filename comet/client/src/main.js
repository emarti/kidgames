import Phaser from 'phaser';
import BootScene from './game/scenes/BootScene.js';
import MenuScene from './game/scenes/MenuScene.js';
import PlayScene from './game/scenes/PlayScene.js';
import { Net } from './net.js';

export const gameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: 'app',
  backgroundColor: '#0b0f1a',
  pixelArt: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, PlayScene],
};

const game = new Phaser.Game(gameConfig);
game.net = new Net();
