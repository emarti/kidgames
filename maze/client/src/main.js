import Phaser from 'phaser';
import BootScene from './game/scenes/BootScene.js';
import MenuScene from './game/scenes/MenuScene.js';
import PlayScene from './game/scenes/PlayScene.js';
import { Net } from './net.js';

function getViewportSize() {
  // iOS Safari: visualViewport represents the actually visible area (excludes browser UI).
  const vv = window.visualViewport;
  const w = Math.floor(vv?.width || window.innerWidth || 800);
  const h = Math.floor(vv?.height || window.innerHeight || 600);
  return { w, h };
}

function applyViewportSizing() {
  const { w, h } = getViewportSize();

  const safeBottomStr = getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom');
  const safeBottom = Math.max(0, Math.floor(parseFloat(safeBottomStr) || 0));

  // Some iPad Safari configurations still cover part of the page with bottom UI
  // while reporting `safe-area-inset-bottom: 0px`. Add a small conservative
  // reserve in that case so the canvas and touch controls stay fully visible.
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/i.test(ua);
  const extraBottomReserve = (isIOS && window.visualViewport && safeBottom === 0)
    ? 32
    : 0;

  const usableH = Math.max(120, h - safeBottom - extraBottomReserve);

  // Drive CSS sizing via vars AND an explicit px height on #app.
  // (Older iOS Safari can still mis-handle vh/dvh in edge cases.)
  const vh = usableH * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);

  const app = document.getElementById('app');
  if (app) {
    app.style.width = `${w}px`;
    app.style.height = `${usableH}px`;
  }

  return { w, h: usableH };
}

// Run once before Phaser is created.
applyViewportSizing();

function getInitialCanvasSize() {
  return applyViewportSizing();
}

export const gameConfig = {
  type: Phaser.AUTO,
  width: getInitialCanvasSize().w,
  height: getInitialCanvasSize().h,
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

function resizeGameToApp() {
  const { w, h } = applyViewportSizing();
  // Guard against transient zeros during orientation changes.
  if (!w || !h) return;
  // In RESIZE mode Phaser normally follows the parent size, but on iOS Safari
  // the visual viewport can change without a reliable window resize, so we
  // enforce it here.
  try {
    game.scale.resize(w, h);
  } catch {
    // ignore
  }
}

const handleResize = () => {
  resizeGameToApp();
  setTimeout(() => {
    resizeGameToApp();
  }, 250);
};

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', handleResize);
}
