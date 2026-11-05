// ============================================================
// 属性システム(attribute_data.py の移植)。90Fボスと91F以降の通常フロアで使う。
// ロジック部(反応・接触・プレイヤー付着状態)と描画部(canvas 2D)を1ファイルにまとめている。
// 属性アイコン画像は attr_id/<name>.png があれば使い、無ければ色付きの丸で代用する。
// ============================================================
const FPS = 60;

const ATTR_FIRE = "fire", ATTR_WATER = "water", ATTR_GRASS = "grass", ATTR_POISON = "poison", ATTR_THUNDER = "thunder";
const ATTR_WIND = "wind", ATTR_SAND = "sand", ATTR_ICE = "ice", ATTR_IRON = "iron", ATTR_DARK = "dark", ATTR_LIGHT = "light";
const ATTR_GRASS_BURNT = "grass_burnt", ATTR_GRASS_GROWN = "grass_grown", ATTR_GRASS_ROTTEN = "grass_rotten";
const ATTR_WATER_POISONED = "water_poisoned", ATTR_WATER_CHARGED = "water_charged";
const ATTR_ICE_SUPERCONDUCTIVE = "ice_superconductive";
const ATTR_IRON_HEATED = "iron_heated", ATTR_IRON_COOLED = "iron_cooled", ATTR_IRON_MAGNETIC = "iron_magnetic";

