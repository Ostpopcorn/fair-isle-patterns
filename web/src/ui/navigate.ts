// Jumps to the editors, shared by the work areas. Each sets both layouts'
// state: the sidebar panel and view of wider windows, and the phone screen.

import { store } from '../state/store';

/** Scrolls an element into view once the screen it is on has rendered. */
function scrollToSoon(selector: string): void {
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(selector)?.scrollIntoView({ block: 'start' })));
}

/** Opens a motif in the motif editor: the main view on wider layouts, the
 * Draw page of the Motifs screen on phones. */
export function editMotif(motifId: string): void {
  store.ui({ motifId, view: 'motif', selection: null, screen: 'motifs', motifPage: 'draw' });
}

/** Opens a motif's mapping in the Motifs tab (its Colours page on phones)
 * and scrolls the mapping editor into view. */
export function editMapping(motifId: string, mappingId: string): void {
  store.ui({ motifId, mappingId, panel: 'motifs', screen: 'motifs', motifPage: 'colours' });
  scrollToSoon('.sub-card');
}

/** Opens the Project tab at the palette. */
export function showPalette(): void {
  store.ui({ panel: 'project', screen: 'project' });
  scrollToSoon('#palette');
}
