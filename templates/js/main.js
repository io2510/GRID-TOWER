// ============================================================
// メインループ ＆ イベント
// ============================================================
let state, tutState, fb, player, beam, bms;
// セーブポイント: 直近まで居たフロアとスコアだけを毎フレーム記録する(盤面やコンボは保存しない)。ゲームオーバーの LOAD で使う。
const checkpoint = { floor: 1, score: 0 };

// 開始階より下のボスは撃破済みにする(隠しコマンド・LOAD用。でないと階層上限でボス階へ引き戻される)。
// 開始階そのものがボス階なら、そのボス戦は最初から始まる。
function markBossesClearedBelow(n) {
  if (n > 10) bossSys.cursedBeamActive = true;
  if (n > 20) bossSys.targetReached = true;
  if (n > 30) bossSys.boss30Cleared = true;
  if (n > 40) bossSys.boss40Cleared = true;
  if (n > 50) bossSys.boss50Cleared = true;
  if (n > 60) bossSys.boss60Cleared = true;
  if (n > 70) bossSys.boss70.cleared = true;
  if (n > 80) bossSys.boss80.cleared = true;
  if (n > 90) bossSys.boss90.cleared = true;
}

// セーブポイントからの再開
function loadCheckpoint() {
  const f = checkpoint.floor, sc = checkpoint.score;
  resetGame();
  markBossesClearedBelow(f);
  state.floor = f; state.score = sc; state.notifiedFloor = f;
  if (f >= ATTR_FIRST_NORMAL_FLOOR) state.nextBlockAttribute = fb._pickAttribute(state);
  scene = "game";
}

function resetGame() {
  checkpoint.floor = 1; checkpoint.score = 0;
  state = new GameState(); tutState = new TutorialState(); fb = new FallingBlock(state); player = new Player(); beam = new BeamState(); bms = new BlockMoveState(); bossSys.reset_all();
}
resetGame();

const canvas = document.getElementById("gameCanvas"); const ctx = canvas.getContext("2d");
let _lastTime = null, _accumulator = 0;

