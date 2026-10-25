# Fair Isle Pattern Builder

A browser-based, open-source pattern builder for stranded fair isle knitting
that understands the rules of the craft, not just a colour grid.

- **Shape and colour are separate layers.** A motif is a shape
  (background, foreground, accent). Each motif's colour mappings pick up to
  10 of the project's colours and decide which fill it, row by row.
- **Fair isle-aware checks run as you draw**: float length (in the round,
  so floats wrap), colours per row, repeat fit with one-click cast-on fixes,
  missing accents and lightness contrast.
- **Gauge-accurate previews**: the chart, a true-proportion gauge preview
  with centimetre rulers, and an in-the-round view of the tube as worn.
- **An open, documented, git-friendly file format**, written in one
  canonical form. The app is local-first, works offline and needs no
  account.

It is written for technically minded hobby knitters who design for
themselves, version their work and like to tinker.

## Features (version 1)

- Motif editor: pencil, fill, line, rectangle and select tools; mirrored
  drawing; flips, rotations and wrap-around rolls; copy, cut and paste
  between motifs; shown in black and white or in any of the motif's
  mappings, with a live tiled preview.
- Mapping editor under each motif, with reverse and shift helpers; palette
  with yarn names;
  band stack with offsets, vertical repeats, one-colour spacers and
  keyboard reordering.
- Issues panel grouped by severity, with highlighting of every offending
  float in the chart.
- Grayscale view in every view and export.
- Open and save real files (in place on Chromium browsers), autosave to the
  browser, recent projects, unlimited undo.
- Export to PNG, SVG and a printable PDF (A4 or US Letter) with the chart
  split across pages, a colour legend and a per-row colour table.
- A CC0 starter library: peeries, OXO bands and stars, each with
  two-colour, light-on-dark and shaded mappings, and a neutral palette.
- Keyboard shortcuts for everything (press `?`), light and dark themes,
  installable offline PWA.

See the [user guide](docs/user-guide.md) and the
[file format reference](docs/format.md).

## Architecture

A static web app with no backend:

- **`core/`**: a stateless Rust crate compiled to WebAssembly. Six pure
  functions — `parse`, `serialize`, `validate`, `compile`, `layout` and
  `suggest_cast_on` — that never touch the page or storage and never panic
  on user input.
- **`web/`**: the TypeScript UI (Preact, Vite, strict TypeScript). It owns
  all state and interaction, keeps the document as an immutable JSON object
  with a snapshot undo stack, and calls the core after every edit. Rendering
  uses Canvas 2D.
- **`fixtures/`**: shared test cases, run by both the Rust and the
  TypeScript tests.
- **`library/`**: the built-in starter library (CC0).
- **`docs/`**: the format reference and the user guide.

## Development

You need Rust (stable, with the `wasm32-unknown-unknown` target),
[wasm-pack](https://rustwasm.github.io/wasm-pack/) and Node.js 22 or later.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# Core
cd core
cargo test                 # unit, fixture and robustness tests
cargo test --release --test robustness performance -- --nocapture
cargo clippy --all-targets -- -D warnings

# App
cd ../web
npm install
npm run build:wasm         # builds core/ into web/src/core/pkg
npm run dev                # http://localhost:5173
npm test                   # fixtures through WASM, model, state and export tests
npm run typecheck
npm run build              # static site in web/dist
```

Rebuild the WASM package (`npm run build:wasm`) whenever `core/` changes.

### Tests

Every rule in the specification has a fixture in `fixtures/<case>/`: an
input file and `expected.json` with the exact issues, the compiled chart as
ASCII art, the canonical form and cast-on suggestions. `cargo test` runs them
natively; `npm test` runs the same files through the WebAssembly build and
also checks that `web/src/core/types.ts` matches what the core returns.

## Self-hosting

Pushes to `main` are built and deployed to GitHub Pages by the CI workflow.

`npm run build` produces a static site in `web/dist` with relative paths,
so it can be served from any static web server or sub-directory. A service
worker caches the app and the WebAssembly module, so it runs offline after
the first visit (service workers need HTTPS or `localhost`).

## Licence

The app and core are licensed under the
[GNU General Public License v3.0 or later](LICENSE). The starter library in
`library/` is dedicated to the public domain under
[CC0 1.0](library/LICENSE). Patterns you make are yours.
