// The gauge preview: every stitch at its true size from the core's layout
// (per_cm / gauge.stitches wide, per_cm / gauge.rows tall), with
// centimetre rulers along the left and bottom edges.

import type { CompiledChart, PatternDoc, StitchLayout } from '../core/types';
import { chartColors, type Theme } from './chart';

export interface GaugeDraw {
  chart: CompiledChart;
  doc: PatternDoc;
  layout: StitchLayout;
  grayscale: boolean;
  theme: Theme;
  /** Pixels per centimetre. */
  scale: number;
  /** Bottom-left corner of the knitting, in pixels. */
  ox: number;
  oy: number;
  width: number;
  height: number;
  /** Outline a 10 × 10 cm square from the bottom-left corner. */
  showSquare: boolean;
}

export const RULER = 28;

/** Physical size of the knitting in cm. */
export function physicalSize(layout: StitchLayout, chart: CompiledChart): { width: number; height: number } {
  return { width: chart.width * layout.stitchWidth, height: chart.height * layout.rowHeight };
}

export function drawGauge(ctx: CanvasRenderingContext2D, p: GaugeDraw): void {
  const { chart, layout, scale, ox, oy, theme } = p;
  const size = physicalSize(layout, chart);
  const half = size.width / 2;
  const colors = chartColors(chart, p.doc, p.grayscale).map(([r, g, b]) => `rgb(${r},${g},${b})`);
  const sw = layout.stitchWidth;
  const rh = layout.rowHeight;

  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, p.width, p.height);

  // Stitches, merged into runs of one colour per row.
  for (let y = 0; y < chart.height; y++) {
    const top = oy - (layout.rowY[y] + rh / 2) * scale;
    const bottom = oy - (layout.rowY[y] - rh / 2) * scale;
    if (bottom < 0 || top > p.height) continue;
    const start = layout.rowStart[y];
    const end = layout.rowStart[y + 1];
    let runStart = start;
    for (let i = start; i <= end; i++) {
      const color = i < end ? chart.cells[y * chart.width + (i - start)] : -1;
      const runColor = chart.cells[y * chart.width + (runStart - start)];
      if (i === end || color !== runColor) {
        const left = ox + (layout.x[runStart] - sw / 2 + half) * scale;
        const right = ox + (layout.x[i - 1] + sw / 2 + half) * scale;
        ctx.fillStyle = colors[runColor];
        ctx.fillRect(Math.floor(left), Math.floor(top), Math.ceil(right - left) + 1, Math.ceil(bottom - top) + 1);
        runStart = i;
      }
    }
  }

  // Faint stitch grid when zoomed in far enough.
  if (sw * scale >= 6) {
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= chart.width; c++) {
      const px = Math.round(ox + c * sw * scale) + 0.5;
      ctx.moveTo(px, oy - size.height * scale);
      ctx.lineTo(px, oy);
    }
    for (let r = 0; r <= chart.height; r++) {
      const py = Math.round(oy - r * rh * scale) + 0.5;
      ctx.moveTo(ox, py);
      ctx.lineTo(ox + size.width * scale, py);
    }
    ctx.stroke();
  }

  if (p.showSquare) {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = theme.highlight;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy - 10 * scale, 10 * scale, 10 * scale);
    ctx.setLineDash([]);
  }

  drawRulers(ctx, p, size);
  ctx.restore();
}

function drawRulers(ctx: CanvasRenderingContext2D, p: GaugeDraw, size: { width: number; height: number }): void {
  const { scale, ox, oy, theme } = p;
  // Rulers stick to the view edges.
  const left = Math.max(0, Math.min(ox - RULER, p.width - RULER));
  const bottom = Math.min(p.height - RULER, Math.max(oy, 0));
  ctx.fillStyle = theme.background;
  ctx.fillRect(left, 0, RULER, p.height);
  ctx.fillRect(0, bottom, p.width, RULER);

  const labelEvery = scale >= 30 ? 1 : scale >= 12 ? 2 : scale >= 5 ? 5 : 10;
  const minor = scale >= 40 ? 0.1 : scale >= 12 ? 0.5 : 1;
  ctx.strokeStyle = theme.text;
  ctx.fillStyle = theme.text;
  ctx.lineWidth = 1;
  ctx.font = '10px system-ui, sans-serif';

  // Bottom ruler: x from the left edge of the knitting.
  const maxX = Math.ceil(Math.max(size.width, (p.width - ox) / scale));
  ctx.beginPath();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i <= maxX / minor; i++) {
    const cm = Math.round(i * minor * 10) / 10;
    const px = Math.round(ox + cm * scale) + 0.5;
    if (px < left + RULER || px > p.width) continue;
    const whole = Math.abs(cm - Math.round(cm)) < 1e-6;
    const len = whole ? (Math.round(cm) % labelEvery === 0 ? 10 : 7) : 4;
    ctx.moveTo(px, bottom);
    ctx.lineTo(px, bottom + len);
    if (whole && Math.round(cm) % labelEvery === 0) ctx.fillText(String(Math.round(cm)), px, bottom + 12);
  }
  // Left ruler: y from the bottom edge.
  const maxY = Math.ceil(Math.max(size.height, oy / scale));
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= maxY / minor; i++) {
    const cm = Math.round(i * minor * 10) / 10;
    const py = Math.round(oy - cm * scale) + 0.5;
    if (py < 0 || py > bottom) continue;
    const whole = Math.abs(cm - Math.round(cm)) < 1e-6;
    const len = whole ? (Math.round(cm) % labelEvery === 0 ? 10 : 7) : 4;
    ctx.moveTo(left + RULER, py);
    ctx.lineTo(left + RULER - len, py);
    if (whole && Math.round(cm) % labelEvery === 0 && cm > 0) ctx.fillText(String(Math.round(cm)), left + RULER - 12, py);
  }
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = theme.muted;
  ctx.fillText('cm', left + 3, bottom + 14);
}
