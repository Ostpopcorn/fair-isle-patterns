// The UI's only door to the Rust core. Every function is pure and
// synchronous once the WASM module is loaded.

import init, * as wasm from './pkg/fairisle_core.js';
import type { AnyDoc, CompiledChart, Issue, ParseResult, PatternDoc, StitchLayout } from './types';

export * from './types';

let loading: Promise<void> | null = null;
let loaded = false;

/** Loads the WASM module. In the browser it is fetched next to the bundle;
 * tests pass the bytes directly. */
export function initCore(bytes?: BufferSource): Promise<void> {
  if (bytes) {
    wasm.initSync({ module: bytes });
    loaded = true;
    return Promise.resolve();
  }
  loading ??= init().then(() => {
    loaded = true;
  });
  return loading;
}

function ensure(): void {
  if (!loaded) throw new Error('The core is not loaded yet; await initCore() first.');
}

export function parse(text: string): ParseResult {
  ensure();
  return wasm.parse(text) as ParseResult;
}

/** Canonical file text. Throws only for structurally broken documents. */
export function serialize(doc: AnyDoc): string {
  ensure();
  return wasm.serialize(doc);
}

export function validate(doc: AnyDoc): Issue[] {
  ensure();
  return wasm.validate(doc) as Issue[];
}

/** The compiled chart, or null when the document has errors. */
export function compile(doc: PatternDoc): CompiledChart | null {
  ensure();
  return wasm.compile(doc) as CompiledChart | null;
}

export function layout(doc: PatternDoc): StitchLayout | null {
  ensure();
  return wasm.layout(doc) as StitchLayout | null;
}

/** Up to two cast-on values that fit every band (W103). */
export function suggestCastOn(doc: PatternDoc): number[] {
  ensure();
  return Array.from(wasm.suggest_cast_on(doc));
}
