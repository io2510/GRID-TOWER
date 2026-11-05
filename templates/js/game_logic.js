// ============================================================
// ユーティリティ
// ============================================================
const _ghostColorCache = {};
function darkenColor(hex, factor = 0.25) {
  if (!hex.startsWith("#")) return "#333333";
  if (_ghostColorCache[hex + factor]) return _ghostColorCache[hex + factor];
  let r = parseInt(hex.slice(1,3),16);
  let g = parseInt(hex.slice(3,5),16);
  let b = parseInt(hex.slice(5,7),16);
  r = Math.floor(r * factor); g = Math.floor(g * factor); b = Math.floor(b * factor);
  const result = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  _ghostColorCache[hex + factor] = result;
  return result;
}

function getOrdinal(n) {
  const v = n % 100; if (v >= 11 && v <= 13) return "th";
  switch (n % 10) { case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th"; }
}

function capFloorAtBoss(state) {
  if (state.floor >= 90 && !bossSys.boss90.cleared) state.floor = 90;
  else if (state.floor >= 80 && !bossSys.boss80.cleared) state.floor = 80;
  else if (state.floor >= 70 && !bossSys.boss70.cleared) state.floor = 70;
  else if (state.floor >= 60 && !bossSys.boss60Cleared) state.floor = 60;
  else if (state.floor >= 50 && !bossSys.boss50Cleared) state.floor = 50; // 【50F追加】
  else if (state.floor >= 40 && !bossSys.boss40Cleared) state.floor = 40;
  else if (state.floor >= 30 && !bossSys.boss30Cleared) state.floor = 30;
  else if (state.floor >= 20 && !bossSys.targetReached) state.floor = 20;
  else if (state.floor >= 10 && !bossSys.cursedBeamActive) state.floor = 10;
}

function flushLineClearQueue(state, awardScore = true) {
  if (awardScore) state.score += SCORE_PER_LINE * state.lineClearQueue.length;
  state.lineClearQueue = []; state.lineClearTimer = 0;
}

function getBeamCycle(floor) {
  if (bossSys.cursedBeamActive) return 1800;
  if (floor < 10) return Infinity;
  if (floor >= 90) return 200;
  return 600 - Math.floor((floor - 10) / 10) * 50;
}

// 90Fボス中だけは、落下間隔を50Fボスと同じ値に固定する(本家 _resolve_fall_interval と同じ)。
// 90F特有の化学反応で複数の駒が同時に落ちる演出と相まって、素のテーブル値(最速)だとかなり速く感じるため。
function resolveFallInterval(floor, isFast) {
  let base = isFast ? BLOCK_FALL_INTERVAL_FAST : getFallInterval(floor);
  if (bossSys.isBoss90Context()) base = getFallInterval(50);
  return bossSys.getAdjustedFallInterval(base);
}

function getFallInterval(floor) {
  if (floor >= 90) return 6;
  if (floor >= 80) return 7;
  if (floor >= 70) return 8;
  if (floor >= 60) return 9;
  if (floor >= 50) return 10;
  if (floor >= 40) return 12;
  if (floor >= 30) return 14;
  if (floor >= 20) return 16;
  if (floor >= 10) return 18;
  return 20;
}

// 【50Fボス専用追加分】渦巻き(ぐるぐる)模様のセル描画ロジック
function drawSwirlCell(ctx, cx, cy, shapeId, frameCounter) {
  let direction = (shapeId === 19 || shapeId === 20 || shapeId === 21) ? -1 : 0;
  if (direction === 0) return;
  let angle = frameCounter * SWIRL_ROT_SPEED * direction;
  let cosA = Math.cos(angle);
  let sinA = Math.sin(angle);
  let maxRadius = (GRID_SIZE / 2) - 5;
  
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= SWIRL_STEPS; i++) {
    let t = i / SWIRSteps;
    let r = maxRadius * t;
    let theta = -(t * SWIRL_MAX_TURNS * 2 * Math.PI);
    let dx = r * Math.cos(theta);
    let dy = r * Math.sin(theta);
    // 回転行列の適用
    let rx = dx * cosA - dy * sinA;
    let ry = dx * sinA + dy * cosA;
    if (i === 0) ctx.moveTo(cx + rx, cy + ry);
    else ctx.lineTo(cx + rx, cy + ry);
  }
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}
const SWIRSteps = SWIRL_STEPS;

// ============================================================
// シーン管理
// ============================================================
let scene = "title";
let prevScene = "game";
let _btnRects = {};
let globalFrameCount = 0; // 【50F追加分】位相を保つための通しフレームカウンタ

// ============================================================
// クラス定義
// ============================================================
class TutorialState {
  constructor() { this.reset(); }
  currentStepData() { return this.stepIdx < TUTORIAL_STEPS.length ? TUTORIAL_STEPS[this.stepIdx] : null; }
  isBlockFrozen() { let sd = this.currentStepData(); return sd ? sd.step <= 4 : false; }
  isWaitingForAck() { return !this.started; }
  reset() { this.stepIdx = 0; this.isCleared = false; this.flags = {}; this.initialVal = 0; this.stepTimer = 0; this._needsSetup = true; this.blockIndex = 0; this.started = false; }
  advance() { this.stepIdx += 1; this.isCleared = false; this.flags = {}; this.initialVal = 0; this.stepTimer = 0; this._needsSetup = true; this.started = false; }
  setCleared() { this.isCleared = true; }
}

function tutSetupStep(tutState, state, player, fb, beam = null) {
  tutState._needsSetup = false;
  const sd = tutState.currentStepData(); if (!sd) return;
  if (sd.step === 2) tutState.initialVal = player.x;
  else if (sd.step === 5) tutState.initialVal = fb.x;
  else if (sd.step === 9) {
    tutState.initialVal = state.score;
    state.blockMap = Array.from({length: MAP_HEIGHT}, () => new Array(MAP_WIDTH).fill(0));
    for (let x = 0; x < MAP_WIDTH; x++) state.blockMap[MAP_HEIGHT - 1][x] = 1001;
    state.blockMap[MAP_HEIGHT - 1][Math.floor(MAP_WIDTH / 2)] = 0;
    state.blockMap[MAP_HEIGHT - 1][Math.floor(MAP_WIDTH / 2) - 1] = 0;
  } else if (sd.step === 10) {
    // コンボブロックのデモ用に、体験できる分をあらかじめ付与しておく
    state.comboBlocks = 3;
    state.comboEverActivated = true;
    tutState.initialVal = state.comboBlocks;
  } else if (sd.step === 11) {
    tutState.initialVal = player.hp;
    if (beam) { beam.phase = "wait"; beam.timer = BEAM_CYCLE - BEAM_WARNING - 60; }
  }
}

function tutCheckStepCondition(tutState, state, player, fb, beam) {
  tutState.stepTimer += 1; if (tutState.isCleared) return;
  const sd = tutState.currentStepData(); if (!sd) return;
  const ctype = sd.condition_type;
  if (ctype === "player_move") { if (Math.abs(player.x - tutState.initialVal) > 80) tutState.setCleared(); }
  else if (ctype === "player_jump") { if (tutState.flags.jumped) tutState.setCleared(); }
  else if (ctype === "player_crouch") { if (player.isCrouching) tutState.setCleared(); }
  else if (ctype === "block_move") { if (Math.abs(fb.x - tutState.initialVal) > 0) tutState.setCleared(); }
  else if (ctype === "block_rotate") { if (tutState.flags.rotated) tutState.setCleared(); }
  else if (ctype === "block_speed") { if (tutState.flags.down_pressed) tutState.setCleared(); }
  else if (ctype === "hard_drop") { if (tutState.flags.hard_dropped) tutState.setCleared(); }
  else if (ctype === "line_clear") { if (state.score > tutState.initialVal) tutState.setCleared(); }
  else if (ctype === "combo_use") { if (state.comboBlocks < tutState.initialVal) tutState.setCleared(); }
  else if (ctype === "beam_evade") {
    if (tutState.flags.beam_fired && player.hp >= tutState.initialVal) tutState.setCleared();
    else if (player.hp < tutState.initialVal) { tutState.flags.beam_fired = false; tutState.initialVal = player.hp; }
  }
}