function mainProc(timestamp) {
  requestAnimationFrame(mainProc); if (_lastTime === null) _lastTime = timestamp;
  _accumulator += timestamp - _lastTime; _lastTime = timestamp;
  if (_accumulator < 16.66) return; _accumulator = 0;

  globalFrameCount++; // 【50F追加】渦巻きの回転用インクリメントカウンタ
  ctx.fillStyle = "#111122"; ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  // 100F戦から離れたら、CPU思考のWorkerを止める
  if (battle100f.active && !(scene === "boss_100f" || (scene === "pause" && prevScene === "boss_100f"))) battle100f.stop();

  if (scene === "title") drawTitle(ctx);
  else if (scene === "quit") drawQuit(ctx);
  else if (scene === "boss_100f") { updateBoss100F(); if (scene === "boss_100f") { battle100f.draw(ctx); drawBoss100FPortraitNotice(ctx); } else drawBoss100FEnd(ctx); }
  else if (scene === "boss100f_end") drawBoss100FEnd(ctx);
  else if (scene === "game" && state.floor >= 100) enterBoss100FFromGame();   // 100Fに到達したらボス戦(CPU対戦)へ
  else if (sceneover(scene)) drawGameover(ctx, state.score, state.floor);
  else if (scene === "pause") { if (prevScene === "boss_100f") battle100f.draw(ctx); else drawGame(ctx, state, fb, player, beam); drawPause(ctx); }
  else {
    const isTut = (scene === "tutorial"); let tutorialPaused = false, blockFrozen = false, isBeamStep = false;
    if (!isTut) { checkpoint.floor = state.floor; checkpoint.score = state.score; }   // このフレーム開始時点の到達地点を保存
    if (isTut) {
      if (tutState._needsSetup) tutSetupStep(tutState, state, player, fb, beam);
      let sd = tutState.currentStepData();
      if (sd) { if (sd.condition_type !== "beam_evade") beam.timer = 0; else { isBeamStep = true; if (beam.phase === "firing" && beam.showTimer === 1) tutState.flags.beam_fired = true; } }
      tutorialPaused = tutState.isWaitingForAck(); blockFrozen = tutState.isBlockFrozen();
    }

    if (!tutorialPaused) {
      if (state.comboTimer > 0 && --state.comboTimer <= 0) { if (state.pendingComboBlocks > 0) { state.comboBlocks += state.pendingComboBlocks; state.pendingComboBlocks = 0; } state.comboTimer = 0; state.comboCount = 0; }
      // 【50Fボス専用】50Fボス戦専用コンボプールのタイマー減衰
      if (state.boss50ComboTimer > 0 && --state.boss50ComboTimer <= 0) { if (state.boss50PendingComboBlocks > 0) { state.boss50ComboBlocks += state.boss50PendingComboBlocks; state.boss50PendingComboBlocks = 0; } state.boss50ComboTimer = 0; state.boss50ComboCount = 0; }
      
      // ボス空間移行判定 (10F / 20F / 30F / 40F / 50F)
      // 【修正箇所】「and」によるSyntaxErrorを回避し、「&&」に完全置換
      if (state.floor === 10 && !bossSys.isBossActive && scene === "game" && !bossSys.cursedBeamActive) { flushLineClearQueue(state); bossSys.generateBossStage(state, 10); scene = "boss_10f"; teleportPlayer(player); player.invincible = INVINCIBLE_FRAMES; beam.phase = "wait"; beam.timer = 0; }
      else if (state.floor === 20 && !bossSys.isBossActive && scene === "game" && !bossSys.targetReached) { flushLineClearQueue(state); bossSys.generateBossStage(state, 20); scene = "boss_20f"; teleportPlayerBoss20(player); player.invincible = INVINCIBLE_FRAMES; }
      else if (state.floor === 30 && !bossSys.isBossActive && scene === "game" && !bossSys.boss30Cleared) { flushLineClearQueue(state); bossSys.generateBossStage(state, 30); scene = "boss_30f"; teleportPlayer(player); player.invincible = INVINCIBLE_FRAMES; }
      else if (state.floor === 40 && !bossSys.isBossActive && scene === "game" && !bossSys.boss40Cleared) { flushLineClearQueue(state); bossSys.generateBossStage(state, 40); scene = "boss_40f"; teleportPlayerBoss20(player); player.invincible = INVINCIBLE_FRAMES; }
      else if (state.floor === 50 && !bossSys.isBossActive && scene === "game" && !bossSys.boss50Cleared) {
        // 【50Fボス専用追加分】50Fボスシーンへの遷移処理割り込み
        flushLineClearQueue(state);
        bossSys.generateBossStage(state, 50);
        scene = "boss_50f";
        let fid = bossSys.getForcedSpawnShapeId();
        if (fid) fb.spawnBlockForced(fid);
        teleportPlayer(player); player.invincible = INVINCIBLE_FRAMES; beam.phase = "wait"; beam.timer = 0;
      }
      else if (state.floor === 60 && !bossSys.isBossActive && scene === "game" && !bossSys.boss60Cleared) {
        flushLineClearQueue(state);
        bossSys.generateBossStage(state, 60);
        scene = "boss_60f";
        teleportPlayer(player); player.invincible = INVINCIBLE_FRAMES; beam.phase = "wait"; beam.timer = 0;
      }
      else if (state.floor === 70 && !bossSys.isBossActive && scene === "game" && !bossSys.boss70.cleared) {
        flushLineClearQueue(state);
        bossSys.generateBossStage(state, 70);
        scene = "boss_70f";
        teleportPlayer(player); player.invincible = INVINCIBLE_FRAMES; beam.phase = "wait"; beam.timer = 0;
      }
      else if (state.floor === 90 && !bossSys.isBossActive && scene === "game" && !bossSys.boss90.cleared) {
        flushLineClearQueue(state);
        bossSys.saveCurrentAttrMap(state.attrMap);
        bossSys.generateBossStage(state, 90);
        scene = "boss_90f";
        teleportPlayer(player); player.invincible = INVINCIBLE_FRAMES; beam.phase = "wait"; beam.timer = 0;
      }
      else if (state.floor === 80 && !bossSys.isBossActive && scene === "game" && !bossSys.boss80.cleared) {
        flushLineClearQueue(state);
        bossSys.generateBossStage(state, 80);
        scene = "boss_80f";
        player.hp = BOSS80_MAX_HP;
        teleportPlayerBoss80(player); player.invincible = INVINCIBLE_FRAMES; beam.phase = "wait"; beam.timer = 0;
      }

      // ボス固有更新処理
      if (scene === "boss_90f") {
        // 90F: ミッション達成判定。規定回数クリアで撃破(化学反応・属性付着は下の毎フレーム処理が担当)
        bossSys.updateBoss90Goal(state, player, player.isCrouching ? CROUCH_P_HALF_H : P_HALF_H);
        if (bossSys.boss90.cleared) {
          bossSys.isBossActive = false; scene = "game"; player.hp = MAX_HP;
          teleportPlayer(player); player.invincible = INVINCIBLE_FRAMES; beam.phase = "wait"; beam.timer = 0;
          bossSys.restorePreviousMap(state); state.floor = 91; state.floorLines = 0; state.notifiedFloor = 91;
          flushLineClearQueue(state, false);
        }
      }
      if (scene === "boss_20f") { bossSys.bossTimer--; if (bossSys.bossTimer <= 0) scene = "gameover"; }
      else if (scene === "boss_30f") {
        let pGx = Math.floor((player.x - GAME_LEFT) / GRID_SIZE);
        let res = bossSys.update_boss30_logic(state, pGx, player.invincible);
        if (res === "damage") { applyPlayerDamage(player); flushLineClearQueue(state, false); }
        else if (res === "beam_clear") { flushLineClearQueue(state, false); }
        else if (res === "victory") { bossSys.isBossActive = false; bossSys.boss30Cleared = true; scene = "game"; player.hp = MAX_HP; teleportPlayer(player); player.invincible = INVINCIBLE_FRAMES; bossSys.restorePreviousMap(state); state.floor = 31; state.notifiedFloor = 31; flushLineClearQueue(state, false); }
        else if (res === "advance") flushLineClearQueue(state, false);
      } else if (scene === "boss_40f") {
        let res = bossSys.update_boss40_logic(player);
        if (res === "clear") { bossSys.isBossActive = false; bossSys.boss40Cleared = true; scene = "game"; player.hp = MAX_HP; teleportPlayer(player); player.invincible = INVINCIBLE_FRAMES; bossSys.restorePreviousMap(state); state.floor = 41; state.floorLines = 0; state.notifiedFloor = 41; flushLineClearQueue(state, false); }
        if (bossSys.boss40LaserPhase === "firing" && player.invincible === 0) {
          let pGx = Math.floor((player.x - GAME_LEFT) / GRID_SIZE), pGy = Math.floor((player.y - GAME_TOP) / GRID_SIZE);
          if (bossSys.boss40ActiveCols.includes(pGx) || bossSys.boss40ActiveRows.includes(pGy)) applyPlayerDamage(player);
        }
      } else if (scene === "boss_50f") {
        // 【50Fボス専用追加分】毎フレームのターゲット全消去走査・破砕チェック
        let res = bossSys.update_boss50_logic(state);
        if (res === "phase_advance") {
          let fid = bossSys.getForcedSpawnShapeId();
          if (fid) fb.spawnBlockForced(fid);
          flushLineClearQueue(state, false);
        } else if (res === "victory") {
          bossSys.isBossActive = false; bossSys.boss50Cleared = true; scene = "game"; player.hp = MAX_HP;
          teleportPlayer(player); player.invincible = INVINCIBLE_FRAMES; bossSys.restorePreviousMap(state);
          state.floor = 51; state.floorLines = 0; state.notifiedFloor = 51; flushLineClearQueue(state, false);
          // 【50Fボス専用】クリア時、50F専用コンボプールを破棄し通常フロアのコンボブロック状態に戻す
          state.boss50ComboCount = 0; state.boss50ComboBlocks = 0; state.boss50PendingComboBlocks = 0; state.boss50ComboTimer = 0; state.boss50ComboEverActivated = false;
        }
      } else if (scene === "boss_60f") {
        let res = bossSys.updateBoss60Frame(state, player, fb, beam);
        if (res === "victory") {
          bossSys.isBossActive = false; bossSys.boss60Cleared = true; scene = "game"; player.hp = MAX_HP;
          teleportPlayer(player); player.invincible = INVINCIBLE_FRAMES; beam.phase = "wait"; beam.timer = 0;
          bossSys.restorePreviousMap(state); state.floor = 61; state.floorLines = 0; state.notifiedFloor = 61;
          flushLineClearQueue(state, false);
        } else if (res === "update_beam") {
          updateBeam(beam, player, 360);
        }
      } else if (scene === "boss_70f") {
        let res = bossSys.updateBoss70Logic(state, player);
        if (res === "damage") { applyPlayerDamage(player); flushLineClearQueue(state, false); }
        else if (res === "victory") {
          bossSys.isBossActive = false; bossSys.boss70.cleared = true; scene = "game"; player.hp = MAX_HP;
          teleportPlayer(player); player.invincible = INVINCIBLE_FRAMES; beam.phase = "wait"; beam.timer = 0;
          bossSys.restorePreviousMap(state); state.floor = 71; state.floorLines = 0; state.notifiedFloor = 71;
          flushLineClearQueue(state, false);
        } else if (res === "phase_advance") { flushLineClearQueue(state, false); }
      }

      // 階層背景演出
      if (state.floor > state.notifiedFloor && state.comboTimer <= 0 && state.lineClearQueue.length === 0 && !scene.startsWith("boss_")) {
        state.notifiedFloor = state.floor; let colors = ["hsla(0,40%,25%,0.4)","hsla(120,40%,25%,0.4)","hsla(210,40%,25%,0.4)"];
        state.bgAnim = { active: true, y: GAME_TOP - 150, text: `${state.floor}${getOrdinal(state.floor)} FLOOR`, color: colors[Math.floor(Math.random()*colors.length)] };
      }
      if (state.bgAnim && state.bgAnim.active) { state.bgAnim.y += 4; if (state.bgAnim.y > GAME_BOTTOM + 200) state.bgAnim.active = false; }

      processLineClearQueue(state); updateBlockMove(state, fb, bms);
      if (!blockFrozen && !(scene === "boss_60f" && bossSys.isBoss60Transition())) updateFallingBlock(state, fb, isTut, isTut ? tutState : null);
      updatePlayer(state, fb, player);
      const attrActive = isAttrActive(state);
      if (attrActive) { updateSandSink(state, player, player.isCrouching ? CROUCH_P_HALF_H : P_HALF_H); updateSandGravity(state); }
      applyGravityPushOnly(state, fb); applyGravityToBlocks(state);
      // その回の重力・落下が確定した後に、反応判定→接触判定の順で行う
      if (attrActive) { updateBoss90BlockReactions(state, fb); updateBoss90AttributeContact(state, player); }
      checkCrush(state, fb, player);
      updateBeam(beam, player, isBeamStep ? 1800 : null);
    }
    if (isTut) tutCheckStepCondition(tutState, state, player, fb, beam);
    drawGame(ctx, state, fb, player, beam, blockFrozen || (scene === "boss_60f" && bossSys.isBoss60Transition()), isBeamStep);
    if (isTut) tutDrawOverlay(ctx, tutState, SCREEN_WIDTH, SCREEN_HEIGHT, GAME_LEFT, GAME_TOP, GAME_RIGHT, GAME_BOTTOM);
  }
}

