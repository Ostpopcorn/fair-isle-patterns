// Pure helpers for colour mapping rows (rows[0] applies to the band's first
// knitted row).

export type MappingRows = readonly (readonly string[])[];

export function reverse(rows: MappingRows): string[][] {
  return [...rows].reverse().map((r) => [...r]);
}

/** Moves every colour up one row (towards the top of the chart), wrapping
 * the top row around to the bottom. */
export function shiftUp(rows: MappingRows): string[][] {
  if (rows.length < 2) return rows.map((r) => [...r]);
  return [rows[rows.length - 1], ...rows.slice(0, -1)].map((r) => [...r]);
}

/** Moves every colour down one row, wrapping the bottom row to the top. */
export function shiftDown(rows: MappingRows): string[][] {
  if (rows.length < 2) return rows.map((r) => [...r]);
  return [...rows.slice(1), rows[0]].map((r) => [...r]);
}

export function moveRow(rows: MappingRows, from: number, to: number): string[][] {
  const out = rows.map((r) => [...r]);
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  const [row] = out.splice(from, 1);
  out.splice(to, 0, row);
  return out;
}

export function setEntry(rows: MappingRows, row: number, slot: 0 | 1 | 2, id: string | null): string[][] {
  return rows.map((r, i) => {
    if (i !== row) return [...r];
    const next = [...r];
    if (slot === 2) {
      if (id === null) return next.slice(0, 2);
      next[2] = id;
      return next;
    }
    next[slot] = id ?? next[slot];
    return next;
  });
}
