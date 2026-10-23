import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { store, type AppState } from '../../state/store';
import {
  MARKER_STRIP,
  NUMBER_STRIP,
  cellAt,
  chartBitmap,
  currentTheme,
  drawChart,
  highlightFor,
  rowMarkers,
} from '../../render/chart';
import { prepare, useCanvasSize, useFrame, usePan, useZoomKeys, zoomAt, type View2D } from './canvas';

const MIN_CELL = 0.5;
const MAX_CELL = 60;

export function ChartView({ s }: { s: AppState }) {
  const shown = store.displayed();
  const analysis = store.analysis();
  const { hostRef, canvasRef, size } = useCanvasSize();
  const [view, setView] = useState<View2D | null>(null);
  const [hover, setHover] = useState<{ row: number; stitch: number; color: string } | null>(null);
  const fittedFor = useRef('');

  const chart = shown?.chart ?? null;
  const doc = shown?.doc ?? s.doc;
  const bitmap = useMemo(() => (chart ? chartBitmap(chart, doc, s.ui.grayscale) : null), [chart, s.ui.grayscale, doc.palette]);

  const fit = (): View2D | null => {
    if (!chart || !size.width) return null;
    const availW = size.width - NUMBER_STRIP - MARKER_STRIP - 24;
    const availH = size.height - NUMBER_STRIP - 24;
    const cell = Math.max(MIN_CELL, Math.min(32, availW / Math.max(1, chart.width), availH / Math.max(1, chart.height)));
    const cw = chart.width * cell;
    const ch = chart.height * cell;
    return { scale: cell, ox: Math.max(12, (availW - cw) / 2 + 12), oy: Math.max(12, (availH - ch) / 2 + 12) };
  };

  // Fit when the chart's size changes (or on first show).
  useEffect(() => {
    if (!chart || !size.width) return;
    const key = `${chart.width}x${chart.height}`;
    if (fittedFor.current !== key || !view) {
      fittedFor.current = key;
      setView(fit());
    }
  }, [chart?.width, chart?.height, size.width, size.height]);

  // Bring a selected issue's row into view.
  useEffect(() => {
    const row = s.ui.issue?.location.row;
    if (!chart || !view || row === undefined || !size.height) return;
    const top = view.oy + (chart.height - row) * view.scale;
    if (top < 0 || top > size.height - NUMBER_STRIP - view.scale) {
      setView({ ...view, oy: size.height / 2 - (chart.height - row) * view.scale });
    }
  }, [s.ui.issue]);

  useZoomKeys((kind) => {
    if (!view) return;
    if (kind === 'fit') setView(fit());
    else setView(zoomAt(view, kind === 'in' ? 1.25 : 0.8, size.width / 2, size.height / 2, MIN_CELL, MAX_CELL));
  });

  const pan = usePan((dx, dy) => setView((v) => (v ? { ...v, ox: v.ox + dx, oy: v.oy + dy } : v)));

  useFrame(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !chart || !bitmap || !view) return;
    const ctx = prepare(canvas, size.width, size.height);
    drawChart(ctx, {
      chart,
      doc,
      bitmap,
      theme: currentTheme(),
      cell: view.scale,
      ox: view.ox,
      oy: view.oy,
      width: size.width,
      height: size.height,
      highlight: shown?.stale ? null : highlightFor(s.ui.issue, chart),
      markers: shown?.stale ? undefined : rowMarkers(analysis.issues, chart.height),
      stickyNumbers: true,
    });
  }, [chart, bitmap, view, size.width, size.height, s.ui.issue, analysis, shown?.stale]);

  const onWheel = (e: WheelEvent) => {
    if (!view) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
      setView(zoomAt(view, factor, e.clientX - rect.left, e.clientY - rect.top, MIN_CELL, MAX_CELL));
    } else {
      setView({ ...view, ox: view.ox - e.deltaX });
    }
  };

  const onMove = (e: PointerEvent) => {
    pan.onPointerMove(e);
    if (!chart || !view) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const c = cellAt(e.clientX - rect.left, e.clientY - rect.top, { cell: view.scale, ox: view.ox, oy: view.oy, chart });
    if (!c) return setHover(null);
    const id = chart.palette[chart.cells[c.y * chart.width + c.x]];
    const color = doc.palette.find((p) => p.id === id);
    setHover({ row: c.row, stitch: c.stitch, color: color?.name ? `${color.name} (${id})` : id });
  };

  if (!shown) {
    return (
      <div class="panel">
        <div class="empty">
          {analysis.errors ? 'Fix the errors in the issues panel to see the chart.' : 'Add a band to see the chart.'}
        </div>
      </div>
    );
  }

  return (
    <div class="canvas-host" ref={hostRef}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Chart, ${chart!.width} stitches by ${chart!.height} rows. Rows are numbered from the bottom, stitches from the right.`}
        style={{ cursor: pan.dragging() ? 'grabbing' : 'grab' }}
        onWheel={onWheel}
        onPointerDown={pan.onPointerDown}
        onPointerMove={onMove}
        onPointerUp={pan.onPointerUp}
        onPointerCancel={pan.onPointerCancel}
        onPointerLeave={() => setHover(null)}
        onDblClick={() => setView(fit())}
      />
      {shown.stale && <div class="stale">Showing the last valid chart: the pattern has errors</div>}
      <div class="hud">
        {hover ? `Row ${hover.row} · stitch ${hover.stitch} · ${hover.color}` : `${chart!.width} stitches × ${chart!.height} rows · scroll to zoom, drag to pan`}
      </div>
    </div>
  );
}
