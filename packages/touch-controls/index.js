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

export function getTouchControlsReserve({
  enabled,
  keyW = 78,
  keyH = 54,
  gap = 8,
  margin = 20,
  extraW = 8,
  extraH = 16,
  includeAction = false,
  actionW,
  actionH,
} = {}) {
  if (!enabled) return { w: 0, h: 0 };

  const dpadW = (keyW * 3) + (gap * 2);
  const dpadH = (keyH * 2) + gap;
  const pauseW = (keyW * 2) + gap;
  const pauseH = keyH;

  const resolvedActionW = actionW ?? pauseW;
  const resolvedActionH = actionH ?? keyH;
  const actionRowH = includeAction ? (gap + resolvedActionH) : 0;

  const totalH = dpadH + gap + pauseH + actionRowH;

  const totalW = Math.max(dpadW, pauseW, includeAction ? resolvedActionW : 0);

  return {
    // This is used as a bottom-right "keep clear" rectangle.
    w: totalW + margin + extraW,
    h: totalH + margin + extraH,
  };
}

export function createTouchControls(scene, {
  onDir,
  onDirDown,
  onDirUp,
  onPause,
  actions = [],
  onAction,
  onActionDown,
  onActionUp,
  depth = 200,
  alpha = 0.6,
  margin = 20,
  keyW = 78,
  keyH = 54,
  gap = 8,
  pauseLabel = 'Pause',
  actionW,
  actionH,
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

  const resolvedActionW = actionW ?? pauseW;
  const resolvedActionH = actionH ?? keyH;

  const container = scene.add.container(0, 0);
  container.setDepth(depth);
  if (Number.isFinite(alpha)) container.setAlpha(alpha);

  const toColorInt = (hex) => parseInt(String(hex).replace('#', '0x'), 16);

  const makeKey = ({ label, w, h, fontSize, cbDown, cbUp, themeOverride }) => {
    const key = scene.add.container(0, 0);

    const th = themeOverride || theme;

    const bg = scene.add.rectangle(0, 0, w, h, toColorInt(th.face), 1).setOrigin(0.5);
    bg.setStrokeStyle(2, toColorInt(th.stroke), 1);
    bg.setInteractive({ useHandCursor: true });

    const text = scene.add.text(0, 0, label, {
      fontSize: fontSize || '26px',
      color: th.text,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const setFace = (face) => bg.setFillStyle(toColorInt(face), 1);

    bg.on('pointerover', () => setFace(th.faceHover));
    bg.on('pointerdown', () => {
      setFace(th.faceDown);
      if (cbDown) cbDown();
    });
    bg.on('pointerup', () => {
      setFace(th.faceHover);
      if (cbUp) cbUp();
    });

    // If the finger slides off, treat it as a release for hold-based controls.
    bg.on('pointerout', () => {
      setFace(th.face);
      if (cbUp) cbUp();
    });

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
    cbDown: () => onPause && onPause(),
  });

  const dirDown = (dir) => {
    if (onDirDown) onDirDown(dir);
    else if (onDir) onDir(dir);
  };
  const dirUp = (dir) => {
    if (onDirUp) onDirUp(dir);
  };

  const upBtn = makeKey({ label: '▲', w: keyW, h: keyH, cbDown: () => dirDown('UP'), cbUp: () => dirUp('UP') });
  const leftBtn = makeKey({ label: '◀', w: keyW, h: keyH, cbDown: () => dirDown('LEFT'), cbUp: () => dirUp('LEFT') });
  const downBtn = makeKey({ label: '▼', w: keyW, h: keyH, cbDown: () => dirDown('DOWN'), cbUp: () => dirUp('DOWN') });
  const rightBtn = makeKey({ label: '▶', w: keyW, h: keyH, cbDown: () => dirDown('RIGHT'), cbUp: () => dirUp('RIGHT') });

  const actionButtons = [];
  for (const a of actions) {
    if (!a) continue;
    const id = String(a.id ?? 'action');
    const label = String(a.label ?? id);
    const actionTheme = a.theme && typeof a.theme === 'object' ? a.theme : undefined;
    const btn = makeKey({
      label,
      w: resolvedActionW,
      h: resolvedActionH,
      fontSize: '22px',
      themeOverride: actionTheme,
      cbDown: () => {
        if (onActionDown) onActionDown(id);
        else if (onAction) onAction(id);
        else if (typeof a.onPress === 'function') a.onPress(id);
      },
      cbUp: () => {
        if (onActionUp) onActionUp(id);
      }
    });
    actionButtons.push({ id, btn });
  }

  container.add([pauseBtn, upBtn, leftBtn, downBtn, rightBtn, ...actionButtons.map((a) => a.btn)]);

  const position = () => {
    const W = scene.scale.width;
    const H = scene.scale.height;

    const actionN = actionButtons.length;
    const actionsBlockH = actionN > 0
      ? (resolvedActionH * actionN) + (gap * (actionN - 1))
      : 0;
    // Extra vertical space needed below the d-pad to keep action buttons on-screen.
    // The layout uses: [dpad] + gap + [actions...]
    const actionsBelowDpadH = actionN > 0 ? (gap + actionsBlockH) : 0;

    const baseX = W - margin - (dpadW / 2);
    const baseY = H - margin - (dpadH / 2) - actionsBelowDpadH;

    upBtn.setPosition(baseX, baseY - (keyH / 2) - (gap / 2));
    leftBtn.setPosition(baseX - (keyW + gap), baseY + (keyH / 2) + (gap / 2));
    downBtn.setPosition(baseX, baseY + (keyH / 2) + (gap / 2));
    rightBtn.setPosition(baseX + (keyW + gap), baseY + (keyH / 2) + (gap / 2));

    pauseBtn.setPosition(baseX, baseY - (dpadH / 2) - gap - (pauseH / 2));

    // Action buttons go below the d-pad (centered).
    if (actionButtons.length > 0) {
      const actionY = baseY + (dpadH / 2) + gap + (resolvedActionH / 2);
      // If multiple, stack them downward.
      for (let i = 0; i < actionButtons.length; i++) {
        actionButtons[i].btn.setPosition(baseX, actionY + i * (resolvedActionH + gap));
      }
    }
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
    buttons: { pauseBtn, upBtn, leftBtn, downBtn, rightBtn, actionButtons },
    position,
    destroy: cleanup,
  };
}
