// 100Fボス戦を本体(main.js)へつなぐ薄い層: シーン開始・結果画面
let battle100f = new Battle100F();
let b100Result = null; // "victory" | "defeat"
let b100FromGame = false; // 通常プレイの100F到達から入った戦闘か(タイトルの「100F BOSS に挑戦」では false)

function startBoss100F(playerHp) {
  b100FromGame = false;
  resetGame();
  battle100f.start(playerHp);
  b100Result = null;
  scene = "boss_100f";
}

// 通常プレイで100Fに到達した時の突入処理。プレイヤーの体力は100F前の値をそのまま引き継ぐ(本家と同じ)。
// セーブポイントは「100F突入時点」に更新する(負けた後のLOADが99F以前に戻らないように)。
function enterBoss100FFromGame() {
  flushLineClearQueue(state);
  checkpoint.floor = state.floor; checkpoint.score = state.score;
  b100FromGame = true; b100Result = null;
  battle100f.start(player.hp);
  scene = "boss_100f";
}

function updateBoss100F() {
  const r = battle100f.update();
  if (r === "victory" || r === "defeat") {
    b100Result = r;
    battle100f.stop();
    if (b100FromGame && r === "defeat") { player.hp = 0; scene = "gameover"; }   // 通常プレイ中の敗北はゲームオーバー(LOADで100Fから再開できる)
    else scene = "boss100f_end";
  }
}

function drawBoss100FPortraitNotice(ctx) {
  if (window.innerHeight <= window.innerWidth) return;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  ctx.fillStyle = "#ffee00"; ctx.font = "bold 64px 'DotGothic16', sans-serif"; ctx.textAlign = "center";
  ctx.fillText("100Fは横画面(PC)で遊んでください", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
  ctx.restore();
}

// 勝利(ゲームクリア・仮の演出)／敗北
function drawBoss100FEnd(ctx) {
  const W = SCREEN_WIDTH, H = SCREEN_HEIGHT, cx = W / 2;
  ctx.textBaseline = "alphabetic";
  _btnRects = {};
  if (b100Result === "victory") {
    ctx.fillStyle = "#0a0a22"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffdd00"; ctx.font = "bold 110px 'DotGothic16', sans-serif"; ctx.fillText("GAME CLEAR", cx, H / 2 - 160);
    ctx.fillStyle = "#ffffff"; ctx.font = "36px 'DotGothic16', sans-serif"; ctx.fillText("100F BOSS を撃破した!", cx, H / 2 - 50);
  } else {
    ctx.fillStyle = "#0d0000"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff2200"; ctx.font = "bold 90px 'DotGothic16', sans-serif"; ctx.fillText("DEFEAT...", cx, H / 2 - 160);
    ctx.fillStyle = "#aaaaaa"; ctx.font = "30px 'DotGothic16', sans-serif"; ctx.fillText("100F BOSS に敗れた", cx, H / 2 - 50);
  }
  const btnW = 400, btnH = 80, gap = 24, y0 = H / 2 + 40;
  // 通常プレイからのクリアはHOMEのみ(本家のゲームクリア画面と同じ)。タイトルからの挑戦はRETRYも出す
  const buttons = (b100FromGame && b100Result === "victory") ? [["HOME", "#225588", "btn_home_b100"]] : [["RETRY", "#cc4400", "btn_retry_b100"], ["HOME", "#225588", "btn_home_b100"]];
  buttons.forEach(([label, bg, tag], i) => {
    const by = y0 + i * (btnH + gap);
    ctx.fillStyle = bg; ctx.fillRect(cx - btnW / 2, by, btnW, btnH);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1; ctx.strokeRect(cx - btnW / 2, by, btnW, btnH);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 32px 'DotGothic16', sans-serif"; ctx.fillText(label, cx, by + btnH / 2 + 11);
    _btnRects[tag] = { x: cx - btnW / 2, y: by, w: btnW, h: btnH };
  });
}

window.addEventListener("blur", () => { if (battle100f.active) battle100f.releaseAll(); });
