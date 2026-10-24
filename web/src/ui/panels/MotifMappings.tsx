import { useState } from 'preact/hooks';
import { MAX_MAPPING_COLORS, type Mapping, type Motif } from '../../core/types';
import { addMapping, bandsUsingMapping, deleteMapping, duplicateMapping, findMapping, renameMapping, updateMapping, withOptional } from '../../model/doc';
import * as MapOps from '../../model/mapping';
import { store, type AppState } from '../../state/store';
import { ColorSelect, MotifThumb, PositionSelect, mappingColors } from '../components/common';
import { IdField } from '../components/IdField';

/** The selected motif's colour mappings: a list, and an editor for one. */
export function MotifMappings({ s, motif }: { s: AppState; motif: Motif }) {
  const doc = s.doc;
  const selected = findMapping(motif, s.ui.mappingId) ?? motif.mappings[0];
  const [newName, setNewName] = useState('');

  const create = () => {
    const { doc: next, id } = addMapping(store.get().doc, motif.id, newName.trim());
    store.edit(() => next);
    store.ui({ mappingId: id });
    setNewName('');
  };

  return (
    <div class="card">
      <h3>Colour mappings</h3>
      <p class="small muted" style={{ margin: 0 }}>
        A mapping picks up to {MAX_MAPPING_COLORS} palette colours and says which of them fill the background, foreground and accent on each row of this
        motif.
      </p>
      <div class="list">
        {motif.mappings.map((m) => {
          const uses = bandsUsingMapping(doc, motif.id, m.id).length;
          return (
            <button key={m.id} class="list-item" aria-current={m.id === selected?.id} onClick={() => store.ui({ mappingId: m.id })}>
              <MotifThumb rows={motif.rows} colors={mappingColors(m, doc.palette)} grayscale={s.ui.grayscale} maxSize={36} label={`${motif.id} coloured with ${m.id}`} />
              <span class="grow">
                {m.name ?? m.id}
                <br />
                <span class="small muted mono">
                  {m.id} · {m.colors.length} colour{m.colors.length === 1 ? '' : 's'}
                </span>
              </span>
              <span class="small muted">{uses ? `${uses} band${uses > 1 ? 's' : ''}` : 'unused'}</span>
            </button>
          );
        })}
      </div>
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <input type="text" aria-label="New mapping name" placeholder="New mapping name" value={newName} onInput={(e) => setNewName((e.currentTarget as HTMLInputElement).value)} />
        <button type="submit" class="btn small primary" disabled={s.readOnly || doc.palette.length < 1} title="Starts with the first three palette colours">
          + Mapping
        </button>
      </form>
      {selected && <MappingEditor s={s} motif={motif} mapping={selected} />}
    </div>
  );
}