function sceneover(s) { return s === "gameover"; }

function getKey(code) {
  const map = { "KeyW":"w","KeyA":"a","KeyS":"s","KeyD":"d","KeyE":"e","ArrowLeft":"left","ArrowRight":"right","ArrowDown":"down","ArrowUp":"up","Space":"space","Escape":"escape","KeyF":"f" };
  return map[code] || code.toLowerCase().replace("key","");
}

// ---- 隠しコマンド: タイトル画面で階数(例: 80)を入力して Enter → その階から開始(ボス階ならボス戦へ直行) ----
let titleCmd = "";
function startFromFloor(n) {
  if (n === 100) { startBoss100F(MAX_HP); return; }
  resetGame();
  // 開始階より下のボスは撃破済み扱い(でないと階層上限でボス階へ引き戻される)
  markBossesClearedBelow(n);
  state.floor = n; state.notifiedFloor = n; state.floorLines = 0;
  if (n >= ATTR_FIRST_NORMAL_FLOOR) { state.nextBlockAttribute = fb._pickAttribute(state); fb.attribute = fb._pickAttribute(state); }
  scene = "game";
}
function handleTitleCommandKey(e) {
  const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  if (m) { if (titleCmd.length < 3) titleCmd += m[1]; return; }
  if (e.code === "Backspace") { titleCmd = titleCmd.slice(0, -1); return; }
  if (e.code === "Enter" || e.code === "NumpadEnter") {
    const n = parseInt(titleCmd, 10); titleCmd = "";
    if (n >= 1 && n <= 100) startFromFloor(n);
    return;
  }
  if (e.code === "Escape") titleCmd = "";
}