class GameState {
  constructor() {
    this.blockMap = Array.from({length: MAP_HEIGHT}, () => new Array(MAP_WIDTH).fill(0));
    this.nextSerial = 1; this.blockCount = 0; this.rareCountdown = Math.floor(Math.random() * 5) + 28;
    this.keyStates = { a:false, s:false, d:false, space:false, down:false, up:false, left:false, right:false }; this.lastHkey = "";
    this.spaceTriggered = false; this.sTriggered = false; // 60F: ジャンプ/潜行のワンショット入力トリガー
    this.score = 0; this.floor = 1; this.floorLines = 0;
    this.comboCount = 0; this.comboBlocks = 0; this.pendingComboBlocks = 0; this.comboTimer = 0; this.comboEverActivated = false;
    // 【50Fボス専用】通常フロアのコンボブロックとは別管理のプール
    this.boss50ComboCount = 0; this.boss50ComboBlocks = 0; this.boss50PendingComboBlocks = 0; this.boss50ComboTimer = 0; this.boss50ComboEverActivated = false;
    this.gravityTimer = 0; this.pushedBlockIds = new Set(); this.pushGravityTimer = 0; this.lineClearQueue = []; this.lineClearTimer = 0; this.nextBlockData = null;
    this.notifiedFloor = 1; this.bgAnim = { active: false, y: 0, text: "", color: "" };
    this.recentNormalShapeIds = [];
  }
  getBlockCache() {
    let cache = {};
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        let bid = this.blockMap[y][x]; if (bid >= 1) { if (!cache[bid]) cache[bid] = []; cache[bid].push([x, y]); }
      }
    }
    return cache;
  }
}

// 属性関連のデータは 90F 専用なので BossManager が持つ。GameState からは同名のアクセサで透過的に読み書きする。
for (const _k of ["attrMap", "nextBlockAttribute", "recentAttrIds", "ironContactTimers", "sandSink"]) {
  Object.defineProperty(GameState.prototype, _k, { get() { return bossSys[_k]; }, set(v) { bossSys[_k] = v; } });
}

class Player {
  constructor() { this.x = Math.floor((GAME_LEFT + GAME_RIGHT) / 2); this.y = GAME_BOTTOM - 20; this.vx = 0; this.vy = 0; this.isGrounded = false; this.pushTimerL = 0; this.pushTimerR = 0; this.hp = MAX_HP; this.invincible = 0; this.blinkVisible = true; this.isCrouching = false; this.prevHalfH = P_HALF_H;
    // 90F・91F以降の属性まわり
    this.attrState = new PlayerAttributeState(); this.stunFrames = 0; this.darknessFrames = 0; this.iceSpeedBoost = false;
    this.horizontalVelocity = 0; this.onWind = false; this.windState = "rising"; this.windHeight = 0; this.windPhase = 0;
  }
}

class BeamState { constructor() { this.timer = 0; this.col = 0; this.showTimer = 0; this.phase = "wait"; this.blinkOn = true; } }
class BlockMoveState { constructor() { this.leftHeld = false; this.rightHeld = false; this.holdFrames = 0; this.repeatAcc = 0; } }

class FallingBlock {
  constructor(state = null) { this.x = 0; this.y = 0; this.timer = 0; this.attribute = null; this.shapeId = 1; this.shape = []; this.color = "#ffdd00"; this.outline = "#cc9900"; this.spawnBlock(state || new GameState(), null, true, false); }
  _pickBlockData(state, isTutorial, tutState) {
    if (isTutorial && tutState) { let normal = BLOCKS.filter(b => b.shape_id <= 11); return normal[tutState.blockIndex % normal.length]; }
    if (RARE_BLOCK_IDS.length > 0 && state.rareCountdown <= 0) { return BLOCKS.find(b => b.shape_id === RARE_BLOCK_IDS[Math.floor(Math.random() * RARE_BLOCK_IDS.length)]); }
    // 通常ブロックの抽選時に50Fボス用ブロック(19〜21)が混ざらないようガード
    let normal = BLOCKS.filter(b => b.shape_id <= 11);
    let candidates = normal.filter(b => !state.recentNormalShapeIds.includes(b.shape_id));
    if (candidates.length === 0) candidates = normal;
    let choice = candidates[Math.floor(Math.random() * candidates.length)];
    state.recentNormalShapeIds.push(choice.shape_id);
    if (state.recentNormalShapeIds.length > NORMAL_BLOCK_NO_REPEAT_WINDOW) state.recentNormalShapeIds.shift();
    return choice;
  }
  // 落下ブロックに付与する属性を抽選する。属性が付くのは 90Fボス戦中と、突破後の通常フロア(91F以降)だけ。
  // それ以外では乱数も消費せず null を返す(=今まで通り無属性)。
  _pickAttribute(state) {
    const inBoss90 = bossSys.isBoss90Context();
    const inPost = state.floor >= ATTR_FIRST_NORMAL_FLOOR && !bossSys.isBossActive;
    if (!(inBoss90 || inPost)) return null;
    let boostIds = null, chance = BLOCK_ATTR_CHANCE;
    if (inBoss90) { const g = bossSys.boss90.currentGoal; if (g) boostIds = boss90GoalTargetAttrs(g); }
    else chance = NORMAL_FLOOR_ATTR_CHANCE;
    const a = rollBlockAttribute(chance, state.recentAttrIds, boostIds);
    if (a !== null) { state.recentAttrIds.push(a); if (state.recentAttrIds.length > ATTR_ROLL_RECENT_EXCLUDE_COUNT) state.recentAttrIds.shift(); }
    return a;
  }
  spawnBlock(state, tutState = null, isInit = false, isTutorial = false) {
    if (!isInit) { state.blockCount += 1; state.rareCountdown -= 1; }
    if (!state.nextBlockData) { state.nextBlockData = this._pickBlockData(state, isTutorial, tutState); state.nextBlockAttribute = this._pickAttribute(state); }
    let data = (isTutorial && tutState) ? BLOCKS.filter(b => b.shape_id <= 11)[tutState.blockIndex % BLOCKS.filter(b => b.shape_id <= 11).length] : state.nextBlockData;
    if (isTutorial && tutState) tutState.blockIndex += 1;
    this.attribute = (isTutorial && tutState) ? null : state.nextBlockAttribute;
    state.nextBlockData = this._pickBlockData(state, isTutorial, tutState);
    state.nextBlockAttribute = this._pickAttribute(state);
    if (!isTutorial && RARE_BLOCK_IDS.length > 0 && state.rareCountdown <= 0) state.rareCountdown = Math.floor(Math.random() * 5) + 28;
    this.shapeId = data.shape_id; this.shape = data.shape.map(([dx,dy]) => [dx,dy]); this.color = data.color; this.outline = data.outline;
    const maxDx = Math.max(...this.shape.map(([dx]) => dx));
    this.x = Math.floor((MAP_WIDTH - maxDx) / 2);
    this.y = 0; this.timer = 0;
    if (bossSys.isBoss60Context()) this.y = bossSys.getBoss60SpawnY(this.shape, this.y);
  }
  // 【50Fボス専用追加分】フェーズターゲットブロックの強制割り込みスポーン経路
  spawnBlockForced(shapeId) {
    let data = BLOCKS.find(b => b.shape_id === shapeId);
    if (!data) return;
    this.shapeId = data.shape_id; this.shape = data.shape.map(([dx,dy]) => [dx,dy]); this.color = data.color; this.outline = data.outline; this.attribute = null;
    const maxDx = Math.max(...this.shape.map(([dx]) => dx));
    this.x = Math.floor((MAP_WIDTH - maxDx) / 2); this.y = 0; this.timer = 0;
    if (bossSys.isBoss60Context()) this.y = bossSys.getBoss60SpawnY(this.shape, this.y);
  }
  getCells() { return this.shape.map(([dx,dy]) => [this.x + dx, this.y + dy]); }
  getGhostCells(state) {
    let ghostY = this.y;
    if (bossSys.isBoss60UpwardActive()) {
      while (!checkCollision(state, this, this.x, ghostY - 1)) ghostY--;
    } else {
      while (!checkCollision(state, this, this.x, ghostY + 1)) ghostY++;
    }
    if (ghostY === this.y) return []; return this.shape.map(([dx,dy]) => [this.x + dx, ghostY + dy]);
  }
  rotateLeft(state) {
    if (this.shapeId === 19 || this.shapeId === 20 || this.shapeId === 21) return; // 【50F追加分】回転不可制限
    let ns = this.shape.map(([dx,dy]) => [dy, -dx]);
    const minX = Math.min(...ns.map(([dx]) => dx)), minY = Math.min(...ns.map(([,dy]) => dy));
    ns = ns.map(([dx,dy]) => [dx - minX, dy - minY]); if (!this._collides(state, ns)) this.shape = ns;
  }
  rotateRight(state) {
    if (this.shapeId === 19 || this.shapeId === 20 || this.shapeId === 21) return;
    let ns = this.shape.map(([dx,dy]) => [-dy, dx]);
    const minX = Math.min(...ns.map(([dx]) => dx)), minY = Math.min(...ns.map(([,dy]) => dy));
    ns = ns.map(([dx,dy]) => [dx - minX, dy - minY]); if (!this._collides(state, ns)) this.shape = ns;
  }
  _collides(state, shape) {
    return _shapeCollides(state, shape, this.x, this.y);
  }
}

