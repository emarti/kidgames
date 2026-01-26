const STORAGE_KEY = 'maze:soundsEnabled';

let enabledCache;

function readEnabledFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return false; // default OFF
    return raw === '1' || raw === 'true' || raw === 'on';
  } catch {
    return false;
  }
}

export function getEnabled() {
  if (enabledCache === undefined) enabledCache = readEnabledFromStorage();
  return Boolean(enabledCache);
}

export function setEnabled(nextEnabled) {
  enabledCache = Boolean(nextEnabled);
  try {
    localStorage.setItem(STORAGE_KEY, enabledCache ? '1' : '0');
  } catch {
    // ignore
  }
}

const MASTER_VOLUME = 0.06; // intentionally quiet (longer sounds)

let audioContext;
let masterGain;

function getAudioContextCtor() {
  return window.AudioContext || window.webkitAudioContext;
}

function ensureContext_() {
  if (!getEnabled()) return null;

  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;

  if (!audioContext) {
    audioContext = new Ctor();
    masterGain = audioContext.createGain();
    masterGain.gain.value = MASTER_VOLUME;
    masterGain.connect(audioContext.destination);
  }

  return audioContext;
}

export async function ensureUnlocked() {
  const ctx = ensureContext_();
  if (!ctx) return false;

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }

  return ctx.state === 'running';
}

export function isUnlocked() {
  return Boolean(audioContext && audioContext.state === 'running');
}

function now_(ctx) {
  // Keep slightly in the future to avoid Safari scheduling glitches.
  return Math.max(ctx.currentTime, (ctx.currentTime || 0) + 0.005);
}

function makeGain_(ctx, value) {
  const g = ctx.createGain();
  g.gain.value = value;
  g.connect(masterGain);
  return g;
}

function makeWaveShaper_(ctx, amount = 0.6) {
  const sh = ctx.createWaveShaper();
  const a = clamp_(Number(amount) || 0, 0, 2);
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    // Soft clip (tanh-ish) to add brightness without getting harsh.
    curve[i] = Math.tanh(x * (1 + a * 3));
  }
  sh.curve = curve;
  sh.oversample = '2x';
  return sh;
}

let noiseBuf_;
function getNoiseBuffer_(ctx) {
  if (noiseBuf_ && noiseBuf_.sampleRate === ctx.sampleRate) return noiseBuf_;
  const seconds = 1.0;
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
  noiseBuf_ = b;
  return b;
}

function addNoiseClick_(ctx, t0, outGain, { hp = 900, lp = 4500, dur = 0.06, peak = 0.10 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer_(ctx);

  const hpF = ctx.createBiquadFilter();
  hpF.type = 'highpass';
  hpF.frequency.setValueAtTime(hp, t0);
  hpF.Q.setValueAtTime(0.7, t0);

  const lpF = ctx.createBiquadFilter();
  lpF.type = 'lowpass';
  lpF.frequency.setValueAtTime(lp, t0);
  lpF.Q.setValueAtTime(0.7, t0);

  const g = ctx.createGain();
  env_(g.gain, t0, 0.001, 0.015, 0.20, dur, peak);

  src.connect(hpF).connect(lpF).connect(g).connect(outGain);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

function env_(param, t0, a, d, s, r, peak) {
  // ADSR-ish envelope (linear for simplicity / compatibility).
  param.cancelScheduledValues(t0);
  param.setValueAtTime(0.00001, t0);
  param.linearRampToValueAtTime(peak, t0 + a);
  param.linearRampToValueAtTime(peak * s, t0 + a + d);
  param.linearRampToValueAtTime(0.00001, t0 + a + d + r);
}

function scheduleTwo_(cb, t0, gapSec = 0.32) {
  cb(t0);
  cb(t0 + gapSec);
}

function clamp_(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

export function playChomp() {
  if (!getEnabled()) return;
  const ctx = ensureContext_();
  if (!ctx) return;
  // Best-effort unlock (only works on user gesture on iOS).
  void ensureUnlocked();

  const baseT = now_(ctx);
  scheduleTwo_((t0) => {
    const g = makeGain_(ctx, 0.0);

    // Sharp "bite" transient.
    addNoiseClick_(ctx, t0, g, { hp: 1400, lp: 6000, dur: 0.04, peak: 0.12 });

    // Classic arcade "waka" - rapid pitch sweep from high to mid.
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(700, t0);
    osc.frequency.exponentialRampToValueAtTime(350, t0 + 0.08);
    osc.frequency.exponentialRampToValueAtTime(250, t0 + 0.15);

    const sh = makeWaveShaper_(ctx, 0.7);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t0);
    lp.frequency.exponentialRampToValueAtTime(1200, t0 + 0.18);
    lp.Q.setValueAtTime(1.2, t0);

    osc.connect(sh).connect(lp).connect(g);

    // Quick attack + smooth sustain/release for arcade feel.
    env_(g.gain, t0, 0.003, 0.08, 0.7, 0.20, 0.26);

    osc.start(t0);
    osc.stop(t0 + 0.35);
  }, baseT, 0.16);
}

export function playChink() {
  if (!getEnabled()) return;
  const ctx = ensureContext_();
  if (!ctx) return;
  void ensureUnlocked();

  const baseT = now_(ctx);
  scheduleTwo_((t0) => {
    const g = makeGain_(ctx, 0.0);
    env_(g.gain, t0, 0.002, 0.06, 0.25, 1.10, 0.16);

    const freqs = [1240, 1860];
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t0);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f, t0);
      bp.Q.setValueAtTime(10, t0);

      osc.connect(bp).connect(g);
      osc.start(t0);
      osc.stop(t0 + 1.35);
    }
  }, baseT, 0.36);
}

