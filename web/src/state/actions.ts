// User-level actions that combine the store, the core and files.

import { parse, serialize } from '../core';
import type { LibraryDoc, PatternDoc } from '../core/types';
import { newPattern } from '../model/doc';
import { fileNameFor, openFile, readHandle, saveFileAs, supportsFileSystemAccess, writeHandle } from './files';
import { saveNow, type Session } from './persistence';
import { loadPrefs } from './prefs';
import { store, type FileRef } from './store';
import exampleText from '../../../fixtures/hat-basic/input.fairisle.json?raw';

export function toast(message: string): void {
  store.ui({ toast: message });
}

function fail(title: string, error: unknown): void {
  store.ui({ dialog: { kind: 'message', title, body: error instanceof Error ? error.message : String(error) } });
}

/** Whether text is a pattern saved before colour mappings moved into their
 * motifs: a top-level mappings list and motifs without their own. Such files
 * are not converted; they are reported clearly instead. */
export function isOldFormat(text: string): boolean {
  try {
    const v = JSON.parse(text) as { mappings?: unknown; motifs?: unknown };
    return Array.isArray(v.mappings) && Array.isArray(v.motifs) && v.motifs.some((m) => m && typeof m === 'object' && !('mappings' in m));
  } catch {
    return false;
  }
}

export const OLD_FORMAT_MESSAGE =
  'It was saved by an earlier version of the app, before colour mappings moved into their motifs, and this version cannot open it. Start a new pattern, or open another file.';

/** Opens file text as a pattern, or a library in the library browser. */
export function openText(text: string, file: FileRef | null, sessionId?: string, savedText?: string | null): boolean {
  const result = parse(text);
  if (!result.doc && isOldFormat(text)) {
    store.ui({ dialog: { kind: 'message', title: `Cannot open ${file?.name ?? 'this pattern'}`, body: OLD_FORMAT_MESSAGE } });
    return false;
  }
  if (!result.doc) {
    store.ui({
      dialog: {
        kind: 'message',
        title: `Cannot open ${file?.name ?? 'this file'}`,
        body: 'The file is not a readable fair isle pattern:',
        issues: result.issues,
      },
    });
    return false;
  }
  if (result.doc.format === 'fairisle-library') {
    store.ui({ dialog: { kind: 'library', source: result.doc as LibraryDoc, fileName: file?.name } });
    return false;
  }
  const doc = result.doc as PatternDoc;
  store.load(doc, {
    readOnly: result.readOnly,
    file,
    // A document that did not come from a file has never been saved.
    savedText: savedText === undefined ? (file ? serialize(doc) : null) : savedText,
    sessionId,
  });
  const errors = result.issues.filter((i) => i.severity === 'error').length;
  if (errors) toast(`The file opened with ${errors} error${errors > 1 ? 's' : ''}; see the issues panel.`);
  saveNow(store);
  return true;
}

export async function openFileAction(): Promise<void> {
  try {
    const opened = await openFile();
    if (opened) openText(opened.text, { name: opened.name, handle: opened.handle });
  } catch (e) {
    fail('Could not open the file', e);
  }
}

export function newPatternAction(): void {
  store.load(newPattern(loadPrefs().settings));
  store.ui({ panel: 'bands', view: 'chart', screen: 'bands' });
  saveNow(store);
}

export function openExample(): void {
  openText(exampleText, null);
}

export async function saveAs(): Promise<void> {
  const s = store.get();
  if (s.readOnly) {
    toast('This file is read-only: it was written by a newer version of the app.');
    return;
  }
  try {
    const text = store.text();
    const result = await saveFileAs(s.file?.name ?? fileNameFor(s.doc.meta.name), text);
    if (!result) return;
    store.patch({ file: result, savedText: text });
    toast(result.handle ? `Saved ${result.name}` : `Downloaded ${result.name}`);
    saveNow(store);
  } catch (e) {
    fail('Could not save the file', e);
  }
}

export async function save(): Promise<void> {
  const s = store.get();
  if (s.readOnly) {
    toast('This file is read-only: it was written by a newer version of the app.');
    return;
  }
  if (!s.file?.handle || !supportsFileSystemAccess()) return saveAs();
  try {
    const text = store.text();
    if (!(await writeHandle(s.file.handle, text))) return saveAs();
    store.patch({ savedText: text });
    toast(`Saved ${s.file.name}`);
    saveNow(store);
  } catch (e) {
    fail('Could not save the file', e);
  }
}

export async function restoreSession(session: Session, reopenFile = false): Promise<void> {
  if (reopenFile && session.handle) {
    try {
      const opened = await readHandle(session.handle);
      openText(opened.text, { name: opened.name, handle: opened.handle }, session.id);
      return;
    } catch {
      toast('The file could not be reopened; restoring the autosaved copy instead.');
    }
  }
  const file = session.fileName ? { name: session.fileName, handle: session.handle } : null;
  if (openText(session.text, file, session.id, session.savedText)) store.ui({ dialog: null });
}

export async function importLibraryFile(): Promise<void> {
  try {
    const opened = await openFile();
    if (!opened) return;
    const result = parse(opened.text);
    if (!result.doc || result.doc.format !== 'fairisle-library') {
      store.ui({
        dialog: {
          kind: 'message',
          title: `${opened.name} is not a library file`,
          body: result.doc
            ? 'Library files have "format": "fairisle-library". Use Open to open a pattern.'
            : 'The file could not be read:',
          issues: result.doc ? undefined : result.issues,
        },
      });
      return;
    }
    store.ui({ dialog: { kind: 'library', source: result.doc as LibraryDoc, fileName: opened.name } });
  } catch (e) {
    fail('Could not open the file', e);
  }
}