// ============================================================
// 衝突・更新判定ロジック
// ============================================================
function _shapeCollides(state, shape, ox, oy) {
  for (const [dx,dy] of shape) {
    const tx = ox + dx, ty = oy + dy;
    if (tx < 0 || tx >= MAP_WIDTH) return true;
    if (bossSys.isBoss60CeilingBlocked(ty)) return true;
    if (ty >= 0 && ty < MAP_HEIGHT && state.blockMap[ty][tx] >= 1) return true;
  }
  return false;
}
function checkCollision(state, fb, nx, ny) { return _shapeCollides(state, fb.shape, nx, ny); }

function lockBlock(state, fb) {
  const mapValue = fb.shapeId * 1000 + state.nextSerial;
  for (const [gx,gy] of fb.getCells()) { if (gx >= 0 && gx < MAP_WIDTH && gy >= 0 && gy < MAP_HEIGHT) { state.blockMap[gy][gx] = mapValue; state.attrMap[gy][gx] = fb.attribute; } }
  state.nextSerial += 1;
}

function checkLineClear(state, countCombo = true) {
  let existingRows = new Set(state.lineClearQueue); let newFullRows = [];
  for (let y = MAP_HEIGHT - 1; y >= 0; y--) {
    if (!state.blockMap[y].includes(0) && !existingRows.has(y) && !state.blockMap[y].includes(9999)) newFullRows.push(y);
  }
  if (newFullRows.length === 0) return;
  if (countCombo) {
    let lines = newFullRows.length;
    if (scene === "boss_50f") {
      // 【50Fボス専用】通常フロアのコンボブロックとは独立したプールに加算
      if (state.boss50ComboTimer <= 0) state.boss50ComboCount = 0;
      state.boss50ComboCount += lines; state.boss50ComboTimer = COMBO_BUFFER_FRAMES;
      state.boss50ComboEverActivated = true; state.boss50PendingComboBlocks += lines;
    } else {
      if (state.comboTimer <= 0) state.comboCount = 0;
      let prevCount = state.comboCount; state.comboCount += lines; state.comboTimer = COMBO_BUFFER_FRAMES;
      state.comboEverActivated = true; state.pendingComboBlocks += lines;
      if (!bossSys.isBossActive) {
        let prevBonus = Math.floor(prevCount / 4), newBonus = Math.floor(state.comboCount / 4);
        if (newBonus > prevBonus) { state.floor += (newBonus - prevBonus); capFloorAtBoss(state); }
      }
    }
  }
  for (let row of newFullRows) state.lineClearQueue.push(row);
}

function enqueueNewFullRows(state) {
  const existingRows = new Set(state.lineClearQueue);
  for (let y = MAP_HEIGHT - 1; y >= 0; y--) {
    if (!state.blockMap[y].includes(0) && !existingRows.has(y)) state.lineClearQueue.push(y);
  }
}

function processLineClearQueue(state) {
  if (state.lineClearQueue.length === 0) return;
  state.lineClearTimer += 1; if (state.lineClearTimer < LINE_CLEAR_INTERVAL) return;
  state.lineClearTimer = 0; let row = state.lineClearQueue.shift();
  if (state.blockMap[row].includes(0)) { enqueueNewFullRows(state); return; }

  if (bossSys.isBoss60Upward()) {
    for (let ty = row; ty < MAP_HEIGHT - 1; ty++) state.blockMap[ty] = [...state.blockMap[ty + 1]];
    state.blockMap[MAP_HEIGHT - 1] = new Array(MAP_WIDTH).fill(0);
    shiftAttrRowsDown(state.attrMap, row, MAP_HEIGHT);
  } else {
    for (let ty = row; ty > 0; ty--) state.blockMap[ty] = [...state.blockMap[ty - 1]];
    state.blockMap[0] = new Array(MAP_WIDTH).fill(0);
    shiftAttrRowsUp(state.attrMap, row);
  }
  state.score += SCORE_PER_LINE;

  if (bossSys.isBoss60Context()) bossSys.correctPlayerAfterDrop(state, player);

  if (bossSys.isBoss60Context()) {
    let res = bossSys.onBoss60LineCleared(1);
    if (res === "victory") {
      bossSys.isBossActive = false; bossSys.boss60Cleared = true; scene = "game"; player.hp = MAX_HP;
      teleportPlayer(player); player.invincible = INVINCIBLE_FRAMES; beam.phase = "wait"; beam.timer = 0;
      bossSys.restorePreviousMap(state); state.floor = 61; state.floorLines = 0; state.notifiedFloor = 61;
      flushLineClearQueue(state, false);
      return;
    }
  }

  if (bossSys.isBossActive && scene === "boss_10f") {
    bossSys.bossHp -= 1;
    if (bossSys.bossHp <= 0) {
      bossSys.isBossActive = false; scene = "game"; player.hp = MAX_HP; teleportPlayer(player);
      player.invincible = INVINCIBLE_FRAMES; beam.phase = "wait"; beam.timer = 0;
      bossSys.restorePreviousMap(state); bossSys.cursedBeamActive = true; state.floor = 11; state.notifiedFloor = 11;
      flushLineClearQueue(state, false);
    }
  } else if (bossSys.isBossActive && scene === "boss_50f") {
    // 【50Fボス専用追加分】ライン消去時の進行判定割り込み
    _flush_line_clear_queue_50f();
  } else if (!bossSys.isBossActive) {
    state.floorLines += 1; if (state.floorLines >= LINES_PER_FLOOR) { state.floor += 1; state.floorLines = 0; capFloorAtBoss(state); }
  }

  if (bossSys.isBoss60Upward()) {
    state.lineClearQueue = state.lineClearQueue.map(r => r > row ? r + 1 : r);
  } else {
    state.lineClearQueue = state.lineClearQueue.map(r => r < row ? r - 1 : r);
  }
  enqueueNewFullRows(state);
}

