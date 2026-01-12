#!/usr/bin/env python3

"""
Stanford CS106A Sand Project
"""

import sys
import tkinter
import random
import datetime

from grid import Grid


def do_move(grid, x_from, y_from, x_to, y_to):
    """
    Given grid and x_from,y_from with a sand,
    and x_to,y_to. Move the sand to x_to,y_to
    and return the resulting grid.
    Assume that this is a legal move: all coordinates are in
    bounds, and x_to,y_to is empty.
    (i.e. a different function checks that this is a
    legal move before do_move() is called)
    (tests and code provided)
    >>> grid = Grid.build([['r', 's', 's'], [None, None, None]])
    >>> do_move(grid, 1, 0, 1, 1)
    [['r', None, 's'], [None, 's', None]]
    >>>
    >>> grid = Grid.build([['r', 's', 's'], [None, None, None]])
    >>> do_move(grid, 2, 0, 2, 1)
    [['r', 's', None], [None, None, 's']]
    """
    # Erase where it was, set it to its new square
    grid.set(x_from, y_from, None)
    grid.set(x_to, y_to, 's')
    return grid


def is_move_ok(grid, x_from, y_from, x_to, y_to):
    """
    Given grid and x_from,y_from and destination x_to,y_to
    for one of the five possible moves. Assume x_from,y_from
    is in bounds and contains sand. Is moving to x_to,y_to ok?
    Return True if the move is ok, or False otherwise.
    Ok move: destination is in bounds, empty, not violating corner rule.
    >>> # Out-of-bounds OOB tests
    >>> # Make a 1 by 1 grid with an 's' - everything is OOB from here
    >>> grid = Grid.build([['s']])
    >>> is_move_ok(grid, 0, 0, -1, 0) # left OOB
    False
    >>> is_move_ok(grid, 0, 0, 0, 1)  # down OOB
    False
    >>> is_move_ok(grid, 0, 0, -1, 1)  # down-left OOB
    False
    >>> is_move_ok(grid, 0, 0, 1, 1)  # down-right OOB
    False
    >>> grid = Grid.build([['s','r']])
    >>> is_move_ok(grid, 0, 0, 1, 0)  # left OOB
    False
    >>> # 3 by 2 grid, try various moves from 1,0
    >>> grid = Grid.build([[None, 's',  'r'], [None, None, None]])
    >>> is_move_ok(grid, 1, 0, 0, 0)  # left ok
    True
    >>> is_move_ok(grid, 1, 0, 1, 1)  # down ok
    True
    >>> is_move_ok(grid, 1, 0, 2, 1)  # right-left ok
    False
    >>> grid = Grid.build([[None, 's',  'r'], [None, 'r', None]])
    >>> is_move_ok(grid, 1, 0, 0, 1)  # down-left ok
    True
    >>> is_move_ok(grid, 1, 0, 2, 1)  # down-right ok
    False

    """
    if grid.in_bounds(x_to, y_to):
        if grid.get(x_to, y_to) is None:
            if x_to == x_from + 1 and y_to == y_from:
                return True
            if x_to == x_from - 1 and y_to == y_from:
                return True
            if x_to == x_from and y_to == y_from + 1:
                return True
            if x_to == x_from + 1 and y_to == y_from + 1:
                if grid.get(x_to, y_to-1) is None:
                    return True
            if x_to == x_from - 1 and y_to == y_from + 1:
                if grid.get(x_to, y_to-1) is None:
                    return True
    return False



