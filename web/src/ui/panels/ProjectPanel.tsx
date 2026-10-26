import type { Gauge, Meta } from '../../core/types';
import { withOptional } from '../../model/doc';
import { store, type AppState } from '../../state/store';
import { NumberField } from '../components/common';
import { fileActions } from '../Header';
import { PaletteSection } from './PaletteSection';

export function ProjectPanel({ s }: { s: AppState }) {
  const doc = s.doc;
  const setMeta = (key: keyof Meta, value: string) =>
    store.edit((d) => ({ ...d, meta: key === 'name' ? { ...d.meta, name: value } : withOptional(d.meta, key as string, value) }), { coalesce: `meta-${key}` });
  const setGauge = (key: keyof Gauge, value: number) => store.edit((d) => ({ ...d, gauge: { ...d.gauge, [key]: value } }), { coalesce: `gauge-${key}` });
  const shown = store.displayed();
  const g = doc.gauge;
  const width = (doc.cast_on * g.per_cm) / g.stitches;
  const height = shown ? (shown.chart.height * g.per_cm) / g.rows : 0;

  return (
    <div class="panel">
      <h2>Project</h2>
      <div class="only-mobile">
        <div class="file-actions" role="group" aria-label="File">
          {fileActions(s).map((a) => (
            <button key={a.label} class="btn small" onClick={a.run} disabled={a.disabled} title={a.title}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <label class="field">
        <span>Pattern name</span>
        <input type="text" value={doc.meta.name} onInput={(e) => setMeta('name', (e.currentTarget as HTMLInputElement).value)} />
      </label>
      <div class="grid2">
        <label class="field">
          <span>Author</span>
          <input type="text" value={doc.meta.author ?? ''} onInput={(e) => setMeta('author', (e.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Licence (SPDX id)</span>
          <input type="text" list="licences" value={doc.meta.license ?? ''} placeholder="CC-BY-SA-4.0" onInput={(e) => setMeta('license', (e.currentTarget as HTMLInputElement).value)} />
          <datalist id="licences">
            {['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'CC0-1.0'].map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
      </div>
      <label class="field">
        <span>Description</span>
        <textarea value={doc.meta.description ?? ''} onInput={(e) => setMeta('description', (e.currentTarget as HTMLTextAreaElement).value)} />
      </label>

      <div class="divider" />
      <PaletteSection s={s} />

      <div class="divider" />
      <h3>Gauge</h3>
      <div class="grid3">
        <NumberField label="Stitches" value={g.stitches} min={0.1} step={0.5} onChange={(v) => setGauge('stitches', v)} />
        <NumberField label="Rows" value={g.rows} min={0.1} step={0.5} onChange={(v) => setGauge('rows', v)} />
        <NumberField label="Per cm" value={g.per_cm} min={0.1} onChange={(v) => setGauge('per_cm', v)} />
      </div>
      <NumberField
        label="Cast-on (stitches in the round; the chart width)"
        value={doc.cast_on}
        min={1}
        max={1000}
        onChange={(v) => store.edit((d) => ({ ...d, cast_on: v }), { coalesce: 'cast-on' })}
      />
      <p class="small muted" style={{ margin: 0 }}>
        {Number.isFinite(width) ? `${width.toFixed(1)} cm around` : ''}
        {height ? ` · ${height.toFixed(1)} cm tall (${shown!.chart.height} rows)` : ''}
      </p>

      <div class="divider" />
      <h3>Checks</h3>
      <p class="small muted" style={{ margin: 0 }}>
        Floats from {doc.settings.float_notice} (notice) and {doc.settings.float_warning} (warning) stitches, at most {doc.settings.max_colors_per_row}{' '}
        colours per row, lightness contrast at least {doc.settings.min_contrast}.
      </p>
      <div>
        <button class="btn small" onClick={() => store.ui({ dialog: { kind: 'settings' } })}>
          Pattern settings…
        </button>
      </div>
      {Object.keys(doc).some((k) => !['format', 'version', 'meta', 'gauge', 'cast_on', 'settings', 'palette', 'motifs', 'bands'].includes(k)) && (
        <p class="small muted">This file has fields this version does not know; they are kept when you save.</p>
      )}
    </div>
  );
}
