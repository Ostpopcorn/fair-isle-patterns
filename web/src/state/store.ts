// Application state. The document is an immutable JSON-shaped object;
// undo/redo is a stack of document snapshots (patterns are small).

import type { CompiledChart, Issue, LibraryDoc, PatternDoc, StitchLayout } from '../core/types';
import { compile, layout, serialize, validate } from '../core';
import type { Rect, Symbol } from '../model/motif';
import { newPattern } from '../model/doc';

export type Panel = 'bands' | 'motifs' | 'mappings' | 'palette' | 'project';
export type View = 'motif' | 'chart' | 'gauge' | 'round';
export type Tool = 'pencil' | 'fill' | 'line' | 'rect' | 'select';
/** On phones one screen is shown at a time; wider layouts show all three. */
export type Screen = 'edit' | 'view' | 'issues';

export type Dialog =
  | { kind: 'welcome' }
  | { kind: 'help' }
  | { kind: 'settings' }
  | { kind: 'export' }
  | { kind: 'library'; source: LibraryDoc | null; fileName?: string }
  | { kind: 'message'; title: string; body: string; issues?: Issue[] };

export interface UiState {
  panel: Panel;
  view: View;
  motifId: string | null;
  mappingId: string | null;
  bandIndex: number | null;
  tool: Tool;
  symbol: Symbol;
  mirrorV: boolean;
  mirrorH: boolean;
  filledRect: boolean;
  /** Mapping used to colour the motif editor's tiled preview. */
  previewMapping: string | null;
  /** Motif editor selection, in motif cells. */
  selection: Rect | null;
  /** Issue selected in the warnings panel; highlighted in the chart. */
  issue: Issue | null;
  grayscale: boolean;
  dialog: Dialog | null;
  toast: string | null;
  screen: Screen;
}

export interface FileRef {
  name: string;
  handle: FileSystemFileHandle | null;
}

export interface AppState {
  doc: PatternDoc;
  /** A newer format version: viewing only. */
  readOnly: boolean;
  file: FileRef | null;
  /** Canonical text last read from or written to a file. */
  savedText: string | null;
  sessionId: string;
  ui: UiState;
  /** Motif clipboard (rows, bottom first), shared between motifs. */
  clipboard: string[] | null;
}

export interface Analysis {
  issues: Issue[];
  /** null when the document has errors. */
  chart: CompiledChart | null;
  errors: number;
}

const HISTORY_LIMIT = 1000;
const COALESCE_MS = 1500;

export function newSessionId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const initialUi: UiState = {
  panel: 'bands',
  view: 'chart',
  motifId: null,
  mappingId: null,
  bandIndex: null,
  tool: 'pencil',
  symbol: '1',
  mirrorV: false,
  mirrorH: false,
  filledRect: false,
  previewMapping: null,
  selection: null,
  issue: null,
  grayscale: false,
  dialog: null,
  toast: null,
  screen: 'edit',
};

export class Store {
  private state: AppState;
  private past: PatternDoc[] = [];
  private future: PatternDoc[] = [];
  private lastKey: string | null = null;
  private lastTime = 0;
  private listeners = new Set<() => void>();

  private analysisFor: PatternDoc | null = null;
  private analysisValue: Analysis | null = null;
  private lastValid: { doc: PatternDoc; chart: CompiledChart } | null = null;
  private layoutFor: CompiledChart | null = null;
  private layoutValue: StitchLayout | null = null;
  private textFor: PatternDoc | null = null;
  private textValue = '';

  constructor(doc: PatternDoc = newPattern()) {
    this.state = {
      doc,
      readOnly: false,
      file: null,
      savedText: null,
      sessionId: newSessionId(),
      ui: { ...initialUi, motifId: doc.motifs[0]?.id ?? null, mappingId: doc.mappings[0]?.id ?? null },
      clipboard: null,
    };
  }