def do_gravity(grid, x, y):
    """
    Given grid and a in-bounds x, y. If there is a sand at that x, y.
    Try to make one move, trying them in this order:
    move down, move down-left, move down-right.
    Return the grid in all cases.
    (tests provided, code TBD)
    >>> # not sand
    >>> grid = Grid.build([[None, 's', None], [None, None, None]])
    >>> do_gravity(grid, 0, 0)
    [[None, 's', None], [None, None, None]]
    >>>
    >>> # down
    >>> grid = Grid.build([[None, 's', None], [None, None, None]])
    >>> do_gravity(grid, 1, 0)
    [[None, None, None], [None, 's', None]]
    >>>
    >>> # bottom blocked
    >>> grid = Grid.build([[None, 's', None], ['r', 'r', 'r']])
    >>> do_gravity(grid, 1, 0)
    [[None, 's', None], ['r', 'r', 'r']]
    >>>
    >>> # rock-below down-left
    >>> grid = Grid.build([[None, 's', None], [None, 'r', None]])
    >>> do_gravity(grid, 1, 0)
    [[None, None, None], ['s', 'r', None]]
    >>>
    >>> # sand-below down-right
    >>> grid = Grid.build([[None, 's', None], ['s', 's', None]])
    >>> do_gravity(grid, 1, 0)
    [[None, None, None], ['s', 's', 's']]
    >>>
    >>> # sand corner: down-right
    >>> grid = Grid.build([['s', 's', None], [None, 's', None]])
    >>> do_gravity(grid, 1, 0)
    [['s', None, None], [None, 's', 's']]
    >>>
    >>> # at bottom already
    >>> grid = Grid.build([[None, None, None], [None, 's', None]])
    >>> do_gravity(grid, 1, 1)
    [[None, None, None], [None, 's', None]]
    >>>
    >>> # width 5 with 4 s - each s something different happens
    >>> grid = Grid.build([['s', 's', None, 's', 's'], ['s', 's', None, 's', None]])
    >>> do_gravity(grid, 0, 0)
    [['s', 's', None, 's', 's'], ['s', 's', None, 's', None]]
    >>> grid = Grid.build([['s', 's', None, 's', 's'], ['s', 's', None, 's', None]])
    >>> do_gravity(grid, 1, 0)
    [['s', None, None, 's', 's'], ['s', 's', 's', 's', None]]
    >>> grid = Grid.build([['s', 's', None, 's', 's'], ['s', 's', None, 's', None]])
    >>> do_gravity(grid, 3, 0)
    [['s', 's', None, None, 's'], ['s', 's', 's', 's', None]]
    >>> grid = Grid.build([['s', 's', None, 's', 's'], ['s', 's', None, 's', None]])
    >>> do_gravity(grid, 4, 0)
    [['s', 's', None, 's', None], ['s', 's', None, 's', 's']]
    """

    if grid.get(x,y) == "s":
        # goes down
        if is_move_ok(grid, x, y, x, y + 1):
            do_move(grid, x, y, x, y + 1)
            return grid
        # turn left and then down
        if is_move_ok(grid, x, y, x - 1, y + 1):
            do_move(grid, x, y, x - 1, y + 1)
            return grid
        # turn right and then down
        if is_move_ok(grid, x, y, x + 1, y + 1):
            do_move(grid, x, y, x + 1, y + 1)
            return grid
    return grid


def do_brownian(grid, x, y, brownian):
    """
    Given grid, x,y, and brownian int 0..100.
    Do the random brownian move for that x,y.
    Return the grid.
    (tests provided, code TBD)
    >>> # Hack: tamper with randrange() to always return 0
    >>> # So we can write a test.
    >>> # This only happens for the Doctest run, not in production.
    >>> random.randrange = lambda n: 0
    >>> # 1,0 can go left, but 1,1 cannot
    >>> grid = Grid.build([[None, 's', None], ['s', 's', None]])
    >>> do_brownian(grid, 1, 0, 100)
    [['s', None, None], ['s', 's', None]]
    >>> grid = Grid.build([[None, 's', None], ['s', 's', None]])
    >>> do_brownian(grid, 1, 1, 100)
    [[None, 's', None], ['s', 's', None]]
    """
    if grid.get(x, y) == "s":
        num = random.randrange(100)
        if num < brownian:
            coin = random.randrange(2)
            if coin == 0:
                if is_move_ok(grid, x, y, x - 1, y):
                    do_move(grid, x, y, x - 1, y)
            elif coin == 1:
                if is_move_ok(grid, x, y, x + 1, y):
                    do_move(grid, x, y, x + 1, y)

    return grid


