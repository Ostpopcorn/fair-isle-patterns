import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';

/** Files in public/ that the service worker must cache too. */
const PUBLIC_FILES = ['manifest.webmanifest', 'icon.svg'];

/**
 * Emits sw.js, a cache-first service worker that precaches every file of the
 * build (including the WASM module), so the app runs offline after the first
 * load. The cache name changes whenever any file changes.
 */
function serviceWorker(): Plugin {
  return {
    name: 'fairisle-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const hash = createHash('sha256');
      for (const name of files.sort()) {
        const item = bundle[name];
        hash.update(name);
        hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      const version = hash.digest('hex').slice(0, 12);
      const assets = ['./', ...files.map((f) => `./${f}`), ...PUBLIC_FILES.map((f) => `./${f}`)];
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `// Generated at build time. Do not edit.
const CACHE = 'fairisle-${version}';
const ASSETS = ${JSON.stringify(assets, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fairisle-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    // ignoreVary: module scripts send an Origin header the precache requests did not.
    caches.match(request, { ignoreSearch: true, ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(request).catch(() =>
          request.mode === 'navigate' ? caches.match('./') : Response.error(),
        ),
    ),
  );
});
`,
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorker()],
  server: {
    // The starter library and the example live outside web/.
    fs: { allow: ['..'] },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
