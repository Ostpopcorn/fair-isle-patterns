// The printable pattern (section 9): name and settings, a colour legend
// with names and yarns, the chart split across pages with row and stitch
// numbers repeated on every page, and a per-row colour table.

import type { CompiledChart, PatternDoc } from '../core/types';
import { displayRgb, lightness } from '../model/color';
import { bandHeight, findMapping, findMotif } from '../model/doc';
import { slotColor } from '../model/mapping';
import { bandRanges, repeatColumns } from './chart';
import { PdfDocument, type PdfPage, type Rgb, textWidth } from './pdf';

export type Paper = 'a4' | 'letter';

export const PAPER: Record<Paper, { width: number; height: number; label: string }> = {
  a4: { width: 595.28, height: 841.89, label: 'A4' },
  letter: { width: 612, height: 792, label: 'US Letter' },
};

const MARGIN = 36;
const INK: Rgb = [20, 20, 20];
const MUTED: Rgb = [110, 105, 95];
const GRID: Rgb = [150, 150, 150];

const SYMBOLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** One letter per palette colour, in palette order, for the legend and cells. */
export function symbolFor(index: number): string {
  return SYMBOLS[index] ?? '?';
}

export interface PdfOptions {
  paper: Paper;
  grayscale: boolean;
  /** Chart cell size in millimetres. */
  cellMm?: number;
}

function colorName(doc: PatternDoc, id: string): string {
  const c = doc.palette.find((p) => p.id === id);
  return c?.name ? `${c.name} (${id})` : id;
}

