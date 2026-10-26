import { useState } from 'preact/hooks';
import type { Motif } from '../../core/types';
import { bandsUsingMotif, blankMotif, deleteMotif, duplicateMotif, findMotif, renameMotif, slugify, uniqueId, updateMotif, withOptional } from '../../model/doc';
import { blank } from '../../model/motif';
import { store, type AppState, type MotifPage } from '../../state/store';
import { MotifThumb, NumberField, mappingColors, tabKeys } from '../components/common';
import { IdField } from '../components/IdField';
import { MotifMappings } from './MotifMappings';
import { MotifEditor } from '../views/MotifEditor';
import { editMotif } from '../navigate';

// Selecting a motif shows its details and mappings; Edit motif (or the Draw
// page on phones) opens the motif editor.
const select = (id: string) => store.ui({ motifId: id, mappingId: null, selection: null });

/** The Motifs tab of wider layouts: the motif list, the selected motif's
 * details and its colour mappings. */
export function MotifsPanel({ s }: { s: AppState }) {
  const doc = s.doc;
  const motif = findMotif(doc, s.ui.motifId);
  const [creating, setCreating] = useState(false);

  return (
    <div class="panel">
      <div class="row">
        <h2>Motifs</h2>
        <span class="spacer" />
        <button class="btn small primary" disabled={s.readOnly} onClick={() => setCreating(!creating)} aria-expanded={creating}>
          + Motif
        </button>
      </div>
      <p class="small muted" style={{ margin: 0 }}>
        A motif is shape: background, foreground and accent. Its mappings decide the colours, row by row.
      </p>

      {creating && <NewMotifForm onClose={() => setCreating(false)} />}

      <div class="list">
        {doc.motifs.map((m) => {
          const uses = bandsUsingMotif(doc, m.id).length;
          return (
            <button key={m.id} class="list-item" aria-current={m.id === s.ui.motifId} onClick={() => select(m.id)}>
              <MotifThumb rows={m.rows} colors={m.mappings[0] && mappingColors(m.mappings[0], doc.palette)} grayscale={s.ui.grayscale} maxSize={36} label={m.id} />
              <span class="grow">
                {m.name ?? m.id}
                <br />
                <span class="small muted mono">
                  {m.id} · {m.rows[0]?.length ?? 0}×{m.rows.length}
                </span>
              </span>
              <span class="small muted">{uses ? `${uses} band${uses > 1 ? 's' : ''}` : 'unused'}</span>
            </button>
          );
        })}
      </div>

      {motif && <MotifDetails s={s} motif={motif} openEditor />}
      {motif && <MotifMappings s={s} motif={motif} />}
    </div>
  );
}

const PAGES: { id: MotifPage; label: string }[] = [
  { id: 'draw', label: 'Draw' },
  { id: 'colours', label: 'Colours' },
];

/** The Motifs screen on phones: a motif picker, then the motif editor or the
 * motif's colour mappings and details. */
