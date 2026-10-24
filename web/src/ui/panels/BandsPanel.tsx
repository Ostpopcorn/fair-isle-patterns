import type { Band, Issue } from '../../core/types';
import { addMapping, bandHeight, bandStartRows, blankMotif, ensureSpacer, findMapping, findMotif, moveItem, uniqueId, updateBand, withOptional } from '../../model/doc';
import { blank } from '../../model/motif';
import { store, type AppState } from '../../state/store';
import { Badge, MotifThumb, NumberField, mappingColors } from '../components/common';
import { editMapping, editMotif } from '../navigate';

/** The select value of the "+ New …" options (ids cannot start with +). */
const NEW = '+new';

/** Gives band i a new blank motif (with the default mapping) and opens it in
 * the motif editor. One undo step. */
function newMotifFor(i: number): void {
  const id = uniqueId('motif', store.get().doc.motifs.map((m) => m.id));
  store.edit((d) => {
    const motif = blankMotif(d, id, blank(8, 7));
    return updateBand({ ...d, motifs: [...d.motifs, motif] }, i, { motif: id, mapping: motif.mappings[0].id });
  });
  editMotif(id);
}

/** Gives band i a new mapping of its motif and opens it in the mapping
 * editor. One undo step. */
function newMappingFor(i: number, motifId: string): void {
  const { doc, id } = addMapping(store.get().doc, motifId);
  store.edit(() => updateBand(doc, i, { mapping: id }));
  editMapping(motifId, id);
}

function issuesByBand(issues: Issue[], starts: number[], heights: number[]): Map<number, Issue[]> {
  const out = new Map<number, Issue[]>();
  const add = (b: number, i: Issue) => out.set(b, [...(out.get(b) ?? []), i]);
  for (const issue of issues) {
    const loc = issue.location;
    if (loc.band !== undefined) add(loc.band, issue);
    else if (loc.row !== undefined) {
      const b = starts.findIndex((start, i) => loc.row! >= start && loc.row! < start + heights[i]);
      if (b >= 0) add(b, issue);
    }
  }
  return out;
}

