// Keyboard shortcuts. Every shortcut is listed here, and the help panel
// renders this table, so the two cannot disagree.

import { importLibraryFile, newPatternAction, openFileAction, save, saveAs } from '../state/actions';
import { store, type Tool, type View } from '../state/store';
import { motifCommands } from './views/motifCommands';

export interface Shortcut {
  keys: string;
  description: string;
  group: string;
  /** Only in the motif editor. */
  motif?: boolean;
  match: (e: KeyboardEvent) => boolean;
  run: () => void;
}

const mod = (e: KeyboardEvent) => e.ctrlKey || e.metaKey;
const plain = (e: KeyboardEvent, key: string) => !mod(e) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === key;

const tool = (t: Tool) => () => store.ui({ tool: t, selection: t === 'select' ? store.get().ui.selection : null });
const view = (v: View) => () => store.ui({ view: v });

export const SHORTCUTS: Shortcut[] = [
  { group: 'File', keys: 'Ctrl+S', description: 'Save', match: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === 's', run: () => void save() },
  { group: 'File', keys: 'Ctrl+Shift+S', description: 'Save as…', match: (e) => mod(e) && e.shiftKey && e.key.toLowerCase() === 's', run: () => void saveAs() },
  { group: 'File', keys: 'Ctrl+O', description: 'Open…', match: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === 'o', run: () => void openFileAction() },
  { group: 'File', keys: 'Ctrl+Shift+O', description: 'Import a library file…', match: (e) => mod(e) && e.shiftKey && e.key.toLowerCase() === 'o', run: () => void importLibraryFile() },
  { group: 'File', keys: 'Alt+N', description: 'New pattern', match: (e) => e.altKey && !mod(e) && e.code === 'KeyN', run: newPatternAction },
  { group: 'File', keys: 'Ctrl+E', description: 'Export…', match: (e) => mod(e) && e.key.toLowerCase() === 'e', run: () => store.ui({ dialog: { kind: 'export' } }) },
  { group: 'Edit', keys: 'Ctrl+Z', description: 'Undo', match: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === 'z', run: () => store.undo() },
  {
    group: 'Edit',
    keys: 'Ctrl+Shift+Z or Ctrl+Y',
    description: 'Redo',
    match: (e) => mod(e) && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y'),
    run: () => store.redo(),
  },
  { group: 'Edit', keys: 'Ctrl+C', description: 'Copy the selection (or the whole motif)', motif: true, match: (e) => mod(e) && e.key.toLowerCase() === 'c', run: () => motifCommands.copy() },
  { group: 'Edit', keys: 'Ctrl+X', description: 'Cut the selection', motif: true, match: (e) => mod(e) && e.key.toLowerCase() === 'x', run: () => motifCommands.cut() },
  { group: 'Edit', keys: 'Ctrl+V', description: 'Paste (at the selection or the bottom-left corner)', motif: true, match: (e) => mod(e) && e.key.toLowerCase() === 'v', run: () => motifCommands.paste() },
  { group: 'Edit', keys: 'Ctrl+A', description: 'Select the whole motif', motif: true, match: (e) => mod(e) && e.key.toLowerCase() === 'a', run: () => motifCommands.selectAll() },
  { group: 'Edit', keys: 'Delete', description: 'Clear the selection to background', motif: true, match: (e) => !mod(e) && (e.key === 'Delete' || e.key === 'Backspace'), run: () => motifCommands.clear() },
  { group: 'Edit', keys: 'Escape', description: 'Clear the selection or close a dialog', match: (e) => e.key === 'Escape', run: () => store.ui({ selection: null, issue: null }) },
  { group: 'Motif tools', keys: 'P', description: 'Pencil', motif: true, match: (e) => plain(e, 'p'), run: tool('pencil') },
  { group: 'Motif tools', keys: 'F', description: 'Fill', motif: true, match: (e) => plain(e, 'f'), run: tool('fill') },
  { group: 'Motif tools', keys: 'L', description: 'Line', motif: true, match: (e) => plain(e, 'l'), run: tool('line') },
  { group: 'Motif tools', keys: 'R', description: 'Rectangle (Shift+R toggles filled)', motif: true, match: (e) => plain(e, 'r'), run: tool('rect') },
  { group: 'Motif tools', keys: 'Shift+R', description: 'Toggle filled rectangles', motif: true, match: (e) => e.shiftKey && !mod(e) && e.key.toLowerCase() === 'r', run: () => store.ui((u) => ({ filledRect: !u.filledRect })) },
  { group: 'Motif tools', keys: 'S', description: 'Select', motif: true, match: (e) => plain(e, 's'), run: tool('select') },
  { group: 'Motif tools', keys: '0 / 1 / 2', description: 'Background / foreground / accent', motif: true, match: (e) => !mod(e) && !e.altKey && ['0', '1', '2'].includes(e.key), run: () => undefined },
  { group: 'Motif tools', keys: 'X', description: 'Swap foreground and background', motif: true, match: (e) => plain(e, 'x'), run: () => store.ui((u) => ({ symbol: u.symbol === '0' ? '1' : '0' })) },
  { group: 'Motif tools', keys: 'M', description: 'Mirror across the vertical centre line', motif: true, match: (e) => plain(e, 'm'), run: () => store.ui((u) => ({ mirrorV: !u.mirrorV })) },
  { group: 'Motif tools', keys: 'Shift+M', description: 'Mirror across the horizontal centre line', motif: true, match: (e) => e.shiftKey && !mod(e) && e.key.toLowerCase() === 'm', run: () => store.ui((u) => ({ mirrorH: !u.mirrorH })) },
  { group: 'Transforms', keys: 'Shift+H', description: 'Flip horizontally', motif: true, match: (e) => e.shiftKey && !mod(e) && e.key.toLowerCase() === 'h', run: () => motifCommands.transform('flipH') },
  { group: 'Transforms', keys: 'Shift+V', description: 'Flip vertically', motif: true, match: (e) => e.shiftKey && !mod(e) && e.key.toLowerCase() === 'v', run: () => motifCommands.transform('flipV') },
  { group: 'Transforms', keys: 'Shift+T', description: 'Rotate 180°', motif: true, match: (e) => e.shiftKey && !mod(e) && e.key.toLowerCase() === 't', run: () => motifCommands.transform('rot180') },
  { group: 'Transforms', keys: ']  /  [', description: 'Rotate 90° clockwise / anticlockwise (square motifs)', motif: true, match: (e) => !mod(e) && (e.key === ']' || e.key === '['), run: () => undefined },
  { group: 'Transforms', keys: 'Alt+Arrow keys', description: 'Roll the contents with wrap-around', motif: true, match: (e) => e.altKey && e.key.startsWith('Arrow'), run: () => undefined },
  { group: 'View', keys: 'Alt+1 … Alt+4', description: 'Motif editor, chart, gauge preview, in the round', match: (e) => e.altKey && !mod(e) && /^Digit[1-4]$/.test(e.code), run: () => undefined },
  { group: 'View', keys: 'G', description: 'Toggle grayscale', match: (e) => plain(e, 'g'), run: () => store.ui((u) => ({ grayscale: !u.grayscale })) },
  { group: 'View', keys: '= / -', description: 'Zoom in / out', match: (e) => !mod(e) && (e.key === '=' || e.key === '+' || e.key === '-'), run: () => undefined },
  { group: 'View', keys: '.', description: 'Fit to the window', match: (e) => !mod(e) && e.key === '.', run: () => undefined },
  { group: 'Bands', keys: 'Alt+↑ / Alt+↓', description: 'Move the focused band up or down', match: () => false, run: () => undefined },
  { group: 'Help', keys: '?', description: 'Show this help', match: (e) => e.key === '?', run: () => store.ui({ dialog: { kind: 'help' } }) },
];

