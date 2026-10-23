import { render } from 'preact';
import './styles.css';
import { initCore } from './core';
import { startAutosave } from './state/persistence';
import { store } from './state/store';
import { App } from './ui/App';

async function start(): Promise<void> {
  const root = document.getElementById('app')!;
  try {
    await initCore();
  } catch (e) {
    root.innerHTML = `<p style="padding:24px">The pattern core could not be loaded (${String(e)}). The app needs a browser with WebAssembly.</p>`;
    return;
  }
  render(<App />, root);
  store.ui({ dialog: { kind: 'welcome' } });
  startAutosave(store);

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Offline support unavailable', e));
  }
}

void start();
