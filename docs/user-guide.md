# User guide

The Fair Isle Pattern Builder is a design tool for stranded fair isle bands
knitted in the round. It runs in the browser, works offline once loaded, and
keeps your patterns in plain files that you own.

## The idea

Fair isle is designed in layers, and so is the app:

- **Palette**: the yarns the project uses.
- **Motifs**: shapes. Each cell is background, foreground or accent.
- **Mappings**: the colourways of one motif. A mapping belongs to its motif.
  It picks up to 10 colours from the palette and says, for every row of the
  motif, which of them is the background, which the foreground and,
  optionally, which the accent. A motif can have several mappings.
- **Bands**: the stack you knit, from the bottom up. Each band is a motif
  plus one of its mappings, slid sideways by an offset and repeated
  vertically `times` times. A **spacer** is simpler: plain rows in one
  palette colour, with no motif or mapping.

Change a mapping and every band using it changes. Give a band another of
its motif's mappings and the same motif reads completely differently.

## Getting started

When the app opens it offers to restore your last session, lists recent
projects, and lets you start a new pattern, open a file, or open the example
(a peerie hat).

Patterns saved by early versions of the app, before mappings moved into
their motifs, cannot be opened. The recent projects list marks such
autosaves, and opening such a file explains why it does not open.

A new pattern starts with three colours, a small peerie motif with one
mapping, and a two-row spacer below and above it, so there is a chart to
look at straight away.

## The work areas