document.addEventListener("keydown", e => {
  if (scene === "title") handleTitleCommandKey(e);
  const sym = getKey(e.code); if (["space","down","up","left","right"].includes(sym)) e.preventDefault();
  if (scene === "title" || scene === "gameover" || scene === "quit" || scene === "boss100f_end") return;
  if (scene === "pause") { if (sym === "escape") scene = prevScene; return; }
  if (sym === "escape") { prevScene = scene; scene = "pause"; if (battle100f.active) battle100f.releaseAll(); return; }
  if (scene === "boss_100f") { battle100f.onKeyDown(sym, e.repeat); return; }

  if (scene === "tutorial") {
    let sd = tutState.currentStepData(); if (!sd) return;
    if (!tutState.started) { if (sym === "f") { tutState.started = true; if (sd.condition_type === "wait_input") tutState.setCleared(); } return; }
    if (tutState.isCleared && sym === "f") { tutState.advance(); if (!tutState.currentStepData()) { resetGame(); scene = "game"; } else tutSetupStep(tutState, state, player, fb, beam); return; }
    if (sd.allowed_keys && !sd.allowed_keys.includes("all") && !sd.allowed_keys.includes(sym)) return;
    if (sym === "space") { state.spaceTriggered = true; tutState.flags.jumped = true; }
    if (sym === "q" || sym === "e") tutState.flags.rotated = true;
  }

  const noFallingBlock = (scene === "boss_20f" || scene === "boss_40f" || scene === "boss_70f" || scene === "boss_80f");

  if (scene === "boss_70f") bossSys.handleBoss70Input(sym);

  if (sym === "w") { useComboBlock(state, fb); return; }

  const isBoss60Upward = bossSys.isBoss60UpwardActive();

  if (sym === "down") {
    if (scene === "tutorial") tutState.flags.down_pressed = true;
  }

  // ハードドロップのトリガーキー：
  // 通常時（60Fボスの水流が下向きのときも含む）は↑キー、
  // 60Fボスの水流が上向きのときだけ↓キーがハードドロップになる
  const hardDropKeyPressed = isBoss60Upward ? (sym === "down") : (sym === "up");

  if (hardDropKeyPressed && !noFallingBlock) {
    // ハードドロップ：ワンプッシュで即座に落下・固定
    const isUpward = isBoss60Upward;
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

    // 【50Fボス専用追加分】ハードドロップ固定時の割り込み・強制ロードトリガー
    let forcedId = bossSys.getForcedSpawnShapeId();
    if (forcedId) {
      fb.spawnBlockForced(forcedId);
    } else {
      fb.spawnBlock(state, scene === "tutorial" ? tutState : null, false, scene === "tutorial");
    }

    checkLineClear(state, true); checkCrushHarddrop(state, player);
    if (scene === "tutorial") tutState.flags.hard_dropped = true;

    // 【50F追加】固定直後の走査判定
    if (scene === "boss_50f") _flush_line_clear_queue_50f();
  }

  if (sym === "s") state.sTriggered = true;

  if (sym in state.keyStates) state.keyStates[sym] = true;
  if (sym === "a" || sym === "d") state.lastHkey = sym;
  if (sym === "space") state.spaceTriggered = true;
  if (sym === "q" && !noFallingBlock) fb.rotateLeft(state);
  if (sym === "e" && !noFallingBlock) fb.rotateRight(state);
  if (sym === "left" && !noFallingBlock) { if (!bms.leftHeld) { bms.leftHeld = true; bms.holdFrames = 0; bms.repeatAcc = 0; } bms.rightHeld = false; }
  if (sym === "right" && !noFallingBlock) { if (!bms.rightHeld) { bms.rightHeld = true; bms.holdFrames = 0; bms.repeatAcc = 0; } bms.leftHeld = false; }
});