// 【50F追加分】50F専用のライン消去後判定呼び出し用関数
function _flush_line_clear_queue_50f() {
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
}

function tryDropBlocksByOne(state, blockIds, blockCache, extraBlockedCells = null) {
  let settledIds = new Set();
  for (let blockId of Array.from(blockIds).sort((a, b) => a - b)) {
    if (blockId === 9999 || is_fixed_terrain(blockId)) { settledIds.add(blockId); continue; }
    let cells = blockCache[blockId];
    if (!cells || cells.length === 0) { settledIds.add(blockId); continue; }
    let canDrop = true;
    for (const [cx, cy] of cells) {
      let ny = cy + 1;
      if (ny >= MAP_HEIGHT) { canDrop = false; break; }
      if (state.blockMap[ny][cx] >= 1 && state.blockMap[ny][cx] !== blockId) { canDrop = false; break; }
      if (extraBlockedCells && extraBlockedCells.has(`${cx},${ny}`)) { canDrop = false; break; }
    }
    if (canDrop) {
      cells.slice().sort((a, b) => b[1] - a[1]).forEach(([cx, cy]) => { state.blockMap[cy + 1][cx] = blockId; state.blockMap[cy][cx] = 0; moveAttrCell(state.attrMap, cx, cy, cx, cy + 1); });
    } else settledIds.add(blockId);
  }
  return settledIds;
}

function findUnsupportedBlocksAbove(state, cells, excludeId = null) {
  let topCells = {};
  for (const [cx, cy] of cells) { if (!(cx in topCells) || cy < topCells[cx]) topCells[cx] = cy; }
  let foundIds = new Set();
  for (const cx in topCells) {
    let ay = topCells[cx] - 1;
    if (ay < 0) continue;
    let aboveId = state.blockMap[ay][cx];
    if (aboveId >= 1 && aboveId !== excludeId) foundIds.add(aboveId);
  }
  return foundIds;
}

function applyGravityPushOnly(state, fb) {
  if (scene === "boss_60f" && bossSys.isBoss60Transition()) return;

  if (bossSys.isBoss60UpwardActive()) {
    if (state.pushedBlockIds.size === 0) return;
    const baseInterval = state.keyStates.up ? BLOCK_FALL_INTERVAL_FAST : getFallInterval(state.floor);
    if (bossSys.updateBoss60Gravity(state, fb, baseInterval, true, tryDropBlocksByOne, findUnsupportedBlocksAbove, player)) {
      checkLineClear(state, true);
    }
    return;
  }

  if (scene === "boss_20f" || scene === "boss_40f" || scene === "boss_70f" || scene === "boss_80f") return;
  if (state.pushedBlockIds.size === 0) return;

  state.pushGravityTimer += 1; const interval = resolveFallInterval(state.floor, !!state.keyStates.down);
  if (state.pushGravityTimer < interval) return;
  state.pushGravityTimer = 0;
  const fbCells = new Set(fb.getCells().map(c => `${c[0]},${c[1]}`)); const blockCache = state.getBlockCache();
  let existingIds = new Set(); state.pushedBlockIds.forEach(id => { if (blockCache[id]) existingIds.add(id); });
  state.pushedBlockIds = existingIds; if (state.pushedBlockIds.size === 0) return;

  let settledIds = tryDropBlocksByOne(state, state.pushedBlockIds, blockCache, fbCells);
  let movedIds = new Set(Array.from(state.pushedBlockIds).filter(id => !settledIds.has(id)));

  if (bossSys.isBoss60Context()) bossSys.correctPlayerAfterDrop(state, player);

  let chainIds = new Set();
  movedIds.forEach(blockId => { let cells = blockCache[blockId] || []; findUnsupportedBlocksAbove(state, cells, blockId).forEach(x => chainIds.add(x)); });
  chainIds.forEach(id => state.pushedBlockIds.add(id));
  settledIds.forEach(id => state.pushedBlockIds.delete(id));

  if (movedIds.size > 0) fb.timer = interval;
  if (settledIds.size > 0) checkLineClear(state, true);
}

function applyGravityToBlocks(state) {
  if (scene === "boss_60f" && bossSys.isBoss60Transition()) return;

  if (bossSys.isBoss60UpwardActive()) {
    const baseInterval = state.keyStates.up ? BLOCK_FALL_INTERVAL_FAST : getFallInterval(state.floor);
    if (bossSys.updateBoss60Gravity(state, null, baseInterval, false, tryDropBlocksByOne, null, player)) {
      checkLineClear(state, true);
    }
    return;
  }

  state.gravityTimer += 1; const interval = resolveFallInterval(state.floor, !!state.keyStates.down);
  if (state.gravityTimer < interval) return;
  state.gravityTimer = 0;

  const blockCache = state.getBlockCache();
  let settledIds = tryDropBlocksByOne(state, Object.keys(blockCache).map(Number), blockCache);

  if (bossSys.isBoss60Context()) bossSys.correctPlayerAfterDrop(state, player);
  if (settledIds.size > 0) checkLineClear(state, true);
}

function useComboBlock(state, fb) {
  // 【50Fボス専用】50Fボス戦中は専用プール(boss50ComboBlocks)を使用し、
  // 通常フロアで貯めたコンボブロック(comboBlocks)は消費できないようにする
  const inBoss50 = (scene === "boss_50f");
  if (inBoss50) {
    if (state.boss50ComboBlocks <= 0) return;
  } else {
    if (state.comboBlocks <= 0 || scene.startsWith("boss_")) return;
  }
  for (let gaps = 1; gaps < MAP_WIDTH; gaps++) {
    for (let y = MAP_HEIGHT - 1; y >= 0; y--) {
      if (state.blockMap[y].includes(9999)) continue;
      let emptyCols = []; for (let x=0; x<MAP_WIDTH; x++) if (state.blockMap[y][x] === 0) emptyCols.push(x);
      if (emptyCols.length === gaps) {
        let px = emptyCols[Math.floor(emptyCols.length / 2)], mapValue = 1 * 1000 + state.nextSerial;
        state.blockMap[y][px] = mapValue; state.nextSerial += 1;
        if (inBoss50) state.boss50ComboBlocks -= 1; else state.comboBlocks -= 1;
        checkLineClear(state, false); return;
      }
    }
  }
}

function teleportPlayer(p) { p.x = Math.floor((GAME_LEFT + GAME_RIGHT) / 2); p.y = GAME_TOP + 100; p.vy = 0; p.isGrounded = false; p.prevHalfH = P_HALF_H; }
function teleportPlayerBoss20(p) { p.x = GAME_LEFT + 8 * GRID_SIZE; p.y = GAME_BOTTOM - P_HALF_H; p.vy = 0; p.isGrounded = false; p.prevHalfH = P_HALF_H; }

function teleportPlayerBoss80(p) { [p.x, p.y] = bossSys.getBoss80SpawnPosition(); p.vy = 0; p.isGrounded = false; p.prevHalfH = P_HALF_H; }

