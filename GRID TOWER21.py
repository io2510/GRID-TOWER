# -*- coding: utf-8 -*-
"""
Created on Mon Jun 22 11:23:59 2026

@author: BM23027
・画面のレイアウト表示の変更
・押しつぶし判定の修正
"""

import tkinter
import random
try:
    from block_data import BLOCKS, BLOCK_COLOR_MAP, RARE_BLOCK_IDS
except ImportError:
    BLOCKS = [{"shape_id": 1, "shape": [(0,0),(1,0),(0,1),(1,1)], "color": "yellow", "outline": "orange"}]
    BLOCK_COLOR_MAP = {1: {"fill": "yellow", "outline": "orange"}}
    RARE_BLOCK_IDS = []

# ============================================================
# 定数
# ============================================================
SCREEN_WIDTH  = 1920
SCREEN_HEIGHT = 1080

GAME_LEFT   = 640
GAME_RIGHT  = 1280
GAME_TOP    = 40
GAME_BOTTOM = 1040

GRID_SIZE  = 40
MAP_WIDTH  = 16
MAP_HEIGHT = 25

GRAVITY    = 0.8
JUMP_SPEED = -14.0
MOVE_SPEED = 4

PUSH_DELAY = 15
P_HALF_W   = 15
P_HALF_H   = 30

BLOCK_FALL_INTERVAL      = 20   # 落下間隔（20フレーム固定）
BLOCK_FALL_INTERVAL_FAST = 2
SCORE_PER_LINE           = 100
LINES_PER_FLOOR          = 3    # 3回（3ライン）消したら1階上がる

# HP
MAX_HP            = 5
INVINCIBLE_FRAMES = 180

# ビーム
BEAM_CYCLE       = 600
BEAM_WARNING     = 120
BEAM_WIDTH       = 3
BEAM_SHOW_FRAMES = 90

# ============================================================
# クラス定義
# ============================================================
class FallingBlock:
    def __init__(self):
        self.x        = 0
        self.y        = 0
        self.timer    = 0
        self.shape_id = 1
        self.shape    = []
        self.color    = "yellow"
        self.outline  = "orange"
        data          = random.choice([b for b in BLOCKS if b["shape_id"] not in RARE_BLOCK_IDS]) if RARE_BLOCK_IDS else BLOCKS[0]
        self.shape_id = data["shape_id"]
        self.shape    = list(data["shape"])
        self.color    = data["color"]
        self.outline  = data["outline"]
        max_dx        = max(dx for dx, dy in self.shape)
        self.x        = random.randint(1, MAP_WIDTH - max_dx - 2)
        self.y        = 0

    def spawn(self, state):
        state.block_count += 1
        if RARE_BLOCK_IDS and state.block_count % 15 == 0:
            rare_id = random.choice(RARE_BLOCK_IDS)
            data    = next(b for b in BLOCKS if b["shape_id"] == rare_id)
        else:
            normal  = [b for b in BLOCKS if b["shape_id"] not in RARE_BLOCK_IDS]
            data    = random.choice(normal) if normal else BLOCKS[0]
        self.shape_id = data["shape_id"]
        self.shape    = list(data["shape"])
        self.color    = data["color"]
        self.outline  = data["outline"]
        max_dx        = max(dx for dx, dy in self.shape)
        self.x        = random.randint(1, MAP_WIDTH - max_dx - 2)
        self.y        = 0
        self.timer    = 0

    def get_cells(self):
        return [(self.x + dx, self.y + dy) for dx, dy in self.shape]

    def rotate_left(self, state):
        new_shape = self._rotate(self.shape, direction=-1)
        new_shape = self._normalize(new_shape)
        if not self._collides(state, new_shape):
            self.shape = new_shape

    def rotate_right(self, state):
        new_shape = self._rotate(self.shape, direction=1)
        new_shape = self._normalize(new_shape)
        if not self._collides(state, new_shape):
            self.shape = new_shape

    def _rotate(self, shape, direction):
        if direction == 1:
            return [(-dy, dx) for dx, dy in shape]
        else:
            return [(dy, -dx) for dx, dy in shape]

    def _normalize(self, shape):
        min_x = min(dx for dx, dy in shape)
        min_y = min(dy for dx, dy in shape)
        return [(dx - min_x, dy - min_y) for dx, dy in shape]

    def _collides(self, state, shape):
        for dx, dy in shape:
            tx, ty = self.x + dx, self.y + dy
            if tx < 0 or tx >= MAP_WIDTH:
                return True
            if ty >= MAP_HEIGHT:
                return True
            if 0 <= ty < MAP_HEIGHT and state.block_map[ty][tx] >= 1:
                return True
        return False

