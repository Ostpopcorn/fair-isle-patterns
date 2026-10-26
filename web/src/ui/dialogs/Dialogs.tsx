import { useEffect, useState } from 'preact/hooks';
import type { Issue, LibraryDoc, Settings } from '../../core/types';
import { importFromLibrary } from '../../model/library';
import { DEFAULT_SETTINGS } from '../../model/doc';
import { builtinLibraries } from '../../library';
import { importLibraryFile, isOldFormat, newPatternAction, openExample, openFileAction, restoreSession, toast } from '../../state/actions';
import { download, fileNameFor, supportsFileSystemAccess } from '../../state/files';
import { deleteSession, isSafari, recentSessions, type Session } from '../../state/persistence';
import { loadPrefs, savePrefs } from '../../state/prefs';
import { store, type AppState, type Dialog } from '../../state/store';
import { chartPng, gaugePng } from '../../render/png';
import { chartSvg } from '../../render/svg';
import { PAPER, patternPdf, type Paper } from '../../render/patternPdf';
import { SHORTCUTS } from '../shortcuts';
import { Modal, MotifThumb, NumberField, Swatch, mappingColors } from '../components/common';

const close = () => store.ui({ dialog: null });

export function Dialogs({ s }: { s: AppState }) {
  const d = s.ui.dialog;
  if (!d) return null;
  switch (d.kind) {
    case 'welcome':
      return <WelcomeDialog />;
    case 'help':
      return <HelpDialog />;
    case 'settings':
      return <SettingsDialog s={s} />;
    case 'export':
      return <ExportDialog s={s} />;
    case 'library':
      return <LibraryDialog s={s} dialog={d} />;
    case 'message':
      return <MessageDialog title={d.title} body={d.body} issues={d.issues} />;
  }
}

