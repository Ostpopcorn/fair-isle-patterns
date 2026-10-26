// Which layout is showing: phones show one screen at a time, wider windows
// show a work area, a view and the issues side by side.

import { useEffect, useState } from 'preact/hooks';
import type { UiState } from '../state/store';

/** styles.css switches to the phone layout at the same width. */
const PHONE = '(max-width: 800px)';

export function isPhone(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia(PHONE).matches;
}

/** isPhone, rendering again when the window crosses the breakpoint. */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(isPhone);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const query = matchMedia(PHONE);
    const update = () => setPhone(query.matches);
    query.addEventListener('change', update);
    update();
    return () => query.removeEventListener('change', update);
  }, []);
  return phone;
}

/** Whether the motif editor is on screen, so its shortcuts apply. */
export function motifEditorShown(ui: UiState): boolean {
  return isPhone() ? ui.screen === 'motifs' && ui.motifPage === 'draw' : ui.view === 'motif';
}