function applyPlayerDamage(p) {
  p.hp = Math.max(0, p.hp - 1); p.invincible = INVINCIBLE_FRAMES;
  if (p.hp <= 0) scene = "gameover";
  else if (scene === "boss_80f") teleportPlayerBoss80(p);
  else if (scene === "boss_20f" || scene === "boss_40f") teleportPlayerBoss20(p);
  else teleportPlayer(p);
}

// ============================================================
// 90Fボス・91F以降: 属性ブロックの化学反応と接触(本家 update_boss90_* と同じ)
// ============================================================
function isAttrActive(state) {
  return bossSys.isBoss90Context() || (state.floor >= ATTR_FIRST_NORMAL_FLOOR && !bossSys.isBossActive);
}

function isBlockSupported(state, cells) {
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  for (const [cx, cy] of cells) {
    const ny = cy + 1;
    if (ny >= MAP_HEIGHT) return true;
    if (set.has(`${cx},${ny}`)) continue;
    if (state.blockMap[ny][cx] >= 1) return true;
  }
  return false;
}

// 化学反応で駒が消えた直後などに、支えを失って浮いた駒を落下キューに入れる
function markUnsupportedBlocksForGravity(state) {
  const cache = state.getBlockCache();
  for (const bid of Object.keys(cache)) {
    const id = Number(bid);
    if (id === 9999 || is_fixed_terrain(id)) continue;
    if (!isBlockSupported(state, cache[bid])) state.pushedBlockIds.add(id);
  }
}

// 砂属性セルは、真下に支えが無ければ押されなくても自然に崩れ落ちる(セル単位)
function updateSandGravity(state) {
  const cache = state.getBlockCache();
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    let mv = state.blockMap[y][x];
    if (mv < 1 || state.attrMap[y][x] !== ATTR_SAND) continue;
    if (state.pushedBlockIds.has(mv)) continue;
    const ny = y + 1;
    if (ny >= MAP_HEIGHT || state.blockMap[ny][x] !== 0) continue;
    const cells = cache[mv] || [];
    if (cells.length > 1) {
      // このマスの砂だけを新しい1マス駒として切り離す
      const newId = Math.floor(mv / 1000) * 1000 + state.nextSerial; state.nextSerial += 1;
      state.blockMap[y][x] = newId; mv = newId;
    }
    state.pushedBlockIds.add(mv);
  }
}

function updateBoss90BlockReactions(state, fb) {
  updateGrassReactions(state); updateWaterReactions(state); updateIceReactions(state); updateIronReactions(state);
  updateMagneticIron(state); updateDarkReactions(state); updateAttributeReactions(state, fb);
  markUnsupportedBlocksForGravity(state);
}

// 属性のダメージ(炎の継続ダメージ等)。通常ヒットと違い無敵時間は付与しない
function applyBoss90AttributeDamage(player, amount, stunFrames) {
  player.hp = Math.max(0, player.hp - amount);
  if (stunFrames > 0) player.stunFrames = Math.max(player.stunFrames, stunFrames);
  if (player.hp <= 0) { player.hp = 0; scene = "gameover"; }
}

function updateBoss90AttributeContact(state, player) {
  const curPHalfH = player.isCrouching ? CROUCH_P_HALF_H : P_HALF_H;
  const touched = checkAttributeContact(player, state.attrMap, curPHalfH);
  for (const id of touched) for (const actual of getPlayerAttachIds(id)) player.attrState.tryAttach(actual);
  updateIceContactEffects(state, player, touched, curPHalfH);
  updateIronContactEffects(state, player, curPHalfH);
  updateDarkContactEffects(player, touched);
  updateLightContactEffects(player, touched);
  for (const [, amount, stun] of updateStatusCombos(player)) { applyBoss90AttributeDamage(player, amount, stun); if (scene === "gameover") return; }
  for (const [, amount, stun] of player.attrState.update()) { applyBoss90AttributeDamage(player, amount, stun); if (scene === "gameover") break; }
}

function checkCrush(state, fb, p) {
  if (p.invincible > 0 || !p.isGrounded) return;
  // 【当たり判定修復】マージン無しだと、斜めブロックが「1マス空けて浮いた」状態で着地した際に
  // プレイヤーの頭のてっぺんがほんの数px掠っただけで押しつぶし判定になってしまうため、
  // 半マス(GRID_SIZE/2)分のマージンを設けて「実際にしっかり重なった」場合のみ反応するようにする。
  const headGy = Math.floor((p.y - (P_HALF_H - GRID_SIZE / 2) - GAME_TOP) / GRID_SIZE);
  const lx = Math.floor((p.x - (P_HALF_W - 2) - GAME_LEFT) / GRID_SIZE);
  const rx = Math.floor((p.x + (P_HALF_W - 2) - GAME_LEFT) / GRID_SIZE);
  const fbCells = (scene === "boss_20f" || scene === "boss_40f") ? new Set() : new Set(fb.getCells().map(([x,y]) => `${x},${y}`));
  for (const cx of [lx, rx]) {
    if (cx < 0 || cx >= MAP_WIDTH) continue;
    const inFb = fbCells.has(`${cx},${headGy}`);
    let above = inFb || (headGy >= 0 && headGy < MAP_HEIGHT && state.blockMap[headGy][cx] >= 1 && state.blockMap[headGy][cx] !== 9999 && state.blockMap[headGy][cx] !== SPIKE_ID);
    // 水など「すり抜けられる」属性のブロックは、頭上にあっても押しつぶし判定の対象外
    if (above) {
      if (inFb) { if (isPassableAttr(fb.attribute)) above = false; }
      else if (isPassableAttr(state.attrMap[headGy][cx])) above = false;
    }
    if (above) { applyPlayerDamage(p); break; }
  }
}

function checkCrushHarddrop(state, p) {
  if (p.invincible > 0) return;
  const checkXs = [Math.floor((p.x - (P_HALF_W - 2) - GAME_LEFT) / GRID_SIZE), Math.floor((p.x + (P_HALF_W - 2) - GAME_LEFT) / GRID_SIZE)];
  const checkYs = [Math.floor((p.y - (P_HALF_H - 2) - GAME_TOP) / GRID_SIZE), Math.floor((p.y + (P_HALF_H - 2) - GAME_TOP) / GRID_SIZE)];
  for (const cy of checkYs) for (const cx of checkXs) {
    if (cx >= 0 && cx < MAP_WIDTH && cy >= 0 && cy < MAP_HEIGHT && state.blockMap[cy][cx] >= 1 && state.blockMap[cy][cx] !== 9999 && state.blockMap[cy][cx] !== SPIKE_ID) {
      if (isPassableAttr(state.attrMap[cy][cx])) continue;
      applyPlayerDamage(p); return;
    }
  }
}

// 【当たり判定修復】ハードドロップは瞬間移動のため、着地位置だけを見る checkCrushHarddrop では
// 「落下経路の途中でプレイヤーの体をすり抜ける」（空中にいる時／足場からはみ出している時に、
// ブロックがプレイヤーの下の遠い床まで落ちてしまい、最終着地位置とプレイヤー位置がズレて
// 何も検知できない）ケースを捕捉できない。そのため、1マス落ちるたびに現在の fb セルと
// プレイヤーの重なりを確認する「通過判定」を別途用意する。
function checkCrushHarddropSweep(state, fb, p) {
  if (p.invincible > 0) return false;
  const checkXs = [Math.floor((p.x - (P_HALF_W - 2) - GAME_LEFT) / GRID_SIZE), Math.floor((p.x + (P_HALF_W - 2) - GAME_LEFT) / GRID_SIZE)];
  const checkYs = [Math.floor((p.y - (P_HALF_H - 2) - GAME_TOP) / GRID_SIZE), Math.floor((p.y + (P_HALF_H - 2) - GAME_TOP) / GRID_SIZE)];
  const fbCells = new Set(fb.getCells().map(([x, y]) => `${x},${y}`));
  for (const cy of checkYs) for (const cx of checkXs) {
    if (fbCells.has(`${cx},${cy}`)) { applyPlayerDamage(p); return true; }
  }
  return false;
}

