// ============================================================
// 70F ボス: シーソー
//
// 本家(Python版 boss_data.py)は pymunk で次の構成を作っている。
// ここでは、その pymunk を JS 版 Chipmunk-js(js/lib/cp.js)に置き換えて、
// 同じ構成・同じ定数・同じ処理順で再現する。
//
//   ・板(シーソー)   : 質量300の剛体。ピボットで固定し、傾きを±35度に制限
//   ・置いたブロック : テトリミノ1個 = 1つの剛体(マスごとの四角形をまとめたもの)
//   ・落下中ブロック : 物理の影響を受けず手で動かす「キネマティック」
//   ・プレイヤー     : 物理には参加せず、位置の判定用の箱で衝突を調べる
//
// 本体側(boss_manager.js / game_logic.js / draw.js / main.js)とのやりとりは、
// これまでの bossSys.boss70.* と bossSys.xxxBoss70xxx() の形を保っている。
// ============================================================

// 衝突のグループ(Chipmunk-js の layers を、pymunk の ShapeFilter の代わりに使う)
//   壁          : B70_LAYER_WALL  のみ
//   ブロック    : B70_LAYER_BLOCK のみ  → 壁とは衝突しない(本家の mask = ALL ^ CAT_WALL)
//   シーソー等  : すべて            → 壁・ブロックの両方と衝突する
const B70_LAYER_WALL  = 1;
const B70_LAYER_BLOCK = 2;

const B70_CELL_HALF      = (GRID_SIZE - 1) / 2.0;  // 本家と同じく、マスは1px小さい四角形
const B70_CELL_FRICTION  = 0.9;
const B70_DECK_FRICTION  = 0.8;                    // 本家 SEESAW_FRICTION
const B70_WALL_FRICTION  = 0.5;
const B70_STEP_DT        = 1 / 60.0;
const PLAYER_PUSH_FORCE  = 2.0 * BLOCK_UNIT_MASS * SEESAW_GRAVITY_CONST; // 本家と同じ

// 左上(x0,y0)〜右下(x1,y1) の四角形(Chipmunk-js が要求する頂点の並び順で作る)
function b70Rect(body, x0, y0, x1, y1) {
  return new cp.PolyShape(body, [x0, y0, x0, y1, x1, y1, x1, y0], cp.vzero);
}

// ------------------------------------------------------------
// 重なり判定用の「箱」(本家の p_box + create_box に相当)
// 同じ大きさの箱は使い回し、位置だけを変えて shapeQuery する。
// ------------------------------------------------------------
const _b70ProbeCache = new Map();
function b70Probe(fullW, fullH, angleRad = 0) {
  const key = `${fullW}x${fullH}`;
  let probe = _b70ProbeCache.get(key);
  if (!probe) {
    const body = new cp.Body(Infinity, Infinity);
    const shape = new cp.BoxShape(body, fullW, fullH);
    probe = { body, shape };
    _b70ProbeCache.set(key, probe);
  }
  probe.body.p = cp.v(0, 0);
  probe.body.setAngle(angleRad);
  return probe;
}

// probe を (x, y) に置いたとき重なっている形状の一覧を返す。
function b70Hits(space, probe, x, y) {
  probe.body.p = cp.v(x, y);
  const hits = [];
  space.shapeQuery(probe.shape, (other) => { hits.push(other); });
  return hits;
}

// ------------------------------------------------------------
// 70F 落下中のアクティブブロック(本家 ActiveBlock70F)
// ------------------------------------------------------------
class ActiveBlock70 {
  constructor(space, spawnSide, blockData) {
    this.space = space;
    this.kinBody = null;
    this.kinShapes = [];
    this.spawn(spawnSide, blockData);
  }

  removeKinematic() {
    if (!this.kinBody) return;
    for (const s of this.kinShapes) if (this.space.containsShape(s)) this.space.removeShape(s);
    if (this.space.containsBody(this.kinBody)) this.space.removeBody(this.kinBody);
    this.kinBody = null;
    this.kinShapes = [];
  }

  // 落下中でもプレイヤーと当たり判定が取れるよう、キネマティックな剛体を登録する
  createKinematic() {
    this.removeKinematic();
    const body = new cp.Body(Infinity, Infinity);
    body.velocity_func = function () {};   // 重力で落ちない(手で動かす)
    body.position_func = function () {};
    body.p = cp.v(this.x, this.y);
    body.setAngle(this.angleDeg * Math.PI / 180.0);
    const hw = B70_CELL_HALF;
    const shapes = [];
    for (const [lx, ly] of this.getCellLocalCenters()) {
      const s = b70Rect(body, lx - hw, ly - hw, lx + hw, ly + hw);
      s.layers = B70_LAYER_BLOCK;
      shapes.push(s);
    }
    this.space.addBody(body);
    for (const s of shapes) this.space.addShape(s);
    this.kinBody = body;
    this.kinShapes = shapes;
  }

