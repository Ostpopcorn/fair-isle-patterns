// Copying library items into a project (section 9). Projects stay
// self-contained: items are copied, never referenced. A motif comes with all
// of its mappings, and they bring the colours they use. On an id clash the
// imported item is renamed with a numeric suffix and references inside the
// import follow. An item identical to one already in the project (same id,
// same content) is reused instead of duplicated.

import type { LibraryDoc, Motif, PaletteColor, PatternDoc } from '../core/types';
import { uniqueId } from './doc';

export interface Selection {
  colors?: string[];
  motifs?: string[];
}

export interface Renamed {
  kind: 'colour' | 'motif';
  from: string;
  to: string;
}

export interface ImportResult {
  doc: PatternDoc;
  added: { colors: string[]; motifs: string[] };
  renamed: Renamed[];
}

const sameColor = (a: PaletteColor, b: PaletteColor) => a.hex.toLowerCase() === b.hex.toLowerCase();
const sameShape = (a: Motif, b: Motif) => JSON.stringify([a.rows, a.mappings]) === JSON.stringify([b.rows, b.mappings]);

export function importFromLibrary(project: PatternDoc, library: LibraryDoc, selection: Selection): ImportResult {
  const renamed: Renamed[] = [];
  const added = { colors: [] as string[], motifs: [] as string[] };

  const wantMotifs = library.motifs.filter((m) => selection.motifs?.includes(m.id));
  const neededColors = new Set(selection.colors ?? []);
  for (const m of wantMotifs) for (const p of m.mappings) for (const id of p.colors) neededColors.add(id);

  // Colours first, so mappings can follow their new ids.
  const palette = [...project.palette];
  const colorId = new Map<string, string>();
  for (const color of library.palette) {
    if (!neededColors.has(color.id)) continue;
    const existing = palette.find((c) => c.id === color.id);
    if (existing && sameColor(existing, color)) {
      colorId.set(color.id, color.id);
      continue;
    }
    const id = uniqueId(color.id, palette.map((c) => c.id));
    if (id !== color.id) renamed.push({ kind: 'colour', from: color.id, to: id });
    colorId.set(color.id, id);
    palette.push({ ...color, id });
    added.colors.push(id);
  }

  const motifs = [...project.motifs];
  for (const motif of wantMotifs) {
    const mappings = motif.mappings.map((p) => ({ ...p, colors: p.colors.map((id) => colorId.get(id) ?? id), rows: [...p.rows] }));
    const copy: Motif = { ...motif, rows: [...motif.rows], mappings };
    const existing = motifs.find((m) => m.id === motif.id);
    if (existing && sameShape(existing, copy)) continue;
    const id = uniqueId(motif.id, motifs.map((m) => m.id));
    if (id !== motif.id) renamed.push({ kind: 'motif', from: motif.id, to: id });
    motifs.push({ ...copy, id });
    added.motifs.push(id);
  }

  return { doc: { ...project, palette, motifs }, added, renamed };
}