  get(): AppState {
    return this.state;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(next: AppState): void {
    this.state = next;
    for (const fn of this.listeners) fn();
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get historySize(): number {
    return this.past.length;
  }

  /**
   * Applies an edit. Edits sharing a `coalesce` key within a short time
   * (one pencil stroke, typing in one field) become a single undo step.
   */
  edit(fn: (doc: PatternDoc) => PatternDoc, options: { coalesce?: string } = {}): void {
    if (this.state.readOnly) return;
    const prev = this.state.doc;
    const next = fn(prev);
    if (next === prev) return;
    const now = Date.now();
    const merge = options.coalesce !== undefined && options.coalesce === this.lastKey && now - this.lastTime < COALESCE_MS;
    if (!merge) {
      this.past.push(prev);
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.future = [];
    this.lastKey = options.coalesce ?? null;
    this.lastTime = now;
    this.set({ ...this.state, doc: next, ui: { ...this.state.ui, issue: null } });
  }

  /** Ends any coalescing run, so the next edit starts a new undo step. */
  breakCoalescing(): void {
    this.lastKey = null;
  }

  undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.state.doc);
    this.lastKey = null;
    this.set({ ...this.state, doc: prev, ui: { ...this.state.ui, issue: null } });
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.state.doc);
    this.lastKey = null;
    this.set({ ...this.state, doc: next, ui: { ...this.state.ui, issue: null } });
  }

  ui(patch: Partial<UiState> | ((ui: UiState) => Partial<UiState>)): void {
    const p = typeof patch === 'function' ? patch(this.state.ui) : patch;
    this.set({ ...this.state, ui: { ...this.state.ui, ...p } });
  }

  patch(patch: Partial<Omit<AppState, 'doc' | 'ui'>>): void {
    this.set({ ...this.state, ...patch });
  }

  /** Replaces the document (open, new, restore) and clears the history. */
  load(
    doc: PatternDoc,
    options: { readOnly?: boolean; file?: FileRef | null; savedText?: string | null; sessionId?: string } = {},
  ): void {
    this.past = [];
    this.future = [];
    this.lastKey = null;
    this.lastValid = null;
    this.set({
      ...this.state,
      doc,
      readOnly: options.readOnly ?? false,
      file: options.file ?? null,
      savedText: options.savedText ?? null,
      sessionId: options.sessionId ?? newSessionId(),
      ui: {
        ...this.state.ui,
        motifId: doc.motifs[0]?.id ?? null,
        mappingId: doc.mappings[0]?.id ?? null,
        previewMapping: null,
        bandIndex: null,
        selection: null,
        issue: null,
        dialog: null,
      },
    });
  }

  /** Issues and chart for the current document (cached per document). */
  analysis(): Analysis {
    const doc = this.state.doc;
    if (this.analysisFor !== doc || !this.analysisValue) {
      const issues = validate(doc);
      const errors = issues.filter((i) => i.severity === 'error').length;
      const chart = errors ? null : compile(doc);
      this.analysisFor = doc;
      this.analysisValue = { issues, chart, errors };
      if (chart) this.lastValid = { doc, chart };
    }
    return this.analysisValue;
  }

  /** The chart to show: the current one, or the last valid one while the
   * document has errors. */
  displayed(): { doc: PatternDoc; chart: CompiledChart; stale: boolean } | null {
    const a = this.analysis();
    if (a.chart) return { doc: this.state.doc, chart: a.chart, stale: false };
    return this.lastValid ? { ...this.lastValid, stale: true } : null;
  }

  layoutOf(doc: PatternDoc, chart: CompiledChart): StitchLayout | null {
    if (this.layoutFor !== chart) {
      this.layoutFor = chart;
      this.layoutValue = layout(doc);
    }
    return this.layoutValue;
  }

  /** Canonical text of the current document (cached). */
  text(): string {
    if (this.textFor !== this.state.doc) {
      this.textFor = this.state.doc;
      this.textValue = serialize(this.state.doc);
    }
    return this.textValue;
  }

  isDirty(): boolean {
    return this.state.savedText !== this.text();
  }
}

export const store = new Store();
