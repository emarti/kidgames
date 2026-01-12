import Phaser from 'phaser';
import BootScene from './game/scenes/BootScene.js';
import MenuScene from './game/scenes/MenuScene.js';
import PlayScene from './game/scenes/PlayScene.js';
import { Net } from './net.js';

// Global game object to hold net connection
export const gameConfig = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'app',
    backgroundColor: '#AAAAAA', // Matches CSS
    pixelArt: true,
    scene: [BootScene, MenuScene, PlayScene]
};

const game = new Phaser.Game(gameConfig);
game.net = new Net(); // Attach networking helper