// 属性ごとの定義(本家 ATTRIBUTES をそのまま書き出したもの)
const ATTRIBUTES = {
  "fire": {"name": "炎", "block_color": "#661111", "block_outline": "#330a0a", "icon_path": "attr_id/fire.png", "marker_color": "#ff3333", "duration_frames": 960, "damage_interval": 180, "damage_amount": 0.5, "reapply_cooldown_frames": 120, "passable": false, "spreads_on_contact": false, "extinguished_by": ["water", "water_poisoned", "water_charged"], "cancels_with": ["water"], "emits_light": true},
  "water": {"name": "水", "block_color": "#123a4d", "block_outline": "#081f2b", "icon_path": "attr_id/water.png", "marker_color": "#33ccff", "duration_frames": 960, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 120, "passable": true, "spreads_on_contact": true, "extinguished_by": [], "cancels_with": ["fire"]},
  "grass": {"name": "草", "block_color": "#1a4d1a", "block_outline": "#0d260d", "icon_path": "attr_id/grass.png", "marker_color": "#33cc33", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "immune_to_spread": true},
  "grass_burnt": {"name": "草(炭化)", "block_color": "#4d2f1a", "block_outline": "#26170d", "icon_path": "attr_id/grass.png", "marker_color": "#33cc33", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "immune_to_spread": true},
  "grass_grown": {"name": "草(成長)", "block_color": "#4d5c1a", "block_outline": "#26300d", "icon_path": "attr_id/grass.png", "marker_color": "#33cc33", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "immune_to_spread": true},
  "grass_rotten": {"name": "草(腐敗)", "block_color": "#0a2410", "block_outline": "#051206", "icon_path": "attr_id/grass.png", "marker_color": "#33cc33", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "immune_to_spread": true},
  "poison": {"name": "毒", "block_color": "#3d1a4d", "block_outline": "#1f0d26", "icon_path": "attr_id/poison.png", "marker_color": "#b833ff", "duration_frames": 600, "damage_interval": 120, "damage_amount": 0.2, "reapply_cooldown_frames": 120, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "immune_to_spread": true},
  "water_poisoned": {"name": "毒水", "block_color": "#3d1a4d", "block_outline": "#1f0d26", "icon_path": "attr_id/water.png", "marker_color": "#33ccff", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": true, "spreads_on_contact": true, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "player_attach_ids": ["water", "poison"], "immune_to_spread": true},
  "thunder": {"name": "雷", "block_color": "#4d4a11", "block_outline": "#262509", "icon_path": "attr_id/thunder.png", "marker_color": "#ffee33", "duration_frames": 960, "damage_interval": 180, "damage_amount": 0, "tick_stun_frames": 60, "reapply_cooldown_frames": 120, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "immune_to_spread": true, "emits_light": true},
  "water_charged": {"name": "帯電水", "block_color": "#4d4a11", "block_outline": "#262509", "icon_path": "attr_id/water.png", "marker_color": "#33ccff", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": true, "spreads_on_contact": true, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "player_attach_ids": ["thunder"], "immune_to_spread": true, "emits_light": true},
  "wind": {"name": "風", "block_color": "#2d4d4a", "block_outline": "#162624", "icon_path": "attr_id/wind.png", "marker_color": "#9be8dc", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "immune_to_spread": true},
  "sand": {"name": "砂", "block_color": "#5c4a26", "block_outline": "#2e2513", "icon_path": "attr_id/sand.png", "marker_color": "#e8d9a6", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "immune_to_spread": true},
  "ice": {"name": "氷", "block_color": "#243b66", "block_outline": "#121d33", "icon_path": "attr_id/ice.png", "marker_color": "#8fd3ff", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "immune_to_spread": true},
  "ice_superconductive": {"name": "氷(超電導)", "block_color": "#4d4a11", "block_outline": "#262509", "icon_path": "attr_id/ice.png", "marker_color": "#8fd3ff", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "immune_to_spread": true},
  "iron": {"name": "鉄", "block_color": "#3f4650", "block_outline": "#20242a", "icon_path": "attr_id/iron.png", "marker_color": "#c4ccd6", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "immune_to_spread": true, "heavy": true},
  "iron_heated": {"name": "鉄(加熱)", "block_color": "#662b1a", "block_outline": "#33150d", "icon_path": "attr_id/iron.png", "marker_color": "#ff8a55", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "immune_to_spread": true, "heavy": true},
  "iron_cooled": {"name": "鉄(冷却)", "block_color": "#244d66", "block_outline": "#122633", "icon_path": "attr_id/iron.png", "marker_color": "#8fd3ff", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "immune_to_spread": true, "heavy": true},
  "iron_magnetic": {"name": "鉄(磁力)", "block_color": "#4d4a11", "block_outline": "#262509", "icon_path": "attr_id/iron.png", "marker_color": "#c4ccd6", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "immune_to_spread": true, "heavy": true},
  "dark": {"name": "闇", "block_color": "#11111f", "block_outline": "#05050d", "icon_path": "attr_id/dark.png", "marker_color": "#6d5aa8", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "immune_to_spread": true},
  "light": {"name": "光", "block_color": "#d8c45a", "block_outline": "#796b24", "icon_path": "attr_id/light.png", "marker_color": "#fff4a3", "duration_frames": 0, "damage_interval": 0, "damage_amount": 0, "reapply_cooldown_frames": 0, "passable": false, "spreads_on_contact": false, "extinguished_by": [], "cancels_with": [], "attaches_to_player": false, "immune_to_spread": true, "emits_light": true},
};

const BLOCK_ATTR_CHANCE = 1.0;
const BLOCK_ATTR_BOOST_MULTIPLIER = 3.0;
const ATTR_ROLL_WEIGHTS = [
  [ATTR_FIRE, 1], [ATTR_WATER, 1], [ATTR_GRASS, 1], [ATTR_POISON, 1], [ATTR_THUNDER, 1], [ATTR_WIND, 1],
  [ATTR_SAND, 1], [ATTR_ICE, 1], [ATTR_IRON, 1], [ATTR_DARK, 0.6], [ATTR_LIGHT, 0.6],
];
const GRASS_REACTIONS = { [ATTR_FIRE]: ATTR_GRASS_BURNT, [ATTR_WATER]: ATTR_GRASS_GROWN, [ATTR_POISON]: ATTR_GRASS_ROTTEN };
const WATER_REACTIONS = { [ATTR_POISON]: ATTR_WATER_POISONED, [ATTR_THUNDER]: ATTR_WATER_CHARGED, [ATTR_WATER_CHARGED]: ATTR_WATER_CHARGED, [ATTR_ICE]: ATTR_ICE };
const ICE_REACTIONS = { [ATTR_FIRE]: ATTR_WATER, [ATTR_THUNDER]: ATTR_ICE_SUPERCONDUCTIVE };
const IRON_REACTIONS = { [ATTR_FIRE]: ATTR_IRON_HEATED, [ATTR_ICE]: ATTR_IRON_COOLED, [ATTR_THUNDER]: ATTR_IRON_MAGNETIC };

function getAttrDef(id) { return (id && ATTRIBUTES[id]) || null; }
function emitsLight(id) { const d = getAttrDef(id); return !!(d && d.emits_light); }
function isPassableAttr(id) { const d = getAttrDef(id); return !!(d && d.passable); }
function isHeavyAttr(id) { const d = getAttrDef(id); return !!(d && d.heavy); }
function isExtinguishedBy(target, source) { const d = getAttrDef(target); return !!d && (d.extinguished_by || []).includes(source); }
function isImmuneToSpread(id) { const d = getAttrDef(id); return !!(d && d.immune_to_spread); }
function getPlayerAttachIds(id) {
  const d = getAttrDef(id); if (!d) return [];
  if (d.player_attach_ids) return [...d.player_attach_ids];
  if (d.attaches_to_player === false) return [];
  return [id];
}

// 落下ブロックの属性抽選。付与しない場合は null
function rollBlockAttribute(chance = BLOCK_ATTR_CHANCE, excludeIds = null, boostIds = null, boostMul = BLOCK_ATTR_BOOST_MULTIPLIER) {
  if (Math.random() >= chance) return null;
  let list = ATTR_ROLL_WEIGHTS.map(([i, w]) => [i, w]);
  if (excludeIds && excludeIds.length) {
    const f = list.filter(([i]) => !excludeIds.includes(i));
    if (f.length) list = f;
  }
  if (boostIds && boostIds.size) list = list.map(([i, w]) => [i, boostIds.has(i) ? w * boostMul : w]);
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [i, w] of list) { r -= w; if (r < 0) return i; }
  return list[list.length - 1][0];
}

function makeEmptyAttrMap(w, h) { return Array.from({ length: h }, () => new Array(w).fill(null)); }
function moveAttrCell(am, sx, sy, dx, dy) { am[dy][dx] = am[sy][sx]; am[sy][sx] = null; }
function shiftAttrRowsDown(am, fromRow, height) {
  for (let ty = fromRow; ty < height - 1; ty++) am[ty] = [...am[ty + 1]];
  am[height - 1] = new Array(am[0].length).fill(null);
}
function shiftAttrRowsUp(am, fromRow) {
  for (let ty = fromRow; ty > 0; ty--) am[ty] = [...am[ty - 1]];
  am[0] = new Array(am[0].length).fill(null);
}

// ---------- 反応ロジック ----------
const _NEIGHBOR_OFFSETS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const _GRASS_NEIGHBOR_ORDER = [[-1, 0], [0, -1], [0, 1], [1, 0]];

function updateGrassReactions(state) {
  const decided = new Map();
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    const mv = state.blockMap[y][x];
    if (mv < 1 || state.attrMap[y][x] !== ATTR_GRASS) continue;
    if (decided.has(mv)) continue;
    for (const [dx, dy] of _GRASS_NEIGHBOR_ORDER) {
      const nx = x + dx, ny = y + dy;
      if (!(nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT)) continue;
      if (state.blockMap[ny][nx] < 1) continue;
      const na = GRASS_REACTIONS[state.attrMap[ny][nx]];
      if (na !== undefined) { decided.set(mv, [na, x, y]); break; }
    }
  }
  if (decided.size === 0) return;
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    const mv = state.blockMap[y][x];
    if (decided.has(mv) && state.attrMap[y][x] === ATTR_GRASS) state.attrMap[y][x] = decided.get(mv)[0];
  }
  for (const [na, ox, oy] of decided.values()) if (na === ATTR_GRASS_GROWN) _growGrassUpward(state, ox, oy);
}
function _growGrassUpward(state, gx, gy) {
  const ny = gy - 1;
  if (ny < 0) return;
  if (state.blockMap[ny][gx] !== 0) return;
  state.blockMap[ny][gx] = state.blockMap[gy][gx];
  state.attrMap[ny][gx] = ATTR_GRASS_GROWN;
}