function MessageDialog(props: { title: string; body: string; issues?: Issue[] }) {
  return (
    <Modal
      title={props.title}
      onClose={close}
      footer={
        <button class="btn primary" onClick={close} autoFocus>
          OK
        </button>
      }
    >
      <p style={{ margin: 0 }}>{props.body}</p>
      {props.issues && (
        <ul class="small">
          {props.issues.map((i, k) => (
            <li key={k}>
              <strong>{i.code}</strong> {i.message}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function ago(t: number): string {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

function WelcomeDialog() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [safari] = useState(() => isSafari() && !loadPrefs().safariNoticeShown);
  useEffect(() => {
    void recentSessions().then(setSessions);
    if (safari) savePrefs({ safariNoticeShown: true });
  }, []);
  // Autosaves from before mappings moved into motifs cannot be opened.
  const old = new Set(sessions?.filter((sess) => isOldFormat(sess.text)).map((sess) => sess.id));
  const last = sessions?.find((sess) => !old.has(sess.id));
  return (
    <Modal title="Fair Isle Pattern Builder" onClose={close} wide>
      <p style={{ margin: 0 }}>
        Design stranded fair isle bands knitted in the round. Motifs are shapes; each motif's colour mappings fill it row by row; bands stack them into
        a chart, checked for long floats, colours per row, repeat fit and contrast as you draw.
      </p>
      {safari && (
        <div class="banner" role="note" style={{ borderRadius: '8px' }}>
          Safari may clear website storage after a period without use. Your work is autosaved in the browser, but save it to a file to keep it.
        </div>
      )}
      <div class="row wrap">
        {last && (
          <button class="btn primary" onClick={() => void restoreSession(last)} autoFocus>
            Restore last session: {last.name}
          </button>
        )}
        <button class="btn" onClick={() => (newPatternAction(), close())}>
          New pattern
        </button>
        <button class="btn" onClick={() => void openFileAction()}>
          Open a file…
        </button>
        <button class="btn" onClick={() => (openExample(), close())}>
          Open the example (Peerie hat)
        </button>
      </div>
      <h3>Recent projects</h3>
      {sessions === null ? (
        <p class="muted">Loading…</p>
      ) : sessions.length === 0 ? (
        <p class="muted small">Nothing yet. Every change is autosaved here so a closed tab never loses work; files you save are the real copy.</p>
      ) : (
        <div class="recent">
          {sessions.map((sess) => (
            <div class="row" key={sess.id}>
              <button class="list-item" disabled={old.has(sess.id)} onClick={() => void restoreSession(sess)}>
                <span class="grow">
                  <strong>{sess.name}</strong>
                  <span class="small muted">
                    {' '}
                    · {sess.fileName ?? 'not saved to a file'} · {ago(sess.updatedAt)}
                    {old.has(sess.id) ? ' · made with an earlier version; it cannot be opened' : ''}
                    {!old.has(sess.id) && sess.savedText !== null && sess.savedText !== sess.text ? ' · unsaved changes' : ''}
                  </span>
                </span>
              </button>
              {sess.handle && supportsFileSystemAccess() && !old.has(sess.id) && (
                <button class="btn small" title="Open the file itself instead of the autosaved copy" onClick={() => void restoreSession(sess, true)}>
                  Open file
                </button>
              )}
              <button
                class="btn small icon ghost"
                aria-label={`Forget ${sess.name}`}
                title="Remove from this list"
                onClick={() => void deleteSession(sess.id).then(() => recentSessions().then(setSessions))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function HelpDialog() {
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const keys = (k: string) => (mac ? k.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥') : k);
  return (
    <Modal title="Help and keyboard shortcuts" onClose={close} wide>
      <div class="grid2 help-grid" style={{ alignItems: 'start' }}>
        <div>
          <h3>How it works</h3>
          <ul class="small">
            <li>
              <strong>Palette</strong>: the yarns the project uses, in the Project tab.
            </li>
            <li>
              <strong>Motifs</strong>: shapes of background, foreground and accent cells. The motif editor shows them in black and white unless you pick
              one of the motif's mappings under the tiled preview.
            </li>
            <li>
              <strong>Mappings</strong>: each belongs to one motif. It picks up to 10 palette colours and says which fill background, foreground and accent
              on every row of that motif. Edit them in the Motifs tab.
            </li>
            <li>
              <strong>Bands</strong>: stacked bottom to top; each combines a motif, one of its mappings, a sideways offset and a number of vertical
              repeats.
            </li>
          </ul>
          <p class="small">
            Rows are numbered from the bottom (row 1 is knitted first). Stitches are numbered from the right, because rounds are knitted right to left.
            Knitting concerns are warnings, never blocks; only broken data is an error, and then the chart keeps showing the last valid version.
          </p>
          <p class="small muted">
            Files are plain JSON (.fairisle.json) in a canonical form, so they diff well in git. The app works offline and keeps an autosaved copy in
            this browser.
          </p>
        </div>
        <div>
          {groups.map((g) => (
            <div key={g}>
              <h3 style={{ marginTop: '6px' }}>{g}</h3>
              <table class="keys small">
                <tbody>
                  {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                    <tr key={s.keys}>
                      <td class="keys-cell">
                        {keys(s.keys)
                          .split(/( or | \/ |  \/  | … )/)
                          .map((part, i) => (/^( or | \/ |  \/  | … )$/.test(part) ? <span key={i}>{part}</span> : <kbd key={i}>{part.trim()}</kbd>))}
                      </td>
                      <td>{s.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function SettingsDialog({ s }: { s: AppState }) {
  const [draft, setDraft] = useState<Settings>({ ...s.doc.settings });
  const [asDefault, setAsDefault] = useState(false);
  const valid =
    Number.isInteger(draft.float_notice) &&
    Number.isInteger(draft.float_warning) &&
    draft.float_notice >= 2 &&
    draft.float_notice <= draft.float_warning &&
    Number.isInteger(draft.max_colors_per_row) &&
    draft.max_colors_per_row >= 1 &&
    draft.min_contrast >= 0 &&
    draft.min_contrast <= 100;
  const apply = () => {
    store.edit((d) => ({ ...d, settings: { ...d.settings, ...draft } }));
    if (asDefault) savePrefs({ settings: { float_notice: draft.float_notice, float_warning: draft.float_warning, max_colors_per_row: draft.max_colors_per_row, min_contrast: draft.min_contrast } });
    close();
  };
  return (
    <Modal
      title="Pattern settings"
      onClose={close}
      footer={
        <>
          <button class="btn" onClick={() => setDraft({ ...draft, ...DEFAULT_SETTINGS })}>
            Reset to defaults
          </button>
          <span class="spacer" />
          <button class="btn" onClick={close}>
            Cancel
          </button>
          <button class="btn primary" disabled={!valid || s.readOnly} onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      <p class="small muted" style={{ margin: 0 }}>
        These thresholds are stored in the pattern file, so everyone who opens it sees the same checks.
      </p>
      <div class="grid2">
        <NumberField label="Float notice from (stitches)" value={draft.float_notice} min={2} onChange={(v) => setDraft({ ...draft, float_notice: v })} />
        <NumberField label="Float warning from (stitches)" value={draft.float_warning} min={2} onChange={(v) => setDraft({ ...draft, float_warning: v })} />
        <NumberField label="Colours per row, at most" value={draft.max_colors_per_row} min={1} onChange={(v) => setDraft({ ...draft, max_colors_per_row: v })} />
        <NumberField label="Minimum lightness contrast (L*)" value={draft.min_contrast} min={0} max={100} onChange={(v) => setDraft({ ...draft, min_contrast: v })} />
      </div>
      {!valid && (
        <p role="alert" class="small" style={{ color: 'var(--error)', margin: 0 }}>
          Floats need whole numbers with the notice at least 2 and not above the warning; colours per row at least 1; contrast between 0 and 100.
        </p>
      )}
      <label class="check">
        <input type="checkbox" checked={asDefault} onChange={() => setAsDefault(!asDefault)} /> Also use these as the defaults for new patterns (app preference)
      </label>
    </Modal>
  );
}

type ExportKind = 'png-chart' | 'png-gauge' | 'svg' | 'pdf';

function ExportDialog({ s }: { s: AppState }) {
  const [kind, setKind] = useState<ExportKind>('pdf');
  const [scale, setScale] = useState(16);
  const [paper, setPaper] = useState<Paper>(() => (navigator.language === 'en-US' ? 'letter' : 'a4'));
  const [busy, setBusy] = useState(false);
  const shown = store.displayed();
  const analysis = store.analysis();
  const base = fileNameFor(s.doc.meta.name, '');
  const run = async () => {
    if (!shown) return;
    setBusy(true);
    try {
      const { doc, chart } = shown;
      const gray = s.ui.grayscale;
      const suffix = gray ? '-grayscale' : '';
      if (kind === 'png-chart') download(`${base}-chart${suffix}.png`, await chartPng(doc, chart, scale, gray));
      if (kind === 'png-gauge') {
        const layout = store.layoutOf(doc, chart);
        if (layout) download(`${base}-gauge${suffix}.png`, await gaugePng(doc, chart, layout, scale * 4, gray));
      }
      if (kind === 'svg') download(`${base}-chart${suffix}.svg`, new Blob([chartSvg(doc, chart, { grayscale: gray })], { type: 'image/svg+xml' }));
      if (kind === 'pdf') download(`${base}${suffix}.pdf`, new Blob([patternPdf(doc, chart, { paper, grayscale: gray }) as BlobPart], { type: 'application/pdf' }));
      toast('Export ready');
      close();
    } catch (e) {
      store.ui({ dialog: { kind: 'message', title: 'Export failed', body: e instanceof Error ? e.message : String(e) } });
    } finally {
      setBusy(false);
    }
  };
  const options: { id: ExportKind; label: string; hint: string }[] = [
    { id: 'pdf', label: 'PDF for printing', hint: 'Name and settings, colour legend, the chart split across pages with row and stitch numbers on each, and a colour table per row.' },
    { id: 'png-chart', label: 'PNG of the chart', hint: 'The chart view as an image.' },
    { id: 'png-gauge', label: 'PNG of the gauge preview', hint: 'True proportions, with centimetre rulers.' },
    { id: 'svg', label: 'SVG of the chart', hint: 'Vector graphics with a legend, for editing or printing large.' },
  ];
  return (
    <Modal
      title="Export"
      onClose={close}
      footer={
        <>
          <button class="btn" onClick={close}>
            Cancel
          </button>
          <button class="btn primary" disabled={!shown || busy} onClick={() => void run()}>
            {busy ? 'Exporting…' : 'Export'}
          </button>
        </>
      }
    >
      {!shown && <p role="alert">There is no valid chart to export yet. Fix the errors in the issues panel first.</p>}
      {shown?.stale && <p class="small" style={{ color: 'var(--error)' }}>The pattern has errors; the export uses the last valid chart.</p>}
      <div role="radiogroup" aria-label="Format" class="list">
        {options.map((o) => (
          <label key={o.id} class="list-item" style={{ alignItems: 'flex-start' }}>
            <input type="radio" name="export-kind" checked={kind === o.id} onChange={() => setKind(o.id)} />
            <span>
              <strong>{o.label}</strong>
              <br />
              <span class="small muted">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {kind === 'pdf' && (
        <label class="field">
          <span>Paper</span>
          <select value={paper} onChange={(e) => setPaper((e.currentTarget as HTMLSelectElement).value as Paper)}>
            {Object.entries(PAPER).map(([id, p]) => (
              <option key={id} value={id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {(kind === 'png-chart' || kind === 'png-gauge') && (
        <NumberField label={kind === 'png-chart' ? 'Pixels per stitch' : 'Pixels per stitch (approximately)'} value={scale} min={1} max={80} onChange={(v) => setScale(Math.max(1, Math.min(80, v)))} />
      )}
      <p class="small muted" style={{ margin: 0 }}>
        {s.ui.grayscale ? 'Grayscale is on, so the export is in grayscale.' : 'Turn on grayscale first for a grayscale export.'}
        {analysis.issues.length ? ` The pattern has ${analysis.issues.length} issue${analysis.issues.length > 1 ? 's' : ''}; exports are not affected.` : ''}
      </p>
    </Modal>
  );
}

function LibraryDialog({ s, dialog }: { s: AppState; dialog: Extract<Dialog, { kind: 'library' }> }) {
  const builtins = builtinLibraries();
  const sources: { name: string; doc: LibraryDoc }[] = dialog.source
    ? [{ name: dialog.fileName ?? dialog.source.meta.name, doc: dialog.source }]
    : builtins.map((b) => ({ name: b.doc.meta.name, doc: b.doc }));
  const [tab, setTab] = useState(0);
  const [picked, setPicked] = useState<Record<string, Set<string>>>({ colors: new Set(), motifs: new Set() });
  const lib = sources[Math.min(tab, sources.length - 1)]?.doc;
  const toggle = (kind: 'colors' | 'motifs', id: string) => {
    const next = new Set(picked[kind]);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked({ ...picked, [kind]: next });
  };
  const count = picked.colors.size + picked.motifs.size;
  const insert = () => {
    if (!lib) return;
    const result = importFromLibrary(store.get().doc, lib, { colors: [...picked.colors], motifs: [...picked.motifs] });
    store.edit(() => result.doc);
    const added = result.added.colors.length + result.added.motifs.length;
    const renamed = result.renamed.map((r) => `${r.from} → ${r.to}`).join(', ');
    toast(added ? `Added ${added} item${added > 1 ? 's' : ''}${renamed ? ` (renamed ${renamed})` : ''}` : 'Everything selected was already in the project');
    if (result.added.motifs[0]) store.ui({ motifId: result.added.motifs[0], mappingId: null });
    setPicked({ colors: new Set(), motifs: new Set() });
    close();
  };
  const selectAll = () => lib && setPicked({ colors: new Set(lib.palette.map((c) => c.id)), motifs: new Set(lib.motifs.map((m) => m.id)) });

  return (
    <Modal
      title={dialog.source ? `Import from ${sources[0].name}` : 'Starter library'}
      onClose={close}
      wide
      footer={
        <>
          <button class="btn" onClick={selectAll} disabled={!lib}>
            Select all
          </button>
          {!dialog.source && (
            <button class="btn" onClick={() => void importLibraryFile()} title="Import from a library file (Ctrl+Shift+O)">
              From a file…
            </button>
          )}
          <span class="spacer" />
          <button class="btn" onClick={close}>
            Cancel
          </button>
          <button class="btn primary" disabled={!count || s.readOnly} onClick={insert}>
            Copy {count || ''} into the project
          </button>
        </>
      }
    >
      <p class="small muted" style={{ margin: 0 }}>
        Items are copied into the project, so the pattern file stays self-contained. A motif brings its mappings and the colours they use; an item whose
        id is taken is renamed (peerie-x → peerie-x-2).
      </p>
      {sources.length > 1 && (
        <div class="tabs" role="tablist">
          {sources.map((src, i) => (
            <button key={i} role="tab" aria-selected={i === tab} onClick={() => setTab(i)}>
              {src.name}
            </button>
          ))}
        </div>
      )}
      {lib?.meta.description && <p class="small" style={{ margin: 0 }}>{lib.meta.description}</p>}
      {lib && lib.motifs.length > 0 && (
        <>
          <h3>Motifs</h3>
          <div class="lib-grid">
            {lib.motifs.map((m) => (
              <button key={m.id} class="lib-item" aria-pressed={picked.motifs.has(m.id)} onClick={() => toggle('motifs', m.id)}>
                <MotifThumb
                  rows={m.rows}
                  maxSize={120}
                  across={(m.rows[0]?.length ?? 1) < 10 ? 3 : 2}
                  colors={m.mappings[0] && mappingColors(m.mappings[0], lib.palette)}
                  grayscale={s.ui.grayscale}
                  label={m.name ?? m.id}
                />
                <span class="small">
                  <strong>{m.name ?? m.id}</strong> <span class="muted">{m.rows[0]?.length}×{m.rows.length}</span>
                  <br />
                  <span class="muted">
                    {m.mappings.length} mapping{m.mappings.length === 1 ? '' : 's'}: {m.mappings.map((p) => p.name ?? p.id).join(', ')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {lib && lib.palette.length > 0 && (
        <>
          <h3>Colours</h3>
          <div class="lib-grid">
            {lib.palette.map((c) => (
              <button key={c.id} class="lib-item" aria-pressed={picked.colors.has(c.id)} onClick={() => toggle('colors', c.id)}>
                <span class="row">
                  <Swatch hex={c.hex} grayscale={s.ui.grayscale} size={22} />
                  <span class="small">
                    <strong>{c.name ?? c.id}</strong>
                    <br />
                    <span class="muted mono">{c.hex}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
