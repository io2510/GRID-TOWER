// ============================================================
// 描画
// ============================================================
function drawNextBlock(ctx, state) {
  const ndataSrc = (scene === "boss_70f") ? bossSys.boss70.nextBlockData : state.nextBlockData;
  if (!ndataSrc) return;
  const mapLeftX = GAME_RIGHT + 80; const mapRightX = SCREEN_WIDTH - 80; const mapCenterX = Math.floor((mapLeftX + mapRightX) / 2);
  const areaTop = GAME_TOP + 20; const areaH = 180;
  ctx.fillStyle = "#aaaaaa"; ctx.font = "bold 18px 'DotGothic16', sans-serif"; ctx.textAlign = "center"; ctx.fillText("NEXT", mapCenterX, areaTop + 35);

  const ndata = ndataSrc; const cellSize = 32;
  const minDx = Math.min(...ndata.shape.map(([dx]) => dx)), minDy = Math.min(...ndata.shape.map(([,dy]) => dy));
  const maxDx = Math.max(...ndata.shape.map(([dx]) => dx)), maxDy = Math.max(...ndata.shape.map(([,dy]) => dy));
  const blockW = (maxDx - minDx + 1) * cellSize, blockH = (maxDy - minDy + 1) * cellSize;
  const originX = mapCenterX - blockW / 2 - minDx * cellSize, originY = areaTop + 50 + (areaH - 50 - blockH) / 2 - minDy * cellSize;

  if (scene !== "boss_20f" && scene !== "boss_40f" && scene !== "boss_70f" && scene !== "boss_80f") {
    for (const [dx, dy] of ndata.shape) {
      ctx.fillStyle = ndata.color; ctx.fillRect(originX + dx * cellSize, originY + dy * cellSize, cellSize, cellSize);
      ctx.strokeStyle = ndata.outline; ctx.lineWidth = 1; ctx.strokeRect(originX + dx * cellSize, originY + dy * cellSize, cellSize, cellSize);
    }
  }
  ctx.strokeStyle = "#555555"; ctx.lineWidth = 1; ctx.strokeRect(mapLeftX, areaTop, mapRightX - mapLeftX, areaH);

  if (scene.startsWith("boss_")) {
    const placeholderTop = areaTop + areaH + 40; ctx.fillStyle = "#222233"; ctx.fillRect(mapLeftX, placeholderTop, mapRightX - mapLeftX, 300);
    ctx.strokeStyle = "red"; ctx.lineWidth = 2; ctx.strokeRect(mapLeftX, placeholderTop, mapRightX - mapLeftX, 300);
    ctx.fillStyle = "white"; ctx.font = "bold 14px 'DotGothic16', sans-serif"; ctx.textAlign = "center";
    const bossFileMap = { "boss_10f":"boss10.png", "boss_20f":"boss20.png", "boss_30f":"boss30.png", "boss_40f":"boss40.png", "boss_50f":"boss50.png", "boss_60f":"boss60.png", "boss_70f":"boss70.png", "boss_80f":"boss80.png" };
    let bossFile = bossFileMap[scene] || "boss_default.png";
    ctx.fillText("[ BOSS STANDING IMAGE ]", mapCenterX, placeholderTop + 145); ctx.fillText(`(assets/${bossFile})`, mapCenterX, placeholderTop + 170);
  }
}

// 60F: 水中戦・水流ギミック背景演出
function drawBoss60UnderwaterBg(ctx, state) {
  if (scene !== "boss_60f") return;
  const isUp = bossSys.isBoss60Upward();
  ctx.fillStyle = isUp ? "#003344" : "#001a2a";
  ctx.fillRect(GAME_LEFT, GAME_TOP, GAME_RIGHT - GAME_LEFT, GAME_BOTTOM - GAME_TOP);

  ctx.strokeStyle = "#005577"; ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const waveY = GAME_TOP + (i + 1) * ((GAME_BOTTOM - GAME_TOP) / 6);
    const offset = Math.sin(globalFrameCount * 0.05 + i) * 10;
    ctx.beginPath(); ctx.moveTo(GAME_LEFT, waveY + offset); ctx.lineTo(GAME_RIGHT, waveY - offset); ctx.stroke();
  }

  ctx.strokeStyle = "#88ccff"; ctx.lineWidth = 1;
  const numBubbles = isUp ? 14 : 8;
  for (let i = 0; i < numBubbles; i++) {
    const speed = isUp ? 4.5 : 0.5;
    const baseX = GAME_LEFT + 20 + (i * 73) % (GAME_RIGHT - GAME_LEFT - 40);
    const yOffset = (globalFrameCount * speed + i * 123) % (GAME_BOTTOM - GAME_TOP);
    const by = GAME_BOTTOM - yOffset;
    const bx = baseX + Math.sin(globalFrameCount * 0.03 + i) * 15;
    ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.stroke();
  }

  if (isUp) {
    const streakColors = ["#aaeeff", "#cff5ff", "#eafcff"];
    for (let i = 0; i < 10; i++) {
      const speed = 9.0 + (i % 3) * 1.5;
      const baseX = GAME_LEFT + 15 + (i * 97) % (GAME_RIGHT - GAME_LEFT - 30);
      const yOffset = (globalFrameCount * speed + i * 211) % (GAME_BOTTOM - GAME_TOP + 46);
      const syBottom = GAME_BOTTOM - yOffset;
      ctx.strokeStyle = streakColors[i % streakColors.length]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(baseX, syBottom); ctx.lineTo(baseX, syBottom - 46); ctx.stroke();
    }
  }
}

