// Autosave. Files on disk are the master copy; IndexedDB only protects
// against lost work. Every change is saved after a 1 second pause, and
// synchronously to localStorage when the tab is hidden or closed, so a
// reopened tab always has the latest state.

import type { FileRef, Store } from './store';

export interface Session {
  id: string;
  name: string;
  updatedAt: number;
  /** Canonical document text. */
  text: string;
  readOnly: boolean;
  fileName: string | null;
  /** Chromium only: lets "recent projects" reopen the file in place. */
  handle: FileSystemFileHandle | null;
  savedText: string | null;
}

const DB_NAME = 'fairisle';
const STORE_NAME = 'sessions';
const BACKUP_KEY = 'fairisle:backup';
const LAST_KEY = 'fairisle:last-session';
const MAX_SESSIONS = 20;
export const AUTOSAVE_DELAY_MS = 1000;

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await db()).transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

export async function listSessions(): Promise<Session[]> {
  try {
    const all = (await request((await tx('readonly')).getAll())) as Session[];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function putSession(session: Session): Promise<void> {
  try {
    await request((await tx('readwrite')).put(session));
    const all = await listSessions();
    for (const old of all.slice(MAX_SESSIONS)) await request((await tx('readwrite')).delete(old.id));
  } catch (e) {
    // Storing a file handle can fail in some browsers; retry without it.
    if (session.handle) await putSession({ ...session, handle: null });
    else console.warn('Autosave failed', e);
  }
}

export async function deleteSession(id: string): Promise<void> {
  try {
    await request((await tx('readwrite')).delete(id));
  } catch {
    /* ignore */
  }
}

function snapshot(store: Store): Session {
  const s = store.get();
  return {
    id: s.sessionId,
    name: s.doc.meta.name || 'Untitled pattern',
    updatedAt: Date.now(),
    text: store.text(),
    readOnly: s.readOnly,
    fileName: s.file?.name ?? null,
    handle: s.file?.handle ?? null,
    savedText: s.savedText,
  };
}

/** The synchronous copy written when the tab goes away. */
export function readBackup(): Session | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? ({ handle: null, ...JSON.parse(raw) } as Session) : null;
  } catch {
    return null;
  }
}

function writeBackup(session: Session): void {
  try {
    const { handle: _handle, ...rest } = session;
    localStorage.setItem(BACKUP_KEY, JSON.stringify(rest));
    localStorage.setItem(LAST_KEY, session.id);
  } catch {
    /* storage full or disabled */
  }
}

export function lastSessionId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/** Sessions from IndexedDB, merged with a newer localStorage backup. */
export async function recentSessions(): Promise<Session[]> {
  const sessions = await listSessions();
  const backup = readBackup();
  if (backup) {
    const i = sessions.findIndex((s) => s.id === backup.id);
    if (i < 0 || sessions[i].updatedAt < backup.updatedAt) {
      const merged = { ...backup, handle: i >= 0 ? sessions[i].handle : null };
      if (i >= 0) sessions.splice(i, 1);
      sessions.unshift(merged);
      void putSession(merged);
    }
  }
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Starts autosaving the store's document. Returns a function that stops it. */
export function startAutosave(store: Store): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastDoc = store.get().doc;
  let lastFile: FileRef | null = store.get().file;
  let pending = false;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return;
    pending = false;
    const session = snapshot(store);
    writeBackup(session);
    void putSession(session);
  };

  const unsubscribe = store.subscribe(() => {
    const s = store.get();
    if (s.doc === lastDoc && s.file === lastFile) return;
    lastDoc = s.doc;
    lastFile = s.file;
    pending = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
  });

  const onHide = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onHide);
  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onHide);
  };
}

/** Saves the current state right away (for example after opening a file). */
export function saveNow(store: Store): void {
  const session = snapshot(store);
  writeBackup(session);
  void putSession(session);
}

export function isSafari(): boolean {
  const ua = navigator.userAgent;
  return /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|Android/.test(ua);
}