document.addEventListener("keyup", e => {
  const sym = getKey(e.code); if (battle100f.active) battle100f.onKeyUp(sym); if (sym in state.keyStates) state.keyStates[sym] = false;
  if (sym === "left") { bms.leftHeld = false; bms.holdFrames = 0; bms.repeatAcc = 0; }
  if (sym === "right") { bms.rightHeld = false; bms.holdFrames = 0; bms.repeatAcc = 0; }
});

function getCanvasPos(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (SCREEN_WIDTH / r.width), y: (e.clientY - r.top) * (SCREEN_HEIGHT / r.height) }; }

canvas.addEventListener("mousedown", e => {
  e.preventDefault(); const { x, y } = getCanvasPos(e);
  if (e.button === 0) {
    if (scene === "title") { if (hitBtn("btn_play", x, y)) { resetGame(); scene = "game"; } else if (hitBtn("btn_100f", x, y)) { startBoss100F(MAX_HP); } else if (hitBtn("btn_tutorial", x, y)) { resetGame(); tutState.reset(); tutSetupStep(tutState, state, player, fb, beam); scene = "tutorial"; } else if (hitBtn("btn_quit", x, y)) { quitGame(); } else if (hitBtn("btn_survey_title", x, y)) { window.open(SURVEY_FORM_URL, "_blank"); } return; }
    if (scene === "pause") { if (hitBtn("btn_resume", x, y)) scene = prevScene; else if (hitBtn("btn_retry_pause", x, y)) { if (prevScene === "boss_100f") { if (b100FromGame) { resetGame(); scene = "game"; } else startBoss100F(MAX_HP); return; } resetGame(); if (prevScene === "tutorial") { tutState.reset(); tutSetupStep(tutState, state, player, fb, beam); scene = "tutorial"; } else scene = "game"; } else if (hitBtn("btn_home_pause", x, y)) scene = "title"; else if (hitBtn("btn_quit_pause", x, y)) { quitGame(); } return; }
    if (scene === "gameover") { if (hitBtn("btn_retry_go", x, y)) { resetGame(); scene = "game"; } else if (hitBtn("btn_load_go", x, y)) { loadCheckpoint(); } else if (hitBtn("btn_home_go", x, y)) scene = "title"; else if (hitBtn("btn_quit_go", x, y)) { quitGame(); } else if (hitBtn("btn_survey_go", x, y)) { window.open(SURVEY_FORM_URL, "_blank"); } return; }
    if (scene === "boss100f_end") { if (hitBtn("btn_retry_b100", x, y)) startBoss100F(MAX_HP); else if (hitBtn("btn_home_b100", x, y)) scene = "title"; return; }
    if (scene === "boss_100f") return;
    if (!bms.leftHeld) { bms.leftHeld = true; bms.holdFrames = 0; bms.repeatAcc = 0; } bms.rightHeld = false;
  }
  if (e.button === 2 && scene !== "boss_100f") { if (!bms.rightHeld) { bms.rightHeld = true; bms.holdFrames = 0; bms.repeatAcc = 0; } bms.leftHeld = false; }
});

