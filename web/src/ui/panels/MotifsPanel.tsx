import { useState } from 'preact/hooks';
import { bandsUsingMotif, blankMotif, deleteMotif, duplicateMotif, findMotif, renameMotif, slugify, uniqueId, updateMotif, withOptional } from '../../model/doc';
import { blank } from '../../model/motif';
import { store, type AppState } from '../../state/store';
import { MotifThumb, NumberField, mappingColors } from '../components/common';
import { IdField } from '../components/IdField';
import { MotifMappings } from './MotifMappings';

export function MotifsPanel({ s }: { s: AppState }) {
  const doc = s.doc;
  const motif = findMotif(doc, s.ui.motifId);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', width: 8, height: 7 });

  const select = (id: string) => store.ui({ motifId: id, mappingId: null, view: 'motif', selection: null, screen: 'view' });

  const create = () => {
    const w = Math.round(draft.width);
    const h = Math.round(draft.height);
    if (!(w >= 1 && w <= 200 && h >= 1 && h <= 200)) return;
    const id = uniqueId(slugify(draft.name || 'motif', 'motif'), doc.motifs.map((m) => m.id));
    store.edit((d) => ({ ...d, motifs: [...d.motifs, withOptional(blankMotif(d, id, blank(w, h)), 'name', draft.name)] }));
    setCreating(false);
    setDraft({ name: '', width: 8, height: 7 });
    select(id);
  };

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

      {creating && (
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
            <button type="button" class="btn small" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button type="submit" class="btn small primary">
              Create
            </button>
          </div>
        </form>
      )}

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

      {motif && (
        <div class="card">
          <h3>Selected motif</h3>
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
            <button class="btn small" onClick={() => store.ui({ view: 'motif', screen: 'view' })}>
              Open in editor
            </button>
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
      )}
      {motif && <MotifMappings s={s} motif={motif} />}
    </div>
  );
}
