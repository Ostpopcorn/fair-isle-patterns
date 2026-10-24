// Jumps to the editors, shared by the work areas.

import { store } from '../state/store';

/** Opens a motif in the motif editor (the View screen on phones). */
export function editMotif(motifId: string): void {
  store.ui({ motifId, view: 'motif', selection: null, screen: 'view' });
}

/** Opens a motif's mapping in the Motifs tab and scrolls the mapping editor
 * into view. */
export function editMapping(motifId: string, mappingId: string): void {
  store.ui({ motifId, mappingId, panel: 'motifs', screen: 'edit' });
  // After the panel has rendered.
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector('.sub-card')?.scrollIntoView({ block: 'start' })));
}
