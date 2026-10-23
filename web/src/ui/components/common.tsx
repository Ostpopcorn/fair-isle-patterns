import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Mapping, PaletteColor, PatternDoc } from '../../core/types';
import { displayHex, displayRgb } from '../../model/color';

/** A text input bound to the document. Typing in one field is one undo step. */
export function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  mono?: boolean;
}) {
  const Tag = props.multiline ? 'textarea' : 'input';
  return (
    <label class="field">
      <span>{props.label}</span>
      <Tag
        type="text"
        class={props.mono ? 'mono' : undefined}
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onInput={(e) => props.onChange((e.currentTarget as HTMLInputElement).value)}
      />
    </label>
  );
}

/** A number input that tolerates intermediate text ("", "-") while typing
 * and reports only finite numbers. */
export function NumberField(props: {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  ariaLabel?: string;
  width?: string;
}) {
  const [text, setText] = useState(String(props.value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current || Number(text) !== props.value) setText(String(props.value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);
  const input = (
    <input
      type="number"
      value={text}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      disabled={props.disabled}
      aria-label={props.ariaLabel ?? props.label}
      style={props.width ? { width: props.width } : undefined}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(String(props.value));
      }}
      onInput={(e) => {
        const raw = (e.currentTarget as HTMLInputElement).value;
        setText(raw);
        const n = Number(raw);
        if (raw.trim() !== '' && Number.isFinite(n)) props.onChange(n);
      }}
    />
  );
  if (!props.label) return input;
  return (
    <label class="field">
      <span>{props.label}</span>
      {input}
    </label>
  );
}

export function Swatch(props: { hex: string; grayscale?: boolean; title?: string; size?: number }) {
  const size = props.size ?? 18;
  return (
    <span
      class="swatch"
      title={props.title}
      style={{ background: displayHex(props.hex, props.grayscale ?? false), width: `${size}px`, height: `${size}px` }}
    />
  );
}

/** A palette colour picker: a native select with a swatch beside it. */
export function ColorSelect(props: {
  palette: PaletteColor[];
  value: string | null;
  onChange: (id: string | null) => void;
  label: string;
  allowNone?: boolean;
  grayscale?: boolean;
  /** A visible role label, shown where the column headers are hidden. */
  tag?: string;
}) {
  const current = props.palette.find((c) => c.id === props.value);
  const unknown = props.value !== null && !current;
  return (
    <span class="color-select">
      {props.tag && (
        <span class="tag only-mobile" aria-hidden="true">
          {props.tag}
        </span>
      )}
      {current ? <Swatch hex={current.hex} grayscale={props.grayscale} /> : <span class="swatch" style={{ background: 'transparent', borderStyle: 'dashed' }} />}
      <select
        aria-label={props.label}
        title={props.label}
        value={props.value ?? ''}
        onChange={(e) => {
          const v = (e.currentTarget as HTMLSelectElement).value;
          props.onChange(v === '' ? null : v);
        }}
      >
        {props.allowNone && <option value="">— none</option>}
        {unknown && <option value={props.value!}>{props.value} (missing)</option>}
        {props.palette.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name ? `${c.name} (${c.id})` : c.id}
          </option>
        ))}
      </select>
    </span>
  );
}

export function Modal(props: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(
      '[autofocus], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    return () => previous?.focus?.();
  }, []);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      props.onClose();
    }
    if (e.key === 'Tab' && ref.current) {
      const focusable = [...ref.current.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter(
        (el) => !el.hasAttribute('disabled'),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  return (
    <div class="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class={`dialog${props.wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={props.title} ref={ref} onKeyDown={onKey}>
        <div class="dialog-head">
          <h2>{props.title}</h2>
          <button class="btn ghost icon" aria-label="Close" onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div class="dialog-body">{props.children}</div>
        {props.footer && <div class="dialog-foot">{props.footer}</div>}
      </div>
    </div>
  );
}

const SYMBOL_VARS = ['--sym-bg', '--sym-fg', '--sym-accent'];

export function symbolColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  return SYMBOL_VARS.map((v) => style.getPropertyValue(v).trim() || '#888');
}

/** Paints motif rows on a canvas: with a mapping's colours (cycling its rows)
 * or with neutral symbol colours. Tiles `across` × `up` repeats. */
export function paintMotif(
  canvas: HTMLCanvasElement,
  rows: string[],
  options: { cell: number; mapping?: Mapping; doc?: PatternDoc; grayscale?: boolean; across?: number; up?: number },
): void {
  const w = rows[0]?.length ?? 0;
  const h = rows.length;
  const across = options.across ?? 1;
  const up = options.up ?? 1;
  const cell = options.cell;
  canvas.width = Math.max(1, w * across * cell);
  canvas.height = Math.max(1, h * up * cell);
  const ctx = canvas.getContext('2d');
  if (!ctx || !w || !h) return;
  const neutral = symbolColors();
  const hexOf = (id: string | undefined) => options.doc?.palette.find((c) => c.id === id)?.hex;
  for (let j = 0; j < h * up; j++) {
    const r = j % h;
    const mrow = options.mapping?.rows.length ? options.mapping.rows[j % options.mapping.rows.length] : null;
    const screenY = (h * up - 1 - j) * cell;
    for (let x = 0; x < w * across; x++) {
      const s = Number(rows[r][x % w]);
      let color: string;
      if (mrow) {
        const hex = hexOf(mrow[s] ?? mrow[1]);
        const [cr, cg, cb] = displayRgb(hex ?? '#ff00ff', options.grayscale ?? false);
        color = `rgb(${cr},${cg},${cb})`;
      } else {
        color = neutral[s] ?? '#f0f';
      }
      ctx.fillStyle = color;
      ctx.fillRect(x * cell, screenY, cell, cell);
    }
  }
}

export function MotifThumb(props: {
  rows: string[];
  maxSize?: number;
  mapping?: Mapping;
  doc?: PatternDoc;
  grayscale?: boolean;
  across?: number;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const max = props.maxSize ?? 40;
  const w = (props.rows[0]?.length ?? 1) * (props.across ?? 1);
  const h = props.rows.length || 1;
  const cell = Math.max(1, Math.floor(max / Math.max(w, h)));
  useLayoutEffect(() => {
    if (ref.current) paintMotif(ref.current, props.rows, { cell, mapping: props.mapping, doc: props.doc, grayscale: props.grayscale, across: props.across });
  });
  return <canvas ref={ref} class="thumb" role="img" aria-label={props.label ?? 'Motif preview'} style={{ width: `${w * cell}px`, maxWidth: '100%', height: 'auto', aspectRatio: `${w} / ${h}` }} />;
}

export function Badge(props: { severity: 'error' | 'warning' | 'notice'; count: number }) {
  if (!props.count) return null;
  const icon = props.severity === 'error' ? '✖' : props.severity === 'warning' ? '▲' : '•';
  return (
    <span class={`badge ${props.severity}`} title={`${props.count} ${props.severity}${props.count > 1 ? 's' : ''}`}>
      {icon} {props.count}
    </span>
  );
}
