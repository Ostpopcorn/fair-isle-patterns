import { beforeAll, describe, expect, it } from 'vitest';
import { compile, parse, validate } from '../core';
import type { LibraryDoc, PatternDoc } from '../core/types';
import { fixtureText, loadCore } from '../core/testing';
import { builtinLibraries } from '../library';
import { grayForLightness, lightness, parseHex } from './color';
import * as D from './doc';
import { importFromLibrary } from './library';
import * as Map from './mapping';
import * as M from './motif';

beforeAll(loadCore);

const hat = () => parse(fixtureText('hat-basic')).doc as PatternDoc;

describe('motif operations', () => {
  const rows = ['1000', '0100', '0010']; // bottom row first

  it('flips and rotates', () => {
    expect(M.flipHorizontal(rows)).toEqual(['0001', '0010', '0100']);
    expect(M.flipVertical(rows)).toEqual(['0010', '0100', '1000']);
    expect(M.rotate180(rows)).toEqual(M.flipVertical(M.flipHorizontal(rows)));
    const square = ['1100', '0100', '0000', '0012'];
    let r = square;
    for (let i = 0; i < 4; i++) r = M.rotate90(r);
    expect(r).toEqual(square);
    expect(M.rotate90(M.rotate90(square, true), false)).toEqual(square);
    // Rows are bottom first: the top-left cell moves to the top-right.
    expect(M.rotate90(['00', '10'], true)).toEqual(['00', '01']);
    // Non-square motifs are left alone.
    expect(M.rotate90(rows)).toEqual(rows);
  });

  it('rolls with wrap-around', () => {
    expect(M.roll(['1000'], 1, 0)).toEqual(['0100']);
    expect(M.roll(['1000'], -1, 0)).toEqual(['0001']);
    expect(M.roll(rows, 0, 1)).toEqual(['0010', '1000', '0100']);
    expect(M.roll(rows, 4, 3)).toEqual(rows);
  });

  it('resizes at the top and right edges', () => {
    expect(M.resize(rows, 5, 4)).toEqual(['10000', '01000', '00100', '00000']);
    expect(M.resize(rows, 2, 2)).toEqual(['10', '01']);
  });

  it('pasting beyond the motif edge clips without error', () => {
    const clip = ['22', '22'];
    expect(M.paste(rows, clip, { x: 3, y: 2 })).toEqual(['1000', '0100', '0012']);
    expect(M.paste(rows, clip, { x: -1, y: -1 })).toEqual(['2000', '0100', '0010']);
    expect(M.paste(rows, clip, { x: 10, y: 10 })).toEqual(rows);
  });

  it('copies a selection and fills regions', () => {
    expect(M.copyRect(rows, { x0: 1, y0: 0, x1: 2, y1: 1 })).toEqual(['00', '10']);
    expect(M.floodRegion(['000', '010', '000'], { x: 0, y: 0 })).toHaveLength(8);
    expect(M.setCells(['000'], M.floodRegion(['000'], { x: 1, y: 0 }), '1')).toEqual(['111']);
  });

  it('draws lines, rectangles and mirrored cells', () => {
    expect(M.lineCells({ x: 0, y: 0 }, { x: 3, y: 3 })).toHaveLength(4);
    expect(M.rectCells({ x: 0, y: 0 }, { x: 2, y: 2 }, false)).toHaveLength(8);
    expect(M.rectCells({ x: 0, y: 0 }, { x: 2, y: 2 }, true)).toHaveLength(9);
    expect(M.mirrored({ x: 0, y: 0 }, 5, 3, true, true)).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 2 },
      { x: 4, y: 2 },
    ]);
  });

  it('drawing on a 64×64 motif is fast', () => {
    const big = M.blank(64, 64);
    const start = performance.now();
    let r: string[] = big;
    for (let i = 0; i < 64; i++) r = M.setCells(r, M.mirrored({ x: i, y: i }, 64, 64, true, true), '1');
    expect((performance.now() - start) / 64).toBeLessThan(5);
  });
});

