// Runs the shared fixtures through the WASM build (the Rust tests run the
// same files natively) and checks that types.ts matches what the core
// actually returns.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BAND_KEYS,
  CHART_KEYS,
  ISSUE_KEYS,
  LAYOUT_KEYS,
  LOCATION_KEYS,
  PARSE_KEYS,
  PATTERN_KEYS,
  compile,
  layout,
  parse,
  serialize,
  suggestCastOn,
  validate,
  type Issue,
  type PatternDoc,
} from './index';
import { fixtureText, fixtures, loadCore } from './testing';

beforeAll(loadCore);

interface ExpectedIssue {
  code: string;
  severity: string;
  location?: Record<string, unknown>;
  detail?: string;
}

function matchIssues(expected: ExpectedIssue[], actual: Issue[]): string | null {
  const remaining = [...actual];
  for (const exp of expected) {
    const i = remaining.findIndex(
      (act) =>
        act.code === exp.code &&
        act.severity === exp.severity &&
        Object.entries(exp.location ?? {}).every(
          ([k, v]) => JSON.stringify((act.location as Record<string, unknown>)[k]) === JSON.stringify(v),
        ) &&
        (exp.detail === undefined || act.message.includes(exp.detail)),
    );
    if (i < 0) return `expected issue not found: ${JSON.stringify(exp)}\nactual: ${JSON.stringify(actual, null, 1)}`;
    remaining.splice(i, 1);
  }
  return remaining.length ? `unexpected issues: ${JSON.stringify(remaining, null, 1)}` : null;
}

describe('shared fixtures', () => {
  for (const f of fixtures()) {
    it(f.name, () => {
      const exp = f.expected as {
        parse_ok?: boolean;
        read_only?: boolean;
        roundtrip?: boolean;
        canonical?: string;
        issues: ExpectedIssue[];
        chart?: { letters: Record<string, string>; rows: string[] };
        suggest_cast_on?: number[];
      };
      const parsed = parse(f.input);
      expect(parsed.doc !== null).toBe(exp.parse_ok ?? true);
      expect(parsed.readOnly).toBe(exp.read_only ?? false);

      const issues = parsed.doc ? validate(parsed.doc) : parsed.issues;
      expect(matchIssues(exp.issues, issues)).toBeNull();
      if (!parsed.doc) return;

      const written = serialize(parsed.doc);
      if (exp.roundtrip) expect(written).toBe(f.input);
      if (exp.canonical) expect(written).toBe(readFileSync(join(f.dir, exp.canonical), 'utf8'));

      if (exp.chart) {
        const chart = compile(parsed.doc as PatternDoc);
        expect(chart).not.toBeNull();
        const letterOf = Object.fromEntries(Object.entries(exp.chart.letters).map(([k, v]) => [v, k]));
        const rows: string[] = [];
        for (let y = chart!.height - 1; y >= 0; y--) {
          let row = '';
          for (let x = 0; x < chart!.width; x++) row += letterOf[chart!.palette[chart!.cells[y * chart!.width + x]]];
          rows.push(row);
        }
        expect(rows).toEqual(exp.chart.rows);
      }
      if (exp.suggest_cast_on) expect(suggestCastOn(parsed.doc as PatternDoc)).toEqual(exp.suggest_cast_on);
    });
  }
});

describe('types.ts stays in sync with the core', () => {
  const hat = () => parse(fixtureText('hat-basic')).doc as PatternDoc;

  it('parse result and normalized document', () => {
    const parsed = parse(fixtureText('hat-basic'));
    expect(Object.keys(parsed).sort()).toEqual([...PARSE_KEYS].sort());
    expect(Object.keys(parsed.doc!).sort()).toEqual([...PATTERN_KEYS].sort());
    for (const band of (parsed.doc as PatternDoc).bands) {
      for (const key of Object.keys(band)) expect(BAND_KEYS).toContain(key);
      expect(typeof band.offset).toBe('number');
      expect(typeof band.times).toBe('number');
    }
  });

  it('issues and locations', () => {
    const all: Issue[] = [];
    for (const f of fixtures()) {
      const parsed = parse(f.input);
      all.push(...(parsed.doc ? validate(parsed.doc) : parsed.issues));
    }
    const seenLocationKeys = new Set<string>();
    for (const issue of all) {
      expect(Object.keys(issue).sort()).toEqual([...ISSUE_KEYS].sort());
      expect(['error', 'warning', 'notice']).toContain(issue.severity);
      for (const key of Object.keys(issue.location)) {
        expect(LOCATION_KEYS).toContain(key);
        seenLocationKeys.add(key);
      }
    }
    // Every declared key except stitch (unused in version 1) occurs.
    expect([...seenLocationKeys].sort()).toEqual(LOCATION_KEYS.filter((k) => k !== 'stitch').sort());
  });

  it('compiled chart', () => {
    const chart = compile(hat())!;
    expect(Object.keys(chart).sort()).toEqual([...CHART_KEYS].sort());
    expect(chart.cells).toBeInstanceOf(Uint16Array);
    expect(chart.symbols).toBeInstanceOf(Uint8Array);
    expect(chart.rowBand).toBeInstanceOf(Uint16Array);
    expect(chart.cells.length).toBe(chart.width * chart.height);
    expect([chart.width, chart.height]).toEqual([120, 13]);
  });

  it('stitch layout', () => {
    const l = layout(hat())!;
    expect(Object.keys(l).sort()).toEqual([...LAYOUT_KEYS].sort());
    expect(l.stitchWidth).toBeCloseTo(10 / 28);
    expect(l.rowHeight).toBeCloseTo(10 / 32);
    expect(l.rowStart.length).toBe(14);
    expect(l.x.length).toBe(120 * 13);
    // Each row is centred on 0.
    expect(l.x[0] + l.x[119]).toBeCloseTo(0);
  });

  it('documents edited in JavaScript validate like parsed ones', () => {
    const doc = hat();
    const edited: PatternDoc = { ...doc, cast_on: 124 };
    const codes = validate(edited).map((i) => i.code);
    expect(codes).toContain('W103');
    expect(compile({ ...doc, bands: [{ ...doc.bands[0], motif: 'nope' }] })).toBeNull();
    expect(() => serialize({ ...doc, meta: 5 } as unknown as PatternDoc)).toThrow();
  });
});
