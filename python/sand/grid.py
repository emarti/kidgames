#!/usr/bin/env python3

"""
Stanford CS106A Grid class
Nick Parlante
Provides simple 2d storage, see grid_demo() below
"""
# Apr 2021: more informative exception for bad x,y in get() and set()
# Jan 2021: add copy()
# Jan 2023: reject negative coords


def grid_demo():
    """
    Demonstrate use of the Grid class.
    """
    # Create width 4 by height 2 grid, filled with None initially.
    grid = Grid(4, 2)

    # loop over contents in usual way,
    # setting every location to 7
    for y in range(grid.height):
        for x in range(grid.width):
            grid.set(x, y, 7)

    # access 0,0
    val = grid.get(0, 0)

    # verify that 3,1 is in bounds
    if grid.in_bounds(3, 1):
        # set 3,1
        grid.set(3, 1, 11)

    print(grid)
    # print uses nested-list format
    # showing row-0, then row-1
    # [[7, 7, 7, 7], [7, 7, 7, 11]]

    # Grid.build() supports the same nested-list format,
    # allowing you to construct a grid on the fly.
    grid2 = Grid.build([[7, 7, 7, 7], [7, 7, 7, 11]])
    # Can make a copy if needed.
    grid3 = grid.copy()


class Grid:
    """
    2D grid with x,y int indexed internal storage
    Has .width .height size properties
    """
    def __init__(self, width, height):
        """
        Create grid width by height.
        Initially all locations hold None.
        """
        # Pretty agro use of comprehensions!
        self.array = [[None for x in range(width)] for y in range(height)]
        self.width = width
        self.height = height

    @staticmethod
    def build(lst):
        """
        Utility.
        Construct Grid using a nested-lst literal
        e.g. this makes a 3 by 2 grid:
        Grid.build([[1, 2, 3], [4, 5 6]])
        >>> Grid.build([[1, 2, 3], [4, 5, 6]])
        [[1, 2, 3], [4, 5, 6]]
        """
        check_list_malformed(lst)
        height = len(lst)
        width = len(lst[0])
        grid = Grid(width, height)
        grid.array = lst  # slight waste, but keeps ctor params simple
        return grid

    def get(self, x, y):
        """
        Gets the value stored value at x,y.
        x,y should be in bounds.
        """
        error = None
        try:
            # Relying on built-in index error, negative indices go
            # through, but we prefer to error those explicitly.
            if x < 0 or y < 0:
                raise IndexError('negative co-ord')
            return self.array[y][x]
        except IndexError as e:
            error = e

        if error:
            # Bad x,y is a common student error, so provide a more spelled-out exception
            # instead of the natural low-level list index error the implementation hits.
            # If we do this in the except block, Doctest reports *both* errors
            # which is confusing, so we do it down here.
            raise RuntimeError('out of bounds get({}, {}) on grid width {}, height {}'
                            .format(x, y, self.width, self.height))

    def set(self, x, y, val):
        """
        Sets a new value into the grid at x,y.
        x,y should be in bounds.
        """
        error = None
        try:
            if x < 0 or y < 0:
                raise IndexError('negative co-ord')
            self.array[y][x] = val
        except IndexError as e:
            error = e

        if error:
            raise Exception('out of bounds set({}, {}) on grid width {}, height {}'
                            .format(x, y, self.width, self.height))

    def in_bounds(self, x, y):
        """Returns True if the x,y is in bounds of the grid. False otherwise."""
        return x >= 0 and x < self.width and y >= 0 and y < self.height

    def copy(self):
        """Return a new grid, a duplicate of the original."""
        # Cute: leverage the build() facility
        return Grid.build(self.array)

    def __str__(self):
        return repr(self.array)

    # In particular Doctest seems to use this, so crucial to make
    # Grid work in Doctests.
    def __repr__(self):
        return repr(self.array)


def check_list_malformed(lst):
    """
    Given a list that represents a 2-d nesting, checks that it has the
    right type and the sublists are all the same len.
    Raises exception for malformations.
    Since these lists are tricky to type in by hand, we
    help people out by flagging these structural errors.
    """
    if not lst or type(lst) != list:
        raise Exception('Expecting list but got:' + str(lst))

    if len(lst) >= 2:
        size = len(lst[0])
        for sub in lst:
            if len(sub) != size:
                raise Exception("Sub-lists are not all the same length:" + str(lst))


def main():
    grid_demo()


if __name__ == '__main__':
    main()
