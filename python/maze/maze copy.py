import tkinter as tk
import random
from dataclasses import dataclass

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
    frontier = []  # (x, y, d) carve from (x,y) to neighbor d

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
    trail_id: int = None
    trail_points: list = None


class TwoPlayerMazeGame:
    def __init__(self, root):
        self.root = root
        self.root.title("Two-Player Perfect Maze Race (Branchy)")

        # Level parameters
        self.level = 1
        self.base_w = 10
        self.base_h = 10
        self.cell = 28
        self.margin = 16

        # Start column parameter (None -> center)
        self.start_x_override = None

        # UI
        self.topbar = tk.Frame(root)
        self.topbar.pack(fill="x")

        self.status = tk.Label(self.topbar, text="", anchor="w")
        self.status.pack(side="left", padx=10)

        self.reset_btn = tk.Button(self.topbar, text="Restart Level", command=self.restart_level)
        self.reset_btn.pack(side="right", padx=10)

        self.canvas = tk.Canvas(root, bg="white", highlightthickness=0)
        self.canvas.pack()

        self.message = tk.Label(root, text="", fg="black")
        self.message.pack(pady=6)

        self.root.bind("<KeyPress>", self.on_key)

        self.build_level()

    def level_size(self, lvl):
        w = self.base_w + (lvl - 1) * 2
        h = self.base_h + (lvl - 1) * 2
        return min(w, 30), min(h, 30)

    def choose_start_x(self):
        if self.start_x_override is not None:
            return max(0, min(self.w - 1, self.start_x_override))
        return self.w // 2

    def build_level(self):
        self.message.config(text="")
        self.w, self.h = self.level_size(self.level)

        self.walls = generate_maze_prim(self.w, self.h)

        # Same starting square, top row, near middle
        start_x = self.choose_start_x()
        start_y = 0

        self.p1 = Player("P1", "#2ecc71", start_x, start_y, trail_points=[])
        self.p2 = Player("P2", "#3498db", start_x, start_y, trail_points=[])

        # Single finish square
        self.goal_y = self.h - 1
        self.goal_x = random.randint(0, self.w - 1)

        width_px = self.margin * 2 + self.w * self.cell
        height_px = self.margin * 2 + self.h * self.cell
        self.canvas.config(width=width_px, height=height_px)

        self.canvas.delete("all")
        self.draw_maze()
        self.draw_goal()

        # Trails under players
        self.init_trail(self.p1)
        self.init_trail(self.p2)

        # Create player ovals
        self.p1.oval_id = self.canvas.create_oval(0, 0, 0, 0, fill=self.p1.color, outline="black", width=1)
        self.p2.oval_id = self.canvas.create_oval(0, 0, 0, 0, fill=self.p2.color, outline="black", width=1)

        # Position them correctly (including overlap handling)
        self.render_players()

        self.update_status()

    def restart_level(self):
        self.build_level()

    def next_level(self, winner_name):
        self.message.config(text=f"{winner_name} finished! Level up → {self.level + 1}")
        self.level += 1
        self.root.after(700, self.build_level)

    def update_status(self):
        self.status.config(text=f"Level {self.level} | Size: {self.w}x{self.h}")

    # ---- Drawing ----

    def cell_to_pixels(self, x, y):
        x0 = self.margin + x * self.cell
        y0 = self.margin + y * self.cell
        x1 = x0 + self.cell
        y1 = y0 + self.cell
        return x0, y0, x1, y1

    def cell_center(self, x, y):
        x0, y0, x1, y1 = self.cell_to_pixels(x, y)
        return (x0 + x1) / 2, (y0 + y1) / 2

    def draw_maze(self):
        for y in range(self.h):
            for x in range(self.w):
                x0, y0, x1, y1 = self.cell_to_pixels(x, y)
                w = self.walls[y][x]
                if w["N"]:
                    self.canvas.create_line(x0, y0, x1, y0, width=2)
                if w["E"]:
                    self.canvas.create_line(x1, y0, x1, y1, width=2)
                if w["S"]:
                    self.canvas.create_line(x0, y1, x1, y1, width=2)
                if w["W"]:
                    self.canvas.create_line(x0, y0, x0, y1, width=2)

    def draw_goal(self):
        x0, y0, x1, y1 = self.cell_to_pixels(self.goal_x, self.goal_y)
        self.canvas.create_rectangle(
            x0 + 3, y0 + 3, x1 - 3, y1 - 3,
            outline="black", width=2, fill="#fff4cc"
        )
        self.canvas.create_text((x0 + x1) / 2, (y0 + y1) / 2, text="★", font=("Arial", 14, "bold"))

    # ---- Continuous trails ----

    def init_trail(self, p):
        cx, cy = self.cell_center(p.x, p.y)
        p.trail_points = [(cx, cy)]
        eps = 0.001
        p.trail_id = self.canvas.create_line(
            cx, cy, cx + eps, cy + eps,
            width=2, fill=p.color, capstyle="round", joinstyle="round"
        )

    def extend_trail(self, p):
        cx, cy = self.cell_center(p.x, p.y)
        if (cx, cy) == p.trail_points[-1]:
            return
        p.trail_points.append((cx, cy))

        coords = []
        for px, py in p.trail_points:
            coords.extend([px, py])
        self.canvas.coords(p.trail_id, *coords)

    # ---- Overlap-aware rendering ----

    def render_players(self):
        """
        If both players share the same cell:
          draw two smaller circles, offset left/right.
        Else:
          draw normal circles centered in their respective cells.
        """
        same_cell = (self.p1.x == self.p2.x and self.p1.y == self.p2.y)

        if same_cell:
            x0, y0, x1, y1 = self.cell_to_pixels(self.p1.x, self.p1.y)
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2

            # Smaller radius and offsets so both are visible
            r = self.cell * 0.23
            offset = self.cell * 0.18

            # P1 left, P2 right
            self.canvas.coords(self.p1.oval_id, cx - offset - r, cy - r, cx - offset + r, cy + r)
            self.canvas.coords(self.p2.oval_id, cx + offset - r, cy - r, cx + offset + r, cy + r)
        else:
            self.position_player_normal(self.p1)
            self.position_player_normal(self.p2)

        # Keep players on top of trails and walls
        self.canvas.tag_raise(self.p1.oval_id)
        self.canvas.tag_raise(self.p2.oval_id)

    def position_player_normal(self, p):
        x0, y0, x1, y1 = self.cell_to_pixels(p.x, p.y)
        pad = 6
        self.canvas.coords(p.oval_id, x0 + pad, y0 + pad, x1 - pad, y1 - pad)

    # ---- Movement ----

    def can_move(self, x, y, direction):
        if self.walls[y][x][direction]:
            return False
        dx, dy = DIRS[direction]
        nx, ny = x + dx, y + dy
        return 0 <= nx < self.w and 0 <= ny < self.h

    def try_move(self, player, direction):
        if not self.can_move(player.x, player.y, direction):
            return

        dx, dy = DIRS[direction]
        player.x += dx
        player.y += dy

        self.extend_trail(player)
        self.render_players()

        if player.x == self.goal_x and player.y == self.goal_y:
            self.next_level(player.name)

    # ---- Input ----

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