// 水・氷・鉄に共通する「駒単位で最初に成立した反応を適用」パターン
function _pieceReactions(state, targetAttr, table) {
  const decided = new Map();
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    const mv = state.blockMap[y][x];
    if (mv < 1 || state.attrMap[y][x] !== targetAttr) continue;
    if (decided.has(mv)) continue;
    for (const [dx, dy] of _NEIGHBOR_OFFSETS) {
      const nx = x + dx, ny = y + dy;
      if (!(nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT)) continue;
      if (state.blockMap[ny][nx] < 1) continue;
      const na = table[state.attrMap[ny][nx]];
      if (na !== undefined) { decided.set(mv, na); break; }
    }
  }
  if (decided.size === 0) return;
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    const mv = state.blockMap[y][x];
    if (decided.has(mv) && state.attrMap[y][x] === targetAttr) state.attrMap[y][x] = decided.get(mv);
  }
}
function updateWaterReactions(state) { _pieceReactions(state, ATTR_WATER, WATER_REACTIONS); }
function updateIceReactions(state) { _pieceReactions(state, ATTR_ICE, ICE_REACTIONS); }
function updateIronReactions(state) { _pieceReactions(state, ATTR_IRON, IRON_REACTIONS); }

function _moveBlockOneCell(state, blockId, cells, dx, dy) {
  let ordered;
  if (dx > 0) ordered = [...cells].sort((a, b) => b[0] - a[0]);
  else if (dx < 0) ordered = [...cells].sort((a, b) => a[0] - b[0]);
  else if (dy > 0) ordered = [...cells].sort((a, b) => b[1] - a[1]);
  else ordered = [...cells].sort((a, b) => a[1] - b[1]);
  for (const [cx, cy] of ordered) {
    const nx = cx + dx, ny = cy + dy;
    state.blockMap[ny][nx] = blockId; state.blockMap[cy][cx] = 0;
    state.attrMap[ny][nx] = state.attrMap[cy][cx]; state.attrMap[cy][cx] = null;
  }
}

