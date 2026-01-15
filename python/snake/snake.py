import tkinter as tk
import random

CELL = 20
GRID_W, GRID_H = 30, 30  # 600x600
W, H = GRID_W * CELL, GRID_H * CELL

root = tk.Tk()
root.title("Snake (paused) — SPACE to start, P to pause")

canvas = tk.Canvas(root, width=W, height=H, bg="#AAAAAA", highlightthickness=0)
canvas.pack()

speed_ms = 350

direction = (1, 0)
snake = []
food = (0, 0)
paused = True
running = True

# Grow by 2 per food
grow_pending = 0

# Lives
lives = 3

# Coral pattern after the head:
# 3 black, 1 yellow, 3 red, 1 yellow, repeat
CORAL_PATTERN = (
    ["#000000"] * 3 +
    ["#FFD400"] +
    ["#FF0000"] * 3 +
    ["#FFD400"]
)

# When lives hit 0, enter a game-over menu state
game_over_menu = False

def new_food():
    while True:
        f = (random.randrange(GRID_W), random.randrange(GRID_H))
        if f not in snake:
            return f

def init_snake_with_length(length):
    cx, cy = GRID_W // 2, GRID_H // 2
    return [(cx - i, cy) for i in range(length)]

def reset_round(keep_length=True):
    """Reset snake/food/direction for a new life/round, optionally keeping current length."""
    global direction, snake, food, paused, running, grow_pending, game_over_menu
    direction = (1, 0)

    length = 3
    if keep_length and snake:
        length = len(snake) + grow_pending

    snake = init_snake_with_length(length)
    grow_pending = 0
    food = new_food()

    paused = True
    running = True
    game_over_menu = False
    root.title("Snake (paused) — SPACE to start, P to pause")
    draw()

def full_restart():
    """Full restart: reset lives and length to starting length."""
    global lives
    lives = 3
    reset_round(keep_length=False)

def continue_after_game_over():
    """Continue after lives are exhausted: restore 3 lives and keep current length."""
    global lives
    lives = 3
    reset_round(keep_length=True)

def draw_overlay(text):
    canvas.create_text(
        W // 2, H // 2,
        text=text,
        fill="black",
        font=("Helvetica", 18, "bold"),
        justify="center"
    )

def draw_lives():
    r = 7
    pad = 8
    spacing = 18
    for i in range(lives):
        cx = W - pad - r - i * spacing
        cy = pad + r
        canvas.create_oval(cx - r, cy - r, cx + r, cy + r, fill="#FF3333", outline="")

def segment_color(i):
    if i == 0:
        return "white"  # head
    return CORAL_PATTERN[(i - 1) % len(CORAL_PATTERN)]

def draw():
    canvas.delete("all")

    # snake
    for i, (x, y) in enumerate(snake):
        canvas.create_rectangle(
            x * CELL, y * CELL, (x + 1) * CELL, (y + 1) * CELL,
            fill=segment_color(i), outline=""
        )

    # food
    fx, fy = food
    canvas.create_rectangle(
        fx * CELL, fy * CELL, (fx + 1) * CELL, (fy + 1) * CELL,
        fill="#FF3333", outline=""
    )

    draw_lives()

    if game_over_menu:
        draw_overlay("Out of lives!\nC = continue (same length)\nR = restart")
    elif paused and running:
        draw_overlay("Paused\nSPACE = start\nP = pause")

def lose_life():
    global lives, running, game_over_menu
    lives -= 1
    if lives <= 0:
        running = False
        game_over_menu = True
        root.title("Out of lives — C to continue or R to restart")
    else:
        reset_round(keep_length=True)

def step():
    global food, running, paused, grow_pending

    if game_over_menu:
        # Just keep the menu drawn
        draw()
        root.after(speed_ms, step)
        return

    if not running:
        # Shouldn't really happen now (we use game_over_menu), but keep safe.
        draw()
        root.after(speed_ms, step)
        return

    if paused:
        root.after(speed_ms, step)
        return

    hx, hy = snake[0]
    dx, dy = direction
    head = (hx + dx, hy + dy)

    # collision: walls/self
    if not (0 <= head[0] < GRID_W and 0 <= head[1] < GRID_H) or head in snake:
        lose_life()
        root.after(speed_ms, step)
        return

    snake.insert(0, head)

    if head == food:
        food = new_food()
        grow_pending += 2
    else:
        if grow_pending > 0:
            grow_pending -= 1
        else:
            snake.pop()

    draw()
    root.after(speed_ms, step)

def on_key(event):
    global direction, paused
    k = event.keysym
    dx, dy = direction

    # Game-over menu controls
    if game_over_menu:
        if k in ("c", "C"):
            continue_after_game_over()
        elif k in ("r", "R"):
            full_restart()
        return

    # Start / resume
    if k in ("space", "Space"):
        if running:
            paused = False
            root.title("Snake")
        return

    # Pause toggle
    if k in ("p", "P"):
        if running:
            paused = not paused
            root.title("Snake (paused)" if paused else "Snake")
        return

    # Restart anytime (full reset)
    if k in ("r", "R"):
        full_restart()
        return

    # Direction changes
    if k == "Up" and dy != 1:
        direction = (0, -1)
    elif k == "Down" and dy != -1:
        direction = (0, 1)
    elif k == "Left" and dx != 1:
        direction = (-1, 0)
    elif k == "Right" and dx != -1:
        direction = (1, 0)

root.bind("<KeyPress>", on_key)

# Start game
full_restart()
root.after(speed_ms, step)
root.mainloop()
