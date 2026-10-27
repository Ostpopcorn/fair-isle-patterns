import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Motif } from '../../core/types';
import { bandsUsingMotif, findMapping, updateMotif } from '../../model/doc';
import { displayHex } from '../../model/color';
import * as M from '../../model/motif';
import { store, type AppState, type Tool } from '../../state/store';
import { NumberField, blackAndWhite, mappingColors, paintMotif, symbolColors, type MotifColors } from '../components/common';
import { motifCommands } from './motifCommands';
import { zoomBus } from '../shortcuts';
import { ZoomControls } from './ZoomControls';

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'pencil', label: 'Pencil', key: 'P', icon: '✎' },
  { id: 'fill', label: 'Fill', key: 'F', icon: '◧' },
  { id: 'line', label: 'Line', key: 'L', icon: '╱' },
  { id: 'rect', label: 'Rectangle', key: 'R', icon: '▭' },
  { id: 'select', label: 'Select', key: 'S', icon: '⬚' },
];

const SYMBOLS: { id: M.Symbol; label: string }[] = [
  { id: '0', label: 'Background' },
  { id: '1', label: 'Foreground' },
  { id: '2', label: 'Accent' },
];

let strokeCounter = 0;

export function MotifEditor({ s }: { s: AppState }) {
  const motif = s.doc.motifs.find((m) => m.id === s.ui.motifId);
  if (!motif) {
    return (
      <div class="panel">
        <div class="empty">No motif selected. Pick one in the Motifs tab, or create one with + Motif, to draw it here.</div>
      </div>
    );
  }
  return <Editor s={s} motif={motif} />;
}

