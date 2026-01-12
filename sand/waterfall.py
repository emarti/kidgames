#!/usr/bin/env python3

"""
Stanford CS106A Waterfall warmup
"""

import sys
import tkinter
import random
import drawcanvas

from grid import Grid

SIDE = 15  # pixels across of one square
WATER_FACTOR = 20  # 1 out of this factor is water in top edge
ROCK_FACTOR = 10   # 1 out of this factor is rock at the start


def is_move_ok(grid, x_to, y_to):
    """
    Given a grid and possibly out-of-bounds x_to, y_to
    return True if that destination is ok, False otherwise.
    (tests provided, code TBD)
    >>> grid = Grid.build([['w', 'w', 'w'], ['r', None, 'w']])
    >>> is_move_ok(grid, 1, 1)   # down ok
    True
    >>> is_move_ok(grid, -1, 1)  # out-of-bounds left
    False
    >>> is_move_ok(grid, 0, 1)   # down blocked
    False
    >>> is_move_ok(grid, 2, 1)   # down blocked
    False
    >>> is_move_ok(grid, 2, 2)   # out-of-bounds down
    False
    """
    if grid.in_bounds(x_to, y_to):
        if grid.get(x_to, y_to) is None:
            return True
    return False

def move_water(grid, x_from, y_from):
    """
    There is water at the given x_from, y_from.
    Move the water to one of the 3 squares below,
    or erase it, as described in the handout.
    Return the grid when done.
    (tests provided, code TBD)
    >>> grid = Grid.build([['w', 'w', 'w'], ['r', None, 'w']])
    >>> move_water(grid, 1, 0)  # down ok
    [['w', None, 'w'], ['r', 'w', 'w']]
    >>> grid = Grid.build([['w', 'w', 'w'], ['r', None, 'w']])
    >>> move_water(grid, 0, 0)  # down right
    [[None, 'w', 'w'], ['r', 'w', 'w']]
    >>> grid = Grid.build([['w', 'w', 'w'], ['r', None, 'w']])
    >>> move_water(grid, 2, 0)  # down left
    [['w', 'w', None], ['r', 'w', 'w']]
    >>> grid = Grid.build([['w', 'w', 'w'], ['r', None, 'w']])
    >>> move_water(grid, 2, 1)  # nowhere to go - disappears
    [['w', 'w', 'w'], ['r', None, None]]
    >>> grid = Grid.build([['r', 'w'], [None, None], [None, None]])
    >>> move_water(grid, 1, 0)  # Tall - water moves one square
    [['r', None], [None, 'w'], [None, None]]
    """
    if is_move_ok(grid, x_from, y_from + 1):
        grid.set(x_from, y_from, None)
        grid.set(x_from, y_from + 1, 'w')
    elif is_move_ok(grid, x_from - 1, y_from + 1):
        grid.set(x_from, y_from, None)
        grid.set(x_from - 1, y_from + 1, 'w')
    elif is_move_ok(grid, x_from + 1, y_from + 1):
        grid.set(x_from, y_from, None)
        grid.set(x_from + 1, y_from + 1, 'w')
    else: grid.set(x_from, y_from, None)
    return grid

def move_all_water(grid):
    """
    Move every water 'w' in the world
    once by calling move_water() for each.
    (provided)
    """
    # tricky: do y in reverse direction so each
    # water moves only once.
    for y in reversed(range(grid.height)):
        for x in range(grid.width):
            if grid.get(x, y) == 'w':
                move_water(grid, x, y)
    return grid


def set_top(grid):
    """
    Set random squares at the top row, y=0, to
    have water in them.
    (provided)
    """
    for x in range(grid.width):
        if random.randrange(WATER_FACTOR) == 0:
            grid.set(x, 0, 'w')
    return grid


def init_rocks(grid):
    """
    Set a random selection of squares to be rock 'r'
    to initialize the grid.
    (provided)
    """
    for y in range(grid.height):
        for x in range(grid.width):
            if random.randrange(ROCK_FACTOR) == 0:
                grid.set(x, y, 'r')
    return grid


# ************* Utility Functions Below here


def draw_grid_canvas(grid, canvas):
    """
    Draw the grid to the canvas.
    """
    canvas.delete('all')
    canvas.create_rectangle(0, 0, grid.width * SIDE, grid.height * SIDE, fill='black')

    for y in range(grid.height):
        for x in range(grid.width):
            val = grid.get(x, y)
            if val:
                pixel_x = SIDE * x
                pixel_y = SIDE * y
                canvas.create_text(pixel_x, pixel_y, text=val, anchor=tkinter.NW, fill='white', font=('Courier', 20))

    canvas.update()


def do_one_round(grid, canvas):
    """Do one round of the move, call in timer."""
    set_top(grid)
    draw_grid_canvas(grid, canvas)
    move_all_water(grid)


# TK Timer fns:

def start_timer(top, delay_ms, fn):
    """Start the my_timer system, calls given fn"""
    top.after(delay_ms, lambda: my_timer(top, delay_ms, fn))


def my_timer(top, delay_ms, fn):
    """my_timer callback, re-posts itself."""
    fn()
    top.after(delay_ms, lambda: my_timer(top, delay_ms, fn))


def main():
    args = sys.argv[1:]

    width = 60
    height = 40

    # Optional command line setting of -width- -height-
    if len(args) == 2:
        width = int(args[0])
        height = int(args[1])
    grid = Grid(width, height)
    init_rocks(grid)

    canvas = drawcanvas.make_canvas(width * SIDE, height * SIDE, 'Waterfall')
    draw_grid_canvas(grid, canvas)

    start_timer(canvas, 30, lambda: do_one_round(grid, canvas))

    drawcanvas.DrawCanvas.mainloop()


if __name__ == '__main__':
    main()
