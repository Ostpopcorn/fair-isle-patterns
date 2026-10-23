// Copying library items into a project (section 9). Projects stay
// self-contained: items are copied, never referenced. On an id clash the
// imported item is renamed with a numeric suffix and references inside the
// import follow. An item identical to one already in the project (same id,
// same content) is reused instead of duplicated.

import type { LibraryDoc, Mapping, Motif, PaletteColor, PatternDoc } from '../core/types';
import { uniqueId } from './doc';

export interface Selection {
  colors?: string[];
  motifs?: string[];
  mappings?: string[];
}

export interface Renamed {
  kind: 'colour' | 'motif' | 'mapping';
  from: string;
  to: string;
}

export interface ImportResult {
  doc: PatternDoc;
  added: { colors: string[]; motifs: string[]; mappings: string[] };
  renamed: Renamed[];
}

const sameColor = (a: PaletteColor, b: PaletteColor) => a.hex.toLowerCase() === b.hex.toLowerCase();
const sameRows = (a: readonly unknown[], b: readonly unknown[]) => JSON.stringify(a) === JSON.stringify(b);

export function importFromLibrary(project: PatternDoc, library: LibraryDoc, selection: Selection): ImportResult {
  const renamed: Renamed[] = [];
  const added = { colors: [] as string[], motifs: [] as string[], mappings: [] as string[] };

  const wantMappings = library.mappings.filter((m) => selection.mappings?.includes(m.id));
  const wantMotifs = library.motifs.filter((m) => selection.motifs?.includes(m.id));
  const neededColors = new Set(selection.colors ?? []);
  for (const m of wantMappings) for (const row of m.rows) for (const id of row) neededColors.add(id);

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
    const existing = motifs.find((m) => m.id === motif.id);
    if (existing && sameRows(existing.rows, motif.rows)) continue;
    const id = uniqueId(motif.id, motifs.map((m) => m.id));
    if (id !== motif.id) renamed.push({ kind: 'motif', from: motif.id, to: id });
    const copy: Motif = { ...motif, id, rows: [...motif.rows] };
    motifs.push(copy);
    added.motifs.push(id);
  }

  const mappings = [...project.mappings];
  for (const mapping of wantMappings) {
    const rows = mapping.rows.map((r) => r.map((id) => colorId.get(id) ?? id));
    const existing = mappings.find((m) => m.id === mapping.id);
    if (existing && sameRows(existing.rows, rows)) continue;
    const id = uniqueId(mapping.id, mappings.map((m) => m.id));
    if (id !== mapping.id) renamed.push({ kind: 'mapping', from: mapping.id, to: id });
    const copy: Mapping = { ...mapping, id, rows };
    mappings.push(copy);
    added.mappings.push(id);
  }

  return { doc: { ...project, palette, motifs, mappings }, added, renamed };
}
