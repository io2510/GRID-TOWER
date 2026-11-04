// 100F CPU対戦エンジン (boss100f_test_play.py の移植)
// Avatar / TetrisBoard / SharedPieceQueue。描画は持たない(draw100f.js 側)。
// グローバル名の衝突を避けるため、すべて B100 名前空間に入れる。
(function (root) {
"use strict";

const AI = root.B100AI;

// ---------------- 定数 ----------------
const MAP_WIDTH = 16, MAP_HEIGHT = 25;
const P_HALF_W = 15, P_HALF_H = 30, CROUCH_P_HALF_H = 16;
const MAX_GARBAGE_LANDING_PER_LOCK = 6;
const AVATAR_GRAVITY = 0.8, AVATAR_JUMP_SPEED = -14.0, AVATAR_MOVE_SPEED = 4;
const AVATAR_MAX_JUMP_CELLS = Math.floor((AVATAR_JUMP_SPEED ** 2) / (2 * AVATAR_GRAVITY * 40));
const CROUCH_SPEED_RATIO = 0.5;
const AVATAR_MAX_HP = 5, AVATAR_INVINCIBLE_FRAMES = 180, TELEPORT_TOP_OFFSET = 100;
const EPS = 1e-6;
const BOSS_PHASE_2_HP_THRESHOLD = 3, BOSS_PHASE_3_HP_THRESHOLD = 1;
const BOSS_PHASE_2_WIDTH = 14, BOSS_PHASE_3_WIDTH = 10;
const BOSS_PHASE_2_SPEED_MULT = 1.45, BOSS_PHASE_3_SPEED_MULT = 1.90;
const NORMAL_BLOCK_NO_REPEAT_WINDOW = 3;
const RARE_BLOCK_COUNTDOWN_RANGE = [28, 32];
const LINE_SCORE = [0, 100, 300, 500, 800];
const COMBO_BUFFER_FRAMES = 180;
const GARBAGE_CELL_STYLE = { color: "#666666", outline: "#999999", is_garbage: true };
const WALL_CELL_STYLE = { color: "#3a0000", outline: "#ff3333", is_garbage: true, is_wall: true };
const TETRIS_BONUS_GARBAGE_LINES = 1;
const BACK_TO_BACK_BONUS_GARBAGE_LINES = 2;
const SZ_SPIN_BEAM_COUNT = 3;
const BEAM_WIDTH = 3, BEAM_WARNING_FRAMES = 90, BEAM_FIRE_FRAMES = 90, BEAM_STRIKE_INTERVAL = 200;
const RARE_LINE_BEAM_COUNT = 3, RARE_LINE_BEAM_FIRE_FRAMES = 24;
const PIECE_AI_LOOKAHEAD_EXTRA = 0;
const MOVE_INITIAL_DELAY = 12, MOVE_REPEAT_DELAY = 4, FALL_INTERVAL_FAST = 2, FALL_INTERVAL_NORMAL_DEFAULT = 24;
const PUSH_DELAY_FRAMES = 15, PUSH_GRAVITY_INTERVAL = 6, BLOCK_GRAVITY_INTERVAL = 6;
const MINIMUM_TOTAL_REACTION_FRAMES = 60, EARLY_HARD_DROP_MIN_FRAMES = 10;
const CPU_AVATAR_JUMP_STUCK_FRAMES = 20, CPU_AVATAR_DANGER_JUMP_STUCK_FRAMES = 2;
const PENDING = { pending: true };

// ---------------- 乱数 (テストでは差し替え可能) ----------------
const rng = { random: () => Math.random() };
function randint(a, b) { return a + Math.floor(rng.random() * (b - a + 1)); }
function choice(arr) { return arr[Math.floor(rng.random() * arr.length)]; }

// ---------------- ブロックデータ (block_data.js の BLOCKS / RARE_BLOCK_IDS を利用) ----------------
// BLOCKS / RARE_BLOCK_IDS は block_data.js のグローバル(const)。self のプロパティではないので識別子で参照する。
function getBlocks() { return BLOCKS; }
function getRareIds() { return RARE_BLOCK_IDS; }

class SharedPieceQueue {
  constructor() {
    this._sequence = [];
    this.recentNormalShapeIds = [];
    this.rareCountdown = randint(RARE_BLOCK_COUNTDOWN_RANGE[0], RARE_BLOCK_COUNTDOWN_RANGE[1]);
  }
  _getNormalBlocks() {
    const rare = getRareIds();
    const normal = getBlocks().filter(b => !rare.includes(b.shape_id) && ![19, 20, 21].includes(b.shape_id));
    return normal.length ? normal : getBlocks();
  }
  _generateNext() {
    const rare = getRareIds();
    let data;
    if (rare.length && this.rareCountdown <= 0) {
      this.rareCountdown = randint(RARE_BLOCK_COUNTDOWN_RANGE[0], RARE_BLOCK_COUNTDOWN_RANGE[1]);
      const rareId = choice(rare);
      data = getBlocks().find(b => b.shape_id === rareId);
    } else {
      this.rareCountdown -= 1;
      const normal = this._getNormalBlocks();
      let cands = normal.filter(b => !this.recentNormalShapeIds.includes(b.shape_id));
      if (!cands.length) cands = normal;
      data = choice(cands);
      this.recentNormalShapeIds.push(data.shape_id);
      if (this.recentNormalShapeIds.length > NORMAL_BLOCK_NO_REPEAT_WINDOW) this.recentNormalShapeIds.shift();
    }
    this._sequence.push(data);
  }
  get(index) {
    while (this._sequence.length <= index) this._generateNext();
    return this._sequence[index];
  }
}

// ---------------- 自機 ----------------
class Avatar {
  constructor(board, hp) {
    this.board = board;
    this.x = (MAP_WIDTH * board.cellPx) / 2;
    this.y = (MAP_HEIGHT * board.cellPx) - P_HALF_H;
    this.vx = 0.0; this.vy = 0.0;
    this.isGrounded = false;
    this.moveSpeed = AVATAR_MOVE_SPEED;
    this.pushTimerL = 0; this.pushTimerR = 0;
    this.moveLeftHeld = false; this.moveRightHeld = false;
    this.jumpRequested = false;
    this.hittingBlock = false;
    this.hp = (hp === undefined || hp === null) ? AVATAR_MAX_HP : hp;
    this.invincible = 0;
    this.crouchHeld = false; this.isCrouching = false;
  }
  get halfH() { return this.isCrouching ? CROUCH_P_HALF_H : P_HALF_H; }
  setCrouchHeld(h) { this.crouchHeld = h; }

  _updateCrouch() {
    const diff = P_HALF_H - CROUCH_P_HALF_H;
    if (this.crouchHeld && !this.isCrouching) {
      this.y += diff; this.isCrouching = true;
    } else if (!this.crouchHeld && this.isCrouching) {
      const standY = this.y - diff;
      if (!this._collidesAt(this.x, standY, P_HALF_H)) { this.y = standY; this.isCrouching = false; }
    }
  }

  _collidesAt(x, y, halfH) {
    const cellPx = this.board.cellPx;
    if (halfH === undefined) halfH = this.halfH;
    const left = x - P_HALF_W, top = y - halfH;
    const right = x + P_HALF_W, bottom = y + halfH;
    if (bottom > MAP_HEIGHT * cellPx) return true;
    const gxMin = Math.floor(left / cellPx);
    const gxMax = Math.floor((right - EPS) / cellPx);
    const gyMin = Math.floor(top / cellPx);
    const gyMax = Math.floor((bottom - EPS) / cellPx);
    const bm = this.board.blockMap;
    for (let gy = Math.max(0, gyMin); gy <= Math.min(MAP_HEIGHT - 1, gyMax); gy++) {
      for (let gx = Math.max(0, gxMin); gx <= Math.min(MAP_WIDTH - 1, gxMax); gx++) {
        if (bm[gy][gx] !== null) return true;
      }
    }
    return false;
  }

  _isHeavy(gx, gy) {
    if (gx < 0 || gx >= MAP_WIDTH || gy < 0 || gy >= MAP_HEIGHT) return false;
    const cell = this.board.blockMap[gy][gx];
    return cell !== null && !!cell.is_garbage;
  }

  setMoveHeld(direction, held) {
    if (direction === "left") this.moveLeftHeld = held;
    else if (direction === "right") this.moveRightHeld = held;
  }
  requestJump() { this.jumpRequested = true; }

  takeDamage(cause) {
    if (this.invincible > 0) return;
    this.hp = Math.max(0, this.hp - 1);
    this.invincible = AVATAR_INVINCIBLE_FRAMES;
    const b = this.board;
    if (this.hp <= 0) {
      b.gameOver = true;
      b.deathCause = cause || "unknown";
    } else if (b.isCpu && this.hp === BOSS_PHASE_2_HP_THRESHOLD && b.bossPhase < 2 && b.maxBossPhase >= 2) {
      b.bossPhase = 2;
      b._applyBossPhaseTransition(BOSS_PHASE_2_WIDTH, BOSS_PHASE_2_SPEED_MULT);
    } else if (b.isCpu && this.hp === BOSS_PHASE_3_HP_THRESHOLD && b.bossPhase < 3 && b.maxBossPhase >= 3) {
      b.bossPhase = 3;
      b._applyBossPhaseTransition(BOSS_PHASE_3_WIDTH, BOSS_PHASE_3_SPEED_MULT);
    } else {
      this._teleport();
    }
  }

  _teleport() {
    this.x = (MAP_WIDTH * this.board.cellPx) / 2;
    this.y = TELEPORT_TOP_OFFSET;
    this.vy = 0.0;
    this.isGrounded = false;
  }

  overlapsCell(gx, gy) {
    const c = this.board.cellPx;
    const cx0 = gx * c, cx1 = (gx + 1) * c, cy0 = gy * c, cy1 = (gy + 1) * c;
    const ax0 = this.x - P_HALF_W, ax1 = this.x + P_HALF_W;
    const ay0 = this.y - this.halfH, ay1 = this.y + this.halfH;
    return ax0 < cx1 && ax1 > cx0 && ay0 < cy1 && ay1 > cy0;
  }

  update() {
    const cellPx = this.board.cellPx;
    if (this.invincible > 0) this.invincible -= 1;
    this._updateCrouch();

    const speed = this.moveSpeed * (this.isCrouching ? CROUCH_SPEED_RATIO : 1.0);
    this.vx = 0.0;
    if (this.moveLeftHeld && !this.moveRightHeld) this.vx = -speed;
    else if (this.moveRightHeld && !this.moveLeftHeld) this.vx = speed;

    let hitting = false;
    if (this.vx !== 0) {
      const newX = this.x + this.vx;
      if (!this._collidesAt(newX, this.y)) this.x = newX;
      else { hitting = true; this._tryPush(this.vx > 0 ? 1 : -1, newX); }
    }
    if (!hitting) { this.pushTimerL = 0; this.pushTimerR = 0; }
    this.hittingBlock = hitting;

    if (this.jumpRequested && this.isGrounded) { this.vy = AVATAR_JUMP_SPEED; this.isGrounded = false; }
    this.jumpRequested = false;

    this.vy += AVATAR_GRAVITY;
    const newY = this.y + this.vy;
    if (this.vy >= 0) {
      if (this._collidesAt(this.x, newY)) {
        const hh = this.halfH;
        if (newY + hh > MAP_HEIGHT * cellPx) this.y = MAP_HEIGHT * cellPx - hh;
        else {
          const gy = Math.floor((newY + hh - EPS) / cellPx);
          this.y = gy * cellPx - hh;
        }
        this.vy = 0.0; this.isGrounded = true;
      } else { this.y = newY; this.isGrounded = false; }
    } else {
      if (this._collidesAt(this.x, newY)) this.vy = 0.0;
      else this.y = newY;
    }
    this.x = Math.max(P_HALF_W, Math.min(MAP_WIDTH * cellPx - P_HALF_W, this.x));
  }

  _resetPushTimer(direction) { if (direction > 0) this.pushTimerR = 0; else this.pushTimerL = 0; }

  _tryPush(direction, newX) {
    const board = this.board, cellPx = board.cellPx;
    const frontX = newX + (direction > 0 ? P_HALF_W - 1 : -P_HALF_W);
    const gx = Math.floor(frontX / cellPx);
    if (gx < 0 || gx >= MAP_WIDTH) return;

    const gyTop = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor((this.y - this.halfH) / cellPx)));
    const gyBottom = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor((this.y + this.halfH - 1) / cellPx)));

    const touched = new Set();
    for (let gy = gyTop; gy <= gyBottom; gy++) {
      const cell = board.blockMap[gy][gx];
      if (cell === null) continue;
      if (this._isHeavy(gx, gy)) { this._resetPushTimer(direction); return; }
      if (cell.group_id !== undefined && cell.group_id !== null) touched.add(cell.group_id);
    }
    if (touched.size === 0) { this._resetPushTimer(direction); return; }

    const cache = board.getBlockCache();
    const groupCells = [];
    for (const gid of touched) { const cs = cache.get(gid) || []; for (const c of cs) groupCells.push(c); }
    const groupSet = new Set(groupCells.map(c => c[1] * 100 + c[0]));

    for (const [cx, cy] of groupCells) {
      const tgx = cx + direction;
      if (tgx < 0 || tgx >= MAP_WIDTH) { this._resetPushTimer(direction); return; }
      if (groupSet.has(cy * 100 + tgx)) continue;
      if (board.blockMap[cy][tgx] !== null) { this._resetPushTimer(direction); return; }
    }

    let ready;
    if (direction > 0) { this.pushTimerL = 0; this.pushTimerR += 1; ready = this.pushTimerR >= PUSH_DELAY_FRAMES; }
    else { this.pushTimerR = 0; this.pushTimerL += 1; ready = this.pushTimerL >= PUSH_DELAY_FRAMES; }
    if (!ready) return;

    const moved = groupCells.map(([cx, cy]) => [cx, cy, board.blockMap[cy][cx]]);
    for (const [cx, cy] of groupCells) board.blockMap[cy][cx] = null;
    for (const [cx, cy, cell] of moved) board.blockMap[cy][cx + direction] = cell;

    for (const gid of touched) {
      board.pushedGroupIds.add(gid);
      const own = cache.get(gid) || [];
      for (const g of board._findUnsupportedGroupsAbove(own, gid)) board.pushedGroupIds.add(g);
    }
    board.pushGravityTimer = 0;
    if (direction > 0) this.pushTimerR = 0; else this.pushTimerL = 0;
  }
}