function Editor({ s, motif }: { s: AppState; motif: Motif }) {
  const rows = motif.rows;
  const w = M.width(rows);
  const h = M.height(rows);
  const ui = s.ui;
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fit, setFit] = useState({ w: 600, h: 400 });
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<M.Cell | null>(null);
  const [preview, setPreview] = useState<M.Cell[] | null>(null);
  const [moreTools, setMoreTools] = useState(false);
  const drag = useRef<{ anchor: M.Cell; last: M.Cell; symbol: M.Symbol; key: string } | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const css = getComputedStyle(el);
      const padX = parseFloat(css.paddingLeft) + parseFloat(css.paddingRight);
      const padY = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom);
      setFit({ w: el.clientWidth - padX, h: el.clientHeight - padY });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onZoom = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setZoom((z) => (d === 'fit' ? 1 : d === 'in' ? Math.min(4, z * 1.25) : Math.max(0.25, z / 1.25)));
    };
    zoomBus.addEventListener('zoom', onZoom);
    return () => zoomBus.removeEventListener('zoom', onZoom);
  }, []);

  // The colouring chosen under the tiled preview: black and white unless a
  // mapping of this motif is picked.
  const colouring = findMapping(motif, ui.motifColors);
  const colors: MotifColors = colouring ? mappingColors(colouring, s.doc.palette) : blackAndWhite;
  const hexAt = (row: number, symbol: number) => displayHex(colors(row, symbol), ui.grayscale);

  const baseCell = Math.max(6, Math.min(40, Math.floor(Math.min(fit.w / Math.max(1, w), fit.h / Math.max(1, h)))));
  const cell = Math.max(3, Math.round(baseCell * zoom));

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * cell * dpr;
    canvas.height = h * cell * dpr;
    canvas.style.width = `${w * cell}px`;
    canvas.style.height = `${h * cell}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const previewSet = new Set(preview?.map((c) => `${c.x},${c.y}`));
    for (let y = 0; y < h; y++) {
      const rowHex = [0, 1, 2].map((sym) => hexAt(y, sym));
      for (let x = 0; x < w; x++) {
        const sym = previewSet.has(`${x},${y}`) ? (drag.current?.symbol ?? ui.symbol) : rows[y][x];
        ctx.fillStyle = rowHex[Number(sym)] ?? '#f0f';
        ctx.fillRect(x * cell, (h - 1 - y) * cell, cell, cell);
      }
    }
    ctx.strokeStyle = 'rgba(128,128,128,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      ctx.moveTo(x * cell + 0.5, 0);
      ctx.lineTo(x * cell + 0.5, h * cell);
    }
    for (let y = 0; y <= h; y++) {
      ctx.moveTo(0, y * cell + 0.5);
      ctx.lineTo(w * cell, y * cell + 0.5);
    }
    ctx.stroke();
    // Centre lines for mirrored drawing.
    ctx.strokeStyle = symbolColors()[2];
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    if (ui.mirrorV) {
      ctx.moveTo((w * cell) / 2, 0);
      ctx.lineTo((w * cell) / 2, h * cell);
    }
    if (ui.mirrorH) {
      ctx.moveTo(0, (h * cell) / 2);
      ctx.lineTo(w * cell, (h * cell) / 2);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (ui.selection) {
      const r = ui.selection;
      ctx.strokeStyle = '#2f6fd6';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(r.x0 * cell + 1, (h - 1 - r.y1) * cell + 1, (r.x1 - r.x0 + 1) * cell - 2, (r.y1 - r.y0 + 1) * cell - 2);
      ctx.setLineDash([]);
    }
    if (hover) {
      ctx.strokeStyle = '#2f6fd6';
      ctx.lineWidth = 2;
      ctx.strokeRect(hover.x * cell + 1, (h - 1 - hover.y) * cell + 1, cell - 2, cell - 2);
    }
  });

  const cellFromEvent = (e: PointerEvent): M.Cell | null => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / cell);
    const sy = Math.floor((e.clientY - rect.top) / cell);
    if (x < 0 || x >= w || sy < 0 || sy >= h) return null;
    return { x, y: h - 1 - sy };
  };

  const clamp = (c: M.Cell): M.Cell => ({ x: Math.max(0, Math.min(w - 1, c.x)), y: Math.max(0, Math.min(h - 1, c.y)) });
  const looseCell = (e: PointerEvent): M.Cell => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return clamp({ x: Math.floor((e.clientX - rect.left) / cell), y: h - 1 - Math.floor((e.clientY - rect.top) / cell) });
  };

  const withMirrors = (cells: M.Cell[]) => cells.flatMap((c) => M.mirrored(c, w, h, ui.mirrorV, ui.mirrorH));

  const paint = (cells: M.Cell[], symbol: M.Symbol, key: string) => {
    const id = motif.id;
    store.edit((doc) => updateMotif(doc, id, (m) => {
      const next = M.setCells(m.rows, withMirrors(cells), symbol);
      return next.join('\n') === m.rows.join('\n') ? m : { ...m, rows: next };
    }), { coalesce: key });
  };

  const onDown = (e: PointerEvent) => {
    const c = cellFromEvent(e);
    if (!c || s.readOnly) return;
    e.preventDefault();
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const symbol: M.Symbol = e.button === 2 ? '0' : ui.symbol;
    const key = `stroke-${++strokeCounter}`;
    drag.current = { anchor: c, last: c, symbol, key };
    if (ui.tool === 'pencil') paint([c], symbol, key);
    else if (ui.tool === 'fill') {
      const regions = withMirrors([c]).flatMap((start) => M.floodRegion(rows, start));
      store.edit((doc) => updateMotif(doc, motif.id, (m) => ({ ...m, rows: M.setCells(m.rows, regions, symbol) })), { coalesce: key });
      drag.current = null;
    } else if (ui.tool === 'select') store.ui({ selection: M.normalizeRect(c, c) });
    else setPreview(withMirrors(ui.tool === 'line' ? M.lineCells(c, c) : M.rectCells(c, c, ui.filledRect)));
  };

  const onMove = (e: PointerEvent) => {
    const c = cellFromEvent(e);
    setHover(c);
    const d = drag.current;
    if (!d) return;
    const loose = looseCell(e);
    if (ui.tool === 'pencil') {
      if (c && (c.x !== d.last.x || c.y !== d.last.y)) {
        paint(M.lineCells(d.last, c), d.symbol, d.key);
        d.last = c;
      }
    } else if (ui.tool === 'select') {
      store.ui({ selection: M.normalizeRect(d.anchor, loose) });
    } else if (ui.tool === 'line') {
      setPreview(withMirrors(M.lineCells(d.anchor, loose)));
    } else if (ui.tool === 'rect') {
      setPreview(withMirrors(M.rectCells(d.anchor, loose, ui.filledRect)));
    }
    d.last = loose;
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if ((ui.tool === 'line' || ui.tool === 'rect') && preview) {
      const cells = preview;
      store.edit((doc) => updateMotif(doc, motif.id, (m) => ({ ...m, rows: M.setCells(m.rows, cells, d.symbol) })));
    }
    setPreview(null);
    store.breakCoalescing();
  };

  const users = bandsUsingMotif(s.doc, motif.id);
  const square = w === h;

  return (
    <div class="motif-editor">
      <div class="motif-tools">
        <div class="toolbar" role="toolbar" aria-label="Motif tools">
          <div class="seg" role="radiogroup" aria-label="Tool">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={ui.tool === t.id}
                aria-pressed={ui.tool === t.id}
                title={`${t.label} (${t.key})`}
                onClick={() => store.ui({ tool: t.id, selection: t.id === 'select' ? ui.selection : null })}
              >
                <span aria-hidden="true">{t.icon}</span> <span class="small">{t.id === 'rect' ? <><span class="long">Rectangle</span><span class="short">Rect</span></> : t.label}</span>
              </button>
            ))}
          </div>
          <div class="seg" role="radiogroup" aria-label="Symbol">
            {SYMBOLS.map((sym) => (
              <button
                key={sym.id}
                role="radio"
                aria-checked={ui.symbol === sym.id}
                aria-pressed={ui.symbol === sym.id}
                title={`${sym.label} (${sym.id})`}
                onClick={() => store.ui({ symbol: sym.id })}
              >
                <span class="sym" style={{ background: hexAt(hover?.y ?? 0, Number(sym.id)) }} /> {sym.label}
              </button>
            ))}
          </div>
          {ui.tool === 'rect' && (
            <label class="check small">
              <input type="checkbox" checked={ui.filledRect} onChange={() => store.ui({ filledRect: !ui.filledRect })} /> Filled
            </label>
          )}
          <button class="btn small only-mobile" aria-expanded={moreTools} aria-controls="motif-more" onClick={() => setMoreTools(!moreTools)}>
            {moreTools ? 'Fewer tools' : 'More tools'}
          </button>
        </div>
        <div class={`toolbar motif-more${moreTools ? ' open' : ''}`} id="motif-more">
          <span class="group">
            <button class="btn small" aria-pressed={ui.mirrorV} title="Mirror across the vertical centre line (M)" onClick={() => store.ui({ mirrorV: !ui.mirrorV })}>
              ⇆ Mirror
            </button>
            <button class="btn small" aria-pressed={ui.mirrorH} title="Mirror across the horizontal centre line (Shift+M)" onClick={() => store.ui({ mirrorH: !ui.mirrorH })}>
              ⇅ Mirror
            </button>
          </span>
          <span class="group">
            <button class="btn small icon" title="Flip horizontally (Shift+H)" aria-label="Flip horizontally" onClick={() => motifCommands.transform('flipH')}>
              ⇋
            </button>
            <button class="btn small icon" title="Flip vertically (Shift+V)" aria-label="Flip vertically" onClick={() => motifCommands.transform('flipV')}>
              ⥮
            </button>
            <button class="btn small icon" title="Rotate 180° (Shift+T)" aria-label="Rotate 180 degrees" onClick={() => motifCommands.transform('rot180')}>
              ↻
            </button>
            <button class="btn small" disabled={!square} title={square ? 'Rotate 90° clockwise (])' : 'Rotating by 90° needs a square motif'} onClick={() => motifCommands.transform('rot90cw')}>
              90°
            </button>
          </span>
          <span class="group" aria-label="Roll contents">
            {(
              [
                ['←', -1, 0, 'left'],
                ['→', 1, 0, 'right'],
                ['↑', 0, 1, 'up'],
                ['↓', 0, -1, 'down'],
              ] as const
            ).map(([icon, dx, dy, dir]) => (
              <button key={dir} class="btn small icon" title={`Roll ${dir} with wrap-around (Alt+Arrow)`} aria-label={`Roll ${dir}`} onClick={() => motifCommands.roll(dx, dy)}>
                {icon}
              </button>
            ))}
          </span>
          <span class="group">
            <button class="btn small" title="Copy (Ctrl+C)" onClick={() => motifCommands.copy()}>
              Copy
            </button>
            <button class="btn small" title="Cut (Ctrl+X)" disabled={!ui.selection} onClick={() => motifCommands.cut()}>
              Cut
            </button>
            <button class="btn small" title="Paste (Ctrl+V)" disabled={!s.clipboard} onClick={() => motifCommands.paste()}>
              Paste
            </button>
          </span>
          <span class="row small" role="group" aria-label="Motif size">
            <span class="muted" aria-hidden="true">
              Size
            </span>
            <SizeStepper dimension="width" value={w} onChange={(v) => resize(v, h)} />
            ×
            <SizeStepper dimension="height" value={h} onChange={(v) => resize(w, v)} />
          </span>
        </div>
        <div class="row">
          <div class="motif-info small muted" aria-live="polite">
            <strong>{motif.name ?? motif.id}</strong> · {w} × {h} · used by {users.length} band{users.length === 1 ? '' : 's'}
            {hover ? ` · column ${hover.x + 1} from the left, row ${hover.y + 1}` : ''}
          </div>
          <ZoomControls inline />
        </div>
      </div>
      <div class="motif-stage">
        <div class="motif-canvas" ref={hostRef}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Motif ${motif.id}, ${w} by ${h} cells`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => setHover(null)}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
        <TilePreview s={s} motif={motif} colors={colors} colouring={colouring?.id ?? null} />
      </div>
    </div>
  );
}

