// Drawing the knitter's chart on a 2D canvas: square cells, band and
// repeat boundaries, row numbers from the bottom on the right, stitch
// numbers from the right along the bottom, issue markers and highlights.
// Used by the chart view (panned and zoomed) and by PNG export.

import type { CompiledChart, Issue, PatternDoc, Severity } from '../core/types';
import { displayRgb } from '../model/color';
import { findMotif, isSpacer } from '../model/doc';

export interface Theme {
  background: string;
  text: string;
  muted: string;
  grid: string;
  gridStrong: string;
  boundary: string;
  error: string;
  warning: string;
  notice: string;
  highlight: string;
}

export const LIGHT_THEME: Theme = {
  background: '#fffdf8',
  text: '#23211d',
  muted: '#7a7366',
  grid: 'rgba(110, 110, 110, 0.35)',
  gridStrong: 'rgba(20, 20, 20, 0.75)',
  boundary: '#111111',
  error: '#c62828',
  warning: '#d48a00',
  notice: '#9a9488',
  highlight: '#ff2d6f',
};

export const DARK_THEME: Theme = {
  background: '#23262d',
  text: '#ece8df',
  muted: '#a29c90',
  grid: 'rgba(150, 150, 150, 0.35)',
  gridStrong: 'rgba(240, 240, 240, 0.7)',
  boundary: '#f4f1ea',
  error: '#ff6b6b',
  warning: '#ffb84d',
  notice: '#8d877c',
  highlight: '#ff4f8b',
};

export function currentTheme(): Theme {
  const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? DARK_THEME : LIGHT_THEME;
}

/** Palette colours (as RGB) in chart palette order. */
export function chartColors(chart: CompiledChart, doc: PatternDoc, grayscale: boolean): [number, number, number][] {
  return chart.palette.map((id) => displayRgb(doc.palette.find((c) => c.id === id)?.hex ?? '#ff00ff', grayscale));
}

