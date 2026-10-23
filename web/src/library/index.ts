// The built-in starter library (library/ at the repository root), bundled
// into the app so it works offline.

import { parse } from '../core';
import type { LibraryDoc } from '../core/types';

const files = import.meta.glob('../../../library/*.fairisle-library.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface BuiltinLibrary {
  file: string;
  doc: LibraryDoc;
}

let cache: BuiltinLibrary[] | null = null;

/** Parsed on first use (the core must be loaded). */
export function builtinLibraries(): BuiltinLibrary[] {
  cache ??= Object.entries(files)
    .map(([path, text]) => ({ file: path.split('/').pop()!, doc: parse(text).doc as LibraryDoc | null }))
    .filter((l): l is BuiltinLibrary => l.doc !== null && l.doc.format === 'fairisle-library')
    .sort((a, b) => order(a.file) - order(b.file));
  return cache;
}

const ORDER = ['peeries', 'oxo-stars', 'neutral'];
function order(file: string): number {
  const i = ORDER.findIndex((name) => file.startsWith(name));
  return i < 0 ? ORDER.length : i;
}