// 70F: シーソーの土台・積みブロック・アクティブブロックを描画
// 80F: トゲ・ゴール(文字なし)・生成された足場の描画
function drawBoss80Stage(ctx, state) {
  if (scene !== "boss_80f") return;
  const flash = Math.floor(Date.now() / 250) % 2 === 0;
  for (let gy = 0; gy < MAP_HEIGHT; gy++) {
    for (let gx = 0; gx < MAP_WIDTH; gx++) {
      const val = state.blockMap[gy][gx];
      if (val === 0) continue;
      const x0 = GAME_LEFT + gx * GRID_SIZE, y0 = GAME_TOP + gy * GRID_SIZE, x1 = x0 + GRID_SIZE, y1 = y0 + GRID_SIZE;
      if (val === SPIKE_ID) {
        ctx.fillStyle = "#4a101b"; ctx.fillRect(x0 + 1, y0 + 1, GRID_SIZE - 2, GRID_SIZE - 2);
        ctx.strokeStyle = "#d93d59"; ctx.lineWidth = 2; ctx.strokeRect(x0 + 1, y0 + 1, GRID_SIZE - 2, GRID_SIZE - 2);
        ctx.fillStyle = flash ? "#ff3d5a" : "#d92848";
        ctx.beginPath(); ctx.moveTo(x0 + 3, y1 - 3); ctx.lineTo(x0 + GRID_SIZE / 2, y0 + 5); ctx.lineTo(x1 - 3, y1 - 3); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#ffb0bc"; ctx.lineWidth = 1; ctx.stroke();
      } else if (val === 9999) {
        // ゴール(本家にある "GOAL" の文字は描かない)
        ctx.fillStyle = flash ? "#fff34d" : "#c9a900"; ctx.fillRect(x0 + 1, y0 + 1, GRID_SIZE - 2, GRID_SIZE - 2);
        ctx.strokeStyle = "#fffbd0"; ctx.lineWidth = 2; ctx.strokeRect(x0 + 1, y0 + 1, GRID_SIZE - 2, GRID_SIZE - 2);
      } else if (is_fixed_terrain(val)) {
        ctx.fillStyle = "#4b5368"; ctx.fillRect(x0, y0, GRID_SIZE, GRID_SIZE);
        ctx.strokeStyle = "#9ba8c4"; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, GRID_SIZE, GRID_SIZE);
      }
    }
  }
  const plats = bossSys.getBoss80Platforms(), hasStart = bossSys.hasBoss80StartPlatform();
  plats.forEach(([px0, py0, px1, py1], i) => {
    const isStart = i === 0 && hasStart;
    ctx.fillStyle = isStart ? "#3b9d72" : "#2eaa8a"; ctx.fillRect(px0, py0, px1 - px0, py1 - py0);
    ctx.strokeStyle = isStart ? "#b8ffcf" : "#7affdc"; ctx.lineWidth = 2; ctx.strokeRect(px0, py0, px1 - px0, py1 - py0);
  });
}