// ---------------- CPU思考クライアント ----------------
// 同期版(テスト・Worker非対応時): submit時に計算し、次のpollで結果を返す。
class SyncThinkClient {
  constructor() { this._pending = false; this._req = null; this._result = PENDING; this.deferred = true; }
  submit(board, shape, w, h, nextShapes, weights, avatarCells, spawnX, survival) {
    this._req = [board, shape, w, h, nextShapes, weights, avatarCells, spawnX, survival];
    this._result = PENDING;
    this._pending = true;
    if (!this.deferred) this._run();
  }
  _run() {
    const r = this._req;
    this._result = AI.choosePlacement(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]);
    this._pending = false;
  }
  poll() {
    if (this._pending) this._run();
    return this._result;
  }
  shutdown() {}
}

// Web Worker版: 思考を別スレッドで実行(メインのフレームレートに影響しない)
class WorkerThinkClient {
  constructor() {
    const src = "(" + root.b100aiFactory.toString() + ")(self);\n"
      + "onmessage=function(e){var m=e.data;var r=self.B100AI.choosePlacement(m.board,m.shape,m.w,m.h,m.nextShapes,m.weights,m.avatarCells,m.spawnX,m.survival);postMessage({id:m.id,result:r});};";
    const blob = new Blob([src], { type: "application/javascript" });
    this._url = URL.createObjectURL(blob);
    this._worker = new Worker(this._url);
    this._idCounter = 0; this._pendingId = null; this._result = PENDING;
    this._failed = false;
    this._worker.onmessage = (e) => {
      if (e.data.id === this._pendingId) this._result = e.data.result;
    };
    this._worker.onerror = () => { this._failed = true; };
    this._last = null;
  }
  submit(board, shape, w, h, nextShapes, weights, avatarCells, spawnX, survival) {
    this._pendingId = this._idCounter++;
    this._result = PENDING;
    this._last = { id: this._pendingId, board, shape, w, h, nextShapes, weights, avatarCells, spawnX, survival };
    this._worker.postMessage(this._last);
  }
  poll() {
    if (this._failed && this._result === PENDING && this._last) {
      // Workerが動かなかった場合の保険: メインスレッドで計算する
      const m = this._last;
      this._result = AI.choosePlacement(m.board, m.shape, m.w, m.h, m.nextShapes, m.weights, m.avatarCells, m.spawnX, m.survival);
    }
    return this._result;
  }
  shutdown() {
    try { this._worker.terminate(); URL.revokeObjectURL(this._url); } catch (e) {}
  }
}

