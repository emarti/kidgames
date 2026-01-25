import Phaser from 'phaser';
import BootScene from './game/scenes/BootScene.js';
import MenuScene from './game/scenes/MenuScene.js';
import PlayScene from './game/scenes/PlayScene.js';
import { Net } from './net.js';

function setViewportHeightVar() {
  // Old iOS Safari: 100vh can be larger than the visible viewport.
  // Use a CSS var driven by window.innerHeight.
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

setViewportHeightVar();
window.addEventListener('resize', () => {
  // iOS sometimes reports intermediate sizes; schedule a second pass.
  setViewportHeightVar();
  setTimeout(setViewportHeightVar, 250);
});
window.addEventListener('orientationchange', () => {
  setTimeout(setViewportHeightVar, 250);
});

export const gameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: 'app',
  backgroundColor: '#AAAAAA',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, PlayScene],
};

const game = new Phaser.Game(gameConfig);
game.net = new Net();
