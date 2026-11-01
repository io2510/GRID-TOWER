// ============================================================
// ブロックデータ (block_data.py 由来、50F用19〜21を追加)
// ============================================================
const BLOCKS = [
  { shape_id:1, name:"square",  shape:[[0,0],[1,0],[0,1],[1,1]], color:"#ffee00", outline:"#bbaa00" },
  { shape_id:2, name:"I4",      shape:[[0,0],[0,1],[0,2],[0,3]], color:"#00eeff", outline:"#0099bb" },
  { shape_id:3, name:"I3",      shape:[[0,0],[0,1],[0,2]], color:"#55bbff", outline:"#2277bb" },
  { shape_id:4, name:"I2",      shape:[[0,0],[0,1]], color:"#aaddff", outline:"#6699bb" },
  { shape_id:5, name:"skew2",   shape:[[0,0],[1,1]], color:"#77ffaa", outline:"#22bb66" },
  { shape_id:6, name:"T",       shape:[[0,0],[1,0],[2,0],[1,1]], color:"#cc44ff", outline:"#881199" },
  { shape_id:7, name:"L",       shape:[[0,0],[0,1],[0,2],[1,2]], color:"#ff8800", outline:"#bb5500" },
  { shape_id:8, name:"J",       shape:[[1,0],[1,1],[0,2],[1,2]], color:"#4488ff", outline:"#2255bb" },
  { shape_id:9, name:"S",       shape:[[1,0],[2,0],[0,1],[1,1]], color:"#44ff66", outline:"#229944" },
  { shape_id:10,name:"Z",       shape:[[0,0],[1,0],[1,1],[2,1]], color:"#ff3333", outline:"#bb1111" },
  { shape_id:11,name:"stairs",  shape:[[1,0],[0,1],[1,1]], color:"#ff00ff", outline:"#aa00aa" },
  { shape_id:12,name:"concave", shape:[[0,0],[2,0],[0,1],[1,1],[2,1]], color:"#ff9955", outline:"#cc6622" },
  { shape_id:13,name:"T_inv",   shape:[[0,0],[1,0],[2,0],[1,1],[1,2]], color:"#ff6699", outline:"#bb2255" },
  { shape_id:14,name:"cross",   shape:[[1,0],[0,1],[1,1],[2,1],[1,2]], color:"#ffcc00", outline:"#bb8800" },
  { shape_id:15,name:"battan",  shape:[[0,0],[2,0],[1,1],[0,2],[2,2]], color:"#00ffcc", outline:"#00aa88" },
  { shape_id:16,name:"H",       shape:[[0,0],[2,0],[0,1],[2,1]], color:"#ff44aa", outline:"#bb1177" },
  { shape_id:17,name:"O_frame", shape:[[0,0],[1,0],[2,0],[0,1],[2,1],[0,2],[1,2],[2,2]], color:"#ffdd44", outline:"#bb9900" },
  { shape_id:18,name:"one",     shape:[[0,0]], color:"#ffffff", outline:"#aaaaaa" },
  // 【50Fボス専用追加分】反転ブロック定義（回転不可、特殊デバフ用）
  { shape_id:19,name:"invert_R",shape:[[0,0],[1,0],[0,1],[2,1],[0,2],[1,2],[0,3],[2,3],[0,4],[1,4]], color:"#0055ff", outline:"#0033aa" },
  { shape_id:20,name:"invert_B",shape:[[0,0],[1,0],[0,1],[2,1],[0,2],[1,2],[0,3],[2,3],[0,4],[2,4]], color:"#ff1111", outline:"#aa0000" },
  { shape_id:21,name:"invert_P",shape:[[0,0],[1,0],[0,1],[2,1],[0,2],[1,2],[0,3],[0,4]], color:"#b300ff", outline:"#7700cc" }
];
const RARE_BLOCK_IDS = [12, 13, 14, 15, 16, 17, 18];
const BLOCK_COLOR_MAP = {
  1: {fill:"#887700", outline:"#554400"},
  2: {fill:"#007788", outline:"#004455"},
  3: {fill:"#225588", outline:"#113355"},
  4: {fill:"#556677", outline:"#334455"},
  5: {fill:"#227744", outline:"#114422"},
  6: {fill:"#662288", outline:"#440055"},
  7: {fill:"#884400", outline:"#552200"},
  8: {fill:"#224488", outline:"#112255"},
  9: {fill:"#226633", outline:"#115533"},
  10:{fill:"#881111", outline:"#550000"},
  11:{fill:"#880088", outline:"#550055"},
  12:{fill:"#884422", outline:"#552211"},
  13:{fill:"#883344", outline:"#551122"},
  14:{fill:"#886600", outline:"#554400"},
  15:{fill:"#007755", outline:"#004433"},
  16:{fill:"#882255", outline:"#551133"},
  17:{fill:"#886611", outline:"#554400"},
  18:{fill:"#777777", outline:"#444444"},
  // 【50Fボス専用追加分】固定後のディープカラー色定義マップ
  19:{fill:"#002288", outline:"#001144"},
  20:{fill:"#880000", outline:"#440000"},
  21:{fill:"#550088", outline:"#220044"}
};
