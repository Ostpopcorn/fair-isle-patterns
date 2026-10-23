import { useEffect, useRef, useState } from 'preact/hooks';
import { zoomBus } from '../shortcuts';

/** Tracks the size of a host element and keeps a DPR-scaled canvas in it. */
export function useCanvasSize() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => setSize({ width: host.clientWidth, height: host.clientHeight }));
    ro.observe(host);
    return () => ro.disconnect();
  }, []);
  return { hostRef, canvasRef, size };
}

/** A 2D context sized for the device pixel ratio, drawing in CSS pixels. */
export function prepare(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(width * dpr));
  const h = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Redraws at most once per animation frame. */
export function useFrame(draw: () => void, deps: unknown[]): void {
  const latest = useRef(draw);
  latest.current = draw;
  useEffect(() => {
    const id = requestAnimationFrame(() => latest.current());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Keyboard zoom requests ("in", "out", "fit") for the active view. */
export function useZoomKeys(handler: (kind: 'in' | 'out' | 'fit') => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const on = (e: Event) => latest.current((e as CustomEvent).detail);
    zoomBus.addEventListener('zoom', on);
    return () => zoomBus.removeEventListener('zoom', on);
  }, []);
}

export interface View2D {
  scale: number;
  ox: number;
  oy: number;
}

/** Zooms by `factor` keeping the point (mx, my) still. */
export function zoomAt(v: View2D, factor: number, mx: number, my: number, min: number, max: number): View2D {
  const scale = Math.max(min, Math.min(max, v.scale * factor));
  const k = scale / v.scale;
  return { scale, ox: mx - (mx - v.ox) * k, oy: my - (my - v.oy) * k };
}

/** Pointer-drag panning; returns handlers for the canvas. */
export function usePan(onPan: (dx: number, dy: number) => void) {
  const last = useRef<{ x: number; y: number; id: number } | null>(null);
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      last.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    },
    onPointerMove: (e: PointerEvent) => {
      const l = last.current;
      if (!l || l.id !== e.pointerId) return;
      onPan(e.clientX - l.x, e.clientY - l.y);
      last.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    },
    onPointerUp: () => (last.current = null),
    onPointerCancel: () => (last.current = null),
    dragging: () => last.current !== null,
  };
}
