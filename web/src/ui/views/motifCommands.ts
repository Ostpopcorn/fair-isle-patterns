// Commands on the motif being edited, shared by the toolbar and shortcuts.

import { findMotif, updateMotif } from '../../model/doc';
import * as M from '../../model/motif';
import { store } from '../../state/store';
import { toast } from '../../state/actions';

export type Transform = 'flipH' | 'flipV' | 'rot180' | 'rot90cw' | 'rot90ccw';

function current() {
  const s = store.get();
  const motif = findMotif(s.doc, s.ui.motifId);
  return motif ? { s, motif } : null;
}

function setRows(rows: string[], coalesce?: string): void {
  const s = store.get();
  const id = s.ui.motifId;
  if (!id) return;
  store.edit((doc) => updateMotif(doc, id, (m) => (M.width(m.rows) === M.width(rows) && m.rows.join() === rows.join() ? m : { ...m, rows })), {
    coalesce,
  });
}

export const motifCommands = {
  setRows,

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
    setRows(next);
  },

  roll(dx: number, dy: number): void {
    const c = current();
    if (c) setRows(M.roll(c.motif.rows, dx, dy));
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