function moveBand(from: number, to: number): void {
  store.edit((doc) => ({ ...doc, bands: moveItem(doc.bands, from, to) }));
  store.ui({ bandIndex: to });
  // Keep keyboard focus on the moved band.
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-band="${to}"]`)?.focus());
}

export function BandsPanel({ s }: { s: AppState }) {
  const doc = s.doc;
  const issues = store.analysis().issues;
  const starts = bandStartRows(doc);
  const heights = doc.bands.map((b) => bandHeight(doc, b));
  const byBand = issuesByBand(issues, starts, heights);
  const total = heights.reduce((a, b) => a + b, 0);

  const addBand = () => {
    const motif = findMotif(doc, s.ui.motifId) ?? doc.motifs.find((m) => !(m.rows.length === 1 && m.rows[0] === '0')) ?? doc.motifs[0];
    const mapping = (findMapping(motif, s.ui.mappingId) ?? motif?.mappings[0])?.id;
    if (!motif || !mapping) {
      store.ui({ dialog: { kind: 'message', title: 'Nothing to add yet', body: 'A band needs a motif with a colour mapping. Create one in the Motifs tab first.' } });
      return;
    }
    store.edit((d) => ({ ...d, bands: [...d.bands, { motif: motif.id, mapping, offset: 0, times: 1 }] }));
    store.ui({ bandIndex: doc.bands.length });
  };

  const addSpacer = () => {
    if (!doc.palette.length) {
      store.ui({ dialog: { kind: 'message', title: 'No colours yet', body: 'A spacer is knitted in its mapping’s background colour. Add a colour to the palette first.' } });
      return;
    }
    store.edit((d) => {
      const { doc: withSpacer, id } = ensureSpacer(d);
      const mapping = findMotif(withSpacer, id)!.mappings[0].id;
      return { ...withSpacer, bands: [...withSpacer.bands, { motif: id, mapping, offset: 0, times: 1, name: 'Spacer' }] };
    });
    store.ui({ bandIndex: doc.bands.length });
  };

  return (
    <div class="panel">
      <div class="row">
        <h2>Band stack</h2>
        <span class="spacer" />
        <button class="btn small primary" onClick={addBand} disabled={s.readOnly}>
          + Band
        </button>
        <button class="btn small" onClick={addSpacer} disabled={s.readOnly} title="Insert a plain band in the background colour">
          + Spacer
        </button>
      </div>
      <p class="small muted" style={{ margin: 0 }}>
        Top band first, as in the chart. {doc.bands.length} band{doc.bands.length === 1 ? '' : 's'}, {total} rows.
        <span class="only-desktop"> Alt+↑/↓ moves the focused band.</span>
      </p>
      {doc.bands.length === 0 && <div class="empty">No bands yet. Add one to start the chart.</div>}
      {doc.bands
        .map((band, i) => ({ band, i }))
        .reverse()
        .map(({ band, i }) => (
          <BandCard key={i} s={s} band={band} index={i} start={starts[i]} height={heights[i]} issues={byBand.get(i) ?? []} />
        ))}
    </div>
  );
}

function BandCard(props: { s: AppState; band: Band; index: number; start: number; height: number; issues: Issue[] }) {
  const { s, band, index: i } = props;
  const doc = s.doc;
  const n = doc.bands.length;
  const motif = findMotif(doc, band.motif);
  const mapping = findMapping(motif, band.mapping);
  const w = motif?.rows[0]?.length ?? 0;
  const effective = w && Number.isInteger(band.offset) ? ((band.offset % w) + w) % w : null;
  const set = (patch: Partial<Band>, key?: string) => store.edit((d) => updateBand(d, i, patch), key ? { coalesce: `band-${i}-${key}` } : {});
  const count = (sev: Issue['severity']) => props.issues.filter((x) => x.severity === sev).length;
  const selected = s.ui.bandIndex === i;
  const title = band.name || motif?.name || band.motif;

  return (
    <div
      class={`card band-card${selected ? ' selected' : ''}`}
      tabIndex={0}
      data-band={i}
      aria-label={`Band ${i + 1}: ${title}, rows ${props.start} to ${props.start + props.height - 1}`}
      onFocusIn={() => !selected && store.ui({ bandIndex: i })}
      onKeyDown={(e) => {
        if (e.altKey && e.key === 'ArrowUp' && i < n - 1) {
          e.preventDefault();
          moveBand(i, i + 1);
        } else if (e.altKey && e.key === 'ArrowDown' && i > 0) {
          e.preventDefault();
          moveBand(i, i - 1);
        }
      }}
    >
      <div class="card-head">
        {motif && <MotifThumb rows={motif.rows} colors={mapping && mappingColors(mapping, doc.palette)} grayscale={s.ui.grayscale} maxSize={48} across={w < 12 ? 2 : 1} label={`${band.motif} with ${band.mapping}`} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>
            {i + 1}. {title}
          </strong>
          <div class="small muted">
            {props.height ? `rows ${props.start}–${props.start + props.height - 1} · ${props.height} row${props.height === 1 ? '' : 's'}` : 'no rows'}
          </div>
        </div>
        <Badge severity="error" count={count('error')} />
        <Badge severity="warning" count={count('warning')} />
        <Badge severity="notice" count={count('notice')} />
      </div>

      <div class="grid2">
        <label class="field">
          <span>Motif</span>
          <select
            value={band.motif}
            onChange={(e) => {
              const value = (e.currentTarget as HTMLSelectElement).value;
              if (value === NEW) return newMotifFor(i);
              // Keep the mapping id when the new motif has one by that name.
              const next = findMotif(doc, value);
              if (next) set({ motif: next.id, mapping: findMapping(next, band.mapping)?.id ?? next.mappings[0]?.id ?? band.mapping });
            }}
          >
            {!motif && <option value={band.motif}>{band.motif} (missing)</option>}
            {doc.motifs.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ? `${m.name} (${m.id})` : m.id}
              </option>
            ))}
            <option value={NEW} disabled={s.readOnly}>
              + New motif…
            </option>
          </select>
        </label>
        <label class="field">
          <span>Mapping</span>
          <select
            value={band.mapping}
            onChange={(e) => {
              const value = (e.currentTarget as HTMLSelectElement).value;
              if (value === NEW) return motif && newMappingFor(i, motif.id);
              set({ mapping: value });
            }}
          >
            {!mapping && <option value={band.mapping}>{band.mapping} (missing)</option>}
            {motif?.mappings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ? `${m.name} (${m.id})` : m.id}
              </option>
            ))}
            {motif && (
              <option value={NEW} disabled={s.readOnly}>
                + New mapping…
              </option>
            )}
          </select>
        </label>
      </div>

      <div class="row wrap">
        <div class="field">
          <span class="small muted">Offset{effective !== null && effective !== band.offset ? ` (same as ${effective})` : ''}</span>
          <span class="stepper">
            <button class="btn small icon" aria-label="Slide motif left one stitch" title="Slide left one stitch" onClick={() => set({ offset: band.offset + 1 }, 'offset')}>
              ◀
            </button>
            <NumberField ariaLabel={`Band ${i + 1} offset`} value={band.offset} onChange={(v) => set({ offset: v }, 'offset')} />
            <button class="btn small icon" aria-label="Slide motif right one stitch" title="Slide right one stitch" onClick={() => set({ offset: band.offset - 1 }, 'offset')}>
              ▶
            </button>
          </span>
        </div>
        <div class="field">
          <span class="small muted">Times (vertical repeats)</span>
          <span class="stepper">
            <button class="btn small icon" aria-label="One repeat fewer" disabled={band.times <= 1} onClick={() => set({ times: Math.max(1, band.times - 1) }, 'times')}>
              −
            </button>
            <NumberField ariaLabel={`Band ${i + 1} times`} value={band.times} min={1} onChange={(v) => set({ times: v }, 'times')} />
            <button class="btn small icon" aria-label="One repeat more" onClick={() => set({ times: band.times + 1 }, 'times')}>
              +
            </button>
          </span>
        </div>
      </div>

      <label class="field">
        <span>Name (optional)</span>
        <input
          type="text"
          value={band.name ?? ''}
          placeholder={motif?.name ?? band.motif}
          onInput={(e) => store.edit((d) => ({ ...d, bands: d.bands.map((b, j) => (j === i ? withOptional(b, 'name', (e.currentTarget as HTMLInputElement).value) : b)) }), { coalesce: `band-${i}-name` })}
        />
      </label>

      {props.issues.filter((x) => x.severity !== 'notice').slice(0, 3).map((issue, k) => (
        <button key={k} class={`issue ${issue.severity}`} onClick={() => store.ui({ issue, view: 'chart', screen: 'view' })}>
          <span>
            <span class="code">{issue.code}</span>
            {issue.message}
          </span>
        </button>
      ))}

      <div class="row wrap">
        <button class="btn small icon" aria-label={`Move band ${i + 1} up`} title="Move up (Alt+↑)" disabled={i >= n - 1} onClick={() => moveBand(i, i + 1)}>
          ↑
        </button>
        <button class="btn small icon" aria-label={`Move band ${i + 1} down`} title="Move down (Alt+↓)" disabled={i <= 0} onClick={() => moveBand(i, i - 1)}>
          ↓
        </button>
        <span class="spacer" />
        {motif && (
          <>
            <button class="btn small ghost" title="Edit this band's mapping" onClick={() => editMapping(motif.id, band.mapping)}>
              <span class="long">Edit colours</span>
              <span class="short">Colours</span>
            </button>
            <button class="btn small ghost" title="Edit the motif" onClick={() => editMotif(motif.id)}>
              <span class="long">Edit motif</span>
              <span class="short">Motif</span>
            </button>
          </>
        )}
        <button
          class="btn small"
          onClick={() => {
            store.edit((d) => {
              const bands = [...d.bands];
              bands.splice(i + 1, 0, { ...band });
              return { ...d, bands };
            });
            store.ui({ bandIndex: i + 1 });
          }}
        >
          Duplicate
        </button>
        <button
          class="btn small danger"
          onClick={() => {
            store.edit((d) => ({ ...d, bands: d.bands.filter((_, j) => j !== i) }));
            store.ui({ bandIndex: null });
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