function createThinkClient() {
  try {
    if (typeof Worker !== "undefined" && typeof Blob !== "undefined" && root.b100aiFactory) return new WorkerThinkClient();
  } catch (e) {}
  return new SyncThinkClient();
}

// ---------------- 盤面 ----------------
class TetrisBoard {
  constructor(opts) {
    this.originX = opts.originX || 0; this.originY = opts.originY || 0;
    this.name = opts.name;
    this.isCpu = !!opts.isCpu;
    this.cellPx = opts.cellPx;
    this.gravityInterval = opts.gravityInterval !== undefined ? opts.gravityInterval : FALL_INTERVAL_NORMAL_DEFAULT;
    this.cpuActionInterval = opts.cpuActionInterval !== undefined ? opts.cpuActionInterval : 6;
    this.nextPanelW = opts.nextPanelW || 180; this.nextPanelGap = opts.nextPanelGap || 30;
    this.nextCellSize = opts.nextCellSize || 32;
    this.thinkClient = opts.thinkClient || null;
    this.pieceWeights = opts.pieceWeights || null;
    this.avatarWeights = opts.avatarWeights || null;
    this.width = MAP_WIDTH; this.leftWall = 0; this.rightWall = 0;
    this.maxBossPhase = opts.maxBossPhase !== undefined ? opts.maxBossPhase : 3;

    this.blockMap = [];
    for (let y = 0; y < MAP_HEIGHT; y++) this.blockMap.push(new Array(MAP_WIDTH).fill(null));
    this.nextGroupId = 1;
    this.pushedGroupIds = new Set();
    this.pushGravityTimer = 0;
    this.blockGravityTimer = 0;

    this.score = 0; this.linesClearedTotal = 0; this.piecesPlacedTotal = 0;
    this.gameOver = false; this.deathCause = null;
    this.gravityTimer = 0;
    this.cur = null;

    this.cpuActionQueue = [];
    this.cpuActionTimer = 0;
    this._cpuPlannedShape = null; this._cpuPlannedX = null;
    this._cpuReactionTimer = 0;
    this._cpuPlanApplied = true;
    this._cpuAvatarDecisionTimer = 0;
    this._cpuAvatarTargetX = 0.0;
    this._cpuAvatarStuckFrames = 0;
    this._cpuAvatarInDanger = false;
    this._survivalTracker = new AI.SurvivalModeTracker();

    this.moveLeftHeld = false; this.moveRightHeld = false;
    this.moveHoldFrames = 0; this.moveRepeatAcc = 0;
    this.fastFallHeld = false;

    this.pieceQueue = opts.pieceQueue;
    this.seqPos = 0;

    this.comboCount = 0; this.comboTimer = 0;
    this.garbageSentTotal = 0; this.garbageReceivedTotal = 0;
    this.pendingGarbage = 0;
    this.opponent = null;
    this.lastActionWasRotate = false;
    this.pendingBeamStarts = [];
    this.activeBeams = [];
    this.beamHitsLandedTotal = 0;
    this.lastClearWasTetris = false;
    this.szSpinStock = 0;
    this.bossPhase = 1;

    this.avatar = new Avatar(this, opts.avatarHp);
    this.crouchBeamRules = (opts.crouchBeamRules === undefined || opts.crouchBeamRules === null) ? !this.isCpu : opts.crouchBeamRules;

    this.wallsDirty = true; // 描画側が壁キャッシュを作り直す合図

    this.nextData = this._drawNextPieceFromQueue();
    this.spawnPiece();
  }