describe('mapping helpers', () => {
  const rows = [['a', 'b'], ['a', 'c'], ['a', 'd', 'e']];

  it('reverse applied twice returns the original mapping', () => {
    expect(Map.reverse(Map.reverse(rows))).toEqual(rows);
    expect(Map.reverse(rows)[0]).toEqual(['a', 'd', 'e']);
  });

  it('shifts up and down with wrap-around', () => {
    expect(Map.shiftUp(rows)).toEqual([['a', 'd', 'e'], ['a', 'b'], ['a', 'c']]);
    expect(Map.shiftDown(Map.shiftUp(rows))).toEqual(rows);
  });

  it('removing the accent drops the third entry', () => {
    expect(Map.setEntry(rows, 2, 2, null)[2]).toEqual(['a', 'd']);
    expect(Map.setEntry(rows, 0, 2, 'z')[0]).toEqual(['a', 'b', 'z']);
  });

  it('removing the accent from a row shows E007 for bands that need it', () => {
    const doc = hat();
    const edited = D.updateMapping(doc, 'flower-colors', (m) => ({ ...m, rows: Map.setEntry(m.rows, 0, 2, null) }));
    expect(validate(edited).filter((i) => i.code === 'E007').length).toBeGreaterThan(0);
  });
});

describe('document helpers', () => {
  it('makes ids', () => {
    expect(D.slugify('Peerie X!')).toBe('peerie-x');
    expect(D.slugify('Fair Isle — Café 1')).toBe('fair-isle-cafe-1');
    expect(D.slugify('***')).toBe('item');
    expect(D.uniqueId('peerie-x', ['peerie-x'])).toBe('peerie-x-2');
    expect(D.uniqueId('peerie-x', ['peerie-x', 'peerie-x-2'])).toBe('peerie-x-3');
    expect(D.uniqueId('a', [])).toBe('a');
  });

  it('a new pattern is valid and free of issues', () => {
    const doc = D.newPattern();
    expect(validate(doc)).toEqual([]);
    expect(compile(doc)?.height).toBe(9);
  });

  it('renaming an id updates references', () => {
    const doc = hat();
    const m = D.renameMotif(doc, 'solid', 'plain-row');
    expect('doc' in m && m.doc.bands.filter((b) => b.motif === 'plain-row')).toHaveLength(2);
    const c = D.renameColor(doc, 'navy', 'midnight');
    expect('doc' in c && c.doc.mappings.find((x) => x.id === 'plain')!.rows[0]).toEqual(['cream', 'midnight']);
    expect(D.renameMapping(doc, 'plain', 'sunset')).toEqual({ error: 'The id “sunset” is already used.' });
    expect('error' in D.renameMapping(doc, 'plain', 'Bad Id')).toBe(true);
    // The renamed documents stay valid.
    if ('doc' in m) expect(validate(m.doc).some((i) => i.severity === 'error')).toBe(false);
  });

  it('deleting a motif used by a band is blocked, listing the bands', () => {
    const result = D.deleteMotif(hat(), 'solid');
    expect('blocked' in result && result.blocked).toMatch(/band 2 \(rows 6–6\), band 4 \(rows 12–13\)/);
    const free = D.deleteMotif({ ...hat(), motifs: [...hat().motifs, { id: 'unused', rows: ['1'] }] }, 'unused');
    expect('doc' in free).toBe(true);
  });

  it('deleting a colour used by a mapping is blocked, listing the mappings', () => {
    const result = D.deleteColor(hat(), 'navy');
    expect('blocked' in result && result.blocked).toMatch(/“sunset”, “plain”/);
  });

  it('quick-add spacer reuses or creates an all-background motif', () => {
    expect(D.ensureSpacer(hat()).id).toBe('solid');
    const doc = { ...hat(), motifs: hat().motifs.filter((m) => m.id !== 'solid') };
    const { doc: next, id } = D.ensureSpacer(doc);
    expect(id).toBe('spacer');
    expect(next.motifs.at(-1)).toEqual({ id: 'spacer', name: 'Spacer', rows: ['0'] });
  });

  it('band rows', () => {
    expect(D.bandStartRows(hat())).toEqual([1, 6, 7, 12]);
  });

  it('offset 7 on a 5-wide motif behaves exactly like offset 2', () => {
    const doc = D.newPattern();
    const five: PatternDoc = { ...doc, cast_on: 10, motifs: [...doc.motifs, { id: 'five', rows: ['10010', '01100'] }] };
    const at = (offset: number) => compile({ ...five, bands: [{ motif: 'five', mapping: 'two-colour', offset, times: 1 }] })!.cells;
    expect(at(7)).toEqual(at(2));
    expect(at(-3)).toEqual(at(2));
  });
});

