// Document helpers: creating patterns, ids, references and immutable
// updates. Documents are never mutated; every helper returns a new object
// and keeps unknown fields.

import type { Band, Mapping, Motif, MotifBand, PaletteColor, PatternDoc, Settings, SpacerBand } from '../core/types';
import { defaultMapping } from './mapping';

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

export const DEFAULT_MAPPING_ID = 'default';

export function newPattern(settings: Settings = DEFAULT_SETTINGS, now = new Date()): PatternDoc {
  const stamp = now.toISOString().slice(0, 19) + 'Z';
  const palette: PaletteColor[] = [
    { id: 'cream', hex: '#efe6d2', name: 'Cream' },
    { id: 'navy', hex: '#1f2a44', name: 'Navy' },
    { id: 'rust', hex: '#a4452c', name: 'Rust' },
  ];
  return {
    format: 'fairisle-pattern',
    version: 1,
    meta: { name: 'Untitled pattern', created: stamp, modified: stamp },
    gauge: { stitches: 28, rows: 32, per_cm: 10 },
    cast_on: 120,
    settings: { ...settings },
    palette,
    motifs: [{ id: 'peerie-x', name: 'Peerie X', rows: ['100001', '010010', '001100', '010010', '100001'], mappings: [defaultMapping(DEFAULT_MAPPING_ID, palette, 5)] }],
    bands: [newSpacer('cream', 2), newMotifBand('peerie-x', DEFAULT_MAPPING_ID), newSpacer('cream', 2)],
  };
}

// ---- bands ----

/** A band with a `color` field is a spacer, as in the core. */
export function isSpacer(band: Band): band is SpacerBand {
  return 'color' in band;
}

export function newSpacer(color: string, rows = 1): SpacerBand {
  return { color, rows };
}

/** A motif band as drawn: no offset, one repeat, not flipped. */
export function newMotifBand(motif: string, mapping: string): MotifBand {
  return { motif, mapping, offset: 0, times: 1, flip_horizontal: false, flip_vertical: false };
}

// ---- references ----

export function bandsUsingMotif(doc: PatternDoc, id: string): number[] {
  return doc.bands.flatMap((b, i) => (!isSpacer(b) && b.motif === id ? [i] : []));
}

export function bandsUsingMapping(doc: PatternDoc, motifId: string, mappingId: string): number[] {
  return doc.bands.flatMap((b, i) => (!isSpacer(b) && b.motif === motifId && b.mapping === mappingId ? [i] : []));
}

/** Spacers in the colour. */
export function spacersUsingColor(doc: PatternDoc, id: string): number[] {
  return doc.bands.flatMap((b, i) => (isSpacer(b) && b.color === id ? [i] : []));
}

export interface MappingRef {
  motif: string;
  mapping: string;
}

/** Mappings whose colour list includes the colour. */
export function mappingsUsingColor(doc: PatternDoc, id: string): MappingRef[] {
  return doc.motifs.flatMap((m) => m.mappings.filter((p) => p.colors.includes(id)).map((p) => ({ motif: m.id, mapping: p.id })));
}

/** "peerie-x / sunset" */
export function describeMapping(ref: MappingRef): string {
  return `${ref.motif} / ${ref.mapping}`;
}

export function findMotif(doc: PatternDoc, id: string | null): Motif | undefined {
  return id === null ? undefined : doc.motifs.find((m) => m.id === id);
}

/** A mapping of the given motif. */
export function findMapping(motif: Motif | undefined, id: string | null): Mapping | undefined {
  return id === null ? undefined : motif?.mappings.find((m) => m.id === id);
}

export function findColor(doc: PatternDoc, id: string): PaletteColor | undefined {
  return doc.palette.find((c) => c.id === id);
}

const atLeastOne = (n: number) => Number.isInteger(n) && n >= 1;

/** Rows a band occupies: motif height × times, or a spacer's rows; 0 if
 * unknown. */
