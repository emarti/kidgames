export function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

export function getTouchControlsReserve({ enabled, btnSize = 64, pad = 14, extraW = 20, extraH = 60 } = {}) {
  if (!enabled) return { w: 0, h: 0 };

  const clusterW = (btnSize * 3) + (pad * 2);
  const clusterH = (btnSize * 2) + pad;

  return {
    w: clusterW + extraW,
    h: clusterH + btnSize + pad + extraH,
  };
}

export function createTouchControls(scene, {
  onDir,
  onPause,
  depth = 200,
  margin = 20,
  btnSize = 64,
  pad = 14,
  pauseLabel = 'Pause',
  theme = {
    bg: '#777777',
    text: '#FFFFFF',
  },
} = {}) {
  const clusterW = (btnSize * 3) + (pad * 2);
  const clusterH = (btnSize * 2) + pad;

  const container = scene.add.container(0, 0);
  container.setDepth(depth);

  const makeBtn = (label, cb) => {
    const t = scene.add.text(0, 0, label, {
      fontSize: '28px',
      backgroundColor: theme.bg,
      color: theme.text,
      padding: { x: 18, y: 14 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    if (cb) t.on('pointerdown', cb);
    return t;
  };

  const pauseBtn = makeBtn(pauseLabel, () => onPause && onPause());
  const upBtn = makeBtn('▲', () => onDir && onDir('UP'));
  const leftBtn = makeBtn('◀', () => onDir && onDir('LEFT'));
  const downBtn = makeBtn('▼', () => onDir && onDir('DOWN'));
  const rightBtn = makeBtn('▶', () => onDir && onDir('RIGHT'));

  container.add([pauseBtn, upBtn, leftBtn, downBtn, rightBtn]);

  const position = () => {
    const W = scene.scale.width;
    const H = scene.scale.height;

    const baseX = W - margin - (clusterW / 2);
    const baseY = H - margin - (clusterH / 2);

    upBtn.setPosition(baseX, baseY - (btnSize / 2) - (pad / 2));
    leftBtn.setPosition(baseX - (btnSize + pad), baseY + (btnSize / 2) + (pad / 2));
    downBtn.setPosition(baseX, baseY + (btnSize / 2) + (pad / 2));
    rightBtn.setPosition(baseX + (btnSize + pad), baseY + (btnSize / 2) + (pad / 2));

    pauseBtn.setPosition(baseX, baseY - btnSize - pad - 26);
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