export function MotifsScreen({ s }: { s: AppState }) {
  const doc = s.doc;
  const motif = findMotif(doc, s.ui.motifId);
  const [creating, setCreating] = useState(false);
  const page = s.ui.motifPage;

  return (
    <section class="sidebar motifs-screen" aria-label="Motifs">
      <div class="view-bar">
        {motif && (
          <MotifThumb rows={motif.rows} colors={motif.mappings[0] && mappingColors(motif.mappings[0], doc.palette)} grayscale={s.ui.grayscale} maxSize={30} label={motif.id} />
        )}
        <select class="motif-picker" aria-label="Motif" value={motif?.id ?? ''} onChange={(e) => select((e.currentTarget as HTMLSelectElement).value)}>
          {!motif && <option value="">{doc.motifs.length ? 'Pick a motif' : 'No motifs yet'}</option>}
          {doc.motifs.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.id} · {m.rows[0]?.length ?? 0}×{m.rows.length}
            </option>
          ))}
        </select>
        <button class="btn small primary" disabled={s.readOnly} onClick={() => setCreating(!creating)} aria-expanded={creating}>
          + Motif
        </button>
        <div class="seg" role="tablist" aria-label="Motif pages" onKeyDown={(e) => tabKeys(e, PAGES.map((p) => p.id), page, (id) => store.ui({ motifPage: id as MotifPage }))}>
          {PAGES.map((p) => (
            <button key={p.id} role="tab" id={`motif-page-${p.id}`} aria-selected={page === p.id} tabIndex={page === p.id ? 0 : -1} onClick={() => store.ui({ motifPage: p.id })}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {creating && (
        <div class="panel new-motif">
          <NewMotifForm onClose={() => setCreating(false)} />
        </div>
      )}
      {page === 'draw' ? (
        <div class="view-body" role="tabpanel" aria-labelledby="motif-page-draw">
          <MotifEditor s={s} />
        </div>
      ) : (
        <div class="panel" role="tabpanel" aria-labelledby="motif-page-colours">
          {motif ? (
            <>
              <MotifMappings s={s} motif={motif} />
              <MotifDetails s={s} motif={motif} />
            </>
          ) : (
            <div class="empty">No motif selected. Pick one above, or create one with + Motif.</div>
          )}
        </div>
      )}
    </section>
  );
}

/** Creates a blank motif and opens it in the motif editor. */
function NewMotifForm({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState({ name: '', width: 8, height: 7 });

  const create = () => {
    const w = Math.round(draft.width);
    const h = Math.round(draft.height);
    if (!(w >= 1 && w <= 200 && h >= 1 && h <= 200)) return;
    const id = uniqueId(slugify(draft.name || 'motif', 'motif'), store.get().doc.motifs.map((m) => m.id));
    store.edit((d) => ({ ...d, motifs: [...d.motifs, withOptional(blankMotif(d, id, blank(w, h)), 'name', draft.name)] }));
    onClose();
    select(id);
    editMotif(id);
  };

  return (
    <form
      class="card"
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <label class="field">
        <span>Name</span>
        <input type="text" value={draft.name} placeholder="Peerie star" autoFocus onInput={(e) => setDraft({ ...draft, name: (e.currentTarget as HTMLInputElement).value })} />
      </label>
      <div class="grid2">
        <NumberField label="Width (stitches)" value={draft.width} min={1} max={200} onChange={(v) => setDraft({ ...draft, width: v })} />
        <NumberField label="Height (rows)" value={draft.height} min={1} max={200} onChange={(v) => setDraft({ ...draft, height: v })} />
      </div>
      <div class="row">
        <span class="spacer" />
        <button type="button" class="btn small" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" class="btn small primary">
          Create
        </button>
      </div>
    </form>
  );
}

/** The motif's name and id, Duplicate and Delete; with `openEditor`, an
 * Edit motif button too. */
function MotifDetails({ s, motif, openEditor }: { s: AppState; motif: Motif; openEditor?: boolean }) {
  return (
    <div class="card">
      <div class="row">
        <h3>Selected motif</h3>
        <span class="spacer" />
        {openEditor && (
          <button class="btn small primary" onClick={() => editMotif(motif.id)} title="Open the motif in the motif editor">
            Edit motif
          </button>
        )}
      </div>
      <label class="field">
        <span>Name</span>
        <input
          type="text"
          value={motif.name ?? ''}
          placeholder={motif.id}
          onInput={(e) => store.edit((d) => updateMotif(d, motif.id, (m) => withOptional(m, 'name', (e.currentTarget as HTMLInputElement).value)), { coalesce: `motif-name-${motif.id}` })}
        />
      </label>
      <IdField label="Id (used in the file; bands follow when it changes)" value={motif.id} rename={renameMotif} onRenamed={(id) => store.ui({ motifId: id })} disabled={s.readOnly} />
      <div class="row">
        <span class="spacer" />
        <button
          class="btn small"
          onClick={() => {
            const { doc: next, id } = duplicateMotif(store.get().doc, motif.id);
            store.edit(() => next);
            select(id);
          }}
        >
          Duplicate
        </button>
        <button
          class="btn small danger"
          onClick={() => {
            const result = deleteMotif(store.get().doc, motif.id);
            if ('blocked' in result) {
              store.ui({ dialog: { kind: 'message', title: 'This motif is in use', body: result.blocked } });
              return;
            }
            store.edit(() => result.doc);
            store.ui({ motifId: result.doc.motifs[0]?.id ?? null });
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