const VIEWS: View[] = ['motif', 'chart', 'gauge', 'round'];

/** Zoom requests from the keyboard, picked up by the active canvas view. */
export const zoomBus = new EventTarget();

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function handleKey(e: KeyboardEvent): void {
  const s = store.get();
  const typing = isTyping(e.target);
  // Saving and opening work everywhere, even while typing.
  const global = mod(e) && ['s', 'o', 'e'].includes(e.key.toLowerCase());
  if (s.ui.dialog && !global) {
    // Dialogs handle their own keys; Escape closes one even before it has focus.
    if (e.key === 'Escape' && !e.defaultPrevented) store.ui({ dialog: null });
    return;
  }
  if (typing && !global) return;

  const inMotif = s.ui.view === 'motif';
  if (e.altKey && /^Digit[1-4]$/.test(e.code)) {
    e.preventDefault();
    view(VIEWS[Number(e.code.slice(5)) - 1])();
    return;
  }
  if (inMotif && !mod(e) && !e.altKey && ['0', '1', '2'].includes(e.key)) {
    store.ui({ symbol: e.key as '0' | '1' | '2' });
    return;
  }
  if (inMotif && !mod(e) && (e.key === ']' || e.key === '[')) {
    motifCommands.transform(e.key === ']' ? 'rot90cw' : 'rot90ccw');
    return;
  }
  if (inMotif && e.altKey && e.key.startsWith('Arrow')) {
    e.preventDefault();
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key] as [number, number];
    motifCommands.roll(d[0], d[1]);
    return;
  }
  if (!mod(e) && ['=', '+', '-', '.'].includes(e.key)) {
    zoomBus.dispatchEvent(new CustomEvent('zoom', { detail: e.key === '.' ? 'fit' : e.key === '-' ? 'out' : 'in' }));
    return;
  }
  for (const shortcut of SHORTCUTS) {
    if (shortcut.motif && !inMotif) continue;
    if (shortcut.match(e)) {
      e.preventDefault();
      shortcut.run();
      return;
    }
  }
}
