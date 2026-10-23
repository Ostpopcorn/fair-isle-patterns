import { useState } from 'preact/hooks';
import type { Mapping } from '../../core/types';
import { bandsUsingMapping, deleteMapping, duplicateMapping, findMapping, renameMapping, slugify, uniqueId, updateMapping, withOptional } from '../../model/doc';
import * as MapOps from '../../model/mapping';
import { store, type AppState } from '../../state/store';
import { ColorSelect, Swatch } from '../components/common';
import { IdField } from '../components/IdField';

function MappingStrip({ mapping, s }: { mapping: Mapping; s: AppState }) {
  const hex = (id: string | undefined) => s.doc.palette.find((c) => c.id === id)?.hex ?? '#00000000';
  return (
    <span style={{ display: 'inline-grid', gap: '1px' }} aria-hidden="true">
      {[...mapping.rows].reverse().slice(0, 6).map((row, i) => (
        <span key={i} style={{ display: 'flex', gap: '1px' }}>
          {row.map((id, j) => (
            <Swatch key={j} hex={hex(id)} grayscale={s.ui.grayscale} size={8} />
          ))}
        </span>
      ))}
    </span>
  );
}

export function MappingsPanel({ s }: { s: AppState }) {
  const doc = s.doc;
  const mapping = findMapping(doc, s.ui.mappingId);
  const [newName, setNewName] = useState('');

  const create = () => {
    const id = uniqueId(slugify(newName || 'mapping', 'mapping'), doc.mappings.map((m) => m.id));
    const bg = doc.palette[0]?.id;
    const fg = doc.palette[1]?.id ?? bg;
    if (!bg || !fg) return;
    store.edit((d) => ({ ...d, mappings: [...d.mappings, withOptional({ id, rows: [[bg, fg]] }, 'name', newName)] }));
    store.ui({ mappingId: id });
    setNewName('');
  };

  return (
    <div class="panel">
      <h2>Colour mappings</h2>
      <p class="small muted" style={{ margin: 0 }}>
        A mapping says which palette colours fill background, foreground and accent, row by row. Shorter mappings cycle over the band.
      </p>
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <input type="text" aria-label="New mapping name" placeholder="New mapping name" value={newName} onInput={(e) => setNewName((e.currentTarget as HTMLInputElement).value)} />
        <button type="submit" class="btn small primary" disabled={s.readOnly || doc.palette.length < 1}>
          + Mapping
        </button>
      </form>

      <div class="list">
        {doc.mappings.map((m) => {
          const uses = bandsUsingMapping(doc, m.id).length;
          return (
            <button key={m.id} class="list-item" aria-current={m.id === s.ui.mappingId} onClick={() => store.ui({ mappingId: m.id })}>
              <MappingStrip mapping={m} s={s} />
              <span class="grow">
                {m.name ?? m.id}
                <br />
                <span class="small muted mono">
                  {m.id} · {m.rows.length} row{m.rows.length === 1 ? '' : 's'}
                </span>
              </span>
              <span class="small muted">{uses ? `${uses} band${uses > 1 ? 's' : ''}` : 'unused'}</span>
            </button>
          );
        })}
      </div>

      {mapping && <MappingEditor s={s} mapping={mapping} />}
    </div>
  );
}

