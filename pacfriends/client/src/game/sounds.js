/**
 * Pacfriends Web Audio API sound effects.
 * All sounds are synthesized procedurally — no audio files needed.
 */

export class Sounds {
    constructor() {
        this._ctx = null;
        this._enabled = true;
        this._chompPhase = 0;
        this._sirenNode = null;
        this._sirenGain = null;
    }

    _getCtx() {
        if (!this._ctx) {
            try {
                this._ctx = new (window.AudioContext || window.webkitAudioContext)();
            } catch {
                return null;
            }
        }
        if (this._ctx.state === 'suspended') {
            this._ctx.resume().catch(() => {});
        }
        return this._ctx;
    }

    setEnabled(v) {
        this._enabled = Boolean(v);
        if (!this._enabled) this.stopSiren();
    }

    get enabled() {
        return this._enabled;
    }

    // ---------------------------------------------------------------
    // Waka-waka (dot chomp) — alternate between two pitches
    // ---------------------------------------------------------------
    playChomp() {
        if (!this._enabled) return;
        const ctx = this._getCtx();
        if (!ctx) return;
        try {
            const freq = this._chompPhase % 2 === 0 ? 220 : 180;
            this._chompPhase++;
            const t0 = ctx.currentTime + 0.01;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, t0);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t0 + 0.06);
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.linearRampToValueAtTime(0.08, t0 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + 0.08);
        } catch { /* ignore */ }
    }

    // ---------------------------------------------------------------
    // Power pellet — ascending bright tone
    // ---------------------------------------------------------------
    playPowerPellet() {
        if (!this._enabled) return;
        const ctx = this._getCtx();
        if (!ctx) return;
        try {
            const t0 = ctx.currentTime + 0.01;
            const freqs = [330, 440, 550, 660];
            const master = ctx.createGain();
            master.gain.setValueAtTime(0.12, t0);
            master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
            master.connect(ctx.destination);
            freqs.forEach((f, i) => {
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, t0 + i * 0.07);
                osc.connect(master);
                osc.start(t0 + i * 0.07);
                osc.stop(t0 + i * 0.07 + 0.12);
            });
        } catch { /* ignore */ }
    }

    // ---------------------------------------------------------------
    // Ghost eat — quick ascending arpeggio
    // ---------------------------------------------------------------
    playGhostEat() {
        if (!this._enabled) return;
        const ctx = this._getCtx();
        if (!ctx) return;
        try {
            const t0 = ctx.currentTime + 0.01;
            const freqs = [440, 554, 659, 880];
            const master = ctx.createGain();
            master.gain.setValueAtTime(0.15, t0);
            master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
            master.connect(ctx.destination);
            freqs.forEach((f, i) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(f, t0);
                g.gain.setValueAtTime(0.0001, t0 + i * 0.045);
                g.gain.linearRampToValueAtTime(0.9, t0 + i * 0.045 + 0.01);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.045 + 0.09);
                osc.connect(g);
                g.connect(master);
                osc.start(t0 + i * 0.045);
                osc.stop(t0 + i * 0.045 + 0.1);
            });
        } catch { /* ignore */ }
    }

    // ---------------------------------------------------------------
    // Player death — descending slide
    // ---------------------------------------------------------------
    playDeath() {
        if (!this._enabled) return;
        const ctx = this._getCtx();
        if (!ctx) return;
        try {
            const t0 = ctx.currentTime + 0.01;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, t0);
            osc.frequency.exponentialRampToValueAtTime(55, t0 + 1.2);
            gain.gain.setValueAtTime(0.15, t0);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + 1.4);
        } catch { /* ignore */ }
    }

    // ---------------------------------------------------------------
    // Fruit collect — bright chime
    // ---------------------------------------------------------------
    playFruit() {
        if (!this._enabled) return;
        const ctx = this._getCtx();
        if (!ctx) return;
        try {
            const t0 = ctx.currentTime + 0.01;
            const freqs = [784, 1046, 1318];
            const master = ctx.createGain();
            master.gain.setValueAtTime(0.12, t0);
            master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
            master.connect(ctx.destination);
            freqs.forEach((f, i) => {
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, t0 + i * 0.06);
                osc.connect(master);
                osc.start(t0 + i * 0.06);
                osc.stop(t0 + i * 0.06 + 0.25);
            });
        } catch { /* ignore */ }
    }

    // ---------------------------------------------------------------
    // Level complete — victory jingle
    // ---------------------------------------------------------------
    playLevelComplete() {
        if (!this._enabled) return;
        const ctx = this._getCtx();
        if (!ctx) return;
        try {
            const t0 = ctx.currentTime + 0.05;
            const notes = [
                [523, 0.0], [659, 0.12], [784, 0.24], [1047, 0.36],
                [784, 0.50], [1047, 0.60],
            ];
            const master = ctx.createGain();
            master.gain.setValueAtTime(0.15, t0);
            master.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
            master.connect(ctx.destination);
            for (const [freq, dt] of notes) {
                const osc = ctx.createOscillator();
                osc.type = 'square';
                osc.frequency.value = freq;
                osc.connect(master);
                osc.start(t0 + dt);
                osc.stop(t0 + dt + 0.14);
            }
        } catch { /* ignore */ }
    }

    // ---------------------------------------------------------------
    // Ghost siren (background ambient oscillation while playing)
    // ---------------------------------------------------------------
    startSiren(frightened = false) {
        if (!this._enabled) return;
        const ctx = this._getCtx();
        if (!ctx) return;
        try {
            this.stopSiren();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = frightened ? 350 : 120;
            gain.gain.value = frightened ? 0.03 : 0.015;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            this._sirenNode = osc;
            this._sirenGain = gain;
        } catch { /* ignore */ }
    }

    stopSiren() {
        try {
            if (this._sirenNode) {
                this._sirenNode.stop();
                this._sirenNode.disconnect();
                this._sirenNode = null;
            }
            if (this._sirenGain) {
                this._sirenGain.disconnect();
                this._sirenGain = null;
            }
        } catch { /* ignore */ }
    }
}
