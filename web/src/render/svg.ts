// SVG export of the chart view: vector cells, grid, band and repeat
// boundaries, row and stitch numbers, and a colour legend.

import type { CompiledChart, PatternDoc } from '../core/types';
import { displayHex, displayRgb, inkFor } from '../model/color';
import { bandRanges, repeatColumns } from './chart';
import { symbolFor } from './patternPdf';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function chartSvg(doc: PatternDoc, chart: CompiledChart, options: { grayscale: boolean; cell?: number }): string {
  const cell = options.cell ?? 14;
  const n = chart.width;
  const h = chart.height;
  const pad = 20;
  const titleH = 28;
  const strip = 34;
  const ox = pad;
  const oy = pad + titleH;
  const cw = n * cell;
  const ch = h * cell;
  const legendRows = doc.palette.length;
  const legendTop = oy + ch + strip + 12;
  const width = Math.max(ox + cw + strip + pad, 360);
  const height = legendTop + legendRows * 22 + pad;
  const hexOf = (id: string) => displayHex(doc.palette.find((c) => c.id === id)?.hex ?? '#ff00ff', options.grayscale);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">`,
    `<title>${esc(doc.meta.name || 'Fair isle chart')}</title>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="${pad}" y="${pad + 14}" font-size="16" font-weight="bold">${esc(doc.meta.name || 'Fair isle chart')}</text>`,
    `<text x="${pad}" y="${pad + 28}" font-size="10" fill="#6b6458">${n} stitches × ${h} rows · rows from the bottom, stitches from the right</text>`,
  );

  // Cells, merged into runs per row.
  parts.push('<g shape-rendering="crispEdges">');
  for (let y = 0; y < h; y++) {
    const top = oy + (h - 1 - y) * cell;
    let start = 0;
    for (let x = 1; x <= n; x++) {
      const prev = chart.cells[y * n + start];
      if (x === n || chart.cells[y * n + x] !== prev) {
        parts.push(`<rect x="${ox + start * cell}" y="${top}" width="${(x - start) * cell}" height="${cell}" fill="${hexOf(chart.palette[prev])}"/>`);
        start = x;
      }
    }
  }
  parts.push('</g>');

  // Grid.
  let grid = '';
  for (let x = 0; x <= n; x++) grid += `M${ox + x * cell} ${oy}v${ch}`;
  for (let y = 0; y <= h; y++) grid += `M${ox} ${oy + y * cell}h${cw}`;
  parts.push(`<path d="${grid}" stroke="#808080" stroke-opacity="0.5" stroke-width="0.6" fill="none"/>`);

  // Repeat and band boundaries.
  let repeats = '';
  let bands = '';
  const ranges = bandRanges(chart);
  for (const range of ranges) {
    const top = oy + (h - range.end) * cell;
    for (const c of repeatColumns(doc, range.band, n)) repeats += `M${ox + c * cell} ${top}v${(range.end - range.start) * cell}`;
    if (range.start > 0) bands += `M${ox} ${oy + (h - range.start) * cell}h${cw}`;
  }
  parts.push(`<path d="${repeats}" stroke="#222222" stroke-width="1.6" fill="none"/>`);
  parts.push(`<path d="${bands}" stroke="#000000" stroke-width="2.4" fill="none"/>`);
  parts.push(`<rect x="${ox}" y="${oy}" width="${cw}" height="${ch}" fill="none" stroke="#000000" stroke-width="2"/>`);

  // Numbers.
  const fs = Math.max(6, Math.min(11, cell * 0.7));
  const step = cell >= 12 ? 1 : 5;
  parts.push(`<g font-size="${fs}" fill="#23211d">`);
  for (let y = 0; y < h; y++) {
    const row = y + 1;
    if (step > 1 && row % step && row !== 1) continue;
    parts.push(`<text x="${ox + cw + 4}" y="${oy + (h - 1 - y) * cell + cell / 2 + fs * 0.35}">${row}</text>`);
  }
  for (let x = 0; x < n; x++) {
    const stitch = n - x;
    if (step > 1 && stitch % step && stitch !== 1) continue;
    const cx = ox + x * cell + cell / 2;
    parts.push(`<text x="${cx}" y="${oy + ch + 4}" text-anchor="end" dominant-baseline="middle" transform="rotate(-90 ${cx} ${oy + ch + 4})">${stitch}</text>`);
  }
  parts.push('</g>');

  // Legend.
  parts.push(`<g font-size="11">`);
  doc.palette.forEach((c, i) => {
    const y = legendTop + i * 22;
    const rgb = displayRgb(c.hex, options.grayscale);
    parts.push(`<rect x="${pad}" y="${y}" width="16" height="16" fill="${displayHex(c.hex, options.grayscale)}" stroke="#000" stroke-width="0.6"/>`);
    parts.push(`<text x="${pad + 8}" y="${y + 12}" text-anchor="middle" font-size="9" font-weight="bold" fill="${inkFor(rgb)}">${symbolFor(i)}</text>`);
    const label = [c.name ?? c.id, c.id !== (c.name ?? c.id) ? c.id : null, c.hex, c.yarn].filter(Boolean).join(' · ');
    parts.push(`<text x="${pad + 24}" y="${y + 12}">${esc(label)}</text>`);
  });
  parts.push('</g></svg>');
  return parts.join('\n') + '\n';
}