function drawBoss70Stage(ctx, state) {
  if (scene !== "boss_70f") return;
  const targetY = (bossSys.boss70.phase === 1) ? GAME_TOP + 7 * GRID_SIZE : GAME_TOP + 5 * GRID_SIZE;
  ctx.strokeStyle = "#ff3333"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(GAME_LEFT, targetY); ctx.lineTo(GAME_RIGHT, targetY); ctx.stroke();
  ctx.fillStyle = "#ff3333"; ctx.font = "bold 14px 'DotGothic16', sans-serif"; ctx.textAlign = "left";
  ctx.fillText(`TARGET LINE (PHASE ${bossSys.boss70.phase})`, GAME_LEFT + 60, targetY - 15);

  // 支柱
  ctx.fillStyle = "#222222"; ctx.strokeStyle = "white"; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(SEESAW_PIVOT_X, SEESAW_PIVOT_Y);
  ctx.lineTo(SEESAW_PIVOT_X - 40, GAME_BOTTOM);
  ctx.lineTo(SEESAW_PIVOT_X + 40, GAME_BOTTOM);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // 板・置いたブロックは、物理エンジン上の剛体の形(頂点)をそのまま描く。
  // 置いたブロックはテトリミノ1個が1つの剛体なので、塊のまま傾き、滑り、落ちる。
  const render = bossSys.getBoss70RenderData();
  if (render) {
    const drawPoly = (poly) => {
      const p = poly.points;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      ctx.closePath(); ctx.fillStyle = poly.fill; ctx.fill();
      ctx.strokeStyle = poly.outline; ctx.lineWidth = 1.5; ctx.stroke();
    };
    for (const poly of render.seesawPolygons) drawPoly(poly);
    for (const poly of render.placedPolygons) drawPoly(poly);
  }

  // アクティブブロック（落下中、自身の角度で回転）
  const active = bossSys.boss70.activeBlock;
  if (active && bossSys.boss70.spawnDelayTimer === 0) {
    const rad = active.angleDeg * Math.PI / 180.0, cA = Math.cos(rad), sA = Math.sin(rad);
    for (const [lx, ly] of active.getCellLocalCenters()) {
      const rx = lx * cA - ly * sA + active.x, ry = lx * sA + ly * cA + active.y;
      const hw = GRID_SIZE / 2.0, hh = GRID_SIZE / 2.0;
      const corners = [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([dx,dy]) => [dx*cA - dy*sA + rx, dx*sA + dy*cA + ry]);
      ctx.beginPath(); ctx.moveTo(corners[0][0], corners[0][1]);
      for (let i=1;i<corners.length;i++) ctx.lineTo(corners[i][0], corners[i][1]);
      ctx.closePath(); ctx.fillStyle = active.color; ctx.fill(); ctx.strokeStyle = active.outline; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
}

function drawGame(ctx, state, fb, player, beam, hideFallingBlock = false, forceBeamActive = false) {
  drawBoss60UnderwaterBg(ctx, state);
  if (state.bgAnim && state.bgAnim.active) {
    ctx.save(); ctx.beginPath(); ctx.rect(GAME_LEFT, GAME_TOP, GAME_RIGHT - GAME_LEFT, GAME_BOTTOM - GAME_TOP); ctx.clip();
    ctx.fillStyle = state.bgAnim.color; ctx.font = "bold 130px 'DotGothic16', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(state.bgAnim.text, (GAME_LEFT + GAME_RIGHT) / 2, state.bgAnim.y); ctx.restore();
  }

  // グリッド
  ctx.strokeStyle = "#333333"; ctx.lineWidth = 1; ctx.setLineDash([8, 10]);
  for (let gx = 0; gx <= MAP_WIDTH; gx++) { ctx.beginPath(); ctx.moveTo(GAME_LEFT + gx * GRID_SIZE, GAME_TOP); ctx.lineTo(GAME_LEFT + gx * GRID_SIZE, GAME_BOTTOM); ctx.stroke(); }
  for (let gy = 0; gy <= MAP_HEIGHT; gy++) { ctx.beginPath(); ctx.moveTo(GAME_LEFT, GAME_TOP + gy * GRID_SIZE); ctx.lineTo(GAME_RIGHT, GAME_TOP + gy * GRID_SIZE); ctx.stroke(); }
  ctx.setLineDash([]);

  // ビーム
  if (scene !== "boss_20f" && scene !== "boss_40f" && scene !== "boss_70f" && scene !== "boss_80f") {
    let currentCycle = getBeamCycle(state.floor); if (scene === "boss_10f") currentCycle = 1800;
    if (forceBeamActive || currentCycle !== Infinity || bossSys.isBossActive) {
      if (beam.phase === "warning" && beam.blinkOn) { ctx.fillStyle = "#550000"; ctx.fillRect(GAME_LEFT + beam.col * GRID_SIZE, GAME_TOP, BEAM_WIDTH * GRID_SIZE, GAME_BOTTOM - GAME_TOP); }
      if (beam.phase === "firing") {
        ctx.fillStyle = "#ff2200"; ctx.fillRect(GAME_LEFT + beam.col * GRID_SIZE, GAME_TOP, BEAM_WIDTH * GRID_SIZE, GAME_BOTTOM - GAME_TOP);
        ctx.fillStyle = "#ffffff"; ctx.fillRect(GAME_LEFT + beam.col * GRID_SIZE + 4, GAME_TOP, BEAM_WIDTH * GRID_SIZE - 8, GAME_BOTTOM - GAME_TOP);
      }
    }
  }

  // 30F ビーム
  if (scene === "boss_30f") {
    if (bossSys.bigBeamPhase === "warning" && Math.floor(bossSys.bigBeamTimer / 4) % 2 === 0) { ctx.fillStyle = "#661111"; ctx.fillRect(GAME_LEFT + GRID_SIZE, GAME_TOP, (MAP_WIDTH - 2) * GRID_SIZE, GAME_BOTTOM - GAME_TOP); }
    if (bossSys.bigBeamPhase === "firing") {
      ctx.fillStyle = "#ff2200"; ctx.fillRect(GAME_LEFT + GRID_SIZE, GAME_TOP, (MAP_WIDTH - 2) * GRID_SIZE, GAME_BOTTOM - GAME_TOP);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(GAME_LEFT + GRID_SIZE + 6, GAME_TOP, (MAP_WIDTH - 2) * GRID_SIZE - 12, GAME_BOTTOM - GAME_TOP);
    }
  }

  // 40F ビーム
  if (scene === "boss_40f") {
    let blink = Math.floor(Date.now() / 130) % 2 === 0;
    for (let cx of bossSys.boss40ActiveCols) {
      if (bossSys.boss40LaserPhase === "warning" && blink) { ctx.fillStyle = "#550000"; ctx.fillRect(GAME_LEFT + cx * GRID_SIZE, GAME_TOP, GRID_SIZE, GAME_BOTTOM - GAME_TOP); }
      else if (bossSys.boss40LaserPhase === "firing") { ctx.fillStyle = "#ff2200"; ctx.fillRect(GAME_LEFT + cx * GRID_SIZE, GAME_TOP, GRID_SIZE, GAME_BOTTOM - GAME_TOP); ctx.fillStyle = "#ffffff"; ctx.fillRect(GAME_LEFT + cx * GRID_SIZE + 6, GAME_TOP, GRID_SIZE - 12, GAME_BOTTOM - GAME_TOP); }
    }
    for (let cy of bossSys.boss40ActiveRows) {
      if (bossSys.boss40LaserPhase === "warning" && blink) { ctx.fillStyle = "#550000"; ctx.fillRect(GAME_LEFT, GAME_TOP + cy * GRID_SIZE, GAME_RIGHT - GAME_LEFT, GRID_SIZE); }
      else if (bossSys.boss40LaserPhase === "firing") { ctx.fillStyle = "#ff2200"; ctx.fillRect(GAME_LEFT, GAME_TOP + cy * GRID_SIZE, GAME_RIGHT - GAME_LEFT, GRID_SIZE); ctx.fillStyle = "#ffffff"; ctx.fillRect(GAME_LEFT + 6, GAME_TOP + cy * GRID_SIZE + 6, GAME_RIGHT - GAME_LEFT - 12, GRID_SIZE - 12); }
    }
  }

  // 盤面ブロック
  let goalFlash = Math.floor(Date.now() / 250) % 2 === 0;
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      let val = state.blockMap[y][x];
      if (scene === "boss_80f") continue; // 80Fは drawBoss80Stage で描く
      if (val === 9999) {
        ctx.fillStyle = goalFlash ? "#ffff33" : "#cccc00"; ctx.fillRect(GAME_LEFT + x * GRID_SIZE, GAME_TOP + y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
        ctx.strokeStyle = "#ffffbb"; ctx.lineWidth = 1; ctx.strokeRect(GAME_LEFT + x * GRID_SIZE, GAME_TOP + y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
      } else if (val >= 1) {
        let shapeId = Math.floor(val / 1000);
        let col = is_fixed_terrain(val) ? { fill:"gray", outline:"#444444" } : (BLOCK_COLOR_MAP[shapeId] || { fill:"#888888", outline:"#444444" });
        ctx.fillStyle = col.fill; ctx.fillRect(GAME_LEFT + x * GRID_SIZE, GAME_TOP + y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
        ctx.strokeStyle = col.outline; ctx.lineWidth = 1; ctx.strokeRect(GAME_LEFT + x * GRID_SIZE, GAME_TOP + y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
        
        // 【50Fボス専用追加分】固定盤面の反転ブロックに対しても渦巻き模様を描写
        if (!is_fixed_terrain(val) && (shapeId === 19 || shapeId === 20 || shapeId === 21)) {
          let cellCx = GAME_LEFT + x * GRID_SIZE + GRID_SIZE / 2;
          let cellCy = GAME_TOP + y * GRID_SIZE + GRID_SIZE / 2;
          drawSwirlCell(ctx, cellCx, cellCy, shapeId, globalFrameCount);
        }
      }
    }
  }

  // 30F パズルお題オーバーレイ
  if (scene === "boss_30f" && bossSys.puzzleMap) {
    let blink = Math.floor(Date.now() / 100) % 2 === 0;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        let pval = bossSys.puzzleMap[y][x]; if (pval === 0 || state.blockMap[y][x] >= 1) continue;
        ctx.save(); ctx.globalAlpha = 0.5;
        if (pval === PUZZLE_BLUE_ID) { ctx.fillStyle = "#2255ff"; ctx.fillRect(GAME_LEFT + x * GRID_SIZE + 2, GAME_TOP + y * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4); ctx.strokeStyle = "#77aaff"; ctx.strokeRect(GAME_LEFT + x * GRID_SIZE + 2, GAME_TOP + y * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4); }
        else if (pval === PUZZLE_RED_ID) { if (!bossSys.trapActive || blink) { ctx.fillStyle = !bossSys.trapActive ? "#ff2222" : "#ffffff"; ctx.fillRect(GAME_LEFT + x * GRID_SIZE + 2, GAME_TOP + y * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4); ctx.strokeStyle = "#ff8888"; ctx.strokeRect(GAME_LEFT + x * GRID_SIZE + 2, GAME_TOP + y * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4); } }
        ctx.restore();
      }
    }
  }

  drawBoss70Stage(ctx, state);
  drawBoss80Stage(ctx, state);

  // 落下ブロック
  if (!hideFallingBlock && scene !== "boss_20f" && scene !== "boss_40f" && scene !== "boss_70f" && scene !== "boss_80f") {
    let gc = fb.getGhostCells(state);
    if (gc.length > 0) {
      let gf = darkenColor(fb.color, 0.28), go = darkenColor(fb.outline || fb.color, 0.45), fbc = new Set(fb.getCells().map(([x,y]) => `${x},${y}`));
      for (const [gx,gy] of gc) {
        if (fbc.has(`${gx},${gy}`)) continue; ctx.fillStyle = gf; ctx.fillRect(GAME_LEFT + gx * GRID_SIZE + 2, GAME_TOP + gy * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4);
        ctx.strokeStyle = go; ctx.lineWidth = 2; ctx.strokeRect(GAME_LEFT + gx * GRID_SIZE + 2, GAME_TOP + gy * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4);
      }
    }
    for (const [gx,gy] of fb.getCells()) { 
      ctx.fillStyle = fb.color; ctx.fillRect(GAME_LEFT + gx * GRID_SIZE, GAME_TOP + gy * GRID_SIZE, GRID_SIZE, GRID_SIZE); ctx.strokeStyle = fb.outline; ctx.lineWidth = 1; ctx.strokeRect(GAME_LEFT + gx * GRID_SIZE, GAME_TOP + gy * GRID_SIZE, GRID_SIZE, GRID_SIZE); 
      
      // 【50Fボス専用追加分】落下中の反転ブロック(19〜21)への渦巻き描画
      if (fb.shapeId === 19 || fb.shapeId === 20 || fb.shapeId === 21) {
        let cellCx = GAME_LEFT + gx * GRID_SIZE + GRID_SIZE / 2;
        let cellCy = GAME_TOP + gy * GRID_SIZE + GRID_SIZE / 2;
        drawSwirlCell(ctx, cellCx, cellCy, fb.shapeId, globalFrameCount);
      }
    }
  }

  // プレイヤー
  if (player.blinkVisible) {
    const drawHalfH = player.isCrouching ? CROUCH_P_HALF_H : P_HALF_H;
    ctx.fillStyle = player.invincible > 0 ? "#ffaaaa" : "lightgreen"; ctx.fillRect(player.x - P_HALF_W, player.y - drawHalfH, P_HALF_W * 2, drawHalfH * 2);
    ctx.strokeStyle = "white"; ctx.lineWidth = 1; ctx.strokeRect(player.x - P_HALF_W, player.y - drawHalfH, P_HALF_W * 2, drawHalfH * 2);
  }

  // 警告
  if (scene !== "boss_20f" && scene !== "boss_40f" && scene !== "boss_70f" && scene !== "boss_80f" && beam.phase === "warning") {
    ctx.fillStyle = "#111111"; ctx.fillRect((GAME_LEFT + GAME_RIGHT) / 2 - 300, GAME_TOP + 20, 600, 90);
    ctx.strokeStyle = "#ff3333"; ctx.lineWidth = 2; ctx.strokeRect((GAME_LEFT + GAME_RIGHT) / 2 - 300, GAME_TOP + 20, 600, 90);
    ctx.fillStyle = "#ff3333"; ctx.font = "bold 16px 'DotGothic16', sans-serif"; ctx.textAlign = "center";
    ctx.fillText(scene === "boss_10f" ? "⚠ BOSS BEAM INBOUND ⚠" : "⚠ WARNING: BEAM INBOUND ⚠", (GAME_LEFT + GAME_RIGHT) / 2, GAME_TOP + 72);
  }

  // HUD 左側
  const canvasX = Math.floor((40 + GAME_LEFT - 40) / 2); ctx.fillStyle = "white"; ctx.font = "bold 28px 'DotGothic16', sans-serif"; ctx.textAlign = "center";
  ctx.fillText("SCORE", canvasX, GAME_TOP + 80); ctx.fillText(state.score, canvasX, GAME_TOP + 120);

  if (scene === "boss_10f") {
    ctx.fillStyle = "red"; ctx.font = "bold 20px 'DotGothic16', sans-serif"; ctx.fillText("BOSS HEALTH", canvasX, GAME_TOP + 240);
    ctx.fillStyle = "white"; ctx.font = "bold 24px 'DotGothic16', sans-serif"; ctx.fillText(`${bossSys.bossHp} / 8 LINES`, canvasX, GAME_TOP + 290);
  } else if (scene === "boss_20f") {
    ctx.fillStyle = "yellow"; ctx.font = "bold 22px 'DotGothic16', sans-serif"; ctx.fillText("LIMIT TIME", canvasX, GAME_TOP + 240);
    ctx.fillStyle = (bossSys.bossTimer < 300) ? "red" : "white"; ctx.font = "bold 24px 'DotGothic16', sans-serif"; ctx.fillText(`REMAIN: ${(bossSys.bossTimer / 60).toFixed(2)}s`, canvasX, GAME_TOP + 290);
    ctx.fillStyle = "#00eeff"; ctx.font = "bold 15px 'DotGothic16', sans-serif"; ctx.fillText("右上の黄色いゴールへ到達せよ！", canvasX, GAME_TOP + 400); ctx.fillText("【クリア特典】 HP全回復", canvasX, GAME_TOP + 430);
  } else if (scene === "boss_30f") {
    ctx.fillStyle = "red"; ctx.font = "bold 20px 'DotGothic16', sans-serif"; ctx.fillText("BOSS HEALTH", canvasX, GAME_TOP + 210);
    ctx.fillStyle = "white"; ctx.font = "bold 22px 'DotGothic16', sans-serif"; ctx.fillText(`${bossSys.bossHp} / 3 SECTIONS`, canvasX, GAME_TOP + 250);
    ctx.fillStyle = "yellow"; ctx.font = "bold 18px 'DotGothic16', sans-serif"; ctx.fillText("LIMIT TIME", canvasX, GAME_TOP + 300);
    ctx.fillStyle = "white"; ctx.font = "bold 22px 'DotGothic16', sans-serif"; ctx.fillText(`REMAIN: ${(bossSys.boss30Timer / 60).toFixed(2)}s`, canvasX, GAME_TOP + 340);
    if (bossSys.trapActive) { ctx.fillStyle = "#ff3333"; ctx.font = "bold 20px 'DotGothic16', sans-serif"; ctx.fillText("⚠ TRAP ARMED ⚠", canvasX, GAME_TOP + 400); ctx.fillText(`${(bossSys.trapTimer / 60).toFixed(2)}s`, canvasX, GAME_TOP + 440); }
    ctx.fillStyle = "#00eeff"; ctx.font = "bold 14px 'DotGothic16', sans-serif"; ctx.fillText("青マスをお題通りに埋めろ！", canvasX, GAME_TOP + 540); ctx.fillText("赤マスを埋めると罠ビーム発動", canvasX, GAME_TOP + 570); ctx.fillText("安全地帯は左右両端のみ", canvasX, GAME_TOP + 600);
  } else if (scene === "boss_40f") {
    ctx.fillStyle = "yellow"; ctx.font = "bold 22px 'DotGothic16', sans-serif"; ctx.fillText("SURVIVAL TIME", canvasX, GAME_TOP + 240);
    ctx.fillStyle = "white"; ctx.font = "bold 24px 'DotGothic16', sans-serif"; ctx.fillText(`SURVIVE: ${(bossSys.bossTimer / 60).toFixed(2)}s`, canvasX, GAME_TOP + 290);
    ctx.fillStyle = "#00eeff"; ctx.font = "bold 15px 'DotGothic16', sans-serif"; ctx.fillText("複合レーザーの猛攻を耐え抜け！", canvasX, GAME_TOP + 400); ctx.fillText("60秒間生存でクリア", canvasX, GAME_TOP + 430);
  } else if (scene === "boss_50f") {
    // 【50Fボス専用追加分】左パネル専用UI表示構成
    let effects = bossSys.getPlayerStatusEffects(state);
    let phaseNames = {1: "BLUE (R-Invert)", 2: "RED (B-Invert)", 3: "PURPLE (P-Invert)"};
    ctx.fillStyle = "#ff00ff"; ctx.font = "bold 20px 'DotGothic16', sans-serif"; ctx.fillText("50F BOSS TASK", canvasX, GAME_TOP + 200);
    ctx.fillStyle = "white"; ctx.font = "bold 18px 'DotGothic16', sans-serif"; ctx.fillText(`PHASE ${bossSys.boss50Phase} / 3\n[${phaseNames[bossSys.boss50Phase] || "END"}]`, canvasX, GAME_TOP + 240);
    
    if (!bossSys.boss50PhaseBlockLocked) {
      ctx.fillStyle = "yellow"; ctx.font = "bold 16px 'DotGothic16', sans-serif"; ctx.fillText("TARGET INBOUND...", canvasX, GAME_TOP + 310);
    } else {
      ctx.fillStyle = "#00eeff"; ctx.font = "bold 16px 'DotGothic16', sans-serif"; ctx.fillText(`TARGET CELLS\nREMAIN: ${bossSys.boss50TargetRemaining} px`, canvasX, GAME_TOP + 310);
    }

    // デバフ警告点滅インジケータ
    if (Math.floor(Date.now() / 250) % 2 === 0) {
      ctx.fillStyle = "red"; ctx.font = "bold 16px 'DotGothic16', sans-serif";
      if (effects.blockReversed && effects.playerReversed) ctx.fillText("⚠ ALL CONTROLS REVERSED ⚠", canvasX, GAME_TOP + 390);
      else if (effects.blockReversed) { ctx.fillStyle = "#0055ff"; ctx.fillText("⚠ BLOCK MOVE REVERSED ⚠", canvasX, GAME_TOP + 390); }
      else if (effects.playerReversed) ctx.fillText("⚠ PLAYER MOVE REVERSED ⚠", canvasX, GAME_TOP + 390);
    }

    ctx.fillStyle = "#aaaacc"; ctx.font = "bold 13px 'DotGothic16', sans-serif";
    let binst = ["50F BOSS MISSION", "", "各フェーズの特殊形状", "アルファベットブロックを", "ライン消去等で全破壊せよ！", "", "盤面にブロックがある間は", "対応した操作軸が反転デバフ！", "※反転ブロックは回転不可"];
    binst.forEach((l, i) => ctx.fillText(l, canvasX, GAME_TOP + 450 + i * 22));

    // 【50Fボス専用】このボス戦中に新たに獲得したコンボブロックのみ使用可能
    let comboY = GAME_TOP + 450 + binst.length * 22 + 20;
    if (state.boss50ComboEverActivated) {
      if (state.boss50ComboCount >= 1) { ctx.fillStyle = "#ff4400"; ctx.font = "bold 22px 'DotGothic16', sans-serif"; ctx.fillText(`${state.boss50ComboCount} COMBO!!`, canvasX, comboY); }
      ctx.fillStyle = "#ffcc00"; ctx.font = "bold 14px 'DotGothic16', sans-serif"; ctx.fillText("COMBO BLOCKS (BOSS)", canvasX, comboY + 32);
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 32px 'DotGothic16', sans-serif"; ctx.fillText(`${state.boss50ComboBlocks}`, canvasX, comboY + 68);
      ctx.fillStyle = "#00eeff"; ctx.font = "bold 13px 'DotGothic16', sans-serif"; ctx.fillText("[W] コンボブロック使用", canvasX, comboY + 92);
    }
  } else if (scene === "boss_60f") {
    ctx.fillStyle = "#00aaff"; ctx.font = "bold 18px 'DotGothic16', sans-serif"; ctx.fillText("60F BOSS TASK", canvasX, GAME_TOP + 220);
    let flowColor = bossSys.boss60Flow === "down" ? "#00eeff" : "#ff8800";
    ctx.fillStyle = flowColor; ctx.font = "bold 22px 'DotGothic16', sans-serif"; ctx.fillText(`FLOW: ${bossSys.getBoss60FlowDisplay()}`, canvasX, GAME_TOP + 260);
    ctx.fillStyle = "white"; ctx.font = "bold 18px 'DotGothic16', sans-serif"; ctx.fillText(`PHASE ${bossSys.getBoss60PhaseDisplay()}`, canvasX, GAME_TOP + 300);
    ctx.fillStyle = "#00eeff"; ctx.font = "bold 18px 'DotGothic16', sans-serif"; ctx.fillText(`LINES ${bossSys.getBoss60LinesDisplay()}`, canvasX, GAME_TOP + 340);
    if (bossSys.isBoss60Transition()) { ctx.fillStyle = "#ff3333"; ctx.font = "bold 20px 'DotGothic16', sans-serif"; ctx.fillText("⚠ CURRENT SHIFTING! ⚠", canvasX, GAME_TOP + 400); }
    ctx.fillStyle = "#aaaacc"; ctx.font = "bold 13px 'DotGothic16', sans-serif";
    let b60 = ["60F BOSS MISSION", "", "水中ステージを攻略せよ！", "", "【下向き水流】", "ブロックは上から落下", "Spaceでジャンプ", "", "【上向き水流】", "ブロックは下から浮上", "Sキーで潜り（下方向ジャンプ）", "↑で速度上昇、↓でハードドロップ", "", "【クリア条件】", "4列消去×4回（計16列）"];
    b60.forEach((l, i) => ctx.fillText(l, canvasX, GAME_TOP + 460 + i * 20));
  } else if (scene === "boss_80f") {
    ctx.fillStyle = "#ff6677"; ctx.font = "bold 20px 'DotGothic16', sans-serif"; ctx.fillText("80F SPIKE MISSION", canvasX, GAME_TOP + 220);
    ctx.fillStyle = "#8dffb0"; ctx.font = "bold 18px 'DotGothic16', sans-serif"; ctx.fillText(`PLATFORMS: ${bossSys.getBoss80CreatedPlatformCount()}`, canvasX, GAME_TOP + 275);
    ctx.fillStyle = "#d9e7ff"; ctx.font = "bold 16px 'DotGothic16', sans-serif";
    ["トゲを避けつつ", "右上のゴールへ到達せよ！", "", "被弾地点に足場が生成される", "生成された足場は安全に乗れる", "", "赤いトゲに触れるとダメージ", "左下の初期地点へリスポーン"].forEach((l, i) => ctx.fillText(l, canvasX, GAME_TOP + 340 + i * 26));
  } else if (scene === "boss_70f") {
    ctx.fillStyle = "#ffcc00"; ctx.font = "bold 18px 'DotGothic16', sans-serif"; ctx.fillText("70F SEESAW TASK", canvasX, GAME_TOP + 220);
    let tiltDeg = bossSys.boss70.angle * 180 / Math.PI;
    let tiltCol = Math.abs(tiltDeg) < 20.0 ? "lightgreen" : "#ff3333";
    ctx.fillStyle = tiltCol; ctx.font = "bold 22px 'DotGothic16', sans-serif"; ctx.fillText(`ANGLE: ${tiltDeg >= 0 ? "+" : ""}${tiltDeg.toFixed(1)}°`, canvasX, GAME_TOP + 260);
    ctx.fillStyle = "white"; ctx.font = "bold 18px 'DotGothic16', sans-serif"; ctx.fillText(`PHASE: ${bossSys.boss70.phase} / 2`, canvasX, GAME_TOP + 300);
    let holdSec = Math.max(0, bossSys.boss70.winTimer / 60.0);
    let timerCol = bossSys.boss70.winTimer < 180 ? "#00eeff" : "white";
    ctx.fillStyle = timerCol; ctx.font = "bold 18px 'DotGothic16', sans-serif"; ctx.fillText(`CLEAR HOLD: ${holdSec.toFixed(2)}s`, canvasX, GAME_TOP + 340);
    ctx.fillStyle = "#aaaacc"; ctx.font = "bold 13px 'DotGothic16', sans-serif";
    let b70 = ["70F BOSS MISSION", "", "シーソーの均衡を保ちつつ", "積んだブロックを登れ！", "", "【フェーズ1】", "上空5マスの赤ラインに", "3秒間到達で進展！", "", "【フェーズ2】", "上空3マスの赤ラインに", "3秒間到達で撃破！", "", "※新しいブロックの出現・", "着地に巻き込まれるとダメージ！"];
    b70.forEach((l, i) => ctx.fillText(l, canvasX, GAME_TOP + 460 + i * 20));
  }

  if (!scene.startsWith("boss_") && state.comboEverActivated) {
    if (state.comboCount >= 1) { ctx.fillStyle = "#ff4400"; ctx.font = "bold 40px 'DotGothic16', sans-serif"; ctx.fillText(`${state.comboCount} COMBO!!`, canvasX, GAME_TOP + 260); }
    ctx.fillStyle = "#ffcc00"; ctx.font = "bold 18px 'DotGothic16', sans-serif"; ctx.fillText("COMBO BLOCKS", canvasX, GAME_TOP + 340);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 64px 'DotGothic16', sans-serif"; ctx.fillText(`${state.comboBlocks}`, canvasX, GAME_TOP + 410);
    ctx.fillStyle = "#00eeff"; ctx.font = "bold 15px 'DotGothic16', sans-serif"; ctx.fillText("[W] コンボブロック使用", canvasX, GAME_TOP + 570);
  } else if (!scene.startsWith("boss_")) {
    ctx.fillStyle = "#aaaaaa"; ctx.font = "bold 13px 'DotGothic16', sans-serif";
    let ct = ["CONTROLS","", "[A]/[D]: プレイヤー移動", "[Space]: ジャンプ", "[S]: しゃがみ", "[↓]: ブロック加速", "[↑]: ハードドロップ", "[←]/[→]: ブロック移動", "[Q]/[E]: ブロック回転", "[W]: コンボブロック使用", "[Esc]: ポーズ"];
    ct.forEach((l, i) => ctx.fillText(l, canvasX, GAME_TOP + 240 + i * 22));
  }

  const hpY = GAME_BOTTOM - 120;
  if (scene === "boss_80f") {
    // 80F: HP20 を 5個×4行で表示
    const maxHp = BOSS80_MAX_HP, perRow = 5, rowGap = 45, rows = Math.ceil(maxHp / perRow);
    const startY = hpY - (rows - 1) * rowGap / 2;
    ctx.fillStyle = "cyan"; ctx.font = "bold 16px 'DotGothic16', sans-serif"; ctx.fillText("PLAYER HEALTH", canvasX, startY - 50);
    ctx.font = "bold 38px 'DotGothic16', sans-serif";
    for (let i = 0; i < maxHp; i++) {
      const row = Math.floor(i / perRow), col = i % perRow, inRow = Math.min(perRow, maxHp - row * perRow);
      const sx = canvasX - (inRow - 1) * 25;
      ctx.fillStyle = i < player.hp ? "#ff3333" : "#444444"; ctx.fillText("♥", sx + col * 50, startY + row * rowGap + 10);
    }
  } else {
    ctx.fillStyle = "cyan"; ctx.font = "bold 16px 'DotGothic16', sans-serif"; ctx.fillText("PLAYER HEALTH", canvasX, hpY - 40);
    for (let i = 0; i < MAX_HP; i++) { let sx = canvasX - (MAX_HP - 1) * 25; ctx.fillStyle = i < player.hp ? "#ff3333" : "#444444"; ctx.font = "bold 38px 'DotGothic16', sans-serif"; ctx.fillText("♥", sx + i * 50, hpY + 10); }
  }

  // HUD 右側 (階層マップ)
  const mapLeftX = GAME_RIGHT + 80, mapRightX = SCREEN_WIDTH - 80, mapCenterX = Math.floor((mapLeftX + mapRightX) / 2);
  const baseY = 960, floorGap = 140, startF = Math.max(1, state.floor - 1), endF = startF + 5;
  for (let f = startF; f <= endF; f++) {
    const fy = baseY - (f - startF) * floorGap; if (fy < GAME_TOP + 230) continue;
    let lineCol = f === state.floor ? "yellow" : "#444444", textCol = f === state.floor ? "yellow" : "gray";
    ctx.strokeStyle = lineCol; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mapLeftX + 80, fy); ctx.lineTo(mapRightX - 100, fy); ctx.stroke();
    ctx.fillStyle = textCol; ctx.font = "bold 24px 'DotGothic16', sans-serif"; ctx.textAlign = "left";
    let fText = f === 10 ? "10F(BOSS)" : f === 20 ? "20F(BOSS)" : f === 30 ? "30F(BOSS)" : f === 40 ? "40F(BOSS)" : f === 50 ? "50F(BOSS)" : `${f} F`; // 【50F追加】
    ctx.fillText(fText, mapLeftX + 30, fy + 8);
    if (f === state.floor) {
      ctx.fillStyle = "#ff3333"; ctx.font = "bold 16px 'DotGothic16', sans-serif"; ctx.textAlign = "right"; ctx.fillText("◆ NOW", mapRightX - 40, fy + 5);
    }
  }

  drawNextBlock(ctx, state);
  ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.strokeRect(GAME_LEFT, GAME_TOP, GAME_RIGHT - GAME_LEFT, GAME_BOTTOM - GAME_TOP);
  ctx.strokeStyle = "cyan"; ctx.lineWidth = 1; ctx.strokeRect(40, GAME_TOP, GAME_LEFT - 80, GAME_BOTTOM - GAME_TOP);
  ctx.strokeStyle = "yellow"; ctx.lineWidth = 2; ctx.strokeRect(GAME_RIGHT + 40, GAME_TOP, SCREEN_WIDTH - GAME_RIGHT - 80, GAME_BOTTOM - GAME_TOP);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const paragraphs = text.split("\n"); const totalLines = paragraphs.length; const startY = y - ((totalLines - 1) * lineHeight) / 2;
  paragraphs.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight));
}

