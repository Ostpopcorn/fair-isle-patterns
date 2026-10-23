import { zoomBus } from '../shortcuts';

const send = (detail: 'in' | 'out' | 'fit') => zoomBus.dispatchEvent(new CustomEvent('zoom', { detail }));

/** On-screen zoom buttons, for touch screens and anyone without a wheel. */
export function ZoomControls({ inline = false }: { inline?: boolean }) {
  return (
    <div class={`zoom-controls${inline ? ' inline' : ''}`} role="group" aria-label="Zoom">
      <button class="btn small icon" aria-label="Zoom out" title="Zoom out (-)" onClick={() => send('out')}>
        −
      </button>
      <button class="btn small" title="Fit to the window (.)" onClick={() => send('fit')}>
        Fit
      </button>
      <button class="btn small icon" aria-label="Zoom in" title="Zoom in (=)" onClick={() => send('in')}>
        +
      </button>
    </div>
  );
}