def do_whole_grid(grid, brownian, x=None):
    """
    Given grid and brownian int, do one round
    of gravity and brownian over the whole grid.
    (tests and code TBD)

    >>> grid = Grid.build([['s', 's', 's'], [None, None, None], [None, None, None]])
    >>> do_whole_grid(grid, brownian=0)
    [[None, None, None], ['s', 's', 's'], [None, None, None]]
    >>> grid = Grid.build([[None, 's', 's'], [None, None, None], [None, None, None]])
    >>> do_whole_grid(grid, brownian=0)
    [[None, None, None], [None, 's', 's'], [None, None, None]]
    >>> grid = Grid.build([[None, 's', 's'], [None, None, None], [None, 's', None]])
    >>> do_whole_grid(grid, brownian=0)
    [[None, None, None], [None, 's', 's'], [None, 's', None]]
    """

    for y in reversed(range(grid.height)):
        for x in range(grid.width):
            do_gravity(grid, x, y)
            do_brownian(grid, x, y, brownian)


    return grid

#########################################################

"""
Down here is not especially pretty code to set up the GUI,
handle the controls, and draw the grid to the screen.
"""


def draw_grid_canvas(grid, canvas, scale):
    """
    Draw grid to tk canvas, erasing and then filling it.
    This was ultimately the best performing approach.
    scale is pixels per block
    """
    # pixel size of canvas
    cwidth = grid.width * scale + 2
    cheight = grid.height * scale + 2

    canvas.delete('all')

    # draw black per spot
    for y in range(grid.height):
        for x in range(grid.width):
            val = grid.get(x, y)
            if val:
                if val == 'r':
                    color = 'black'
                else:
                    color = 'yellow'
                rx = 1 + x * scale
                ry = 1 + y * scale
                canvas.create_rectangle(rx, ry, rx + scale, ry + scale, fill=color, outline='black')

    canvas.create_rectangle(0, 0, cwidth-1, cheight-1, outline='blue')
    canvas.update()


fps_enable = True
fps_count = 0
fps_start = 0


def fps_update():
    "Update the little fps text at the upper right"
    global fps_enable, fps_count, fps_start, fps_label
    if not fps_enable:
        return
    fps_count += 1
    if fps_count == 40:
        now = datetime.datetime.now().timestamp()
        delta = now - fps_start
        fps_start = now
        fps = int(1 / (delta / fps_count))
        # print(fps)
        fps_label.config(text=str(fps))
        fps_count = 0


# Global pointers to GUI elements we need in various callbacks
gravity = None
content = None
brownian_on = None
brownian_val = None
fps_label = None

SIDE = 14  # pixels across of one square (set in main() too)
SHIFT = 6


# provided function to build the GUI
def make_gui(top, width, height):
    """
    Set up the GUI elements for the Sand window, returning the Canvas to use.
    top is TK root, width/height is canvas size.
    """

    global gravity, content, brownian_on, brownian_val, fps_label
    gravity = tkinter.IntVar()
    content = tkinter.StringVar()
    brownian_on = tkinter.IntVar()
    brownian_val = tkinter.IntVar()

    top.title('Sand')

    # gravity checkbox
    gcheck = tkinter.Checkbutton(top, text='Gravity', name='gravity', variable=gravity)
    gcheck.grid(row=0, column=0, sticky='w')
    gravity.set(1)

    scheck = tkinter.Checkbutton(top, text='Brownian', name='brownian', variable=brownian_on)
    scheck.grid(row=0, column=1, sticky='w')
    brownian_on.set(1)

    scale = tkinter.Scale(top, from_=0, to=100, orient=tkinter.HORIZONTAL, variable=brownian_val)
    scale.grid(row=0, column=2, sticky='w')
    brownian_val.set(20)

    # content variable = state of radio button
    sand = tkinter.Radiobutton(top, text="Sand", variable=content, value='s')
    sand.grid(row=0, column=3, sticky='w')

    rock = tkinter.Radiobutton(top, text="Rock", variable=content, value='r')
    rock.grid(row=0, column=4, sticky='w')

    erase = tkinter.Radiobutton(top, text="Erase", variable=content, value='erase')
    erase.grid(row=0, column=5, sticky='w')

    bigerase = tkinter.Radiobutton(top, text="BigErase", variable=content, value='bigerase')
    bigerase.grid(row=0, column=6, sticky='w')

    content.set('s')

    fps_label = tkinter.Label(top, text="0", fg='lightgray')  # ugh 'fg' not a great name for this!
    fps_label.grid(row=0, column=7, sticky='w')

    # canvas for drawing
    canvas = tkinter.Canvas(top, width=width, height=height, name='canvas')

    canvas.xview_scroll(SHIFT, "units")  # hack so (0, 0) works correctly
    canvas.yview_scroll(SHIFT, "units")

    canvas.grid(row=1, columnspan=12, sticky='w', padx=20, ipady=5)

    top.update()
    top.focus_force()  # Push window to front on launch (seemingly needed around 3.12)

    return canvas