function tutDrawOverlay(ctx, tutState, width, height, gameLeft, gameTop, gameRight, gameBottom) {
  const sd = tutState.currentStepData(); if (!sd) return; const cx = width / 2;
  if (sd.highlight === "ui" && Math.floor(tutState.stepTimer / 20) % 2 === 0) {
    ctx.strokeStyle = "yellow"; ctx.lineWidth = 6; ctx.strokeRect(40, gameTop, gameLeft - 80, gameBottom - gameTop); ctx.strokeRect(gameRight + 40, gameTop, width - gameRight - 80, gameBottom - gameTop);
  } else if (sd.highlight === "warning") { ctx.strokeStyle = "yellow"; ctx.lineWidth = 4; ctx.setLineDash([10, 10]); ctx.strokeRect(cx - 300, gameTop + 20, 600, 90); ctx.setLineDash([]); }
  else if (sd.highlight === "player") { ctx.strokeStyle = "#00ff88"; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.strokeRect(gameLeft, gameTop, gameRight - gameLeft, gameBottom - gameTop); ctx.setLineDash([]); }
  else if (sd.highlight === "block") { ctx.strokeStyle = "#ffaa00"; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.strokeRect(gameLeft, gameTop, gameRight - gameLeft, 200); ctx.setLineDash([]); }

  const panelW = 820, panelH = 170, panelX0 = cx - panelW / 2, panelY0 = gameTop + 130, panelY1 = panelY0 + panelH;
  ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(panelX0, panelY0, panelW, panelH);
  ctx.strokeStyle = "#00eeff"; ctx.lineWidth = 2; ctx.strokeRect(panelX0, panelY0, panelW, panelH);
  ctx.fillStyle = "#00eeff"; ctx.font = "bold 14px 'DotGothic16', sans-serif"; ctx.textAlign = "left"; ctx.fillText(`STEP ${sd.step} / ${TUTORIAL_STEPS.length}`, panelX0 + 16, panelY0 + 24);

  let showPrompt = !tutState.started || tutState.isCleared;
  let promptText = !tutState.started ? "▶ FキーでOK" : sd.condition_type === "wait_input" ? "▶ Fキーで次へ" : "▶ 達成！ Fキーで次へ";
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 18px 'DotGothic16', sans-serif"; ctx.textAlign = "center";
  wrapText(ctx, sd.text, cx, panelY0 + panelH / 2 - (showPrompt ? 18 : 0), panelW - 40, 24);
  if (showPrompt) { ctx.fillStyle = "#ffff00"; ctx.font = "bold 15px 'DotGothic16', sans-serif"; ctx.fillText(promptText, cx, panelY1 - 18); }
}

