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

    // 70F: シーソー物理ギミック(Chipmunk-js。実装は js/boss70.js)
    // 70F関連のプロパティは1つのオブジェクトにまとめて管理する。
    this.boss70 = {
      space: null,            // Chipmunk-js の物理世界(70F突入時に initBoss70Physics で作る)
      seesaw: null,           // 板の剛体
      angle: 0,               // 板の角度(rad)。描画・UI用に毎フレーム seesaw.a を写す
      placedBlocks: [],       // 置いたブロック。{body, shapes}(テトリミノ1個 = 1剛体)
      activeBlock: null,
      nextBlockData: null,
      phase: 1,
      winTimer: BOSS70_WIN_TIMER_MAX,
      spawnSide: "left",
      spawnDelayTimer: 0,
      cleared: false,
      wasGroundedOnSeesaw: false,
    };

    // 80F: トゲ迷路。接触した場所に足場が生成される
    this.boss80 = { cleared: false, platforms: [], startPlatform: null };
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
    } else if (floor === 80) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          const val = BOSS_80F_MAP[y][x];
          if (val === 9999) state.blockMap[y][x] = 9999;
          else if (val === 1) state.blockMap[y][x] = encode_fixed_terrain(state.nextSerial);
          else if (val === 2) state.blockMap[y][x] = SPIKE_ID;
        }
      }
      state.nextSerial += 1;
      this.boss80.platforms = [];
      // 最下段はトゲだらけなので、左下の初期位置から始められる安全な足場だけ別管理する
      this.boss80.startPlatform = [GAME_LEFT, GAME_BOTTOM - GRID_SIZE * 2, GAME_LEFT + GRID_SIZE * 2, GAME_BOTTOM - GRID_SIZE * 2 + GRID_SIZE * 0.5];
      this.boss80.cleared = false;
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
  // 80F: トゲ迷路(本家 boss_data.py の *boss80* 群と同じ)
  // --------------------------------------------------------
  getBoss80SpawnPosition() { return [GAME_LEFT + GRID_SIZE, GAME_BOTTOM - 2 * GRID_SIZE - P_HALF_H]; }
  getBoss80Platforms() {
    const list = [...this.boss80.platforms];
    if (this.boss80.startPlatform) list.unshift(this.boss80.startPlatform);
    return list;
  }
  getBoss80CreatedPlatformCount() { return this.boss80.platforms.length; }
  hasBoss80StartPlatform() { return !!this.boss80.startPlatform; }

  _addBoss80Platform(p) {
    if (!this.boss80.platforms.some(q => q[0] === p[0] && q[1] === p[1] && q[2] === p[2] && q[3] === p[3])) this.boss80.platforms.push(p);
  }
  _addBoss80PlatformAboveSpike(gx, gy) {
    let x0 = GAME_LEFT + gx * GRID_SIZE;
    x0 = Math.max(GAME_LEFT, Math.min(GAME_RIGHT - GRID_SIZE * 2, x0));
    const y1 = GAME_TOP + gy * GRID_SIZE;
    this._addBoss80Platform([x0, y1 - GRID_SIZE * 0.3, x0 + GRID_SIZE * 2, y1]);
  }
  _addBoss80PlatformBesideSpike(gx, gy, side) {
    const cellLeft = GAME_LEFT + gx * GRID_SIZE, cellRight = cellLeft + GRID_SIZE;
    const y0 = GAME_TOP + gy * GRID_SIZE, y1 = y0 + GRID_SIZE;
    let x0, x1;
    if (side === "left") { x1 = cellLeft; x0 = x1 - GRID_SIZE * 0.3; }
    else { x0 = cellRight; x1 = x0 + GRID_SIZE * 0.3; }
    x0 = Math.max(GAME_LEFT, x0); x1 = Math.min(GAME_RIGHT, x1);
    this._addBoss80Platform([x0, y0, x1, y1]);
  }

  // ゴール判定とトゲ接触時の足場生成。戻り値: "victory" / "damage" / "running"
  updateBoss80Logic(state, player) {
    if (this.boss80.cleared) return "victory";
    const pHalfH = player.isCrouching ? CROUCH_P_HALF_H : P_HALF_H;
    const pl = player.x - P_HALF_W + 2, pr = player.x + P_HALF_W - 2;
    const pt = player.y - pHalfH, pb = player.y + pHalfH;
    let goalHit = false; const spikes = [];
    for (let gy = 0; gy < MAP_HEIGHT; gy++) {
      for (let gx = 0; gx < MAP_WIDTH; gx++) {
        const id = state.blockMap[gy][gx];
        if (id !== 9999 && id !== SPIKE_ID) continue;
        const cl = GAME_LEFT + gx * GRID_SIZE, ct = GAME_TOP + gy * GRID_SIZE, cr = cl + GRID_SIZE, cb = ct + GRID_SIZE;
        if (!(pr > cl && pl < cr && pb > ct && pt < cb)) continue;
        if (id === 9999) goalHit = true; else spikes.push([gx, gy, cl, ct, cr, cb]);
      }
    }
    if (goalHit) { this.boss80.cleared = true; return "victory"; }
    if (spikes.length && player.invincible === 0) {
      for (const [gx, gy, cl, ct, cr, cb] of spikes) {
        const ox = Math.min(pr, cr) - Math.max(pl, cl);
        const oy = Math.min(pb, cb) - Math.max(pt, ct);
        if (ox < oy) this._addBoss80PlatformBesideSpike(gx, gy, player.x < (cl + cr) / 2 ? "left" : "right");
        else this._addBoss80PlatformAboveSpike(gx, gy);
      }
      return "damage";
    }
    return "running";
  }

  // 70F: シーソー物理ギミックは js/boss70.js に分離(BossManager.prototype へ追加される)

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