function resize(w: number, h: number): void {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 200 || h > 200) return;
  motifCommands.resize(w, h, `resize-${store.get().ui.motifId}`);
  store.ui({ selection: null });
}

/** A motif size field with − / + buttons. Typing in the field resizes from
 * the motif as it was until the field is left; each button press resizes the
 * motif as it is now, as its own undo step. */
function SizeStepper({ dimension, value, onChange }: { dimension: 'width' | 'height'; value: number; onChange: (value: number) => void }) {
  const [fewer, more] = dimension === 'width' ? ['Remove the right column', 'Add a column on the right'] : ['Remove the top row', 'Add a row at the top'];
  const step = (by: number) => {
    motifCommands.endResize();
    onChange(value + by);
  };
  return (
    <span class="stepper">
      <button class="btn small icon" aria-label={fewer} title={fewer} disabled={value <= 1} onClick={() => step(-1)}>
        −
      </button>
      <NumberField ariaLabel={`Motif ${dimension}`} value={value} min={1} max={200} onChange={onChange} onBlur={motifCommands.endResize} />
      <button class="btn small icon" aria-label={more} title={more} disabled={value >= 200} onClick={() => step(1)}>
        +
      </button>
    </span>
  );
}

function TilePreview({ s, motif, colors, colouring }: { s: AppState; motif: Motif; colors: MotifColors; colouring: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = M.width(motif.rows);
  const across = Math.max(3, Math.ceil(24 / Math.max(1, w)));
  const cell = Math.max(2, Math.min(16, Math.floor(320 / Math.max(1, w * across))));
  useLayoutEffect(() => {
    if (ref.current) paintMotif(ref.current, motif.rows, { cell, colors, grayscale: s.ui.grayscale, across, up: 2 });
  });
  return (
    <aside class="tile-preview" aria-label="Tiled preview">
      <h3>Tiled preview</h3>
      <label class="field">
        <span>Colours</span>
        <select aria-label="Colour the motif with" value={colouring ?? ''} onChange={(e) => store.ui({ motifColors: (e.currentTarget as HTMLSelectElement).value || null })}>
          <option value="">Black and white</option>
          {motif.mappings.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ? `${m.name} (${m.id})` : m.id}
            </option>
          ))}
        </select>
      </label>
      <canvas ref={ref} role="img" aria-label={`${across} by 2 repeats of the motif`} />
      <p class="small muted">
        {across} × 2 repeats, {colouring ? `coloured row by row with “${colouring}”` : 'in black and white with a red accent (not saved in the file)'}. Right-click draws background.
      </p>
    </aside>
  );
}