function drawTitle(ctx) {
  const W = SCREEN_WIDTH, H = SCREEN_HEIGHT, cx = W / 2; ctx.fillStyle = "#111122"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#334455"; ctx.lineWidth = 2; ctx.strokeRect(cx - 480, 60, 960, H - 120);
  ctx.fillStyle = "#00eeff"; ctx.font = "bold 72px 'DotGothic16', sans-serif"; ctx.textAlign = "center"; ctx.fillText("GRID TOWER", cx, 230);
  ctx.fillStyle = "#aaaacc"; ctx.font = "24px 'DotGothic16', sans-serif"; ctx.fillText("～目指せ100F～", cx, 300);
  const btnW = 400, btnH = 70, gap = 24, startY = (H - (5 * btnH + 4 * gap)) / 2 + 80;
  const buttons = [["PLAY", "#22aa55", "#ffffff", "btn_play"],["100F BOSS に挑戦 (CPU対戦)", "#aa2244", "#ffffff", "btn_100f"],["HARD MODE (未実装)", "#444444", "#aaaaaa", "btn_hard"],["TUTORIAL", "#225588", "#ffffff", "btn_tutorial"],["QUIT GAME", "#444444", "#aaaaaa", "btn_quit"]];
  _btnRects = {};
  buttons.forEach(([label, bg, fg, tag], i) => {
    const y0 = startY + i * (btnH + gap); ctx.fillStyle = bg; ctx.fillRect(cx - btnW / 2, y0, btnW, btnH);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1; ctx.strokeRect(cx - btnW / 2, y0, btnW, btnH);
    ctx.fillStyle = fg; ctx.font = "bold 24px 'DotGothic16', sans-serif"; ctx.fillText(label, cx, y0 + btnH / 2 + 10);
    _btnRects[tag] = { x: cx - btnW / 2, y: y0, w: btnW, h: btnH };
  });
  const tutRect = _btnRects["btn_tutorial"];
  if (tutRect) {
    const labelX = tutRect.x + tutRect.w + 220; // 画面右側の余白部分
    const labelY = tutRect.y + tutRect.h / 2;
    const arrowStartX = labelX - 20;
    const arrowEndX = tutRect.x + tutRect.w + 20; // ボタン右端の少し外側
    const blink = Math.floor(performance.now() / 500) % 2 === 0;

    if (blink) {
      // テキスト「まずはチュートリアル」
      ctx.fillStyle = "#ffee00";
      ctx.font = "bold 26px 'DotGothic16', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("まずはチュートリアル", labelX, labelY - 30);

      // 矢印（テキストからボタンへ向かって左向き）
      ctx.strokeStyle = "#ffee00";
      ctx.fillStyle = "#ffee00";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(arrowStartX, labelY);
      ctx.lineTo(arrowEndX, labelY);
      ctx.stroke();
      // 矢印の先端（三角形）
      ctx.beginPath();
      ctx.moveTo(arrowEndX, labelY);
      ctx.lineTo(arrowEndX + 18, labelY - 10);
      ctx.lineTo(arrowEndX + 18, labelY + 10);
      ctx.closePath();
      ctx.fill();
    }
  }

  // アンケートに回答ボタン（パネル左側の余白）
  const surveyBtnW = 300, surveyBtnH = 60;
  const surveyBtnX = (cx - 480 - surveyBtnW) / 2;
  const surveyBtnY = startY + (5 * btnH + 4 * gap) / 2 - surveyBtnH / 2;
  ctx.fillStyle = "#aa3377";
  ctx.fillRect(surveyBtnX, surveyBtnY, surveyBtnW, surveyBtnH);
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
  ctx.strokeRect(surveyBtnX, surveyBtnY, surveyBtnW, surveyBtnH);
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 20px 'DotGothic16', sans-serif"; ctx.textAlign = "center";
  ctx.fillText("アンケートに回答", surveyBtnX + surveyBtnW / 2, surveyBtnY + surveyBtnH / 2 + 7);
  _btnRects["btn_survey_title"] = { x: surveyBtnX, y: surveyBtnY, w: surveyBtnW, h: surveyBtnH };
}

