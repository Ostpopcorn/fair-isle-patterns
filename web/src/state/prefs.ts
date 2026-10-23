// App preferences: defaults for new patterns. Stored per browser.

import type { Settings } from '../core/types';
import { DEFAULT_SETTINGS } from '../model/doc';

const KEY = 'fairisle:prefs';

export interface Prefs {
  settings: Settings;
  safariNoticeShown: boolean;
}

export function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
      safariNoticeShown: Boolean(raw.safariNoticeShown),
    };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, safariNoticeShown: false };
  }
}

export function savePrefs(patch: Partial<Prefs>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    /* storage disabled */
  }
}
