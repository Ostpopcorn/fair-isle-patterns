// Types of the documents and results that cross the core boundary
// (specification sections 4 and 11). They mirror the Rust types; the key
// lists at the bottom are checked against real core output by
// core.test.ts, so the two cannot drift apart silently.

export const PATTERN_FORMAT = 'fairisle-pattern';
export const LIBRARY_FORMAT = 'fairisle-library';

export interface Meta {
  name: string;
  author?: string;
  license?: string;
  description?: string;
  created?: string;
  modified?: string;
  [unknown: string]: unknown;
}

export interface Gauge {
  stitches: number;
  rows: number;
  per_cm: number;
  [unknown: string]: unknown;
}

export interface Settings {
  float_notice: number;
  float_warning: number;
  max_colors_per_row: number;
  min_contrast: number;
  [unknown: string]: unknown;
}

export interface PaletteColor {
  id: string;
  hex: string;
  name?: string;
  yarn?: string;
  [unknown: string]: unknown;
}

/** Each row is a string of 0 (background), 1 (foreground), 2 (accent).
 * rows[0] is the bottom row; character 0 is the leftmost column. */
export interface Motif {
  id: string;
  name?: string;
  rows: string[];
  /** The motif's colourways, at least one. Ids are unique within the motif. */
  mappings: Mapping[];
  [unknown: string]: unknown;
}

/** The most colours one mapping may list. */
export const MAX_MAPPING_COLORS = 10;

/** A colourway of one motif. `colors` holds 1–10 palette ids; `rows` has one
 * entry per motif row, in the same order, each 2 or 3 digits: the positions
 * in `colors` of background, foreground and optionally accent. */
export interface Mapping {
  id: string;
  name?: string;
  colors: string[];
  rows: string[];
  [unknown: string]: unknown;
}

export interface Band {
  motif: string;
  mapping: string;
  offset: number;
  times: number;
  name?: string;
  [unknown: string]: unknown;
}

/** A normalized pattern document, as returned by parse. */
export interface PatternDoc {
  format: typeof PATTERN_FORMAT;
  version: number;
  meta: Meta;
  gauge: Gauge;
  cast_on: number;
  settings: Settings;
  palette: PaletteColor[];
  motifs: Motif[];
  /** First element = bottom band. */
  bands: Band[];
  [unknown: string]: unknown;
}

export interface LibraryDoc {
  format: typeof LIBRARY_FORMAT;
  version: number;
  meta: Meta;
  palette: PaletteColor[];
  motifs: Motif[];
  [unknown: string]: unknown;
}

export type AnyDoc = PatternDoc | LibraryDoc;

export type Severity = 'error' | 'warning' | 'notice';

export interface Run {
  /** Stitch number (1-based from the right) where the run starts; it
   * continues leftwards, wrapping from stitch cast_on back to 1. */
  start: number;
  length: number;
}

export interface IssueLocation {
  /** 0-based index into bands. */
  band?: number;
  motif?: string;
  mapping?: string;
  /** Palette colour id. */
  color?: string;
  /** Chart row, 1-based from the bottom. */
  row?: number;
  /** Stitch, 1-based from the right. */
  stitch?: number;
  /** W101 float runs, in stitch numbers. */
  runs?: Run[];
  /** Motif row, 1-based from the bottom. */
  motifRow?: number;
  /** Mapping row, 1-based. */
  mappingRow?: number;
  /** Path of the offending field, such as "bands[2].offset". */
  path?: string;
}

export interface Issue {
  code: string;
  severity: Severity;
  message: string;
  location: IssueLocation;
}

export interface CompiledChart {
  /** = cast_on */
  width: number;
  /** Total rows. */
  height: number;
  /** Palette ids; cells index into this. */
  palette: string[];
  /** width × height, row-major, bottom row first; value = palette index. */
  cells: Uint16Array;
  /** 0, 1 or 2 per cell. */
  symbols: Uint8Array;
  /** Band index per row. */
  rowBand: Uint16Array;
  // The shaping system will add a no-stitch sentinel value and per-row
  // stitch counts; consumers must not assume they never appear.
}

export interface StitchLayout {
  /** cm per stitch: per_cm / gauge.stitches. */
  stitchWidth: number;
  /** cm per row: per_cm / gauge.rows. */
  rowHeight: number;
  /** Centre line of each row in cm, bottom row first; the bottom edge is 0. */
  rowY: Float64Array;
  /** Index into x of each row's first stitch; height + 1 entries. */
  rowStart: Uint32Array;
  /** Centre of each stitch in cm, columns from the left, rows centred on 0. */
  x: Float64Array;
}

export interface ParseResult {
  /** Normalized, migrated document; null when it is not readable (E001). */
  doc: AnyDoc | null;
  /** E001–E008 and W106. */
  issues: Issue[];
  /** A newer format version: view it, but do not save over it. */
  readOnly: boolean;
}

// Every key each type may carry, checked against the core by core.test.ts.
export const ISSUE_KEYS = ['code', 'severity', 'message', 'location'] as const;
export const LOCATION_KEYS = [
  'band', 'motif', 'mapping', 'color', 'row', 'stitch', 'runs', 'motifRow', 'mappingRow', 'path',
] as const;
export const CHART_KEYS = ['width', 'height', 'palette', 'cells', 'symbols', 'rowBand'] as const;
export const LAYOUT_KEYS = ['stitchWidth', 'rowHeight', 'rowY', 'rowStart', 'x'] as const;
export const PARSE_KEYS = ['doc', 'issues', 'readOnly'] as const;
export const PATTERN_KEYS = [
  'format', 'version', 'meta', 'gauge', 'cast_on', 'settings', 'palette', 'motifs', 'bands',
] as const;
export const MOTIF_KEYS = ['id', 'name', 'rows', 'mappings'] as const;
export const MAPPING_KEYS = ['id', 'name', 'colors', 'rows'] as const;
export const BAND_KEYS = ['motif', 'mapping', 'offset', 'times', 'name'] as const;
