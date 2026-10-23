// Opening and saving real files: the File System Access API on Chromium
// (save writes back in place), upload and download elsewhere.

interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}

interface FsaWindow {
  showOpenFilePicker(options: { types?: PickerType[]; multiple?: boolean }): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options: { suggestedName?: string; types?: PickerType[] }): Promise<FileSystemFileHandle>;
}

interface WritableHandle {
  createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>;
  queryPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
}

export const PATTERN_EXTENSION = '.fairisle.json';
export const LIBRARY_EXTENSION = '.fairisle-library.json';

const JSON_TYPES: PickerType[] = [{ description: 'Fair isle pattern or library', accept: { 'application/json': ['.json'] } }];

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
}

function fsa(): FsaWindow {
  return window as unknown as FsaWindow;
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

export interface OpenedFile {
  name: string;
  text: string;
  handle: FileSystemFileHandle | null;
}

function uploadFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** Asks the user for a JSON file. Resolves to null when they cancel. */
export async function openFile(): Promise<OpenedFile | null> {
  if (supportsFileSystemAccess()) {
    try {
      const [handle] = await fsa().showOpenFilePicker({ types: JSON_TYPES, multiple: false });
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  const file = await uploadFile('.json,application/json');
  return file ? { name: file.name, text: await file.text(), handle: null } : null;
}

/** Reopens a remembered file handle (recent projects). */
export async function readHandle(handle: FileSystemFileHandle): Promise<OpenedFile> {
  const file = await handle.getFile();
  return { name: file.name, text: await file.text(), handle };
}

async function ensureWritable(handle: FileSystemFileHandle): Promise<boolean> {
  const h = handle as unknown as WritableHandle;
  if (!h.queryPermission || !h.requestPermission) return true;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function writeHandle(handle: FileSystemFileHandle, text: string): Promise<boolean> {
  if (!(await ensureWritable(handle))) return false;
  const writable = await (handle as unknown as WritableHandle).createWritable();
  await writable.write(text);
  await writable.close();
  return true;
}

/** Save As. On Chromium returns the new handle; elsewhere downloads the file. */
export async function saveFileAs(
  suggestedName: string,
  text: string,
): Promise<{ name: string; handle: FileSystemFileHandle | null } | null> {
  if (supportsFileSystemAccess()) {
    try {
      const handle = await fsa().showSaveFilePicker({ suggestedName, types: JSON_TYPES });
      await writeHandle(handle, text);
      return { name: handle.name, handle };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  download(suggestedName, new Blob([text], { type: 'application/json' }));
  return { name: suggestedName, handle: null };
}

export function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A file name for a pattern: "Peerie hat" → "peerie-hat.fairisle.json". */
export function fileNameFor(name: string, extension = PATTERN_EXTENSION): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'pattern';
  return base + extension;
}

/** "hat.fairisle.json" → "hat" */
export function baseName(fileName: string): string {
  return fileName.replace(/\.fairisle(-library)?\.json$/i, '').replace(/\.json$/i, '');
}