const IRON_MAGNETIC_RADIUS = 3;
function updateMagneticIron(state) {
  // 本家と同じ処理順(盤面を走査して最初に見つかった順)にするため Map で駒を集める
  const cache = new Map();
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    const bid = state.blockMap[y][x]; if (bid >= 1) { if (!cache.has(bid)) cache.set(bid, []); cache.get(bid).push([x, y]); }
  }
  const magneticCells = []; const magneticIds = new Set();
  for (const [bid, cells] of cache) {
    if (cells.some(([cx, cy]) => state.attrMap[cy][cx] === ATTR_IRON_MAGNETIC)) { magneticIds.add(bid); magneticCells.push(...cells); }
  }
  if (magneticCells.length === 0) return;
  for (const [blockId, cells] of cache) {
    if (magneticIds.has(blockId) || !cells.length) continue;
    let nearest = null;
    for (const [cx, cy] of cells) for (const [mx, my] of magneticCells) {
      const dist = Math.abs(mx - cx) + Math.abs(my - cy);
      if (dist <= IRON_MAGNETIC_RADIUS) {
        const cand = [dist, cx, cy, mx, my];
        if (nearest === null || _tupleLess(cand, nearest)) nearest = cand;
      }
    }
    if (nearest === null) continue;
    const [, cx, cy, mx, my] = nearest;
    const ddx = mx - cx, ddy = my - cy;
    let mdx, mdy;
    if (Math.abs(ddx) >= Math.abs(ddy) && ddx !== 0) { mdx = ddx > 0 ? 1 : -1; mdy = 0; }
    else if (ddy !== 0) { mdx = 0; mdy = ddy > 0 ? 1 : -1; }
    else continue;
    let can = true;
    for (const [x, y] of cells) {
      const nx = x + mdx, ny = y + mdy;
      if (!(nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT)) { can = false; break; }
      const occ = state.blockMap[ny][nx];
      if (occ !== 0 && occ !== blockId) { can = false; break; }
    }
    if (can) _moveBlockOneCell(state, blockId, cells, mdx, mdy);
  }
}
function _tupleLess(a, b) { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return true; if (a[i] > b[i]) return false; } return false; }

function updateDarkReactions(state) {
  const destroy = new Set();
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    const darkId = state.blockMap[y][x];
    if (darkId < 1 || state.attrMap[y][x] !== ATTR_DARK) continue;
    for (const [dx, dy] of _NEIGHBOR_OFFSETS) {
      const nx = x + dx, ny = y + dy;
      if (!(nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT)) continue;
      const lightId = state.blockMap[ny][nx];
      if (lightId < 1) continue;
      if (state.attrMap[ny][nx] === ATTR_LIGHT) { destroy.add(darkId); destroy.add(lightId); }
    }
  }
  if (destroy.size === 0) return;
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    if (destroy.has(state.blockMap[y][x])) { state.blockMap[y][x] = 0; state.attrMap[y][x] = null; }
  }
}

const _WATERS = [ATTR_WATER, ATTR_WATER_POISONED, ATTR_WATER_CHARGED];
function updateAttributeReactions(state, fb) {
  const toExt = new Set(), toSpread = new Set();
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    if (!_WATERS.includes(state.attrMap[y][x])) continue;
    for (const [dx, dy] of _NEIGHBOR_OFFSETS) {
      const nx = x + dx, ny = y + dy;
      if (!(nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT)) continue;
      const mv = state.blockMap[ny][nx];
      if (mv < 1) continue;
      const na = state.attrMap[ny][nx];
      if (na === null) continue;
      if (isImmuneToSpread(na)) continue;
      if (isExtinguishedBy(na, ATTR_WATER)) toExt.add(mv); else toSpread.add(mv);
    }
  }
  if (toExt.size) for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    if (toExt.has(state.blockMap[y][x])) { state.blockMap[y][x] = 0; state.attrMap[y][x] = null; }
  }
  if (toSpread.size) for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    if (toSpread.has(state.blockMap[y][x])) state.attrMap[y][x] = ATTR_WATER;
  }
  // 落下中ブロックも隣接する水の影響を受ける
  for (const [cx, cy] of fb.getCells()) {
    if (fb.attribute === null) break;
    if (isImmuneToSpread(fb.attribute)) break;
    for (const [dx, dy] of _NEIGHBOR_OFFSETS) {
      const nx = cx + dx, ny = cy + dy;
      if (!(nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT)) continue;
      if (!_WATERS.includes(state.attrMap[ny][nx])) continue;
      if (isExtinguishedBy(fb.attribute, ATTR_WATER)) fb.attribute = null; else fb.attribute = ATTR_WATER;
    }
  }
}

