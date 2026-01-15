import tkinter as tk
import random
from dataclasses import dataclass
from collections import deque

DIRS = {
    "N": (0, -1),
    "E": (1, 0),
    "S": (0, 1),
    "W": (-1, 0),
}
OPP = {"N": "S", "S": "N", "E": "W", "W": "E"}


def generate_maze_prim(w, h, seed=None):
    """
    Perfect maze (unique solution) using randomized Prim's algorithm on a grid.
    Produces lots of branching and short dead ends.
    """
    rng = random.Random(seed)

    walls = [[{"N": True, "E": True, "S": True, "W": True} for _ in range(w)] for _ in range(h)]
    in_maze = [[False for _ in range(w)] for _ in range(h)]
    frontier = []

    def add_frontier_edges(x, y):
        for d, (dx, dy) in DIRS.items():
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not in_maze[ny][nx]:
                frontier.append((x, y, d))

    sx, sy = rng.randrange(w), rng.randrange(h)
    in_maze[sy][sx] = True
    add_frontier_edges(sx, sy)

    while frontier:
        idx = rng.randrange(len(frontier))
        x, y, d = frontier.pop(idx)
        dx, dy = DIRS[d]
        nx, ny = x + dx, y + dy
        if not (0 <= nx < w and 0 <= ny < h):
            continue
        if in_maze[ny][nx]:
            continue

        walls[y][x][d] = False
        walls[ny][nx][OPP[d]] = False

        in_maze[ny][nx] = True
        add_frontier_edges(nx, ny)

    return walls


@dataclass
class Player:
    name: str
    color: str
    x: int
    y: int
    oval_id: int = None
    trail_points: list = None


