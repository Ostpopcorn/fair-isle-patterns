// Document helpers: creating patterns, ids, references and immutable
// updates. Documents are never mutated; every helper returns a new object
// and keeps unknown fields.

import type { Band, Mapping, Motif, PaletteColor, PatternDoc, Settings } from '../core/types';

export const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** Turns any text into a valid id ("Peerie X!" → "peerie-x"). */
export function slugify(text: string, fallback = 'item'): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|-+$/g, '')
    .slice(0, 64);
  return slug && isValidId(slug) ? slug : fallback;
}

/** `base` if it is free, otherwise `base-2`, `base-3`, … */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  const stem = base.replace(/-\d+$/, '') || base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = stem.slice(0, 64 - suffix.length) + suffix;
    if (!used.has(candidate)) return candidate;
  }
}

export const DEFAULT_SETTINGS: Settings = {
  float_notice: 5,
  float_warning: 8,
  max_colors_per_row: 2,
  min_contrast: 15,
};

export const SPACER_ID = 'spacer';

export function newPattern(settings: Settings = DEFAULT_SETTINGS, now = new Date()): PatternDoc {
  const stamp = now.toISOString().slice(0, 19) + 'Z';
  return {
    format: 'fairisle-pattern',
    version: 1,
    meta: { name: 'Untitled pattern', created: stamp, modified: stamp },
    gauge: { stitches: 28, rows: 32, per_cm: 10 },
    cast_on: 120,
    settings: { ...settings },
    palette: [
      { id: 'cream', hex: '#efe6d2', name: 'Cream' },
      { id: 'navy', hex: '#1f2a44', name: 'Navy' },
    ],
    motifs: [
      { id: 'peerie-x', name: 'Peerie X', rows: ['100001', '010010', '001100', '010010', '100001'] },
      { id: SPACER_ID, name: 'Spacer', rows: ['0'] },
    ],
    mappings: [{ id: 'two-colour', name: 'Two colour', rows: [['cream', 'navy']] }],
    bands: [
      { motif: SPACER_ID, mapping: 'two-colour', offset: 0, times: 2 },
      { motif: 'peerie-x', mapping: 'two-colour', offset: 0, times: 1 },
      { motif: SPACER_ID, mapping: 'two-colour', offset: 0, times: 2 },
    ],
  };
}

// ---- references ----

export function bandsUsingMotif(doc: PatternDoc, id: string): number[] {
  return doc.bands.flatMap((b, i) => (b.motif === id ? [i] : []));
}

export function bandsUsingMapping(doc: PatternDoc, id: string): number[] {
  return doc.bands.flatMap((b, i) => (b.mapping === id ? [i] : []));
}

export function mappingsUsingColor(doc: PatternDoc, id: string): string[] {
  return doc.mappings.filter((m) => m.rows.some((r) => r.includes(id))).map((m) => m.id);
}

export function findMotif(doc: PatternDoc, id: string | null): Motif | undefined {
  return id === null ? undefined : doc.motifs.find((m) => m.id === id);
}

export function findMapping(doc: PatternDoc, id: string | null): Mapping | undefined {
  return id === null ? undefined : doc.mappings.find((m) => m.id === id);
}

export function findColor(doc: PatternDoc, id: string): PaletteColor | undefined {
  return doc.palette.find((c) => c.id === id);
}

/** Rows a band occupies: motif height × times, or 0 if unknown. */
export function bandHeight(doc: PatternDoc, band: Band): number {
  const motif = findMotif(doc, band.motif);
  return motif && Number.isInteger(band.times) && band.times >= 1 ? motif.rows.length * band.times : 0;
}

/** First chart row (1-based) of every band. */
export function bandStartRows(doc: PatternDoc): number[] {
  const starts: number[] = [];
  let row = 1;
  for (const band of doc.bands) {
    starts.push(row);
    row += bandHeight(doc, band);
  }
  return starts;
}

/** Bands as "Band 2 (rows 6–10)" for messages. */
export function describeBands(doc: PatternDoc, indexes: number[]): string {
  const starts = bandStartRows(doc);
  return indexes
    .map((i) => {
      const h = bandHeight(doc, doc.bands[i]);
      const name = doc.bands[i].name ? ` “${doc.bands[i].name}”` : '';
      return `band ${i + 1}${name} (rows ${starts[i]}–${starts[i] + h - 1})`;
    })
    .join(', ');
}

// ---- immutable updates ----

export function updateMotif(doc: PatternDoc, id: string, fn: (m: Motif) => Motif): PatternDoc {
  return { ...doc, motifs: doc.motifs.map((m) => (m.id === id ? fn(m) : m)) };
}

export function updateMapping(doc: PatternDoc, id: string, fn: (m: Mapping) => Mapping): PatternDoc {
  return { ...doc, mappings: doc.mappings.map((m) => (m.id === id ? fn(m) : m)) };
}

export function updateColor(doc: PatternDoc, id: string, fn: (c: PaletteColor) => PaletteColor): PatternDoc {
  return { ...doc, palette: doc.palette.map((c) => (c.id === id ? fn(c) : c)) };
}

