// The in-the-round preview: the front half of the knitted tube. Each row
// is a ring with circumference cast_on × stitch width; a stitch at angle θ
// is drawn at horizontal position r · sin θ, so motifs compress towards
// the sides as on a real body. The back half is hidden.

import type { CompiledChart, PatternDoc, StitchLayout } from '../core/types';
import { chartColors, type Theme } from './chart';

export interface RoundDraw {
  chart: CompiledChart;
  doc: PatternDoc;
  layout: StitchLayout;
  grayscale: boolean;
  theme: Theme;
  /** Radians; spins the tube. */
  rotation: number;
  /** Pixels per centimetre. */
  scale: number;
  /** Centre line and bottom edge of the tube, in pixels. */
  cx: number;
  bottom: number;
  width: number;
  height: number;
}

/** Angle of the left edge of column c on the ring. Column 0 starts at the
 * back (−π) when rotation is 0, so the chart's centre faces the viewer. */
export function columnAngle(c: number, n: number, rotation: number): number {
  return (2 * Math.PI * c) / n - Math.PI + rotation;
}

/** Wraps an angle into [−π, π). */
export function wrapAngle(a: number): number {
  const t = (a + Math.PI) % (2 * Math.PI);
  return (t < 0 ? t + 2 * Math.PI : t) - Math.PI;
}

/** Where the beginning-of-round seam (between stitch 1, the rightmost
 * column, and stitch cast_on) is on screen, or null when it is at the back. */
export function seamX(p: { chart: CompiledChart; rotation: number; radiusPx: number; cx: number }): number | null {
  const theta = wrapAngle(columnAngle(0, p.chart.width, p.rotation));
  return Math.abs(theta) < Math.PI / 2 ? p.cx + p.radiusPx * Math.sin(theta) : null;
}

export function drawRound(ctx: CanvasRenderingContext2D, p: RoundDraw): void {
  const { chart, layout, theme } = p;
  const n = chart.width;
  const radius = (n * layout.stitchWidth) / (2 * Math.PI);
  const rpx = radius * p.scale;
  const rowPx = layout.rowHeight * p.scale;

  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, p.width, p.height);
  if (!n || !chart.height || rpx < 1) {
    ctx.restore();
    return;
  }

  // The pixels are computed at device resolution: putImageData ignores the
  // canvas transform, so on high-density screens everything is scaled by k.
  const k = ctx.getTransform().a || 1;
  const cxD = p.cx * k;
  const rD = rpx * k;
  const rowD = rowPx * k;
  const baseD = p.bottom * k;
  const left = Math.max(0, Math.floor(cxD - rD));
  const right = Math.min(Math.round(p.width * k), Math.ceil(cxD + rD));
  const top = Math.max(0, Math.floor(baseD - chart.height * rowD));
  const bottom = Math.min(Math.round(p.height * k), Math.ceil(baseD));
  const w = right - left;
  const h = bottom - top;
  if (w <= 0 || h <= 0) {
    ctx.restore();
    return;
  }

  // Per screen column: which stitch column faces it, and how much it is
  // turned away from the viewer.
  const column = new Int32Array(w);
  const shade = new Float32Array(w);
  const edge = new Uint8Array(w);
  for (let i = 0; i < w; i++) {
    const u = Math.max(-1, Math.min(1, (left + i + 0.5 - cxD) / rD));
    const theta = Math.asin(u);
    const turns = (theta + Math.PI - p.rotation) / (2 * Math.PI);
    const c = Math.floor((((turns % 1) + 1) % 1) * n) % n;
    column[i] = c;
    shade[i] = 0.5 + 0.5 * Math.cos(theta);
    if (i > 0 && column[i - 1] !== c) edge[i] = 1;
  }

  const colors = chartColors(chart, p.doc, p.grayscale);
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const showSeams = rowPx >= 4;
  const seamWidth = Math.max(1, Math.round(k));
  for (let j = 0; j < h; j++) {
    const fromBottom = baseD - (top + j + 0.5);
    const y = Math.floor(fromBottom / rowD);
    if (y < 0 || y >= chart.height) continue;
    const rowEdge = showSeams && Math.floor((fromBottom + seamWidth) / rowD) !== y;
    const base = y * n;
    for (let i = 0; i < w; i++) {
      const rgb = colors[chart.cells[base + column[i]]] ?? [255, 0, 255];
      let s = shade[i];
      if (rowEdge || (showSeams && edge[i] && shade[i] > 0.6)) s *= 0.88;
      const o = (j * w + i) * 4;
      data[o] = rgb[0] * s;
      data[o + 1] = rgb[1] * s;
      data[o + 2] = rgb[2] * s;
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, left, top);

  const sx = seamX({ chart, rotation: p.rotation, radiusPx: rpx, cx: p.cx });
  if (sx !== null) {
    ctx.strokeStyle = theme.highlight;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, top / k - 6);
    ctx.lineTo(sx, bottom / k + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = theme.highlight;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('start of round', sx, Math.max(12, top / k - 8));
  }
  ctx.restore();
}
