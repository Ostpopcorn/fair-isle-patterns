import { beforeAll, describe, expect, it } from 'vitest';
import { compile, parse } from '../core';
import type { PatternDoc } from '../core/types';
import { fixtureText, loadCore } from '../core/testing';
import { bandRanges, highlightFor, repeatColumns, rowMarkers } from './chart';
import { PdfDocument, encode, textWidth } from './pdf';
import { patternPdf } from './patternPdf';
import { columnAngle, wrapAngle } from './round';
import { chartSvg } from './svg';

beforeAll(loadCore);

const hat = () => parse(fixtureText('hat-basic')).doc as PatternDoc;
const latin1 = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

describe('pdf writer', () => {
  it('writes a well-formed file whose xref offsets point at the objects', () => {
    const pdf = new PdfDocument('Test (with parens)');
    const page = pdf.addPage(200, 100);
    page.rect(10, 10, 20, 20, [255, 0, 0], [0, 0, 0]);
    page.text(10, 50, 'Fair isle – “quoted” × 2 ✓', 12, { bold: true });
    const text = latin1(pdf.bytes());
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const offsets = [...text.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((offset, i) => expect(text.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true));
    // Stream lengths match their content.
    for (const m of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = m.index! + m[0].length;
      expect(text.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe('\nendstream');
    }
    expect(text).toContain('(Test \\(with parens\\))');
  });

  it('encodes text as WinAnsi', () => {
    expect(encode('A–B')).toEqual([65, 0x96, 66]);
    expect(encode('é×✓')).toEqual([0xe9, 0xd7, 63]);
    expect(textWidth('ii', 10)).toBeCloseTo(4.44, 2);
  });

  it('the hat pattern PDF has an overview, chart pages and a colour table', () => {
    const doc = hat();
    const text = latin1(patternPdf(doc, compile(doc)!, { paper: 'a4', grayscale: false }));
    expect(text).toMatch(/\/Count 5 /);
    // The em and en dashes are WinAnsi bytes 0x97 and 0x96.
    expect(text).toContain('(Peerie hat \x97 chart 1 of 3)');
    expect(text).toMatch(/\(Rows 1\x9613, stitches 44\x961\. /);
    expect(text).toContain('colours per row');
    // Row and stitch numbers on a chart page.
    expect(text).toContain('(13) Tj');
    expect(text).toContain('(44) Tj');
  });

  it('letter paper and grayscale work too', () => {
    const doc = hat();
    const text = latin1(patternPdf(doc, compile(doc)!, { paper: 'letter', grayscale: true }));
    expect(text).toContain('/MediaBox [0 0 612 792]');
  });
});

describe('svg', () => {
  it('draws merged cells, numbers and a legend', () => {
    const doc = hat();
    const svg = chartSvg(doc, compile(doc)!, { grayscale: false });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Natural · cream · #efe6d2');
    expect(svg).toContain('>13</text>');
    // Row 6 is one run of cream: a single rect 120 cells wide.
    expect(svg).toContain(`width="${120 * 14}" height="14" fill="#efe6d2"`);
    expect(chartSvg(doc, compile(doc)!, { grayscale: true })).not.toContain('fill="#a4452c"');
  });
});

describe('chart helpers', () => {
  it('band ranges and repeat boundaries', () => {
    const doc = hat();
    const chart = compile(doc)!;
    expect(bandRanges(chart)).toEqual([
      { band: 0, start: 0, end: 5 },
      { band: 1, start: 5, end: 6 },
      { band: 2, start: 6, end: 11 },
      { band: 3, start: 11, end: 13 },
    ]);
    expect(repeatColumns(doc, 0, 120).slice(0, 3)).toEqual([6, 12, 18]);
    // The flower band is offset 3: repeats start where (c + 3) is a multiple of 8.
    expect(repeatColumns(doc, 2, 120).slice(0, 3)).toEqual([5, 13, 21]);
  });

  it('a W101 highlight covers exactly the float runs', () => {
    const chart = compile(hat())!;
    const h = highlightFor(
      { code: 'W101', severity: 'notice', message: '', location: { row: 9, runs: [{ start: 9, length: 4 }, { start: 119, length: 4 }] } },
      chart,
    )!;
    expect(h.style).toBe('outline');
    // Stitches 9–12 are columns 111–108; stitches 119, 120, 1, 2 are columns 1, 0, 119, 118.
    expect(h.spans).toEqual([
      { y: 8, x: 108, length: 4 },
      { y: 8, x: 118, length: 4 },
    ]);
  });

  it('row markers keep the most severe issue', () => {
    const markers = rowMarkers(
      [
        { code: 'W101', severity: 'notice', message: '', location: { row: 9 } },
        { code: 'W102', severity: 'warning', message: '', location: { row: 9 } },
      ],
      13,
    );
    expect(markers.get(8)).toBe('warning');
  });
});

describe('in the round', () => {
  it('angles', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(-Math.PI);
    expect(wrapAngle(-0.5)).toBeCloseTo(-0.5);
    // With no rotation the chart's middle faces the viewer.
    expect(columnAngle(60, 120, 0)).toBeCloseTo(0);
  });
});