function drawPause(ctx) {
  const W = SCREEN_WIDTH, H = SCREEN_HEIGHT, cx = W / 2; ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 0, W, H);
  const pw = 500, ph = 520, px0 = cx - pw / 2, py0 = H / 2 - ph / 2; ctx.fillStyle = "#1a1a2e"; ctx.fillRect(px0, py0, pw, ph);
  ctx.strokeStyle = "#00eeff"; ctx.lineWidth = 3; ctx.strokeRect(px0, py0, pw, ph);
  ctx.fillStyle = "#00eeff"; ctx.font = "bold 48px 'DotGothic16', sans-serif"; ctx.textAlign = "center"; ctx.fillText("PAUSE", cx, py0 + 90);
  const btnW = 360, btnH = 65, gap = 20, startY = py0 + 160;
  const buttons = [["RESUME", "#22aa55", "#ffffff", "btn_resume"],["RETRY", "#cc8800", "#ffffff", "btn_retry_pause"],["HOME", "#225588", "#ffffff", "btn_home_pause"],["QUIT GAME", "#553333", "#ffaaaa", "btn_quit_pause"]];
  _btnRects = {};
  buttons.forEach(([label, bg, fg, tag], i) => {
    const y0 = startY + i * (btnH + gap); ctx.fillStyle = bg; ctx.fillRect(cx - btnW / 2, y0, btnW, btnH);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1; ctx.strokeRect(cx - btnW / 2, y0, btnW, btnH);
    ctx.fillStyle = fg; ctx.font = "bold 24px 'DotGothic16', sans-serif"; ctx.fillText(label, cx, y0 + btnH / 2 + 9);
    _btnRects[tag] = { x: cx - btnW / 2, y: y0, w: btnW, h: btnH };
  });
}

