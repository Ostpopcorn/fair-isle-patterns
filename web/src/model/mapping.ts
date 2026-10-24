// Pure helpers for colour mappings. A mapping belongs to one motif: it lists
// up to 10 palette colours, and each of its rows (one per motif row; rows[0]
// colours the motif's bottom row) is 2 or 3 digits, the positions in that
// list of background, foreground and optionally accent.

import { MAX_MAPPING_COLORS, type Mapping, type PaletteColor } from '../core/types';

/** 0 background, 1 foreground, 2 accent. */
export type Slot = 0 | 1 | 2;

/** The colour positions of a row, or null when it is not 2–3 digits. */
export function digits(row: string | undefined): number[] | null {
  if (row === undefined || !/^[0-9]{2,3}$/.test(row)) return null;
  return [...row].map(Number);
}

/** Palette id in one slot of row r, or null when the slot is empty or broken. */
export function slotColor(mapping: Mapping, r: number, slot: Slot): string | null {
  const d = digits(mapping.rows[r])?.[slot];
  return d === undefined ? null : (mapping.colors[d] ?? null);
}

/** A mapping for a new motif: the first three palette colours as
 * background, foreground and accent on every row. */
export function defaultMapping(id: string, palette: readonly PaletteColor[], height: number): Mapping {
  const colors = palette.slice(0, 3).map((c) => c.id);
  const row = colors.length >= 3 ? '012' : colors.length === 2 ? '01' : '00';
  return { id, name: 'Default', colors, rows: Array.from({ length: height }, () => row) };
}

/** Sets one slot of row r to colour position p; null removes the accent. */
export function setSlot(mapping: Mapping, r: number, slot: Slot, p: number | null): Mapping {
  const d = digits(mapping.rows[r]);
  if (!d) return mapping;
  if (p === null) {
    if (slot !== 2 || d.length < 3) return mapping;
    d.length = 2;
  } else if (slot === 2 && d.length < 3) {
    d.push(p);
  } else {
    d[slot] = p;
  }
  return { ...mapping, rows: mapping.rows.map((row, i) => (i === r ? d.join('') : row)) };
}

/** Whether any row uses colour position p. */
export function usesPosition(mapping: Mapping, p: number): boolean {
  return mapping.rows.some((row) => digits(row)?.includes(p));
}

/** Adds a palette colour to the end of the list (at most 10, no repeats). */
export function addColor(mapping: Mapping, id: string): Mapping {
  if (mapping.colors.length >= MAX_MAPPING_COLORS || mapping.colors.includes(id)) return mapping;
  return { ...mapping, colors: [...mapping.colors, id] };
}

/** Replaces the colour at position p; every row that uses p follows. */
export function replaceColor(mapping: Mapping, p: number, id: string): Mapping {
  if (p < 0 || p >= mapping.colors.length || mapping.colors.includes(id)) return mapping;
  return { ...mapping, colors: mapping.colors.map((c, i) => (i === p ? id : c)) };
}

/** Removes the colour at position p if no row uses it; later positions move
 * down one, and the rows follow. */
export function removeColor(mapping: Mapping, p: number): Mapping {
  if (p < 0 || p >= mapping.colors.length || usesPosition(mapping, p)) return mapping;
  return {
    ...mapping,
    colors: mapping.colors.filter((_, i) => i !== p),
    rows: mapping.rows.map((row) => digits(row)?.map((d) => (d > p ? d - 1 : d)).join('') ?? row),
  };
}

// ---- row operations (rows[0] is the bottom row) ----

export function reverse(rows: readonly string[]): string[] {
  return [...rows].reverse();
}

/** Moves every row's colours up one row, wrapping the top row to the bottom. */
export function shiftUp(rows: readonly string[]): string[] {
  return rollRows(rows, 1);
}

/** Moves every row's colours down one row, wrapping the bottom row to the top. */
export function shiftDown(rows: readonly string[]): string[] {
  return rollRows(rows, -1);
}

/** Rolls the rows with wrap-around, as the motif editor rolls a motif:
 * dy > 0 moves up. */
export function rollRows(rows: readonly string[], dy: number): string[] {
  const h = rows.length;
  if (h < 2) return [...rows];
  const sy = ((dy % h) + h) % h;
  return sy ? [...rows.slice(h - sy), ...rows.slice(0, h - sy)] : [...rows];
}

export function moveRow(rows: readonly string[], from: number, to: number): string[] {
  const out = [...rows];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  const [row] = out.splice(from, 1);
  out.splice(to, 0, row);
  return out;
}

/** Fits the rows to a new motif height, as resizing a motif adds or removes
 * rows at the top: new rows copy the top row. */
export function fitRows(rows: readonly string[], height: number): string[] {
  const top = rows[rows.length - 1] ?? '01';
  return Array.from({ length: height }, (_, i) => rows[i] ?? top);
}
