// ============================================================
// 70F: シーソー物理ギミック用の座標変換ヘルパー
// (Pymunk実装の代わりに、トルク積分による簡易剛体シミュレーションで近似する)
// ============================================================
function seesawWorldToLocal(wx, wy, angle) {
  const dx = wx - SEESAW_PIVOT_X, dy = wy - SEESAW_PIVOT_Y;
  const cos = Math.cos(-angle), sin = Math.sin(-angle);
  return [dx * cos - dy * sin, dx * sin + dy * cos];
}
function seesawLocalToWorld(lx, ly, angle) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return [SEESAW_PIVOT_X + lx * cos - ly * sin, SEESAW_PIVOT_Y + lx * sin + ly * cos];
}
const BLOCK_CELL_WEIGHT = BLOCK_UNIT_MASS * SEESAW_GRAVITY_CONST; // 70F: ブロック1マス分の重み

// 70F: 落下中のアクティブブロック（NEXTと実スポーンで同じ抽選ロジックを共有）
class ActiveBlock70 {
  constructor(spawnSide, blockData) { this.spawn(spawnSide, blockData); }
  spawn(spawnSide, blockData) {
    const data = blockData;
    this.cells = data.shape.map(([dx, dy]) => [dx, dy]);
    this.color = data.color; this.outline = data.outline;
    let minX = Math.min(...this.cells.map(([dx]) => dx)), maxX = Math.max(...this.cells.map(([dx]) => dx));
    let minY = Math.min(...this.cells.map(([, dy]) => dy)), maxY = Math.max(...this.cells.map(([, dy]) => dy));
    this.centerOffsetX = (minX + maxX + 1) * GRID_SIZE / 2.0;
    this.centerOffsetY = (minY + maxY + 1) * GRID_SIZE / 2.0;
    this.x = (spawnSide === "left") ? GAME_LEFT + 2 * GRID_SIZE : GAME_RIGHT - 2 * GRID_SIZE;
    this.y = GAME_TOP + 1 * GRID_SIZE;
    this.angleDeg = 0.0;
  }
  rotate(dirDeg) { this.angleDeg = (this.angleDeg + dirDeg + 360) % 360; }
  getCellLocalCenters() {
    return this.cells.map(([cx, cy]) => [
      (cx * GRID_SIZE + GRID_SIZE / 2.0) - this.centerOffsetX,
      (cy * GRID_SIZE + GRID_SIZE / 2.0) - this.centerOffsetY,
    ]);
  }
}

// ============================================================
// BossManager クラス (boss_data.py 完全互換 + 50F対応拡張)
// ============================================================
class BossManager {
  constructor() { this.reset_all(); }
  reset_all() {
    this.savedBlockMap = null;
    this.isBossActive = false;
    this.bossFloor = 10;
    this.bossHp = 0;
    this.cursedBeamActive = false;
    this.bossTimer = 0;
    this.targetReached = false;
    
    // 30F
    this.puzzleMap = null;
    this.boss30PhaseIndex = 0;
    this.boss30Hp = 0;
    this.boss30Timer = 0;
    this.trapActive = false;
    this.trapTimer = 0;
    this.bigBeamPhase = "none";
    this.bigBeamTimer = 0;
    this.trapBlinkOn = true;
    this.boss30Cleared = false;
    
    // 40F
    this.boss40Cleared = false;
    this.boss40Step = 0;
    this.boss40Timer = 20;
    this.boss40SearchCount = 0;
    this.boss40LaserPhase = "none";
    this.boss40ActiveCols = [];
    this.boss40ActiveRows = [];

    // 【50Fボス専用追加分】パラメータ初期化
    this.boss50Phase = 0;                  // 1:青(R), 2:赤(B), 3:紫(P)
    this.boss50PhaseBlockLocked = false; // ターゲットが盤面に一度でもロックされたか
    this.boss50TargetRemaining = 0;       // 現在盤面上の対象セル残数
    this.boss50SpawnRequested = false;    // 特殊ブロックの強制割り込み生成フラグ
    this.boss50Cleared = false;            // 50Fボス完全撃破フラグ

    // 60F: 水中戦・水流ギミック
    this.boss60Flow = "down";
    this.boss60Transition = false;
    this.boss60TransitionTimer = 0;
    this.boss60LinesTotal = 0;
    this.boss60PhaseCount = 0;
    this.boss60LinesInPhase = 0;
    this.boss60Cleared = false;

    // 70F: シーソー物理ギミック（簡易剛体シミュレーションで近似）
    // 【リファクタ】70F関連のプロパティを1つのオブジェクトにまとめて管理する。
    // 新しいボスを追加する際はここに `this.boss80 = {...}` のように1個増やすだけでよい。
    this.boss70 = {
      angle: 0,
      angularVelocity: 0,
      heightMap: null,        // 各列のローカルY(積み上げ高さ)
      placedBlocks: [],       // {col, localY, w, h, color, outline} の配列（描画・当たり判定用）
      activeBlock: null,
      nextBlockData: null,
      phase: 1,
      winTimer: BOSS70_WIN_TIMER_MAX,
      spawnSide: "left",
      spawnDelayTimer: 0,
      cleared: false,
      wasGroundedOnSeesaw: false,
      fallingBlocks: [],
      groupVelocities: new Map(),
    };
  }
  saveCurrentMap(blockMap) { this.savedBlockMap = blockMap.map(row => [...row]); }
  restorePreviousMap(state) { if (this.savedBlockMap) { state.blockMap = this.savedBlockMap.map(row => [...row]); } }
  