function MappingEditor({ s, mapping }: { s: AppState; mapping: Mapping }) {
  const doc = s.doc;
  const uses = bandsUsingMapping(doc, mapping.id);
  const setRows = (rows: string[][], coalesce?: string) => store.edit((d) => updateMapping(d, mapping.id, (m) => ({ ...m, rows })), coalesce ? { coalesce } : {});
  const k = mapping.rows.length;

  return (
    <div class="card">
      <h3>Selected mapping</h3>
      <label class="field">
        <span>Name</span>
        <input
          type="text"
          value={mapping.name ?? ''}
          placeholder={mapping.id}
          onInput={(e) => store.edit((d) => updateMapping(d, mapping.id, (m) => withOptional(m, 'name', (e.currentTarget as HTMLInputElement).value)), { coalesce: `mapping-name-${mapping.id}` })}
        />
      </label>
      <IdField label="Id (bands follow when it changes)" value={mapping.id} rename={renameMapping} onRenamed={(id) => store.ui({ mappingId: id })} disabled={s.readOnly} />
      <p class="small muted" style={{ margin: 0 }}>
        Used by {uses.length} band{uses.length === 1 ? '' : 's'}
        {uses.length ? ` (${uses.map((i) => i + 1).join(', ')})` : ''}. Editing it updates every one of them; duplicate it for an independent copy.
      </p>

      <div class="row wrap">
        <button class="btn small" disabled={k < 2} onClick={() => setRows(MapOps.reverse(mapping.rows))} title="Reverse the order of the rows">
          ⇅ Reverse
        </button>
        <button class="btn small" disabled={k < 2} onClick={() => setRows(MapOps.shiftUp(mapping.rows))} title="Move every colour up one row, wrapping around">
          ↑ Shift up
        </button>
        <button class="btn small" disabled={k < 2} onClick={() => setRows(MapOps.shiftDown(mapping.rows))} title="Move every colour down one row, wrapping around">
          ↓ Shift down
        </button>
      </div>

      <div class="mapping-row mapping-head small muted" aria-hidden="true">
        <span>Row</span>
        <span>Background</span>
        <span>Foreground</span>
        <span>Accent</span>
        <span />
      </div>
      {mapping.rows
        .map((row, i) => ({ row, i }))
        .reverse()
        .map(({ row, i }) => (
          <div class="mapping-row" key={i} role="group" aria-label={`Mapping row ${i + 1}`}>
            <span class="small muted mono">{i + 1}</span>
            <ColorSelect palette={doc.palette} grayscale={s.ui.grayscale} tag="Background" label={`Row ${i + 1} background`} value={row[0] ?? null} onChange={(id) => setRows(MapOps.setEntry(mapping.rows, i, 0, id))} />
            <ColorSelect palette={doc.palette} grayscale={s.ui.grayscale} tag="Foreground" label={`Row ${i + 1} foreground`} value={row[1] ?? null} onChange={(id) => setRows(MapOps.setEntry(mapping.rows, i, 1, id))} />
            <ColorSelect palette={doc.palette} grayscale={s.ui.grayscale} tag="Accent" label={`Row ${i + 1} accent`} value={row[2] ?? null} allowNone onChange={(id) => setRows(MapOps.setEntry(mapping.rows, i, 2, id))} />
            <span class="row mapping-actions" style={{ gap: '2px' }}>
              <button class="btn small icon ghost" aria-label={`Move row ${i + 1} up`} disabled={i >= k - 1} onClick={() => setRows(MapOps.moveRow(mapping.rows, i, i + 1))}>
                ↑
              </button>
              <button class="btn small icon ghost" aria-label={`Move row ${i + 1} down`} disabled={i <= 0} onClick={() => setRows(MapOps.moveRow(mapping.rows, i, i - 1))}>
                ↓
              </button>
              <button class="btn small icon ghost danger" aria-label={`Remove row ${i + 1}`} disabled={k <= 1} onClick={() => setRows(mapping.rows.filter((_, j) => j !== i))}>
                ✕
              </button>
            </span>
          </div>
        ))}
      <div class="row">
        <button class="btn small" onClick={() => setRows([...mapping.rows, [...(mapping.rows[k - 1] ?? [doc.palette[0]?.id ?? '', doc.palette[1]?.id ?? ''])]])}>
          + Row at the top
        </button>
        <span class="spacer" />
        <button
          class="btn small"
          onClick={() => {
            const { doc: next, id } = duplicateMapping(store.get().doc, mapping.id);
            store.edit(() => next);
            store.ui({ mappingId: id });
          }}
        >
          Duplicate
        </button>
        <button
          class="btn small danger"
          onClick={() => {
            const result = deleteMapping(store.get().doc, mapping.id);
            if ('blocked' in result) {
              store.ui({ dialog: { kind: 'message', title: 'This mapping is in use', body: result.blocked } });
              return;
            }
            store.edit(() => result.doc);
            store.ui({ mappingId: result.doc.mappings[0]?.id ?? null });
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
