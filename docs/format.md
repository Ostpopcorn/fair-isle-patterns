# File format reference

Version 1 of the Fair Isle Pattern Builder file format. The format is the
contract between the app, the core and anyone else who reads or writes
these files: every feature of the app is expressible in it, and nothing the
app shows is stored that the format does not describe.

- Pattern files use the extension `.fairisle.json` (a placeholder until the
  project is named).
- Library files use `.fairisle-library.json`.
- Files are UTF-8 JSON.

## Contents

1. [The four layers](#the-four-layers)
2. [Pattern files](#pattern-files)
3. [Reading direction](#reading-direction)
4. [How the chart is compiled](#how-the-chart-is-compiled)
5. [Validation](#validation)
6. [Canonical form](#canonical-form)
7. [Library files](#library-files)
8. [Compatibility and versions](#compatibility-and-versions)
9. [Full example](#full-example)

## The four layers

A pattern is one self-contained file built from four layers:

1. **Palette**: the colours and yarns the project uses.
2. **Motifs**: shape. Each cell is background (`0`), foreground (`1`) or
   accent (`2`).
3. **Mappings**: the colourways of one motif. A mapping belongs to exactly
   one motif and lives inside it. It picks up to 10 colours from the
   palette and says, for every row of its motif, which of them fill the
   background, the foreground and the accent. A motif has one or more
   mappings.
4. **Bands**: stacked bottom to top. Each band combines one motif, one of
   that motif's mappings and a sideways offset. A spacer is a band of plain
   rows in one palette colour, with no motif or mapping.

The chart is never stored. It is computed from these layers every time
they change.

## Pattern files

### Top-level fields

| Field      | Type    | Required | Meaning |
|------------|---------|----------|---------|
| `format`   | string  | yes | Always `"fairisle-pattern"` |
| `version`  | integer | yes | Format version, `1` |
| `meta`     | object  | yes | See [meta](#meta) |
| `gauge`    | object  | yes | See [gauge](#gauge) |
| `cast_on`  | integer | yes | Stitches in the round; equals the chart width. 1–1000 |
| `settings` | object  | no  | See [settings](#settings) |
| `palette`  | array   | yes | Colours, at least 2 |
| `motifs`   | array   | yes | Motif definitions, each with its mappings |
| `bands`    | array   | yes | Bands; the first element is the **bottom** band |

### meta

| Field         | Type   | Required | Meaning |
|---------------|--------|----------|---------|
| `name`        | string | yes | Pattern name |
| `author`      | string | no  | |
| `license`     | string | no  | SPDX identifier, such as `CC-BY-SA-4.0` |
| `description` | string | no  | |
| `created`     | string | no  | ISO 8601 date-time |
| `modified`    | string | no  | ISO 8601 date-time |

### gauge

| Field      | Type   | Required | Meaning |
|------------|--------|----------|---------|
| `stitches` | number | yes | Stitches per `per_cm` centimetres, > 0 |
| `rows`     | number | yes | Rows per `per_cm` centimetres, > 0 |
| `per_cm`   | number | no  | Default `10` |

One stitch is `per_cm / stitches` cm wide and one row `per_cm / rows` cm
tall.

### settings

Thresholds for the checks. They are stored in the pattern so everyone who
opens it sees the same checks.

| Field                | Type    | Default | Meaning |
|----------------------|---------|---------|---------|
| `float_notice`       | integer | `5`  | Floats this long or longer are noted (≥ 2) |
| `float_warning`      | integer | `8`  | Floats this long or longer are warnings (≥ `float_notice`) |
| `max_colors_per_row` | integer | `2`  | More colours in one row is a warning (≥ 1) |
| `min_contrast`       | number  | `15` | Minimum CIELAB L* difference (0–100) |

### Palette entry

| Field  | Type   | Required | Meaning |
|--------|--------|----------|---------|
| `id`   | string | yes | Identifier |
| `hex`  | string | yes | `#rrggbb` (either case) |
| `name` | string | no  | Free text, such as a shade name |
| `yarn` | string | no  | Free text, such as a shade number |

### Motif

| Field      | Type            | Required | Meaning |
|------------|-----------------|----------|---------|
| `id`       | string          | yes | Identifier |
| `name`     | string          | no  | |
| `rows`     | array of string | yes | At least one row |
| `mappings` | array           | yes | The motif's mappings, at least one |

- Every row has the same length: the motif width, 1–200. The number of
  rows is the height, 1–200.
- Characters: `0` background, `1` foreground, `2` accent. The character `.`
  is reserved for the future shaping system (no-stitch cells) and is an
  error (E005) in version 1.

### Mapping

A mapping is written inside the motif it belongs to and cannot be used with
any other motif.

| Field    | Type            | Required | Meaning |
|----------|-----------------|----------|---------|
| `id`     | string          | yes | Identifier, unique within the motif |
| `name`   | string          | no  | |
| `colors` | array of string | yes | 1–10 palette ids, each at most once |
| `rows`   | array of string | yes | Exactly one row per motif row |

- `colors` is the mapping's own set of colours. Position 0 is the first
  entry, position 9 the tenth.
- `rows[i]` colours `rows[i]` of the motif, so both lists have the same
  length and the same order.
- Each row is 2 or 3 digits: the position in `colors` of the background,
  then of the foreground, then optionally of the accent. `"02"` is
  background `colors[0]` with foreground `colors[2]`; `"021"` adds accent
  `colors[1]`.
- Replacing a colour in `colors` recolours every row that uses that
  position. Colours in `colors` that no row uses are allowed.

For example, with `"colors": ["cream", "navy", "rust", "gold"]`, the rows
`["01", "02", "03", "02", "01"]` give a five-row motif a cream background
and a navy, rust, gold, rust, navy foreground from bottom to top.

### Band

A band is either a motif band or a spacer. A band with a `color` field is a
spacer; any other band is a motif band. A band with both a `color` and a
`motif` or `mapping` is an error (E001).

A **motif band** knits a motif in one of its mappings:

| Field     | Type    | Required | Meaning |
|-----------|---------|----------|---------|
| `motif`   | string  | yes | Motif id |
| `mapping` | string  | yes | Id of one of that motif's mappings |
| `offset`  | integer | no  | Default `0`. Positive values slide the motif **left** in the chart |
| `times`   | integer | no  | Default `1`. How many times the motif and its colours repeat vertically (≥ 1) |
| `name`    | string  | no  | |

A **spacer** is plain rows in one palette colour:

| Field   | Type    | Required | Meaning |
|---------|---------|----------|---------|
| `color` | string  | yes | Palette colour id |
| `rows`  | integer | no  | Default `1`. Height in chart rows (≥ 1) |
| `name`  | string  | no  | |

A spacer has no offset, and `times` is not one of its fields. Stacked
spacers in different colours make stripes. A motif band whose motif is all
`0` is still valid and knits the same way.

### Identifiers

Ids match `^[a-z0-9][a-z0-9_-]{0,63}$`.

- Palette ids are unique within the palette, and motif ids within the
  motifs.
- Mapping ids are unique within their motif. Two motifs may each have a
  mapping with the same id; a band tells them apart by its motif.
- The same id may appear in different collections.

## Reading direction

The file stores rows in **knitting order**, so it reads upside down compared
with the chart:

- `rows[0]` of a motif is its **bottom** row, the first one knitted.
- `rows[0]` of a mapping colours `rows[0]` of its motif.
- `bands[0]` is the bottom band.
- Character 0 of a motif row is the **leftmost** column in the chart view.

Knitters count differently, and the app, exports and issues use knitter
numbering:

- Chart rows are numbered from **1 at the bottom**.
- Stitches are numbered from **1 at the right edge**, because rounds are
  knitted right to left. Column `c` (0-based from the left) is stitch
  `cast_on − c`.

## How the chart is compiled

The chart is `cast_on` cells wide. The bands are stacked bottom to top; a
spacer adds `rows` rows in which every cell takes its `color`. For a motif
band `b` starting at chart row `R` (the sum of the
heights of the bands below it), with motif `M` of width `w` and height `h`,
`times = t`, mapping `P` (one of `M`'s mappings) and offset `o`, the band is
`h × t` rows tall, and for each band row `j` from `0` to `h × t − 1`:

1. motif row `r = j mod h` (the motif repeats vertically);
2. for each column `c` from `0` to `cast_on − 1`, motif column
   `m = ((c + o) mod w + w) mod w` (a positive offset slides the motif left);
3. symbol `s = M.rows[r][m]`: `0`, `1` or `2`;
4. digit `d` = character `s` of `P.rows[r]`: the background, foreground or
   accent digit of the mapping row for the same motif row;
5. the cell takes the palette colour `P.colors[d]`.

Because a mapping has exactly one row per motif row, each vertical repeat
of a band has the same colours.

If `cast_on` is not a multiple of `w`, the last repeat is cut off at the
right edge. This is allowed but produces W103.

Offset `7` on a 5-wide motif is therefore exactly offset `2`, and offset
`-3` is the same again.

## Validation

Issues have a code, a severity, an English message and a location.

- **Errors** mean the file cannot be compiled reliably. All errors are
  collected in one pass; when any error exists there is no chart, and the app
  keeps showing the last valid one.
- **Warnings** are clear knitting problems the knitter may still accept.
- **Notices** are gentle hints.

### Errors

| Code | Rule |
|------|------|
| E001 | The document is not structurally readable: not JSON (the message gives the line and column), not an object, `format` wrong, `version` missing or not an integer (or below 1), a required field missing, a field of the wrong JSON type (for example `rows` that is not an array of strings), or a band with both a `color` and a `motif` or `mapping` |
| E002 | Duplicate id within the palette, within the motifs, or within one motif's mappings (reported for every repeat after the first) |
| E003 | Unknown reference: band → motif; band → mapping that its motif does not have; spacer `color` → palette colour; mapping `colors` → palette colour; a mapping row digit with no colour at that position |
| E004 | A motif has no rows, empty rows, or rows of different lengths |
| E005 | A motif contains a character other than `0`, `1`, `2` (including `.`, reserved for shaping) |
| E006 | A motif has no mappings; a mapping's `colors` is empty, has more than 10 entries or lists a colour twice; a mapping's number of rows differs from its motif's height (not checked when the motif has E004); a mapping row that is not 2 or 3 digits |
| E007 | A motif row uses `2` but the mapping row for it has no accent digit. Checked for every mapping of the motif, whether or not a band uses it, and reported once per mapping and row |
| E008 | Out-of-range value: `hex` not `#rrggbb`; a gauge value ≤ 0; `cast_on` not a whole number in 1–1000; a motif over 200 × 200; more than 1000 chart rows; `offset` not a whole number; `times` or a spacer's `rows` not a whole number ≥ 1; `float_notice` < 2, not whole, or greater than `float_warning`; `max_colors_per_row` < 1; `min_contrast` outside 0–100; an id that does not match the identifier pattern; a pattern palette with fewer than 2 colours |

E001 is checked first. When a document has E001 issues, the other checks do
not run: on a structurally broken document they would only repeat the same
problem in other words.

### Warnings and notices

| Code | Severity | Rule | Setting |
|------|----------|------|---------|
| W101 | notice or warning | Long float (below) | `float_notice`, `float_warning` |
| W102 | warning | More distinct colours in one chart row than the limit | `max_colors_per_row` |
| W103 | warning | `cast_on` is not a multiple of a band's motif width; once per offending band (spacers fit any cast-on) | — |
| W104 | — | Reserved for the shaping system | — |
| W105 | notice | Low lightness contrast in a mapping row (below) | `min_contrast` |
| W106 | notice | Unknown field ignored (and kept on save) | — |

W101 and W102 need a compiled chart, so they appear only when there are no
errors. W103 and W105 are reported whenever they can be computed.

#### W101: floats

Floats are computed per compiled row, treating the row as a ring because it
is knitted in the round.

1. The row's stitches form a ring.
2. For each colour X in the row, a float of X is a maximal run of
   consecutive ring stitches that are not X, with X on both sides.
3. Its length is the number of stitches in the run.
4. A colour that appears exactly once in a ring of n stitches has one float
   of length n − 1. A colour absent from the row has no floats.
5. One W101 per row and colour, based on the longest float: a **warning** if
   it is at least `float_warning`, otherwise a **notice** if it is at least
   `float_notice`. The location lists every run at or above `float_notice`.

Runs are given in stitch numbers: a run `{ start, length }` covers stitches
`start`, `start + 1`, … leftwards, wrapping from stitch `cast_on` to 1.

Worked cases (`float_notice` 5, `float_warning` 8; letters are colours, each
string one row, the row a ring):

| Case | Row | Result | Why |
|------|-----|--------|-----|
| F1 | `ABABAB` | none | All floats are 1 |
| F2 | `AAAAAAAAAB` | warning: B float 9 | B appears once in 10 stitches |
| F3 | `BBAAAAAABB` | notice: B float 6 | A's float wraps around (stitches 9, 10, 1, 2) and is only 4 |
| F4 | `ABBBBA` | none | The two A stitches meet across the ring, so A's float is 4 |
| F5 | `AAAAAAAAAA` | none | B is absent, so it has no floats |
| F6 | `ABBBBBA` | notice: A float 5 | Lower edge of the notice range |
| F7 | `ABBBBBBBA` | notice: A float 7 | Upper edge of the notice range |
| F8 | `ABBBBBBBBA` | warning: A float 8 | Lower edge of the warning range |

#### W102: colours per row

Count the distinct palette colours among the row's stitches. A mapping row
with the same colour as background and foreground counts it once.

#### W103: repeat fit

The message suggests the nearest cast-on values that suit every band's
width: multiples of their least common multiple, up to 1000. For example,
`cast_on` 124 with motif widths 6 and 8 suggests 120 or 144.

#### W105: contrast

Compute CIELAB L* (D65) of each colour. A notice is raised when the L*
difference between a mapping row's background and its foreground, or its
background and its accent, is below `min_contrast`. Not compared:

- a slot that uses the background colour itself (a solid row is
  deliberate);
- a slot the motif's row does not use, such as the foreground of an
  all-background row or the accent of a row without `2`.

Checked for every mapping, whether or not a band uses it.

### Issue locations

```ts
type Issue = {
  code: string;               // "E003", "W101", ...
  severity: "error" | "warning" | "notice";
  message: string;            // English, human-readable
  location: {
    band?: number;            // 0-based index into bands
    motif?: string;           // motif id
    mapping?: string;         // mapping id, always together with motif
    color?: string;           // palette id
    row?: number;             // chart row, 1-based from the bottom
    stitch?: number;          // 1-based from the right
    runs?: { start: number; length: number }[];  // W101 float runs
    motifRow?: number;        // motif row, 1-based from the bottom
    mappingRow?: number;      // mapping row, 1-based
    path?: string;            // the offending field, such as "bands[2].offset"
  };
};
```

`color`, `motifRow`, `mappingRow` and `path` extend the specification's
location so that, for example, E007 can point at the motif, the mapping and
the row together. Because mapping ids are only unique within a motif, an
issue about a mapping always names its motif too.

## Canonical form

The core writes every file in one canonical form so that git diffs stay
minimal:

- 2-space indent, LF line endings, a trailing newline;
- keys in the order of the tables above; unknown fields after the known
  ones, sorted by key (nested objects inside unknown fields too);
- `meta`, `gauge`, `settings`, palette entries and bands on one line each;
- one motif row and one mapping row per line;
- a motif's `mappings` follow its `rows` inside the motif entry. Each
  mapping starts on its own line with its `id`, `name` and `colors`,
  followed by its rows one per line (see the [full example](#full-example));
- whole numbers without a decimal point (`10`, not `10.0`);
- defaults written out, except a band's `times`, which is omitted when it is
  `1` (`offset` and a spacer's `rows` are always written);
- no column alignment, so renaming one item never touches other lines.

Reading a canonical file and writing it again reproduces it byte for byte.
Files in any other layout are accepted and rewritten canonically on save.

## Library files

Libraries are plain files of reusable motifs (with their mappings) and
palettes, so the community can grow them through pull requests.

- Same envelope as a pattern, with `"format": "fairisle-library"` and
  `"version": 1`.
- `meta` plus either or both of `palette` and `motifs`, with exactly the
  schemas above. No `bands`, `gauge` or `cast_on` (they would be unknown
  fields, W106).
- A mapping in a library may only use palette colours defined in the same
  file (E003 otherwise).
- Validated with the same codes as patterns, except that a library palette
  may have any number of colours.

Projects stay self-contained: inserting a library item copies it into the
project, and a pattern never references a library. A motif comes with all
of its mappings, and they bring the colours they use. When an imported
colour or motif id is already taken, the item is renamed with a numeric
suffix (`peerie-x` → `peerie-x-2`) and references inside the import follow.
An item identical to the one already in the project (same id, same content)
is reused rather than duplicated.

## Compatibility and versions

- **Unknown fields** are reported as W106 and preserved on save.
- **Newer versions**: a file with a higher `version` than the reader supports
  opens read-only, with a notice.
- **Older versions** are migrated on load, one version at a time
  (`core/src/migrate.rs`). Version 1 is the first.
- Reserved for the shaping system: the motif character `.` and warning code
  W104. Later features are planned as additions (an optional `overrides` list
  on bands, a no-stitch sentinel and per-row stitch counts in the compiled
  chart), so version 1 files stay valid.

## Full example

The body of a hat with a peerie band, a flower band using the accent and
cream spacers. It is the fixture `fixtures/hat-basic/input.fairisle.json`,
in canonical form.

```json
{
  "format": "fairisle-pattern",
  "version": 1,
  "meta": { "name": "Peerie hat", "license": "CC-BY-SA-4.0" },
  "gauge": { "stitches": 28, "rows": 32, "per_cm": 10 },
  "cast_on": 120,
  "settings": { "float_notice": 5, "float_warning": 8, "max_colors_per_row": 2, "min_contrast": 15 },
  "palette": [
    { "id": "cream", "hex": "#efe6d2", "name": "Natural" },
    { "id": "navy", "hex": "#1f2a44" },
    { "id": "rust", "hex": "#a4452c" },
    { "id": "gold", "hex": "#d9a441" }
  ],
  "motifs": [
    { "id": "peerie-x", "rows": [
      "100001",
      "010010",
      "001100",
      "010010",
      "100001"
    ], "mappings": [
      { "id": "sunset", "colors": ["cream", "navy", "rust", "gold"], "rows": [
        "01",
        "02",
        "03",
        "02",
        "01"
      ] }
    ] },
    { "id": "flower", "rows": [
      "00010000",
      "00111000",
      "01121100",
      "00111000",
      "00010000"
    ], "mappings": [
      { "id": "flower-colors", "colors": ["cream", "rust", "gold"], "rows": [
        "012",
        "012",
        "012",
        "012",
        "012"
      ] }
    ] }
  ],
  "bands": [
    { "motif": "peerie-x", "mapping": "sunset", "offset": 0 },
    { "color": "cream", "rows": 1 },
    { "motif": "flower", "mapping": "flower-colors", "offset": 3 },
    { "color": "cream", "rows": 2 }
  ]
}
```

It compiles to a chart 120 stitches wide and 13 rows tall: peerie rows 1–5,
spacer row 6, flower rows 7–11 and spacer rows 12–13, with exactly these
issues:

| Code | Severity | Row | Detail |
|------|----------|-----|--------|
| W101 | notice  | 7  | rust float of 7 |
| W101 | notice  | 8  | rust float of 5 |
| W101 | notice  | 9  | cream float of 5 |
| W101 | notice  | 9  | gold float of 7 |
| W102 | warning | 9  | 3 colours (cream, rust, gold) |
| W101 | notice  | 10 | rust float of 5 |
| W101 | notice  | 11 | rust float of 7 |
