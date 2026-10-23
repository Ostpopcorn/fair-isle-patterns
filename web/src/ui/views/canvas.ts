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

/** Whether the main pointer is a finger rather than a mouse. */
export function isTouch(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
}

/**
 * One-finger (or mouse) dragging and two-finger pinching. Pinch reports the
 * scale change and its centre relative to the element, and pans with the
 * centre as it moves. Returns pointer handlers for the element.
 */
export function useGestures(handlers: {
  onPan?: (dx: number, dy: number) => void;
  onPinch?: (factor: number, cx: number, cy: number) => void;
}) {
  const latest = useRef(handlers);
  latest.current = handlers;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pinch.current = null;
    },
    onPointerMove: (e: PointerEvent) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 1) {
        latest.current.onPan?.(e.clientX - prev.x, e.clientY - prev.y);
        return;
      }
      const [a, b] = [...pointers.current.values()];
      const rect = (e.currentTarget as Element).getBoundingClientRect();
      const now = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2 - rect.left, cy: (a.y + b.y) / 2 - rect.top };
      const last = pinch.current;
      if (last && last.dist > 0) {
        latest.current.onPinch?.(now.dist / last.dist, now.cx, now.cy);
        latest.current.onPan?.(now.cx - last.cx, now.cy - last.cy);
      }
      pinch.current = now;
    },
    onPointerUp: (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      pinch.current = null;
    },
    onPointerCancel: (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      pinch.current = null;
    },
    dragging: () => pointers.current.size > 0,
  };
}
