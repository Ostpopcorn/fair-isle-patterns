import { useRef, useState } from 'preact/hooks';
import { store, type AppState } from '../../state/store';
import { currentTheme } from '../../render/chart';
import { drawRound } from '../../render/round';
import { findMotif } from '../../model/doc';
import { prepare, useCanvasSize, useFrame, useZoomKeys } from './canvas';

const TURN = Math.PI * 2;

export function RoundView({ s }: { s: AppState }) {
  const shown = store.displayed();
  const { hostRef, canvasRef, size } = useCanvasSize();
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; rotation: number } | null>(null);
  const chart = shown?.chart ?? null;
  const doc = shown?.doc ?? s.doc;
  const layout = chart ? store.layoutOf(doc, chart) : null;

  const circumference = chart && layout ? chart.width * layout.stitchWidth : 0;
  const tall = chart && layout ? chart.height * layout.rowHeight : 0;
  const diameter = circumference / Math.PI;
  const fitScale = size.width && diameter ? Math.min((size.width - 60) / diameter, (size.height - 70) / Math.max(tall, 1)) : 1;
  const scale = Math.max(0.5, fitScale * zoom);

  useZoomKeys((kind) => setZoom((z) => (kind === 'fit' ? 1 : kind === 'in' ? Math.min(8, z * 1.25) : Math.max(0.2, z / 1.25))));

  useFrame(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chart || !layout || !size.width) return;
    const ctx = prepare(canvas, size.width, size.height);
    drawRound(ctx, {
      chart,
      doc,
      layout,
      grayscale: s.ui.grayscale,
      theme: currentTheme(),
      rotation,
      scale,
      cx: size.width / 2,
      bottom: size.height / 2 + (tall * scale) / 2 + 10,
      width: size.width,
      height: size.height,
    });
  }, [chart, layout, size.width, size.height, s.ui.grayscale, rotation, scale]);

  if (!shown || !chart || !layout) {
    return (
      <div class="panel">
        <div class="empty">The in-the-round preview appears once the pattern compiles.</div>
      </div>
    );
  }

  // One repeat of the widest band's motif, for the step buttons.
  const widths = doc.bands.map((b) => findMotif(doc, b.motif)?.rows[0]?.length ?? 1);
  const repeat = Math.max(1, ...widths);
  const step = (TURN * Math.min(repeat, chart.width)) / chart.width;
  const degrees = Math.round(((((rotation / TURN) % 1) + 1) % 1) * 360);
  const radiusPx = (circumference / TURN) * scale;

  return (
    <div class="canvas-host" ref={hostRef}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`The pattern as worn: front half of a tube ${circumference.toFixed(1)} cm around, turned ${degrees} degrees`}
        style={{ cursor: 'ew-resize' }}
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, rotation };
        }}
        onPointerMove={(e) => {
          if (!drag.current || radiusPx <= 0) return;
          // Dragging moves the fabric under the pointer, like turning the tube.
          setRotation(drag.current.rotation + (e.clientX - drag.current.x) / radiusPx);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => {
          e.preventDefault();
          setZoom((z) => Math.max(0.2, Math.min(8, z * Math.exp(-e.deltaY * 0.0018))));
        }}
      />
      {shown.stale && <div class="stale">Showing the last valid chart: the pattern has errors</div>}
      <div class="hud" style={{ pointerEvents: 'auto' }}>
        <div class="row small wrap">
          <button class="btn small" onClick={() => setRotation(rotation - step)} title="Turn by one motif repeat">
            ◀ repeat
          </button>
          <label class="row">
            <span class="sr-only">Rotation</span>
            <input
              type="range"
              min={0}
              max={359}
              value={degrees}
              aria-label="Rotation in degrees"
              onInput={(e) => setRotation((Number((e.currentTarget as HTMLInputElement).value) / 360) * TURN)}
            />
            <span class="mono">{degrees}°</span>
          </label>
          <button class="btn small" onClick={() => setRotation(rotation + step)} title="Turn by one motif repeat">
            repeat ▶
          </button>
          <button class="btn small" onClick={() => setRotation(Math.PI)} title="Turn the beginning of the round to the front">
            Show seam
          </button>
          <span class="muted">
            {circumference.toFixed(1)} cm around · drag to turn
          </span>
        </div>
      </div>
    </div>
  );
}