export function bandHeight(doc: PatternDoc, band: Band): number {
  if (isSpacer(band)) return atLeastOne(band.rows) ? band.rows : 0;
  const motif = findMotif(doc, band.motif);
  return motif && atLeastOne(band.times) ? motif.rows.length * band.times : 0;
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

/** Bands as "band 2 (rows 6–10)" for messages. */
export function describeBands(doc: PatternDoc, indexes: number[]): string {
  const starts = bandStartRows(doc);
  return indexes
    .map((i) => {
      const h = bandHeight(doc, doc.bands[i]);
      const name = doc.bands[i].name ? ` “${doc.bands[i].name}”` : '';
      const rows = h === 0 ? 'no rows' : h === 1 ? `row ${starts[i]}` : `rows ${starts[i]}–${starts[i] + h - 1}`;
      return `band ${i + 1}${name} (${rows})`;
    })
    .join(', ');
}

// ---- immutable updates ----

export function updateMotif(doc: PatternDoc, id: string, fn: (m: Motif) => Motif): PatternDoc {
  return { ...doc, motifs: doc.motifs.map((m) => (m.id === id ? fn(m) : m)) };
}

export function updateMapping(doc: PatternDoc, motifId: string, mappingId: string, fn: (m: Mapping) => Mapping): PatternDoc {
  return updateMotif(doc, motifId, (m) => ({ ...m, mappings: m.mappings.map((p) => (p.id === mappingId ? fn(p) : p)) }));
}

/** Applies `fn` to the rows of every mapping of a motif, so the colours
 * follow motif edits that move, add or remove rows. */
export function withMappingRows(motif: Motif, fn: (rows: string[]) => string[]): Motif {
  return { ...motif, mappings: motif.mappings.map((p) => ({ ...p, rows: fn(p.rows) })) };
}

export function updateColor(doc: PatternDoc, id: string, fn: (c: PaletteColor) => PaletteColor): PatternDoc {
  return { ...doc, palette: doc.palette.map((c) => (c.id === id ? fn(c) : c)) };
}

/** Changes fields of band `index`; the patch must suit the kind of band. */
export function updateBand(doc: PatternDoc, index: number, patch: Partial<MotifBand> | Partial<SpacerBand>): PatternDoc {
  return { ...doc, bands: doc.bands.map((b, i) => (i === index ? ({ ...b, ...patch } as Band) : b)) };
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
      bands: doc.bands.map((b) => (!isSpacer(b) && b.motif === oldId ? { ...b, motif: newId } : b)),
    },
  };
}