On a computer the work areas are the tabs on the left: Project, Bands and
Motifs. The view (motif editor, chart, gauge preview or in the round) is in
the middle and the issues are on the right. On a phone each has a screen of
its own; see [On a phone](#on-a-phone).

**Project.** Name, author, licence and description; the palette; the gauge
(stitches and rows per 10 cm) and the cast-on, which is the chart width.
*Pattern settings…* sets the thresholds for the checks.

The **palette** is the list of yarns. Type a hex value, or tap a colour's
swatch to open its colour picker:

- The **wheel** picks hue (around) and saturation (out from the centre). It
  shows the colours at the current lightness, so what is under your finger
  is what you get.
- The **lightness** slider runs from black through the colour to white.
- **Presets** are the yarn shades of the starter library's neutral palette.
- **R, G, B** (0–255) and **H** (0–360°), **S** and **L** (0–100 %) can be
  typed. A gray keeps its hue, so raising the saturation again brings the
  hue back.
- *Lightness L\** is the lightness the contrast check compares.

Every drag, preset or typed value is one undo step. Add a name and the yarn
(shade and number) so you can buy it again. *Import…* copies colours from a
library file. A colour listed by a mapping or used by a spacer cannot be
deleted; the message lists them. Changing a colour's id updates the mappings
and spacers that use it.

**Bands.** The stack, top band first, as on the chart. Each card shows the
band's rows and its issues.

- *Offset* slides the motif sideways: ◀ moves it one stitch left, ▶ one
  stitch right. Offsets wrap: 7 on a 5-stitch motif is the same as 2.
- *Times* repeats the motif vertically, together with its colours.
- *Mapping* lists the mappings of the band's motif. Choosing another motif
  keeps a mapping of the same id if it has one, or takes its first mapping.
- *+ New motif…* at the end of the motif list gives the band a new blank
  motif and opens it in the motif editor. *+ New mapping…* at the end of the
  mapping list gives the band a new mapping of its motif and opens it in the
  mapping editor. Either is one undo step.
- *+ Spacer* adds a spacer: one row in the first palette colour. A
  spacer's card has only its colour and its number of rows. Stack spacers in
  different colours for stripes.
- *Edit colours* opens a motif band's mapping in the Motifs tab; *Edit
  motif* opens its motif in the motif editor.
- Reorder with ↑ ↓, or focus a card and press Alt+↑ / Alt+↓.

**Motifs.** Pick a motif to see its details and colour mappings below the
list; picking does not leave the Motifs tab, so you can go straight to its
colours. *Edit motif* opens it in the motif editor. Rename it, change its id
(bands follow), duplicate it (with its mappings), or delete it. A
motif used by a band cannot be deleted; the message lists the bands. A new
motif starts with one mapping that uses the first three palette colours as
background, foreground and accent on every row.

Below the motif are its **colour mappings**. Pick one to edit it:

- *Colours*: the mapping's own set of up to 10 palette colours. Replacing a
  colour here recolours every row that uses it. A colour can be removed once
  no row uses it.
- *Rows*: one per motif row, top row first, as on the chart. Each has a
  background, a foreground and an optional accent, chosen from the
  mapping's colours. An accent select is outlined in red when its motif row
  uses the accent but the mapping row has none (error E007). *Reverse* flips
  the order; *Shift up* and *Shift down* move every row's colours one row
  with wrap-around.
- The panel shows how many bands use the mapping. Duplicate it to change one
  band independently. A mapping used by a band, or the motif's only mapping,
  cannot be deleted.

Mapping ids only need to be unique within their motif, so two motifs can
each have a mapping called `default`.

## The motif editor

- **Tools**: pencil (P), fill (F), line (L), rectangle (R; Shift+R or the
  *Filled* box for solid rectangles) and select (S).
- **Symbols**: background (0), foreground (1) and accent (2). X swaps
  foreground and background. Right-click always draws background.
- **Mirror** (M, Shift+M) draws across the vertical and horizontal centre
  lines at the same time.
- **Transforms**: flip horizontally (Shift+H) or vertically (Shift+V),
  rotate 180° (Shift+T), rotate 90° on square motifs (] and [), and roll the
  contents with wrap-around (Alt+arrow keys). Flipping vertically, rotating
  180° and rolling up or down move the motif's mappings with the rows, so
  each row keeps its colours.
- **Copy, cut and paste** work within and between motifs. Paste goes to the
  selection, or to the bottom-left corner; anything beyond the motif's edge
  is clipped.
- **Size**: change the width and height by typing or with − / +; cells are
  added or removed at the top and right edges. Rows added at the top copy
  the top row of every mapping. Until you leave the field, each size you
  type is applied to the motif as it was, so typing 14 over 12 (passing 1
  on the way) keeps all 12 columns. Leaving the field ends the undo step;
  each − or + press is an undo step of its own.
- **Colours** (under the tiled preview): the motif is shown in black and
  white with a deep red accent unless you pick one of its mappings. Black
  and white is only a way of looking at the motif; it is not saved in the
  file. The choice colours both the editor and the **tiled preview**, which
  shows at least 3 × 2 repeats.

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

*Library…* opens the built-in starter library: peerie bands, OXO bands and
stars, each with its own mappings, and a neutral palette, all CC0. Select
items and copy them into the project. A motif brings its mappings and the
colours they use. Items whose ids are taken are renamed (`peerie-x-2`);
identical items are not duplicated. *From a file…* (Ctrl+Shift+O) imports
from any library file.

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

On narrow screens the app shows one screen at a time, picked from the bar
at the bottom:

- **Project**: the file buttons (New, Open, Save, Save as, Export and
  Library), the pattern's details, the palette, the gauge and the checks.
- **Bands**: the band stack.
- **Motifs**: a motif picker and *+ Motif* at the top, then two pages.
  *Draw* is the motif editor. *Colours* has the motif's colour mappings and,
  below them, its name, id, *Duplicate* and *Delete*. Picking another motif
  keeps the page you are on. A band's *Motif* button opens Draw and its
  *Colours* button opens Colours at the band's mapping.
- **View**: the chart, gauge preview and in-the-round view.
- **Issues**: everything the checks found, with the number of errors and
  warnings on the tab. Tapping an issue shows it on the chart or opens the
  screen that fixes it.

The ⋯ menu has the file actions too, with grayscale and help. In the views,
drag to pan (or to turn the tube), pinch to zoom, or use the − / Fit / +
buttons. The motif editor keeps the less common tools behind *More tools*.

## Keyboard

Press `?` for the full list. Every tool and command has a shortcut, and every
control can be reached with Tab.