function checkBoss20fGoal(state, p) {
  const corners = [
    [p.x - P_HALF_W + 2, p.y - P_HALF_H + 2], [p.x + P_HALF_W - 2, p.y - P_HALF_H + 2],
    [p.x - P_HALF_W + 2, p.y + P_HALF_H - 2], [p.x + P_HALF_W - 2, p.y + P_HALF_H - 2]
  ];
  for (const [px, py] of corners) {
    let gx = Math.floor((px - GAME_LEFT) / GRID_SIZE), gy = Math.floor((py - GAME_TOP) / GRID_SIZE);
    if (gx >= 0 && gx < MAP_WIDTH && gy >= 0 && gy < MAP_HEIGHT && state.blockMap[gy][gx] === 9999) return true;
  }
  return false;
}

function updateBeam(beam, player, forcedCycle = null) {
  if (scene === "boss_20f" || scene === "boss_40f" || scene === "boss_60f" || scene === "boss_70f" || scene === "boss_80f" || scene === "boss_90f") { beam.timer = 0; beam.phase = "wait"; return; }
  const currentCycle = forcedCycle !== null ? forcedCycle : getBeamCycle(state.floor);
  if (currentCycle === Infinity && !bossSys.isBossActive) { beam.timer = 0; beam.phase = "wait"; return; }
  let cycle = (bossSys.isBossActive && !bossSys.cursedBeamActive) ? 600 : currentCycle;
  beam.timer += 1;
  if (beam.phase === "wait" && beam.timer >= cycle - BEAM_WARNING) {
    beam.phase = "warning"; let pGx = Math.floor((player.x - GAME_LEFT) / GRID_SIZE);
    beam.col = Math.max(0, Math.min(MAP_WIDTH - BEAM_WIDTH, pGx - Math.floor(BEAM_WIDTH / 2)));
  }
  if (beam.phase === "warning") beam.blinkOn = (Math.floor(beam.timer / 8) % 2 === 0);
  if (beam.phase === "warning" && beam.timer >= cycle) { beam.phase = "firing"; beam.showTimer = BEAM_SHOW_FRAMES; beam.timer = 0; }
  if (beam.phase === "firing") {
    beam.showTimer -= 1;
    if (player.invincible === 0) {
      let pGx = Math.floor((player.x - GAME_LEFT) / GRID_SIZE);
      if (beam.col <= pGx && pGx < beam.col + BEAM_WIDTH) applyPlayerDamage(player);
    }
    if (beam.showTimer <= 0) beam.phase = "wait";
  }
}

function updateBlockMove(state, fb, bms) {
  if (scene === "boss_20f" || scene === "boss_40f" || scene === "boss_70f" || scene === "boss_80f") return;
  if (bms.leftHeld === bms.rightHeld) { bms.holdFrames = 0; bms.repeatAcc = 0; return; }
  
  // 【50Fボス専用追加分】ブロック操作反転ステータスの取得・反映
  let isBlockReversed = false;
  if (scene === "boss_50f") {
    let effects = bossSys.getPlayerStatusEffects(state);
    isBlockReversed = effects.blockReversed;
  }

  let dir = bms.leftHeld ? -1 : 1;
  if (isBlockReversed) dir = -dir; // 左右進行方向の鏡像反転

  if (bms.holdFrames === 0 || (bms.holdFrames >= BLOCK_MOVE_INITIAL_DELAY && ++bms.repeatAcc >= BLOCK_MOVE_REPEAT_DELAY)) {
    if (bms.holdFrames > 0) bms.repeatAcc = 0; if (!checkCollision(state, fb, fb.x + dir, fb.y)) fb.x += dir;
  }
  bms.holdFrames += 1;
}

function updateFallingBlock(state, fb, isTutorial = false, tutState = null) {
  if (scene === "boss_20f" || scene === "boss_40f" || scene === "boss_70f" || scene === "boss_80f") return;
  const isUpward = bossSys.isBoss60UpwardActive();
  const isFast = isUpward ? !!state.keyStates.up : !!state.keyStates.down;
  const interval = resolveFallInterval(state.floor, isFast);
  fb.timer += 1; if (fb.timer < interval) return;
  fb.timer = 0;

  if (isUpward) {
    if (!checkCollision(state, fb, fb.x, fb.y - 1)) fb.y -= 1;
    else {
      lockBlock(state, fb);
      fb.spawnBlock(state, tutState, false, isTutorial);
      checkLineClear(state, true);
    }
    return;
  }

  if (!checkCollision(state, fb, fb.x, fb.y + 1)) fb.y += 1;
  else {
    lockBlock(state, fb);
    
    // 【50Fボス専用追加分】固定時、フェーズ進行用割り込み要求があれば強制割り当て
    let forcedId = bossSys.getForcedSpawnShapeId();
    if (forcedId) {
      fb.spawnBlockForced(forcedId);
    } else {
      fb.spawnBlock(state, tutState, false, isTutorial);
    }
    checkLineClear(state, true);
    
    // 【50F追加分】固定直後にターゲット消去されたかどうかの通常走査判定
    if (scene === "boss_50f") _flush_line_clear_queue_50f();
  }
}

function isSolidAll(state, fb, gx, gy) {
  if (gx < 0 || gx >= MAP_WIDTH || gy < 0 || gy >= MAP_HEIGHT) return false;
  if (state.blockMap[gy][gx] === 9999 || state.blockMap[gy][gx] === SPIKE_ID) return false;
  if (state.blockMap[gy][gx] >= 1) return !isPassableAttr(state.attrMap[gy][gx]);
  if (scene === "boss_20f" || scene === "boss_40f" || scene === "boss_80f") return false;
  for (const [fx,fy] of fb.getCells()) { if (fx === gx && fy === gy) return true; }
  return false;
}

// 80F: 足場(生成足場・初期足場)に対する上下方向の判定(本家 _resolve_boss80_platform_vertical)
function resolveBoss80PlatformVertical(player, nextY, vy, pHalfH) {
  const platforms = bossSys.getBoss80Platforms();
  const pl = player.x - P_HALF_W + 2, pr = player.x + P_HALF_W - 2;
  const curTop = player.y - pHalfH, curBottom = player.y + pHalfH;
  const nextTop = nextY - pHalfH, nextBottom = nextY + pHalfH;
  if (vy >= 0) {
    let landingY = null;
    for (const [px0, py0, px1, py1] of platforms) {
      if (pr <= px0 || pl >= px1) continue;
      if (curBottom <= py0 + 1 && nextBottom >= py0) { if (landingY === null || py0 < landingY) landingY = py0; }
    }
    if (landingY !== null) return [landingY - pHalfH, true];
  } else {
    let ceilingY = null;
    for (const [px0, py0, px1, py1] of platforms) {
      if (pr <= px0 || pl >= px1) continue;
      if (curTop >= py1 - 1 && nextTop <= py1) { if (ceilingY === null || py1 > ceilingY) ceilingY = py1; }
    }
    if (ceilingY !== null) return [ceilingY + pHalfH, false];
  }
  return [nextY, false];
}