// ---------- プレイヤーとの接触 ----------
function checkAttributeContact(player, attrMap, curPHalfH) {
  const touched = new Set();
  const tr = Math.trunc;
  const corners = [
    [player.x - P_HALF_W + 2, player.y - curPHalfH + 2], [player.x + P_HALF_W - 2, player.y - curPHalfH + 2],
    [player.x - P_HALF_W + 2, player.y + curPHalfH - 2], [player.x + P_HALF_W - 2, player.y + curPHalfH - 2],
  ];
  for (const [px, py] of corners) {
    const gx = tr((px - GAME_LEFT) / GRID_SIZE), gy = tr((py - GAME_TOP) / GRID_SIZE);
    if (gx >= 0 && gx < MAP_WIDTH && gy >= 0 && gy < MAP_HEIGHT && attrMap[gy][gx]) touched.add(attrMap[gy][gx]);
  }
  if (player.isGrounded) {
    const footY = player.y + curPHalfH + 2;
    for (const px of [player.x - P_HALF_W + 2, player.x + P_HALF_W - 2]) {
      const gx = tr((px - GAME_LEFT) / GRID_SIZE), gy = tr((footY - GAME_TOP) / GRID_SIZE);
      if (gx >= 0 && gx < MAP_WIDTH && gy >= 0 && gy < MAP_HEIGHT && attrMap[gy][gx]) touched.add(attrMap[gy][gx]);
    }
  }
  const leftX = player.x - P_HALF_W - 2, rightX = player.x + P_HALF_W + 2;
  for (const py of [player.y - curPHalfH + 2, player.y + curPHalfH - 2]) {
    const gy = tr((py - GAME_TOP) / GRID_SIZE);
    if (!(gy >= 0 && gy < MAP_HEIGHT)) continue;
    for (const px of [leftX, rightX]) {
      const gx = tr((px - GAME_LEFT) / GRID_SIZE);
      if (gx >= 0 && gx < MAP_WIDTH && attrMap[gy][gx]) touched.add(attrMap[gy][gx]);
    }
  }
  return touched;
}

function getPlayerIceSurfaceAttr(state, player, curPHalfH) {
  if (!player.isGrounded) return null;
  const footY = player.y + curPHalfH + 2; const found = new Set();
  for (const px of [player.x - P_HALF_W + 2, player.x + P_HALF_W - 2]) {
    const gx = Math.trunc((px - GAME_LEFT) / GRID_SIZE), gy = Math.trunc((footY - GAME_TOP) / GRID_SIZE);
    if (!(gx >= 0 && gx < MAP_WIDTH && gy >= 0 && gy < MAP_HEIGHT)) continue;
    const a = state.attrMap[gy][gx];
    if (a === ATTR_ICE || a === ATTR_ICE_SUPERCONDUCTIVE) found.add(a);
  }
  if (found.has(ATTR_ICE_SUPERCONDUCTIVE)) return ATTR_ICE_SUPERCONDUCTIVE;
  if (found.has(ATTR_ICE)) return ATTR_ICE;
  return null;
}

function getPlayerIronSurfaces(state, player, curPHalfH) {
  if (!player.isGrounded) return new Map();
  const footY = player.y + curPHalfH + 2; const surfaces = new Map();
  for (const px of [player.x - P_HALF_W + 2, player.x + P_HALF_W - 2]) {
    const gx = Math.trunc((px - GAME_LEFT) / GRID_SIZE), gy = Math.trunc((footY - GAME_TOP) / GRID_SIZE);
    if (!(gx >= 0 && gx < MAP_WIDTH && gy >= 0 && gy < MAP_HEIGHT)) continue;
    const a = state.attrMap[gy][gx];
    if (a === ATTR_IRON_HEATED || a === ATTR_IRON_COOLED) surfaces.set(state.blockMap[gy][gx], a);
  }
  return surfaces;
}

const ICE_FREEZE_FRAMES = 3 * 60;
const ICE_SLIDE_MAX_SPEED = 6.0, ICE_SUPER_MAX_SPEED = 9.0;
const ICE_SLIDE_ACCELERATION = 0.65, ICE_SUPER_ACCELERATION = 0.9;
const ICE_SLIDE_FRICTION = 0.94, ICE_SUPER_FRICTION = 0.985;
const WIND_FLOAT_MIN_CELLS = 4, WIND_FLOAT_MAX_CELLS = 7, WIND_FLOAT_PERIOD_FRAMES = 150, WIND_RISE_FRAMES = 45;
const WIND_RISE_SPEED_CELLS = WIND_FLOAT_MIN_CELLS / WIND_RISE_FRAMES;
function windFloatHeightCells(phase) { return WIND_FLOAT_MIN_CELLS + (WIND_FLOAT_MAX_CELLS - WIND_FLOAT_MIN_CELLS) * (1 - Math.cos(phase)) / 2; }
function findSolidRowBelow(blockMap, gx, startGy, mapW, mapH) {
  if (!(gx >= 0 && gx < mapW)) return null;
  for (let gy = Math.max(startGy, 0); gy < mapH; gy++) if (blockMap[gy][gx] >= 1) return gy;
  return null;
}