function MappingEditor({ s, motif, mapping }: { s: AppState; motif: Motif; mapping: Mapping }) {
  const doc = s.doc;
  const uses = bandsUsingMapping(doc, motif.id, mapping.id);
  const edit = (fn: (m: Mapping) => Mapping, coalesce?: string) =>
    store.edit((d) => updateMapping(d, motif.id, mapping.id, fn), coalesce ? { coalesce } : {});
  const setRows = (rows: string[]) => edit((m) => ({ ...m, rows }));
  const h = mapping.rows.length;
  const notListed = doc.palette.filter((c) => !mapping.colors.includes(c.id));
  const w = motif.rows[0]?.length ?? 1;

  return (
    <div class="sub-card">
      <h3>Selected mapping</h3>
      <MotifThumb rows={motif.rows} colors={mappingColors(mapping, doc.palette)} grayscale={s.ui.grayscale} maxSize={160} across={w < 12 ? 3 : 2} label={`${motif.id} coloured with ${mapping.id}`} />
      <label class="field">
        <span>Name</span>
        <input
          type="text"
          value={mapping.name ?? ''}
          placeholder={mapping.id}
          onInput={(e) => edit((m) => withOptional(m, 'name', (e.currentTarget as HTMLInputElement).value), `mapping-name-${motif.id}-${mapping.id}`)}
        />
      </label>
      <IdField
        label="Id (bands follow when it changes)"
        value={mapping.id}
        rename={(d, oldId, newId) => renameMapping(d, motif.id, oldId, newId)}
        onRenamed={(id) => store.ui({ mappingId: id })}
        disabled={s.readOnly}
      />
      <p class="small muted" style={{ margin: 0 }}>
        Used by {uses.length} band{uses.length === 1 ? '' : 's'}
        {uses.length ? ` (${uses.map((i) => i + 1).join(', ')})` : ''}. Editing it updates every one of them; duplicate it for an independent copy.
      </p>

      <h3>
        Colours <span class="small muted">({mapping.colors.length} of {MAX_MAPPING_COLORS})</span>
      </h3>
      <div class="mapping-colors">
        {mapping.colors.map((id, p) => {
          const used = MapOps.usesPosition(mapping, p);
          return (
            <span class="row" key={p} style={{ gap: '4px' }}>
              <ColorSelect
                palette={doc.palette.filter((c) => c.id === id || !mapping.colors.includes(c.id))}
                value={id}
                label={`Mapping colour ${p + 1}`}
                grayscale={s.ui.grayscale}
                onChange={(next) => next && edit((m) => MapOps.replaceColor(m, p, next))}
              />
              <button
                class="btn small icon ghost danger"
                aria-label={`Remove ${id} from the mapping`}
                disabled={used}
                title={used ? 'Rows use this colour; change them first' : 'Remove from the mapping'}
                onClick={() => edit((m) => MapOps.removeColor(m, p))}
              >
                ✕
              </button>
            </span>
          );
        })}
        {mapping.colors.length < MAX_MAPPING_COLORS && notListed.length > 0 && (
          <select
            aria-label="Add a palette colour to the mapping"
            value=""
            onChange={(e) => {
              const v = (e.currentTarget as HTMLSelectElement).value;
              if (v) edit((m) => MapOps.addColor(m, v));
            }}
          >
            <option value="">+ Add a colour…</option>
            {notListed.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ? `${c.name} (${c.id})` : c.id}
              </option>
            ))}
          </select>
        )}
      </div>

      <h3>Rows</h3>
      <p class="small muted" style={{ margin: 0 }}>
        One per motif row, top row first, as in the chart. Changing a colour above recolours every row that uses it.
      </p>
      <div class="row wrap">
        <button class="btn small" disabled={h < 2} onClick={() => setRows(MapOps.reverse(mapping.rows))} title="Reverse the order of the rows">
          ⇅ Reverse
        </button>
        <button class="btn small" disabled={h < 2} onClick={() => setRows(MapOps.shiftUp(mapping.rows))} title="Move every row's colours up one row, wrapping around">
          ↑ Shift up
        </button>
        <button class="btn small" disabled={h < 2} onClick={() => setRows(MapOps.shiftDown(mapping.rows))} title="Move every row's colours down one row, wrapping around">
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
        .map(({ row, i }) => {
          const d = MapOps.digits(row);
          const motifRow = motif.rows[i] ?? '';
          const needsAccent = motifRow.includes('2') && (d?.length ?? 0) < 3;
          const set = (slot: MapOps.Slot) => (p: number | null) => edit((m) => MapOps.setSlot(m, i, slot, p));
          return (
            <div class="mapping-row" key={i} role="group" aria-label={`Mapping row ${i + 1}`}>
              <span class="small muted mono">{i + 1}</span>
              <PositionSelect mapping={mapping} palette={doc.palette} grayscale={s.ui.grayscale} tag="Background" label={`Row ${i + 1} background`} value={d?.[0] ?? null} onChange={set(0)} />
              <PositionSelect mapping={mapping} palette={doc.palette} grayscale={s.ui.grayscale} tag="Foreground" label={`Row ${i + 1} foreground`} value={d?.[1] ?? null} onChange={set(1)} />
              <PositionSelect
                mapping={mapping}
                palette={doc.palette}
                grayscale={s.ui.grayscale}
                tag="Accent"
                label={needsAccent ? `Row ${i + 1} accent (the motif row uses the accent)` : `Row ${i + 1} accent`}
                value={d?.[2] ?? null}
                allowNone
                invalid={needsAccent}
                onChange={set(2)}
              />
              <span class="row mapping-actions" style={{ gap: '2px' }}>
                <button class="btn small icon ghost" aria-label={`Move row ${i + 1} up`} disabled={i >= h - 1} onClick={() => setRows(MapOps.moveRow(mapping.rows, i, i + 1))}>
                  ↑
                </button>
                <button class="btn small icon ghost" aria-label={`Move row ${i + 1} down`} disabled={i <= 0} onClick={() => setRows(MapOps.moveRow(mapping.rows, i, i - 1))}>
                  ↓
                </button>
              </span>
            </div>
          );
        })}
      <div class="row">
        <span class="spacer" />
        <button
          class="btn small"
          onClick={() => {
            const { doc: next, id } = duplicateMapping(store.get().doc, motif.id, mapping.id);
            store.edit(() => next);
            store.ui({ mappingId: id });
          }}
        >
          Duplicate
        </button>
        <button
          class="btn small danger"
          onClick={() => {
            const result = deleteMapping(store.get().doc, motif.id, mapping.id);
            if ('blocked' in result) {
              store.ui({ dialog: { kind: 'message', title: 'This mapping cannot be deleted', body: result.blocked } });
              return;
            }
            store.edit(() => result.doc);
            store.ui({ mappingId: null });
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
