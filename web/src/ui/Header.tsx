import { useEffect, useRef, useState } from 'preact/hooks';
import { newPatternAction, openFileAction, save, saveAs } from '../state/actions';
import { store, type AppState } from '../state/store';

export interface Action {
  label: string;
  title: string;
  run: () => void;
  disabled?: boolean;
  pressed?: boolean;
}

/** New, Open, Save, Save as, Export and Library: in the header of wider
 * layouts, and in the menu and the Project screen on phones. */
export function fileActions(s: AppState): Action[] {
  return [
    { label: 'New', title: 'New pattern (Alt+N)', run: newPatternAction },
    { label: 'Open…', title: 'Open a pattern file (Ctrl+O)', run: () => void openFileAction() },
    { label: 'Save', title: 'Save (Ctrl+S)', run: () => void save(), disabled: s.readOnly },
    { label: 'Save as…', title: 'Save as (Ctrl+Shift+S)', run: () => void saveAs(), disabled: s.readOnly },
    { label: 'Export…', title: 'Export PNG, SVG or PDF (Ctrl+E)', run: () => store.ui({ dialog: { kind: 'export' } }) },
    {
      label: 'Library…',
      title: 'Insert motifs (with their mappings) and colours from a library',
      run: () => store.ui({ dialog: { kind: 'library', source: null } }),
    },
  ];
}

export function Header({ s }: { s: AppState }) {
  const dirty = store.isDirty();
  const fileName = s.file?.name;
  const unsaved = !s.readOnly && (dirty || !fileName);
  const actions = fileActions(s);
  const grayscale: Action = {
    label: '◐ Grayscale',
    title: 'Show every colour as its lightness (G)',
    run: () => store.ui({ grayscale: !s.ui.grayscale }),
    pressed: s.ui.grayscale,
  };
  const help: Action = { label: 'Help and shortcuts', title: 'Help (?)', run: () => store.ui({ dialog: { kind: 'help' } }) };

  return (
    <header class="header">
      <div class="brand">
        <img src="./icon.svg" alt="" />
        <span class="only-desktop">Fair Isle</span>
      </div>
      <div class="doc-title">
        <strong title={s.doc.meta.name}>{s.doc.meta.name || 'Untitled pattern'}</strong>
        <span class="save-state" aria-live="polite">
          {unsaved && <span class="dot" title={fileName ? `Unsaved changes to ${fileName}` : 'Not saved to a file yet'} />}
          <span class="save-text">
            {s.readOnly ? 'read-only' : unsaved ? (fileName ? `unsaved changes to ${fileName}` : 'not saved to a file yet') : `saved to ${fileName}`}
          </span>
        </span>
      </div>
      <span class="spacer" />
      <nav class="row wrap only-desktop" aria-label="File">
        {actions.map((a) => (
          <button key={a.label} class="btn small" onClick={a.run} disabled={a.disabled} title={a.title}>
            {a.label}
          </button>
        ))}
      </nav>
      <span class="row" aria-label="History">
        <button class="btn small icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!store.canUndo} onClick={() => store.undo()}>
          ↶
        </button>
        <button class="btn small icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!store.canRedo} onClick={() => store.redo()}>
          ↷
        </button>
      </span>
      <button class="btn small only-desktop" aria-pressed={s.ui.grayscale} onClick={grayscale.run} title={grayscale.title}>
        {grayscale.label}
      </button>
      <button class="btn small icon only-desktop" aria-label="Help and keyboard shortcuts" title={help.title} onClick={help.run}>
        ?
      </button>
      <Menu actions={[...actions, grayscale, help]} />
    </header>
  );
}

/** The phone header's menu: every file action, grayscale and help. */
function Menu({ actions }: { actions: Action[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div class="menu only-mobile" ref={ref}>
      <button class="btn small icon" aria-label="Menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        ⋯
      </button>
      {open && (
        <div class="menu-panel" role="menu">
          {actions.map((a) => (
            <button
              key={a.label}
              role="menuitem"
              class="menu-item"
              disabled={a.disabled}
              aria-pressed={a.pressed}
              onClick={() => {
                setOpen(false);
                a.run();
              }}
            >
              {a.label}
              {a.pressed !== undefined && <span class="muted small">{a.pressed ? 'on' : 'off'}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