  _drawNextPieceFromQueue() {
    const data = this.pieceQueue.get(this.seqPos);
    this.seqPos += 1;
    return data;
  }

  spawnPiece() {
    const data = this.nextData;
    this.nextData = this._drawNextPieceFromQueue();
    const shape = data.shape.map(p => [p[0], p[1]]);
    let maxDx = 0; for (const p of shape) if (p[0] > maxDx) maxDx = p[0];
    const x = this.leftWall + Math.floor((this.width - maxDx) / 2);
    this.cur = { shape, shape_id: data.shape_id, color: data.color, outline: data.outline, x, y: 0 };
    this.gravityTimer = 0;
    this.cpuActionQueue = [];
    this.cpuActionTimer = 0;
    this._cpuPlannedShape = null; this._cpuPlannedX = null;
    this.lastActionWasRotate = false;
    if (this._collides(this.cur.shape, this.cur.x, this.cur.y)) {
      this.gameOver = true; this.deathCause = "topped_out";
      return;
    }
    if (this.isCpu) this._planCpuActions();
  }

  _collides(shape, ox, oy) {
    for (let i = 0; i < shape.length; i++) {
      const tx = ox + shape[i][0], ty = oy + shape[i][1];
      if (tx < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) return true;
      if (ty >= 0 && this.blockMap[ty][tx] !== null) return true;
    }
    return false;
  }

  tryMove(dx) {
    if (this.cur === null) return false;
    const nx = this.cur.x + dx;
    if (!this._collides(this.cur.shape, nx, this.cur.y)) { this.cur.x = nx; this.lastActionWasRotate = false; return true; }
    return false;
  }

  tryRotate(direction) {
    if (this.cur === null) return false;
    if (direction === undefined) direction = 1;
    let rotated;
    if (direction === 1) rotated = this.cur.shape.map(([dx, dy]) => [-dy, dx]);
    else rotated = this.cur.shape.map(([dx, dy]) => [dy, -dx]);
    let minX = Infinity, minY = Infinity;
    for (const [dx, dy] of rotated) { if (dx < minX) minX = dx; if (dy < minY) minY = dy; }
    rotated = rotated.map(([dx, dy]) => [dx - minX, dy - minY]);
    if (!this._collides(rotated, this.cur.x, this.cur.y)) { this.cur.shape = rotated; this.lastActionWasRotate = true; return true; }
    return false;
  }

  setMoveHeld(direction, held) {
    if (direction === "left") {
      if (held) {
        if (!this.moveLeftHeld) { this.moveLeftHeld = true; this.moveHoldFrames = 0; this.moveRepeatAcc = 0; }
        this.moveRightHeld = false;
      } else { this.moveLeftHeld = false; this.moveHoldFrames = 0; this.moveRepeatAcc = 0; }
    } else if (direction === "right") {
      if (held) {
        if (!this.moveRightHeld) { this.moveRightHeld = true; this.moveHoldFrames = 0; this.moveRepeatAcc = 0; }
        this.moveLeftHeld = false;
      } else { this.moveRightHeld = false; this.moveHoldFrames = 0; this.moveRepeatAcc = 0; }
    }
  }
  setFastFallHeld(held) { this.fastFallHeld = held; }

  hardDrop() {
    if (this.cur === null) return;
    while (!this._collides(this.cur.shape, this.cur.x, this.cur.y + 1)) this.cur.y += 1;
    this._lockAndClear();
  }

  _softDropStep() {
    if (this.cur === null) return false;
    if (!this._collides(this.cur.shape, this.cur.x, this.cur.y + 1)) { this.cur.y += 1; return true; }
    return false;
  }

