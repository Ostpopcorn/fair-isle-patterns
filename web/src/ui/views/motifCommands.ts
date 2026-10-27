// Commands on the motif being edited, shared by the toolbar and shortcuts.

import type { Motif } from '../../core/types';
import { findMotif, updateMotif, withMappingRows } from '../../model/doc';
import * as MapOps from '../../model/mapping';
import * as M from '../../model/motif';
import { store } from '../../state/store';
import { toast } from '../../state/actions';

export type Transform = 'flipH' | 'flipV' | 'rot180' | 'rot90cw' | 'rot90ccw';

function current() {
  const s = store.get();
  const motif = findMotif(s.doc, s.ui.motifId);
  return motif ? { s, motif } : null;
}

/** Replaces the motif's rows. `follow` moves the rows of its mappings the
 * same way, for edits that move rows (a vertical flip or roll), so each row
 * keeps its colours. */
function setRows(rows: string[], coalesce?: string, follow?: (rows: string[]) => string[]): void {
  const s = store.get();
  const id = s.ui.motifId;
  if (!id) return;
  store.edit(
    (doc) =>
      updateMotif(doc, id, (m) => {
        // A symmetric motif can look the same after a flip while its
        // colours still turn over, so compare the mappings too.
        const next = follow ? withMappingRows({ ...m, rows }, follow) : { ...m, rows };
        const same = M.width(m.rows) === M.width(rows) && m.rows.join() === rows.join() && m.mappings.every((p, i) => p.rows.join() === next.mappings[i].rows.join());
        return same ? m : next;
      }),
    { coalesce },
  );
}

/** The motif as it was before a run of resizes, and the motif the last of
 * them made. Each resize in a run starts from `from`, so typing 12 → 1 → 14
 * in a size field gives the 12-wide motif two more columns instead of
 * keeping only its first. Any other change to the motif, or endResize,
 * starts a new run. */
let resizeRun: { from: Motif; last: Motif } | null = null;

/** Resizes the motif. Rows are added or removed at the top, and every
 * mapping gains or loses the same rows (new rows copy its top row). */
function resize(w: number, h: number, coalesce?: string): void {
  const s = store.get();
  const motif = findMotif(s.doc, s.ui.motifId);
  if (!motif) return;
  const run = resizeRun?.last === motif ? resizeRun : { from: motif, last: motif };
  const from = run.from;
  store.edit((doc) => updateMotif(doc, motif.id, () => withMappingRows({ ...from, rows: M.resize(from.rows, w, h) }, (rows) => MapOps.fitRows(rows, h))), {
    coalesce,
  });
  run.last = findMotif(store.get().doc, motif.id) ?? motif;
  resizeRun = run;
}

/** Ends the run of resizes, so the next one starts from the motif as it is,
 * in a new undo step. */
function endResize(): void {
  resizeRun = null;
  store.breakCoalescing();
}

export const motifCommands = {
  setRows,
  resize,
  endResize,

  transform(kind: Transform): void {
    const c = current();
    if (!c) return;
    const rows = c.motif.rows;
    if ((kind === 'rot90cw' || kind === 'rot90ccw') && M.width(rows) !== M.height(rows)) {
      toast('Rotating by 90° needs a square motif.');
      return;
    }
    const next = {
      flipH: M.flipHorizontal,
      flipV: M.flipVertical,
      rot180: M.rotate180,
      rot90cw: (r: M.Rows) => M.rotate90(r, true),
      rot90ccw: (r: M.Rows) => M.rotate90(r, false),
    }[kind](rows);
    // Turning the motif upside down turns its colours with it.
    setRows(next, undefined, kind === 'flipV' || kind === 'rot180' ? MapOps.reverse : undefined);
  },

  roll(dx: number, dy: number): void {
    const c = current();
    if (c) setRows(M.roll(c.motif.rows, dx, dy), undefined, dy ? (rows) => MapOps.rollRows(rows, dy) : undefined);
  },

  selectAll(): void {
    const c = current();
    if (!c) return;
    store.ui({ tool: 'select', selection: { x0: 0, y0: 0, x1: M.width(c.motif.rows) - 1, y1: M.height(c.motif.rows) - 1 } });
  },

  copy(): void {
    const c = current();
    if (!c) return;
    const sel = c.s.ui.selection ?? { x0: 0, y0: 0, x1: M.width(c.motif.rows) - 1, y1: M.height(c.motif.rows) - 1 };
    const clip = M.copyRect(c.motif.rows, sel);
    store.patch({ clipboard: clip });
    toast(`Copied ${M.width(clip)} × ${clip.length} cells`);
  },

  cut(): void {
    const c = current();
    if (!c || !c.s.ui.selection) {
      toast('Select an area to cut first.');
      return;
    }
    store.patch({ clipboard: M.copyRect(c.motif.rows, c.s.ui.selection) });
    setRows(M.fillRect(c.motif.rows, c.s.ui.selection, '0'));
  },

  paste(): void {
    const c = current();
    const clip = store.get().clipboard;
    if (!c || !clip) {
      toast('Nothing to paste yet.');
      return;
    }
    const sel = c.s.ui.selection;
    const at = sel ? { x: sel.x0, y: sel.y0 } : { x: 0, y: 0 };
    setRows(M.paste(c.motif.rows, clip, at));
    // Select what was pasted (clipped to the motif).
    const w = M.width(c.motif.rows);
    const h = M.height(c.motif.rows);
    store.ui({
      tool: 'select',
      selection: {
        x0: at.x,
        y0: at.y,
        x1: Math.min(w - 1, at.x + M.width(clip) - 1),
        y1: Math.min(h - 1, at.y + clip.length - 1),
      },
    });
  },

  clear(): void {
    const c = current();
    if (!c || !c.s.ui.selection) return;
    setRows(M.fillRect(c.motif.rows, c.s.ui.selection, '0'));
  },
};
