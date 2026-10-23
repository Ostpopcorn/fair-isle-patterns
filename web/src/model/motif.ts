// Pure operations on motif grids. A grid is the motif's rows array:
// rows[0] is the bottom row and character 0 the leftmost column. Every
// function returns a new array and leaves its input alone.

export type Symbol = '0' | '1' | '2';
export type Rows = readonly string[];

export interface Cell {
  /** Column from the left. */
  x: number;
  /** Row from the bottom (index into rows). */
  y: number;
}

export function width(rows: Rows): number {
  return rows[0]?.length ?? 0;
}

export function height(rows: Rows): number {
  return rows.length;
}

export function blank(w: number, h: number, symbol: Symbol = '0'): string[] {
  return Array.from({ length: h }, () => symbol.repeat(w));
}

export function get(rows: Rows, x: number, y: number): Symbol | null {
  const ch = rows[y]?.[x];
  return ch === '0' || ch === '1' || ch === '2' ? ch : null;
}

/** Sets many cells at once; cells outside the grid are ignored. */
export function setCells(rows: Rows, cells: Iterable<Cell>, symbol: Symbol): string[] {
  const grid = rows.map((r) => r.split(''));
  const w = width(rows);
  let changed = false;
  for (const { x, y } of cells) {
    if (y >= 0 && y < grid.length && x >= 0 && x < w && grid[y][x] !== symbol) {
      grid[y][x] = symbol;
      changed = true;
    }
  }
  return changed ? grid.map((r) => r.join('')) : [...rows];
}

/** Adds or removes cells at the top and right edges. */
export function resize(rows: Rows, w: number, h: number): string[] {
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? '';
    out.push(row.length >= w ? row.slice(0, w) : row + '0'.repeat(w - row.length));
  }
  return out;
}

export function flipHorizontal(rows: Rows): string[] {
  return rows.map((r) => r.split('').reverse().join(''));
}

export function flipVertical(rows: Rows): string[] {
  return [...rows].reverse();
}

export function rotate180(rows: Rows): string[] {
  return flipVertical(flipHorizontal(rows));
}

/** Rotates a square motif a quarter turn clockwise (as seen on the chart). */
export function rotate90(rows: Rows, clockwise = true): string[] {
  const n = rows.length;
  if (n !== width(rows)) return [...rows];
  // Work in screen coordinates (top row first), then convert back.
  const screen = [...rows].reverse();
  const out: string[] = [];
  for (let r = 0; r < n; r++) {
    let line = '';
    for (let c = 0; c < n; c++) line += clockwise ? screen[n - 1 - c][r] : screen[c][n - 1 - r];
    out.push(line);
  }
  return out.reverse();
}

/** Rolls the contents with wrap-around. dx > 0 moves right, dy > 0 moves up. */
export function roll(rows: Rows, dx: number, dy: number): string[] {
  const w = width(rows);
  const h = rows.length;
  if (!w || !h) return [...rows];
  const sx = ((dx % w) + w) % w;
  const sy = ((dy % h) + h) % h;
  const shifted = rows.map((r) => (sx ? r.slice(w - sx) + r.slice(0, w - sx) : r));
  return sy ? [...shifted.slice(h - sy), ...shifted.slice(0, h - sy)] : shifted;
}

/** The cell plus its mirror images across the centre lines. */
export function mirrored(cell: Cell, w: number, h: number, vertical: boolean, horizontal: boolean): Cell[] {
  const out: Cell[] = [cell];
  if (vertical) out.push({ x: w - 1 - cell.x, y: cell.y });
  if (horizontal) out.push({ x: cell.x, y: h - 1 - cell.y });
  if (vertical && horizontal) out.push({ x: w - 1 - cell.x, y: h - 1 - cell.y });
  return out;
}

/** Cells of the 4-connected region of equal symbols containing `start`. */
export function floodRegion(rows: Rows, start: Cell): Cell[] {
  const target = get(rows, start.x, start.y);
  if (target === null) return [];
  const w = width(rows);
  const h = rows.length;
  const seen = new Uint8Array(w * h);
  const out: Cell[] = [];
  const stack: Cell[] = [start];
  while (stack.length) {
    const c = stack.pop()!;
    if (c.x < 0 || c.y < 0 || c.x >= w || c.y >= h) continue;
    const i = c.y * w + c.x;
    if (seen[i] || rows[c.y][c.x] !== target) continue;
    seen[i] = 1;
    out.push(c);
    stack.push({ x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 });
  }
  return out;
}

/** Bresenham line between two cells, inclusive. */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function normalizeRect(a: Cell, b: Cell): Rect {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

/** Cells of a rectangle's outline, or all of it when filled. */
export function rectCells(a: Cell, b: Cell, filled: boolean): Cell[] {
  const { x0, y0, x1, y1 } = normalizeRect(a, b);
  const out: Cell[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (filled || x === x0 || x === x1 || y === y0 || y === y1) out.push({ x, y });
    }
  }
  return out;
}

/** The rows inside a rectangle (bottom row first), clipped to the grid. */
export function copyRect(rows: Rows, rect: Rect): string[] {
  const out: string[] = [];
  for (let y = Math.max(0, rect.y0); y <= Math.min(rows.length - 1, rect.y1); y++) {
    out.push(rows[y].slice(Math.max(0, rect.x0), rect.x1 + 1));
  }
  return out;
}

/** Pastes `clip` with its bottom-left cell at `at`; anything beyond the
 * motif's edges is clipped. */
export function paste(rows: Rows, clip: Rows, at: Cell): string[] {
  const grid = rows.map((r) => r.split(''));
  const w = width(rows);
  clip.forEach((line, dy) => {
    const y = at.y + dy;
    if (y < 0 || y >= grid.length) return;
    for (let dx = 0; dx < line.length; dx++) {
      const x = at.x + dx;
      const ch = line[dx];
      if (x >= 0 && x < w && (ch === '0' || ch === '1' || ch === '2')) grid[y][x] = ch;
    }
  });
  return grid.map((r) => r.join(''));
}

export function fillRect(rows: Rows, rect: Rect, symbol: Symbol): string[] {
  return setCells(rows, rectCells({ x: rect.x0, y: rect.y0 }, { x: rect.x1, y: rect.y1 }, true), symbol);
}
