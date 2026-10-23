import { useEffect, useRef, useState } from 'preact/hooks';
import { store, type AppState } from '../../state/store';
import { currentTheme } from '../../render/chart';
import { RULER, drawGauge, physicalSize } from '../../render/gauge';
import { prepare, useCanvasSize, useFrame, useGestures, useZoomKeys, zoomAt, type View2D } from './canvas';
import { ZoomControls } from './ZoomControls';

export function GaugeView({ s }: { s: AppState }) {
  const shown = store.displayed();
  const { hostRef, canvasRef, size } = useCanvasSize();
  const [view, setView] = useState<View2D | null>(null);
  const [square, setSquare] = useState(true);
  const fittedFor = useRef('');
  const chart = shown?.chart ?? null;
  const doc = shown?.doc ?? s.doc;
  const layout = chart ? store.layoutOf(doc, chart) : null;
  const physical = layout && chart ? physicalSize(layout, chart) : null;

  const fit = (): View2D | null => {
    if (!physical || !size.width) return null;
    const scale = Math.max(1, Math.min(80, (size.width - RULER - 40) / physical.width, (size.height - RULER - 40) / physical.height));
    // Bottom-left corner of the knitting; centred vertically when it is short.
    const oy = Math.min(size.height - RULER - 12, (size.height + physical.height * scale) / 2);
    return { scale, ox: RULER + 20, oy };
  };

  useEffect(() => {
    if (!physical || !size.width) return;
    const key = `${physical.width}x${physical.height}`;
    if (fittedFor.current !== key || !view) {
      fittedFor.current = key;
      setView(fit());
    }
  }, [physical?.width, physical?.height, size.width, size.height]);

  useZoomKeys((kind) => {
    if (!view) return;
    if (kind === 'fit') setView(fit());
    else setView(zoomAt(view, kind === 'in' ? 1.25 : 0.8, size.width / 2, size.height / 2, 1, 200));
  });

  const pan = useGestures({
    onPan: (dx, dy) => setView((v) => (v ? { ...v, ox: v.ox + dx, oy: v.oy + dy } : v)),
    onPinch: (factor, cx, cy) => setView((v) => (v ? zoomAt(v, factor, cx, cy, 1, 200) : v)),
  });

  useFrame(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chart || !layout || !view || !size.width) return;
    const ctx = prepare(canvas, size.width, size.height);
    drawGauge(ctx, {
      chart,
      doc,
      layout,
      grayscale: s.ui.grayscale,
      theme: currentTheme(),
      scale: view.scale,
      ox: view.ox,
      oy: view.oy,
      width: size.width,
      height: size.height,
      showSquare: square,
    });
  }, [chart, layout, view, size.width, size.height, s.ui.grayscale, square]);

  if (!shown || !layout || !physical) {
    return (
      <div class="panel">
        <div class="empty">The gauge preview appears once the pattern compiles.</div>
      </div>
    );
  }

  const g = doc.gauge;
  return (
    <div class="canvas-host" ref={hostRef}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Gauge preview, ${physical.width.toFixed(1)} by ${physical.height.toFixed(1)} centimetres`}
        style={{ cursor: 'grab' }}
        onWheel={(e) => {
          if (!view) return;
          e.preventDefault();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setView(zoomAt(view, Math.exp(-e.deltaY * 0.0018), e.clientX - rect.left, e.clientY - rect.top, 1, 200));
        }}
        onPointerDown={pan.onPointerDown}
        onPointerMove={pan.onPointerMove}
        onPointerUp={pan.onPointerUp}
        onPointerCancel={pan.onPointerCancel}
        onDblClick={() => setView(fit())}
      />
      {shown.stale && <div class="stale">Showing the last valid chart: the pattern has errors</div>}
      <ZoomControls />
      <div class="hud gauge-hud" style={{ left: `${RULER + 12}px` }}>
        {physical.width.toFixed(1)} × {physical.height.toFixed(1)} cm · {g.stitches} stitches × {g.rows} rows per {g.per_cm} cm ·{' '}
        <label class="check">
          <input type="checkbox" checked={square} onChange={() => setSquare(!square)} /> 10 cm square
        </label>
      </div>
    </div>
  );
}
