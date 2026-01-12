import math
import tkinter as tk
from dataclasses import dataclass

# -----------------------------
# Physics helpers
# -----------------------------
G = 6.67430e-11

def vec_len(x, y):
    return math.hypot(x, y)

def unit(x, y):
    r = math.hypot(x, y)
    if r == 0:
        return 0.0, 0.0
    return x / r, y / r

def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x

# -----------------------------
# Bodies
# -----------------------------
@dataclass
class Body:
    name: str
    mass: float
    radius: float
    x: float
    y: float
    vx: float = 0.0
    vy: float = 0.0
    color: str = "white"
    fixed: bool = False

# -----------------------------
# Game
# -----------------------------
class RocketGravityGame:
    def __init__(self, root):
        self.root = root
        self.root.title("Rocket Gravity Game (Tkinter)")

        self.W, self.H = 1000, 700
        self.canvas = tk.Canvas(root, width=self.W, height=self.H, bg="#0b1020", highlightthickness=0)
        self.canvas.grid(row=0, column=0, sticky="nsew")

        self.panel = tk.Frame(root, bg="#141a2e")
        self.panel.grid(row=0, column=1, sticky="ns")

        root.grid_rowconfigure(0, weight=1)
        root.grid_columnconfigure(0, weight=1)

        # Player knobs
        self.angle_deg = tk.DoubleVar(value=66.0)    # tilt from vertical: 0=up, 90=sideways
        self.burn_s    = tk.DoubleVar(value=120.0)
        self.stages    = tk.IntVar(value=1)

        self.level = 1
        self.prev_level = 1
        self.state = "setup"  # setup, flying, finished
        self.message = ""

        # View
        self.view_cx = 0.0
        self.view_cy = 0.0
        self.px_per_m = 1e-6

        # Time warp (sim seconds per real second)
        self.time_warp = 120.0

        # Frame + integration controls
        self.fps = 60.0
        # With 600x warp, keep smaller microsteps for stability.
        self.max_step = 0.12  # max SIM seconds per micro-step

        # Rocket state
        self.rocket_x = 0.0
        self.rocket_y = 0.0
        self.rocket_vx = 0.0
        self.rocket_vy = 0.0
        self.rocket_t = 0.0
        self.rocket_alive = True

        # Option A: fixed inertial burn direction (set at launch; held constant during burn)
        self.burn_dir_x = 0.0
        self.burn_dir_y = 1.0

        self.trail = []
        # Trail is sampled (not every micro-step) so it can remain persistent
        # for the whole trajectory without truncation.
        self.last_trail_sample_t = None
        self.trail_sample_period = 0.5  # sim seconds between breadcrumbs (earth levels)

        # Goal stuff
        self.target_angle = None  # level 1 target on Earth
        self.goal_orbit_ok_time = 0.0
        self.level2_orbit_achieved = False

        # Fanfare
        self.fanfare_timer = 0.0
        self.fanfare_duration = 2.5  # seconds (real time)
        self.last_dt_real = 1.0 / self.fps

        self.bodies = []

        self._build_ui()
        self._bind_keys()
        self._build_level_dropdown()

        self.set_level(1)
        self.root.after(16, self.loop)

    # ---------------- UI ----------------
    def _build_ui(self):
        tk.Label(self.panel, text="Rocket Gravity", fg="white", bg="#141a2e",
                 font=("Arial", 16, "bold")).pack(pady=(12, 6))

        self.level_label = tk.Label(self.panel, text="", fg="#ffe58a", bg="#141a2e",
                                    font=("Arial", 12, "bold"), justify="left")
        self.level_label.pack(padx=10, pady=(0, 8), anchor="w")

        self.msg_label = tk.Label(self.panel, text="", fg="#e5e7ff", bg="#141a2e",
                                  justify="left", wraplength=280)
        self.msg_label.pack(padx=10, pady=(0, 12), anchor="w")

        tk.Label(self.panel, text="Launch angle (tilt)", fg="white", bg="#141a2e").pack(anchor="w", padx=10)
        self.angle_scale = tk.Scale(self.panel, from_=0, to=85, orient="horizontal", length=250,
                                    variable=self.angle_deg, bg="#141a2e", fg="white",
                                    highlightthickness=0, troughcolor="#25304f")
        self.angle_scale.pack(padx=10, pady=(0, 12))

        tk.Label(self.panel, text="Burn duration (s)", fg="white", bg="#141a2e").pack(anchor="w", padx=10)
        self.burn_scale = tk.Scale(self.panel, from_=20, to=200, orient="horizontal", length=250,
                                   variable=self.burn_s, bg="#141a2e", fg="white",
                                   highlightthickness=0, troughcolor="#25304f")
        self.burn_scale.pack(padx=10, pady=(0, 12))

        tk.Label(self.panel, text="Stages", fg="white", bg="#141a2e").pack(anchor="w", padx=10)
        self.stage_scale = tk.Scale(self.panel, from_=1, to=4, orient="horizontal", length=250,
                                    variable=self.stages, bg="#141a2e", fg="white",
                                    highlightthickness=0, troughcolor="#25304f")
        self.stage_scale.pack(padx=10, pady=(0, 12))

        tk.Label(self.panel, text="Controls:", fg="white", bg="#141a2e",
                 font=("Arial", 11, "bold")).pack(anchor="w", padx=10, pady=(4, 0))
        tk.Label(self.panel, text="SPACE launch / restart\nESC reset\n1–5 levels",
                 fg="#cbd5ff", bg="#141a2e", justify="left").pack(anchor="w", padx=10, pady=(0, 10))

    def _build_level_dropdown(self):
        # Dropdown in top-right for debugging convenience
        self.level_var = tk.StringVar()
        self.level_options = [
            ("Level 1: Earth hop", 1),
            ("Level 2: Orbit", 2),
            ("Level 3: Moon", 3),
            ("Level 4: Mars", 4),
            ("Level 5: Assist", 5),
        ]
        self.level_var.set(self.level_options[0][0])

        def on_pick(selection):
            # Map label -> level
            for label, lvl in self.level_options:
                if label == selection:
                    self.set_level(lvl)
                    return

        self.level_menu = tk.OptionMenu(
            self.canvas,
            self.level_var,
            *[label for label, _ in self.level_options],
            command=on_pick
        )
        self.level_menu.configure(
            bg="#141a2e", fg="white", activebackground="#25304f", activeforeground="white",
            highlightthickness=0, bd=0
        )
        # Place into canvas
        self.level_menu_window = self.canvas.create_window(
            self.W - 10, 10, anchor="ne", window=self.level_menu
        )

        # Keep it in top-right if window size ever changes (rare here, but safe)
        self.canvas.bind("<Configure>", self._on_canvas_resize)

    def _on_canvas_resize(self, event):
        # Update stored width/height and reposition dropdown
        self.W, self.H = event.width, event.height
        self.canvas.coords(self.level_menu_window, self.W - 10, 10)

    def _bind_keys(self):
        self.root.bind("<space>", lambda e: self.on_space())
        self.root.bind("<Escape>", lambda e: self.reset_level())
        for i in range(1, 6):
            self.root.bind(str(i), lambda e, k=i: self.set_level(k))

    # ---------------- Levels ----------------
    def set_level(self, lvl: int):
        self.prev_level = self.level
        self.level = lvl
        # sync dropdown label
        for label, n in self.level_options:
            if n == lvl:
                self.level_var.set(label)
                break
        self.reset_level()

    def reset_level(self):
        self.state = "setup"
        self.message = ""
        self.trail = []
        self.last_trail_sample_t = None
        self.rocket_t = 0.0
        self.rocket_alive = True
        self.goal_orbit_ok_time = 0.0
        self.level2_orbit_achieved = False

        self.fanfare_timer = 0.0

        # reset burn direction
        self.burn_dir_x, self.burn_dir_y = 0.0, 1.0

        if self.level in (1, 2, 3):
            self._setup_earth_system()
        else:
            self._setup_solar_system()

        # Level 2 should start from the same baseline knobs as Level 1.
        # Only apply on entry to Level 2 so restarting doesn't erase player tweaks.
        if self.level == 2 and self.prev_level != 2:
            self.angle_deg.set(66.0)
            self.burn_s.set(120.0)
            self.stages.set(1)

        self._place_rocket()
        self._apply_stage_limits()
        self._update_text()

    def _apply_stage_limits(self):
        if self.level == 1:
            self.stages.set(1)
            self.stage_scale.config(from_=1, to=1, state="disabled")
        elif self.level == 2:
            self.stage_scale.config(from_=1, to=2, state="normal")
            self.stages.set(int(clamp(self.stages.get(), 1, 2)))
        else:
            self.stage_scale.config(from_=1, to=4, state="normal")
            self.stages.set(int(clamp(self.stages.get(), 1, 4)))

    def _update_text(self):
        names = {
            1: "Level 1: Earth hop (hit the target!)",
            2: "Level 2: Make a stable orbit",
            3: "Level 3: Go to the Moon (Moon moves!)",
            4: "Level 4: Intercept Mars (land)",
            5: "Level 5: Gravity assist (Venus → Jupiter)",
        }
        goals = {
            1: "Goal: land near the yellow target (~1/3 around Earth).\nNo auto-steering: angle really matters.",
            2: "Goal: stay in orbit (no re-entry) long enough to count.",
            3: "Goal: reach the Moon and get captured (or land).",
            4: "Goal: reach Mars and land (hit Mars).",
            5: "Goal: fly by Venus, then reach Jupiter.",
        }
        self.level_label.config(text=names[self.level])
        if self.state == "setup":
            self.msg_label.config(text=goals[self.level] + "\n\nAdjust sliders, then SPACE to launch.")
        elif self.state == "finished":
            self.msg_label.config(text=self.message + "\n\nSPACE to restart.")

    def _setup_earth_system(self):
        M_earth = 5.972e24
        R_earth = 6.371e6
        earth = Body("Earth", M_earth, R_earth, 0.0, 0.0, color="#3aa0ff", fixed=True)
        self.bodies = [earth]

        if self.level == 3:
            M_moon = 7.34767309e22
            R_moon = 1.7374e6
            a = 384_400_000.0
            mu = G * M_earth
            v = math.sqrt(mu / a)
            moon = Body("Moon", M_moon, R_moon, a, 0.0, 0.0, v, color="#cfd3d6", fixed=False)
            self.bodies.append(moon)

        # View: Earth radius ~120px
        self.view_cx, self.view_cy = 0.0, 0.0
        self.px_per_m = 120.0 / R_earth

        # Time warp
        if self.level == 1:
            self.time_warp = 600.0  # per your request
            self.target_angle = math.radians(120.0)  # clockwise from +Y
        elif self.level == 2:
            # Match Level 1 pacing/step subdivision so identical inputs reproduce
            # the same numerical trajectory.
            self.time_warp = 600.0
            self.target_angle = None
        else:
            self.time_warp = 80.0
            self.target_angle = None

    def _setup_solar_system(self):
        M_sun = 1.98847e30
        R_sun = 6.9634e8
        sun = Body("Sun", M_sun, R_sun, 0.0, 0.0, color="#ffdd55", fixed=True)

        earth = Body("Earth", 5.972e24, 6.371e6, 1.496e11, 0.0, color="#3aa0ff", fixed=False)
        mars  = Body("Mars", 6.4171e23, 3.3895e6, 2.279e11, 0.0, color="#ff6a4d", fixed=False)
        venus = Body("Venus", 4.8675e24, 6.0518e6, 1.082e11, 0.0, color="#ffd29a", fixed=False)
        jup   = Body("Jupiter", 1.898e27, 6.9911e7, 7.785e11, 0.0, color="#c9a27c", fixed=False)

        for p in (earth, mars, venus, jup):
            r = vec_len(p.x, p.y)
            v = math.sqrt(G * M_sun / r)
            p.vx, p.vy = 0.0, v

        self.bodies = [sun, earth, mars, venus, jup]

        # View: 1 AU ~ 260 px
        self.view_cx, self.view_cy = 0.0, 0.0
        self.px_per_m = 260.0 / 1.496e11

        self.time_warp = 12000.0 if self.level == 4 else 16000.0
        self.target_angle = None

    def _earth(self):
        for b in self.bodies:
            if b.name == "Earth":
                return b
        return None

    def _place_rocket(self):
        if self.level in (1, 2, 3):
            earth = self._earth()
            self.rocket_x = 0.0
            self.rocket_y = earth.radius + 10_000.0
            self.rocket_vx = 0.0
            self.rocket_vy = 0.0
        else:
            earth = next(b for b in self.bodies if b.name == "Earth")
            self.rocket_x = earth.x
            self.rocket_y = earth.y + earth.radius + 50_000.0
            self.rocket_vx = earth.vx
            self.rocket_vy = earth.vy

    # ---------------- Launch ----------------
    def on_space(self):
        if self.state == "setup":
            self.launch()
        elif self.state == "finished":
            self.reset_level()

    def launch(self):
        self.state = "flying"
        self.message = ""
        self.trail = [(self.rocket_x, self.rocket_y)]
        self.last_trail_sample_t = 0.0
        self.rocket_t = 0.0
        self.rocket_alive = True
        self.goal_orbit_ok_time = 0.0
        self.level2_orbit_achieved = False
        self.fanfare_timer = 0.0

        tilt = math.radians(self.angle_deg.get())

        # Option A: fixed inertial thrust direction at t=0, held constant throughout burn
        if self.level in (1, 2, 3):
            self.burn_dir_x = math.sin(tilt)
            self.burn_dir_y = math.cos(tilt)
        else:
            earth = next(b for b in self.bodies if b.name == "Earth")
            rx = self.rocket_x - earth.x
            ry = self.rocket_y - earth.y
            urx, ury = unit(rx, ry)
            utx, uty = -ury, urx
            self.burn_dir_x = urx * math.cos(tilt) + utx * math.sin(tilt)
            self.burn_dir_y = ury * math.cos(tilt) + uty * math.sin(tilt)

        # tiny kick along burn direction
        kick = 10.0
        self.rocket_vx += self.burn_dir_x * kick
        self.rocket_vy += self.burn_dir_y * kick

    # ---------------- Thrust ----------------
    def rocket_thrust_acc(self, t):
        burn_total = float(self.burn_s.get())
        if t < 0.0 or t > burn_total:
            return 0.0

        nstages = int(self.stages.get())
        stage_len = burn_total / nstages
        stage_idx = int(t // stage_len)

        # Levels 1 and 2 share the same thrust model so identical inputs can
        # reproduce the same trajectory (Level 2 just changes the win condition).
        if self.level in (1, 2):
            return 80.0

        base = [35.0, 28.0, 22.0, 17.0]
        a = base[min(stage_idx, len(base) - 1)]
        if nstages == 1:
            a *= 1.10
        return a

    # ---------------- Gravity ----------------
    def grav_acc_at(self, x, y):
        ax = 0.0
        ay = 0.0
        for b in self.bodies:
            dx = b.x - x
            dy = b.y - y
            r2 = dx*dx + dy*dy
            if r2 == 0:
                continue
            r = math.sqrt(r2)
            soft = 1.0 + (b.radius * 0.05)**2 / r2
            a = G * b.mass / (r2 * soft)
            ax += a * dx / r
            ay += a * dy / r
        return ax, ay

    # ---------------- Step physics ----------------
    def step(self, dt):
        # bodies (non-fixed)
        body_acc = {}
        for b in self.bodies:
            if b.fixed:
                body_acc[b.name] = (0.0, 0.0)
                continue
            ax, ay = 0.0, 0.0
            for o in self.bodies:
                if o is b:
                    continue
                dx = o.x - b.x
                dy = o.y - b.y
                r2 = dx*dx + dy*dy
                if r2 == 0:
                    continue
                r = math.sqrt(r2)
                soft = 1.0 + (o.radius * 0.05)**2 / r2
                a = G * o.mass / (r2 * soft)
                ax += a * dx / r
                ay += a * dy / r
            body_acc[b.name] = (ax, ay)

        for b in self.bodies:
            if b.fixed:
                continue
            ax, ay = body_acc[b.name]
            b.vx += ax * dt
            b.vy += ay * dt
            b.x += b.vx * dt
            b.y += b.vy * dt

        # rocket
        if self.state != "flying" or not self.rocket_alive:
            return

        gx, gy = self.grav_acc_at(self.rocket_x, self.rocket_y)
        a_thrust = self.rocket_thrust_acc(self.rocket_t)

        burn_total = float(self.burn_s.get())
        if self.rocket_t <= burn_total and a_thrust > 0.0:
            tx, ty = self.burn_dir_x, self.burn_dir_y
        else:
            tx, ty = 0.0, 0.0

        ax = gx + a_thrust * tx
        ay = gy + a_thrust * ty

        self.rocket_vx += ax * dt
        self.rocket_vy += ay * dt
        self.rocket_x += self.rocket_vx * dt
        self.rocket_y += self.rocket_vy * dt

        self.rocket_t += dt

        # Persist full trajectory: sample breadcrumbs at a fixed sim-time interval.
        if self.last_trail_sample_t is None:
            self.trail.append((self.rocket_x, self.rocket_y))
            self.last_trail_sample_t = self.rocket_t
        else:
            # Use a larger sampling period in solar levels to keep memory reasonable.
            period = 0.5 if self.level in (1, 2, 3) else 3600.0
            if (self.rocket_t - self.last_trail_sample_t) >= period:
                self.trail.append((self.rocket_x, self.rocket_y))
                self.last_trail_sample_t = self.rocket_t

        self._check_events()

    # ---------------- Win/loss ----------------
    def _earth_target_pos_world(self):
        earth = self._earth()
        R = earth.radius
        theta = self.target_angle
        tx = earth.x + math.sin(theta) * R
        ty = earth.y + math.cos(theta) * R
        return tx, ty

    def _earth_target_check(self):
        earth = self._earth()
        dx = self.rocket_x - earth.x
        dy = self.rocket_y - earth.y
        phi = math.atan2(dy, dx)
        theta = (math.pi/2 - phi) % (2*math.pi)  # clockwise from +Y
        tgt = self.target_angle
        d = abs((theta - tgt + math.pi) % (2*math.pi) - math.pi)
        return d < math.radians(8.0)

    def _start_fanfare(self):
        self.fanfare_timer = self.fanfare_duration

    def _check_events(self):
        # collision with any body
        for b in self.bodies:
            dx = self.rocket_x - b.x
            dy = self.rocket_y - b.y
            if dx*dx + dy*dy <= (b.radius * 1.001)**2:
                self.rocket_alive = False
                self.state = "finished"

                if self.level == 1 and b.name == "Earth":
                    hit = self._earth_target_check()
                    if hit:
                        self._start_fanfare()
                    self.message = "Target HIT! 🎉🌈  SPACE to play again." if hit else "Splashdown! Try again. SPACE."
                elif self.level == 2 and b.name == "Earth":
                    self.message = "Back to Earth. More sideways speed! SPACE."
                elif self.level == 3 and b.name == "Moon":
                    self.message = "Moon landing! 🌙  SPACE."
                elif self.level == 4 and b.name == "Mars":
                    self.message = "Mars landing! 🔴  SPACE."
                elif self.level == 5 and b.name == "Jupiter":
                    self.message = "Made it to Jupiter! 🟤  SPACE."
                else:
                    self.message = f"Hit {b.name}! SPACE."
                self._update_text()
                return

        # Level 2 orbit detection (toy). Keep it non-terminating so the
        # trajectory matches Level 1 for the same inputs; impact still ends.
        if self.level == 2 and self.state == "flying" and not self.level2_orbit_achieved:
            burn_total = float(self.burn_s.get())
            # Allow ascent from low altitude; only judge "re-entry" / orbit after burnout.
            if self.rocket_t <= burn_total:
                return

            earth = self._earth()
            r = vec_len(self.rocket_x - earth.x, self.rocket_y - earth.y)
            alt = r - earth.radius

            if 120_000.0 < alt < 900_000.0:
                self.goal_orbit_ok_time += 0.5
            else:
                self.goal_orbit_ok_time = max(0.0, self.goal_orbit_ok_time - 0.5)

            if self.goal_orbit_ok_time > 60.0:
                self.level2_orbit_achieved = True
                self.message = "Orbit achieved! 🛰️  (ESC to reset)"
                return

    # ---------------- Drawing ----------------
    def world_to_screen(self, x, y):
        sx = (x - self.view_cx) * self.px_per_m + self.W * 0.5
        sy = (self.view_cy - y) * self.px_per_m + self.H * 0.5
        return sx, sy

    def draw_rocket(self, sx, sy, heading_x, heading_y, firing):
        body_len = 22
        body_w = 10

        sp = vec_len(heading_x, heading_y)
        if sp > 1e-6:
            ang = math.atan2(-heading_y, heading_x)  # screen y down
        else:
            ang = -math.pi/2

        fx = math.cos(ang)
        fy = math.sin(ang)
        px = -fy
        py = fx

        nose = (sx + fx * body_len, sy + fy * body_len)
        tail_center = (sx - fx * (body_len * 0.6), sy - fy * (body_len * 0.6))
        tail_l = (tail_center[0] + px * body_w, tail_center[1] + py * body_w)
        tail_r = (tail_center[0] - px * body_w, tail_center[1] - py * body_w)

        self.canvas.create_polygon(
            nose[0], nose[1],
            tail_l[0], tail_l[1],
            tail_r[0], tail_r[1],
            fill="#e8f0ff", outline="#9fb4d6"
        )

        wx = sx + fx * 2
        wy = sy + fy * 2
        self.canvas.create_oval(wx-3, wy-3, wx+3, wy+3, fill="#4cc3ff", outline="")

        if firing:
            flame_len = 18
            flame_w = 8
            flame_tip = (sx - fx * flame_len, sy - fy * flame_len)
            flame_l = (sx - fx * 6 + px * flame_w, sy - fy * 6 + py * flame_w)
            flame_r = (sx - fx * 6 - px * flame_w, sy - fy * 6 - py * flame_w)
            self.canvas.create_polygon(
                flame_tip[0], flame_tip[1],
                flame_l[0], flame_l[1],
                flame_r[0], flame_r[1],
                fill="#ffb14a", outline=""
            )

    def draw_fanfare_rainbow(self):
        # Draw a big rainbow burst at the target point (screen space)
        if self.level != 1 or self.target_angle is None:
            return
        if self.fanfare_timer <= 0:
            return

        # Pulse factor (0..1..0)
        t = self.fanfare_timer / self.fanfare_duration
        pulse = 0.6 + 0.4 * math.sin((1 - t) * math.pi)  # nice swell

        tx, ty = self._earth_target_pos_world()
        sx, sy = self.world_to_screen(tx, ty)

        # Rainbow rings + rays
        colors = ["#ff004c", "#ff7a00", "#ffd200", "#00d084", "#00a2ff", "#6f6cff", "#b400ff"]
        base_r = 18
        step = 10

        for i, c in enumerate(colors):
            r = (base_r + i * step) * pulse
            self.canvas.create_oval(sx-r, sy-r, sx+r, sy+r, outline=c, width=6)

        # Confetti rays
        ray_len = 70 * pulse
        for k in range(18):
            ang = (2 * math.pi) * (k / 18.0) + (1 - t) * 2.0
            x2 = sx + math.cos(ang) * ray_len
            y2 = sy + math.sin(ang) * ray_len
            c = colors[k % len(colors)]
            self.canvas.create_line(sx, sy, x2, y2, fill=c, width=4)

        # Big text pop
        self.canvas.create_text(sx, sy - 90 * pulse, text="HIT!", fill="#ffffff",
                                font=("Arial", int(40 * pulse), "bold"))

    def draw(self):
        self.canvas.delete("all")

        # stars
        for i in range(0, self.W, 120):
            for j in range(0, self.H, 120):
                if (i * 37 + j * 91) % 5 == 0:
                    self.canvas.create_oval(i, j, i+2, j+2, fill="#304070", outline="")

        # bodies
        for b in self.bodies:
            sx, sy = self.world_to_screen(b.x, b.y)
            rpx = max(2, b.radius * self.px_per_m)
            self.canvas.create_oval(sx-rpx, sy-rpx, sx+rpx, sy+rpx, fill=b.color, outline="")
            self.canvas.create_text(sx, sy + rpx + 12, text=b.name, fill="#dbe6ff", font=("Arial", 10))

        # target marker
        if self.level == 1 and self.target_angle is not None:
            tx, ty = self._earth_target_pos_world()
            sx, sy = self.world_to_screen(tx, ty)
            self.canvas.create_oval(sx-7, sy-7, sx+7, sy+7, fill="#ffd84d", outline="")
            self.canvas.create_text(sx, sy-16, text="TARGET", fill="#ffd84d", font=("Arial", 10, "bold"))

        # Setup preview line: angle + burn length
        if self.state == "setup":
            sx0, sy0 = self.world_to_screen(self.rocket_x, self.rocket_y)
            tilt = math.radians(self.angle_deg.get())
            dx = math.sin(tilt)
            dy = -math.cos(tilt)  # screen up

            burn = float(self.burn_s.get())
            burn_min = float(self.burn_scale.cget("from"))
            burn_max = float(self.burn_scale.cget("to"))
            L = 40 + (burn - burn_min) / max(1e-9, (burn_max - burn_min)) * 180

            sx1 = sx0 + dx * L
            sy1 = sy0 + dy * L
            self.canvas.create_line(sx0, sy0, sx1, sy1, fill="#7ee787", width=3)
            self.canvas.create_oval(sx0-4, sy0-4, sx0+4, sy0+4, fill="#7ee787", outline="")

        # trail
        if len(self.trail) > 2:
            pts = []
            stride = max(1, len(self.trail) // 2500)
            for x, y in self.trail[::stride]:
                sx, sy = self.world_to_screen(x, y)
                pts.extend([sx, sy])
            if len(pts) >= 4:
                self.canvas.create_line(*pts, fill="#9ad0ff", width=2)

        # rocket
        rx, ry = self.world_to_screen(self.rocket_x, self.rocket_y)
        burn_total = float(self.burn_s.get())
        firing = (self.state == "flying" and self.rocket_t <= burn_total)

        # Visual heading: fixed burn dir while firing; velocity after
        if firing:
            hx, hy = self.burn_dir_x, self.burn_dir_y
        else:
            hx, hy = self.rocket_vx, self.rocket_vy

        self.draw_rocket(rx, ry, hx, hy, firing)

        # fanfare (draw after rocket so it pops)
        self.draw_fanfare_rainbow()

        # HUD
        hud = []
        if self.level in (1, 2, 3):
            earth = self._earth()
            r = vec_len(self.rocket_x - earth.x, self.rocket_y - earth.y)
            alt_km = (r - earth.radius) / 1000.0
            speed = vec_len(self.rocket_vx, self.rocket_vy)
            hud.append(f"warp {self.time_warp:.0f}x   sim t={self.rocket_t:,.0f}s   alt={alt_km:,.0f}km   speed={speed:,.0f}m/s")
        else:
            speed = vec_len(self.rocket_vx, self.rocket_vy)
            days = self.rocket_t / (24*3600)
            hud.append(f"warp {self.time_warp:.0f}x   sim t={days:,.1f} days   speed={speed:,.0f}m/s")

        if self.state == "setup":
            hud.append("SPACE to launch")
        elif self.state == "flying" and self.message:
            hud.append(self.message)
        elif self.state == "finished":
            hud.append(self.message)

        self.canvas.create_text(12, 12, anchor="nw", text="\n".join(hud),
                                fill="#eaf0ff", font=("Arial", 12))

    # ---------------- Loop ----------------
    def loop(self):
        # Real dt for fanfare timer
        dt_real = 1.0 / self.fps
        self.last_dt_real = dt_real

        # Decrease fanfare timer (real seconds)
        if self.fanfare_timer > 0.0:
            self.fanfare_timer = max(0.0, self.fanfare_timer - dt_real)

        if self.state == "flying":
            sim_dt = (1.0 / self.fps) * self.time_warp
            n = max(1, int(math.ceil(sim_dt / self.max_step)))
            step_dt = sim_dt / n
            for _ in range(n):
                self.step(step_dt)

        self.draw()

        if self.state in ("setup", "finished"):
            self._update_text()

        self.root.after(int(1000 / self.fps), self.loop)


if __name__ == "__main__":
    root = tk.Tk()
    app = RocketGravityGame(root)
    root.mainloop()