canvas.addEventListener("mouseup", e => {
  if (e.button === 0) { bms.leftHeld = false; bms.holdFrames = 0; bms.repeatAcc = 0; }
  if (e.button === 1) state.keyStates.down = false;
  if (e.button === 2) { bms.rightHeld = false; bms.holdFrames = 0; bms.repeatAcc = 0; }
});
canvas.addEventListener("contextmenu", e => e.preventDefault());

// ============================================================
// レイアウト（横画面：従来通り中央表示／縦画面：上部にゲーム、下部に操作パネル）
// ============================================================
function layoutScreen() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const portrait = vh > vw;
  const wrapper = document.getElementById("wrapper");
  const touchEl = document.getElementById("touchControls");

  if (portrait) {
    const scale = vw / SCREEN_WIDTH;
    const canvasH = SCREEN_HEIGHT * scale;
    wrapper.style.transform = `scale(${scale})`;
    wrapper.style.left = "0px";
    wrapper.style.top = "0px";

    const panelH = Math.max(0, vh - canvasH);
    touchEl.style.display = "flex";
    touchEl.style.top = canvasH + "px";
    touchEl.style.height = panelH + "px";
  } else {
    const scale = Math.min(vw / SCREEN_WIDTH, vh / SCREEN_HEIGHT);
    const canvasW = SCREEN_WIDTH * scale, canvasH = SCREEN_HEIGHT * scale;
    wrapper.style.transform = `scale(${scale})`;
    wrapper.style.left = ((vw - canvasW) / 2) + "px";
    wrapper.style.top = ((vh - canvasH) / 2) + "px";

    touchEl.style.display = "none";
  }
}
window.addEventListener("resize", layoutScreen);
window.addEventListener("orientationchange", layoutScreen);
layoutScreen();
