// ============================================================
// スマホ用タッチ操作パネル
// ・上半分：プレイヤー移動パネル（タップ位置からのスワイプ方向で8方向入力）
// ・下半分：ブロック操作パネル（中央＝コンボブロック、周囲4分割＝回転／移動）
// ・ポーズ操作は未対応（今後対応予定）
// ============================================================
(function setupTouchControls() {
  const playerPad = document.getElementById("playerPad");
  const blockPad  = document.getElementById("blockPad");
  const comboBtn  = document.getElementById("comboBtn");
  const hardDropBtn = document.getElementById("hardDropBtn");
  const softDropBtn = document.getElementById("softDropBtn");
  const padRotL   = document.getElementById("padRotL");
  const padRotR   = document.getElementById("padRotR");
  const padMoveL  = document.getElementById("padMoveL");
  const padMoveR  = document.getElementById("padMoveR");
  const stickBase = document.getElementById("stickBase");
  const stickKnob = document.getElementById("stickKnob");

  const PLAYABLE_SCENES = ["game", "boss_10f", "boss_20f", "boss_30f", "boss_40f", "boss_50f", "boss_60f", "boss_70f", "boss_80f", "boss_90f"];
  function guiActive() { return !!state && PLAYABLE_SCENES.includes(scene); }
  function noFallingBlockScene() { return scene === "boss_20f" || scene === "boss_40f" || scene === "boss_70f" || scene === "boss_80f"; }

  // ---------- プレイヤー移動パネル（8方向スワイプ） ----------
  const SWIPE_THRESHOLD = 16; // px（パネル内座標系）
  const STICK_MAX_R = 42;
  let playerPointerId = null, startX = 0, startY = 0;

  function clearPlayerKeys() {
    if (!state) return;
    state.keyStates.a = false; state.keyStates.d = false;
    state.keyStates.s = false; state.keyStates.space = false;
  }

  function applyPlayerDirection(dx, dy) {
    if (!state) return;
    clearPlayerKeys();
    const dist = Math.hypot(dx, dy);
    if (dist < SWIPE_THRESHOLD) return;
    const deg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    const sector = Math.round(deg / 45) % 8; // 0:E 1:SE 2:S 3:SW 4:W 5:NW 6:N 7:NE
    switch (sector) {
      case 0: state.keyStates.d = true; break;
      case 1: state.keyStates.d = true; state.keyStates.s = true; break;
      case 2: state.keyStates.s = true; break;
      case 3: state.keyStates.a = true; state.keyStates.s = true; break;
      case 4: state.keyStates.a = true; break;
      case 5: state.keyStates.a = true; state.keyStates.space = true; break;
      case 6: state.keyStates.space = true; break;
      case 7: state.keyStates.d = true; state.keyStates.space = true; break;
    }
    if (state.keyStates.a) state.lastHkey = "a";
    if (state.keyStates.d) state.lastHkey = "d";

    const clamped = Math.min(dist, STICK_MAX_R);
    const ang = Math.atan2(dy, dx);
    stickKnob.style.left = (startX + Math.cos(ang) * clamped) + "px";
    stickKnob.style.top  = (startY + Math.sin(ang) * clamped) + "px";
  }

  function showStick(x, y) {
    stickBase.style.display = "block";
    stickKnob.style.display = "block";
    stickBase.style.left = x + "px"; stickBase.style.top = y + "px";
    stickKnob.style.left = x + "px"; stickKnob.style.top = y + "px";
  }
  function hideStick() {
    stickBase.style.display = "none";
    stickKnob.style.display = "none";
  }

  playerPad.addEventListener("pointerdown", e => {
    e.preventDefault();
    if (!guiActive()) return;
    playerPad.setPointerCapture(e.pointerId);
    playerPointerId = e.pointerId;
    const r = playerPad.getBoundingClientRect();
    startX = e.clientX - r.left; startY = e.clientY - r.top;
    showStick(startX, startY);
    clearPlayerKeys();
  });
  playerPad.addEventListener("pointermove", e => {
    if (e.pointerId !== playerPointerId) return;
    const r = playerPad.getBoundingClientRect();
    applyPlayerDirection((e.clientX - r.left) - startX, (e.clientY - r.top) - startY);
  });
  function endPlayerTouch(e) {
    if (e.pointerId !== playerPointerId) return;
    playerPointerId = null;
    clearPlayerKeys();
    hideStick();
  }
  playerPad.addEventListener("pointerup", endPlayerTouch);
  playerPad.addEventListener("pointercancel", endPlayerTouch);

  // ---------- ブロック操作パネル ----------
  function bindTap(el, fn) {
    el.addEventListener("pointerdown", e => {
      e.preventDefault();
      if (!guiActive()) return;
      fn();
    });
  }
  bindTap(comboBtn, () => { useComboBlock(state, fb); });
  bindTap(padRotL, () => { if (!noFallingBlockScene()) fb.rotateLeft(state); });
  bindTap(padRotR, () => { if (!noFallingBlockScene()) fb.rotateRight(state); });

  // ハードドロップ：キーボードの「↑」キー押下時と同じ処理（ワンプッシュで即座に落下・固定）
  function performHardDrop() {
    if (noFallingBlockScene()) return;
    const isUpward = bossSys.isBoss60UpwardActive();
    let hitPlayerDuringDrop = false;
    if (isUpward) {
      while (!checkCollision(state, fb, fb.x, fb.y - 1)) fb.y--;
    } else {
      while (!checkCollision(state, fb, fb.x, fb.y + 1)) {
        fb.y++;
        if (!hitPlayerDuringDrop && checkCrushHarddropSweep(state, fb, player)) hitPlayerDuringDrop = true;
      }
    }
    lockBlock(state, fb);

    let forcedId = bossSys.getForcedSpawnShapeId();
    if (forcedId) { fb.spawnBlockForced(forcedId); }
    else { fb.spawnBlock(state, scene === "tutorial" ? tutState : null, false, scene === "tutorial"); }

    checkLineClear(state, true); checkCrushHarddrop(state, player);
    if (scene === "tutorial") tutState.flags.hard_dropped = true;
    if (scene === "boss_50f") _flush_line_clear_queue_50f();
  }
  bindTap(hardDropBtn, performHardDrop);

  // ソフトドロップ：キーボードの「↓」キー押しっぱなしと同じ（押している間だけ落下を高速化）
  softDropBtn.addEventListener("pointerdown", e => {
    e.preventDefault();
    if (!guiActive()) return;
    softDropBtn.setPointerCapture(e.pointerId);
    if (bossSys.isBoss60UpwardActive()) state.keyStates.up = true;
    else state.keyStates.down = true;
  });
  function endSoftDrop() { if (state) { state.keyStates.down = false; state.keyStates.up = false; } }
  softDropBtn.addEventListener("pointerup", endSoftDrop);
  softDropBtn.addEventListener("pointercancel", endSoftDrop);

  function startMoveLeft() {
    if (!guiActive() || noFallingBlockScene()) return;
    if (!bms.leftHeld) { bms.leftHeld = true; bms.holdFrames = 0; bms.repeatAcc = 0; }
    bms.rightHeld = false;
  }
  function endMoveLeft() { bms.leftHeld = false; bms.holdFrames = 0; bms.repeatAcc = 0; }
  function startMoveRight() {
    if (!guiActive() || noFallingBlockScene()) return;
    if (!bms.rightHeld) { bms.rightHeld = true; bms.holdFrames = 0; bms.repeatAcc = 0; }
    bms.leftHeld = false;
  }
  function endMoveRight() { bms.rightHeld = false; bms.holdFrames = 0; bms.repeatAcc = 0; }

  padMoveL.addEventListener("pointerdown", e => { e.preventDefault(); padMoveL.setPointerCapture(e.pointerId); startMoveLeft(); });
  padMoveL.addEventListener("pointerup", endMoveLeft);
  padMoveL.addEventListener("pointercancel", endMoveLeft);
  padMoveR.addEventListener("pointerdown", e => { e.preventDefault(); padMoveR.setPointerCapture(e.pointerId); startMoveRight(); });
  padMoveR.addEventListener("pointerup", endMoveRight);
  padMoveR.addEventListener("pointercancel", endMoveRight);
})();
