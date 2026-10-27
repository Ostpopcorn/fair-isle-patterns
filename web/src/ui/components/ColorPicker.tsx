// A colour picker for palette colours: a wheel of hue and saturation drawn
// at the current lightness, a lightness slider, preset yarn colours, and RGB
// and HSL fields. The value is a #rrggbb hex.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { hslToRgb, lightness, parseHex, rgbToHsl, toHex, type HSL, type RGB } from '../../model/color';
import { NumberField } from './common';

export interface Preset {
  hex: string;
  name: string;
}

/** The wheel's size in CSS pixels. */
const WHEEL = 160;

/** Hue at an offset from the wheel's centre: 0 (red) at the top, clockwise. */
function hueAt(dx: number, dy: number): number {
  return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
}

/** The HSL of `hex`. `previous` is kept when it already gives `hex`, so the
 * wheel does not jump while dragging, and its hue is kept for grays, whose
 * hue is undefined. */
function hslOf(hex: string, previous: HSL | null): HSL {
  const rgb = parseHex(hex);
  if (!rgb) return previous ?? [0, 0, 50];
  if (previous && toHex(hslToRgb(previous)) === hex.toLowerCase()) return previous;
  const next = rgbToHsl(rgb);
  return next[1] === 0 && previous ? [previous[0], 0, next[2]] : next;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function ColorPicker(props: {
  value: string;
  onChange: (hex: string) => void;
  /** Called at the end of each gesture, so the next one is a new undo step. */
  onCommit: () => void;
  onClose: () => void;
  presets: readonly Preset[];
  /** Names the colour for assistive technology. */
  label: string;
}) {
  const [hsl, setHsl] = useState<HSL>(() => hslOf(props.value, null));
  // Follow changes made elsewhere: the hex field, undo.
  useEffect(() => setHsl((h) => hslOf(props.value, h)), [props.value]);
  const [h, s, l] = hsl;
  const rgb = hslToRgb(hsl);
  const hex = toHex(rgb);

  const set = (next: HSL) => {
    setHsl(next);
    const nextHex = toHex(hslToRgb(next));
    if (nextHex !== props.value.toLowerCase()) props.onChange(nextHex);
  };
  const setRgb = (next: RGB) => set(hslOf(toHex(next), hsl));

  // The wheel shows the colours at the current lightness, so what is under
  // the pointer is what you get.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wheelL = Math.round(l);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const n = Math.round(WHEEL * Math.min(2, window.devicePixelRatio || 1));
    canvas.width = n;
    canvas.height = n;
    const image = ctx.createImageData(n, n);
    const r = n / 2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = x + 0.5 - r;
        const dy = y + 0.5 - r;
        const d = Math.hypot(dx, dy);
        if (d > r + 0.5) continue;
        const [cr, cg, cb] = hslToRgb([hueAt(dx, dy), Math.min(1, d / r) * 100, wheelL]);
        const i = (y * n + x) * 4;
        image.data[i] = cr;
        image.data[i + 1] = cg;
        image.data[i + 2] = cb;
        // Soften the edge.
        image.data[i + 3] = Math.round(255 * clamp(r + 0.5 - d, 0, 1));
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [wheelL]);

  const dragging = useRef(false);
  const pick = (e: PointerEvent, start: boolean): void => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const r = rect.width / 2;
    const dx = e.clientX - rect.left - r;
    const dy = e.clientY - rect.top - r;
    // A press in a corner outside the wheel picks nothing.
    if (start && Math.hypot(dx, dy) > r + 2) return;
    if (start) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragging.current = true;
    }
    set([hueAt(dx, dy), Math.min(1, Math.hypot(dx, dy) / r) * 100, l]);
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    props.onCommit();
  };

  const radius = (s / 100) * (WHEEL / 2);
  const markerX = WHEEL / 2 + Math.sin((h * Math.PI) / 180) * radius;
  const markerY = WHEEL / 2 - Math.cos((h * Math.PI) / 180) * radius;
  const pure = toHex(hslToRgb([h, s, 50]));

  return (
    <div class="color-picker" role="group" aria-label={props.label}>
      <div
        class="wheel"
        style={{ width: `${WHEEL}px`, height: `${WHEEL}px` }}
        title="Drag to pick hue (around) and saturation (out from the centre)"
        onPointerDown={(e) => pick(e, true)}
        onPointerMove={(e) => dragging.current && pick(e, false)}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
        <span class="wheel-marker" style={{ left: `${markerX}px`, top: `${markerY}px`, background: hex }} />
      </div>
      <div class="color-picker-side">
        <span class="small muted">Presets</span>
        <div class="presets" role="group" aria-label="Preset colours">
          {props.presets.map((p) => (
            <button
              key={p.hex + p.name}
              class="preset"
              style={{ background: p.hex }}
              title={`${p.name} (${p.hex})`}
              aria-label={p.name}
              aria-pressed={p.hex.toLowerCase() === hex}
              onClick={() => {
                set(hslOf(p.hex, hsl));
                props.onCommit();
              }}
            />
          ))}
        </div>
        <span class="small muted" title="CIELAB L*, the lightness the contrast check compares">
          Lightness L* {Math.round(lightness(rgb))}
        </span>
      </div>
      <label class="field wide">
        <span>Lightness</span>
        <input
          type="range"
          class="lightness"
          min={0}
          max={100}
          step={1}
          value={Math.round(l)}
          style={{ background: `linear-gradient(to right, #000, ${pure}, #fff)` }}
          onInput={(e) => set([h, s, Number((e.currentTarget as HTMLInputElement).value)])}
          onChange={props.onCommit}
        />
      </label>
      <div class="grid3 wide">
        {(['R', 'G', 'B'] as const).map((name, i) => (
          <NumberField
            key={name}
            label={name}
            value={rgb[i]}
            min={0}
            max={255}
            onChange={(v) => setRgb(rgb.map((c, j) => (j === i ? Math.round(clamp(v, 0, 255)) : c)) as RGB)}
            onBlur={props.onCommit}
          />
        ))}
      </div>
      <div class="grid3 wide">
        <NumberField label="H (°)" value={Math.round(h)} min={0} max={360} onChange={(v) => set([((v % 360) + 360) % 360, s, l])} onBlur={props.onCommit} />
        <NumberField label="S (%)" value={Math.round(s)} min={0} max={100} onChange={(v) => set([h, clamp(v, 0, 100), l])} onBlur={props.onCommit} />
        <NumberField label="L (%)" value={Math.round(l)} min={0} max={100} onChange={(v) => set([h, s, clamp(v, 0, 100)])} onBlur={props.onCommit} />
      </div>
      <div class="row wide">
        <span class="spacer" />
        <button class="btn small" onClick={props.onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