class Player:
    def __init__(self):
        self.x              = (GAME_LEFT + GAME_RIGHT) // 2
        self.y              = GAME_BOTTOM - 20
        self.vx             = 0
        self.vy             = 0
        self.is_grounded    = False
        self.push_timer_l   = 0
        self.push_timer_r   = 0
        self.hp             = MAX_HP
        self.invincible     = 0
        self.blink_visible  = True

class BeamState:
    def __init__(self):
        self.timer       = 0
        self.col         = 0
        self.show_timer  = 0
        self.phase       = "wait"
        self.blink_on    = True

class GameState:
    def __init__(self):
        self.block_map   = [[0] * MAP_WIDTH for _ in range(MAP_HEIGHT)]
        self.next_serial = 1
        self.block_count = 0
        self.key_states  = {"w": False, "a": False, "s": False,
                            "d": False, "space": False}
        self.last_hkey   = ""
        self.score       = 0
        self.floor       = 1
        self.floor_lines = 0

# ============================================================
# ゲームロジック関数
# ============================================================
def check_collision(state, fb, nx, ny):
    for dx, dy in fb.shape:
        tx, ty = nx + dx, ny + dy
        if tx < 0 or tx >= MAP_WIDTH:
            return True
        if ty >= MAP_HEIGHT:
            return True
        if 0 <= ty < MAP_HEIGHT and state.block_map[ty][tx] >= 1:
            return True
    return False

def lock_block(state, fb):
    map_value = fb.shape_id * 1000 + state.next_serial
    for gx, gy in fb.get_cells():
        if 0 <= gx < MAP_WIDTH and 0 <= gy < MAP_HEIGHT:
            state.block_map[gy][gx] = map_value
    state.next_serial += 1

def check_line_clear(state):
    y = MAP_HEIGHT - 1
    while y >= 0:
        if 0 not in state.block_map[y]:
            for ty in range(y, 0, -1):
                state.block_map[ty] = list(state.block_map[ty - 1])
            state.block_map[0] = [0] * MAP_WIDTH

            state.score       += SCORE_PER_LINE
            state.floor_lines += 1

            if state.floor_lines >= LINES_PER_FLOOR:
                state.floor += 1
                state.floor_lines = 0
        else:
            y -= 1

def apply_gravity_to_blocks(state):
    active_ids = set()
    for y in range(MAP_HEIGHT):
        for x in range(MAP_WIDTH):
            bid = state.block_map[y][x]
            if bid >= 1:
                active_ids.add(bid)

    for block_id in sorted(list(active_ids)):
        cells = [(x, y) for y in range(MAP_HEIGHT) for x in range(MAP_WIDTH) if state.block_map[y][x] == block_id]
        can_drop = True
        for cx, cy in cells:
            ny = cy + 1
            if ny >= MAP_HEIGHT:
                can_drop = False
                break
            if state.block_map[ny][cx] >= 1 and state.block_map[ny][cx] != block_id:
                can_drop = False
                break
        if can_drop and cells:
            for cx, cy in sorted(cells, key=lambda c: c[1], reverse=True):
                state.block_map[cy + 1][cx] = block_id
                state.block_map[cy][cx]     = 0

def is_solid_map(state, gx, gy):
    if gx < 0 or gx >= MAP_WIDTH or gy < 0 or gy >= MAP_HEIGHT:
        return False
    return state.block_map[gy][gx] >= 1

def is_solid_all(state, fb, gx, gy):
    if is_solid_map(state, gx, gy):
        return True
    for fx, fy in fb.get_cells():
        if fx == gx and fy == gy:
            return True
    return False

def teleport_player(player):
    player.x = (GAME_LEFT + GAME_RIGHT) // 2
    player.y = GAME_TOP + 100
    player.vy = 0
    player.is_grounded = False