const SAND_SINK_MAX_DEPTH = GRID_SIZE * 0.4, SAND_SINK_SPEED = 0.15, SAND_SINK_RECOVER_SPEED = 0.4;
function updateSandSink(state, player, curPHalfH) {
  if (player.onWind) return;
  const standing = new Set();
  if (player.isGrounded) {
    const footGy = Math.trunc((player.y + curPHalfH - GAME_TOP) / GRID_SIZE);
    for (const px of [player.x - P_HALF_W + 2, player.x + P_HALF_W - 2]) {
      const gx = Math.trunc((px - GAME_LEFT) / GRID_SIZE);
      if (gx >= 0 && gx < MAP_WIDTH && footGy >= 0 && footGy < MAP_HEIGHT) {
        if (state.blockMap[footGy][gx] >= 1 && state.attrMap[footGy][gx] === ATTR_SAND) standing.add(`${gx},${footGy}`);
      }
    }
  }
  const cells = new Set([...state.sandSink.keys(), ...standing]);
  for (const cell of cells) {
    const [gx, gy] = cell.split(",").map(Number);
    const stillSand = gx >= 0 && gx < MAP_WIDTH && gy >= 0 && gy < MAP_HEIGHT && state.blockMap[gy][gx] >= 1 && state.attrMap[gy][gx] === ATTR_SAND;
    if (!stillSand) { state.sandSink.delete(cell); continue; }
    let depth = state.sandSink.get(cell) || 0;
    if (standing.has(cell)) depth = Math.min(SAND_SINK_MAX_DEPTH, depth + SAND_SINK_SPEED);
    else depth = Math.max(0, depth - SAND_SINK_RECOVER_SPEED);
    if (depth <= 0) state.sandSink.delete(cell); else state.sandSink.set(cell, depth);
  }
  if (standing.size) player.y += Math.max(...[...standing].map(c => state.sandSink.get(c) || 0));
}

function updateIceContactEffects(state, player, touched, curPHalfH) {
  if (!touched.has(ATTR_ICE) && !touched.has(ATTR_ICE_SUPERCONDUCTIVE)) return;
  if (player.attrState.has(ATTR_WATER)) {
    player.attrState.remove(ATTR_WATER);
    player.stunFrames = Math.max(player.stunFrames, ICE_FREEZE_FRAMES);
    player.horizontalVelocity = 0; player.vx = 0;
  }
  if (player.attrState.has(ATTR_FIRE)) player.attrState.remove(ATTR_FIRE);
  if (getPlayerIceSurfaceAttr(state, player, curPHalfH) !== null) {
    if (player.attrState.has(ATTR_THUNDER)) { player.attrState.remove(ATTR_THUNDER); player.iceSpeedBoost = true; }
  }
}

const IRON_CONTACT_EFFECT_FRAMES = 5 * 60;
function updateIronContactEffects(state, player, curPHalfH) {
  const standing = getPlayerIronSurfaces(state, player, curPHalfH);
  for (const id of [...state.ironContactTimers.keys()]) if (!standing.has(id)) state.ironContactTimers.delete(id);
  for (const [blockId, attrId] of standing) {
    if (attrId === ATTR_IRON_COOLED && !player.attrState.has(ATTR_WATER)) { state.ironContactTimers.set(blockId, 0); continue; }
    const elapsed = (state.ironContactTimers.get(blockId) || 0) + 1;
    if (elapsed < IRON_CONTACT_EFFECT_FRAMES) { state.ironContactTimers.set(blockId, elapsed); continue; }
    if (attrId === ATTR_IRON_HEATED) player.attrState.tryAttach(ATTR_FIRE);
    else if (attrId === ATTR_IRON_COOLED && player.attrState.has(ATTR_WATER)) {
      player.attrState.remove(ATTR_WATER);
      player.stunFrames = Math.max(player.stunFrames, ICE_FREEZE_FRAMES);
      player.horizontalVelocity = 0; player.vx = 0;
    }
    state.ironContactTimers.set(blockId, 0);
  }
}

const DARKNESS_DURATION_FRAMES = 3 * 60;
function updateDarkContactEffects(player, touched) { if (touched.has(ATTR_DARK)) player.darknessFrames = Math.max(player.darknessFrames, DARKNESS_DURATION_FRAMES); }
function updateLightContactEffects(player, touched) { if (touched.has(ATTR_LIGHT)) { player.attrState.reset(); player.darknessFrames = 0; } }

const THUNDER_FIRE_DAMAGE = 0.5, THUNDER_FIRE_LAUNCH_VY = -18.0, THUNDER_WATER_DAMAGE = 0.5, THUNDER_WATER_STUN_FRAMES = 2 * 60;
function updateStatusCombos(player) {
  const has = a => player.attrState.has(a); const damages = [];
  if (has(ATTR_THUNDER) && has(ATTR_FIRE)) {
    player.attrState.remove(ATTR_THUNDER); player.attrState.remove(ATTR_FIRE);
    damages.push([ATTR_THUNDER, THUNDER_FIRE_DAMAGE, 0]);
    player.vy = THUNDER_FIRE_LAUNCH_VY; player.isGrounded = false;
  }
  if (has(ATTR_THUNDER) && has(ATTR_WATER)) {
    player.attrState.remove(ATTR_THUNDER); player.attrState.remove(ATTR_WATER);
    damages.push([ATTR_THUNDER, THUNDER_WATER_DAMAGE, THUNDER_WATER_STUN_FRAMES]);
  }
  return damages;
}

