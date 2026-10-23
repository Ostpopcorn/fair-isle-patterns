# User guide

The Fair Isle Pattern Builder is a design tool for stranded fair isle bands
knitted in the round. It runs in the browser, works offline once loaded, and
keeps your patterns in plain files that you own.

## The idea

Fair isle is designed in layers, and so is the app:

- **Palette**: the yarns you will knit with.
- **Motifs**: shapes only. Each cell is background, foreground or accent.
- **Mappings**: colour schemes. For each row, which yarn is the background,
  which the foreground and, optionally, which the accent. A three-row
  mapping on a seven-row motif simply cycles.
- **Bands**: the stack you knit, from the bottom up. Each band is a motif
  plus a mapping, slid sideways by an offset and repeated vertically
  `times` times.

Change a mapping and every band using it changes. Swap a band's mapping and
the same motif reads completely differently. That is how fair isle is
actually designed.

## Getting started

When the app opens it offers to restore your last session, lists recent
projects, and lets you start a new pattern, open a file, or open the example
(a peerie hat).

A new pattern starts with two colours, a small peerie motif, a spacer and
one mapping, so there is a chart to look at straight away.

## The work areas (left)

**Bands.** The stack, top band first, as on the chart. Each card shows the
band's rows and its issues.

- *Offset* slides the motif sideways: ◀ moves it one stitch left, ▶ one
  stitch right. Offsets wrap: 7 on a 5-stitch motif is the same as 2.
- *Times* repeats the motif vertically. The mapping keeps cycling across the
  repeats rather than restarting.
- *+ Spacer* adds a plain band in the background colour of the mapping
  below.
- Reorder with ↑ ↓, or focus a card and press Alt+↑ / Alt+↓.

**Motifs.** Pick a motif to edit it in the motif editor. Rename it, change
its id (bands follow), duplicate it, or delete it. A motif used by a band
cannot be deleted; the message lists the bands.

**Mappings.** Rows are listed top first. Each row has a background, a
foreground and an optional accent. *Reverse* flips the order; *Shift up* and
*Shift down* move every colour one row with wrap-around. The panel shows how
many bands use the mapping. Duplicate it to change one band independently.

**Palette.** Pick colours with the colour picker or type a hex value. Add a
name and the yarn (shade and number) so you can buy it again. *Import…*
copies colours from a library file. A colour used by a mapping cannot be
deleted; the message lists the mappings.

**Project.** Name, author, licence and description; the gauge (stitches and
rows per 10 cm) and the cast-on, which is the chart width. *Pattern
settings…* sets the thresholds for the checks.

## The motif editor

- **Tools**: pencil (P), fill (F), line (L), rectangle (R; Shift+R or the
  *Filled* box for solid rectangles) and select (S).
- **Symbols**: background (0), foreground (1) and accent (2). X swaps
  foreground and background. Right-click always draws background.
- **Mirror** (M, Shift+M) draws across the vertical and horizontal centre
  lines at the same time.
- **Transforms**: flip horizontally (Shift+H) or vertically (Shift+V),
  rotate 180° (Shift+T), rotate 90° on square motifs (] and [), and roll the
  contents with wrap-around (Alt+arrow keys).
- **Copy, cut and paste** work within and between motifs. Paste goes to the
  selection, or to the bottom-left corner; anything beyond the motif's edge
  is clipped.
- **Size**: change the width and height; cells are added or removed at the
  top and right edges.
- The **tiled preview** shows at least 3 × 2 repeats, coloured with the
  mapping you choose.

One pencil stroke is one undo step.

## The views (centre)

- **Chart**: the knitter's working chart. Rows are numbered from the bottom
  (row 1 is knitted first) on the right; stitches from the right along the
  bottom. Heavy horizontal lines separate bands, heavy vertical lines mark
  motif repeats. Scroll to zoom, drag to pan, double-click to fit. Markers in
  the row margin show issues: a muted dot for notices, a triangle for
  warnings and errors.
- **Gauge preview**: every stitch at its real proportions. With 28 stitches
  and 32 rows per 10 cm a stitch is about 1.14 times wider than tall, so
  round motifs look flatter, as they will in the knitting. Rulers along the
  left and bottom are in centimetres; the dashed square is 10 × 10 cm.
- **In the round**: the front half of the knitted tube, so motifs compress
  towards the sides as on a body. Drag to turn it, or use the slider and the
  repeat buttons. *Show seam* turns the beginning of the round to the front.

**Grayscale** (G) shows every colour as its lightness, in all views and in
exports, so you can judge whether motifs will read clearly.

## Issues (right)

The app checks the pattern as you work. Nothing is ever blocked: knitting
concerns are warnings, and only broken data is an error.

- **Long floats** (W101): a strand carried behind more than a few stitches.
  Notices from 5 stitches, warnings from 8 by default. Selecting one
  highlights every long float in that row.
- **Colours per row** (W102): more than two colours in one row is hard to
  knit.
- **Repeat fit** (W103): the cast-on is not a multiple of a motif's width,
  so the last repeat is cut off. The panel offers one-click fixes with cast-on
  values that fit every band.
- **Contrast** (W105): background and foreground (or accent) too similar in
  lightness to read well.
- **Errors** such as a band using a missing motif or an accent with no
  accent colour (E007). While there are errors the chart keeps showing the
  last valid version.

Notices are collapsed by default. Click an issue to highlight it in the
chart; click it again to clear the highlight.

## Files, autosave and offline use

- **Save** (Ctrl+S) writes the pattern file. In Chrome and Edge it saves back
  into the file you opened; in Firefox and Safari it downloads the file.
- **Save as…** (Ctrl+Shift+S) picks a new file.
- Every change is also autosaved in this browser after a second, and right
  away when you close the tab. The header shows when the pattern has changes
  not yet saved to a file. The browser copy is a safety net; the file is the
  real copy. (Safari may clear browser storage after a while without use.)
- Undo (Ctrl+Z) and redo (Ctrl+Shift+Z) cover every change, at least 500
  steps back.
- After the first visit the app works offline, and it can be installed as an
  app from the browser menu.

Files are plain JSON in a fixed layout, so they work well with git. See the
[format reference](format.md).

## Libraries

*Library…* opens the built-in starter library: peerie bands, OXO bands,
stars, a neutral palette and basic mappings, all CC0. Select items and copy
them into the project. Items whose ids are taken are renamed
(`peerie-x-2`); identical items are not duplicated; a mapping brings its
colours. *From a file…* (Ctrl+Shift+O) imports from any library file.

## Export

*Export…* (Ctrl+E):

- **PDF for printing** (A4 or US Letter): name and settings, the colour
  legend with names and yarns, the chart split across pages with row and
  stitch numbers repeated on each page and a letter in every cell, and a
  table of the colours in every row.
- **PNG** of the chart or the gauge preview, at a chosen size.
- **SVG** of the chart with a legend.

Exports work offline and follow the grayscale toggle.

## On a phone

On narrow screens the app shows one screen at a time, switched from the bar
at the bottom:

- **Edit**: the work areas (bands, motifs, mappings, palette, project).
- **View**: the motif editor, chart, gauge preview and in-the-round view.
  Tapping a motif opens it here.
- **Issues**: everything the checks found. Tapping an issue shows it on the
  chart or opens the work area that fixes it.

The file actions, grayscale and help are in the ⋯ menu. In the views, drag
to pan (or to turn the tube), pinch to zoom, or use the − / Fit / + buttons.
The motif editor keeps the less common tools behind *More tools*.

## Keyboard

Press `?` for the full list. Every tool and command has a shortcut, and every
control can be reached with Tab.