export function patternPdf(doc: PatternDoc, chart: CompiledChart, options: PdfOptions): Uint8Array {
  const paper = PAPER[options.paper];
  const pdf = new PdfDocument(doc.meta.name || 'Fair isle pattern');
  const rgbOf = (id: string): Rgb => displayRgb(doc.palette.find((c) => c.id === id)?.hex ?? '#ff00ff', options.grayscale);
  const name = doc.meta.name || 'Untitled pattern';

  const footer = (page: PdfPage, label: string) => {
    page.text(MARGIN, paper.height - MARGIN / 2, `${name} — ${label}`, 8, { fill: MUTED });
  };

  // ---- page 1: overview ----
  {
    const page = pdf.addPage(paper.width, paper.height);
    let y = MARGIN + 20;
    page.text(MARGIN, y, name, 20, { bold: true });
    y += 18;
    const byline = [doc.meta.author && `by ${doc.meta.author}`, doc.meta.license && `licence ${doc.meta.license}`].filter(Boolean).join(' · ');
    if (byline) {
      page.text(MARGIN, y, byline, 10, { fill: MUTED });
      y += 14;
    }
    if (doc.meta.description) y = page.paragraph(MARGIN, y + 6, doc.meta.description, 10, paper.width - 2 * MARGIN) + 4;

    const g = doc.gauge;
    const widthCm = (chart.width * g.per_cm) / g.stitches;
    const heightCm = (chart.height * g.per_cm) / g.rows;
    const s = doc.settings;
    const facts: [string, string][] = [
      ['Cast on', `${doc.cast_on} stitches, joined in the round`],
      ['Chart', `${chart.width} stitches × ${chart.height} rows`],
      ['Gauge', `${g.stitches} stitches and ${g.rows} rows per ${g.per_cm} cm`],
      ['Finished size', `${widthCm.toFixed(1)} cm around × ${heightCm.toFixed(1)} cm tall`],
      ['Checks', `floats noted from ${s.float_notice}, warned from ${s.float_warning}; at most ${s.max_colors_per_row} colours per row`],
    ];
    y += 14;
    page.text(MARGIN, y, 'Pattern', 12, { bold: true });
    y += 16;
    for (const [k, v] of facts) {
      page.text(MARGIN, y, k, 10, { bold: true });
      page.text(MARGIN + 90, y, v, 10);
      y += 14;
    }
    y = page.paragraph(
      MARGIN,
      y + 6,
      'Reading the chart: rows are numbered from the bottom, so row 1 is the first round knitted. Stitches are numbered from the right; read every round from right to left. Heavy horizontal lines separate bands, heavy vertical lines mark motif repeats.',
      9,
      paper.width - 2 * MARGIN,
    );

    // Legend.
    y += 14;
    page.text(MARGIN, y, 'Colours', 12, { bold: true });
    y += 8;
    const used = new Set(Array.from(chart.cells, (c) => chart.palette[c]));
    doc.palette.forEach((c, i) => {
      if (y > paper.height - MARGIN - 40) return;
      const rgb = rgbOf(c.id);
      page.rect(MARGIN, y, 16, 16, rgb, INK, 0.5);
      page.text(MARGIN + 8, y + 11.5, symbolFor(i), 9, { bold: true, align: 'center', fill: lightness(rgb) > 55 ? INK : [255, 255, 255] });
      page.text(MARGIN + 24, y + 11.5, c.name ?? c.id, 10, { bold: true });
      const details = [c.name ? c.id : null, c.hex, c.yarn].filter(Boolean).join(' · ') + (used.has(c.id) ? '' : ' · not used in the chart');
      page.text(MARGIN + 24 + textWidth(c.name ?? c.id, 10, true) + 8, y + 11.5, details, 9, { fill: MUTED });
      y += 20;
    });

    // Bands.
    y += 12;
    if (y < paper.height - MARGIN - 60) {
      page.text(MARGIN, y, 'Bands, bottom to top', 12, { bold: true });
      y += 16;
      let row = 1;
      doc.bands.forEach((b, i) => {
        const h = bandHeight(doc, b);
        if (y > paper.height - MARGIN - 20) return;
        const motif = findMotif(doc, b.motif);
        const label = `${i + 1}. rows ${row}–${row + h - 1}: ${b.name ?? motif?.name ?? b.motif} (motif ${b.motif}, mapping ${b.mapping}${b.offset ? `, offset ${b.offset}` : ''}${b.times > 1 ? `, ${b.times} times` : ''})`;
        page.text(MARGIN, y, label, 9);
        y += 12;
        row += h;
      });
    }
    footer(page, 'overview');
  }

  // ---- chart pages ----
  const cell = ((options.cellMm ?? 4) / 25.4) * 72;
  const numberW = 22;
  const headerH = 30;
  const legendH = 30;
  const cols = Math.max(1, Math.floor((paper.width - 2 * MARGIN - numberW) / cell));
  const rows = Math.max(1, Math.floor((paper.height - 2 * MARGIN - headerH - legendH - 20) / cell));
  const colPages = Math.ceil(chart.width / cols);
  const rowPages = Math.ceil(chart.height / rows);
  const total = colPages * rowPages;
  const ranges = bandRanges(chart);
  const symbolIndex = new Map(doc.palette.map((c, i) => [c.id, i]));
  let pageNo = 0;
  for (let rp = 0; rp < rowPages; rp++) {
    for (let cp = 0; cp < colPages; cp++) {
      pageNo++;
      const page = pdf.addPage(paper.width, paper.height);
      // Stitches s0..s1 (from the right) and rows r0..r1 (from the bottom), 1-based.
      const s0 = cp * cols + 1;
      const s1 = Math.min(chart.width, s0 + cols - 1);
      const r0 = rp * rows + 1;
      const r1 = Math.min(chart.height, r0 + rows - 1);
      const tileW = (s1 - s0 + 1) * cell;
      const tileH = (r1 - r0 + 1) * cell;
      const left = MARGIN;
      const top = MARGIN + headerH;
      page.text(MARGIN, MARGIN + 12, `${name} — chart ${pageNo} of ${total}`, 12, { bold: true });
      page.text(MARGIN, MARGIN + 24, `Rows ${r0}–${r1}, stitches ${s1}–${s0}. Read each round from right to left.`, 9, { fill: MUTED });

      // Cell (stitch s, row r) sits at column x = width − s.
      const xOf = (s: number) => left + (s1 - s) * cell;
      const yOf = (r: number) => top + (r1 - r) * cell;
      const fontSize = Math.min(7, cell * 0.6);
      for (let r = r0; r <= r1; r++) {
        for (let s = s0; s <= s1; s++) {
          const c = chart.width - s;
          const id = chart.palette[chart.cells[(r - 1) * chart.width + c]];
          const rgb = rgbOf(id);
          page.rect(xOf(s), yOf(r), cell, cell, rgb);
          if (cell >= 8) {
            page.text(xOf(s) + cell / 2, yOf(r) + cell / 2 + fontSize * 0.36, symbolFor(symbolIndex.get(id) ?? -1), fontSize, {
              align: 'center',
              fill: lightness(rgb) > 55 ? INK : [255, 255, 255],
            });
          }
        }
      }
      // Grid.
      for (let s = s0; s <= s1 + 1; s++) page.line(xOf(s) + cell, top, xOf(s) + cell, top + tileH, GRID, 0.3);
      for (let r = r0; r <= r1 + 1; r++) page.line(left, yOf(r) + cell, left + tileW, yOf(r) + cell, GRID, 0.3);
      // Repeat boundaries within each band, and band boundaries.
      for (const range of ranges) {
        const a = Math.max(range.start + 1, r0);
        const b = Math.min(range.end, r1);
        if (a > b) continue;
        for (const c of repeatColumns(doc, range.band, chart.width)) {
          // Boundary on the left edge of column c = between stitches width−c+1 and width−c.
          const s = chart.width - c;
          if (s < s0 || s >= s1) continue;
          const x = xOf(s);
          page.line(x, yOf(b), x, yOf(a) + cell, INK, 1);
        }
        if (range.start > 0 && range.start + 1 >= r0 && range.start + 1 <= r1) {
          const y = yOf(range.start + 1) + cell;
          page.line(left, y, left + tileW, y, INK, 1.4);
        }
      }
      page.rect(left, top, tileW, tileH, null, INK, 1);

      // Row numbers on the right, stitch numbers along the bottom.
      const numSize = Math.min(7, cell * 0.62);
      for (let r = r0; r <= r1; r++) page.text(left + tileW + 3, yOf(r) + cell / 2 + numSize * 0.36, String(r), numSize);
      const every = cell >= 10 ? 1 : 5;
      for (let s = s0; s <= s1; s++) {
        if (every > 1 && s % every !== 0 && s !== s0) continue;
        page.text(xOf(s) + cell / 2, top + tileH + numSize + 3, String(s), numSize * (String(s).length > 2 ? 0.85 : 1), { align: 'center' });
      }

      // Compact legend on every chart page.
      let lx = MARGIN;
      const ly = top + tileH + 24;
      doc.palette.forEach((c, i) => {
        if (!chart.palette.includes(c.id)) return;
        const label = `${c.name ?? c.id}${c.yarn ? ` (${c.yarn})` : ''}`;
        const w = 14 + textWidth(label, 8) + 12;
        if (lx + w > paper.width - MARGIN) return;
        const rgb = rgbOf(c.id);
        page.rect(lx, ly - 8, 10, 10, rgb, INK, 0.4);
        page.text(lx + 5, ly - 0.5, symbolFor(i), 6.5, { align: 'center', bold: true, fill: lightness(rgb) > 55 ? INK : [255, 255, 255] });
        page.text(lx + 14, ly, label, 8);
        lx += w;
      });
      footer(page, `chart ${pageNo} of ${total}`);
    }
  }

  // ---- per-row colour table ----
  const lineH = 12.5;
  const colX = [MARGIN, MARGIN + 36, MARGIN + 70, MARGIN + 190, MARGIN + 310, MARGIN + 430];
  const headers = ['Row', 'Band', 'Motif', 'Background', 'Foreground', 'Accent'];
  let page: PdfPage | null = null;
  let y = 0;
  const swatchText = (p: PdfPage, x: number, yy: number, id: string | undefined) => {
    if (!id) {
      p.text(x, yy, '—', 8.5, { fill: MUTED });
      return;
    }
    p.rect(x, yy - 7.5, 8, 8, rgbOf(id), INK, 0.3);
    p.text(x + 12, yy, colorName(doc, id), 8.5);
  };
  let row = 1;
  doc.bands.forEach((band, b) => {
    const h = bandHeight(doc, band);
    const motif = findMotif(doc, band.motif);
    const mapping = findMapping(motif, band.mapping);
    for (let j = 0; j < h; j++, row++) {
      if (!page || y > paper.height - MARGIN - 20) {
        page = pdf.addPage(paper.width, paper.height);
        page.text(MARGIN, MARGIN + 12, `${name} — colours per row`, 12, { bold: true });
        y = MARGIN + 34;
        headers.forEach((t, i) => page!.text(colX[i], y, t, 8.5, { bold: true }));
        page.line(MARGIN, y + 4, paper.width - MARGIN, y + 4, INK, 0.6);
        y += lineH + 2;
        footer(page, 'colours per row');
      }
      // The mapping has one row per motif row, so both repeat together.
      const r = j % (motif?.rows.length || 1);
      const slot = (k: 0 | 1 | 2) => (mapping ? (slotColor(mapping, r, k) ?? undefined) : undefined);
      page.text(colX[0], y, String(row), 8.5, { bold: true });
      page.text(colX[1], y, String(b + 1), 8.5);
      page.text(colX[2], y, (band.name ?? motif?.name ?? band.motif).slice(0, 22), 8.5);
      swatchText(page, colX[3], y, slot(0));
      swatchText(page, colX[4], y, slot(1));
      swatchText(page, colX[5], y, slot(2));
      if (j === h - 1) page.line(MARGIN, y + 4, paper.width - MARGIN, y + 4, GRID, 0.3);
      y += lineH;
    }
  });

  return pdf.bytes();
}