describe('library import', () => {
  const library: LibraryDoc = {
    format: 'fairisle-library',
    version: 1,
    meta: { name: 'Test' },
    palette: [
      { id: 'cream', hex: '#efe6d2' },
      { id: 'navy', hex: '#000080' },
    ],
    motifs: [
      { id: 'peerie-x', rows: ['1'] },
      { id: 'flower', rows: ['00010000', '00111000', '01121100', '00111000', '00010000'] },
    ],
    mappings: [{ id: 'plain', rows: [['cream', 'navy']] }],
  };

  it('renames clashing items with a numeric suffix and updates references', () => {
    const result = importFromLibrary(hat(), library, { motifs: ['peerie-x', 'flower'], mappings: ['plain'] });
    // flower is identical, so it is reused; peerie-x differs.
    expect(result.added.motifs).toEqual(['peerie-x-2']);
    // navy differs in colour, so it is renamed and the mapping follows.
    expect(result.added.colors).toEqual(['navy-2']);
    expect(result.added.mappings).toEqual(['plain-2']);
    expect(result.doc.mappings.find((m) => m.id === 'plain-2')!.rows).toEqual([['cream', 'navy-2']]);
    expect(result.renamed).toEqual([
      { kind: 'colour', from: 'navy', to: 'navy-2' },
      { kind: 'motif', from: 'peerie-x', to: 'peerie-x-2' },
      { kind: 'mapping', from: 'plain', to: 'plain-2' },
    ]);
    expect(validate(result.doc).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('starter library', () => {
  const libs = () => builtinLibraries();

  it('has the promised content', () => {
    const motifs = libs().flatMap((l) => l.doc.motifs);
    const ids = motifs.map((m) => m.id);
    expect(ids).toContain('spacer');
    expect(ids.filter((id) => id.startsWith('oxo'))).toHaveLength(5);
    expect(motifs.filter((m) => m.rows.length <= 7 && m.id !== 'spacer').length).toBeGreaterThanOrEqual(10);
    expect(libs().flatMap((l) => l.doc.palette)).toHaveLength(12);
    expect(libs().flatMap((l) => l.doc.mappings).map((m) => m.id)).toEqual(
      expect.arrayContaining(['two-colour', 'gradient-3', 'gradient-5-symmetric']),
    );
    for (const l of libs()) expect(l.doc.meta.license).toBe('CC0-1.0');
  });

  it('every file is valid and every motif knits without float warnings', () => {
    for (const l of libs()) expect(validate(l.doc)).toEqual([]);
    const neutral = libs().find((l) => l.doc.palette.length)!.doc;
    for (const lib of libs()) {
      for (const motif of lib.doc.motifs) {
        const w = motif.rows[0].length;
        const doc: PatternDoc = {
          ...D.newPattern(),
          cast_on: w * Math.max(1, Math.ceil(60 / w)),
          palette: neutral.palette,
          motifs: [motif],
          mappings: [{ id: 'm', rows: [['natural', 'black', 'madder']] }],
          bands: [{ motif: motif.id, mapping: 'm', offset: 0, times: 1 }],
        };
        const bad = validate(doc).filter((i) => i.severity !== 'notice' && i.code !== 'W102');
        expect(bad, motif.id).toEqual([]);
      }
    }
  });
});

describe('colour', () => {
  it('lightness and grayscale', () => {
    expect(lightness(parseHex('#ffffff')!)).toBeCloseTo(100, 2);
    expect(lightness(parseHex('#efe6d2')!)).toBeCloseTo(91.5, 0);
    for (const l of [0, 10, 50, 91.5, 100]) expect(lightness(grayForLightness(l))).toBeCloseTo(l, 0);
    expect(parseHex('#12345')).toBeNull();
  });
});
