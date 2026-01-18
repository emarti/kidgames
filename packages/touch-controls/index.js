export function isTouchDevice() {
  // Explicit override (useful for desktop testing / flaky emulators)
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('touch') === '1') return true;
  } catch {
    // ignore
  }
  try {
    if (localStorage.getItem('forceTouchControls') === '1') return true;
  } catch {
    // ignore
  }

  // iOS Safari: ontouchstart/maxTouchPoints
  // Desktop responsive emulators: often report coarse pointer / no hover
  if (('ontouchstart' in window) || (navigator.maxTouchPoints > 0)) return true;
  if (typeof window !== 'undefined' && window.matchMedia) {
    try {
      return window.matchMedia('(pointer: coarse), (any-pointer: coarse), (hover: none)').matches;
    } catch {
      // ignore
    }
  }

  // Last-resort heuristic: if it looks like a phone/tablet-sized viewport, show it.
  // (Better to overlap slightly than to strand the player without controls.)
  try {
    const w = window.innerWidth || 0;
    const h = window.innerHeight || 0;
    if (Math.min(w, h) > 0 && Math.min(w, h) <= 900) return true;
  } catch {
    // ignore
  }

  return false;
}

export function getTouchControlsReserve({ enabled, keyW = 78, keyH = 54, gap = 8, margin = 20, extraW = 8, extraH = 16 } = {}) {
  if (!enabled) return { w: 0, h: 0 };

  const dpadW = (keyW * 3) + (gap * 2);
  const dpadH = (keyH * 2) + gap;
  const pauseW = (keyW * 2) + gap;
  const pauseH = keyH;
  const totalH = dpadH + gap + pauseH;

  return {
    // This is used as a bottom-right "keep clear" rectangle.
    w: dpadW + margin + extraW,
    h: totalH + margin + extraH,
  };
}

export function createTouchControls(scene, {
  onDir,
  onPause,
  depth = 200,
  margin = 20,
  keyW = 78,
  keyH = 54,
  gap = 8,
  pauseLabel = 'Pause',
  theme = {
    face: '#e5e5e5',
    faceHover: '#f0f0f0',
    faceDown: '#d6d6d6',
    stroke: '#222222',
    text: '#111111',
  },
} = {}) {
  const dpadW = (keyW * 3) + (gap * 2);
  const dpadH = (keyH * 2) + gap;
  const pauseW = (keyW * 2) + gap;
  const pauseH = keyH;

  const container = scene.add.container(0, 0);
  container.setDepth(depth);

  const toColorInt = (hex) => parseInt(String(hex).replace('#', '0x'), 16);

  const makeKey = ({ label, w, h, fontSize, cb }) => {
    const key = scene.add.container(0, 0);

    const bg = scene.add.rectangle(0, 0, w, h, toColorInt(theme.face), 1).setOrigin(0.5);
    bg.setStrokeStyle(2, toColorInt(theme.stroke), 1);
    bg.setInteractive({ useHandCursor: true });

    const text = scene.add.text(0, 0, label, {
      fontSize: fontSize || '26px',
      color: theme.text,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const setFace = (face) => bg.setFillStyle(toColorInt(face), 1);

    bg.on('pointerover', () => setFace(theme.faceHover));
    bg.on('pointerout', () => setFace(theme.face));
    bg.on('pointerdown', () => {
      setFace(theme.faceDown);
      if (cb) cb();
    });
    bg.on('pointerup', () => setFace(theme.faceHover));

    key.add([bg, text]);
    key._bg = bg;
    key._text = text;
    return key;
  };

  const pauseBtn = makeKey({
    label: pauseLabel,
    w: pauseW,
    h: pauseH,
    fontSize: '22px',
    cb: () => onPause && onPause(),
  });

  const upBtn = makeKey({ label: '▲', w: keyW, h: keyH, cb: () => onDir && onDir('UP') });
  const leftBtn = makeKey({ label: '◀', w: keyW, h: keyH, cb: () => onDir && onDir('LEFT') });
  const downBtn = makeKey({ label: '▼', w: keyW, h: keyH, cb: () => onDir && onDir('DOWN') });
  const rightBtn = makeKey({ label: '▶', w: keyW, h: keyH, cb: () => onDir && onDir('RIGHT') });

  container.add([pauseBtn, upBtn, leftBtn, downBtn, rightBtn]);

  const position = () => {
    const W = scene.scale.width;
    const H = scene.scale.height;

    const baseX = W - margin - (dpadW / 2);
    const baseY = H - margin - (dpadH / 2);

    upBtn.setPosition(baseX, baseY - (keyH / 2) - (gap / 2));
    leftBtn.setPosition(baseX - (keyW + gap), baseY + (keyH / 2) + (gap / 2));
    downBtn.setPosition(baseX, baseY + (keyH / 2) + (gap / 2));
    rightBtn.setPosition(baseX + (keyW + gap), baseY + (keyH / 2) + (gap / 2));

    pauseBtn.setPosition(baseX, baseY - (dpadH / 2) - gap - (pauseH / 2));
  };

  position();
  scene.scale.on('resize', position);

  const cleanup = () => {
    scene.scale.off('resize', position);
    container.destroy(true);
  };

  scene.events.once('shutdown', cleanup);
  scene.events.once('destroy', cleanup);

  return {
    container,
    buttons: { pauseBtn, upBtn, leftBtn, downBtn, rightBtn },
    position,
    destroy: cleanup,
  };
}