def check_crush(state, fb, player):
    if player.invincible > 0:
        return
    if not player.is_grounded:
        return

    head_gy = int((player.y - P_HALF_H - GAME_TOP) / GRID_SIZE)
    lx = int((player.x - (P_HALF_W - 2) - GAME_LEFT) / GRID_SIZE)
    rx = int((player.x + (P_HALF_W - 2) - GAME_LEFT) / GRID_SIZE)
    fb_cells = set(fb.get_cells())

    for cx in [lx, rx]:
        if not (0 <= cx < MAP_WIDTH):
            continue
        is_block_above = (cx, head_gy) in fb_cells or (0 <= head_gy < MAP_HEIGHT and state.block_map[head_gy][cx] >= 1)

        if is_block_above:
            player.hp          = max(0, player.hp - 1)
            player.invincible  = INVINCIBLE_FRAMES
            teleport_player(player)  # 被ダメ時に中央上空へ脱出
            break


def update_beam(beam, player):
    beam.timer += 1

    if beam.phase == "wait" and beam.timer >= BEAM_CYCLE - BEAM_WARNING:
        beam.phase = "warning"
        p_gx = int((player.x - GAME_LEFT) / GRID_SIZE)
        beam.col = p_gx - (BEAM_WIDTH // 2)
        beam.col = max(0, min(MAP_WIDTH - BEAM_WIDTH, beam.col))

    if beam.phase == "warning":
        beam.blink_on = (beam.timer // 8) % 2 == 0

    if beam.phase == "warning" and beam.timer >= BEAM_CYCLE:
        beam.phase      = "firing"
        beam.show_timer = BEAM_SHOW_FRAMES
        beam.timer      = 0

    if beam.phase == "firing":
        beam.show_timer -= 1

        if player.invincible == 0:
            p_gx = int((player.x - GAME_LEFT) / GRID_SIZE)
            if beam.col <= p_gx < beam.col + BEAM_WIDTH:
                player.hp          = max(0, player.hp - 1)
                player.invincible  = INVINCIBLE_FRAMES
                teleport_player(player)

        if beam.show_timer <= 0:
            beam.phase = "wait"


# ============================================================
# 更新関数
# ============================================================
def update_falling_block(state, fb):
    interval = BLOCK_FALL_INTERVAL_FAST if state.key_states["s"] else BLOCK_FALL_INTERVAL
    fb.timer += 1
    if fb.timer < interval:
        return
    fb.timer = 0
    if not check_collision(state, fb, fb.x, fb.y + 1):
        fb.y += 1
    else:
        lock_block(state, fb)
        fb.spawn(state)
    check_line_clear(state)
    apply_gravity_to_blocks(state)


def update_player(state, fb, player):
    ks = state.key_states

    player.vx = 0
    if ks["a"] and ks["d"]:
        if state.last_hkey == "a": player.vx = -MOVE_SPEED
        elif state.last_hkey == "d": player.vx = MOVE_SPEED
    elif ks["a"]: player.vx = -MOVE_SPEED
    elif ks["d"]: player.vx = MOVE_SPEED

    upper_y = int((player.y - (P_HALF_H - 1) - GAME_TOP)  / GRID_SIZE)
    lower_y = int((player.y + (P_HALF_H - 1) - GAME_TOP)  / GRID_SIZE)
    next_lx = int((player.x + player.vx - (P_HALF_W - 1) - GAME_LEFT) / GRID_SIZE)
    next_rx = int((player.x + player.vx + (P_HALF_W - 1) - GAME_LEFT) / GRID_SIZE)

    hitting_block = False

    for grid_y in [upper_y, lower_y]:
        if not (0 <= grid_y < MAP_HEIGHT):
            continue

        if player.vx < 0 and 0 <= next_lx < MAP_WIDTH and state.block_map[grid_y][next_lx] >= 1:
            hitting_block = True
            target_id = state.block_map[grid_y][next_lx]
            cells     = [(x, y) for y in range(MAP_HEIGHT) for x in range(MAP_WIDTH) if state.block_map[y][x] == target_id]
            can_push  = all(cx - 1 >= 0 and (state.block_map[cy][cx - 1] == 0 or state.block_map[cy][cx - 1] == target_id) for cx, cy in cells)
            player.push_timer_r = 0
            if can_push:
                player.push_timer_l += 1
                if player.push_timer_l >= PUSH_DELAY:
                    for cx, cy in sorted(cells, key=lambda c: c[0]):
                        state.block_map[cy][cx - 1] = target_id
                        state.block_map[cy][cx]     = 0
                    player.push_timer_l = 0
                else: player.vx = 0
            else: player.vx = 0
            break

        if player.vx > 0 and 0 <= next_rx < MAP_WIDTH and state.block_map[grid_y][next_rx] >= 1:
            hitting_block = True
            target_id = state.block_map[grid_y][next_rx]
            cells     = [(x, y) for y in range(MAP_HEIGHT) for x in range(MAP_WIDTH) if state.block_map[y][x] == target_id]
            can_push  = all(cx + 1 < MAP_WIDTH and (state.block_map[cy][cx + 1] == 0 or state.block_map[cy][cx + 1] == target_id) for cx, cy in cells)
            player.push_timer_l = 0
            if can_push:
                player.push_timer_r += 1
                if player.push_timer_r >= PUSH_DELAY:
                    for cx, cy in sorted(cells, key=lambda c: c[0], reverse=True):
                        state.block_map[cy][cx + 1] = target_id
                        state.block_map[cy][cx]     = 0
                    player.push_timer_r = 0
                else: player.vx = 0
            else: player.vx = 0
            break

    player.x += player.vx

    if not hitting_block:
        player.push_timer_l = 0
        player.push_timer_r = 0

    player.x = max(GAME_LEFT + P_HALF_W, min(GAME_RIGHT - P_HALF_W, player.x))

    if not player.is_grounded:
        player.vy += GRAVITY
    else:
        player.vy = 0
        if ks["w"] or ks["space"]:
            player.vy          = JUMP_SPEED
            player.is_grounded = False

    player.y           += player.vy
    player.is_grounded = False

    lfoot_x = int((player.x - (P_HALF_W - 2) - GAME_LEFT) / GRID_SIZE)
    rfoot_x = int((player.x + (P_HALF_W - 2) - GAME_LEFT) / GRID_SIZE)
    head_gy = int((player.y - P_HALF_H - GAME_TOP) / GRID_SIZE)
    foot_gy = int((player.y + P_HALF_H - GAME_TOP) / GRID_SIZE)

    for cx in [lfoot_x, rfoot_x]:
        if not (0 <= cx < MAP_WIDTH):
            continue
        if player.vy >= 0 and 0 <= foot_gy < MAP_HEIGHT:
            if is_solid_all(state, fb, cx, foot_gy):
                player.y           = foot_gy * GRID_SIZE + GAME_TOP - P_HALF_H
                player.is_grounded = True
                break
        if player.vy < 0 and 0 <= head_gy < MAP_HEIGHT:
            if is_solid_all(state, fb, cx, head_gy):
                player.y  = (head_gy + 1) * GRID_SIZE + GAME_TOP + P_HALF_H
                player.vy = 0
                break

    if player.y > GAME_BOTTOM - P_HALF_H:
        player.y           = GAME_BOTTOM - P_HALF_H
        player.is_grounded = True

    if player.invincible > 0:
        player.invincible   -= 1
        player.blink_visible = (player.invincible // 6) % 2 == 0
    else:
        player.blink_visible = True


# ============================================================
# 描画
# ============================================================
def draw_frame(canvas, state, fb, player, beam):
    canvas.delete("DYNAMIC")

    # グリッド線
    for gx in range(MAP_WIDTH + 1):
        x = GAME_LEFT + gx * GRID_SIZE
        canvas.create_line(x, GAME_TOP, x, GAME_BOTTOM, fill="#333333", dash=(8, 10), tag="DYNAMIC")
    for gy in range(MAP_HEIGHT + 1):
        y = GAME_TOP + gy * GRID_SIZE
        canvas.create_line(GAME_LEFT, y, GAME_RIGHT, y, fill="#333333", dash=(8, 10), tag="DYNAMIC")

    # ビーム予兆
    if beam.phase == "warning" and beam.blink_on:
        x0 = GAME_LEFT + beam.col * GRID_SIZE
        x1 = GAME_LEFT + (beam.col + BEAM_WIDTH) * GRID_SIZE
        canvas.create_rectangle(x0, GAME_TOP, x1, GAME_BOTTOM, fill="#550000", outline="", tag="DYNAMIC")

    # ビーム照射エフェクト
    if beam.phase == "firing":
        x0 = GAME_LEFT + beam.col * GRID_SIZE
        x1 = GAME_LEFT + (beam.col + BEAM_WIDTH) * GRID_SIZE
        canvas.create_rectangle(x0, GAME_TOP, x1, GAME_BOTTOM, fill="#ff2200", outline="", tag="DYNAMIC")
        canvas.create_rectangle(x0 + 4, GAME_TOP, x1 - 4, GAME_BOTTOM, fill="#ffffff", outline="", tag="DYNAMIC")

    # 固定済みブロック
    for y in range(MAP_HEIGHT):
        for x in range(MAP_WIDTH):
            val = state.block_map[y][x]
            if val >= 1:
                shape_id = val // 1000
                col = BLOCK_COLOR_MAP.get(shape_id, {"fill": "gray", "outline": "#444444"})
                canvas.create_rectangle(
                    GAME_LEFT +  x      * GRID_SIZE,
                    GAME_TOP  +  y      * GRID_SIZE,
                    GAME_LEFT + (x + 1) * GRID_SIZE,
                    GAME_TOP  + (y + 1) * GRID_SIZE,
                    fill=col["fill"], outline=col["outline"], tag="DYNAMIC"
                )

    # 落下中ブロック
    for gx, gy in fb.get_cells():
        canvas.create_rectangle(
            GAME_LEFT +  gx      * GRID_SIZE,
            GAME_TOP  +  gy      * GRID_SIZE,
            GAME_LEFT + (gx + 1) * GRID_SIZE,
            GAME_TOP  + (gy + 1) * GRID_SIZE,
            fill=fb.color, outline=fb.outline, tag="DYNAMIC"
        )

    # プレイヤー
    if player.blink_visible:
        fill_col = "#ffaaaa" if player.invincible > 0 else "lightgreen"
        canvas.create_rectangle(
            player.x - P_HALF_W, player.y - P_HALF_H,
            player.x + P_HALF_W, player.y + P_HALF_H,
            fill=fill_col, outline="white", tag="DYNAMIC"
        )

    if beam.phase == "warning":
        remain_sec = max(0, (BEAM_CYCLE - beam.timer) / 60)
        canvas.create_rectangle(
            (GAME_LEFT + GAME_RIGHT) // 2 - 300, GAME_TOP + 20,
            (GAME_LEFT + GAME_RIGHT) // 2 + 300, GAME_TOP + 110,
            fill="#111111", outline="#ff3333", width=2, tag="DYNAMIC"
        )
        canvas.create_text(
            (GAME_LEFT + GAME_RIGHT) // 2, GAME_TOP + 65,
            text=f"⚠WARNING: BEAM INBOUND ({remain_sec:.1f}s) ⚠️",
            fill="#ff3333", font=("Arial", 16, "bold"), justify="center", tag="DYNAMIC"
        )

    status_center_x = (40 + GAME_LEFT - 40) // 2

    canvas.create_text(
        status_center_x, GAME_TOP + 100,
        text=f"SCORE\n\n{state.score}",
        fill="white", font=("Arial", 28, "bold"), justify="center", tag="DYNAMIC"
    )

    controls_text = (
        "CONTROLS\n\n"
        "[A] / [D] : ← / →\n"
        "[W] / [Space] : ↑\n"
        "[S] : ブロック落下速度上昇\n\n"
        "[左クリック] / [右クリック]: 左回転 / 右回転\n"
        "Shift + クリック: ブロック移動\n"
        "[Esc] : Exit Game"
    )
    canvas.create_text(
        status_center_x, GAME_TOP + 420,
        text=controls_text,
        fill="#aaaaaa", font=("Arial", 14, "bold"), justify="center", tag="DYNAMIC"
    )

    hp_y  = GAME_BOTTOM - 120
    canvas.create_text(
        status_center_x, hp_y - 40,
        text="PLAYER HEALTH", fill="cyan", font=("Arial", 16, "bold"), tag="DYNAMIC"
    )
    heart = "♥"
    for i in range(MAX_HP):
        start_x = status_center_x - ((MAX_HP - 1) * 25)
        col = "#ff3333" if i < player.hp else "#444444"
        canvas.create_text(
            start_x + i * 50, hp_y,
            text=heart, fill=col,
            font=("Arial", 32, "bold"), tag="DYNAMIC"
        )

    map_left_x  = GAME_RIGHT + 80
    map_right_x = SCREEN_WIDTH - 80
    map_center_x = (map_left_x + map_right_x) // 2

    base_y = 900
    floor_gap = 160

    start_f = max(1, state.floor - 1)
    end_f   = start_f + 5

    for f in range(start_f, end_f + 1):
        fy = base_y - (f - start_f) * floor_gap

        if fy < GAME_TOP + 80:
            continue

        line_col = "yellow" if f == state.floor else "#444444"
        text_col = "yellow" if f == state.floor else "gray"

        canvas.create_line(map_left_x + 80, fy, map_right_x - 100, fy, fill=line_col, width=2, tag="DYNAMIC")
        canvas.create_text(map_left_x + 30, fy, text=f"{f} F", fill=text_col, font=("Arial", 24, "bold"), tag="DYNAMIC")

        if f == state.floor:
            progress_offset = (state.floor_lines / LINES_PER_FLOOR) * floor_gap
            current_indicator_y = fy - int(progress_offset)

            canvas.create_text(
                map_right_x - 40, current_indicator_y,
                text="◆ NOW", fill="#ff3333", font=("Arial", 16, "bold"), tag="DYNAMIC"
            )
            canvas.create_text(
                map_center_x, fy + 30,
                text=f"ASCENT PROGRESS: {state.floor_lines} / {LINES_PER_FLOOR} LINES",
                fill="lightgreen", font=("Arial", 12, "italic"), tag="DYNAMIC"
            )

# ============================================================
# メインループ ＆ 起動処理
# ============================================================
def main_proc():
    update_falling_block(state, fb)
    update_player(state, fb, player)
    check_crush(state, fb, player)
    update_beam(beam, player)
    draw_frame(canvas, state, fb, player, beam)
    root.after(16, main_proc)

def on_left_click(e):
    if not (GAME_LEFT <= e.x <= GAME_RIGHT and GAME_TOP <= e.y <= GAME_BOTTOM): return
    gx = int((e.x - GAME_LEFT) / GRID_SIZE)
    gy = int((e.y - GAME_TOP)  / GRID_SIZE)
    if (gx, gy) in fb.get_cells():
        if e.state & 0x0001:
            if not check_collision(state, fb, fb.x - 1, fb.y): fb.x -= 1
        else: fb.rotate_left(state)

def on_right_click(e):
    if not (GAME_LEFT <= e.x <= GAME_RIGHT and GAME_TOP <= e.y <= GAME_BOTTOM): return
    gx = int((e.x - GAME_LEFT) / GRID_SIZE)
    gy = int((e.y - GAME_TOP)  / GRID_SIZE)
    if (gx, gy) in fb.get_cells():
        if e.state & 0x0001:
            if not check_collision(state, fb, fb.x + 1, fb.y): fb.x += 1
        else: fb.rotate_right(state)

def key_down(e):
    sym = e.keysym.lower()
    if sym in state.key_states: state.key_states[sym] = True
    if sym == "space": state.key_states["space"] = True
    if sym in ("a", "d"): state.last_hkey = sym

def key_up(e):
    sym = e.keysym.lower()
    if sym in state.key_states: state.key_states[sym] = False
    if sym == "space": state.key_states["space"] = False

def close_game(e):
    root.destroy()

state  = GameState()
fb     = FallingBlock()
player = Player()
beam   = BeamState()

root = tkinter.Tk()
root.title("TETRIS x ACTION")
root.overrideredirect(True)
root.geometry(f"{SCREEN_WIDTH}x{SCREEN_HEIGHT}+0+0")
root.attributes("-topmost", True)
root.focus_force()

root.bind("<KeyPress>",   key_down)
root.bind("<KeyRelease>", key_up)
root.bind("<Escape>",     close_game)
root.bind("<Button-1>",   on_left_click)
root.bind("<Button-3>",   on_right_click)

canvas = tkinter.Canvas(root, width=SCREEN_WIDTH, height=SCREEN_HEIGHT, bg="#222222", highlightthickness=0)
canvas.pack()

canvas.create_rectangle(GAME_LEFT, GAME_TOP, GAME_RIGHT, GAME_BOTTOM, outline="white", width=2, tag="LAYOUT")
canvas.create_rectangle(40, GAME_TOP, GAME_LEFT - 40, GAME_BOTTOM, outline="cyan", width=1, tag="LAYOUT")
canvas.create_rectangle(GAME_RIGHT + 40, GAME_TOP, SCREEN_WIDTH - 40, GAME_BOTTOM, outline="yellow", width=2, tag="LAYOUT")

main_proc()
root.mainloop()