function drawGameover(ctx, score, floorReached) {
  const W = SCREEN_WIDTH, H = SCREEN_HEIGHT, cx = W / 2; ctx.fillStyle = "#0d0000"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ff2200"; ctx.font = "bold 80px 'DotGothic16', sans-serif"; ctx.textAlign = "center"; ctx.fillText("GAME OVER", cx, H / 2 - 230);
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 36px 'DotGothic16', sans-serif"; ctx.fillText(`SCORE  :  ${score}`, cx, H / 2 - 110);
  ctx.fillStyle = "#aaaaaa"; ctx.font = "28px 'DotGothic16', sans-serif"; ctx.fillText(`FLOOR REACHED  :  ${floorReached} F`, cx, H / 2 - 50);
  const btnW = 400, btnH = 70, gap = 24, startY = H / 2 + 50;
  const buttons = [["RETRY", "#cc4400", "#ffffff", "btn_retry_go"],["HOME", "#225588", "#ffffff", "btn_home_go"],["QUIT GAME", "#333333", "#aaaaaa", "btn_quit_go"]];
  _btnRects = {};
  buttons.forEach(([label, bg, fg, tag], i) => {
    const y0 = startY + i * (btnH + gap); ctx.fillStyle = bg; ctx.fillRect(cx - btnW / 2, y0, btnW, btnH);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1; ctx.strokeRect(cx - btnW / 2, y0, btnW, btnH);
    ctx.fillStyle = fg; ctx.font = "bold 28px 'DotGothic16', sans-serif"; ctx.fillText(label, cx, y0 + btnH / 2 + 10);
    _btnRects[tag] = { x: cx - btnW / 2, y: y0, w: btnW, h: btnH };
  });

  // アンケートに回答ボタン（ボタン列の下に追加）
  const surveyBtnW = 400, surveyBtnH = 60, surveyBtnY = startY + buttons.length * (btnH + gap) + 10;
  ctx.fillStyle = "#aa3377";
  ctx.fillRect(cx - surveyBtnW / 2, surveyBtnY, surveyBtnW, surveyBtnH);
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
  ctx.strokeRect(cx - surveyBtnW / 2, surveyBtnY, surveyBtnW, surveyBtnH);
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 22px 'DotGothic16', sans-serif"; ctx.textAlign = "center";
  ctx.fillText("アンケートに回答", cx, surveyBtnY + surveyBtnH / 2 + 8);
  _btnRects["btn_survey_go"] = { x: cx - surveyBtnW / 2, y: surveyBtnY, w: surveyBtnW, h: surveyBtnH };
}

function hitBtn(tag, cx, cy) { if (!_btnRects[tag]) return false; let r = _btnRects[tag]; return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h; }

function quitGame() {
  scene = "quit";
  try { window.close(); } catch (e) { }
}

function drawQuit(ctx) {
  ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 40px 'DotGothic16', sans-serif";
  ctx.fillText("プレイありがとうございました", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 20);
  ctx.fillStyle = "#aaaaaa"; ctx.font = "22px 'DotGothic16', sans-serif";
  ctx.fillText("このタブを閉じてゲームを終了してください", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 30);
}
