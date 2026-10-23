// A small PDF writer: vector rectangles, lines and text in the standard
// Helvetica fonts. Enough for printable charts, with no dependencies and
// fully offline. Coordinates are in points with the origin at the top left.

export type Rgb = [number, number, number];

// Helvetica advance widths (1/1000 em) for character codes 32–126.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278,
  584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944,
  667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500,
  278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333,
  584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944,
  667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556,
  333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// Characters outside Latin-1 that WinAnsiEncoding still has.
const WIN_ANSI: Record<string, number> = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, '‰': 0x89, '‹': 0x8b, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94,
  '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, '›': 0x9b, '−': 0x2d,
};
const SPECIAL_WIDTH: Record<number, number> = { 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0xd7: 584, 0xb0: 400 };

/** Encodes text as WinAnsi codes; unsupported characters become '?'. */
export function encode(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (WIN_ANSI[ch] !== undefined) out.push(WIN_ANSI[ch]);
    else if (code >= 32 && code <= 126) out.push(code);
    else if (code >= 160 && code <= 255) out.push(code);
    else out.push(63);
  }
  return out;
}

export function textWidth(text: string, size: number, bold = false): number {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  let w = 0;
  for (const code of encode(text)) w += code >= 32 && code <= 126 ? table[code - 32] : (SPECIAL_WIDTH[code] ?? 556);
  return (w * size) / 1000;
}

function literal(text: string): string {
  let s = '(';
  for (const code of encode(text)) {
    if (code === 40 || code === 41 || code === 92) s += '\\' + String.fromCharCode(code);
    else s += String.fromCharCode(code);
  }
  return s + ')';
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();
const color = ([r, g, b]: Rgb) => `${n(r / 255)} ${n(g / 255)} ${n(b / 255)}`;

export class PdfPage {
  readonly ops: string[] = [];
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  private y(top: number): number {
    return this.height - top;
  }

  rect(x: number, y: number, w: number, h: number, fill: Rgb | null, stroke: Rgb | null = null, lineWidth = 0.5): void {
    if (fill) this.ops.push(`${color(fill)} rg`);
    if (stroke) this.ops.push(`${color(stroke)} RG ${n(lineWidth)} w`);
    this.ops.push(`${n(x)} ${n(this.y(y + h))} ${n(w)} ${n(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
  }

  line(x1: number, y1: number, x2: number, y2: number, stroke: Rgb, lineWidth = 0.5): void {
    this.ops.push(`${color(stroke)} RG ${n(lineWidth)} w ${n(x1)} ${n(this.y(y1))} m ${n(x2)} ${n(this.y(y2))} l S`);
  }

  /** Text with its baseline at y. */
  text(
    x: number,
    y: number,
    text: string,
    size: number,
    options: { bold?: boolean; align?: 'left' | 'center' | 'right'; fill?: Rgb } = {},
  ): void {
    const w = textWidth(text, size, options.bold);
    const left = options.align === 'center' ? x - w / 2 : options.align === 'right' ? x - w : x;
    this.ops.push(`${color(options.fill ?? [0, 0, 0])} rg BT /${options.bold ? 'F2' : 'F1'} ${n(size)} Tf ${n(left)} ${n(this.y(y))} Td ${literal(text)} Tj ET`);
  }

  /** Wraps text to a width; returns the y below the last line. */
  paragraph(x: number, y: number, text: string, size: number, width: number, lineHeight = size * 1.35): number {
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (line && textWidth(next, size) > width) {
          this.text(x, y, line, size);
          y += lineHeight;
          line = word;
        } else line = next;
      }
      if (line) {
        this.text(x, y, line, size);
        y += lineHeight;
      }
    }
    return y;
  }
}

export class PdfDocument {
  readonly pages: PdfPage[] = [];
  constructor(readonly title = 'Untitled') {}

  addPage(width: number, height: number): PdfPage {
    const page = new PdfPage(width, height);
    this.pages.push(page);
    return page;
  }

  /** The PDF file. All content is Latin-1, so one character is one byte. */
  bytes(): Uint8Array {
    const objects: string[] = [];
    const pageIds = this.pages.map((_, i) => 5 + i * 2);
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${this.pages.length} >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    this.pages.forEach((page, i) => {
      const id = pageIds[i];
      const content = page.ops.join('\n');
      objects[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(page.width)} ${n(page.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`;
      objects[id + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    });
    const infoId = objects.length;
    objects[infoId] = `<< /Title ${literal(this.title)} /Producer (Fair Isle Pattern Builder) >>`;

    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets: number[] = [];
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = out.length;
      out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
