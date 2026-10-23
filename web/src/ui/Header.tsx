import { newPatternAction, openFileAction, save, saveAs } from '../state/actions';
import { store, type AppState } from '../state/store';

export function Header({ s }: { s: AppState }) {
  const dirty = store.isDirty();
  const fileName = s.file?.name;
  return (
    <header class="header">
      <div class="brand">
        <img src="./icon.svg" alt="" />
        <span>Fair Isle</span>
      </div>
      <div class="doc-title">
        <strong title={s.doc.meta.name}>{s.doc.meta.name || 'Untitled pattern'}</strong>
        <span class="save-state" aria-live="polite">
          {s.readOnly ? (
            'read-only'
          ) : dirty || !fileName ? (
            <>
              <span class="dot" aria-hidden="true" />
              {fileName ? `unsaved changes to ${fileName}` : 'not saved to a file yet'}
            </>
          ) : (
            `saved to ${fileName}`
          )}
        </span>
      </div>
      <span class="spacer" />
      <nav class="row wrap" aria-label="File">
        <button class="btn small" onClick={newPatternAction} title="New pattern (Alt+N)">
          New
        </button>
        <button class="btn small" onClick={() => void openFileAction()} title="Open a pattern file (Ctrl+O)">
          Open…
        </button>
        <button class="btn small" onClick={() => void save()} disabled={s.readOnly} title="Save (Ctrl+S)">
          Save
        </button>
        <button class="btn small" onClick={() => void saveAs()} disabled={s.readOnly} title="Save as (Ctrl+Shift+S)">
          Save as…
        </button>
        <button class="btn small" onClick={() => store.ui({ dialog: { kind: 'export' } })} title="Export PNG, SVG or PDF (Ctrl+E)">
          Export…
        </button>
        <button class="btn small" onClick={() => store.ui({ dialog: { kind: 'library', source: null } })} title="Insert motifs, mappings and colours from a library">
          Library…
        </button>
      </nav>
      <span class="row" aria-label="History">
        <button class="btn small icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!store.canUndo} onClick={() => store.undo()}>
          ↶
        </button>
        <button class="btn small icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!store.canRedo} onClick={() => store.redo()}>
          ↷
        </button>
      </span>
      <button class="btn small" aria-pressed={s.ui.grayscale} onClick={() => store.ui({ grayscale: !s.ui.grayscale })} title="Show every colour as its lightness (G)">
        ◐ Grayscale
      </button>
      <button class="btn small icon" aria-label="Help and keyboard shortcuts" title="Help (?)" onClick={() => store.ui({ dialog: { kind: 'help' } })}>
        ?
      </button>
    </header>
  );
}
