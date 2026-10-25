import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parse, serialize, validate } from '../core';
import type { PatternDoc } from '../core/types';
import { fixtureText, loadCore } from '../core/testing';
import { findMapping, findMotif, updateBand, updateMapping } from '../model/doc';
import { Store } from './store';

beforeAll(loadCore);

const hat = () => parse(fixtureText('hat-basic')).doc as PatternDoc;

describe('store', () => {
  it('undo after any edit restores a document identical when serialized', () => {
    const store = new Store(hat());
    const edits: ((d: PatternDoc) => PatternDoc)[] = [
      (d) => updateBand(d, 2, { offset: 4 }),
      (d) => ({ ...d, cast_on: 96 }),
      (d) => updateMapping(d, 'peerie-x', 'sunset', (m) => ({ ...m, rows: m.rows.slice(1) })),
      (d) => ({ ...d, meta: { ...d.meta, name: 'Edited' } }),
      (d) => ({ ...d, bands: d.bands.slice(1) }),
    ];
    for (const edit of edits) {
      const before = serialize(store.get().doc);
      store.edit(edit);
      expect(serialize(store.get().doc)).not.toBe(before);
      store.undo();
      expect(serialize(store.get().doc)).toBe(before);
      store.redo();
    }
  });

  it('keeps at least 500 undo steps', () => {
    const store = new Store(hat());
    const original = serialize(store.get().doc);
    for (let i = 0; i < 600; i++) store.edit((d) => ({ ...d, cast_on: 120 + ((i % 2) + 1) * 24 }));
    expect(store.historySize).toBeGreaterThanOrEqual(500);
    for (let i = 0; i < 600; i++) store.undo();
    expect(serialize(store.get().doc)).toBe(original);
  });

  it('coalesces a stroke into one undo step', () => {
    const store = new Store(hat());
    for (let i = 1; i <= 5; i++) store.edit((d) => updateBand(d, 0, { offset: i }), { coalesce: 'stroke-1' });
    expect(store.historySize).toBe(1);
    store.edit((d) => updateBand(d, 0, { offset: 9 }), { coalesce: 'stroke-2' });
    expect(store.historySize).toBe(2);
    store.undo();
    store.undo();
    expect(store.get().doc.bands[0].offset).toBe(0);
  });

  it('ignores no-op edits and edits to read-only documents', () => {
    const store = new Store(hat());
    store.edit((d) => d);
    expect(store.canUndo).toBe(false);
    store.load(hat(), { readOnly: true });
    store.edit((d) => ({ ...d, cast_on: 1 }));
    expect(store.get().doc.cast_on).toBe(120);
  });

  it('shows the last valid chart while the document has errors', () => {
    const store = new Store(hat());
    expect(store.displayed()?.stale).toBe(false);
    store.edit((d) => updateBand(d, 0, { motif: 'missing' }));
    expect(store.analysis().chart).toBeNull();
    const shown = store.displayed()!;
    expect(shown.stale).toBe(true);
    expect(shown.chart.height).toBe(13);
  });

  it('a colour change reaches the chart quickly', () => {
    const store = new Store(hat());
    store.analysis();
    const start = performance.now();
    store.edit((d) => updateMapping(d, 'flower', 'flower-colors', (m) => ({ ...m, colors: ['navy', 'rust', 'gold'] })));
    store.edit((d) => updateBand(d, 1, { color: 'gold' }));
    const chart = store.analysis().chart!;
    expect(performance.now() - start).toBeLessThan(100);
    expect(chart.palette[chart.cells[5 * chart.width]]).toBe('gold'); // row 6 is a spacer
    expect(chart.palette[chart.cells[6 * chart.width + 1]]).toBe('navy'); // the flower's background in row 7
  });

  it('tracks unsaved changes against the saved text', () => {
    const store = new Store(hat());
    store.load(hat(), { savedText: serialize(hat()) });
    expect(store.isDirty()).toBe(false);
    store.edit((d) => ({ ...d, cast_on: 96 }));
    expect(store.isDirty()).toBe(true);
    store.undo();
    expect(store.isDirty()).toBe(false);
  });
});

describe('motif commands', () => {
  it('flipping, rolling and resizing a motif carry its mappings along', async () => {
    const { store } = await import('./store');
    const { motifCommands } = await import('../ui/views/motifCommands');
    const rowsOf = () => findMapping(findMotif(store.get().doc, 'peerie-x'), 'sunset')!.rows;
    store.load(updateMapping(hat(), 'peerie-x', 'sunset', (m) => ({ ...m, rows: ['01', '02', '03', '01', '01'] })));
    store.ui({ motifId: 'peerie-x' });

    // peerie-x is symmetric, so only the colours show the flip.
    motifCommands.transform('flipV');
    expect(rowsOf()).toEqual(['01', '01', '03', '02', '01']);
    motifCommands.transform('flipH');
    expect(rowsOf()).toEqual(['01', '01', '03', '02', '01']);
    motifCommands.roll(0, 1);
    expect(rowsOf()).toEqual(['01', '01', '01', '03', '02']);
    motifCommands.roll(1, 0);
    expect(rowsOf()).toEqual(['01', '01', '01', '03', '02']);
    motifCommands.resize(6, 7);
    expect(rowsOf()).toEqual(['01', '01', '01', '03', '02', '02', '02']);
    motifCommands.resize(6, 4);
    expect(rowsOf()).toEqual(['01', '01', '01', '03']);
    expect(validate(store.get().doc).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('old files', () => {
  it('recognises patterns saved before mappings moved into motifs', async () => {
    const { isOldFormat } = await import('./actions');
    expect(isOldFormat(fixtureText('e001-old-format'))).toBe(true);
    expect(isOldFormat(fixtureText('hat-basic'))).toBe(false);
    expect(isOldFormat('not json')).toBe(false);
  });
});

describe('autosave', () => {
  const memory = new Map<string, string>();
  beforeAll(() => {
    const target = new EventTarget();
    Object.assign(globalThis, {
      window: target,
      document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
      localStorage: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => void memory.set(k, v),
        removeItem: (k: string) => void memory.delete(k),
      },
    });
  });
  afterEach(() => vi.useRealTimers());

  it('saves one second after the last change, and at once when the tab closes', async () => {
    const { startAutosave, listSessions, readBackup, recentSessions } = await import('./persistence');
    vi.useFakeTimers();
    const store = new Store(hat());
    const stop = startAutosave(store);
    store.edit((d) => ({ ...d, meta: { ...d.meta, name: 'First' } }));
    vi.advanceTimersByTime(900);
    expect(readBackup()).toBeNull();
    vi.advanceTimersByTime(200);
    expect(readBackup()?.name).toBe('First');

    // Closing the tab mid-edit (before the debounce) still keeps the change.
    store.edit((d) => ({ ...d, meta: { ...d.meta, name: 'Second' } }));
    (window as unknown as EventTarget).dispatchEvent(new Event('pagehide'));
    expect(readBackup()?.name).toBe('Second');
    expect(parse(readBackup()!.text).doc?.meta.name).toBe('Second');
    stop();
    vi.useRealTimers();

    await new Promise((r) => setTimeout(r, 20));
    const sessions = await listSessions();
    expect(sessions.map((s) => s.name)).toContain('Second');
    expect((await recentSessions())[0].name).toBe('Second');
  });
});