  getGhostCells() {
    if (this.cur === null) return [];
    let gy = this.cur.y;
    while (!this._collides(this.cur.shape, this.cur.x, gy + 1)) gy += 1;
    if (gy === this.cur.y) return [];
    return this.cur.shape.map(([dx, dy]) => [this.cur.x + dx, gy + dy]);
  }

  getPieceLandingCells(shape, x) {
    if (this.cur === null) return [];
    const useShape = shape ? shape : this.cur.shape;
    const useX = (x !== undefined && x !== null) ? x : this.cur.x;
    let y = this.cur.y;
    while (!this._collides(useShape, useX, y + 1)) y += 1;
    return useShape.map(([dx, dy]) => [useX + dx, y + dy]);
  }

  _peekFutureShapes(extra) {
    const shapes = [this.nextData.shape];
    for (let i = 0; i < extra; i++) shapes.push(this.pieceQueue.get(this.seqPos + i).shape);
    return shapes;
  }

  _boardSnapshotNumeric() {
    return this.blockMap.map(row => row.map(c => (c === null ? 0 : (c.is_wall ? 2 : 1))));
  }

  _planCpuActions() {
    const snapshot = this._boardSnapshotNumeric();
    const shape = this.cur.shape;
    const nextShapes = this._peekFutureShapes(PIECE_AI_LOOKAHEAD_EXTRA);
    const avatarCells = this._avatarOccupiedCells();
    const spawnX = this.cur.x;
    const survival = this._survivalTracker.update(snapshot, MAP_WIDTH, MAP_HEIGHT);
    this.thinkClient.submit(snapshot, shape, MAP_WIDTH, MAP_HEIGHT, nextShapes, this.pieceWeights, avatarCells, spawnX, survival);
    this._cpuPlanApplied = false;
  }

  _applyCpuPlan(result) {
    this.cpuActionQueue = [];
    if (result === null) { this._cpuPlannedShape = null; this._cpuPlannedX = null; return; }
    this._cpuPlannedShape = result.shape;
    this._cpuPlannedX = result.x;
    if (result.path !== null && result.path !== undefined) {
      this.cpuActionQueue = result.path.slice();
    } else {
      for (let i = 0; i < result.rotation_count; i++) this.cpuActionQueue.push("rotate");
      const dx = result.x - this.cur.x;
      const step = dx > 0 ? "right" : "left";
      for (let i = 0; i < Math.abs(dx); i++) this.cpuActionQueue.push(step);
    }
  }

  _occupiedBool() {
    return this.blockMap.map(row => row.map(c => (c !== null ? 1 : 0)));
  }

