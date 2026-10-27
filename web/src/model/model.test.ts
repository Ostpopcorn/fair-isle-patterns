import { beforeAll, describe, expect, it } from 'vitest';
import { compile, parse, validate } from '../core';
import type { LibraryDoc, Mapping, PatternDoc } from '../core/types';
import { fixtureText, loadCore } from '../core/testing';
import { builtinLibraries } from '../library';
import { grayForLightness, hslToRgb, lightness, parseHex, rgbToHsl, toHex, type RGB } from './color';
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
  const mapping: Mapping = { id: 'm', colors: ['a', 'b', 'c', 'd'], rows: ['01', '03', '031'] };

  it('reads colours by position', () => {
    expect(Map.digits('031')).toEqual([0, 3, 1]);
    expect(Map.digits('0')).toBeNull();
    expect(Map.digits('0a')).toBeNull();
    expect(Map.slotColor(mapping, 2, 1)).toBe('d');
    expect(Map.slotColor(mapping, 2, 2)).toBe('b');
    expect(Map.slotColor(mapping, 0, 2)).toBeNull();
  });

  it('reverse applied twice returns the original rows', () => {
    expect(Map.reverse(Map.reverse(mapping.rows))).toEqual(mapping.rows);
    expect(Map.reverse(mapping.rows)[0]).toBe('031');
  });

  it('shifts and rolls with wrap-around, like the motif', () => {
    expect(Map.shiftUp(mapping.rows)).toEqual(['031', '01', '03']);
    expect(Map.shiftDown(Map.shiftUp(mapping.rows))).toEqual(mapping.rows);
    const motif = ['100', '010', '001'];
    expect(Map.rollRows(mapping.rows, 1)).toEqual(Map.shiftUp(mapping.rows));
    // Rolling a motif and its mapping by the same amount keeps rows together.
    expect(M.roll(motif, 0, 2).map((r, i) => r + Map.rollRows(mapping.rows, 2)[i])).toEqual(
      Map.rollRows(motif.map((r, i) => r + mapping.rows[i]), 2),
    );
  });

  it('sets and removes slots', () => {
    expect(Map.setSlot(mapping, 2, 2, null).rows[2]).toBe('03');
    expect(Map.setSlot(mapping, 0, 2, 3).rows[0]).toBe('013');
    expect(Map.setSlot(mapping, 1, 0, 1).rows[1]).toBe('13');
    expect(Map.setSlot(mapping, 0, 2, null)).toBe(mapping);
  });

  it('edits the colour list; rows follow the positions', () => {
    expect(Map.replaceColor(mapping, 3, 'x').colors).toEqual(['a', 'b', 'c', 'x']);
    // A colour already in the list is not added twice.
    expect(Map.replaceColor(mapping, 3, 'a')).toBe(mapping);
    expect(Map.addColor(mapping, 'a')).toBe(mapping);
    expect(Map.addColor(mapping, 'e').colors).toHaveLength(5);
    const ten: Mapping = { ...mapping, colors: 'abcdefghij'.split('') };
    expect(Map.addColor(ten, 'k')).toBe(ten);
    // c (position 2) is unused; removing it moves d down to position 2.
    expect(Map.usesPosition(mapping, 2)).toBe(false);
    expect(Map.removeColor(mapping, 2)).toEqual({ ...mapping, colors: ['a', 'b', 'd'], rows: ['01', '02', '021'] });
    // A colour a row uses stays.
    expect(Map.removeColor(mapping, 1)).toBe(mapping);
  });

  it('fits rows to a new motif height at the top', () => {
    expect(Map.fitRows(mapping.rows, 5)).toEqual(['01', '03', '031', '031', '031']);
    expect(Map.fitRows(mapping.rows, 1)).toEqual(['01']);
  });

  it('the default mapping uses the first three palette colours', () => {
    const palette = hat().palette;
    expect(Map.defaultMapping('default', palette, 2)).toEqual({ id: 'default', name: 'Default', colors: ['cream', 'navy', 'rust'], rows: ['012', '012'] });
    expect(Map.defaultMapping('default', palette.slice(0, 2), 1).rows).toEqual(['01']);
  });

  it('removing an accent that the motif needs gives E007', () => {
    const doc = hat();
    const edited = D.updateMapping(doc, 'flower', 'flower-colors', (m) => Map.setSlot(m, 2, 2, null));
    expect(validate(edited).filter((i) => i.code === 'E007').map((i) => i.location)).toEqual([
      { motif: 'flower', mapping: 'flower-colors', motifRow: 3, mappingRow: 3 },
    ]);
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
    for (const m of doc.motifs) expect(m.mappings.map((p) => p.colors)).toEqual([['cream', 'navy', 'rust']]);
  });

  it('a new motif starts with the first three palette colours', () => {
    const doc = hat();
    const motif = D.blankMotif(doc, 'new', ['0000', '0000']);
    expect(motif.mappings).toEqual([{ id: 'default', name: 'Default', colors: ['cream', 'navy', 'rust'], rows: ['012', '012'] }]);
    const { doc: next, id } = D.addMapping(doc, 'peerie-x', 'Blue');
    expect(id).toBe('blue');
    expect(D.findMapping(D.findMotif(next, 'peerie-x'), 'blue')).toEqual({ id: 'blue', name: 'Blue', colors: ['cream', 'navy', 'rust'], rows: Array(5).fill('012') });
    expect(validate(next).some((i) => i.severity === 'error')).toBe(false);
  });

  it('renaming an id updates references', () => {
    const doc = hat();
    const m = D.renameMotif(doc, 'flower', 'bloom');
    expect('doc' in m && m.doc.bands.filter((b) => !D.isSpacer(b) && b.motif === 'bloom')).toHaveLength(1);
    const c = D.renameColor(doc, 'cream', 'ivory');
    expect('doc' in c && D.findMapping(D.findMotif(c.doc, 'flower'), 'flower-colors')!.colors).toEqual(['ivory', 'rust', 'gold']);
    // Spacers follow too.
    expect('doc' in c && c.doc.bands.filter(D.isSpacer).map((b) => b.color)).toEqual(['ivory', 'ivory']);
    const p = D.renameMapping(doc, 'peerie-x', 'sunset', 'calm');
    expect('doc' in p && p.doc.bands.map((b) => (D.isSpacer(b) ? b.color : b.mapping))).toEqual(['calm', 'cream', 'flower-colors', 'cream']);
    // Mapping ids are only unique within their motif.
    const twice = D.addMapping(doc, 'peerie-x', 'Other').doc;
    expect(D.renameMapping(twice, 'peerie-x', 'other', 'sunset')).toEqual({ error: 'The id “sunset” is already used by another mapping of “peerie-x”.' });
    expect('doc' in D.renameMapping(doc, 'peerie-x', 'sunset', 'flower-colors')).toBe(true);
    expect('error' in D.renameMapping(doc, 'peerie-x', 'sunset', 'Bad Id')).toBe(true);
    // The renamed documents stay valid.
    for (const r of [m, c, p]) if ('doc' in r) expect(validate(r.doc).some((i) => i.severity === 'error')).toBe(false);
  });

  it('deleting a motif used by a band is blocked, listing the bands', () => {
    const result = D.deleteMotif(hat(), 'peerie-x');
    expect('blocked' in result && result.blocked).toMatch(/is used by band 1 \(rows 1–5\)\./);
    const free = D.deleteMotif({ ...hat(), motifs: [...hat().motifs, D.blankMotif(hat(), 'unused', ['1'])] }, 'unused');
    expect('doc' in free).toBe(true);
  });

  it('deleting a mapping is blocked while bands use it, or when it is the last one', () => {
    const used = D.deleteMapping(hat(), 'peerie-x', 'sunset');
    expect('blocked' in used && used.blocked).toMatch(/band 1/);
    const { doc } = D.addMapping(hat(), 'peerie-x', 'Spare');
    const spare = D.deleteMapping(doc, 'peerie-x', 'spare');
    expect('doc' in spare && D.findMotif(spare.doc, 'peerie-x')!.mappings.map((m) => m.id)).toEqual(['sunset']);
    const lonely = { ...hat(), bands: [] };
    const last = D.deleteMapping(lonely, 'peerie-x', 'sunset');
    expect('blocked' in last && last.blocked).toMatch(/only mapping/);
  });

  it('deleting a colour used by mappings or spacers is blocked, listing them', () => {
    const navy = D.deleteColor(hat(), 'navy');
    expect('blocked' in navy && navy.blocked).toBe('Colour “navy” is used by mapping “peerie-x / sunset”. Remove it from it first.');
    const cream = D.deleteColor(hat(), 'cream');
    expect('blocked' in cream && cream.blocked).toBe(
      'Colour “cream” is used by mappings “peerie-x / sunset”, “flower / flower-colors” and the spacers band 2 (row 6), band 4 (rows 12–13). Remove it from the mappings and give the spacers another colour first.',
    );
    const doc = { ...hat(), palette: [...hat().palette, { id: 'moss', hex: '#6b7a3a' }], bands: [...hat().bands, D.newSpacer('moss')] };
    const moss = D.deleteColor(doc, 'moss');
    expect('blocked' in moss && moss.blocked).toBe('Colour “moss” is used by the spacer band 5 (row 14). Give the spacer another colour first.');
    expect('doc' in D.deleteColor({ ...doc, bands: hat().bands }, 'moss')).toBe(true);
  });

  it('duplicating a motif copies its mappings', () => {
    const { doc, id } = D.duplicateMotif(hat(), 'flower');
    const copy = D.findMotif(doc, id)!;
    expect(copy.mappings).toEqual(D.findMotif(hat(), 'flower')!.mappings);
    const { doc: two, id: mid } = D.duplicateMapping(hat(), 'peerie-x', 'sunset');
    expect(mid).toBe('sunset-copy');
    expect(D.findMotif(two, 'peerie-x')!.mappings.map((m) => m.id)).toEqual(['sunset', 'sunset-copy']);
  });

  it('spacers are bands of plain rows in one colour', () => {
    const doc = hat();
    expect(doc.bands.map(D.isSpacer)).toEqual([false, true, false, true]);
    expect(doc.bands[3]).toEqual({ color: 'cream', rows: 2 });
    expect(D.bandHeight(doc, doc.bands[3])).toBe(2);
    expect(D.bandHeight(doc, D.newSpacer('cream', 0))).toBe(0);
    // A spacer never counts as a user of a motif or mapping.
    expect(D.bandsUsingMotif(doc, 'peerie-x')).toEqual([0]);
    expect(D.spacersUsingColor(doc, 'cream')).toEqual([1, 3]);
    // Changing a spacer's colour and height recolours its chart rows.
    const next = D.updateBand(D.updateBand(doc, 1, { color: 'gold' }), 1, { rows: 3 });
    const chart = compile(next)!;
    expect(chart.height).toBe(15);
    for (const y of [5, 6, 7]) expect(chart.palette[chart.cells[y * chart.width]]).toBe('gold');
    expect(validate(next).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('band rows', () => {
    expect(D.bandStartRows(hat())).toEqual([1, 6, 7, 12]);
  });

  it('offset 7 on a 5-wide motif behaves exactly like offset 2', () => {
    const doc = D.newPattern();
    const five: PatternDoc = { ...doc, cast_on: 10, motifs: [...doc.motifs, D.blankMotif(doc, 'five', ['10010', '01100'])] };
    const at = (offset: number) => compile({ ...five, bands: [{ motif: 'five', mapping: 'default', offset, times: 1 }] })!.cells;
    expect(at(7)).toEqual(at(2));
    expect(at(-3)).toEqual(at(2));
  });
});

describe('library import', () => {
  const library = (): LibraryDoc => ({
    format: 'fairisle-library',
    version: 1,
    meta: { name: 'Test' },
    palette: [
      { id: 'cream', hex: '#efe6d2' },
      { id: 'navy', hex: '#000080' },
      { id: 'rust', hex: '#a4452c' },
      { id: 'gold', hex: '#d9a441' },
    ],
    motifs: [
      { id: 'peerie-x', rows: ['1'], mappings: [{ id: 'plain', colors: ['cream', 'navy'], rows: ['01'] }] },
      hat().motifs.find((m) => m.id === 'flower')!,
    ],
  });

  it('renames clashing items with a numeric suffix and updates references', () => {
    const result = importFromLibrary(hat(), library(), { motifs: ['peerie-x', 'flower'] });
    // flower (with its mapping) is identical, so it is reused; peerie-x differs.
    expect(result.added.motifs).toEqual(['peerie-x-2']);
    // navy differs in colour, so it is renamed and the mapping follows.
    expect(result.added.colors).toEqual(['navy-2']);
    expect(D.findMotif(result.doc, 'peerie-x-2')!.mappings).toEqual([{ id: 'plain', colors: ['cream', 'navy-2'], rows: ['01'] }]);
    expect(result.renamed).toEqual([
      { kind: 'colour', from: 'navy', to: 'navy-2' },
      { kind: 'motif', from: 'peerie-x', to: 'peerie-x-2' },
    ]);
    expect(validate(result.doc).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('copies picked colours on their own', () => {
    const result = importFromLibrary(hat(), library(), { colors: ['navy', 'gold'] });
    expect(result.added).toEqual({ colors: ['navy-2'], motifs: [] });
  });
});

describe('starter library', () => {
  const libs = () => builtinLibraries();

  it('has the promised content', () => {
    const motifs = libs().flatMap((l) => l.doc.motifs);
    const ids = motifs.map((m) => m.id);
    // Spacers are bands, not motifs.
    expect(ids).not.toContain('spacer');
    expect(motifs.every((m) => m.rows.some((r) => r.includes('1')))).toBe(true);
    expect(ids.filter((id) => id.startsWith('oxo'))).toHaveLength(5);
    expect(motifs.filter((m) => m.rows.length <= 7).length).toBeGreaterThanOrEqual(10);
    expect(libs().find((l) => l.doc.motifs.length === 0)!.doc.palette).toHaveLength(12);
    for (const m of motifs) {
      expect(m.mappings.length, m.id).toBeGreaterThan(0);
      expect(m.mappings.map((p) => p.id), m.id).toEqual(expect.arrayContaining(['two-colour', 'light-on-dark']));
    }
    for (const l of libs()) expect(l.doc.meta.license).toBe('CC0-1.0');
  });

  it('every file is valid and every motif knits without float warnings in each of its mappings', () => {
    for (const l of libs()) expect(validate(l.doc)).toEqual([]);
    for (const lib of libs()) {
      for (const motif of lib.doc.motifs) {
        const w = motif.rows[0].length;
        const doc: PatternDoc = {
          ...D.newPattern(),
          cast_on: w * Math.max(1, Math.ceil(60 / w)),
          palette: lib.doc.palette,
          motifs: [motif],
          bands: motif.mappings.map((p) => ({ motif: motif.id, mapping: p.id, offset: 0, times: 1 })),
        };
        const bad = validate(doc).filter((i) => i.severity !== 'notice');
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

  it('HSL', () => {
    const hsl = (hex: string) => rgbToHsl(parseHex(hex)!).map((v) => Math.round(v));
    expect(hsl('#ff0000')).toEqual([0, 100, 50]);
    expect(hsl('#00ff00')).toEqual([120, 100, 50]);
    expect(hsl('#0000ff')).toEqual([240, 100, 50]);
    expect(hsl('#ff00ff')).toEqual([300, 100, 50]);
    expect(hsl('#1f2a44')).toEqual([222, 37, 19]);
    expect(hsl('#808080')).toEqual([0, 0, 50]);
    expect(toHex(hslToRgb([120, 100, 25]))).toBe('#008000');
    expect(toHex(hslToRgb([-60, 100, 50]))).toBe('#ff00ff');
    expect(toHex(hslToRgb([0, 150, 120]))).toBe('#ffffff');
    // Every colour survives the trip through HSL.
    for (let r = 0; r < 256; r += 15)
      for (let g = 0; g < 256; g += 15)
        for (let b = 0; b < 256; b += 15) {
          const rgb: RGB = [r, g, b];
          expect(hslToRgb(rgbToHsl(rgb))).toEqual(rgb);
        }
  });
});
