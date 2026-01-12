import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        // Preload assets here if we had any images.
        // For now, we will draw everything procedurally using Graphics.
    }

    create() {
        // Connect to server immediately?
        // Or wait until user interaction?
        // Let's connect immediately for simplicity in local dev.
        this.game.net.connect();

        // Wait for connection to enable UI? 
        // Or just go to Menu and show "Connecting..."
        this.scene.start('MenuScene');
    }
}