class TwoPlayerMazeGame:
    def __init__(self, root):
        self.root = root
        self.root.title("Two-Player Maze Race (Fog + Apples)")

        # Level parameters
        self.level = 1
        self.base_w = 10
        self.base_h = 10
        self.cell = 28
        self.margin = 16

        # Start column parameter (None -> center)
        self.start_x_override = None

        # UI topbar
        self.topbar = tk.Frame(root)
        self.topbar.pack(fill="x")

        self.status = tk.Label(self.topbar, text="", anchor="w")
        self.status.pack(side="left", padx=10)

        # Apple HUD (top right)
        self.apples_frame = tk.Frame(self.topbar)
        self.apples_frame.pack(side="right", padx=10)
        self.apple_canvases = []
        for _ in range(5):
            c = tk.Canvas(self.apples_frame, width=18, height=18, highlightthickness=0, bg=self.topbar.cget("bg"))
            c.pack(side="left", padx=2)
            self.apple_canvases.append(c)

        self.reset_btn = tk.Button(self.topbar, text="Restart Level", command=self.restart_level)
        self.reset_btn.pack(side="right", padx=8)

        # Peek option (0..5). Default 0 per request.
        self.peek_var = tk.IntVar(value=0)
        tk.Label(self.topbar, text="Peek:").pack(side="right", padx=(6, 2))
        self.peek_spin = tk.Spinbox(
            self.topbar,
            from_=0, to=5,
            width=2,
            textvariable=self.peek_var,
            command=self.on_peek_change
        )
        self.peek_spin.pack(side="right", padx=(0, 8))

        # Glass walls checkbox. Default False per request.
        self.glass_var = tk.BooleanVar(value=False)
        self.glass_cb = tk.Checkbutton(
            self.topbar,
            text="Glass walls",
            variable=self.glass_var,
            command=self.on_toggle_glass
        )
        self.glass_cb.pack(side="right", padx=8)

        self.canvas = tk.Canvas(root, highlightthickness=0, bg="black")
        self.canvas.pack()

        self.message = tk.Label(root, text="", fg="black")
        self.message.pack(pady=6)

        self.root.bind("<KeyPress>", self.on_key)

        self.build_level()

    # -----------------------
    # Level + sizing
    # -----------------------

    def level_size(self, lvl):
        w = self.base_w + (lvl - 1) * 2
        h = self.base_h + (lvl - 1) * 2
        return min(w, 30), min(h, 30)

    def choose_start_x(self):
        if self.start_x_override is not None:
            return max(0, min(self.w - 1, self.start_x_override))
        return self.w // 2

    def apple_target_for_size(self, w, h):
        """
        Starts at 3, ramps up to 5 for largest mazes.
        """
        m = max(w, h)
        # 10 -> 3, ~16 -> 4, ~22+ -> 5
        if m >= 22:
            return 5
        if m >= 16:
            return 4
        return 3

    def place_apples(self):
        """
        Place apples in random cells not equal to start or goal.
        """
        rng = random.Random()
        target = self.apple_target_for_size(self.w, self.h)
        self.apple_target = target
        self.apples_collected = 0

        forbidden = {(self.start_x, self.start_y), (self.goal_x, self.goal_y)}
        apples = set()

        # Prefer spreading them out: simple retry method
        attempts = 0
        while len(apples) < target and attempts < 20000:
            attempts += 1
            x = rng.randrange(self.w)
            y = rng.randrange(self.h)
            if (x, y) in forbidden or (x, y) in apples:
                continue
            # avoid clustering too close to start if possible
            if abs(x - self.start_x) + abs(y - self.start_y) < 3:
                continue
            apples.add((x, y))

        # if we were too strict, relax
        while len(apples) < target:
            x = rng.randrange(self.w)
            y = rng.randrange(self.h)
            if (x, y) in forbidden or (x, y) in apples:
                continue
            apples.add((x, y))

        self.apples = apples

    def build_level(self):
        self.message.config(text="")
        self.w, self.h = self.level_size(self.level)
        self.walls = generate_maze_prim(self.w, self.h)

        # Players start on same square at top middle
        self.start_x = self.choose_start_x()
        self.start_y = 0

        self.p1 = Player("P1", "#2ecc71", self.start_x, self.start_y, trail_points=[])
        self.p2 = Player("P2", "#3498db", self.start_x, self.start_y, trail_points=[])

        # Finish is one cell on bottom row
        self.goal_y = self.h - 1
        self.goal_x = random.randint(0, self.w - 1)

        # Apples
        self.place_apples()
        self.update_apples_hud()

        width_px = self.margin * 2 + self.w * self.cell
        height_px = self.margin * 2 + self.h * self.cell
        self.canvas.config(width=width_px, height=height_px)

        # Reset reveal
        self.revealed_cells = set()

        # Initial visibility
        self.update_visibility()

        self.redraw_world()
        self.update_status()

    def restart_level(self):
        self.build_level()

    def next_level(self, winner_name):
        self.message.config(text=f"{winner_name} finished! Level up → {self.level + 1}")
        self.level += 1
        self.root.after(700, self.build_level)

    def update_status(self):
        self.status.config(text=f"Level {self.level} | Size: {self.w}x{self.h}")

    # -----------------------
    # Apple HUD
    # -----------------------

    def draw_apple_icon(self, canvas, filled: bool):
        canvas.delete("all")

        # Simple apple: body circle + leaf. Outline for missing apples, filled for collected.
        if filled:
            body_fill = "#d64545"     # red
            body_outline = "#2a2a2a"
            leaf_fill = "#3aa655"     # green
            leaf_outline = "#2a2a2a"
        else:
            body_fill = ""            # no fill -> outline only
            body_outline = "#7a7a7a"
            leaf_fill = ""
            leaf_outline = "#7a7a7a"

        # Body
        canvas.create_oval(3, 4, 15, 16, fill=body_fill, outline=body_outline, width=2)
        # Small notch / shine suggestion (subtle)
        if filled:
            canvas.create_oval(6, 7, 9, 10, fill="#f0b0b0", outline="")

        # Leaf
        canvas.create_oval(10, 2, 16, 8, fill=leaf_fill, outline=leaf_outline, width=2)

    def update_apples_hud(self):
        # show up to 5 outlines; only first apple_target are "active"
        for i, c in enumerate(self.apple_canvases):
            if i < self.apple_target:
                filled = (i < self.apples_collected)
                self.draw_apple_icon(c, filled=filled)
                c.configure(state="normal")
            else:
                c.delete("all")

    # -----------------------
    # Geometry helpers
    # -----------------------

    def cell_to_pixels(self, x, y):
        x0 = self.margin + x * self.cell
        y0 = self.margin + y * self.cell
        x1 = x0 + self.cell
        y1 = y0 + self.cell
        return x0, y0, x1, y1

    def cell_center(self, x, y):
        x0, y0, x1, y1 = self.cell_to_pixels(x, y)
        return (x0 + x1) / 2, (y0 + y1) / 2

    # -----------------------
    # Visibility model
    # -----------------------

    def visible_cells_los(self, x, y):
        visible = {(x, y)}
        for d, (dx, dy) in DIRS.items():
            cx, cy = x, y
            while True:
                if self.walls[cy][cx][d]:
                    break
                nx, ny = cx + dx, cy + dy
                if not (0 <= nx < self.w and 0 <= ny < self.h):
                    break
                visible.add((nx, ny))
                cx, cy = nx, ny
        return visible

    def neighbors_open(self, x, y):
        for d, (dx, dy) in DIRS.items():
            if not self.walls[y][x][d]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < self.w and 0 <= ny < self.h:
                    yield nx, ny

    def expand_peek(self, seeds, radius):
        if radius <= 0:
            return set(seeds)

        seen = set(seeds)
        q = deque((cell, 0) for cell in seeds)
        while q:
            (x, y), dist = q.popleft()
            if dist == radius:
                continue
            for nx, ny in self.neighbors_open(x, y):
                if (nx, ny) not in seen:
                    seen.add((nx, ny))
                    q.append(((nx, ny), dist + 1))
        return seen

    def update_visibility(self):
        peek = int(self.peek_var.get())
        v = set()
        v |= self.expand_peek(self.visible_cells_los(self.p1.x, self.p1.y), peek)
        v |= self.expand_peek(self.visible_cells_los(self.p2.x, self.p2.y), peek)
        for cell in v:
            self.revealed_cells.add(cell)

    # -----------------------
    # Drawing
    # -----------------------

    def redraw_world(self):
        glass = self.glass_var.get()

        if glass:
            self.canvas.config(bg="white")
            self.canvas.delete("all")
            self.draw_full_maze_black_on_white()
            self.draw_goal_full()
            self.draw_apples(glass_mode=True)
            self.draw_trails()
            self.draw_players()
        else:
            self.canvas.config(bg="black")
            self.canvas.delete("all")
            self.draw_revealed_map_white_floor_black_walls()
            self.draw_goal_fog()
            self.draw_apples(glass_mode=False)
            self.draw_trails()
            self.draw_players()

    def draw_full_maze_black_on_white(self):
        for y in range(self.h):
            for x in range(self.w):
                x0, y0, x1, y1 = self.cell_to_pixels(x, y)
                w = self.walls[y][x]
                if w["N"]:
                    self.canvas.create_line(x0, y0, x1, y0, width=2, fill="black")
                if w["E"]:
                    self.canvas.create_line(x1, y0, x1, y1, width=2, fill="black")
                if w["S"]:
                    self.canvas.create_line(x0, y1, x1, y1, width=2, fill="black")
                if w["W"]:
                    self.canvas.create_line(x0, y0, x0, y1, width=2, fill="black")

    def draw_goal_full(self):
        x0, y0, x1, y1 = self.cell_to_pixels(self.goal_x, self.goal_y)
        self.canvas.create_rectangle(
            x0 + 3, y0 + 3, x1 - 3, y1 - 3,
            outline="black", width=2, fill="#ffd54d"
        )
        self.canvas.create_text((x0 + x1) / 2, (y0 + y1) / 2, text="★",
                                font=("Arial", 14, "bold"), fill="black")

    def draw_goal_fog(self):
        if (self.goal_x, self.goal_y) not in self.revealed_cells:
            return
        x0, y0, x1, y1 = self.cell_to_pixels(self.goal_x, self.goal_y)
        self.canvas.create_rectangle(
            x0 + 3, y0 + 3, x1 - 3, y1 - 3,
            outline="black", width=2, fill="#ffd54d"
        )
        self.canvas.create_text((x0 + x1) / 2, (y0 + y1) / 2, text="★",
                                font=("Arial", 14, "bold"), fill="black")

    def draw_apples(self, glass_mode: bool):
        """
        Draw apples:
          - Glass mode: all uncollected apples visible.
          - Fog mode: only visible if the cell is revealed.
        """
        for (ax, ay) in self.apples:
            if not glass_mode and (ax, ay) not in self.revealed_cells:
                continue

            x0, y0, x1, y1 = self.cell_to_pixels(ax, ay)
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            r = self.cell * 0.18

            # red apple body + green leaf
            self.canvas.create_oval(cx - r, cy - r, cx + r, cy + r, fill="#d64545", outline="black", width=1)
            self.canvas.create_oval(cx + r * 0.2, cy - r * 1.1, cx + r * 1.2, cy - r * 0.2,
                                    fill="#3aa655", outline="black", width=1)

    def draw_revealed_map_white_floor_black_walls(self):
        """
        Fog mode:
        - revealed cells: white floor
        - door spill: very wide (90% cell width) and medium depth (half a cell)
        - walls: black, thin, drawn once per segment (maze-like)
        """
        spill_depth = int(self.cell * 0.35)            # half-cell depth outward
        door_half = int(self.cell * 0.48)              # 90% total width (0.45 each side)
        wall_w = 2

        # 1) Paint revealed floor
        for (x, y) in self.revealed_cells:
            x0, y0, x1, y1 = self.cell_to_pixels(x, y)
            self.canvas.create_rectangle(x0, y0, x1, y1, outline="", fill="white")

        # 2) Door spill: curved "light" bulb through openings
        for (x, y) in self.revealed_cells:
            x0, y0, x1, y1 = self.cell_to_pixels(x, y)
            w = self.walls[y][x]
            cx, cy = (x0 + x1) // 2, (y0 + y1) // 2

            # We keep the oval straddling the doorway boundary, but make it MUCH wider.
            # Depth is half-cell outward; a bit of "inward" overlap (depth/2) makes it feel continuous.
            inward = spill_depth // 2

            if not w["N"] and y > 0:
                self.canvas.create_oval(
                    cx - door_half, y0 - spill_depth,
                    cx + door_half, y0 + inward,
                    fill="white", outline=""
                )
            if not w["S"] and y < self.h - 1:
                self.canvas.create_oval(
                    cx - door_half, y1 - inward,
                    cx + door_half, y1 + spill_depth,
                    fill="white", outline=""
                )
            if not w["W"] and x > 0:
                self.canvas.create_oval(
                    x0 - spill_depth, cy - door_half,
                    x0 + inward,      cy + door_half,
                    fill="white", outline=""
                )
            if not w["E"] and x < self.w - 1:
                self.canvas.create_oval(
                    x1 - inward,      cy - door_half,
                    x1 + spill_depth, cy + door_half,
                    fill="white", outline=""
                )

        def is_revealed(xx, yy):
            return (xx, yy) in self.revealed_cells

        # 3) Walls drawn ONCE per segment (thin maze lines)
        for (x, y) in self.revealed_cells:
            x0, y0, x1, y1 = self.cell_to_pixels(x, y)
            w = self.walls[y][x]

            # North + West always
            if w["N"]:
                self.canvas.create_line(x0, y0, x1, y0, width=wall_w, fill="black")
            if w["W"]:
                self.canvas.create_line(x0, y0, x0, y1, width=wall_w, fill="black")

            # East only if neighbor not revealed or boundary
            if w["E"]:
                if x == self.w - 1 or not is_revealed(x + 1, y):
                    self.canvas.create_line(x1, y0, x1, y1, width=wall_w, fill="black")

            # South only if neighbor not revealed or boundary
            if w["S"]:
                if y == self.h - 1 or not is_revealed(x, y + 1):
                    self.canvas.create_line(x0, y1, x1, y1, width=wall_w, fill="black")

    # -----------------------
    # Trails + players
    # -----------------------

    def ensure_trails_initialized(self):
        if not self.p1.trail_points:
            self.p1.trail_points = [self.cell_center(self.p1.x, self.p1.y)]
        if not self.p2.trail_points:
            self.p2.trail_points = [self.cell_center(self.p2.x, self.p2.y)]

    def extend_trail(self, p):
        cx, cy = self.cell_center(p.x, p.y)
        if p.trail_points and (cx, cy) == p.trail_points[-1]:
            return
        p.trail_points.append((cx, cy))

    def draw_trails(self):
        self.draw_polyline(self.p1.trail_points, self.p1.color)
        self.draw_polyline(self.p2.trail_points, self.p2.color)

    def draw_polyline(self, points, color):
        if not points:
            return
        coords = []
        for (px, py) in points:
            coords.extend([px, py])
        if len(points) == 1:
            coords.extend([points[0][0] + 0.001, points[0][1] + 0.001])
        self.canvas.create_line(*coords, width=2, fill=color, capstyle="round", joinstyle="round")

    def draw_players(self):
        outline = "black"
        p1_id = self.canvas.create_oval(0, 0, 0, 0, fill=self.p1.color, outline=outline, width=1)
        p2_id = self.canvas.create_oval(0, 0, 0, 0, fill=self.p2.color, outline=outline, width=1)

        same = (self.p1.x == self.p2.x and self.p1.y == self.p2.y)
        if same:
            x0, y0, x1, y1 = self.cell_to_pixels(self.p1.x, self.p1.y)
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            r = self.cell * 0.23
            offset = self.cell * 0.18
            self.canvas.coords(p1_id, cx - offset - r, cy - r, cx - offset + r, cy + r)
            self.canvas.coords(p2_id, cx + offset - r, cy - r, cx + offset + r, cy + r)
        else:
            self.position_player_normal(p1_id, self.p1.x, self.p1.y)
            self.position_player_normal(p2_id, self.p2.x, self.p2.y)

    def position_player_normal(self, oid, x, y):
        x0, y0, x1, y1 = self.cell_to_pixels(x, y)
        pad = 6
        self.canvas.coords(oid, x0 + pad, y0 + pad, x1 - pad, y1 - pad)

    # -----------------------
    # UI callbacks
    # -----------------------

    def on_toggle_glass(self):
        self.redraw_world()

    def on_peek_change(self):
        self.update_visibility()
        self.redraw_world()

    # -----------------------
    # Movement + apples
    # -----------------------

    def can_move(self, x, y, direction):
        if self.walls[y][x][direction]:
            return False
        dx, dy = DIRS[direction]
        nx, ny = x + dx, y + dy
        return 0 <= nx < self.w and 0 <= ny < self.h

    def check_apple_collect(self):
        """
        If either player is on an apple, collect it.
        """
        for pos in [(self.p1.x, self.p1.y), (self.p2.x, self.p2.y)]:
            if pos in self.apples:
                self.apples.remove(pos)
                self.apples_collected += 1
                self.update_apples_hud()

    def try_move(self, player, direction):
        if not self.can_move(player.x, player.y, direction):
            return

        self.ensure_trails_initialized()

        dx, dy = DIRS[direction]
        player.x += dx
        player.y += dy

        self.extend_trail(player)

        # Update reveal (collaborative)
        self.update_visibility()

        # Collect apples (collaborative)
        self.check_apple_collect()

        # Redraw
        self.redraw_world()

        # Win condition
        if player.x == self.goal_x and player.y == self.goal_y:
            self.next_level(player.name)

    # -----------------------
    # Input
    # -----------------------

    def on_key(self, event):
        key = event.keysym

        # Player 1 (WASD)
        if key in ("w", "W"):
            self.try_move(self.p1, "N")
        elif key in ("d", "D"):
            self.try_move(self.p1, "E")
        elif key in ("s", "S"):
            self.try_move(self.p1, "S")
        elif key in ("a", "A"):
            self.try_move(self.p1, "W")

        # Player 2 (Arrows)
        elif key == "Up":
            self.try_move(self.p2, "N")
        elif key == "Right":
            self.try_move(self.p2, "E")
        elif key == "Down":
            self.try_move(self.p2, "S")
        elif key == "Left":
            self.try_move(self.p2, "W")


def main():
    root = tk.Tk()
    TwoPlayerMazeGame(root)
    root.mainloop()


if __name__ == "__main__":
    main()
