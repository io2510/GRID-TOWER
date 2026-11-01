// ============================================================
// 定数
// ============================================================
const SCREEN_WIDTH  = 1920;
const SCREEN_HEIGHT = 1080;
const SURVEY_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLScnkWFuETTK-adgdI8RcYuR2Jl85qyf-EM3R0R1ymlrr51U-w/viewform?usp=publish-editor";
const GAME_LEFT     = 640;
const GAME_RIGHT    = 1280;
const GAME_TOP      = 40;
const GAME_BOTTOM   = 1040;
const GRID_SIZE     = 40;
const MAP_WIDTH     = 16;
const MAP_HEIGHT    = 25;

const GRAVITY    = 0.8;
const JUMP_SPEED = -14.0;
const MOVE_SPEED = 4;
const PUSH_DELAY = 15;
const P_HALF_W   = 15;
const P_HALF_H   = 30;
// game_constants.py 由来（しゃがみ時の当たり判定・移動速度）
const CROUCH_P_HALF_H = 16;
const CROUCH_MOVE_SPEED = 2;

const BLOCK_FALL_INTERVAL      = 20;
const BLOCK_FALL_INTERVAL_FAST = 2;
const SCORE_PER_LINE           = 100;
const LINES_PER_FLOOR          = 1;
const MAX_HP                   = 5;
const INVINCIBLE_FRAMES         = 180;

const BEAM_CYCLE       = 600;
const BEAM_WARNING     = 120;
const BEAM_WIDTH       = 3;
const BEAM_SHOW_FRAMES = 90;

const BLOCK_MOVE_INITIAL_DELAY = 12;
const BLOCK_MOVE_REPEAT_DELAY  = 4;
const COMBO_BUFFER_FRAMES      = 180;
const LINE_CLEAR_INTERVAL      = 6;
const NORMAL_BLOCK_NO_REPEAT_WINDOW = 3;

const FIXED_TERRAIN_BASE = 90000;
const PUZZLE_BLUE_ID     = 3001;
const PUZZLE_RED_ID      = 3002;
const TRAP_GRACE_FRAMES  = 45;
const BIG_BEAM_WARN_FRAMES = 30;
const BIG_BEAM_FIRE_FRAMES = 20;

// 【50Fボス専用追加分】渦巻き模様アニメーション関連定数
const SWIRL_STEPS = 50;
const SWIRL_MAX_TURNS = 2.5;
const SWIRL_ROT_SPEED = 0.08;