  generateBossStage(state, floor) {
    this.bossFloor = floor;
    this.isBossActive = true;
    this.saveCurrentMap(state.blockMap);
    state.blockMap = Array.from({length: MAP_HEIGHT}, () => new Array(MAP_WIDTH).fill(0));
    
    if (floor === 10) {
      const startY = MAP_HEIGHT - 8;
      for (let y = startY; y < MAP_HEIGHT; y++) {
        const holeX = Math.floor(Math.random() * MAP_WIDTH);
        const mapValue = encode_fixed_terrain(state.nextSerial);
        for (let x = 0; x < MAP_WIDTH; x++) { if (x !== holeX) state.blockMap[y][x] = mapValue; }
        state.nextSerial += 1;
      }
      this.bossHp = 8;
    } else if (floor === 20) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          let val = BOSS_20F_MAP[y][x];
          if (val === 9999) state.blockMap[y][x] = 9999;
          else if (val > 0) state.blockMap[y][x] = encode_fixed_terrain(state.nextSerial);
        }
      }
      state.nextSerial += 1;
      this.bossTimer = 3600;
      this.targetReached = false;
    } else if (floor === 30) {
      this.boss30PhaseIndex = 0;
      this.boss30Hp = 3;
      this.boss30Timer = 3600;
      this.trapActive = false;
      this.trapTimer = 0;
      this.bigBeamPhase = "none";
      this.bigBeamTimer = 0;
      this.boss30Cleared = false;
      this.generate_puzzle_pattern();
    } else if (floor === 40) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          if (BOSS_40F_MAP[y][x] === 1) state.blockMap[y][x] = encode_fixed_terrain(state.nextSerial);
        }
      }
      state.nextSerial += 1;
      this.bossTimer = 3600;
      this.init_boss40_state();
    } else if (floor === 50) {
      // 【50Fボス専用追加分】50Fステージ初期構成生成
      this.boss50Phase = 1;
      this.boss50PhaseBlockLocked = false;
      this.boss50TargetRemaining = 0;
      this.boss50SpawnRequested = true; // 開幕時の割り込み要求
      this.boss50Cleared = false;
    } else if (floor === 60) {
      this.boss60Flow = "down";
      this.boss60Transition = false;
      this.boss60TransitionTimer = 0;
      this.boss60LinesTotal = 0;
      this.boss60PhaseCount = 0;
      this.boss60LinesInPhase = 0;
      this.boss60Cleared = false;
    } else if (floor === 70) {
      this.initBoss70Physics();
      this.boss70.phase = 1;
      this.boss70.winTimer = BOSS70_WIN_TIMER_MAX;
      this.boss70.spawnSide = "left";
      this.boss70.spawnDelayTimer = 0;
      this.boss70.cleared = false;
      this.boss70.wasGroundedOnSeesaw = false;
    }
  }

  // --------------------------------------------------------
  // 60F: 水中戦・水流ギミック
  // --------------------------------------------------------
  isBoss60Upward() { return this.isBoss60Context() && this.boss60Flow === "up"; }
  isBoss60Transition() { return this.boss60Transition; }
  isBoss60Context() { return this.isBossActive && this.bossFloor === 60; }
  isBoss60UpwardActive() { return this.isBoss60Context() && this.boss60Flow === "up"; }
  getBoss60FallIntervalMultiplier() { return BOSS60_FALL_MULTIPLIER; }
  getBoss60JumpFactor() { return BOSS60_JUMP_FACTOR; }
  getAdjustedFallInterval(base) { return this.isBoss60Context() ? Math.floor(base * this.getBoss60FallIntervalMultiplier()) : base; }
  getBoss60FlowDisplay() { return this.boss60Flow.toUpperCase(); }
  getBoss60PhaseDisplay() { return `${this.boss60PhaseCount + 1} / 4`; }
  getBoss60LinesDisplay() { return `${this.boss60LinesInPhase} / 4`; }

  isBoss60CeilingBlocked(ty) {
    if (this.isBoss60UpwardActive()) { if (ty < 0 || ty >= MAP_HEIGHT) return true; }
    else { if (ty >= MAP_HEIGHT) return true; }
    return false;
  }

  getBoss60JumpVy(jumpSpeed, spaceTriggered, sTriggered) {
    if (!this.isBoss60Upward() && spaceTriggered) return jumpSpeed * this.getBoss60JumpFactor();
    if (this.isBoss60Upward() && sTriggered) return -jumpSpeed * this.getBoss60JumpFactor();
    return 0;
  }

  getBoss60SpawnY(shape, defaultY) {
    if (this.boss60Flow === "up") {
      let maxDy = Math.max(...shape.map(([dx, dy]) => dy));
      return MAP_HEIGHT - maxDy - 1;
    }
    return defaultY;
  }

  updateBoss60Frame(state, player, fb, beam) {
    if (this.boss60Cleared) return "victory";
    // 水流方向に応じた浮力／上昇力は、遷移演出中も途切れさせずに毎フレーム適用する。
    // （ここが止まると、遷移中は通常重力だけが相殺されずにかかり続け、
    //   プレイヤーが画面端まで一気に落ちてしまうバグになる）
    if (this.boss60Flow === "up") {
      if (!player.isGrounded) player.vy -= BOSS60_UPWARD_FORCE;
    } else {
      player.vy -= BOSS60_BUOYANCY;
      if (player.vy < 0) player.isGrounded = false;
    }
    if (this.isBoss60Transition()) {
      this.updateBoss60Transition(state, player);
      beam.phase = "wait"; beam.timer = 0;
      return "running";
    } else {
      if (this.boss60PhaseCount >= 2) return "update_beam";
      beam.phase = "wait"; beam.timer = 0;
      return "running";
    }
  }

  updateBoss60Logic(state, player, beam) {
    if (this.boss60Flow === "up") {
      if (!player.isGrounded) player.vy -= BOSS60_UPWARD_FORCE;
    } else {
      player.vy -= BOSS60_BUOYANCY;
      if (player.vy < 0) player.isGrounded = false;
    }
  }

  triggerFlowTransition() {
    this.boss60Transition = true;
    this.boss60TransitionTimer = BOSS60_TRANSITION_FRAMES;
    this.boss60Flow = (this.boss60Flow === "down") ? "up" : "down";
  }

  updateBoss60Transition(state, player) {
    if (!this.boss60Transition) return false;
    this.boss60TransitionTimer -= 1;
    if (this.boss60TransitionTimer % BOSS60_SHIFT_INTERVAL === 0) {
      if (this.boss60Flow === "up") this.applyBoss60UpwardGravity(state, player);
      else this.applyBoss60DownwardGravity(state);
    }
    if (this.boss60TransitionTimer <= 0) { this.boss60Transition = false; return true; }
    return false;
  }

  onBoss60LineCleared(linesCleared) {
    this.boss60LinesTotal += linesCleared;
    this.boss60LinesInPhase += linesCleared;
    if (this.boss60LinesInPhase >= 4) {
      this.boss60LinesInPhase = 0;
      this.boss60PhaseCount += 1;
      if (this.boss60PhaseCount > 3) { this.boss60Cleared = true; this.boss60Flow = "down"; return "victory"; }
      else if (!this.boss60Transition) { this.triggerFlowTransition(); return "transition"; }
      return "running";
    }
    return "running";
  }

  applyBoss60UpwardGravity(state, player = null) {
    let cache = state.getBlockCache();
    for (let blockId of Object.keys(cache).map(Number).sort((a, b) => a - b)) {
      if (blockId === 9999 || is_fixed_terrain(blockId)) continue;
      let cells = cache[blockId]; if (!cells || cells.length === 0) continue;
      let canRise = true;
      for (const [cx, cy] of cells) {
        let ny = cy - 1;
        if (ny < 0 || (state.blockMap[ny][cx] >= 1 && state.blockMap[ny][cx] !== blockId)) { canRise = false; break; }
      }
      if (canRise) {
        cells.slice().sort((a, b) => a[1] - b[1]).forEach(([cx, cy]) => { state.blockMap[cy - 1][cx] = blockId; state.blockMap[cy][cx] = 0; });
        if (player) this.correctPlayerUpwardCollision(player, cells);
      }
    }
  }

  applyBoss60DownwardGravity(state) {
    let cache = state.getBlockCache();
    for (let blockId of Object.keys(cache).map(Number).sort((a, b) => a - b)) {
      if (blockId === 9999 || is_fixed_terrain(blockId)) continue;
      let cells = cache[blockId]; if (!cells || cells.length === 0) continue;
      let canDrop = true;
      for (const [cx, cy] of cells) {
        let ny = cy + 1;
        if (ny >= MAP_HEIGHT || (state.blockMap[ny][cx] >= 1 && state.blockMap[ny][cx] !== blockId)) { canDrop = false; break; }
      }
      if (canDrop) {
        cells.slice().sort((a, b) => b[1] - a[1]).forEach(([cx, cy]) => { state.blockMap[cy + 1][cx] = blockId; state.blockMap[cy][cx] = 0; });
      }
    }
  }

  tryRiseBlocksByOne(state, blockIds, blockCache, extraBlockedCells = null, player = null) {
    let settledIds = new Set();
    for (let blockId of Array.from(blockIds).sort((a, b) => a - b)) {
      if (blockId === 9999 || is_fixed_terrain(blockId)) { settledIds.add(blockId); continue; }
      let cells = blockCache[blockId];
      if (!cells || cells.length === 0) { settledIds.add(blockId); continue; }
      let canRise = true;
      for (const [cx, cy] of cells) {
        let ny = cy - 1;
        if (ny < 0) { canRise = false; break; }
        if (state.blockMap[ny][cx] >= 1 && state.blockMap[ny][cx] !== blockId) { canRise = false; break; }
        if (extraBlockedCells && extraBlockedCells.has(`${cx},${ny}`)) { canRise = false; break; }
      }
      if (canRise) {
        cells.slice().sort((a, b) => a[1] - b[1]).forEach(([cx, cy]) => { state.blockMap[cy - 1][cx] = blockId; state.blockMap[cy][cx] = 0; });
        if (player) this.correctPlayerUpwardCollision(player, cells);
      } else settledIds.add(blockId);
    }
    return settledIds;
  }

  findUnsupportedBlocksBelow(state, cells, excludeId = null) {
    let bottomCells = {};
    for (const [cx, cy] of cells) { if (!(cx in bottomCells) || cy > bottomCells[cx]) bottomCells[cx] = cy; }
    let foundIds = new Set();
    for (const cx in bottomCells) {
      let ay = bottomCells[cx] + 1;
      if (ay >= MAP_HEIGHT) continue;
      let belowId = state.blockMap[ay][cx];
      if (belowId >= 1 && belowId !== excludeId) foundIds.add(belowId);
    }
    return foundIds;
  }

  updateBoss60Gravity(state, fb, baseInterval, isPushOnly, tryDropFn, findAboveFn, player = null) {
    let timerAttr = isPushOnly ? "pushGravityTimer" : "gravityTimer";
    let interval = Math.floor(baseInterval * this.getBoss60FallIntervalMultiplier());
    state[timerAttr] += 1;
    if (state[timerAttr] < interval) return false;
    state[timerAttr] = 0;
    let settledIds = new Set();

    if (isPushOnly) {
      let fbCells = fb ? new Set(fb.getCells().map(([x, y]) => `${x},${y}`)) : new Set();
      let blockCache = state.getBlockCache();
      let existingIds = new Set(); state.pushedBlockIds.forEach(id => { if (blockCache[id]) existingIds.add(id); });
      state.pushedBlockIds = existingIds;
      if (state.pushedBlockIds.size === 0) return false;

      let movedIds;
      if (this.isBoss60Upward()) {
        settledIds = this.tryRiseBlocksByOne(state, state.pushedBlockIds, blockCache, fbCells, player);
        if (player) this.correctPlayerAfterDrop(state, player);
        movedIds = new Set(Array.from(state.pushedBlockIds).filter(id => !settledIds.has(id)));
        let chainIds = new Set();
        movedIds.forEach(id => { let cells = blockCache[id] || []; this.findUnsupportedBlocksBelow(state, cells, id).forEach(x => chainIds.add(x)); });
        chainIds.forEach(id => state.pushedBlockIds.add(id));
      } else {
        settledIds = tryDropFn(state, state.pushedBlockIds, blockCache, fbCells);
        movedIds = new Set(Array.from(state.pushedBlockIds).filter(id => !settledIds.has(id)));
        let chainIds = new Set();
        movedIds.forEach(id => { let cells = blockCache[id] || []; findAboveFn(state, cells, id).forEach(x => chainIds.add(x)); });
        chainIds.forEach(id => state.pushedBlockIds.add(id));
      }
      settledIds.forEach(id => state.pushedBlockIds.delete(id));
      if (movedIds.size > 0 && fb) fb.timer = interval;
    } else {
      if (this.isBoss60Upward()) {
        this.applyBoss60UpwardGravity(state, player);
        if (player) this.correctPlayerAfterDrop(state, player);
        return true;
      } else {
        let blockCache = state.getBlockCache();
        settledIds = tryDropFn(state, Object.keys(blockCache).map(Number), blockCache);
      }
    }
    return settledIds.size > 0;
  }

  correctPlayerUpwardCollision(player, cells) {
    if (!player) return;
    let pHalfH = (player && player.isCrouching) ? CROUCH_P_HALF_H : P_HALF_H;
    let pLeft = player.x - P_HALF_W + 2, pRight = player.x + P_HALF_W - 2;
    let pBottom = player.y + pHalfH, pTop = player.y - pHalfH;
    let maxBBottom = null;
    for (const [cx, cy] of cells) {
      let bLeft = GAME_LEFT + cx * GRID_SIZE, bRight = bLeft + GRID_SIZE;
      let bTopNew = GAME_TOP + (cy - 1) * GRID_SIZE, bBottomNew = bTopNew + GRID_SIZE;
      if (pRight > bLeft && pLeft < bRight && pBottom > bTopNew && pTop < bBottomNew) {
        if (maxBBottom === null || bBottomNew > maxBBottom) maxBBottom = bBottomNew;
      }
    }
    if (maxBBottom !== null) { player.y = maxBBottom + pHalfH; player.vy = Math.max(player.vy, 0.0); }
  }

  correctPlayerAfterDrop(state, player) {
    if (!player) return;
    let pHalfH = (player && player.isCrouching) ? CROUCH_P_HALF_H : P_HALF_H;
    let pLeft = player.x - P_HALF_W + 2, pRight = player.x + P_HALF_W - 2;
    let pTop = player.y - pHalfH, pBottom = player.y + pHalfH;
    let gyTop = Math.floor((pTop - GAME_TOP) / GRID_SIZE), gyBottom = Math.floor((pBottom - GAME_TOP) / GRID_SIZE);
    let gxLeft = Math.floor((pLeft - GAME_LEFT) / GRID_SIZE), gxRight = Math.floor((pRight - GAME_LEFT) / GRID_SIZE);
    let minBTop = null, maxBBottom = null;
    for (let gy = Math.max(0, gyTop); gy <= Math.min(MAP_HEIGHT - 1, gyBottom); gy++) {
      for (let gx = Math.max(0, gxLeft); gx <= Math.min(MAP_WIDTH - 1, gxRight); gx++) {
        let bid = state.blockMap[gy][gx];
        if (bid >= 1 && bid !== 9999 && !is_fixed_terrain(bid)) {
          let bTop = GAME_TOP + gy * GRID_SIZE, bBottom = bTop + GRID_SIZE;
          if (minBTop === null || bTop < minBTop) minBTop = bTop;
          if (maxBBottom === null || bBottom > maxBBottom) maxBBottom = bBottom;
        }
      }
    }
    if (this.isBoss60Upward()) {
      if (maxBBottom !== null) { player.y = maxBBottom + pHalfH; player.vy = Math.max(player.vy || 0, 0.0); }
    } else {
      if (minBTop !== null) { player.y = minBTop - pHalfH; player.vy = Math.min(player.vy || 0, 0.0); player.isGrounded = true; }
    }
  }

  // --------------------------------------------------------
  // 70F: シーソー物理ギミック
  // (Pymunkが無いJS環境のため、剛体シミュレーションはトルク積分による
  //  簡易近似で再現する。設置済みブロックはシーソーのローカル座標に
  //  固定され、シーソーの回転と一緒に剛体的に動く。)
  // --------------------------------------------------------
  pickBoss70BlockData() {
    let pool = BLOCKS.filter(b => b.shape_id <= 11);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  initBoss70Physics() {
    this.boss70.angle = 0;
    this.boss70.angularVelocity = 0;
    this.boss70.heightMap = new Array(SEESAW_COLS).fill(SEESAW_DECK_TOP_LOCAL_Y);
    this.boss70.placedBlocks = [];
    this.boss70.fallingBlocks = [];
    this.boss70.groupVelocities = new Map();
    this.boss70.spawnSide = "left";
    this.boss70.activeBlock = new ActiveBlock70(this.boss70.spawnSide, this.pickBoss70BlockData());
    this.boss70.nextBlockData = this.pickBoss70BlockData();
  }

  resetBoss70Board() {
    this.boss70.placedBlocks = [];
    this.boss70.fallingBlocks = [];
    this.boss70.groupVelocities = new Map();
    this.boss70.heightMap = new Array(SEESAW_COLS).fill(SEESAW_DECK_TOP_LOCAL_Y);
    this.boss70.angle = 0;
    this.boss70.angularVelocity = 0;
    this.boss70.winTimer = BOSS70_WIN_TIMER_MAX;
    this.boss70.spawnDelayTimer = 30;
    this.boss70.spawnSide = "left";
    if (this.boss70.activeBlock) {
      if (!this.boss70.nextBlockData) this.boss70.nextBlockData = this.pickBoss70BlockData();
      this.boss70.activeBlock.spawn(this.boss70.spawnSide, this.boss70.nextBlockData);
      this.boss70.nextBlockData = this.pickBoss70BlockData();
    }
  }

  // 落下中ブロックのセル中心をシーソーローカル座標へ変換し、既存の積み上げ(heightMap)と衝突するか判定
  checkBoss70ActiveBlockCollision(checkX, checkY, checkAngleDeg) {
    const active = this.boss70.activeBlock;
    if (!active) return false;
    const rad = checkAngleDeg * Math.PI / 180.0;
    const cosA = Math.cos(rad), sinA = Math.sin(rad);
    const hw = (GRID_SIZE - 1) / 2.0, hh = (GRID_SIZE - 1) / 2.0;
    const rotatePoint = (x, y, c, s, ox, oy) => [x * c - y * s + ox, x * s + y * c + oy];
    const axes = polygon => polygon.map((p, i) => {
      const q = polygon[(i + 1) % polygon.length], ex = q[0] - p[0], ey = q[1] - p[1];
      const len = Math.hypot(ex, ey) || 1;
      return [-ey / len, ex / len];
    });
    const overlaps = (a, b) => {
      for (const axis of axes(a).concat(axes(b))) {
        let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
        for (const p of a) { const v = p[0] * axis[0] + p[1] * axis[1]; amin = Math.min(amin, v); amax = Math.max(amax, v); }
        for (const p of b) { const v = p[0] * axis[0] + p[1] * axis[1]; bmin = Math.min(bmin, v); bmax = Math.max(bmax, v); }
        if (amax <= bmin + 0.01 || bmax <= amin + 0.01) return false;
      }
      return true;
    };
    const square = (cx, cy, c, s) =>
      [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([x, y]) => rotatePoint(x, y, c, s, cx, cy));
    const placedWorld = b => {
      const [cx, cy] = seesawLocalToWorld(b.localX, b.localY, this.boss70.angle);
      return square(cx, cy, Math.cos(this.boss70.angle), Math.sin(this.boss70.angle));
    };

    for (const [lx, ly] of active.getCellLocalCenters()) {
      const rx = lx * cosA - ly * sinA + checkX, ry = lx * sinA + ly * cosA + checkY;
      const polygon = square(rx, ry, cosA, sinA);
      // 中心点ではなく回転後の全頂点で画面端を止める。
      if (polygon.some(([x, y]) => x < GAME_LEFT || x > GAME_RIGHT || y > GAME_BOTTOM + GRID_SIZE)) return true;
      const localPolygon = polygon.map(([x, y]) => seesawWorldToLocal(x, y, this.boss70.angle));
      if (localPolygon.some(([x, y]) =>
        x >= -SEESAW_HALF_W && x <= SEESAW_HALF_W &&
        y >= SEESAW_DECK_TOP_LOCAL_Y - 1 && y <= SEESAW_DECK_TOP_LOCAL_Y + GRID_SIZE)) return true;
      // heightMapだけでは拾えない、隣接セルの角同士の接触も判定する。
      if (this.boss70.placedBlocks.some(b => overlaps(polygon, placedWorld(b)))) return true;
    }
    return false;
  }

  // 積みブロック群(placedBlocks)から heightMap を毎回組み直す。
  // プッシュでブロックが横に動いた後など、差分更新ではなく全体再計算が必要な場面で使う。
  recomputeBoss70HeightMap() {
    const hm = new Array(SEESAW_COLS).fill(SEESAW_DECK_TOP_LOCAL_Y);
    for (const b of this.boss70.placedBlocks) {
      const col = Math.max(0, Math.min(SEESAW_COLS - 1, Math.floor((b.localX + SEESAW_HALF_W) / GRID_SIZE)));
      const cellTopLocalY = b.localY - GRID_SIZE / 2.0;
      if (cellTopLocalY < hm[col]) hm[col] = cellTopLocalY;
    }
    this.boss70.heightMap = hm;
  }

  updateBoss70ActiveBlock(state, player) {
    if (this.boss70.spawnDelayTimer > 0) {
      this.boss70.spawnDelayTimer -= 1;
      if (this.boss70.spawnDelayTimer === 0) {
        if (this.boss70.angle > 0.02) this.boss70.spawnSide = "right";
        else if (this.boss70.angle < -0.02) this.boss70.spawnSide = "left";
        else this.boss70.spawnSide = Math.random() < 0.5 ? "left" : "right";

        this.boss70.activeBlock.spawn(this.boss70.spawnSide, this.boss70.nextBlockData);
        this.boss70.nextBlockData = this.pickBoss70BlockData();

        if (this.checkBoss70ActiveBlockCollision(this.boss70.activeBlock.x, this.boss70.activeBlock.y, this.boss70.activeBlock.angleDeg)) {
          return "damage";
        }
      }
      return "running";
    }

    const active = this.boss70.activeBlock;
    if (!active) return "running";
    const ks = state.keyStates;
    let moveDx = 0;
    if (ks.left) moveDx -= 6.0;
    if (ks.right) moveDx += 6.0;

    if (moveDx !== 0) {
      let nextX = active.x + moveDx;
      if (!this.checkBoss70ActiveBlockCollision(nextX, active.y, active.angleDeg)) {
        active.x = nextX;
      } else {
        let step = moveDx > 0 ? 1.0 : -1.0;
        for (let i = 0; i < Math.abs(moveDx); i++) {
          if (!this.checkBoss70ActiveBlockCollision(active.x + step, active.y, active.angleDeg)) active.x += step;
          else break;
        }
      }
    }

    const fallSpeed = ks.down ? 3 * 3.5 : 3;
    const nextY = active.y + fallSpeed;

    if (this.checkBoss70ActiveBlockCollision(active.x, nextY, active.angleDeg)) {
      // 【修正】fallSpeed分をまとめて進めた位置で衝突判定していたため、
      // 実際に接地するY座標より最大fallSpeed分だけ手前(浮いた位置)でロックされ、
      // 見た目上ブロックが宙に浮いて見えるバグがあった。
      // 衝突が起きたら、衝突しない最大のYまで1pxずつ詰めてから焼き込むことで隙間ゼロで接地させる。
      let landY = active.y;
      while (landY + 1 <= nextY && !this.checkBoss70ActiveBlockCollision(active.x, landY + 1, active.angleDeg)) {
        landY += 1;
      }
      active.y = landY;

      // 頭上押しつぶし: ロック位置とプレイヤーの重なりを簡易チェック
      const rad = active.angleDeg * Math.PI / 180.0, cosA = Math.cos(rad), sinA = Math.sin(rad);
      const hw = GRID_SIZE / 2.0, hh = GRID_SIZE / 2.0;
      let crushed = false;
      if (player && player.invincible === 0) {
        const pHalfH = player.isCrouching ? CROUCH_P_HALF_H : P_HALF_H;
        for (const [lx, ly] of active.getCellLocalCenters()) {
          const rx = lx * cosA - ly * sinA + active.x, ry = lx * sinA + ly * cosA + active.y;
          if (Math.abs(rx - player.x) < (hw + P_HALF_W - 2) && Math.abs(ry - player.y) < (hh + pHalfH - 2)) { crushed = true; break; }
        }
      }
      // ロック：セルをheightMapとplacedBlocksへ焼き込む（以後シーソーと一体回転）
      // 同じピース由来のセルには共通の groupId を振り、後でまとめて押せるようにする
      this.boss70._groupSeq = (this.boss70._groupSeq || 0) + 1;
      const groupId = this.boss70._groupSeq;
      for (const [lx, ly] of active.getCellLocalCenters()) {
        const rx = lx * cosA - ly * sinA + active.x, ry = lx * sinA + ly * cosA + active.y;
        const [localX, localY] = seesawWorldToLocal(rx, ry, this.boss70.angle);
        const col = Math.max(0, Math.min(SEESAW_COLS - 1, Math.floor((localX + SEESAW_HALF_W) / GRID_SIZE)));
        const cellTopLocalY = localY - GRID_SIZE / 2.0;
        if (cellTopLocalY < this.boss70.heightMap[col]) this.boss70.heightMap[col] = cellTopLocalY;
        this.boss70.placedBlocks.push({ localX, localY, color: active.color, outline: active.outline, groupId });
      }
      this.boss70.spawnDelayTimer = 90;
      if (crushed) return "damage";
    } else {
      active.y = nextY;
      if (active.y > GAME_BOTTOM + 100) this.boss70.spawnDelayTimer = 90;
    }
    return "running";
  }

  handleBoss70Input(sym) {
    const active = this.boss70.activeBlock;
    if (!active || this.boss70.spawnDelayTimer > 0) return;
    if (sym === "q") { if (!this.checkBoss70ActiveBlockCollision(active.x, active.y, (active.angleDeg - 90 + 360) % 360)) active.rotate(-90); }
    else if (sym === "e") { if (!this.checkBoss70ActiveBlockCollision(active.x, active.y, (active.angleDeg + 90) % 360)) active.rotate(90); }
  }

  // プレイヤーの左右移動をシーソー面・積みブロックと衝突解決する（簡易近似）
  resolveBoss70Horizontal(currX, nextX, currY, pHalfW, pHalfH) {
    if (nextX === currX) return currX;
    const [curLocalX, curLocalY] = seesawWorldToLocal(currX, currY, this.boss70.angle);
    if (curLocalX < -SEESAW_HALF_W || curLocalX > SEESAW_HALF_W) return nextX; // シーソー圏外は自由移動
    const dir = nextX > currX ? 1 : -1;
    const [nextLocalX] = seesawWorldToLocal(nextX, currY, this.boss70.angle);

    // 【修正】プレイヤーの「中心点」だけで壁/ガード/積みブロックの当たり判定をしていたため、
    // 中心が壁の手前にあっても体の半分(pHalfW分)が先にブロックへめり込んでから止まっていた。
    // 進行方向側の先端(中心からpHalfW分先)を使って判定する。
    const leadLocalX = nextLocalX + dir * pHalfW;

    const guardMargin = SEESAW_GUARD_W;
    const clampedLeadLocalX = Math.max(-SEESAW_HALF_W + guardMargin, Math.min(SEESAW_HALF_W - guardMargin, leadLocalX));
    if (Math.abs(clampedLeadLocalX - leadLocalX) > 0.01) {
      // ガードレールに阻まれる：先端がレールぎりぎりで止まるよう中心のローカルXを逆算する
      const clampedCenterLocalX = clampedLeadLocalX - dir * pHalfW;
      const [wx] = seesawLocalToWorld(clampedCenterLocalX, curLocalY, this.boss70.angle);
      return wx;
    }

    // 段差チェック：足元(プレイヤーの接地想定Y)より移動先の積み上げ面が高い場合のみ壁として扱う。
    // 逆にプレイヤーが既にその高さ以上にいる（ブロックの上に乗っている・ジャンプで越えている）場合は
    // 自由に移動できる（以前は列の高さ差だけで判定しており、ブロックの真上を歩いているだけでも
    // 「壁に当たった」扱いになってしまっていた）。
    const nextSurf = this.getBoss70SurfaceLocalY(leadLocalX);
    const footLocalY = curLocalY + pHalfH;
    if (footLocalY <= nextSurf + 2) return nextX;

    // 壁扱い：積みブロックであれば押せるか試す。押せたらブロックだけ動かし、プレイヤーはその場に留まる。
    this.tryPushBoss70Block(leadLocalX, dir, footLocalY);
    return currX;
  }

  // localX の位置にある積みブロックをプレイヤーが押す。押せた場合 true を返す。
  tryPushBoss70Block(localX, dir, footLocalY) {
    const candidates = this.boss70.placedBlocks.filter(b => {
      if (b.groupId === undefined) return false;
      // プレイヤーの足元より上に突き出しているセルだけを押す対象にする
      return Math.abs(b.localX - localX) <= GRID_SIZE / 2 + 0.01 &&
        (b.localY + GRID_SIZE / 2) > footLocalY - GRID_SIZE;
    });
    if (!candidates.length) return false;

    const groupId = candidates[0].groupId;
    const groupCells = this.boss70.placedBlocks.filter(b => b.groupId === groupId);
    const otherCells = this.boss70.placedBlocks.filter(b => b.groupId !== groupId);
    const shift = dir * PLAYER_PUSH_SPEED;

    for (const c of groupCells) {
      const newLocalX = c.localX + shift;
      const minX = -SEESAW_HALF_W + SEESAW_GUARD_W + GRID_SIZE / 2;
      const maxX = SEESAW_HALF_W - SEESAW_GUARD_W - GRID_SIZE / 2;
      if (newLocalX < minX || newLocalX > maxX) return false; // ガードレールに阻まれて押せない
      for (const o of otherCells) {
        if (Math.abs(o.localX - newLocalX) < GRID_SIZE &&
            Math.abs(o.localY - c.localY) < GRID_SIZE * 0.8) return false; // 別のブロック群に阻まれて押せない
      }
    }
    for (const c of groupCells) c.localX += shift;
    this.recomputeBoss70HeightMap();
    // 【修正】押した拍子に、押された塊の上に乗っていた別の塊(グループ)が支えを失って
    // 宙に浮いたままになることがあった。シーソーが傾くと、浮いたグループだけ
    // 位置ズレが目立ち「ブロックがそれぞれ個別に傾いている」ように見えてしまうバグの原因だったため、
    // 押した後は全グループを対象に一体のまま落下させて隙間なく詰め直す。
    this.settleAllBoss70Groups();
    return true;
  }

  // 指定グループが下の面(他グループ or デッキ)から浮いている場合、一体のまま接触するまで落とす。
  // 落とした場合は true を返す。
  settleBoss70Group(groupId) {
    const groupCells = this.boss70.placedBlocks.filter(b => b.groupId === groupId);
    if (!groupCells.length) return false;
    const otherCells = this.boss70.placedBlocks.filter(b => b.groupId !== groupId);

    // 他グループ／デッキから見た、各列の「支える面」のローカルY(＝その列の一番上のセルの上面)
    const otherHeightMap = new Array(SEESAW_COLS).fill(SEESAW_DECK_TOP_LOCAL_Y);
    for (const o of otherCells) {
      const oCol = Math.max(0, Math.min(SEESAW_COLS - 1, Math.floor((o.localX + SEESAW_HALF_W) / GRID_SIZE)));
      const topLocalY = o.localY - GRID_SIZE / 2;
      if (topLocalY < otherHeightMap[oCol]) otherHeightMap[oCol] = topLocalY;
    }

    // 自グループが占める各列で、最も下(localYが最大)にあるセルの底面Yを求める
    const colBottom = new Map(); // col -> bottomLocalY
    for (const c of groupCells) {
      const col = Math.max(0, Math.min(SEESAW_COLS - 1, Math.floor((c.localX + SEESAW_HALF_W) / GRID_SIZE)));
      const bottomLocalY = c.localY + GRID_SIZE / 2;
      if (!colBottom.has(col) || bottomLocalY > colBottom.get(col)) colBottom.set(col, bottomLocalY);
    }

    // 各列であと何ピクセル落とせるかを求め、最小値(＝最初にどこかへ接触する量)まで一体で落とす
    let dropAmount = Infinity;
    for (const [col, bottomLocalY] of colBottom.entries()) {
      const gap = otherHeightMap[col] - bottomLocalY;
      if (gap < dropAmount) dropAmount = gap;
    }
    if (!isFinite(dropAmount) || dropAmount <= 0.5) return false; // 浮いていない、または既に接触

    for (const c of groupCells) c.localY += dropAmount;
    return true;
  }

  // すべての設置済みグループを対象に settleBoss70Group を適用する。
  // あるグループが落下したことで別のグループの支えが変わる連鎖にも対応するため、複数回パスする。
  settleAllBoss70Groups() {
    const groupIds = [...new Set(this.boss70.placedBlocks.map(b => b.groupId))];
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      // 上にある(localYが小さい)グループから順に詰めると連鎖崩れが少ないパスで安定する
      const order = groupIds.slice().sort((a, b) => {
        const avg = gid => {
          const cells = this.boss70.placedBlocks.filter(bl => bl.groupId === gid);
          return cells.reduce((s, c) => s + c.localY, 0) / (cells.length || 1);
        };
        return avg(a) - avg(b);
      });
      for (const gid of order) {
        if (this.settleBoss70Group(gid)) moved = true;
      }
      if (!moved) break;
    }
    this.recomputeBoss70HeightMap();
  }

  // シーソーが大きく傾いたときは、設置済みブロックをシーソーへ
  // 永久固定しない。低い側へ滑らせ、端を越えたセルはワールド空間の
  // 落下ブロックへ変換する（Python版のPymunk剛体に相当）。
  updateBoss70SlidingBlocks() {
    const placed = this.boss70.placedBlocks;
    if (!placed.length) {
      this.updateBoss70FallingBlocks();
      return;
    }

    const dt = 1 / 60;
    const angle = this.boss70.angle;
    const slideSign = Math.sign(Math.sin(angle));
    const groups = new Map();
    for (const b of placed) {
      if (!groups.has(b.groupId)) groups.set(b.groupId, []);
      groups.get(b.groupId).push(b);
    }

    const removeGroups = new Set();
    for (const [groupId, cells] of groups) {
      if (!this.boss70.groupVelocities.has(groupId)) this.boss70.groupVelocities.set(groupId, 0);
      let velocity = this.boss70.groupVelocities.get(groupId);
      // 小さな揺れでは積み上げを崩さず、強い傾きでだけ滑り始める。
      if (Math.abs(angle) > BOSS70_SLIDE_START_ANGLE) {
        velocity += slideSign * SEESAW_GRAVITY_CONST * Math.abs(Math.sin(angle)) * dt * 0.35;
        velocity *= BOSS70_SLIDE_FRICTION;
        const delta = velocity * dt;
        const otherCells = placed.filter(b => b.groupId !== groupId);
        const blocked = cells.some(c => otherCells.some(o =>
          Math.abs((c.localX + delta) - o.localX) < GRID_SIZE &&
          Math.abs(c.localY - o.localY) < GRID_SIZE
        ));
        if (!blocked) {
          for (const b of cells) b.localX += delta;
        } else {
          // ほかの塊に当たったら速度を止める。塊を壊したり、
          // セル単位で別方向へ散らしたりはしない。
          velocity = 0;
        }
      } else {
        velocity *= 0.90;
      }
      this.boss70.groupVelocities.set(groupId, velocity);

      const lowEdge = slideSign >= 0
        ? Math.max(...cells.map(b => b.localX + GRID_SIZE / 2))
        : Math.min(...cells.map(b => b.localX - GRID_SIZE / 2));
      if (slideSign !== 0 && ((slideSign > 0 && lowEdge > SEESAW_HALF_W) ||
                              (slideSign < 0 && lowEdge < -SEESAW_HALF_W))) {
        removeGroups.add(groupId);
      }
    }

    if (removeGroups.size) {
      for (const b of placed) {
        if (!removeGroups.has(b.groupId)) continue;
        const [x, y] = seesawLocalToWorld(b.localX, b.localY, angle);
        const groupVelocity = this.boss70.groupVelocities.get(b.groupId) || 0;
        const tangentX = Math.cos(angle) * groupVelocity;
        const tangentY = Math.sin(angle) * groupVelocity;
        this.boss70.fallingBlocks.push({
          x, y, vx: tangentX, vy: tangentY, angle, angularVelocity: groupVelocity * 0.01,
          color: b.color, outline: b.outline
        });
      }
      this.boss70.placedBlocks = placed.filter(b => !removeGroups.has(b.groupId));
      for (const id of removeGroups) this.boss70.groupVelocities.delete(id);
      this.recomputeBoss70HeightMap();
    }
    this.updateBoss70FallingBlocks();
  }

  updateBoss70FallingBlocks() {
    const dt = 1 / 60;
    const remaining = [];
    for (const b of this.boss70.fallingBlocks) {
      b.vy += SEESAW_GRAVITY_CONST * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle += b.angularVelocity * dt;
      // 落下したブロックは画面下へ抜けて消える。横方向の画面端で
      // 止めないことが、強い傾きで画面外へ落ちる挙動の要件。
      if (b.y <= GAME_BOTTOM + BOSS70_FALL_MARGIN) remaining.push(b);
    }
    this.boss70.fallingBlocks = remaining;
  }

  // プレイヤーの上下移動をシーソー面・積みブロックと衝突解決する（簡易近似）
  getBoss70SurfaceLocalY(localX) {
    let surface = SEESAW_DECK_TOP_LOCAL_Y;
    // 列の高さではなく、実際にそのX範囲を占有しているセルだけを見る。
    // これで隣の高いブロックを、空中のプレイヤーへ誤って当てなくなる。
    for (const b of this.boss70.placedBlocks) {
      if (Math.abs(localX - b.localX) <= GRID_SIZE / 2 + 0.01) {
        surface = Math.min(surface, b.localY - GRID_SIZE / 2);
      }
    }
    return surface;
  }

  resolveBoss70Vertical(currX, currY, nextY, vy, pHalfW, pHalfH) {
    const [localX] = seesawWorldToLocal(currX, currY, this.boss70.angle);
    if (localX < -SEESAW_HALF_W || localX > SEESAW_HALF_W) return [nextY, false];
    const sampleXs = [localX - pHalfW, localX, localX + pHalfW]
      .filter(x => x >= -SEESAW_HALF_W && x <= SEESAW_HALF_W);
    const surfaceLocalY = Math.min(...sampleXs.map(x => this.getBoss70SurfaceLocalY(x)));
    const [, surfaceWorldY] = seesawLocalToWorld(localX, surfaceLocalY, this.boss70.angle);
    const surfaceTopY = surfaceWorldY; // 面の上端(ワールドY)
    if (vy >= 0) {
      if (currY + pHalfH <= surfaceTopY && nextY + pHalfH >= surfaceTopY) {
        return [surfaceTopY - pHalfH, true];
      }
      if (currY + pHalfH > surfaceTopY) {
        // 既に面より下にいる異常値は面上へ補正
        return [surfaceTopY - pHalfH, true];
      }
      return [nextY, false];
    } else {
      return [nextY, false];
    }
  }

  updateBoss70Logic(state, player) {
    if (this.boss70.cleared) return "victory";

    // --- シーソー角度の物理積分（トルク = スプリング復元 + プレイヤー荷重 + 設置ブロック荷重） ---
    let torque = -this.boss70.angle * SEESAW_SPRING_K;

    const pHalfH = player.isCrouching ? CROUCH_P_HALF_H : P_HALF_H;
    const [pLocalX] = seesawWorldToLocal(player.x, player.y, this.boss70.angle);
    const onSeesawX = (pLocalX >= -SEESAW_HALF_W && pLocalX <= SEESAW_HALF_W);
    const pCol = Math.max(0, Math.min(SEESAW_COLS - 1, Math.floor((pLocalX + SEESAW_HALF_W) / GRID_SIZE)));
    const pSurfaceLocalY = this.boss70.heightMap[pCol];
    const [, pSurfaceWorldY] = seesawLocalToWorld(pLocalX, pSurfaceLocalY, this.boss70.angle);
    const isOnSeesaw = onSeesawX && player.isGrounded && Math.abs((player.y + pHalfH) - pSurfaceWorldY) < 6;

    if (isOnSeesaw) {
      torque += (player.x - SEESAW_PIVOT_X) * PLAYER_WEIGHT_FORCE;
      // ジャンプ入力自体のトルクはプレイヤー荷重(上の式)に内包されるため、角速度への直接付与は着地時のみ行う
    }
    if (isOnSeesaw && !this.boss70.wasGroundedOnSeesaw) {
      this.boss70.angularVelocity += (player.x - SEESAW_PIVOT_X) * (LANDING_PRESS_IMPULSE / SEESAW_MOMENT) * 0.0005;
    }
    this.boss70.wasGroundedOnSeesaw = isOnSeesaw;

    for (const b of this.boss70.placedBlocks) {
      const [wx] = seesawLocalToWorld(b.localX, b.localY, this.boss70.angle);
      torque += (wx - SEESAW_PIVOT_X) * BLOCK_CELL_WEIGHT;
    }

    const dt = 1 / 60.0;
    const angularAcc = torque / SEESAW_MOMENT;
    this.boss70.angularVelocity += angularAcc * dt;
    // Pymunk の space.damping は「1秒あたりの減衰率」を damping^dt として毎ステップ掛ける仕様。
    // ここを damping をそのまま1フレーム毎に掛けてしまうと過減衰になり、
    // ほとんど角速度が育たず「シーソーがまったく傾かない」状態になってしまう。
    this.boss70.angularVelocity *= Math.pow(SEESAW_SPACE_DAMPING, dt);
    this.boss70.angle += this.boss70.angularVelocity * dt;
    if (this.boss70.angle > MAX_TILT_RADIAN) { this.boss70.angle = MAX_TILT_RADIAN; this.boss70.angularVelocity = 0; }
    if (this.boss70.angle < -MAX_TILT_RADIAN) { this.boss70.angle = -MAX_TILT_RADIAN; this.boss70.angularVelocity = 0; }

    // 強く傾いたシーソー上のブロックを低い側へ滑らせ、端から落とす。
    this.updateBoss70SlidingBlocks();

    // ダメージ判定は updateBoss70ActiveBlock 側（着地ブロックとプレイヤーの重なり）でのみ行う。
    // 傾き自体は上のクランプで35度に制限されるのみで、それ自体はダメージ要因ではない。

    const actRes = this.updateBoss70ActiveBlock(state, player);
    if (actRes === "damage") return "damage";

    const targetY = (this.boss70.phase === 1) ? GAME_TOP + 7 * GRID_SIZE : GAME_TOP + 5 * GRID_SIZE;
    const playerTop = player.y - pHalfH;

    if (playerTop <= targetY) {
      this.boss70.winTimer -= 1;
      if (this.boss70.winTimer <= 0) {
        if (this.boss70.phase === 1) {
          this.boss70.phase = 2;
          this.boss70.winTimer = BOSS70_WIN_TIMER_MAX;
          this.resetBoss70Board();
          return "phase_advance";
        } else {
          return "victory";
        }
      }
    } else {
      this.boss70.winTimer = Math.min(BOSS70_WIN_TIMER_MAX, this.boss70.winTimer + BOSS70_WIN_RECOVER_RATE);
    }
    return "running";
  }

  generate_puzzle_pattern() {
    let grid = BOSS_30F_PHASES[this.boss30PhaseIndex % BOSS_30F_PHASES.length];
    this.puzzleMap = Array.from({length: MAP_HEIGHT}, () => new Array(MAP_WIDTH).fill(0));
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (grid[y][x] === 1) this.puzzleMap[y][x] = PUZZLE_BLUE_ID;
        else if (grid[y][x] === 2) this.puzzleMap[y][x] = PUZZLE_RED_ID;
      }
    }
  }

  check_blue_complete(state) {
    if (!this.puzzleMap) return false;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (this.puzzleMap[y][x] === PUZZLE_BLUE_ID && state.blockMap[y][x] < 1) return false;
      }
    }
    return true;
  }

  check_red_filled(state) {
    if (!this.puzzleMap) return false;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (this.puzzleMap[y][x] === PUZZLE_RED_ID && state.blockMap[y][x] >= 1) return true;
      }
    }
    return false;
  }

  reset_30f_round(state) {
    state.blockMap = Array.from({length: MAP_HEIGHT}, () => new Array(MAP_WIDTH).fill(0));
    this.generate_puzzle_pattern();
    this.boss30Timer = 3600;
    this.trapActive = false;
    this.trapTimer = 0;
  }

  advance_30f_phase(state) {
    this.boss30PhaseIndex += 1;
    this.reset_30f_round(state);
  }

  trigger_big_beam() {
    if (this.bigBeamPhase === "none") { this.bigBeamPhase = "warning"; this.bigBeamTimer = BIG_BEAM_WARN_FRAMES; }
  }

  update_boss30_logic(state, playerGx, playerInvincible) {
    if (this.bigBeamPhase !== "none") {
      this.bigBeamTimer -= 1;
      if (this.bigBeamPhase === "warning" && this.bigBeamTimer <= 0) {
        this.bigBeamPhase = "firing"; this.bigBeamTimer = BIG_BEAM_FIRE_FRAMES;
        this.reset_30f_round(state); // ビームは盤面のブロックを常に削除する（ギミック本体・無敵中でも発動）
        if (playerGx !== 0 && playerGx !== MAP_WIDTH - 1 && playerInvincible === 0) return "damage";
        return "beam_clear";
      } else if (this.bigBeamPhase === "firing" && this.bigBeamTimer <= 0) {
        this.bigBeamPhase = "none";
      }
      return "running";
    }
    this.boss30Timer -= 1;
    if (this.boss30Timer <= 0) { this.trigger_big_beam(); return "running"; }
    if (this.check_red_filled(state)) {
      if (!this.trapActive) { this.trapActive = true; this.trapTimer = TRAP_GRACE_FRAMES; }
      else { this.trapTimer -= 1; if (this.trapTimer <= 0) { this.trigger_big_beam(); return "running"; } }
    } else { this.trapActive = false; this.trapTimer = 0; }
    
    if (this.check_blue_complete(state)) {
      this.boss30Hp -= 1;
      if (this.boss30Hp <= 0) return "victory";
      else { this.advance_30f_phase(state); return "advance"; }
    }
    return "running";
  }

  init_boss40_state() {
    this.boss40Step = 0; this.boss40Timer = 180; this.boss40SearchCount = 0;
    this.boss40LaserPhase = "none"; this.boss40ActiveCols = []; this.boss40ActiveRows = [];
  }

  update_boss40_logic(player) {
    this.bossTimer -= 1;
    if (this.bossTimer <= 0) return "clear";
    this.boss40Timer -= 1;
    
    const WARN_F = 90, FIRE_F = 60, CYCLE_F = WARN_F + FIRE_F;
    if (this.boss40Step === 0) {
      if (this.boss40Timer > 0) {
        this.boss40LaserPhase = "none"; this.boss40ActiveCols = []; this.boss40ActiveRows = [];
        return "running";
      } else { this.boss40Step = 1; this.boss40Timer = CYCLE_F; this.boss40SearchCount = 0; }
    }
    if (this.boss40Timer <= 0) {
      if (this.boss40Step === 7) {
        this.boss40SearchCount += 1;
        if (this.boss40SearchCount < 3) this.boss40Timer = CYCLE_F;
        else { this.boss40SearchCount = 0; this.boss40Step += 1; this.boss40Timer = CYCLE_F; }
      } else { this.boss40Step += 1; this.boss40Timer = CYCLE_F; }
      if (this.boss40Step > 12) { this.boss40Step = 1; this.boss40SearchCount = 0; }
    }
    
    this.boss40LaserPhase = (this.boss40Timer > FIRE_F) ? "warning" : "firing";
    
    if (this.boss40Step === 1) { this.boss40ActiveCols = []; this.boss40ActiveRows = [18, 19, 23, 24]; }
    else if (this.boss40Step === 2) { this.boss40ActiveCols = [3,4,5,6,7,8,9,10,11,12]; this.boss40ActiveRows = []; }
    else if (this.boss40Step === 3) { this.boss40ActiveCols = [12,13,14,15]; this.boss40ActiveRows = []; }
    else if (this.boss40Step === 4) { this.boss40ActiveCols = [8,9,10,11]; this.boss40ActiveRows = []; }
    else if (this.boss40Step === 5) { this.boss40ActiveCols = [4,5,6,7]; this.boss40ActiveRows = []; }
    else if (this.boss40Step === 6) { this.boss40ActiveCols = [0,1,2,3]; this.boss40ActiveRows = []; }
    else if (this.boss40Step === 7) {
      if (this.boss40Timer === CYCLE_F) {
        let pGx = Math.floor((player.x - GAME_LEFT) / GRID_SIZE);
        let pGy = Math.floor((player.y - GAME_TOP) / GRID_SIZE);
        this.boss40ActiveCols = [-1,0,1].map(i => Math.max(0, Math.min(15, pGx + i)));
        this.boss40ActiveRows = [-1,0,1].map(i => Math.max(0, Math.min(24, pGy + i)));
      }
    }
    else if (this.boss40Step === 8) { this.boss40ActiveCols = []; this.boss40ActiveRows = [16,17,18,19,20,21,22,23,24]; }
    else if (this.boss40Step === 9) { this.boss40ActiveCols = [2,5,8,11,14]; this.boss40ActiveRows = [4,9,14,19,24]; }
    else if (this.boss40Step === 10) { this.boss40ActiveCols = [8,9,10,11,12,13,14,15]; this.boss40ActiveRows = []; }
    else if (this.boss40Step === 12) {
      this.boss40ActiveCols = [4,5,6,7,8,9,10,11];
      this.boss40ActiveRows = [6,7,8,9,10,11,12,13,14,15,16,17];
    }
    return "running";
  }

  // 【50Fボス専用追加分】毎フレームのフェーズ進行・ターゲット破砕走査ロジック
  update_boss50_logic(state) {
    if (this.boss50Phase < 1 || this.boss50Phase > 3) return "running";
    let targetShapeId = 19 + (this.boss50Phase - 1);
    let count = 0;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        let val = state.blockMap[y][x];
        if (val >= 1 && Math.floor(val / 1000) === targetShapeId) count++;
      }
    }
    this.boss50TargetRemaining = count;

    if (!this.boss50PhaseBlockLocked) {
      if (count > 0) this.boss50PhaseBlockLocked = true;
      return "running";
    }

    if (count === 0) {
      if (this.boss50Phase === 3) {
        this.boss50Phase = 0;
        return "victory";
      } else {
        this.boss50Phase += 1;
        this.boss50PhaseBlockLocked = false;
        this.boss50SpawnRequested = true; // 次のフェーズの強制ロード
        state.blockMap = Array.from({length: MAP_HEIGHT}, () => new Array(MAP_WIDTH).fill(0)); // 盤面全消去
        return "phase_advance";
      }
    }
    return "running";
  }

  // 【50Fボス専用追加分】強制割り込みスポーン判定
  getForcedSpawnShapeId() {
    if (this.boss50SpawnRequested && this.boss50Phase >= 1 && this.boss50Phase <= 3) {
      this.boss50SpawnRequested = false;
      return 19 + (this.boss50Phase - 1);
    }
    return null;
  }

  // 【50Fボス専用追加分】盤面を走査した操作反転デバフ状態の取得
  getPlayerStatusEffects(state) {
    let blockRev = false;
    let playerRev = false;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        let val = state.blockMap[y][x];
        if (val >= 1) {
          let sid = Math.floor(val / 1000);
          if (sid === 19) blockRev = true;
          if (sid === 20) playerRev = true;
          if (sid === 21) { blockRev = true; playerRev = true; }
        }
      }
    }
    return { blockReversed: blockRev, playerReversed: playerRev };
  }
}
const bossSys = new BossManager();
