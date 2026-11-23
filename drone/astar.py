"""Topic 1 — Search: A* on a 6x6 grid.

Question answered: "Which route should the drone fly from the depot to the customer?"

f(n) = g(n) + h(n)
  g(n) = cost of the path from start to n
  h(n) = Manhattan distance to the goal (admissible: every step costs >= 1)

Step cost of entering a cell:
  1                                    for a normal cell
  1 + wind_penalty * P(strong wind)    for a wind-exposed (open-field) cell
So the Bayesian wind estimate directly changes which route A* prefers.
"""

import heapq
from dataclasses import dataclass, field
from typing import Optional

Cell = tuple  # (row, col)


@dataclass
class GridMap:
    rows: int = 6
    cols: int = 6
    start: Cell = (0, 0)   # depot
    goal: Cell = (0, 5)    # customer
    obstacles: frozenset = frozenset({(0, 3), (1, 3), (2, 3)})  # a building (3 obstacle cells)
    exposed: frozenset = frozenset({(3, 3), (3, 4), (4, 3), (4, 4)})  # open field, wind hits hard

    def in_bounds(self, c: Cell) -> bool:
        return 0 <= c[0] < self.rows and 0 <= c[1] < self.cols

    def passable(self, c: Cell) -> bool:
        return c not in self.obstacles

    def neighbors(self, c: Cell):
        r, k = c
        for dr, dk in ((-1, 0), (1, 0), (0, -1), (0, 1)):   # 4-connected moves
            n = (r + dr, k + dk)
            if self.in_bounds(n) and self.passable(n):
                yield n

    def validate(self) -> None:
        for name, c in (("start", self.start), ("goal", self.goal)):
            if not self.in_bounds(c):
                raise ValueError(f"{name} {c} is outside the grid")
            if c in self.obstacles:
                raise ValueError(f"{name} {c} is inside an obstacle")


def manhattan(a: Cell, b: Cell) -> int:
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


@dataclass
class AStarResult:
    path: Optional[list]          # list of cells, None if no route
    cost: float
    expanded: list                # order in which nodes were expanded
    exposed_cells_on_path: int
    steps: list = field(default_factory=list)
    trace: list = field(default_factory=list)   # one entry per expansion: cell, g, h, f, frontier


def step_cost(grid: GridMap, cell: Cell, p_wind: float, wind_penalty: float) -> float:
    return 1.0 + (wind_penalty * p_wind if cell in grid.exposed else 0.0)


def astar(grid: GridMap, p_wind: float = 0.0, wind_penalty: float = 25.0,
          max_trace: int = 12) -> AStarResult:
    grid.validate()
    start, goal = grid.start, grid.goal

    counter = 0                                   # tie-breaker for the heap
    open_heap = [(manhattan(start, goal), 0.0, counter, start)]
    g = {start: 0.0}
    came_from = {}
    closed = set()
    expanded = []
    trace = []
    steps = [f"Start {start}, goal {goal}, h = Manhattan, "
             f"exposed-cell cost = 1 + {wind_penalty}*{p_wind:.3f} = "
             f"{1 + wind_penalty * p_wind:.3f}"]

    while open_heap:
        f, g_cur, _, cur = heapq.heappop(open_heap)
        if cur in closed:
            continue
        closed.add(cur)
        expanded.append(cur)
        entry = {"cell": cur, "g": g_cur, "h": manhattan(cur, goal), "f": f,
                 "frontier": sorted({c for *_, c in open_heap if c not in closed})}
        trace.append(entry)
        if len(expanded) <= max_trace:
            steps.append(f"  expand {cur}: g={g_cur:.2f} h={manhattan(cur, goal)} f={f:.2f}")

        if cur == goal:
            path = [cur]
            while path[-1] in came_from:
                path.append(came_from[path[-1]])
            path.reverse()
            n_exp = sum(1 for c in path if c in grid.exposed)
            steps.append(f"  ... goal reached after expanding {len(expanded)} nodes")
            steps.append(f"Route ({len(path) - 1} moves, cost {g_cur:.2f}, "
                         f"{n_exp} exposed cells): {' -> '.join(map(str, path))}")
            return AStarResult(path, g_cur, expanded, n_exp, steps, trace)

        for nb in grid.neighbors(cur):
            new_g = g_cur + step_cost(grid, nb, p_wind, wind_penalty)
            if new_g < g.get(nb, float("inf")):
                g[nb] = new_g
                came_from[nb] = cur
                counter += 1
                heapq.heappush(open_heap, (new_g + manhattan(nb, goal), new_g, counter, nb))
        entry["frontier"] = sorted({c for *_, c in open_heap if c not in closed})

    steps.append("No route exists")
    return AStarResult(None, float("inf"), expanded, 0, steps, trace)


def render_ascii(grid: GridMap, path=None) -> str:
    """S start, G goal, # obstacle, ~ exposed field, * route, . free."""
    on_path = set(path or [])
    lines = []
    for r in range(grid.rows):
        row = []
        for c in range(grid.cols):
            cell = (r, c)
            if cell == grid.start:
                ch = "S"
            elif cell == grid.goal:
                ch = "G"
            elif cell in grid.obstacles:
                ch = "#"
            elif cell in on_path:
                ch = "*"
            elif cell in grid.exposed:
                ch = "~"
            else:
                ch = "."
            row.append(ch)
        lines.append(" ".join(row))
    return "\n".join(lines)