export function updateBand(doc: PatternDoc, index: number, patch: Partial<Band>): PatternDoc {
  return { ...doc, bands: doc.bands.map((b, i) => (i === index ? { ...b, ...patch } : b)) };
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const out = [...items];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/** Sets an optional string field, removing it when empty. */
export function withOptional<T extends object>(obj: T, key: string, value: string): T {
  const next = { ...obj } as Record<string, unknown>;
  if (value.trim() === '') delete next[key];
  else next[key] = value;
  return next as T;
}

// ---- renaming ids (references follow) ----

export type RenameResult = { doc: PatternDoc } | { error: string };

function checkNewId(newId: string, taken: string[]): string | null {
  if (!isValidId(newId)) return 'Ids use 1–64 lowercase letters, digits, - or _, starting with a letter or digit.';
  if (taken.includes(newId)) return `The id “${newId}” is already used.`;
  return null;
}

export function renameMotif(doc: PatternDoc, oldId: string, newId: string): RenameResult {
  if (oldId === newId) return { doc };
  const error = checkNewId(newId, doc.motifs.map((m) => m.id));
  if (error) return { error };
  return {
    doc: {
      ...updateMotif(doc, oldId, (m) => ({ ...m, id: newId })),
      bands: doc.bands.map((b) => (b.motif === oldId ? { ...b, motif: newId } : b)),
    },
  };
}

export function renameMapping(doc: PatternDoc, oldId: string, newId: string): RenameResult {
  if (oldId === newId) return { doc };
  const error = checkNewId(newId, doc.mappings.map((m) => m.id));
  if (error) return { error };
  return {
    doc: {
      ...updateMapping(doc, oldId, (m) => ({ ...m, id: newId })),
      bands: doc.bands.map((b) => (b.mapping === oldId ? { ...b, mapping: newId } : b)),
    },
  };
}

export function renameColor(doc: PatternDoc, oldId: string, newId: string): RenameResult {
  if (oldId === newId) return { doc };
  const error = checkNewId(newId, doc.palette.map((c) => c.id));
  if (error) return { error };
  return {
    doc: {
      ...updateColor(doc, oldId, (c) => ({ ...c, id: newId })),
      mappings: doc.mappings.map((m) =>
        m.rows.some((r) => r.includes(oldId))
          ? { ...m, rows: m.rows.map((r) => r.map((id) => (id === oldId ? newId : id))) }
          : m,
      ),
    },
  };
}

// ---- deleting (blocked while referenced) ----

export type DeleteResult = { doc: PatternDoc } | { blocked: string };

export function deleteMotif(doc: PatternDoc, id: string): DeleteResult {
  const users = bandsUsingMotif(doc, id);
  if (users.length) {
    return { blocked: `Motif “${id}” is used by ${describeBands(doc, users)}. Change or delete those bands first.` };
  }
  return { doc: { ...doc, motifs: doc.motifs.filter((m) => m.id !== id) } };
}

export function deleteMapping(doc: PatternDoc, id: string): DeleteResult {
  const users = bandsUsingMapping(doc, id);
  if (users.length) {
    return { blocked: `Mapping “${id}” is used by ${describeBands(doc, users)}. Change or delete those bands first.` };
  }
  return { doc: { ...doc, mappings: doc.mappings.filter((m) => m.id !== id) } };
}

export function deleteColor(doc: PatternDoc, id: string): DeleteResult {
  const users = mappingsUsingColor(doc, id);
  if (users.length) {
    const list = users.map((m) => `“${m}”`).join(', ');
    return {
      blocked: `Colour “${id}” is used by mapping${users.length > 1 ? 's' : ''} ${list}. Remove it from ${users.length > 1 ? 'them' : 'it'} first.`,
    };
  }
  return { doc: { ...doc, palette: doc.palette.filter((c) => c.id !== id) } };
}

// ---- adding ----

export function duplicateMotif(doc: PatternDoc, id: string): { doc: PatternDoc; id: string } {
  const source = findMotif(doc, id)!;
  const newId = uniqueId(`${id}-copy`, doc.motifs.map((m) => m.id));
  const copy: Motif = { ...source, id: newId, rows: [...source.rows] };
  if (source.name) copy.name = `${source.name} (copy)`;
  const index = doc.motifs.indexOf(source);
  const motifs = [...doc.motifs];
  motifs.splice(index + 1, 0, copy);
  return { doc: { ...doc, motifs }, id: newId };
}

export function duplicateMapping(doc: PatternDoc, id: string): { doc: PatternDoc; id: string } {
  const source = findMapping(doc, id)!;
  const newId = uniqueId(`${id}-copy`, doc.mappings.map((m) => m.id));
  const copy: Mapping = { ...source, id: newId, rows: source.rows.map((r) => [...r]) };
  if (source.name) copy.name = `${source.name} (copy)`;
  const index = doc.mappings.indexOf(source);
  const mappings = [...doc.mappings];
  mappings.splice(index + 1, 0, copy);
  return { doc: { ...doc, mappings }, id: newId };
}

/** Makes sure a 1×1 all-background motif exists and returns its id. */
export function ensureSpacer(doc: PatternDoc): { doc: PatternDoc; id: string } {
  const existing = doc.motifs.find((m) => m.rows.length === 1 && m.rows[0] === '0');
  if (existing) return { doc, id: existing.id };
  const id = uniqueId(SPACER_ID, doc.motifs.map((m) => m.id));
  return { doc: { ...doc, motifs: [...doc.motifs, { id, name: 'Spacer', rows: ['0'] }] }, id };
}

/** Today's timestamp in meta.modified. */
export function touch(doc: PatternDoc, now = new Date()): PatternDoc {
  return { ...doc, meta: { ...doc.meta, modified: now.toISOString().slice(0, 19) + 'Z' } };
}