/** Renames a mapping within its motif; bands using it follow. */
export function renameMapping(doc: PatternDoc, motifId: string, oldId: string, newId: string): RenameResult {
  if (oldId === newId) return { doc };
  const motif = findMotif(doc, motifId);
  if (!motif) return { error: `There is no motif “${motifId}”.` };
  const error = checkNewId(newId, motif.mappings.map((m) => m.id));
  if (error) return { error: error.replace('is already used.', `is already used by another mapping of “${motifId}”.`) };
  return {
    doc: {
      ...updateMapping(doc, motifId, oldId, (m) => ({ ...m, id: newId })),
      bands: doc.bands.map((b) => (!isSpacer(b) && b.motif === motifId && b.mapping === oldId ? { ...b, mapping: newId } : b)),
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
      motifs: doc.motifs.map((m) =>
        m.mappings.some((p) => p.colors.includes(oldId))
          ? { ...m, mappings: m.mappings.map((p) => ({ ...p, colors: p.colors.map((id) => (id === oldId ? newId : id)) })) }
          : m,
      ),
      bands: doc.bands.map((b) => (isSpacer(b) && b.color === oldId ? { ...b, color: newId } : b)),
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

export function deleteMapping(doc: PatternDoc, motifId: string, id: string): DeleteResult {
  const users = bandsUsingMapping(doc, motifId, id);
  if (users.length) {
    return { blocked: `Mapping “${id}” is used by ${describeBands(doc, users)}. Change or delete those bands first.` };
  }
  if ((findMotif(doc, motifId)?.mappings.length ?? 0) <= 1) {
    return { blocked: `“${id}” is the only mapping of motif “${motifId}”, and every motif needs one. Add another mapping before deleting this one.` };
  }
  return { doc: updateMotif(doc, motifId, (m) => ({ ...m, mappings: m.mappings.filter((p) => p.id !== id) })) };
}

export function deleteColor(doc: PatternDoc, id: string): DeleteResult {
  const mappings = mappingsUsingColor(doc, id);
  const spacers = spacersUsingColor(doc, id);
  if (mappings.length || spacers.length) {
    const s = (n: number) => (n > 1 ? 's' : '');
    const users: string[] = [];
    const fixes: string[] = [];
    if (mappings.length) {
      users.push(`mapping${s(mappings.length)} ${mappings.map((m) => `“${describeMapping(m)}”`).join(', ')}`);
      fixes.push(`remove it from ${spacers.length ? `the mapping${s(mappings.length)}` : mappings.length > 1 ? 'them' : 'it'}`);
    }
    if (spacers.length) {
      users.push(`the spacer${s(spacers.length)} ${describeBands(doc, spacers)}`);
      fixes.push(`give the spacer${s(spacers.length)} another colour`);
    }
    const fix = fixes.join(' and ');
    return { blocked: `Colour “${id}” is used by ${users.join(' and ')}. ${fix[0].toUpperCase()}${fix.slice(1)} first.` };
  }
  return { doc: { ...doc, palette: doc.palette.filter((c) => c.id !== id) } };
}

// ---- adding ----

export function duplicateMotif(doc: PatternDoc, id: string): { doc: PatternDoc; id: string } {
  const source = findMotif(doc, id)!;
  const newId = uniqueId(`${id}-copy`, doc.motifs.map((m) => m.id));
  const copy: Motif = {
    ...source,
    id: newId,
    rows: [...source.rows],
    mappings: source.mappings.map((p) => ({ ...p, colors: [...p.colors], rows: [...p.rows] })),
  };
  if (source.name) copy.name = `${source.name} (copy)`;
  const index = doc.motifs.indexOf(source);
  const motifs = [...doc.motifs];
  motifs.splice(index + 1, 0, copy);
  return { doc: { ...doc, motifs }, id: newId };
}

export function duplicateMapping(doc: PatternDoc, motifId: string, id: string): { doc: PatternDoc; id: string } {
  const motif = findMotif(doc, motifId)!;
  const source = findMapping(motif, id)!;
  const newId = uniqueId(`${id}-copy`, motif.mappings.map((m) => m.id));
  const copy: Mapping = { ...source, id: newId, colors: [...source.colors], rows: [...source.rows] };
  if (source.name) copy.name = `${source.name} (copy)`;
  const mappings = [...motif.mappings];
  mappings.splice(mappings.indexOf(source) + 1, 0, copy);
  return { doc: updateMotif(doc, motifId, (m) => ({ ...m, mappings })), id: newId };
}

/** Adds a mapping to a motif: the first three palette colours on every row. */
export function addMapping(doc: PatternDoc, motifId: string, name = ''): { doc: PatternDoc; id: string } {
  const motif = findMotif(doc, motifId)!;
  const id = uniqueId(slugify(name || 'mapping', 'mapping'), motif.mappings.map((m) => m.id));
  const mapping = withOptional({ ...defaultMapping(id, doc.palette, motif.rows.length), name: undefined }, 'name', name);
  return { doc: updateMotif(doc, motifId, (m) => ({ ...m, mappings: [...m.mappings, mapping] })), id };
}

/** A new motif of the given size, with the default mapping. */
export function blankMotif(doc: PatternDoc, id: string, rows: string[]): Motif {
  return { id, rows, mappings: [defaultMapping(DEFAULT_MAPPING_ID, doc.palette, rows.length)] };
}

/** Today's timestamp in meta.modified. */
export function touch(doc: PatternDoc, now = new Date()): PatternDoc {
  return { ...doc, meta: { ...doc.meta, modified: now.toISOString().slice(0, 19) + 'Z' } };
}