  syncKinematic() {
    if (!this.kinBody) return;
    this.kinBody.p = cp.v(this.x, this.y);
    this.kinBody.setAngle(this.angleDeg * Math.PI / 180.0);
  }

  spawn(spawnSide, blockData) {
    const data = blockData;
    this.cells = data.shape.map(([dx, dy]) => [dx, dy]);
    this.color = data.color; this.outline = data.outline;
    const minX = Math.min(...this.cells.map(([dx]) => dx)), maxX = Math.max(...this.cells.map(([dx]) => dx));
    const minY = Math.min(...this.cells.map(([, dy]) => dy)), maxY = Math.max(...this.cells.map(([, dy]) => dy));
    this.centerOffsetX = (minX + maxX + 1) * GRID_SIZE / 2.0;
    this.centerOffsetY = (minY + maxY + 1) * GRID_SIZE / 2.0;
    this.x = (spawnSide === "left") ? GAME_LEFT + 2 * GRID_SIZE : GAME_RIGHT - 2 * GRID_SIZE;
    this.y = GAME_TOP + 1 * GRID_SIZE;
    this.angleDeg = 0.0;
    this.createKinematic();
  }

  rotate(dirDeg) {
    this.angleDeg = (this.angleDeg + dirDeg + 360) % 360;
    this.syncKinematic();
  }

  getCellLocalCenters() {
    return this.cells.map(([cx, cy]) => [
      (cx * GRID_SIZE + GRID_SIZE / 2.0) - this.centerOffsetX,
      (cy * GRID_SIZE + GRID_SIZE / 2.0) - this.centerOffsetY,
    ]);
  }

  // 落下用のキネマティックを外し、実体の剛体(テトリミノ1個=1剛体)に差し替える
  lockToPhysics() {
    this.removeKinematic();
    const hw = B70_CELL_HALF, full = hw * 2;
    const cellMass = 1.0;
    const centers = this.getCellLocalCenters();
    const mass = cellMass * this.cells.length;
    // 各マスの慣性モーメント(箱の重心まわり + 剛体の原点までの平行軸の分)
    let moment = 0;
    for (const [lx, ly] of centers) moment += cellMass * (full * full + full * full) / 12.0 + cellMass * (lx * lx + ly * ly);

    const body = new cp.Body(mass, moment);
    body.p = cp.v(this.x, this.y);
    body.setAngle(this.angleDeg * Math.PI / 180.0);
    const shapes = [];
    for (const [lx, ly] of centers) {
      const s = b70Rect(body, lx - hw, ly - hw, lx + hw, ly + hw);
      s.setFriction(B70_CELL_FRICTION);
      s.setElasticity(0);
      s.layers = B70_LAYER_BLOCK;
      s.color = this.color; s.outline = this.outline;
      shapes.push(s);
    }
    this.space.addBody(body);
    for (const s of shapes) this.space.addShape(s);
    return { body, shapes };
  }
}