def big_erase(grid, x, y, canvas):
    """Erase big red circle in the given grid centered on x,y"""
    rad = 4
    # Compute circle around x,y in grid coords
    x1 = x - rad  # this can be out of bounds
    y1 = y - rad

    x2 = x + rad
    y2 = y + rad

    # Draw a red circle .. will be erased by later updates
    # Need to be consistent about grid -> pixel mapping
    canvas.create_oval(1 + x1 * SIDE, 1 + y1 * SIDE, 1 + x2 * SIDE, 1 + y2 * SIDE,
                       fill='red', outline='')
    canvas.update()

    for ey in range(y1, y2 + 1):
        for ex in range(x1, x2 + 1):
            # circle around x,y
            if grid.in_bounds(ex, ey) and abs(x-ex)**2 + abs(y-ey)**2 <= rad ** 2:
                grid.set(ex, ey, None)


# delay between calling the timer
TIMER_MS = 1


def start_timer(top, fn):
    """Start the my_timer system, calls given fn"""
    top.after(TIMER_MS, lambda: my_timer(top, fn))


def my_timer(top, fn):
    """my_timer callbback, re-posts itself."""
    fn()
    top.after(TIMER_MS, lambda: my_timer(top, fn))


def sand_action(grid, canvas, scale):
    """This function runs on timer for all periodic tasks."""
    global gravity
    global mouse_fn
    global brownian_on
    global brownian_val

    if mouse_fn:
        mouse_fn()

    if gravity.get():
        if not brownian_on.get():
            val = 0
        else:
            val = brownian_val.get()
        do_whole_grid(grid, val)
    draw_grid_canvas(grid, canvas, scale)
    fps_update()


# global mouse sand_action function pointer
# set on mouse down, cleared on mouse-up
mouse_fn = None


def do_mouse_up(event):
    global mouse_fn
    mouse_fn = None


def do_mouse(event, grid, scale, canvas):
    """Callback for mouse click/move"""
    global mouse_fn
    mouse_fn = lambda: do_mouse(event, grid, scale, canvas)

    x = (event.x - SHIFT // 2) // scale
    y = (event.y - SHIFT // 2) // scale
    if grid.in_bounds(x, y):
        global content
        val = content.get()  # 's' 'r' None
        if val == 's' or val == 'r':
            grid.set(x, y, val)
        elif val == 'erase':
            grid.set(x, y, None)
        elif val == 'bigerase':
            big_erase(grid, x, y, canvas)
    # print('click', event.x, event.y)


# (provided)
def main():
    args = sys.argv[1:]

    # Size in squares of world, override from command line
    width = 50
    height = 50
    if len(args) >= 2:
        width = int(args[0])
        height = int(args[1])

    # Size of one square in pixels, override from command line
    global SIDE
    SIDE = 14
    if len(args) == 3:
        SIDE = int(args[2])

    top = tkinter.Tk()
    canvas = make_gui(top, width * SIDE + 2, height * SIDE + 2)
    grid = Grid(width, height)

    canvas.bind("<B1-Motion>", lambda evt: do_mouse(evt, grid, SIDE, canvas))
    canvas.bind("<Button-1>", lambda evt: do_mouse(evt, grid, SIDE, canvas))
    canvas.bind("<ButtonRelease-1>", lambda evt: do_mouse_up(evt))

    start_timer(top, lambda: sand_action(grid, canvas, SIDE))

    tkinter.mainloop()


if __name__ == '__main__':
    main()