// ---------- プレイヤーの属性付着状態 ----------
class PlayerAttributeState {
  constructor() { this.attached = new Map(); this.cooldowns = new Map(); }
  reset() { this.attached.clear(); this.cooldowns.clear(); }
  has(id) { return this.attached.has(id); }
  activeIds() { return [...this.attached.keys()]; }
  remove(id) { this.attached.delete(id); }
  tryAttach(id) {
    const d = getAttrDef(id); if (!d) return;
    if (d.attaches_to_player === false) return;
    if ((this.cooldowns.get(id) || 0) > 0) return;
    if (this.attached.has(id)) this.attached.get(id).remain = d.duration_frames;
    else this.attached.set(id, { remain: d.duration_frames, damage_timer: d.damage_interval });
    this.cooldowns.set(id, d.reapply_cooldown_frames);
    this._applyCancellations();
  }
  _applyCancellations() {
    const rm = new Set();
    for (const id of this.attached.keys()) {
      const d = getAttrDef(id); if (!d) continue;
      for (const other of (d.cancels_with || [])) if (this.attached.has(other)) { rm.add(id); rm.add(other); }
    }
    for (const id of rm) this.attached.delete(id);
  }
  // 毎フレーム。効果が発生した属性を [[attrId, damage, stunFrames], ...] で返す
  update() {
    const damages = [], expired = [];
    for (const id of [...this.cooldowns.keys()]) {
      if (this.cooldowns.get(id) > 0) this.cooldowns.set(id, this.cooldowns.get(id) - 1);
      if (this.cooldowns.get(id) <= 0) this.cooldowns.delete(id);
    }
    for (const [id, info] of this.attached) {
      const d = getAttrDef(id);
      if (!d) { expired.push(id); continue; }
      info.remain -= 1;
      if (info.remain <= 0) { expired.push(id); continue; }
      const dmg = d.damage_amount, stun = d.tick_stun_frames || 0;
      if (dmg > 0 || stun > 0) {
        info.damage_timer -= 1;
        if (info.damage_timer <= 0) { damages.push([id, dmg, stun]); info.damage_timer = d.damage_interval; }
      }
    }
    for (const id of expired) this.attached.delete(id);
    return damages;
  }
}

// ============================================================
// 描画部
// ============================================================
const _attrIconCache = {};
function getAttrIconImage(attrId) {
  if (attrId in _attrIconCache) return _attrIconCache[attrId];
  const d = getAttrDef(attrId); let img = null;
  if (d && d.icon_path && typeof Image !== "undefined" && !location.search.includes("noicons")) {
    const im = new Image(); im.onerror = () => { _attrIconCache[attrId] = null; }; im.src = d.icon_path;
    _attrIconCache[attrId] = im;   // 読み込み完了までは丸で代用
    return im;
  }
  _attrIconCache[attrId] = img; return img;
}
function _iconReady(im) { return im && im.complete && im.naturalWidth > 0; }

function getBlockVisual(attrId) { const d = getAttrDef(attrId); return d ? { fill: d.block_color, outline: d.block_outline } : null; }

