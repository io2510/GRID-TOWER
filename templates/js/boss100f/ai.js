// 100F CPU の思考ロジック (boss100f_ai.py / boss100f_avatar_ai.py / boss100f_genome.py の移植)
// 盤面は number の2次元配列: 0=空, 1=ブロック, 2=壁セル。
// Web Worker(ai_worker)からも、メインスレッドからも使えるよう、グローバル B100AI に公開する。
function b100aiFactory(root) {
"use strict";

// ---------------- 定数 (boss100f_ai.py) ----------------
const DANGER_HEIGHT_RATIO = 0.6;
const SPIKE_PENALTY_THRESHOLD = 4;
const SPIKE_PENALTY_MULT = 2.0;
const LINE_CLEAR_URGENCY_HEIGHT_RATIO = 0.5;
const LINE_CLEAR_URGENCY_MULT = 1.5;
const LOOKAHEAD_WEIGHT = 0.5;
const SLIDE_IN_MIN_HOLE_REDUCTION = 2;
const SLIDE_IN_DOWN_STEPS_BASELINE = 3;
const SLIDE_IN_DOWN_STEPS_PER_EXTRA_HOLE = 3;
const SURVIVAL_MODE_ENTER_HEIGHT_RATIO = 0.6;
const SURVIVAL_MODE_ENTER_STREAK = 3;
const SURVIVAL_MODE_EXIT_HEIGHT_RATIO = 0.3;
const SURVIVAL_MODE_LINE_CLEAR_MULT = 3.0;
const SURVIVAL_MODE_WELL_BONUS_SCALE = 0.2;

const DEFAULT_PIECE_WEIGHTS = {
  aggregate_height: -0.51, lines_cleared: 0.76, holes: -0.70, bumpiness: -0.18,
  well_bonus: 1.0, hole_depth: -0.10, transitions: -0.10, danger_height: -0.05,
};

// ---------------- 盤面ヘルパー ----------------
function columnHeights(board, width, height) {
  const heights = [];
  for (let x = 0; x < width; x++) {
    let top = null;
    for (let y = 0; y < height; y++) {
      if (board[y][x]) { top = y; break; }
    }
    if (top === null) heights.push(0);
    else if (board[top][x] === 2) heights.push(0);
    else heights.push(height - top);
  }
  return heights;
}

class SurvivalModeTracker {
  constructor() { this.streak = 0; this.mode = false; }
  update(board, width, height) {
    const heights = columnHeights(board, width, height);
    if (!heights.length) return this.mode;
    const maxHeight = Math.max(...heights);
    const enter = height * SURVIVAL_MODE_ENTER_HEIGHT_RATIO;
    const exit = height * SURVIVAL_MODE_EXIT_HEIGHT_RATIO;
    if (maxHeight > enter) this.streak += 1; else this.streak = 0;
    if (!this.mode && this.streak >= SURVIVAL_MODE_ENTER_STREAK) this.mode = true;
    else if (this.mode && maxHeight <= exit) this.mode = false;
    return this.mode;
  }
  reset() { this.streak = 0; this.mode = false; }
}

function rotateShape(shape, times) {
  let result = shape.map(p => [p[0], p[1]]);
  for (let i = 0; i < (times % 4); i++) result = result.map(([dx, dy]) => [-dy, dx]);
  let minX = Infinity, minY = Infinity;
  for (const [dx, dy] of result) { if (dx < minX) minX = dx; if (dy < minY) minY = dy; }
  return result.map(([dx, dy]) => [dx - minX, dy - minY]);
}

function dropY(occupied, shape, x, width, height) {
  const collides = (y) => {
    for (let i = 0; i < shape.length; i++) {
      const tx = x + shape[i][0], ty = y + shape[i][1];
      if (tx < 0 || tx >= width || ty >= height) return true;
      if (ty >= 0 && occupied[ty][tx]) return true;
    }
    return false;
  };
  if (collides(0)) return null;
  let y = 0;
  while (!collides(y + 1)) y++;
  return y;
}

function place(occupied, shape, x, y, width, height) {
  const nb = occupied.map(r => r.slice());
  for (const [dx, dy] of shape) {
    const tx = x + dx, ty = y + dy;
    if (ty >= 0 && ty < height && tx >= 0 && tx < width) nb[ty][tx] = 1;
  }
  const remaining = nb.filter(row => !row.every(c => c !== 0));
  const cleared = height - remaining.length;
  while (remaining.length < height) remaining.unshift(new Array(width).fill(0));
  return [remaining, cleared];
}

function evaluateBoard(board, linesCleared, width, height, w, survival) {
  const colTop = new Array(width).fill(null);
  const colPending = new Array(width).fill(0);
  let holes = 0, emptyRowStreak = 0;
  let wellCol = null, wellStreak = 0, bestWellStreak = 0;
  const holeBatches = new Array(width).fill(null);
  let rowTrans = 0, colTrans = 0;
  const colPrevFilled = new Array(width).fill(true);

  for (let y = height - 1; y >= 0; y--) {
    const row = board[y];
    let rowHasBlock = false, emptyCount = 0, emptyCol = null, rowPrev = true;
    for (let x = 0; x < width; x++) {
      const cell = row[x];
      const cur = cell !== 0;
      if (cur !== rowPrev) rowTrans++;
      rowPrev = cur;
      if (cur !== colPrevFilled[x]) colTrans++;
      colPrevFilled[x] = cur;
      if (cur) {
        if (cell !== 2) rowHasBlock = true;
        colTop[x] = y;
        holes += colPending[x];
        if (colPending[x] > 0) {
          if (holeBatches[x] === null) holeBatches[x] = [];
          holeBatches[x].push([y, colPending[x]]);
        }
        colPending[x] = 0;
      } else {
        colPending[x] += 1;
        emptyCount++;
        emptyCol = x;
      }
    }
    if (!rowPrev) rowTrans++;

    if (emptyCount === 1 && emptyCol === wellCol) wellStreak++;
    else if (emptyCount === 1) { wellCol = emptyCol; wellStreak = 1; }
    else { wellCol = null; wellStreak = 0; }
    if (wellStreak > bestWellStreak) bestWellStreak = wellStreak;

    if (rowHasBlock) emptyRowStreak = 0;
    else { emptyRowStreak++; if (emptyRowStreak >= 3) break; }
  }
  for (let x = 0; x < width; x++) if (colPrevFilled[x]) colTrans++;

  const heights = colTop.map(t => (t !== null ? height - t : 0));
  let playable = [];
  for (let x = 0; x < width; x++) {
    if (!(colTop[x] !== null && board[colTop[x]][x] === 2)) playable.push(heights[x]);
  }
  if (!playable.length) playable = [0];

  let aggregate = 0;
  for (const h of playable) aggregate += h;
  let bump = 0;
  for (let i = 0; i < playable.length - 1; i++) bump += Math.abs(playable[i] - playable[i + 1]);
  const wellBonus = Math.min(bestWellStreak, 4);

  let holeDepth = 0;
  for (let x = 0; x < width; x++) {
    if (holeBatches[x] === null || colTop[x] === null) continue;
    const top = colTop[x];
    for (const [by, cnt] of holeBatches[x]) holeDepth += cnt * (by - top);
  }

  const dangerThreshold = height * DANGER_HEIGHT_RATIO;
  let dangerHeight = 0;
  for (const h of playable) if (h > dangerThreshold) dangerHeight += (h - dangerThreshold) ** 2;

  let spike = 0.0;
  const n = playable.length;
  if (n > 1) {
    for (const h of playable) {
      const othersAvg = (aggregate - h) / (n - 1);
      const excess = h - othersAvg - SPIKE_PENALTY_THRESHOLD;
      if (excess > 0) spike += excess * excess;
    }
  }

  let urgencyBonus = 0.0;
  if (linesCleared > 0 && playable.length) {
    if (survival) {
      urgencyBonus = SURVIVAL_MODE_LINE_CLEAR_MULT * Math.abs(w.lines_cleared) * linesCleared;
    } else {
      const thr = height * LINE_CLEAR_URGENCY_HEIGHT_RATIO;
      let maxH = 0; for (const h of playable) if (h > maxH) maxH = h;
      if (maxH > thr) {
        const margin = Math.max(1.0, height - thr);
        const urgency = Math.min(1.0, (maxH - thr) / margin);
        urgencyBonus = LINE_CLEAR_URGENCY_MULT * urgency * Math.abs(w.lines_cleared) * linesCleared;
      }
    }
  }
  let wellW = w.well_bonus;
  if (survival) wellW = wellW * SURVIVAL_MODE_WELL_BONUS_SCALE;

  return (
    w.aggregate_height * aggregate
    + w.lines_cleared * linesCleared
    + w.holes * holes
    + w.bumpiness * bump
    + wellW * wellBonus
    + w.hole_depth * holeDepth
    + w.transitions * (rowTrans + colTrans)
    + w.danger_height * dangerHeight
    - SPIKE_PENALTY_MULT * spike
    + urgencyBonus
  );
}

function countHoles(board, width, height) {
  const pend = new Array(width).fill(0);
  let holes = 0;
  for (let y = height - 1; y >= 0; y--) {
    const row = board[y];
    for (let x = 0; x < width; x++) {
      if (row[x]) { holes += pend[x]; pend[x] = 0; } else pend[x] += 1;
    }
  }
  return holes;
}

function pieceKeySet(shape, x, y, width) {
  // avatar_cells との重なり判定用 (キーは gy*1000+gx)
  const s = [];
  for (const [dx, dy] of shape) s.push((y + dy) * 1000 + (x + dx));
  return s;
}
function overlapsAvatar(shape, x, y, avatarSet) {
  if (!avatarSet || avatarSet.size === 0) return false;
  for (const [dx, dy] of shape) if (avatarSet.has((y + dy) * 1000 + (x + dx))) return true;
  return false;
}

function candidatePlacements(occupied, shape, width, height, avatarSet) {
  const cands = [], unsafe = [];
  for (let rc = 0; rc < 4; rc++) {
    const rotated = rotateShape(shape, rc);
    let maxDx = 0; for (const p of rotated) if (p[0] > maxDx) maxDx = p[0];
    for (let x = 0; x < width - maxDx; x++) {
      const y = dropY(occupied, rotated, x, width, height);
      if (y === null) continue;
      const [nb, cleared] = place(occupied, rotated, x, y, width, height);
      const entry = [rc, rotated, x, y, nb, cleared];
      if (avatarSet && avatarSet.size && overlapsAvatar(rotated, x, y, avatarSet)) unsafe.push(entry);
      else cands.push(entry);
    }
  }
  if (!cands.length) return unsafe;
  return cands;
}

function bfsReachablePlacements(occupied, shape, spawnX, width, height, avatarSet) {
  const rotations = [0, 1, 2, 3].map(r => rotateShape(shape, r));
  const collides = (rs, x, y) => {
    for (let i = 0; i < rs.length; i++) {
      const tx = x + rs[i][0], ty = y + rs[i][1];
      if (tx < 0 || tx >= width || ty >= height) return true;
      if (ty >= 0 && occupied[ty][tx]) return true;
    }
    return false;
  };
  const touches = (rs, x, y) => overlapsAvatar(rs, x, y, avatarSet);
  const key = (r, x, y) => r + "," + x + "," + y;
  if (collides(rotations[0], spawnX, 0)) return [[], {}];

  const startKey = key(0, spawnX, 0);
  const visited = new Set([startKey]);
  const parent = {}; parent[startKey] = null;
  const danger = {}; danger[startKey] = touches(rotations[0], spawnX, 0);
  const queue = [[0, spawnX, 0]]; let head = 0;
  const landed = [];

  const visit = (nr, nx, ny, prevKey, action) => {
    const k = key(nr, nx, ny);
    if (visited.has(k)) return;
    visited.add(k);
    parent[k] = [prevKey, action];
    danger[k] = danger[prevKey] || touches(rotations[nr], nx, ny);
    queue.push([nr, nx, ny]);
  };

  while (head < queue.length) {
    const st = queue[head++];
    const [r, x, y] = st;
    const sk = key(r, x, y);
    const rs = rotations[r];
    if (!collides(rs, x, y + 1)) visit(r, x, y + 1, sk, "down");
    else landed.push(st);
    if (!collides(rs, x - 1, y)) visit(r, x - 1, y, sk, "left");
    if (!collides(rs, x + 1, y)) visit(r, x + 1, y, sk, "right");
    const nr = (r + 1) % 4;
    if (!collides(rotations[nr], x, y)) visit(nr, x, y, sk, "rotate");
  }

  const cands = [], unsafe = [];
  for (const st of landed) {
    const [r, x, y] = st;
    const rs = rotations[r];
    const [nb, cleared] = place(occupied, rs, x, y, width, height);
    const entry = [r, rs, x, y, nb, cleared];
    if (danger[key(r, x, y)]) unsafe.push(entry); else cands.push(entry);
  }
  if (!cands.length) return [unsafe, parent];
  return [cands, parent];
}

function reconstructPath(parent, r, x, y) {
  const path = [];
  let step = parent[r + "," + x + "," + y];
  while (step) {
    path.push(step[1]);
    step = parent[step[0]];
  }
  path.reverse();
  return path;
}

function lookaheadScore(board, shapes, width, height, w, survival) {
  if (!shapes.length) return null;
  const shape = shapes[0], rest = shapes.slice(1);
  const cands = candidatePlacements(board, shape, width, height, null);
  if (!cands.length) return null;
  let best = null;
  for (const [rc, rotated, x, y, nb, cleared] of cands) {
    let score = evaluateBoard(nb, cleared, width, height, w, survival);
    if (rest.length) {
      const deeper = lookaheadScore(nb, rest, width, height, w, survival);
      if (deeper !== null) score += LOOKAHEAD_WEIGHT * deeper;
    }
    if (best === null || score > best) best = score;
  }
  return best;
}

// board: number[][] (0/1/2) ; avatarCells: [[gx,gy],...] or null
function choosePlacement(board, shape, width, height, nextShapes, weights, avatarCells, spawnX, survival) {
  if (!weights) weights = DEFAULT_PIECE_WEIGHTS;
  if (!nextShapes) nextShapes = [];
  const occupied = board.map(row => row.map(c => (c === 2 ? 2 : (c ? 1 : 0))));
  let avatarSet = null;
  if (avatarCells && avatarCells.length) {
    avatarSet = new Set(avatarCells.map(([gx, gy]) => gy * 1000 + gx));
  }
  const straight = candidatePlacements(occupied, shape, width, height, avatarSet);
  let parent = null, bfs = null;
  if (spawnX !== null && spawnX !== undefined) {
    [bfs, parent] = bfsReachablePlacements(occupied, shape, spawnX, width, height, avatarSet);
  }
  if (!straight.length && !(bfs && bfs.length)) return null;

  const bestOf = (cands) => {
    let bestEntry = null, bestScore = null, bestBoard = null;
    for (const [rc, rotated, x, y, nb, cleared] of cands) {
      let score = evaluateBoard(nb, cleared, width, height, weights, survival);
      if (nextShapes.length) {
        const deeper = lookaheadScore(nb, nextShapes, width, height, weights, survival);
        if (deeper !== null) score += LOOKAHEAD_WEIGHT * deeper;
      }
      if (bestScore === null || score > bestScore) {
        bestScore = score; bestEntry = [rc, rotated, x, y]; bestBoard = [nb, cleared];
      }
    }
    if (bestEntry === null) return null;
    return [bestEntry, bestScore, bestBoard];
  };

  const bestStraight = bestOf(straight);
  const bestOverall = (bfs && bfs.length) ? bestOf(bfs) : null;

  let useOverall = false, overallPath = null;
  if (bestStraight === null) {
    useOverall = true;
    const [rc, , x, y] = bestOverall[0];
    overallPath = reconstructPath(parent, rc, x, y);
  } else if (bestOverall !== null) {
    const a = bestOverall[0], b = bestStraight[0];
    const differ = !(a[0] === b[0] && a[2] === b[2] && a[3] === b[3]);
    if (differ) {
      const [sb, sc] = bestStraight[2];
      const [ob, oc] = bestOverall[2];
      const straightHoles = countHoles(sb, width, height);
      const overallHoles = countHoles(ob, width, height);
      overallPath = reconstructPath(parent, a[0], a[2], a[3]);
      const downSteps = overallPath.filter(s => s === "down").length;
      const extra = Math.max(0, downSteps - SLIDE_IN_DOWN_STEPS_BASELINE);
      const required = SLIDE_IN_MIN_HOLE_REDUCTION + Math.floor(extra / SLIDE_IN_DOWN_STEPS_PER_EXTRA_HOLE);
      useOverall = (overallHoles <= straightHoles - required)
        || (oc > sc && overallHoles <= straightHoles);
    }
  }

  let rc, rotated, x, y, path;
  if (useOverall) {
    [rc, rotated, x, y] = bestOverall[0];
    path = overallPath;
  } else {
    [rc, rotated, x, y] = bestStraight[0];
    path = null;
  }
  return { rotation_count: rc, x: x, y: y, shape: rotated, path: path };
}

// ---------------- 自機AI (boss100f_avatar_ai.py) ----------------
const DEFAULT_MAX_JUMP_CELLS = 3;

function pathObstruction(heights, ax, tx) {
  if (ax === tx) return 0;
  const step = tx > ax ? 1 : -1;
  let maxStep = 0, prev = heights[ax], gx = ax + step;
  for (;;) {
    const h = heights[gx];
    maxStep = Math.max(maxStep, Math.abs(h - prev));
    prev = h;
    if (gx === tx) break;
    gx += step;
  }
  return maxStep;
}

function analyzeColumns(occupied, width, height) {
  const heights = new Array(width).fill(0), holes = new Array(width).fill(0);
  for (let gx = 0; gx < width; gx++) {
    let top = null, hc = 0;
    for (let gy = 0; gy < height; gy++) {
      if (occupied[gy][gx]) { if (top === null) top = gy; }
      else if (top !== null) hc++;
    }
    heights[gx] = top !== null ? height - top : 0;
    holes[gx] = hc;
  }
  return [heights, holes];
}

function evaluateColumn(gx, heights, holes, ax, w) {
  const distance = Math.abs(gx - ax);
  const obstruction = pathObstruction(heights, ax, gx);
  return w.height * heights[gx] + w.holes * holes[gx] + w.distance * distance + w.path_obstruction * obstruction;
}

function findRowGap(occupied, y, width) {
  let emptyGx = null, cnt = 0;
  for (let gx = 0; gx < width; gx++) {
    if (!occupied[y][gx]) { cnt++; emptyGx = gx; if (cnt > 1) return null; }
  }
  return cnt === 1 ? emptyGx : null;
}

function findDepositTarget(occupied, width, height, sx, heights, w, danger) {
  if (heights[sx] <= 0) return null;
  const topRow = height - heights[sx];
  const gap = findRowGap(occupied, topRow, width);
  let bestGx = null, bestScore = null;
  for (const n of [sx - 1, sx + 1]) {
    if (n < 0 || n >= width) continue;
    if (danger.has(n)) continue;
    const diff = heights[sx] - heights[n];
    if (diff <= 0) continue;
    let score = w.deposit_height_diff * diff;
    if (gap === n) score += w.deposit_line_bonus;
    if (bestScore === null || score > bestScore) { bestScore = score; bestGx = n; }
  }
  return bestGx;
}

function reachableSafeColumns(ax, danger, width) {
  if (danger.has(ax)) return new Set();
  const r = new Set([ax]);
  let gx = ax;
  while (gx - 1 >= 0 && !danger.has(gx - 1)) { gx--; r.add(gx); }
  gx = ax;
  while (gx + 1 < width && !danger.has(gx + 1)) { gx++; r.add(gx); }
  return r;
}

function chooseSafeColumn(ax, danger, width, heights, maxJump) {
  if (maxJump === undefined) maxJump = DEFAULT_MAX_JUMP_CELLS;
  if (heights) {
    for (let off = 1; off < width; off++) {
      const right = ax + off, left = ax - off;
      const rightOk = right < width && !danger.has(right);
      const leftOk = left >= 0 && !danger.has(left);
      const ro = rightOk ? pathObstruction(heights, ax, right) : null;
      const lo = leftOk ? pathObstruction(heights, ax, left) : null;
      const rc = rightOk && ro <= maxJump;
      const lc = leftOk && lo <= maxJump;
      if (rc && lc) return ro <= lo ? right : left;
      if (rc) return right;
      if (lc) return left;
    }
  }
  for (let off = 1; off < width; off++) {
    const right = ax + off, left = ax - off;
    const rightOk = right < width && !danger.has(right);
    const leftOk = left >= 0 && !danger.has(left);
    if (rightOk && leftOk && heights) {
      const ro = pathObstruction(heights, ax, right), lo = pathObstruction(heights, ax, left);
      return ro <= lo ? right : left;
    }
    if (rightOk) return right;
    if (leftOk) return left;
  }
  return ax;
}

function jumpFeasible(heights, ax, tx, maxJump) {
  if (maxJump === undefined) maxJump = DEFAULT_MAX_JUMP_CELLS;
  return pathObstruction(heights, ax, tx) <= maxJump;
}

function chooseTargetColumn(occupied, width, height, ax, w, danger) {
  if (!danger) danger = new Set();
  const [heights, holes] = analyzeColumns(occupied, width, height);
  let safe = Array.from(reachableSafeColumns(ax, danger, width)).sort((a, b) => a - b);
  if (!safe.length) { safe = []; for (let g = 0; g < width; g++) if (!danger.has(g)) safe.push(g); }
  if (!safe.length) { safe = []; for (let g = 0; g < width; g++) safe.push(g); }
  let sourceGx = safe[0], sourceScore = null;
  for (const gx of safe) {
    const s = evaluateColumn(gx, heights, holes, ax, w);
    if (sourceScore === null || s > sourceScore) { sourceScore = s; sourceGx = gx; }
  }
  if (ax === sourceGx) {
    const dep = findDepositTarget(occupied, width, height, sourceGx, heights, w, danger);
    if (dep !== null) return dep;
  }
  return sourceGx;
}

// ---------------- ゲノム ----------------
const GENOME_V8 = {
  piece_aggregate_height: -7.827092337505947,
  piece_lines_cleared: 9.22224312282225,
  piece_holes: -2.8136398826184994,
  piece_bumpiness: -0.8308107390426344,
  piece_well_bonus: 5.6000206870586435,
  piece_hole_depth: -1.2295021752231894,
  piece_transitions: -1.512460679039988,
  piece_danger_height: -1.1263426233411586,
  avatar_height: 7.294922024098967,
  avatar_holes: -1.1824421740102125,
  avatar_distance: 2.231885332104931,
  avatar_deposit_height_diff: 2.0934811146647103,
  avatar_deposit_line_bonus: 5.220019029982319,
  avatar_path_obstruction: -3.2045311322815553,
};
function toPieceWeights(g) {
  return {
    aggregate_height: g.piece_aggregate_height, lines_cleared: g.piece_lines_cleared,
    holes: g.piece_holes, bumpiness: g.piece_bumpiness, well_bonus: g.piece_well_bonus,
    hole_depth: g.piece_hole_depth, transitions: g.piece_transitions, danger_height: g.piece_danger_height,
  };
}
function toAvatarWeights(g) {
  return {
    height: g.avatar_height, holes: g.avatar_holes, distance: g.avatar_distance,
    deposit_height_diff: g.avatar_deposit_height_diff, deposit_line_bonus: g.avatar_deposit_line_bonus,
    path_obstruction: g.avatar_path_obstruction,
  };
}

root.B100AI = {
  SurvivalModeTracker, columnHeights, rotateShape, choosePlacement,
  analyzeColumns, chooseSafeColumn, chooseTargetColumn, jumpFeasible,
  GENOME_V8, toPieceWeights, toAvatarWeights, DEFAULT_MAX_JUMP_CELLS,
};
}
b100aiFactory(typeof self !== "undefined" ? self : globalThis);
