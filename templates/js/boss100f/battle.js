// 100Fボス戦 (PLAYER vs CPU) の進行・入力・描画 (boss100f_battle.py + test_play.py の draw の移植)
// 本体(main.js)との窓口: start(hp) / update() / draw(ctx) / onKeyDown(sym, repeat) / onKeyUp(sym) / stop()
(function (root) {
"use strict";

const B = root.B100, AI = root.B100AI;

const SCREEN_W = 1920, SCREEN_H = 1080;
const CELL_PX = 40, NEXT_PANEL_W = 180, NEXT_PANEL_GAP = 30, SIDE_GAP = 100, BOARD_TOP = 40;
const COUNTDOWN_SECONDS = 5, ASSUMED_FPS = 60, START_HOLD_FRAMES = 30, RESULT_HOLD_FRAMES = 120;
const FONT = "'DotGothic16', sans-serif";
const GENOME_LABEL = "boss100f_trained_genome_v8";

function hexToRgb(c) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || "");
  if (!m) return [51, 51, 51];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
const _darkCache = {};
function darken(color, factor) {
  const key = color + "|" + factor;
  if (_darkCache[key]) return _darkCache[key];
  const [r, g, b] = hexToRgb(color);
  const h = (v) => ("0" + Math.floor(v * factor).toString(16)).slice(-2);
  return (_darkCache[key] = "#" + h(r) + h(g) + h(b));
}

class Battle100F {
  constructor() { this.active = false; this._reset(); }
  _reset() {
    this.player = null; this.cpu = null; this.client = null;
    this.countdownFrame = 0; this.matchStarted = false;
    this.result = null; this.resultTimer = 0;
  }

  start(playerHp) {
    if (this.active) this.stop();
    const g = AI.GENOME_V8;
    const boardW = B.MAP_WIDTH * CELL_PX + NEXT_PANEL_GAP + NEXT_PANEL_W;
    const totalW = boardW * 2 + SIDE_GAP;
    const marginX = Math.floor((SCREEN_W - totalW) / 2);
    this.client = B.createThinkClient();
    const queue = new B.SharedPieceQueue();
    this.player = new B.TetrisBoard({
      originX: marginX, originY: BOARD_TOP, name: "P", isCpu: false, cellPx: CELL_PX, pieceQueue: queue,
      nextPanelW: NEXT_PANEL_W, nextPanelGap: NEXT_PANEL_GAP,
      avatarHp: Math.max(1, Math.min(B.AVATAR_MAX_HP, Math.ceil(playerHp))),
    });
    this.cpu = new B.TetrisBoard({
      originX: marginX + boardW + SIDE_GAP, originY: BOARD_TOP, name: "C", isCpu: true, cellPx: CELL_PX, pieceQueue: queue,
      nextPanelW: NEXT_PANEL_W, nextPanelGap: NEXT_PANEL_GAP,
      thinkClient: this.client, pieceWeights: AI.toPieceWeights(g), avatarWeights: AI.toAvatarWeights(g),
    });
    this.player.opponent = this.cpu; this.cpu.opponent = this.player;
    this.countdownFrame = 0; this.matchStarted = false; this.result = null; this.resultTimer = 0;
    this.active = true;
  }

  stop() {
    if (this.client) { try { this.client.shutdown(); } catch (e) {} }
    this.active = false;
    this._reset();
  }

  // ---------- 入力 ----------
  onKeyDown(sym, repeat) {
    if (!this.active || !this.matchStarted || this.result !== null) return;
    const b = this.player;
    if (b.gameOver) return;
    if (sym === "left") b.setMoveHeld("left", true);
    else if (sym === "right") b.setMoveHeld("right", true);
    else if (sym === "down") b.setFastFallHeld(true);
    else if (sym === "a") b.avatar.setMoveHeld("left", true);
    else if (sym === "d") b.avatar.setMoveHeld("right", true);
    else if (sym === "s") b.avatar.setCrouchHeld(true);
    else if (repeat) return; // 回転・ハードドロップ・ジャンプはキーリピートで連打させない
    else if (sym === "q") b.tryRotate(-1);
    else if (sym === "e") b.tryRotate(1);
    else if (sym === "up") b.hardDrop();
    else if (sym === "space") b.avatar.requestJump();
  }

  onKeyUp(sym) {
    if (!this.active || !this.player) return;
    const b = this.player;
    if (sym === "left") b.setMoveHeld("left", false);
    else if (sym === "right") b.setMoveHeld("right", false);
    else if (sym === "down") b.setFastFallHeld(false);
    else if (sym === "a") b.avatar.setMoveHeld("left", false);
    else if (sym === "d") b.avatar.setMoveHeld("right", false);
    else if (sym === "s") b.avatar.setCrouchHeld(false);
  }

  releaseAll() {
    for (const k of ["left", "right", "down", "a", "d", "s"]) this.onKeyUp(k);
  }

  // ---------- 更新 ----------
  // 戻り値: "running" / "victory" / "defeat"
  update() {
    if (!this.active) return "running";
    if (!this.matchStarted) {
      this.countdownFrame += 1;
      if (this.countdownFrame >= COUNTDOWN_SECONDS * ASSUMED_FPS + START_HOLD_FRAMES) this.matchStarted = true;
      return "running";
    }
    if (this.result === null) {
      this.player.update();
      this.cpu.update();
      if (this.player.gameOver) this.result = "defeat";
      else if (this.cpu.gameOver) this.result = "victory";
      return "running";
    }
    this.resultTimer += 1;
    if (this.resultTimer >= RESULT_HOLD_FRAMES) return this.result;
    return "running";
  }

  playerHp() { return this.player ? this.player.avatar.hp : 0; }

  // ---------- 描画 ----------
  draw(ctx) {
    if (!this.active) return;
    ctx.save();
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#111122"; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    this._drawBoard(ctx, this.player);
    this._drawBoard(ctx, this.cpu);

    ctx.textAlign = "center";
    ctx.fillStyle = "#666688"; ctx.font = `14px ${FONT}`;
    ctx.fillText("←→:ブロック移動  Q/E:回転  ↓:高速落下  ↑:ハードドロップ   |   A/D:自機移動  Space:ジャンプ  S:しゃがみ   |   ESC:ポーズ", SCREEN_W / 2, SCREEN_H - 22);
    ctx.fillText("100F BOSS   AI: " + GENOME_LABEL, SCREEN_W / 2, SCREEN_H - 6);

    if (!this.matchStarted) {
      const remaining = COUNTDOWN_SECONDS - Math.floor(this.countdownFrame / ASSUMED_FPS);
      ctx.textAlign = "center";
      if (remaining > 0) { ctx.fillStyle = "#ffff00"; ctx.font = `bold 120px ${FONT}`; ctx.fillText(String(remaining), SCREEN_W / 2, SCREEN_H / 2 + 40); }
      else { ctx.fillStyle = "#00ff88"; ctx.font = `bold 90px ${FONT}`; ctx.fillText("START!", SCREEN_W / 2, SCREEN_H / 2 + 30); }
    }
    if (this.result !== null) {
      ctx.textAlign = "center";
      ctx.fillStyle = this.result === "victory" ? "#ffdd00" : "#ff4444";
      ctx.font = `bold 100px ${FONT}`;
      ctx.fillText(this.result === "victory" ? "VICTORY!" : "DEFEAT...", SCREEN_W / 2, SCREEN_H / 2 + 35);
    }
    ctx.restore();
  }

  _drawBoard(ctx, b) {
    const cp = b.cellPx, ox = b.originX, oy = b.originY, W = B.MAP_WIDTH, H = B.MAP_HEIGHT;

    // ビーム(帯)。ブロックのあるマスは後から不透明に描かれるので、空きマスにだけ見える。
    for (const beam of b.activeBeams) {
      let bx0, bx1, by0, by1, inner;
      if (beam.axis === "vertical") {
        bx0 = ox + beam.col * cp; bx1 = ox + (beam.col + B.BEAM_WIDTH) * cp; by0 = oy; by1 = oy + H * cp;
        inner = [bx0 + 4, by0, bx1 - 4, by1];
      } else {
        bx0 = ox; bx1 = ox + W * cp; by0 = oy + beam.row * cp; by1 = by0 + cp;
        inner = [bx0, by0 + 4, bx1, by1 - 4];
      }
      if (beam.phase === "warning") {
        if (Math.floor(beam.frames_left / 8) % 2 === 0) { ctx.fillStyle = "#550000"; ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0); }
      } else if (beam.phase === "firing") {
        ctx.fillStyle = "#ff2200"; ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
        ctx.fillStyle = "#ffffff"; ctx.fillRect(inner[0], inner[1], inner[2] - inner[0], inner[3] - inner[1]);
      }
    }

    // マス目
    ctx.lineWidth = 1;
    for (let gy = 0; gy < H; gy++) {
      const row = b.blockMap[gy];
      for (let gx = 0; gx < W; gx++) {
        const x0 = ox + gx * cp, y0 = oy + gy * cp, cell = row[gx];
        if (cell) {
          ctx.fillStyle = cell.color; ctx.fillRect(x0, y0, cp, cp);
          ctx.strokeStyle = cell.outline; ctx.strokeRect(x0 + 0.5, y0 + 0.5, cp - 1, cp - 1);
        } else {
          ctx.strokeStyle = "#222222"; ctx.strokeRect(x0 + 0.5, y0 + 0.5, cp - 1, cp - 1);
        }
      }
    }
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, W * cp, H * cp);

    // 壁の赤い斜線
    if (b.leftWall || b.rightWall) {
      ctx.strokeStyle = "#ff3333"; ctx.lineWidth = 2; ctx.beginPath();
      for (let gy = 0; gy < H; gy++) {
        for (let gx = 0; gx < W; gx++) {
          if (gx < b.leftWall || gx >= W - b.rightWall) {
            const x0 = ox + gx * cp, y0 = oy + gy * cp;
            ctx.moveTo(x0, y0); ctx.lineTo(x0 + cp, y0 + cp);
          }
        }
      }
      ctx.stroke();
    }

    // ゴースト・現在の駒
    if (b.cur) {
      const ghost = b.getGhostCells();
      if (ghost.length) {
        const gf = darken(b.cur.color, 0.28), go = darken(b.cur.outline || b.cur.color, 0.45);
        const curSet = new Set(b.cur.shape.map(([dx, dy]) => (b.cur.x + dx) + "," + (b.cur.y + dy)));
        ctx.lineWidth = 2;
        for (const [gx, gy] of ghost) {
          if (curSet.has(gx + "," + gy)) continue;
          const x0 = ox + gx * cp, y0 = oy + gy * cp;
          ctx.fillStyle = gf; ctx.fillRect(x0 + 2, y0 + 2, cp - 4, cp - 4);
          ctx.strokeStyle = go; ctx.strokeRect(x0 + 2, y0 + 2, cp - 4, cp - 4);
        }
      }
      ctx.lineWidth = 1;
      for (const [dx, dy] of b.cur.shape) {
        const gx = b.cur.x + dx, gy = b.cur.y + dy;
        if (gy >= 0 && gy < H) {
          const x0 = ox + gx * cp, y0 = oy + gy * cp;
          ctx.fillStyle = b.cur.color; ctx.fillRect(x0, y0, cp, cp);
          ctx.strokeStyle = b.cur.outline; ctx.strokeRect(x0 + 0.5, y0 + 0.5, cp - 1, cp - 1);
        }
      }
    }

    // 自機
    const av = b.avatar;
    if (!(av.invincible > 0 && Math.floor(av.invincible / 6) % 2 === 0)) {
      const x0 = ox + av.x - B.P_HALF_W, y0 = oy + av.y - av.halfH;
      ctx.fillStyle = "#00ff88"; ctx.fillRect(x0, y0, B.P_HALF_W * 2, av.halfH * 2);
      ctx.strokeStyle = "#005522"; ctx.lineWidth = 2; ctx.strokeRect(x0 + 1, y0 + 1, B.P_HALF_W * 2 - 2, av.halfH * 2 - 2);
    }

    // HUD
    const label = b.isCpu ? "CPU" : "PLAYER";
    const status = b.gameOver ? "  GAME OVER" : "";
    const combo = b.comboCount >= 2 ? `   ${b.comboCount} COMBO` : "";
    const hearts = "♥".repeat(av.hp) + "♡".repeat(Math.max(0, B.AVATAR_MAX_HP - av.hp));
    ctx.textAlign = "left"; ctx.fillStyle = b.gameOver ? "#ff5555" : "#ffffff"; ctx.font = `bold 18px ${FONT}`;
    ctx.fillText(`${label}   SCORE:${b.score}   LINES:${b.linesClearedTotal}${combo}  HP:${hearts}${status}`, ox, oy - 12);

    // NEXT
    const nx0 = ox + W * cp + b.nextPanelGap, panelW = b.nextPanelW, panelH = cp * 5;
    ctx.strokeStyle = "#555577"; ctx.lineWidth = 2; ctx.strokeRect(nx0, oy, panelW, panelH);
    const centerX = nx0 + Math.floor(panelW / 2);
    ctx.textAlign = "center"; ctx.fillStyle = "#aaaaaa"; ctx.font = `bold 20px ${FONT}`;
    ctx.fillText("NEXT", centerX, oy + 30);
    const shape = b.nextData.shape, cs = b.nextCellSize;
    let minDx = Infinity, minDy = Infinity, maxDx = -Infinity, maxDy = -Infinity;
    for (const [dx, dy] of shape) { minDx = Math.min(minDx, dx); minDy = Math.min(minDy, dy); maxDx = Math.max(maxDx, dx); maxDy = Math.max(maxDy, dy); }
    const bw = (maxDx - minDx + 1) * cs, bh = (maxDy - minDy + 1) * cs;
    const nox = centerX - Math.floor(bw / 2) - minDx * cs;
    const noy = oy + 50 + Math.floor((panelH - 50 - bh) / 2) - minDy * cs;
    ctx.lineWidth = 1;
    for (const [dx, dy] of shape) {
      const x0 = nox + dx * cs, y0 = noy + dy * cs;
      ctx.fillStyle = b.nextData.color; ctx.fillRect(x0, y0, cs, cs);
      ctx.strokeStyle = b.nextData.outline; ctx.strokeRect(x0 + 0.5, y0 + 0.5, cs - 1, cs - 1);
    }
  }
}

root.Battle100F = Battle100F;
})(typeof self !== "undefined" ? self : globalThis);