/** The chart at one pixel per cell, top row first, for scaled drawing. */
export function chartBitmap(chart: CompiledChart, doc: PatternDoc, grayscale: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, chart.width);
  canvas.height = Math.max(1, chart.height);
  if (!chart.width || !chart.height) return canvas;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(chart.width, chart.height);
  const colors = chartColors(chart, doc, grayscale);
  for (let y = 0; y < chart.height; y++) {
    const screenRow = chart.height - 1 - y;
    for (let x = 0; x < chart.width; x++) {
      const [r, g, b] = colors[chart.cells[y * chart.width + x]] ?? [255, 0, 255];
      const i = (screenRow * chart.width + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** A cell range to highlight: row y (0-based from the bottom), `length`
 * columns starting at column x (0-based from the left), wrapping. */
export interface HighlightSpan {
  y: number;
  x: number;
  length: number;
}

export interface Highlight {
  spans: HighlightSpan[];
  style: 'outline' | 'fill';
}

/** Rows (0-based) of every band. */
export function bandRanges(chart: CompiledChart): { band: number; start: number; end: number }[] {
  const out: { band: number; start: number; end: number }[] = [];
  for (let y = 0; y < chart.height; y++) {
    const band = chart.rowBand[y];
    const last = out[out.length - 1];
    if (last && last.band === band && last.end === y) last.end = y + 1;
    else out.push({ band, start: y, end: y + 1 });
  }
  return out;
}

/** What to highlight for an issue (section 7: thin outline for notices,
 * strong fill for warnings). */
export function highlightFor(issue: Issue | null, chart: CompiledChart): Highlight | null {
  if (!issue) return null;
  const n = chart.width;
  const style = issue.severity === 'notice' ? 'outline' : 'fill';
  const loc = issue.location;
  if (loc.row !== undefined && loc.runs?.length) {
    const y = loc.row - 1;
    return {
      style,
      spans: loc.runs.map((run) => ({ y, x: (((n - run.start - run.length + 1) % n) + n) % n, length: run.length })),
    };
  }
  if (loc.row !== undefined && loc.row >= 1 && loc.row <= chart.height) {
    return { style, spans: [{ y: loc.row - 1, x: 0, length: n }] };
  }
  if (loc.band !== undefined) {
    const range = bandRanges(chart).find((r) => r.band === loc.band);
    if (!range) return null;
    const spans: HighlightSpan[] = [];
    for (let y = range.start; y < range.end; y++) spans.push({ y, x: 0, length: n });
    return { style: 'outline', spans };
  }
  return null;
}

/** The most severe issue per chart row (0-based), for margin markers. */
export function rowMarkers(issues: Issue[], height: number): Map<number, Severity> {
  const rank: Record<Severity, number> = { error: 3, warning: 2, notice: 1 };
  const out = new Map<number, Severity>();
  for (const issue of issues) {
    const row = issue.location.row;
    if (row === undefined || row < 1 || row > height) continue;
    const prev = out.get(row - 1);
    if (!prev || rank[issue.severity] > rank[prev]) out.set(row - 1, issue.severity);
  }
  return out;
}

export interface ChartDraw {
  chart: CompiledChart;
  doc: PatternDoc;
  bitmap: CanvasImageSource;
  theme: Theme;
  /** Pixels per cell. */
  cell: number;
  /** Position of the chart's top-left corner. */
  ox: number;
  oy: number;
  /** Visible area. */
  width: number;
  height: number;
  highlight?: Highlight | null;
  markers?: Map<number, Severity>;
  /** Keep the number strips inside the visible area while panning. */
  stickyNumbers?: boolean;
}

export const NUMBER_STRIP = 34;
export const MARKER_STRIP = 12;

function numberStep(cell: number): number {
  if (cell >= 14) return 1;
  if (cell >= 7) return 5;
  if (cell >= 3) return 10;
  return 50;
}

/** Repeat boundary columns of a band: where a new motif repeat begins. */
export function repeatColumns(doc: PatternDoc, bandIndex: number, n: number): number[] {
  const band = doc.bands[bandIndex];
  // Spacers have no repeats.
  if (!band || isSpacer(band)) return [];
  const motif = findMotif(doc, band.motif);
  const w = motif?.rows[0]?.length ?? 0;
  if (!w || w >= n) return [];
  const shift = ((band.offset % w) + w) % w;
  const out: number[] = [];
  for (let c = 1; c < n; c++) if ((c + shift) % w === 0) out.push(c);
  return out;
}

export function drawChart(ctx: CanvasRenderingContext2D, p: ChartDraw): void {
  const { chart, theme, cell, ox, oy } = p;
  const n = chart.width;
  const h = chart.height;
  const cw = n * cell;
  const ch = h * cell;

  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, p.width, p.height);
  if (!n || !h) {
    ctx.fillStyle = theme.muted;
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('No bands yet. Add a band to see the chart.', 16, 28);
    ctx.restore();
    return;
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(p.bitmap, ox, oy, cw, ch);

  // Visible cell range.
  const x0 = Math.max(0, Math.floor(-ox / cell));
  const x1 = Math.min(n, Math.ceil((p.width - ox) / cell));
  const yTop0 = Math.max(0, Math.floor(-oy / cell));
  const yTop1 = Math.min(h, Math.ceil((p.height - oy) / cell));
  const rowY = (y: number) => oy + (h - 1 - y) * cell; // top edge of chart row y

  if (cell >= 5) {
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1; x++) {
      const px = Math.round(ox + x * cell) + 0.5;
      ctx.moveTo(px, Math.max(oy, 0));
      ctx.lineTo(px, Math.min(oy + ch, p.height));
    }
    for (let r = yTop0; r <= yTop1; r++) {
      const py = Math.round(oy + r * cell) + 0.5;
      ctx.moveTo(Math.max(ox, 0), py);
      ctx.lineTo(Math.min(ox + cw, p.width), py);
    }
    ctx.stroke();
  }

  // Repeat boundaries, per band.
  const ranges = bandRanges(chart);
  ctx.strokeStyle = theme.gridStrong;
  ctx.lineWidth = cell >= 5 ? 2 : 1;
  ctx.beginPath();
  for (const range of ranges) {
    const top = rowY(range.end - 1);
    const bottom = rowY(range.start) + cell;
    for (const c of repeatColumns(p.doc, range.band, n)) {
      if (c < x0 || c > x1) continue;
      const px = Math.round(ox + c * cell);
      ctx.moveTo(px, top);
      ctx.lineTo(px, bottom);
    }
  }
  ctx.stroke();

  // Band boundaries and the outline.
  ctx.strokeStyle = theme.boundary;
  ctx.lineWidth = cell >= 5 ? 2.5 : 1.5;
  ctx.beginPath();
  for (const range of ranges.slice(1)) {
    const py = Math.round(rowY(range.start) + cell);
    ctx.moveTo(ox, py);
    ctx.lineTo(ox + cw, py);
  }
  ctx.rect(Math.round(ox), Math.round(oy), Math.round(cw), Math.round(ch));
  ctx.stroke();

  // Highlights.
  if (p.highlight) {
    ctx.strokeStyle = theme.highlight;
    ctx.fillStyle = theme.highlight;
    for (const span of p.highlight.spans) {
      const top = rowY(span.y);
      const pieces: [number, number][] =
        span.x + span.length > n
          ? [
              [span.x, n - span.x],
              [0, span.x + span.length - n],
            ]
          : [[span.x, span.length]];
      for (const [x, len] of pieces) {
        if (p.highlight.style === 'fill') {
          ctx.globalAlpha = 0.55;
          ctx.fillRect(ox + x * cell, top, len * cell, cell);
          ctx.globalAlpha = 1;
          ctx.lineWidth = 2;
          ctx.strokeRect(ox + x * cell + 1, top + 1, len * cell - 2, cell - 2);
        } else {
          ctx.lineWidth = Math.max(1.5, Math.min(3, cell / 6));
          ctx.strokeRect(ox + x * cell + 1, top + 1, len * cell - 2, cell - 2);
        }
      }
    }
  }

  // Number strips: rows on the right, stitches along the bottom.
  const sticky = p.stickyNumbers ?? false;
  const stripX = sticky ? Math.min(ox + cw + 2, p.width - NUMBER_STRIP - MARKER_STRIP) : ox + cw + 2;
  const stripY = sticky ? Math.min(oy + ch + 2, p.height - NUMBER_STRIP + 10) : oy + ch + 2;
  const step = numberStep(cell);
  const fontSize = Math.max(8, Math.min(12, cell * 0.75));
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';

  ctx.fillStyle = theme.background;
  ctx.fillRect(stripX, 0, NUMBER_STRIP + MARKER_STRIP, p.height);
  ctx.fillRect(0, stripY, p.width, NUMBER_STRIP);

  // Issue markers in the row margin.
  if (p.markers) {
    for (const [y, severity] of p.markers) {
      const cy = rowY(y) + cell / 2;
      if (cy < -cell || cy > p.height + cell) continue;
      const mx = stripX + MARKER_STRIP / 2;
      if (severity === 'notice') {
        ctx.fillStyle = theme.notice;
        ctx.beginPath();
        ctx.arc(mx, cy, Math.max(1.5, Math.min(2.5, cell / 5)), 0, Math.PI * 2);
        ctx.fill();
      } else {
        const s = Math.max(4, Math.min(8, cell * 0.6));
        ctx.fillStyle = severity === 'error' ? theme.error : theme.warning;
        ctx.beginPath();
        ctx.moveTo(mx, cy - s / 2 - 1);
        ctx.lineTo(mx + s / 2 + 1, cy + s / 2);
        ctx.lineTo(mx - s / 2 - 1, cy + s / 2);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  ctx.fillStyle = theme.text;
  ctx.textAlign = 'left';
  for (let r = yTop0; r < yTop1; r++) {
    const y = h - 1 - r;
    const row = y + 1;
    if (row % step !== 0 && row !== 1 && step !== 1) continue;
    ctx.fillText(String(row), stripX + MARKER_STRIP + 2, oy + r * cell + cell / 2);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  // Rotate stitch numbers only when they do not fit side by side.
  const rotate = ctx.measureText(String(n)).width > step * cell - 2;
  for (let x = x0; x < x1; x++) {
    const stitch = n - x;
    if (stitch % step !== 0 && stitch !== 1 && step !== 1) continue;
    const label = String(stitch);
    const cx = ox + x * cell + cell / 2;
    if (rotate) {
      ctx.save();
      ctx.translate(cx, stripY + 3);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(label, cx, stripY + 3);
    }
  }
  ctx.restore();
}

/** Converts a pointer position to a chart cell. */
export function cellAt(px: number, py: number, p: { cell: number; ox: number; oy: number; chart: CompiledChart }) {
  const x = Math.floor((px - p.ox) / p.cell);
  const r = Math.floor((py - p.oy) / p.cell);
  if (x < 0 || x >= p.chart.width || r < 0 || r >= p.chart.height) return null;
  const y = p.chart.height - 1 - r;
  return { x, y, row: y + 1, stitch: p.chart.width - x };
}