function updatePlayer(state, fb, player) {
  const ks = state.keyStates;

  // 【50Fボス専用追加分】プレイヤー操作反転ステータスの取得
  let isPlayerReversed = false;
  if (scene === "boss_50f") {
    let effects = bossSys.getPlayerStatusEffects(state);
    isPlayerReversed = effects.playerReversed;
  }

  // 雷などの痺れ状態: カウントダウンしつつ、その間は入力を一切受け付けない(属性ブロックのある階だけで起こる)
  const isStunned = player.stunFrames > 0;
  if (isStunned) player.stunFrames -= 1;
  // 闇に触れた後の視界暗転タイマー
  if (player.darknessFrames > 0) player.darknessFrames -= 1;

  const isCrouching = !!ks.s && !isStunned;
  player.isCrouching = isCrouching;
  const curPHalfH = isCrouching ? CROUCH_P_HALF_H : P_HALF_H;
  const curMoveSpeed = isCrouching ? CROUCH_MOVE_SPEED : MOVE_SPEED;

  // しゃがみ／立ち上がりの切り替え時、足元の接地位置を保ったままその場で身長だけ縮む・伸びるようにする
  // （切り替え直後に重力任せで「落ちる」ような見た目になるのを防ぐ）
  if (player.prevHalfH === undefined) player.prevHalfH = P_HALF_H;
  if (player.isGrounded && curPHalfH !== player.prevHalfH) {
    const groundedFootY = player.y + player.prevHalfH;
    player.y = groundedFootY - curPHalfH;
  }
  player.prevHalfH = curPHalfH;

  // 横移動(氷の上では入力加速+慣性滑走)
  const iceSurfaceAttr = getPlayerIceSurfaceAttr(state, player, curPHalfH);
  if (iceSurfaceAttr === null) player.iceSpeedBoost = false;

  player.vx = 0;
  if (!isStunned) {
    if (iceSurfaceAttr !== null) {
      let maxSpeed, accel, friction;
      if (iceSurfaceAttr === ATTR_ICE_SUPERCONDUCTIVE || player.iceSpeedBoost) { maxSpeed = ICE_SUPER_MAX_SPEED; accel = ICE_SUPER_ACCELERATION; friction = ICE_SUPER_FRICTION; }
      else { maxSpeed = ICE_SLIDE_MAX_SPEED; accel = ICE_SLIDE_ACCELERATION; friction = ICE_SLIDE_FRICTION; }
      let direction = 0;
      if (ks.a && ks.d) { if (state.lastHkey === "a") direction = -1; else if (state.lastHkey === "d") direction = 1; }
      else if (ks.a) direction = -1; else if (ks.d) direction = 1;
      if (isPlayerReversed) direction = -direction;
      if (direction) player.horizontalVelocity += (direction * maxSpeed - player.horizontalVelocity) * accel;
      else player.horizontalVelocity *= friction;
      player.horizontalVelocity = Math.max(-maxSpeed, Math.min(maxSpeed, player.horizontalVelocity));
      player.vx = player.horizontalVelocity;
    } else {
      if (ks.a && ks.d) player.vx = (state.lastHkey === "a") ? -curMoveSpeed : curMoveSpeed;
      else if (ks.a) player.vx = -curMoveSpeed; else if (ks.d) player.vx = curMoveSpeed;

      if (isPlayerReversed) player.vx = -player.vx; // 【50F追加】左右入力速度の鏡像反転
      player.horizontalVelocity = player.vx;
    }
  } else player.horizontalVelocity = 0;

  const upperY = Math.floor((player.y - (curPHalfH - 1) - GAME_TOP) / GRID_SIZE);
  const lowerY = Math.floor((player.y + (curPHalfH - 1) - GAME_TOP) / GRID_SIZE);
  const nextLx = Math.floor((player.x + player.vx - (P_HALF_W - 1) - GAME_LEFT) / GRID_SIZE);
  const nextRx = Math.floor((player.x + player.vx + (P_HALF_W - 1) - GAME_LEFT) / GRID_SIZE);
  let hittingBlock = false, blockCache = null;

  if (scene === "boss_70f") {
    [player.x, player.y] = bossSys.resolveBoss70Horizontal(player.x, player.x + player.vx, player.y, P_HALF_W, curPHalfH);
  } else {
    for (const gridY of [upperY, lowerY]) {
      if (gridY < 0 || gridY >= MAP_HEIGHT) continue;
      if (player.vx < 0 && nextLx >= 0 && nextLx < MAP_WIDTH && state.blockMap[gridY][nextLx] >= 1 && state.blockMap[gridY][nextLx] !== 9999 && state.blockMap[gridY][nextLx] !== SPIKE_ID && !isPassableAttr(state.attrMap[gridY][nextLx])) {
        hittingBlock = true; let targetId = state.blockMap[gridY][nextLx];
        if (is_fixed_terrain(targetId)) { player.vx = 0; break; }
        if (!blockCache) blockCache = state.getBlockCache();
        let cells = blockCache[targetId] || [];
        let canPush = !(cells.length && isHeavyAttr(state.attrMap[cells[0][1]][cells[0][0]])) && cells.every(([cx,cy]) => cx - 1 >= 0 && (state.blockMap[cy][cx-1] === 0 || state.blockMap[cy][cx-1] === targetId));
        player.pushTimerR = 0;
        if (canPush) {
          player.pushTimerL += 1;
          if (player.pushTimerL >= PUSH_DELAY) {
            cells.sort((a,b) => a[0]-b[0]).forEach(([cx,cy]) => { state.blockMap[cy][cx-1] = targetId; state.blockMap[cy][cx] = 0; moveAttrCell(state.attrMap, cx, cy, cx - 1, cy); });
            player.pushTimerL = 0; state.pushedBlockIds.add(targetId); state.pushGravityTimer = 0;
          } else player.vx = 0;
        } else player.vx = 0;
        break;
      }
      if (player.vx > 0 && nextRx >= 0 && nextRx < MAP_WIDTH && state.blockMap[gridY][nextRx] >= 1 && state.blockMap[gridY][nextRx] !== 9999 && state.blockMap[gridY][nextRx] !== SPIKE_ID && !isPassableAttr(state.attrMap[gridY][nextRx])) {
        hittingBlock = true; let targetId = state.blockMap[gridY][nextRx];
        if (is_fixed_terrain(targetId)) { player.vx = 0; break; }
        if (!blockCache) blockCache = state.getBlockCache();
        let cells = blockCache[targetId] || [];
        let canPush = !(cells.length && isHeavyAttr(state.attrMap[cells[0][1]][cells[0][0]])) && cells.every(([cx,cy]) => cx + 1 < MAP_WIDTH && (state.blockMap[cy][cx+1] === 0 || state.blockMap[cy][cx+1] === targetId));
        player.pushTimerL = 0;
        if (canPush) {
          player.pushTimerR += 1;
          if (player.pushTimerR >= PUSH_DELAY) {
            cells.sort((a,b) => b[0]-a[0]).forEach(([cx,cy]) => { state.blockMap[cy][cx+1] = targetId; state.blockMap[cy][cx] = 0; moveAttrCell(state.attrMap, cx, cy, cx + 1, cy); });
            player.pushTimerR = 0; state.pushedBlockIds.add(targetId); state.pushGravityTimer = 0;
          } else player.vx = 0;
        } else player.vx = 0;
        break;
      }
    }
    player.x += player.vx;
  }

  if (!hittingBlock) { player.pushTimerL = 0; player.pushTimerR = 0; }
  player.x = Math.max(GAME_LEFT + P_HALF_W, Math.min(GAME_RIGHT - P_HALF_W, player.x));

  if (player.vy === null || player.vy === undefined) player.vy = 0;

  // 風ブロックに乗っている間の滞空(属性ブロックのある階だけで起こる)
  if (player.onWind) {
    const lfx = Math.trunc((player.x - (P_HALF_W - 2) - GAME_LEFT) / GRID_SIZE), rfx = Math.trunc((player.x + (P_HALF_W - 2) - GAME_LEFT) / GRID_SIZE);
    const startGy = Math.trunc((player.y - GAME_TOP) / GRID_SIZE);
    let windSurfaceGy = null;
    for (const cx of [lfx, rfx]) {
      const row = findSolidRowBelow(state.blockMap, cx, startGy, MAP_WIDTH, MAP_HEIGHT);
      if (row !== null && state.attrMap[row][cx] === ATTR_WIND) { if (windSurfaceGy === null || row < windSurfaceGy) windSurfaceGy = row; }
    }
    if (windSurfaceGy === null) player.onWind = false;   // 風から外れた。下の通常処理に切り替わる
    else {
      const surfaceTopY = GAME_TOP + windSurfaceGy * GRID_SIZE; let heightCells;
      if (player.windState === "rising") {
        player.windHeight += WIND_RISE_SPEED_CELLS;
        if (player.windHeight >= WIND_FLOAT_MIN_CELLS) { player.windHeight = WIND_FLOAT_MIN_CELLS; player.windState = "floating"; player.windPhase = 0; }
        heightCells = player.windHeight;
      } else {
        player.windPhase += (2 * Math.PI) / WIND_FLOAT_PERIOD_FRAMES;
        heightCells = windFloatHeightCells(player.windPhase);
      }
      player.y = surfaceTopY - heightCells * GRID_SIZE - curPHalfH; player.vy = 0; player.isGrounded = false;
    }
  }

  if (!player.onWind) {
  if (!player.isGrounded) player.vy += GRAVITY;
  else {
    player.vy = 0;
    if (ks.space && !bossSys.isBoss60Context() && !isStunned) { player.vy = JUMP_SPEED; player.isGrounded = false; }
  }

  if (bossSys.isBoss60Context()) {
    const boss60Vy = bossSys.getBoss60JumpVy(JUMP_SPEED, state.spaceTriggered, state.sTriggered);
    if (boss60Vy !== 0) { player.vy = boss60Vy; player.isGrounded = false; }
  }
  state.spaceTriggered = false; state.sTriggered = false;

  const nextY = player.y + player.vy;
  player.isGrounded = false;

  if (scene === "boss_70f") {
    const [resolvedY, isGrounded] = bossSys.resolveBoss70Vertical(player.x, player.y, nextY, player.vy, P_HALF_W, curPHalfH);
    player.y = resolvedY;
    if (isGrounded) { player.isGrounded = true; player.vy = 0; }
  } else {
    const lfootX = Math.floor((player.x - (P_HALF_W - 2) - GAME_LEFT) / GRID_SIZE);
    const rfootX = Math.floor((player.x + (P_HALF_W - 2) - GAME_LEFT) / GRID_SIZE);
    const headGy = Math.floor((nextY - curPHalfH - GAME_TOP) / GRID_SIZE);
    const footGy = Math.floor((nextY + curPHalfH - GAME_TOP) / GRID_SIZE);
    const isUpward = bossSys.isBoss60UpwardActive();

    let landed = false;
    if (scene === "boss_80f") {
      // 80F: トゲ接触で生まれる足場・初期足場だけを床として扱う(盤面の床判定は使わない)
      const [ry, rg] = resolveBoss80PlatformVertical(player, nextY, player.vy, curPHalfH);
      player.y = ry; landed = true;
      if (rg) { player.isGrounded = true; player.vy = 0; }
    }
    for (const cx of (scene === "boss_80f" ? [] : [lfootX, rfootX])) {
      if (cx < 0 || cx >= MAP_WIDTH) continue;
      if (isUpward) {
        if (player.vy <= 0 && headGy >= 0 && headGy < MAP_HEIGHT && isSolidAll(state, fb, cx, headGy)) {
          player.y = (headGy + 1) * GRID_SIZE + GAME_TOP + curPHalfH; player.isGrounded = true; player.vy = 0; landed = true; break;
        }
        if (player.vy > 0 && footGy >= 0 && footGy < MAP_HEIGHT && isSolidAll(state, fb, cx, footGy)) {
          player.y = footGy * GRID_SIZE + GAME_TOP - curPHalfH; player.vy = 0; landed = true; break;
        }
      } else {
        if (player.vy >= 0 && footGy >= 0 && footGy < MAP_HEIGHT && isSolidAll(state, fb, cx, footGy)) {
          player.y = footGy * GRID_SIZE + GAME_TOP - curPHalfH; player.isGrounded = true; landed = true;
          if (cx >= 0 && cx < MAP_WIDTH && state.attrMap[footGy][cx] === ATTR_WIND) {
            // 風ブロックに着地した瞬間、滞空モードへ切り替える
            player.onWind = true; player.windState = "rising"; player.windHeight = 0; player.isGrounded = false;
          }
          break;
        }
        if (player.vy < 0 && headGy >= 0 && headGy < MAP_HEIGHT && isSolidAll(state, fb, cx, headGy)) {
          player.y = (headGy + 1) * GRID_SIZE + GAME_TOP + curPHalfH; player.vy = 0; landed = true; break;
        }
      }
    }
    if (!landed) player.y = nextY;
    if (player.y > GAME_BOTTOM - curPHalfH) { player.y = GAME_BOTTOM - curPHalfH; player.isGrounded = true; player.vy = 0; }
    if (player.y < GAME_TOP + curPHalfH) {
      player.y = GAME_TOP + curPHalfH;
      if (isUpward) player.isGrounded = true;
      if (player.vy < 0) player.vy = 0;
    }
  }
  } // end !player.onWind
  if (player.onWind) {   // 風に乗っている間も画面上下の端には収める
    if (player.y > GAME_BOTTOM - curPHalfH) { player.y = GAME_BOTTOM - curPHalfH; player.isGrounded = true; player.vy = 0; }
    if (player.y < GAME_TOP + curPHalfH) { player.y = GAME_TOP + curPHalfH; if (player.vy < 0) player.vy = 0; }
  }

  // 20F
  if (scene === "boss_20f" && checkBoss20fGoal(state, player)) {
    bossSys.isBossActive = false; bossSys.targetReached = true; scene = "game"; player.hp = MAX_HP;
    teleportPlayer(player); player.invincible = INVINCIBLE_FRAMES; bossSys.restorePreviousMap(state);
    state.floor = 21; state.floorLines = 0; state.notifiedFloor = 21; flushLineClearQueue(state, false);
  }

  // 80F: トゲ接触(足場生成+ダメージ)・ゴール判定。衝突解決の直後に行う
  if (scene === "boss_80f") {
    const r80 = bossSys.updateBoss80Logic(state, player);
    if (r80 === "damage") applyPlayerDamage(player);
    else if (r80 === "victory") {
      bossSys.isBossActive = false; scene = "game"; player.hp = MAX_HP;
      teleportPlayer(player); player.invincible = INVINCIBLE_FRAMES; bossSys.restorePreviousMap(state);
      state.floor = 81; state.floorLines = 0; state.notifiedFloor = 81; flushLineClearQueue(state, false);
    }
  }

  if (player.invincible > 0) { player.invincible -= 1; player.blinkVisible = (Math.floor(player.invincible / 6) % 2 === 0); }
  else player.blinkVisible = true;
}
