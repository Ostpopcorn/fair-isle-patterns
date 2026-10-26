import { useEffect, useState } from 'preact/hooks';
import type { PaletteColor } from '../../core/types';
import { parseHex } from '../../model/color';
import { deleteColor, describeBands, describeMapping, mappingsUsingColor, renameColor, slugify, spacersUsingColor, uniqueId, updateColor, withOptional } from '../../model/doc';
import { importLibraryFile } from '../../state/actions';
import { store, type AppState } from '../../state/store';
import { Swatch } from '../components/common';
import { IdField } from '../components/IdField';

/** The palette, a section of the Project tab. */
export function PaletteSection({ s }: { s: AppState }) {
  const doc = s.doc;
  const [open, setOpen] = useState<string | null>(null);

  const add = () => {
    const id = uniqueId('colour', doc.palette.map((c) => c.id));
    store.edit((d) => ({ ...d, palette: [...d.palette, { id, hex: '#7f7f7f' }] }));
    setOpen(id);
  };

  return (
    <section id="palette" class="section" aria-labelledby="palette-heading">
      <div class="row">
        <h3 id="palette-heading">Palette</h3>
        <span class="spacer" />
        <button class="btn small primary" onClick={add} disabled={s.readOnly}>
          + Colour
        </button>
        <button class="btn small" onClick={() => void importLibraryFile()} disabled={s.readOnly} title="Copy colours from a library file">
          Import…
        </button>
      </div>
      <p class="small muted" style={{ margin: 0 }}>
        The actual yarns. Record the shade name and number to find them again.
      </p>
      {doc.palette.map((c) => (
        <ColorRow key={c.id} s={s} color={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} onRenamed={setOpen} />
      ))}
      <div>
        <button class="btn small" onClick={() => store.ui({ dialog: { kind: 'library', source: null } })}>
          Browse the starter library…
        </button>
      </div>
    </section>
  );
}

function ColorRow(props: { s: AppState; color: PaletteColor; open: boolean; onToggle: () => void; onRenamed: (id: string) => void }) {
  const { color, s } = props;
  const [hexText, setHexText] = useState(color.hex);
  useEffect(() => setHexText(color.hex), [color.hex]);
  const setHex = (hex: string) => store.edit((d) => updateColor(d, color.id, (c) => ({ ...c, hex })), { coalesce: `hex-${color.id}` });
  const mappings = mappingsUsingColor(s.doc, color.id).map(describeMapping);
  const spacers = spacersUsingColor(s.doc, color.id);
  const users = [
    ...(mappings.length ? [`mapping${mappings.length > 1 ? 's' : ''} ${mappings.join(', ')}`] : []),
    ...(spacers.length ? [`spacer${spacers.length > 1 ? 's' : ''} ${describeBands(s.doc, spacers)}`] : []),
  ].join(' and ');

  return (
    <div class="card" style={{ gap: '6px', padding: '8px' }}>
      <div class="palette-row">
        <input type="color" aria-label={`${color.id} colour`} value={parseHex(color.hex) ? color.hex.toLowerCase() : '#000000'} onInput={(e) => setHex((e.currentTarget as HTMLInputElement).value)} />
        <input
          type="text"
          class="mono"
          aria-label={`${color.id} hex`}
          value={hexText}
          aria-invalid={parseHex(hexText) ? undefined : 'true'}
          onInput={(e) => {
            const v = (e.currentTarget as HTMLInputElement).value.trim();
            setHexText(v);
            setHex(v);
          }}
        />
        <button class="list-item" style={{ padding: '2px 6px' }} onClick={props.onToggle} aria-expanded={props.open}>
          <span class="grow">
            {color.name ?? color.id}
            <span class="small muted mono"> {color.id}</span>
            {color.yarn && <span class="small muted"> · {color.yarn}</span>}
          </span>
          {s.ui.grayscale && <Swatch hex={color.hex} grayscale />}
        </button>
        <button
          class="btn small icon ghost danger"
          aria-label={`Delete ${color.id}`}
          title={users ? `Used by ${users}` : 'Delete'}
          onClick={() => {
            const result = deleteColor(store.get().doc, color.id);
            if ('blocked' in result) store.ui({ dialog: { kind: 'message', title: 'This colour is in use', body: result.blocked } });
            else store.edit(() => result.doc);
          }}
        >
          ✕
        </button>
      </div>
      {props.open && (
        <div class="palette-extra">
          <label class="field">
            <span>Name</span>
            <input
              type="text"
              value={color.name ?? ''}
              placeholder="Natural"
              onInput={(e) => {
                const name = (e.currentTarget as HTMLInputElement).value;
                store.edit((d) => updateColor(d, color.id, (c) => withOptional(c, 'name', name)), { coalesce: `name-${color.id}` });
              }}
            />
          </label>
          <label class="field">
            <span>Yarn (shade and number)</span>
            <input
              type="text"
              value={color.yarn ?? ''}
              placeholder="Shade 202"
              onInput={(e) => {
                const yarn = (e.currentTarget as HTMLInputElement).value;
                store.edit((d) => updateColor(d, color.id, (c) => withOptional(c, 'yarn', yarn)), { coalesce: `yarn-${color.id}` });
              }}
            />
          </label>
          <IdField label="Id" value={color.id} rename={renameColor} onRenamed={props.onRenamed} disabled={s.readOnly} />
          <div class="field">
            <span class="small muted">Suggested id</span>
            <button
              class="btn small"
              disabled={!color.name || slugify(color.name) === color.id}
              onClick={() => {
                const doc = store.get().doc;
                const target = uniqueId(slugify(color.name ?? color.id), doc.palette.filter((c) => c.id !== color.id).map((c) => c.id));
                const result = renameColor(doc, color.id, target);
                if ('doc' in result) {
                  store.edit(() => result.doc);
                  props.onRenamed(target);
                }
              }}
            >
              Use “{slugify(color.name ?? color.id)}”
            </button>
          </div>
          <p class="small muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
            {users ? `Used by ${users}.` : 'Not used by any mapping or spacer.'}
          </p>
        </div>
      )}
    </div>
  );
}
