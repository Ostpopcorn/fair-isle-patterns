import type { Band, Issue } from '../../core/types';
import { bandHeight, bandStartRows, ensureSpacer, findMapping, findMotif, moveItem, updateBand, withOptional } from '../../model/doc';
import { store, type AppState } from '../../state/store';
import { Badge, MotifThumb, NumberField } from '../components/common';

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
    const motif = findMotif(doc, s.ui.motifId)?.id ?? doc.motifs.find((m) => !(m.rows.length === 1 && m.rows[0] === '0'))?.id ?? doc.motifs[0]?.id;
    const mapping = findMapping(doc, s.ui.mappingId)?.id ?? doc.mappings[0]?.id;
    if (!motif || !mapping) {
      store.ui({ dialog: { kind: 'message', title: 'Nothing to add yet', body: 'A band needs a motif and a mapping. Create them in the Motifs and Mappings tabs first.' } });
      return;
    }
    store.edit((d) => ({ ...d, bands: [...d.bands, { motif, mapping, offset: 0, times: 1 }] }));
    store.ui({ bandIndex: doc.bands.length });
  };

  const addSpacer = () => {
    const mapping = doc.bands[doc.bands.length - 1]?.mapping ?? doc.mappings[0]?.id;
    if (!mapping) {
      store.ui({ dialog: { kind: 'message', title: 'No mapping yet', body: 'A spacer takes its colour from a mapping’s background. Create a mapping first.' } });
      return;
    }
    store.edit((d) => {
      const { doc: withSpacer, id } = ensureSpacer(d);
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
        Top band first, as in the chart. {doc.bands.length} band{doc.bands.length === 1 ? '' : 's'}, {total} rows. Alt+↑/↓ moves the focused band.
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
  const mapping = findMapping(doc, band.mapping);
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
        {motif && <MotifThumb rows={motif.rows} mapping={mapping} doc={doc} grayscale={s.ui.grayscale} maxSize={48} across={w < 12 ? 2 : 1} label={`${band.motif} with ${band.mapping}`} />}
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
          <select value={band.motif} onChange={(e) => set({ motif: (e.currentTarget as HTMLSelectElement).value })}>
            {!motif && <option value={band.motif}>{band.motif} (missing)</option>}
            {doc.motifs.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ? `${m.name} (${m.id})` : m.id}
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          <span>Mapping</span>
          <select value={band.mapping} onChange={(e) => set({ mapping: (e.currentTarget as HTMLSelectElement).value })}>
            {!mapping && <option value={band.mapping}>{band.mapping} (missing)</option>}
            {doc.mappings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ? `${m.name} (${m.id})` : m.id}
              </option>
            ))}
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
        <button key={k} class={`issue ${issue.severity}`} onClick={() => store.ui({ issue, view: 'chart' })}>
          <span>
            <span class="code">{issue.code}</span>
            {issue.message}
          </span>
        </button>
      ))}

      <div class="row">
        <button class="btn small icon" aria-label={`Move band ${i + 1} up`} title="Move up (Alt+↑)" disabled={i >= n - 1} onClick={() => moveBand(i, i + 1)}>
          ↑
        </button>
        <button class="btn small icon" aria-label={`Move band ${i + 1} down`} title="Move down (Alt+↓)" disabled={i <= 0} onClick={() => moveBand(i, i - 1)}>
          ↓
        </button>
        <span class="spacer" />
        {motif && (
          <button class="btn small ghost" onClick={() => store.ui({ motifId: motif.id, view: 'motif', panel: 'motifs' })}>
            Edit motif
          </button>
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