export function playQuack() {
  if (!getEnabled()) return;
  const ctx = ensureContext_();
  if (!ctx) return;
  void ensureUnlocked();

  const baseT = now_(ctx);
  scheduleTwo_((t0) => {
    const g = makeGain_(ctx, 0.0);

    // Short "beak" click for clarity.
    addNoiseClick_(ctx, t0, g, { hp: 1600, lp: 7000, dur: 0.03, peak: 0.10 });

    // Dual detuned oscillators for a fuller, more realistic duck sound.
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';

    const base = 620;
    osc1.frequency.setValueAtTime(base, t0);
    osc1.frequency.linearRampToValueAtTime(base - 180, t0 + 0.12);
    
    // Slightly detune second osc for chorus effect.
    osc2.frequency.setValueAtTime(base * 1.02, t0);
    osc2.frequency.linearRampToValueAtTime((base - 180) * 1.02, t0 + 0.12);

    const sh = makeWaveShaper_(ctx, 0.6);
    const mix = ctx.createGain();
    mix.gain.setValueAtTime(0.5, t0);

    osc1.connect(mix);
    osc2.connect(mix);
    mix.connect(sh);

    // Two formants for duck "vowel" (nasal honk).
    const bp1 = ctx.createBiquadFilter();
    bp1.type = 'bandpass';
    bp1.frequency.setValueAtTime(1400, t0);
    bp1.frequency.linearRampToValueAtTime(900, t0 + 0.14);
    bp1.Q.setValueAtTime(4.0, t0);

    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.setValueAtTime(700, t0);
    bp2.frequency.linearRampToValueAtTime(500, t0 + 0.14);
    bp2.Q.setValueAtTime(2.5, t0);

    const mix2 = ctx.createGain();
    mix2.gain.setValueAtTime(0.6, t0);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t0);

    sh.connect(bp1).connect(lp).connect(g);
    sh.connect(bp2).connect(mix2).connect(lp);

    // Punchy envelope for cartoon duck.
    env_(g.gain, t0, 0.005, 0.08, 0.70, 0.18, 0.22);

    osc1.start(t0);
    osc2.start(t0);
    osc1.stop(t0 + 0.30);
    osc2.stop(t0 + 0.30);
  }, baseT, 0.18);
}

export function playTrumpet() {
  if (!getEnabled()) return;
  const ctx = ensureContext_();
  if (!ctx) return;
  void ensureUnlocked();

  const t0 = now_(ctx);

  // Triumphant little fanfare: two repeated notes, then a fifth above.
  // (e.g. C5, C5, G5)
  const root = 523.25;
  const fifth = 783.99;
  const notes = [root, root, fifth];
  const dur = 0.20;
  const gap = 0.03;

  for (let i = 0; i < notes.length; i++) {
    const ti = t0 + i * (dur + gap);

    const g = makeGain_(ctx, 0.0);
    env_(g.gain, ti, 0.02, 0.05, 0.7, 0.22, 0.18);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';

    const f0 = notes[i];
    osc.frequency.setValueAtTime(f0, ti);

    // Very light vibrato.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(6.0, ti);

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(clamp_(f0 * 0.01, 2, 8), ti); // ~1% cents-ish

    lfo.connect(lfoGain).connect(osc.frequency);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, ti);
    lp.Q.setValueAtTime(0.7, ti);

    osc.connect(lp).connect(g);

    osc.start(ti);
    osc.stop(ti + dur + 0.25);

    lfo.start(ti);
    lfo.stop(ti + dur + 0.05);
  }
}

export function playZap() {
  if (!getEnabled()) return;
  const ctx = ensureContext_();
  if (!ctx) return;
  void ensureUnlocked();

  const baseT = now_(ctx);
  scheduleTwo_((t0) => {
    const g = makeGain_(ctx, 0.0);

    // Sharp electric "zap" transient.
    addNoiseClick_(ctx, t0, g, { hp: 2400, lp: 8000, dur: 0.05, peak: 0.14 });

    // Fast rising pitch for electric charge effect.
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(180, t0);
    osc.frequency.exponentialRampToValueAtTime(840, t0 + 0.08);

    const sh = makeWaveShaper_(ctx, 0.8);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, t0);
    bp.frequency.exponentialRampToValueAtTime(3600, t0 + 0.08);
    bp.Q.setValueAtTime(3.5, t0);

    osc.connect(sh).connect(bp).connect(g);

    // Snappy envelope for electric feel.
    env_(g.gain, t0, 0.002, 0.04, 0.5, 0.12, 0.24);

    osc.start(t0);
    osc.stop(t0 + 0.18);
  }, baseT, 0.14);
}

export function playUhOh() {
  if (!getEnabled()) return;
  const ctx = ensureContext_();
  if (!ctx) return;
  void ensureUnlocked();

  const t0 = now_(ctx);
  
  // Two-note descending "uh-oh" pattern
  const notes = [
    { freq: 380, dur: 0.22 }, // "uh"
    { freq: 280, dur: 0.28 }  // "oh" (lower and slightly longer)
  ];
  
  let time = t0;
  for (const note of notes) {
    const g = makeGain_(ctx, 0.0);
    
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(note.freq, time);
    
    // Slight downward pitch bend for worried feel
    osc.frequency.exponentialRampToValueAtTime(note.freq * 0.92, time + note.dur);
    
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, time);
    lp.Q.setValueAtTime(1.5, time);
    
    osc.connect(lp).connect(g);
    
    // Natural vocal envelope
    env_(g.gain, time, 0.015, 0.05, 0.75, note.dur - 0.065, 0.20);
    
    osc.start(time);
    osc.stop(time + note.dur + 0.05);
    
    time += note.dur + 0.04; // small gap between notes
  }
}