  _updateCpuAvatarAi() {
    const avatar = this.avatar;
    const avatarGx = Math.floor(avatar.x / this.cellPx);

    let landing;
    if (this._cpuPlannedShape !== null && this._cpuPlannedX !== null) {
      landing = this.getPieceLandingCells(this._cpuPlannedShape, this._cpuPlannedX);
    } else landing = this.getPieceLandingCells();
    const raw = new Set(landing.map(c => c[0]));
    for (const beam of this.activeBeams) {
      if (beam.axis === "vertical") for (let g = beam.col; g < beam.col + BEAM_WIDTH; g++) raw.add(g);
    }
    const danger = new Set();
    for (const gx of raw) {
      danger.add(gx);
      if (gx - 1 >= 0) danger.add(gx - 1);
      if (gx + 1 < MAP_WIDTH) danger.add(gx + 1);
    }
    if (this.leftWall || this.rightWall) {
      for (let g = 0; g < this.leftWall; g++) danger.add(g);
      for (let g = MAP_WIDTH - this.rightWall; g < MAP_WIDTH; g++) danger.add(g);
    }

    const inDanger = danger.has(avatarGx);
    this._cpuAvatarInDanger = inDanger;
    if (inDanger) {
      const occ = this._occupiedBool();
      const [heights] = AI.analyzeColumns(occ, MAP_WIDTH, MAP_HEIGHT);
      const tg = AI.chooseSafeColumn(avatarGx, danger, MAP_WIDTH, heights, AVATAR_MAX_JUMP_CELLS);
      this._cpuAvatarTargetX = tg * this.cellPx + this.cellPx / 2;
    } else {
      this._cpuAvatarDecisionTimer -= 1;
      if (this._cpuAvatarDecisionTimer <= 0) {
        this._cpuAvatarDecisionTimer = 30;
        const occ = this._occupiedBool();
        const tg = AI.chooseTargetColumn(occ, MAP_WIDTH, MAP_HEIGHT, avatarGx, this.avatarWeights, danger);
        this._cpuAvatarTargetX = tg * this.cellPx + this.cellPx / 2;
      }
    }

    const wants = this._cpuAvatarTargetX < avatar.x - 4 || this._cpuAvatarTargetX > avatar.x + 4;
    if (this._cpuAvatarTargetX < avatar.x - 4) { avatar.setMoveHeld("left", true); avatar.setMoveHeld("right", false); }
    else if (this._cpuAvatarTargetX > avatar.x + 4) { avatar.setMoveHeld("right", true); avatar.setMoveHeld("left", false); }
    else { avatar.setMoveHeld("left", false); avatar.setMoveHeld("right", false); }

    const thr = inDanger ? CPU_AVATAR_DANGER_JUMP_STUCK_FRAMES : CPU_AVATAR_JUMP_STUCK_FRAMES;
    if (wants && avatar.hittingBlock) this._cpuAvatarStuckFrames += 1;
    else this._cpuAvatarStuckFrames = 0;

    if (this._cpuAvatarStuckFrames > thr && avatar.isGrounded) {
      const occ = this._occupiedBool();
      const [heights] = AI.analyzeColumns(occ, MAP_WIDTH, MAP_HEIGHT);
      const tg = Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor(this._cpuAvatarTargetX / this.cellPx)));
      if (AI.jumpFeasible(heights, avatarGx, tg, AVATAR_MAX_JUMP_CELLS)) avatar.requestJump();
      this._cpuAvatarStuckFrames = 0;
    }
  }

  _runCpuActions() {
    if (!this.cpuActionQueue.length) return;
    this.cpuActionTimer += 1;
    if (this.cpuActionTimer < this.cpuActionInterval) return;
    this.cpuActionTimer = 0;
    const action = this.cpuActionQueue.shift();
    if (action === "rotate") this.tryRotate();
    else if (action === "left") this.tryMove(-1);
    else if (action === "right") this.tryMove(1);
    else if (action === "down") this._softDropStep();
  }

  update() {
    if (this.gameOver || this.cur === null) return;

    this._updateComboTimer();
    this._updateBeams();
    this._updatePushGravity();
    this._updateBlockGravity();
    this.avatar.update();

    if (this.isCpu) {
      const think = this.thinkClient.poll();
      if (think === PENDING) return;
      if (!this._cpuPlanApplied) {
        this._applyCpuPlan(think);
        this._cpuPlanApplied = true;
        this._cpuReactionTimer = 0;
      }
      this._updateCpuAvatarAi();
      this._runCpuActions();
      this._cpuReactionTimer += 1;
      if (!this.cpuActionQueue.length) {
        const reactionReady = this._cpuReactionTimer >= MINIMUM_TOTAL_REACTION_FRAMES;
        const earlyReady = this._cpuReactionTimer >= EARLY_HARD_DROP_MIN_FRAMES && !this._cpuAvatarInDanger;
        if (reactionReady || earlyReady) this.hardDrop();
        return;
      }
      return;
    } else {
      this._updateHeldMovement();
    }

    this.gravityTimer += 1;
    const interval = this.isCpu ? this.gravityInterval : (this.fastFallHeld ? FALL_INTERVAL_FAST : this.gravityInterval);
    if (this.gravityTimer >= interval) {
      this.gravityTimer = 0;
      if (!this._collides(this.cur.shape, this.cur.x, this.cur.y + 1)) this.cur.y += 1;
      else this._lockAndClear();
    }
  }

  _updateHeldMovement() {
    const ml = this.moveLeftHeld, mr = this.moveRightHeld;
    if (ml && mr) { this.moveHoldFrames = 0; this.moveRepeatAcc = 0; return; }
    if (!ml && !mr) { this.moveHoldFrames = 0; this.moveRepeatAcc = 0; return; }
    const direction = ml ? -1 : 1;
    if (this.moveHoldFrames === 0) { this.tryMove(direction); this.moveRepeatAcc = 0; }
    else if (this.moveHoldFrames >= MOVE_INITIAL_DELAY) {
      this.moveRepeatAcc += 1;
      if (this.moveRepeatAcc >= MOVE_REPEAT_DELAY) { this.moveRepeatAcc = 0; this.tryMove(direction); }
    }
    this.moveHoldFrames += 1;
  }

  getBlockCache() {
    const cache = new Map();
    for (let gy = 0; gy < MAP_HEIGHT; gy++) {
      for (let gx = 0; gx < MAP_WIDTH; gx++) {
        const cell = this.blockMap[gy][gx];
        if (cell === null) continue;
        const gid = cell.group_id;
        if (gid === undefined || gid === null) continue;
        if (!cache.has(gid)) cache.set(gid, []);
        cache.get(gid).push([gx, gy]);
      }
    }
    return cache;
  }

  _findUnsupportedGroupsAbove(cells, excludeGid) {
    const topCells = new Map();
    for (const [cx, cy] of cells) {
      if (!topCells.has(cx) || cy < topCells.get(cx)) topCells.set(cx, cy);
    }
    const found = new Set();
    for (const [cx, cy] of topCells) {
      const ay = cy - 1;
      if (ay < 0) continue;
      const above = this.blockMap[ay][cx];
      if (above !== null) {
        const gid = above.group_id;
        if (gid !== undefined && gid !== null && gid !== excludeGid) found.add(gid);
      }
    }
    return found;
  }

  _tryDropGroupsByOne(groupIds) {
    const cache = this.getBlockCache();
    const settled = new Set();
    const bottomY = (gid) => {
      const cells = cache.get(gid);
      if (!cells || !cells.length) return -1;
      let m = -Infinity; for (const c of cells) if (c[1] > m) m = c[1];
      return m;
    };
    const ids = Array.from(groupIds).sort((a, b) => (-bottomY(a) - (-bottomY(b))) || (a - b));
    for (const gid of ids) {
      const cells = cache.get(gid);
      if (!cells || !cells.length) { settled.add(gid); continue; }
      let canDrop = true;
      for (const [cx, cy] of cells) {
        const ny = cy + 1;
        if (ny >= MAP_HEIGHT) { canDrop = false; break; }
        const below = this.blockMap[ny][cx];
        if (below !== null && below.group_id !== gid) { canDrop = false; break; }
      }
      if (canDrop) {
        const sorted = cells.slice().sort((a, b) => b[1] - a[1]);
        for (const [cx, cy] of sorted) {
          this.blockMap[cy + 1][cx] = this.blockMap[cy][cx];
          this.blockMap[cy][cx] = null;
        }
      } else settled.add(gid);
    }
    return settled;
  }

  _updatePushGravity() {
    if (this.pushedGroupIds.size === 0) return;
    this.pushGravityTimer += 1;
    if (this.pushGravityTimer < PUSH_GRAVITY_INTERVAL) return;
    this.pushGravityTimer = 0;

    const cache = this.getBlockCache();
    this.pushedGroupIds = new Set(Array.from(this.pushedGroupIds).filter(g => cache.has(g)));
    if (this.pushedGroupIds.size === 0) return;

    const settled = this._tryDropGroupsByOne(this.pushedGroupIds);
    const moved = Array.from(this.pushedGroupIds).filter(g => !settled.has(g));
    const chain = new Set();
    for (const gid of moved) {
      for (const g of this._findUnsupportedGroupsAbove(cache.get(gid) || [], gid)) chain.add(g);
    }
    for (const g of chain) this.pushedGroupIds.add(g);
    for (const g of settled) this.pushedGroupIds.delete(g);
    if (moved.length) this._checkAvatarCrush();
  }

  _updateBlockGravity() {
    this.blockGravityTimer += 1;
    if (this.blockGravityTimer < BLOCK_GRAVITY_INTERVAL) return;
    this.blockGravityTimer = 0;
    const cache = this.getBlockCache();
    if (cache.size === 0) return;
    const all = new Set(cache.keys());
    const settled = this._tryDropGroupsByOne(all);
    let moved = 0; for (const g of all) if (!settled.has(g)) moved++;
    if (moved) this._checkAvatarCrush();
  }

  _avatarOccupiedCells() {
    const a = this.avatar, c = this.cellPx;
    const gxMin = Math.max(0, Math.floor((a.x - P_HALF_W) / c));
    const gxMax = Math.min(MAP_WIDTH - 1, Math.floor((a.x + P_HALF_W - EPS) / c));
    const gyMin = Math.max(0, Math.floor((a.y - a.halfH) / c));
    const gyMax = Math.min(MAP_HEIGHT - 1, Math.floor((a.y + a.halfH - EPS) / c));
    const out = [];
    for (let gy = gyMin; gy <= gyMax; gy++) for (let gx = gxMin; gx <= gxMax; gx++) out.push([gx, gy]);
    return out;
  }

  _checkAvatarCrush() {
    for (const [gx, gy] of this._avatarOccupiedCells()) {
      if (this.blockMap[gy][gx] !== null) { this.avatar.takeDamage("garbage_or_push"); return; }
    }
  }

  _makeBlankRow() {
    const row = new Array(MAP_WIDTH).fill(null);
    for (let gx = 0; gx < this.leftWall; gx++) row[gx] = Object.assign({}, WALL_CELL_STYLE);
    for (let gx = MAP_WIDTH - this.rightWall; gx < MAP_WIDTH; gx++) row[gx] = Object.assign({}, WALL_CELL_STYLE);
    return row;
  }

  _lockAndClear() {
    const bossPhaseAtStart = this.bossPhase;
    this.piecesPlacedTotal += 1;

    const groupId = this.nextGroupId; this.nextGroupId += 1;
    const locked = [];
    for (const [dx, dy] of this.cur.shape) {
      const tx = this.cur.x + dx, ty = this.cur.y + dy;
      if (ty >= 0 && ty < MAP_HEIGHT && tx >= 0 && tx < MAP_WIDTH) {
        this.blockMap[ty][tx] = { color: this.cur.color, outline: this.cur.outline, group_id: groupId };
        locked.push([tx, ty]);
      }
    }
    if (locked.some(([gx, gy]) => this.avatar.overlapsCell(gx, gy))) this.avatar.takeDamage("self_piece_lock");

    const szSpin = this._checkSzSpin();
    const isRareBlock = this.cur !== null && getRareIds().includes(this.cur.shape_id);

    const lo = this.leftWall, hi = MAP_WIDTH - this.rightWall;
    const remaining = this.blockMap.filter(row => { for (let x = lo; x < hi; x++) if (row[x] === null) return true; return false; });
    const cleared = MAP_HEIGHT - remaining.length;
    while (remaining.length < MAP_HEIGHT) remaining.unshift(this._makeBlankRow());
    this.blockMap = remaining;

    if (cleared > 0 && this.pendingGarbage > 0) {
      const cancel = Math.min(this.pendingGarbage, cleared);
      this.pendingGarbage -= cancel;
    }

    if (cleared) {
      this.score += LINE_SCORE[Math.min(cleared, 4)];
      this.linesClearedTotal += cleared;
      if (this.comboTimer <= 0) this.comboCount = 0;
      this.comboCount += cleared;
      this.comboTimer = COMBO_BUFFER_FRAMES;

      const isTetris = cleared >= 4;
      if (isTetris && this.opponent !== null) {
        const tb = TETRIS_BONUS_GARBAGE_LINES + this._bossPhaseAttackBonus();
        this.opponent.queueGarbage(tb);
        this.garbageSentTotal += tb;
        if (this.lastClearWasTetris) {
          const b2b = BACK_TO_BACK_BONUS_GARBAGE_LINES + this._bossPhaseAttackBonus();
          this.opponent.queueGarbage(b2b);
          this.garbageSentTotal += b2b;
        }
      }
      this.lastClearWasTetris = isTetris;

      if (szSpin) this.szSpinStock += 1;
      else {
        if (this.szSpinStock > 0 && this.opponent !== null) {
          this.opponent.queueBeamStrikes(this.szSpinStock + this._bossPhaseAttackBonus());
        }
        this.szSpinStock = 0;
      }

      if (isRareBlock && this.opponent !== null) {
        this.opponent.queueRowBeamStrikes(RARE_LINE_BEAM_COUNT + this._bossPhaseAttackBonus());
      }
    }

    if (this.bossPhase === bossPhaseAtStart) {
      this.cur = null;
      this.spawnPiece();
    }

    if (this.pendingGarbage > 0) {
      const landing = Math.min(this.pendingGarbage, MAX_GARBAGE_LANDING_PER_LOCK);
      this.addGarbageRows(landing);
      this.pendingGarbage -= landing;
    }
  }

  _bossPhaseAttackBonus() { return Math.max(0, this.bossPhase - 1); }

  queueGarbage(n) {
    if (n <= 0 || this.gameOver) return;
    this.pendingGarbage += n;
  }

  _checkSzSpin() {
    if (this.cur === null || ![9, 10].includes(this.cur.shape_id)) return false;
    return true;
  }

  queueBeamStrikes(count, interval) {
    if (count === undefined) count = SZ_SPIN_BEAM_COUNT;
    if (interval === undefined) interval = BEAM_STRIKE_INTERVAL;
    if (this.gameOver) return;
    for (let i = 0; i < count; i++) this.pendingBeamStarts.push({ frames_left: i * interval, axis: "vertical" });
  }
  queueRowBeamStrikes(count, interval) {
    if (count === undefined) count = RARE_LINE_BEAM_COUNT;
    if (interval === undefined) interval = BEAM_STRIKE_INTERVAL;
    if (this.gameOver) return;
    for (let i = 0; i < count; i++) this.pendingBeamStarts.push({ frames_left: i * interval, axis: "horizontal" });
  }

  _updateBeams() {
    if (this.gameOver) return;
    const stillPending = [];
    for (const p of this.pendingBeamStarts) {
      p.frames_left -= 1;
      if (p.frames_left <= 0) {
        if (p.axis === "vertical") {
          const avGx = Math.floor(this.avatar.x / this.cellPx);
          let col = avGx - Math.floor(BEAM_WIDTH / 2);
          col = Math.max(0, Math.min(MAP_WIDTH - BEAM_WIDTH, col));
          this.activeBeams.push({ axis: "vertical", col, phase: "warning", frames_left: BEAM_WARNING_FRAMES, fire_frames: BEAM_FIRE_FRAMES });
        } else {
          let avGy;
          if (this.crouchBeamRules) {
            const av = this.avatar;
            const headY = (av.y + av.halfH) - 2 * P_HALF_H;
            avGy = Math.floor(headY / this.cellPx);
          } else avGy = Math.floor(this.avatar.y / this.cellPx);
          const row = Math.max(0, Math.min(MAP_HEIGHT - 1, avGy));
          this.activeBeams.push({ axis: "horizontal", row, phase: "warning", frames_left: BEAM_WARNING_FRAMES, fire_frames: RARE_LINE_BEAM_FIRE_FRAMES });
        }
      } else stillPending.push(p);
    }
    this.pendingBeamStarts = stillPending;

    const stillActive = [];
    for (const beam of this.activeBeams) {
      beam.frames_left -= 1;
      if (beam.phase === "warning") {
        if (beam.frames_left <= 0) { beam.phase = "firing"; beam.frames_left = beam.fire_frames; }
        stillActive.push(beam);
      } else if (beam.phase === "firing") {
        let hit;
        if (beam.axis === "vertical") {
          const avGx = Math.floor(this.avatar.x / this.cellPx);
          hit = beam.col <= avGx && avGx < beam.col + BEAM_WIDTH;
        } else if (this.crouchBeamRules) {
          const av = this.avatar;
          const bandTop = beam.row * this.cellPx, bandBottom = bandTop + this.cellPx;
          hit = (av.y - av.halfH) < bandBottom && (av.y + av.halfH) > bandTop;
        } else {
          const avGy = Math.floor(this.avatar.y / this.cellPx);
          hit = avGy === beam.row;
        }
        if (hit && this.avatar.invincible === 0) {
          this.avatar.takeDamage("beam");
          this.beamHitsLandedTotal += 1;
        }
        if (beam.frames_left > 0) stillActive.push(beam);
      }
    }
    this.activeBeams = stillActive;
  }

  _updateComboTimer() {
    if (this.comboTimer <= 0) return;
    this.comboTimer -= 1;
    if (this.comboTimer <= 0) {
      let lines = Math.max(0, this.comboCount - 1);
      this.comboCount = 0;
      if (lines > 0 && this.opponent !== null) {
        lines += this._bossPhaseAttackBonus();
        this.opponent.queueGarbage(lines);
        this.garbageSentTotal += lines;
      }
    }
  }

  addGarbageRows(n) {
    if (n <= 0 || this.gameOver) return;
    this.garbageReceivedTotal += n;
    const avatar = this.avatar;
    const wasGrounded = avatar.isGrounded;

    for (let i = 0; i < n; i++) {
      const gapX = randint(this.leftWall, MAP_WIDTH - this.rightWall - 1);
      const row = this._makeBlankRow();
      for (let x = this.leftWall; x < MAP_WIDTH - this.rightWall; x++) {
        if (x !== gapX) row[x] = Object.assign({}, GARBAGE_CELL_STYLE);
      }
      this.blockMap.shift();
      this.blockMap.push(row);
    }

    if (wasGrounded) {
      avatar.y -= n * this.cellPx;
      avatar.y = Math.max(avatar.halfH, avatar.y);
      this._checkAvatarCrush();
    }

    if (this.cur !== null && this._collides(this.cur.shape, this.cur.x, this.cur.y)) {
      this.gameOver = true; this.deathCause = "garbage_topped_out";
    }
  }

  _resetAndNarrowBoard(newWidth) {
    const removedPerSide = Math.floor((this.width - newWidth) / 2);
    this.width = newWidth;
    this.leftWall += removedPerSide;
    this.rightWall += removedPerSide;
    this.blockMap = [];
    for (let y = 0; y < MAP_HEIGHT; y++) this.blockMap.push(this._makeBlankRow());

    this.pendingGarbage = 0;
    this.pendingBeamStarts = [];
    this.activeBeams = [];
    this.comboCount = 0; this.comboTimer = 0;
    this.szSpinStock = 0;
    this.lastClearWasTetris = false;
    this._survivalTracker.reset();

    this.avatar.x = (this.leftWall + this.width / 2) * this.cellPx;
    this.avatar.y = (MAP_HEIGHT * this.cellPx) / 2;
    this.avatar.vx = 0.0; this.avatar.vy = 0.0;
    this.avatar.isGrounded = false;

    this.cur = null;
    this.spawnPiece();
    this.wallsDirty = true;
  }

  _applyBossPhaseTransition(newWidth, speedMult) {
    this._resetAndNarrowBoard(newWidth);
    if (this.opponent !== null) this.opponent._resetAndNarrowBoard(newWidth);
    this.avatar.moveSpeed = AVATAR_MOVE_SPEED * speedMult;
  }
}

root.B100 = {
  MAP_WIDTH, MAP_HEIGHT, P_HALF_W, P_HALF_H, CROUCH_P_HALF_H, AVATAR_MAX_HP, BEAM_WIDTH,
  PENDING, rng, randint, choice,
  SharedPieceQueue, Avatar, TetrisBoard, SyncThinkClient, WorkerThinkClient, createThinkClient,
};
})(typeof self !== "undefined" ? self : globalThis);