function drawBlockAttributeOverlay(ctx, cx, cy, attrId, cellSize, sizeScale = 1) {
  const d = getAttrDef(attrId); if (!d) return;
  const icon = getAttrIconImage(attrId);
  if (_iconReady(icon)) { const s = cellSize * 0.7 * sizeScale; ctx.drawImage(icon, cx - s / 2, cy - s / 2, s, s); }
  else { const r = cellSize * 0.35 * sizeScale; ctx.fillStyle = d.marker_color; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
}

function drawPlayerAttributeIcons(ctx, centerX, topY, attrIds) {
  attrIds = attrIds.filter(a => getAttrDef(a));
  if (!attrIds.length) return;
  const size = 12, gap = 4, totalW = attrIds.length * size + (attrIds.length - 1) * gap, startX = centerX - totalW / 2;
  attrIds.forEach((id, i) => {
    const d = getAttrDef(id), cx = startX + i * (size + gap) + size / 2, icon = getAttrIconImage(id);
    if (_iconReady(icon)) ctx.drawImage(icon, cx - size / 2, topY - size / 2, size, size);
    else { ctx.fillStyle = d.marker_color; ctx.beginPath(); ctx.arc(cx, topY, size / 2, 0, Math.PI * 2); ctx.fill(); }
  });
}

// ---- 闇の視界暗転 ----
const DARKNESS_REVEAL_HALF_SIZE_CELLS = 1.0, DARKNESS_COLOR_HEX = "#05050d";
const DARKNESS_UNKNOWN_BLOCK_FILL = "#8a8a86";
function _clipRect(a, b) {
  const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]), x1 = Math.min(a[2], b[2]), y1 = Math.min(a[3], b[3]);
  if (x0 >= x1 || y0 >= y1) return null; return [x0, y0, x1, y1];
}
function _redrawPartialCellInDarkness(ctx, state, gx, gy, clip, dim) {
  const [x0c, y0c, x1c, y1c] = clip;
  const attrId = state.attrMap[gy][gx], visual = getBlockVisual(attrId);
  ctx.fillStyle = visual ? visual.fill : DARKNESS_UNKNOWN_BLOCK_FILL; ctx.fillRect(x0c, y0c, x1c - x0c, y1c - y0c);
  const icx = GAME_LEFT + gx * GRID_SIZE + GRID_SIZE / 2, icy = GAME_TOP + gy * GRID_SIZE + GRID_SIZE / 2;
  if (attrId !== null && x0c <= icx && icx <= x1c && y0c <= icy && icy <= y1c) drawBlockAttributeOverlay(ctx, icx, icy, attrId, GRID_SIZE);
  if (dim) { ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = DARKNESS_COLOR_HEX; ctx.fillRect(x0c, y0c, x1c - x0c, y1c - y0c); ctx.restore(); }
}
function drawDarknessOverlay(ctx, state, player) {
  ctx.fillStyle = DARKNESS_COLOR_HEX; ctx.fillRect(GAME_LEFT, GAME_TOP, GAME_RIGHT - GAME_LEFT, GAME_BOTTOM - GAME_TOP);
  const lightCells = [];
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    if (state.blockMap[y][x] < 1) continue;
    const a = state.attrMap[y][x]; if (emitsLight(a)) lightCells.push([x, y, a]);
  }
  const lightSet = new Set(lightCells.map(([x, y]) => `${x},${y}`));
  const halfPx = GRID_SIZE * DARKNESS_REVEAL_HALF_SIZE_CELLS;
  const sources = lightCells.map(([gx, gy]) => [GAME_LEFT + gx * GRID_SIZE + GRID_SIZE / 2, GAME_TOP + gy * GRID_SIZE + GRID_SIZE / 2]);
  sources.push([player.x, player.y]);
  for (const [cx, cy] of sources) {
    const reveal = [cx - halfPx, cy - halfPx, cx + halfPx, cy + halfPx];
    const gx0 = Math.max(0, Math.floor((cx - halfPx - GAME_LEFT) / GRID_SIZE)), gx1 = Math.min(MAP_WIDTH - 1, Math.floor((cx + halfPx - 1 - GAME_LEFT) / GRID_SIZE));
    const gy0 = Math.max(0, Math.floor((cy - halfPx - GAME_TOP) / GRID_SIZE)), gy1 = Math.min(MAP_HEIGHT - 1, Math.floor((cy + halfPx - 1 - GAME_TOP) / GRID_SIZE));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      if (state.blockMap[gy][gx] < 1) continue;
      const cellRect = [GAME_LEFT + gx * GRID_SIZE, GAME_TOP + gy * GRID_SIZE, GAME_LEFT + (gx + 1) * GRID_SIZE, GAME_TOP + (gy + 1) * GRID_SIZE];
      const clip = _clipRect(reveal, cellRect); if (!clip) continue;
      _redrawPartialCellInDarkness(ctx, state, gx, gy, clip, !lightSet.has(`${gx},${gy}`));
    }
  }
  // 光源ブロック本体とプレイヤーをくっきり描き直す
  for (const [gx, gy, a] of lightCells) {
    const v = getBlockVisual(a); if (!v) continue;
    ctx.fillStyle = v.fill; ctx.fillRect(GAME_LEFT + gx * GRID_SIZE, GAME_TOP + gy * GRID_SIZE, GRID_SIZE, GRID_SIZE);
    ctx.strokeStyle = v.outline; ctx.lineWidth = 1; ctx.strokeRect(GAME_LEFT + gx * GRID_SIZE, GAME_TOP + gy * GRID_SIZE, GRID_SIZE, GRID_SIZE);
    drawBlockAttributeOverlay(ctx, GAME_LEFT + gx * GRID_SIZE + GRID_SIZE / 2, GAME_TOP + gy * GRID_SIZE + GRID_SIZE / 2, a, GRID_SIZE);
  }
  const hh = player.isCrouching ? CROUCH_P_HALF_H : P_HALF_H;
  ctx.fillStyle = player.invincible > 0 ? "#ffaaaa" : "lightgreen"; ctx.fillRect(player.x - P_HALF_W, player.y - hh, P_HALF_W * 2, hh * 2);
  ctx.strokeStyle = "white"; ctx.lineWidth = 1; ctx.strokeRect(player.x - P_HALF_W, player.y - hh, P_HALF_W * 2, hh * 2);
  drawPlayerAttributeIcons(ctx, player.x, player.y - hh - 16, player.attrState.activeIds());
}