// ------------------------------------------------------------
// BossManager への 70F メソッド追加
// ------------------------------------------------------------
Object.assign(BossManager.prototype, {
  pickBoss70BlockData() {
    const pool = BLOCKS.filter(b => b.shape_id <= 11);
    return pool[Math.floor(Math.random() * pool.length)];
  },

  initBoss70Physics() {
    const space = new cp.Space();
    space.gravity = cp.v(0, SEESAW_GRAVITY_CONST);
    space.iterations = 15;
    space.damping = SEESAW_SPACE_DAMPING;

    const wallL = new cp.SegmentShape(space.staticBody, cp.v(GAME_LEFT, GAME_TOP - 200), cp.v(GAME_LEFT, GAME_BOTTOM + 500), 5);
    const wallR = new cp.SegmentShape(space.staticBody, cp.v(GAME_RIGHT, GAME_TOP - 200), cp.v(GAME_RIGHT, GAME_BOTTOM + 500), 5);
    for (const w of [wallL, wallR]) { w.setFriction(B70_WALL_FRICTION); w.layers = B70_LAYER_WALL; space.addShape(w); }

    const seesaw = new cp.Body(SEESAW_MASS, SEESAW_MOMENT);
    seesaw.p = cp.v(SEESAW_PIVOT_X, SEESAW_PIVOT_Y);
    const hwDeck = SEESAW_HALF_W, th = SEESAW_THICKNESS / 2;
    const deck = b70Rect(seesaw, -hwDeck, -th, hwDeck, th);
    const guardL = b70Rect(seesaw, -hwDeck, -SEESAW_GUARD_H, -hwDeck + SEESAW_GUARD_W, 0);
    const guardR = b70Rect(seesaw, hwDeck - SEESAW_GUARD_W, -SEESAW_GUARD_H, hwDeck, 0);
    for (const s of [deck, guardL, guardR]) { s.setFriction(B70_DECK_FRICTION); s.setElasticity(0); }
    space.addBody(seesaw);
    space.addShape(deck); space.addShape(guardL); space.addShape(guardR);

    // 板をピボットで固定し、傾きを±35度に制限する(本家は PinJoint(長さ0) + RotaryLimitJoint)
    space.addConstraint(new cp.PivotJoint(space.staticBody, seesaw, cp.v(SEESAW_PIVOT_X, SEESAW_PIVOT_Y), cp.vzero));
    space.addConstraint(new cp.RotaryLimitJoint(space.staticBody, seesaw, -MAX_TILT_RADIAN, MAX_TILT_RADIAN));

    const b = this.boss70;
    b.space = space;
    b.seesaw = seesaw;
    b.angle = 0;
    b.placedBlocks = [];           // {body, shapes}
    b.spawnSide = "left";
    b.activeBlock = new ActiveBlock70(space, b.spawnSide, this.pickBoss70BlockData());
    b.nextBlockData = this.pickBoss70BlockData();
  },

  resetBoss70Board() {
    const b = this.boss70;
    for (const { body, shapes } of b.placedBlocks) {
      for (const s of shapes) if (b.space.containsShape(s)) b.space.removeShape(s);
      if (b.space.containsBody(body)) b.space.removeBody(body);
    }
    b.placedBlocks = [];

    const sb = b.seesaw;
    sb.p = cp.v(SEESAW_PIVOT_X, SEESAW_PIVOT_Y);
    sb.setAngle(0);
    sb.w = 0; sb.vx = 0; sb.vy = 0; sb.t = 0; sb.f = cp.v(0, 0);
    b.angle = 0;

    b.winTimer = BOSS70_WIN_TIMER_MAX;
    b.spawnDelayTimer = 30;
    b.spawnSide = "left";
    if (b.activeBlock) {
      if (!b.nextBlockData) b.nextBlockData = this.pickBoss70BlockData();
      b.activeBlock.spawn(b.spawnSide, b.nextBlockData);
      b.nextBlockData = this.pickBoss70BlockData();
    }
  },

  // 落下中ブロックが、指定の位置・角度で何かに重なる(または画面外に出る)か
  checkBoss70ActiveBlockCollision(checkX, checkY, checkAngleDeg) {
    const b = this.boss70, active = b.activeBlock;
    if (!active || !b.space) return false;
    const rad = checkAngleDeg * Math.PI / 180.0;
    const cosA = Math.cos(rad), sinA = Math.sin(rad);
    const hw = B70_CELL_HALF;
    const probe = b70Probe(hw * 2, hw * 2, rad);
    for (const [lx, ly] of active.getCellLocalCenters()) {
      const rx = lx * cosA - ly * sinA + checkX;
      const ry = lx * sinA + ly * cosA + checkY;
      if (rx - hw < GAME_LEFT || rx + hw > GAME_RIGHT) return true;
      const hits = b70Hits(b.space, probe, rx, ry);
      for (const other of hits) {
        if (other.body === active.kinBody) continue;
        return true;
      }
    }
    return false;
  },

  updateBoss70ActiveBlock(state, player) {
    const b = this.boss70;
    if (b.spawnDelayTimer > 0) {
      b.spawnDelayTimer -= 1;
      if (b.spawnDelayTimer === 0) {
        const angle = b.seesaw.a;
        if (angle > 0.02) b.spawnSide = "right";
        else if (angle < -0.02) b.spawnSide = "left";
        else b.spawnSide = Math.random() < 0.5 ? "left" : "right";

        // NEXTで予告していたブロックをそのままスポーンさせ、新しいNEXTを補充する
        b.activeBlock.spawn(b.spawnSide, b.nextBlockData);
        b.nextBlockData = this.pickBoss70BlockData();

        if (this.checkBoss70ActiveBlockCollision(b.activeBlock.x, b.activeBlock.y, b.activeBlock.angleDeg)) return "damage";
      }
      return "running";
    }

    const active = b.activeBlock;
    if (!active) return "running";
    const ks = state.keyStates;
    let moveDx = 0;
    if (ks.left) moveDx -= 6.0;
    if (ks.right) moveDx += 6.0;

    if (moveDx !== 0) {
      const nextX = active.x + moveDx;
      if (!this.checkBoss70ActiveBlockCollision(nextX, active.y, active.angleDeg)) {
        active.x = nextX; active.syncKinematic();
      } else {
        const step = moveDx > 0 ? 1.0 : -1.0;
        for (let i = 0; i < Math.abs(moveDx); i++) {
          if (!this.checkBoss70ActiveBlockCollision(active.x + step, active.y, active.angleDeg)) {
            active.x += step; active.syncKinematic();
          } else break;
        }
      }
    }

    const fallSpeed = ks.down ? 3 * 3.5 : 3;
    const nextY = active.y + fallSpeed;
    if (this.checkBoss70ActiveBlockCollision(active.x, nextY, active.angleDeg)) {
      b.placedBlocks.push(active.lockToPhysics());
      b.spawnDelayTimer = 90;
    } else {
      active.y = nextY; active.syncKinematic();
      if (active.y > GAME_BOTTOM + 100) b.spawnDelayTimer = 90;
    }
    return "running";
  },

  cleanupBoss70OutOfBounds() {
    const b = this.boss70;
    const remaining = [];
    for (const item of b.placedBlocks) {
      if (item.body.p.y > GAME_BOTTOM + 200) {
        for (const s of item.shapes) if (b.space.containsShape(s)) b.space.removeShape(s);
        if (b.space.containsBody(item.body)) b.space.removeBody(item.body);
      } else remaining.push(item);
    }
    b.placedBlocks = remaining;
  },

  handleBoss70Input(sym) {
    const b = this.boss70, active = b.activeBlock;
    if (!active || b.spawnDelayTimer > 0 || !b.space) return;
    if (sym === "q") {
      if (!this.checkBoss70ActiveBlockCollision(active.x, active.y, (active.angleDeg - 90 + 360) % 360)) active.rotate(-90);
    } else if (sym === "e") {
      if (!this.checkBoss70ActiveBlockCollision(active.x, active.y, (active.angleDeg + 90) % 360)) active.rotate(90);
    }
  },

  // プレイヤーの左右移動を、物理世界(シーソー・ブロック・壁)と衝突解決する。[x, y] を返す。
  resolveBoss70Horizontal(currX, nextX, currY, pHalfW, pHalfH) {
    const b = this.boss70, space = b.space;
    if (!space) return [nextX, currY];
    const dx = nextX - currX;
    if (dx === 0) return [currX, currY];

    const probe = b70Probe(pHalfW * 2 - 2, pHalfH * 2 - 2);
    const contacts = b70Hits(space, probe, nextX, currY);
    if (!contacts.length) return [nextX, currY];

    // 低い段差なら、乗り越える(最大12px持ち上げる)
    for (let climb = 1; climb < 13; climb++) {
      if (!b70Hits(space, probe, nextX, currY - climb).length) return [nextX, currY - climb];
    }

    // 乗り越えられなければ、置かれたブロックを押す(力を加える)
    const pushDir = dx > 0 ? 1 : -1;
    const pushable = new Set(b.placedBlocks.map(p => p.body));
    for (const shp of contacts) {
      const body = shp.body;
      if (pushable.has(body)) {
        body.applyForce(cp.v(pushDir * PLAYER_PUSH_FORCE, 0), cp.v(currX - body.p.x, currY - body.p.y));
      }
    }
    return [currX, currY];
  },

  // プレイヤーの上下移動を、物理世界と衝突解決する。[y, 接地したか, 乗っている剛体] を返す。
  resolveBoss70Vertical(currX, currY, nextY, vy, pHalfW, pHalfH) {
    const space = this.boss70.space;
    if (!space) return [nextY, false, null];
    const probe = b70Probe(pHalfW * 2 - 2, pHalfH * 2 - 2);
    if (vy >= 0) {
      const end = Math.trunc(nextY);
      for (let stepY = Math.trunc(currY); stepY <= end; stepY++) {
        const hits = b70Hits(space, probe, currX, stepY);
        if (hits.length) return [stepY, true, hits[0].body];
      }
      return [nextY, false, null];
    }
    if (b70Hits(space, probe, currX, nextY).length) return [currY, false, null];
    return [nextY, false, null];
  },

  updateBoss70Logic(state, player) {
    const b = this.boss70;
    if (b.cleared) return "victory";
    const space = b.space, seesaw = b.seesaw;

    // 板を中央へ戻すバネのトルク。(本家と同じく、この代入の前に溜まっていた
    // 「力から生じたトルク」は消える。重さは力、着地・ジャンプは衝撃として別に加わる)
    seesaw.t = -seesaw.a * SEESAW_SPRING_K;
    space.step(B70_STEP_DT);
    // pymunk(Chipmunk 7)は、ステップごとに力とトルクを自動で0に戻す。
    // Chipmunk-js(6系)は戻さないため、同じ動きになるよう毎ステップ後に自分で戻す。
    // (戻さないと、押した力や乗った重さが次のフレーム以降も加わり続け、
    //  ブロックが飛んでいったり、板が傾きやすくなったりする)
    for (const body of space.bodies) { body.f = cp.v(0, 0); body.t = 0; }
    b.angle = seesaw.a;

    const pHalfW = P_HALF_W;
    const pHalfH = player.isCrouching ? CROUCH_P_HALF_H : P_HALF_H;
    const probe = b70Probe(pHalfW * 2 - 2, pHalfH * 2 - 2);

    const contacts = b70Hits(space, probe, player.x, player.y);
    let isOnSeesaw = false, landedBody = null;
    for (const c of contacts) {
      landedBody = c.body;
      if (landedBody === seesaw) isOnSeesaw = true;
    }

    // 横移動中に何かへ接触していたら、足元の段差を乗り越える位置まで持ち上げる
    if (player.vx !== 0 && landedBody) {
      for (let climb = 1; climb < 12; climb++) {
        if (!b70Hits(space, probe, player.x, player.y - climb).length) {
          player.y -= climb - 1;
          break;
        }
      }
    }

    const r = cp.v(player.x - seesaw.p.x, player.y - seesaw.p.y);
    if (isOnSeesaw && player.isGrounded) {
      seesaw.applyForce(cp.v(0, PLAYER_WEIGHT_FORCE), r);
      if (state.keyStates.space) seesaw.applyImpulse(cp.v(0, JUMP_PRESS_IMPULSE), r);
    }
    if (isOnSeesaw && player.isGrounded && !b.wasGroundedOnSeesaw) {
      seesaw.applyImpulse(cp.v(0, LANDING_PRESS_IMPULSE), r);
    }
    b.wasGroundedOnSeesaw = isOnSeesaw && player.isGrounded;

    // 頭上にブロックが重なったらダメージ
    if (player.invincible === 0 && player.isGrounded) {
      const headProbe = b70Probe(pHalfW * 2 - 4, 8);
      if (b70Hits(space, headProbe, player.x, player.y - pHalfH - 8).length) return "damage";
    }

    const actRes = this.updateBoss70ActiveBlock(state, player);
    if (actRes === "damage") return "damage";

    this.cleanupBoss70OutOfBounds();

    const targetY = (b.phase === 1) ? GAME_TOP + 7 * GRID_SIZE : GAME_TOP + 5 * GRID_SIZE;
    const playerTop = player.y - pHalfH;

    // 累積式キープ判定(目標ラインより上にいる間は減り、下回ると少しずつ回復する)
    if (playerTop <= targetY) {
      b.winTimer -= 1;
      if (b.winTimer <= 0) {
        if (b.phase === 1) {
          b.phase = 2;
          b.winTimer = BOSS70_WIN_TIMER_MAX;
          this.resetBoss70Board();
          return "phase_advance";
        }
        return "victory";
      }
    } else {
      b.winTimer = Math.min(BOSS70_WIN_TIMER_MAX, b.winTimer + BOSS70_WIN_RECOVER_RATE);
    }
    return "running";
  },

  // 描画用: 剛体の各形状を、ワールド座標の頂点リスト [x1,y1,x2,y2,...] にして返す
  getBoss70RenderData() {
    const b = this.boss70;
    if (!b.space || !b.seesaw) return null;
    const toWorld = (shape) => {
      const body = shape.body, rot = body.rot, p = body.p, v = shape.verts, out = [];
      for (let i = 0; i < v.length; i += 2) {
        out.push(p.x + v[i] * rot.x - v[i + 1] * rot.y, p.y + v[i] * rot.y + v[i + 1] * rot.x);
      }
      return out;
    };
    const seesawPolygons = b.seesaw.shapeList.map(s => ({ points: toWorld(s), fill: "#ff66cc", outline: "white" }));
    const placedPolygons = [];
    for (const { shapes } of b.placedBlocks) {
      for (const s of shapes) placedPolygons.push({ points: toWorld(s), fill: s.color || "yellow", outline: s.outline || "orange" });
    }
    return { seesawPolygons, placedPolygons };
  },
});
