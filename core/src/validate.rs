//! Document-level checks (section 6): errors E002–E008 and the warnings that
//! do not need a compiled chart (W103, W105).

use std::collections::{HashMap, HashSet};

use crate::color::{lightness, parse_hex};
use crate::compile::suggest;
use crate::issue::{Issue, Location};
use crate::model::*;

pub const MAX_CAST_ON: i64 = 1000;
pub const MAX_MOTIF_SIZE: usize = 200;
pub const MAX_CHART_ROWS: usize = 1000;

/// Lookups and per-entry validity shared by the checks and the compiler.
pub struct Resolved<'a> {
    pub palette: HashMap<&'a str, usize>,
    pub motifs: HashMap<&'a str, usize>,
    /// Per motif: mapping id → index into that motif's `mappings`.
    pub mappings: Vec<HashMap<&'a str, usize>>,
    /// Motif shape is usable: rows present, rectangular, only 0/1/2, in range.
    pub motif_ok: Vec<bool>,
    /// Per motif and mapping: the mapping can colour its motif. Its colours
    /// are 1–10 known palette ids, and it has one row per motif row, each
    /// 2–3 digits naming existing positions.
    pub mapping_ok: Vec<Vec<bool>>,
}

fn first_index<'a, T>(items: &'a [T], id: impl Fn(&'a T) -> &'a str) -> HashMap<&'a str, usize> {
    let mut map = HashMap::new();
    for (i, item) in items.iter().enumerate() {
        map.entry(id(item)).or_insert(i);
    }
    map
}

pub fn motif_width(motif: &Motif) -> usize {
    motif.rows.first().map_or(0, |r| r.chars().count())
}

fn motif_shape_ok(motif: &Motif) -> bool {
    if motif.rows.is_empty() || motif.rows.len() > MAX_MOTIF_SIZE {
        return false;
    }
    let w = motif_width(motif);
    w > 0
        && w <= MAX_MOTIF_SIZE
        && motif
            .rows
            .iter()
            .all(|r| r.len() == w && r.bytes().all(|b| matches!(b, b'0' | b'1' | b'2')))
}

/// A mapping row is 2 or 3 digits.
pub fn row_digits(row: &str) -> Option<Vec<usize>> {
    let digits: Vec<usize> = row
        .chars()
        .map(|ch| ch.to_digit(10).map(|d| d as usize))
        .collect::<Option<_>>()?;
    (2..=3).contains(&digits.len()).then_some(digits)
}

fn colors_ok(mapping: &Mapping, palette: &HashMap<&str, usize>) -> bool {
    let n = mapping.colors.len();
    let distinct: HashSet<&str> = mapping.colors.iter().map(String::as_str).collect();
    (1..=MAX_MAPPING_COLORS).contains(&n)
        && distinct.len() == n
        && mapping.colors.iter().all(|id| palette.contains_key(id.as_str()))
}

impl<'a> Resolved<'a> {
    pub fn new(doc: &'a Document) -> Self {
        let palette = first_index(&doc.palette, |c| c.id.as_str());
        let motif_ok = doc.motifs.iter().map(motif_shape_ok).collect();
        let mapping_ok = doc
            .motifs
            .iter()
            .map(|motif| {
                motif
                    .mappings
                    .iter()
                    .map(|m| {
                        colors_ok(m, &palette)
                            && m.rows.len() == motif.rows.len()
                            && m.rows.iter().all(|row| {
                                row_digits(row).is_some_and(|digits| digits.iter().all(|d| *d < m.colors.len()))
                            })
                    })
                    .collect()
            })
            .collect();
        Resolved {
            motifs: first_index(&doc.motifs, |m| m.id.as_str()),
            mappings: doc
                .motifs
                .iter()
                .map(|m| first_index(&m.mappings, |p| p.id.as_str()))
                .collect(),
            palette,
            motif_ok,
            mapping_ok,
        }
    }

    pub fn motif(&self, id: &str) -> Option<usize> {
        self.motifs.get(id).copied()
    }

    /// Index of mapping `id` within motif `motif`.
    pub fn mapping(&self, motif: usize, id: &str) -> Option<usize> {
        self.mappings.get(motif)?.get(id).copied()
    }

    /// The band's motif height times `times`, when both are usable.
    pub fn band_height(&self, doc: &Document, band: &Band) -> Option<usize> {
        let m = self.motif(&band.motif)?;
        if !self.motif_ok[m] {
            return None;
        }
        let times = as_int(band.times).filter(|t| *t >= 1)?;
        let times = usize::try_from(times).ok()?;
        doc.motifs[m].rows.len().checked_mul(times)
    }
}

pub fn check(doc: &Document) -> Vec<Issue> {
    let resolved = Resolved::new(doc);
    let mut c = Checker {
        doc,
        r: &resolved,
        issues: Vec::new(),
    };
    if doc.kind == Kind::Pattern {
        c.gauge();
        c.cast_on();
        c.settings();
    }
    c.palette();
    c.motifs();
    c.mappings();
    c.missing_accent();
    if doc.kind == Kind::Pattern {
        c.bands();
        c.repeat_fit();
    }
    c.contrast();
    c.issues
}

struct Checker<'a> {
    doc: &'a Document,
    r: &'a Resolved<'a>,
    issues: Vec<Issue>,
}

fn range_error(path: &str, message: String) -> Issue {
    Issue::error("E008", message, Location::at(path))
}

impl Checker<'_> {
    fn gauge(&mut self) {
        let g = &self.doc.gauge;
        for (key, value) in [("stitches", g.stitches), ("rows", g.rows), ("per_cm", g.per_cm)] {
            if !(value.is_finite() && value > 0.0) {
                self.issues.push(range_error(
                    &format!("gauge.{key}"),
                    format!("gauge.{key} must be greater than 0"),
                ));
            }
        }
    }

    fn cast_on(&mut self) {
        let ok = as_int(self.doc.cast_on).is_some_and(|n| (1..=MAX_CAST_ON).contains(&n));
        if !ok {
            self.issues.push(range_error(
                "cast_on",
                format!("cast_on must be a whole number from 1 to {MAX_CAST_ON}"),
            ));
        }
    }

    fn settings(&mut self) {
        let s = &self.doc.settings;
        let notice = as_int(s.float_notice);
        let warning = as_int(s.float_warning);
        match notice {
            Some(n) if n >= 2 => {}
            _ => self.issues.push(range_error(
                "settings.float_notice",
                "settings.float_notice must be a whole number of at least 2".into(),
            )),
        }
        match warning {
            None => self.issues.push(range_error(
                "settings.float_warning",
                "settings.float_warning must be a whole number".into(),
            )),
            Some(w) => {
                if notice.is_some_and(|n| n > w) {
                    self.issues.push(range_error(
                        "settings.float_notice",
                        "settings.float_notice must not be greater than settings.float_warning".into(),
                    ));
                }
            }
        }
        if !as_int(s.max_colors_per_row).is_some_and(|n| n >= 1) {
            self.issues.push(range_error(
                "settings.max_colors_per_row",
                "settings.max_colors_per_row must be a whole number of at least 1".into(),
            ));
        }
        if !(s.min_contrast.is_finite() && (0.0..=100.0).contains(&s.min_contrast)) {
            self.issues.push(range_error(
                "settings.min_contrast",
                "settings.min_contrast must be between 0 and 100".into(),
            ));
        }
    }

    /// E008 for invalid ids and E002 for repeats. `collection` is the path
    /// of the list; `label` names it in messages.
    fn ids<'b>(
        &mut self,
        collection: &str,
        label: &str,
        ids: impl Iterator<Item = &'b str>,
        loc: impl Fn(&str) -> Location,
    ) {
        let mut seen = HashSet::new();
        for (i, id) in ids.enumerate() {
            let path = format!("{collection}[{i}].id");
            if !is_valid_id(id) {
                self.issues.push(Issue::error(
                    "E008",
                    format!("{path} \"{id}\" is not a valid id: use 1–64 lowercase letters, digits, - or _, starting with a letter or digit"),
                    Location { path: Some(path.clone()), ..loc(id) },
                ));
            }
            if !seen.insert(id) {
                self.issues.push(Issue::error(
                    "E002",
                    format!("Duplicate id \"{id}\" in {label}"),
                    Location {
                        path: Some(path),
                        ..loc(id)
                    },
                ));
            }
        }
    }

    fn palette(&mut self) {
        let doc = self.doc;
        self.ids("palette", "palette", doc.palette.iter().map(|c| c.id.as_str()), |id| {
            Location {
                color: Some(id.into()),
                ..Location::default()
            }
        });
        for (i, c) in doc.palette.iter().enumerate() {
            if parse_hex(&c.hex).is_none() {
                self.issues.push(Issue::error(
                    "E008",
                    format!("Colour \"{}\" has hex \"{}\"; it must be #rrggbb", c.id, c.hex),
                    Location {
                        color: Some(c.id.clone()),
                        path: Some(format!("palette[{i}].hex")),
                        ..Location::default()
                    },
                ));
            }
        }
        if doc.kind == Kind::Pattern && doc.palette.len() < 2 {
            self.issues
                .push(range_error("palette", "The palette needs at least 2 colours".into()));
        }
    }

    fn motifs(&mut self) {
        let doc = self.doc;
        self.ids("motifs", "motifs", doc.motifs.iter().map(|m| m.id.as_str()), |id| {
            Location {
                motif: Some(id.into()),
                ..Location::default()
            }
        });
        for (i, motif) in doc.motifs.iter().enumerate() {
            let loc = |path: String, row: Option<usize>| Location {
                motif: Some(motif.id.clone()),
                path: Some(path),
                motif_row: row,
                ..Location::default()
            };
            let path = format!("motifs[{i}].rows");
            if motif.rows.is_empty() {
                self.issues.push(Issue::error(
                    "E004",
                    format!("Motif \"{}\" has no rows", motif.id),
                    loc(path, None),
                ));
                continue;
            }
            let width = motif_width(motif);
            if width == 0 {
                self.issues.push(Issue::error(
                    "E004",
                    format!("Motif \"{}\" has empty rows", motif.id),
                    loc(path.clone(), Some(1)),
                ));
            }
            for (r, row) in motif.rows.iter().enumerate() {
                let len = row.chars().count();
                if len != width {
                    self.issues.push(Issue::error(
                        "E004",
                        format!(
                            "Motif \"{}\" row {} is {len} stitches wide; row 1 is {width}",
                            motif.id,
                            r + 1
                        ),
                        loc(format!("{path}[{r}]"), Some(r + 1)),
                    ));
                }
                let bad: Vec<String> = row
                    .chars()
                    .enumerate()
                    .filter(|(_, ch)| !matches!(ch, '0' | '1' | '2'))
                    .map(|(pos, ch)| format!("'{ch}' at position {}", pos + 1))
                    .collect();
                if !bad.is_empty() {
                    let reserved = if row.contains('.') {
                        " ('.' is reserved for the future shaping system)"
                    } else {
                        ""
                    };
                    self.issues.push(Issue::error(
                        "E005",
                        format!(
                            "Motif \"{}\" row {} may only contain 0, 1 and 2; found {}{reserved}",
                            motif.id,
                            r + 1,
                            bad.join(", ")
                        ),
                        loc(format!("{path}[{r}]"), Some(r + 1)),
                    ));
                }
            }
            if width > MAX_MOTIF_SIZE || motif.rows.len() > MAX_MOTIF_SIZE {
                self.issues.push(Issue::error(
                    "E008",
                    format!(
                        "Motif \"{}\" is {width}×{}; motifs may be at most {MAX_MOTIF_SIZE}×{MAX_MOTIF_SIZE}",
                        motif.id,
                        motif.rows.len()
                    ),
                    loc(path, None),
                ));
            }
        }
    }

    /// E002, E003, E006 and E008 for every motif's mappings.
    fn mappings(&mut self) {
        let doc = self.doc;
        for (i, motif) in doc.motifs.iter().enumerate() {
            let motif_path = format!("motifs[{i}].mappings");
            if motif.mappings.is_empty() {
                self.issues.push(Issue::error(
                    "E006",
                    format!("Motif \"{}\" has no mappings; it needs at least one", motif.id),
                    Location {
                        motif: Some(motif.id.clone()),
                        path: Some(motif_path.clone()),
                        ..Location::default()
                    },
                ));
            }
            self.ids(
                &motif_path,
                &format!("the mappings of motif \"{}\"", motif.id),
                motif.mappings.iter().map(|m| m.id.as_str()),
                |id| Location {
                    motif: Some(motif.id.clone()),
                    mapping: Some(id.into()),
                    ..Location::default()
                },
            );
            // The row count is only compared with a motif whose rows are sound (no E004).
            let width = motif_width(motif);
            let height = (!motif.rows.is_empty() && width > 0 && motif.rows.iter().all(|r| r.chars().count() == width))
                .then_some(motif.rows.len());
            for (j, mapping) in motif.mappings.iter().enumerate() {
                self.mapping(motif, mapping, &format!("{motif_path}[{j}]"), height);
            }
        }
    }

    fn mapping(&mut self, motif: &Motif, mapping: &Mapping, path: &str, height: Option<usize>) {
        let name = format!("Mapping \"{}\" of motif \"{}\"", mapping.id, motif.id);
        let loc = |path: String, row: Option<usize>| Location {
            motif: Some(motif.id.clone()),
            mapping: Some(mapping.id.clone()),
            mapping_row: row,
            path: Some(path),
            ..Location::default()
        };

        let n = mapping.colors.len();
        if n == 0 {
            self.issues.push(Issue::error(
                "E006",
                format!("{name} has no colours"),
                loc(format!("{path}.colors"), None),
            ));
        } else if n > MAX_MAPPING_COLORS {
            self.issues.push(Issue::error(
                "E006",
                format!("{name} has {n} colours; a mapping may have at most {MAX_MAPPING_COLORS}"),
                loc(format!("{path}.colors"), None),
            ));
        }
        let mut seen = HashSet::new();
        for (c, id) in mapping.colors.iter().enumerate() {
            let at = format!("{path}.colors[{c}]");
            if !seen.insert(id.as_str()) {
                self.issues.push(Issue::error(
                    "E006",
                    format!("{name} lists colour \"{id}\" more than once"),
                    Location {
                        color: Some(id.clone()),
                        ..loc(at.clone(), None)
                    },
                ));
            }
            if !self.r.palette.contains_key(id.as_str()) {
                self.issues.push(Issue::error(
                    "E003",
                    format!("{name} uses unknown colour \"{id}\""),
                    Location {
                        color: Some(id.clone()),
                        ..loc(at, None)
                    },
                ));
            }
        }

        if let Some(h) = height {
            if mapping.rows.len() != h {
                self.issues.push(Issue::error(
                    "E006",
                    format!(
                        "{name} has {} {}; it needs one per motif row ({h})",
                        mapping.rows.len(),
                        if mapping.rows.len() == 1 { "row" } else { "rows" }
                    ),
                    loc(format!("{path}.rows"), None),
                ));
            }
        }
        for (r, row) in mapping.rows.iter().enumerate() {
            let at = format!("{path}.rows[{r}]");
            match row_digits(row) {
                None => self.issues.push(Issue::error(
                    "E006",
                    format!(
                        "{name} row {} is \"{row}\"; it needs 2 or 3 digits: background, foreground and optionally accent",
                        r + 1
                    ),
                    loc(at, Some(r + 1)),
                )),
                // With no colours at all, E006 above already says it.
                Some(digits) if n > 0 => {
                    let mut reported = HashSet::new();
                    for d in digits {
                        if d >= n && reported.insert(d) {
                            self.issues.push(Issue::error(
                                "E003",
                                format!(
                                    "{name} row {} uses colour {d}, but the mapping has no colour at position {d}",
                                    r + 1
                                ),
                                loc(at.clone(), Some(r + 1)),
                            ));
                        }
                    }
                }
                Some(_) => {}
            }
        }
    }

    /// E007: a motif row uses the accent but its mapping row has no accent
    /// digit. Checked for every mapping, whether or not a band uses it.
    fn missing_accent(&mut self) {
        let doc = self.doc;
        for motif in &doc.motifs {
            for mapping in &motif.mappings {
                for (r, (motif_row, row)) in motif.rows.iter().zip(&mapping.rows).enumerate() {
                    let digits = row_digits(row);
                    if motif_row.contains('2') && digits.is_some_and(|d| d.len() < 3) {
                        self.issues.push(Issue::error(
                            "E007",
                            format!(
                                "Motif \"{}\" row {} uses the accent, but mapping \"{}\" row {} has no accent colour",
                                motif.id,
                                r + 1,
                                mapping.id,
                                r + 1
                            ),
                            Location {
                                motif: Some(motif.id.clone()),
                                mapping: Some(mapping.id.clone()),
                                motif_row: Some(r + 1),
                                mapping_row: Some(r + 1),
                                ..Location::default()
                            },
                        ));
                    }
                }
            }
        }
    }

    fn bands(&mut self) {
        let doc = self.doc;
        let mut total: usize = 0;
        for (b, band) in doc.bands.iter().enumerate() {
            let loc = || Location {
                band: Some(b),
                ..Location::default()
            };
            let motif = self.r.motif(&band.motif);
            if motif.is_none() {
                self.issues.push(Issue::error(
                    "E003",
                    format!("Band {} uses unknown motif \"{}\"", b + 1, band.motif),
                    Location {
                        motif: Some(band.motif.clone()),
                        path: Some(format!("bands[{b}].motif")),
                        ..loc()
                    },
                ));
            }
            if let Some(m) = motif {
                if self.r.mapping(m, &band.mapping).is_none() {
                    self.issues.push(Issue::error(
                        "E003",
                        format!(
                            "Band {} uses mapping \"{}\", but motif \"{}\" has no mapping with that id",
                            b + 1,
                            band.mapping,
                            band.motif
                        ),
                        Location {
                            motif: Some(band.motif.clone()),
                            mapping: Some(band.mapping.clone()),
                            path: Some(format!("bands[{b}].mapping")),
                            ..loc()
                        },
                    ));
                }
            }
            if as_int(band.offset).is_none() {
                self.issues.push(Issue::error(
                    "E008",
                    format!("Band {} offset must be a whole number", b + 1),
                    Location {
                        path: Some(format!("bands[{b}].offset")),
                        ..loc()
                    },
                ));
            }
            if !as_int(band.times).is_some_and(|t| t >= 1) {
                self.issues.push(Issue::error(
                    "E008",
                    format!("Band {} times must be a whole number of at least 1", b + 1),
                    Location {
                        path: Some(format!("bands[{b}].times")),
                        ..loc()
                    },
                ));
            }

            if let Some(h) = self.r.band_height(doc, band) {
                total = total.saturating_add(h);
            }
        }
        if total > MAX_CHART_ROWS {
            self.issues.push(range_error(
                "bands",
                format!("The bands add up to {total} chart rows; the limit is {MAX_CHART_ROWS}"),
            ));
        }
    }

    /// W103: cast_on is not a multiple of a band's motif width.
    fn repeat_fit(&mut self) {
        let doc = self.doc;
        let Some(cast_on) = as_int(doc.cast_on).filter(|n| (1..=MAX_CAST_ON).contains(n)) else {
            return;
        };
        let widths = band_widths(doc, self.r);
        let suggestions = suggest(cast_on, &widths);
        let advice = match suggestions.as_slice() {
            [] => "No cast-on up to 1000 fits every band".to_string(),
            [one] => format!("A cast-on that fits every band: {one}"),
            [a, b, ..] => format!("Cast-on values that fit every band: {a} or {b}"),
        };
        for (b, band) in doc.bands.iter().enumerate() {
            let Some(m) = self.r.motif(&band.motif).filter(|m| self.r.motif_ok[*m]) else {
                continue;
            };
            let motif = &doc.motifs[m];
            let w = motif_width(motif) as i64;
            if cast_on % w != 0 {
                self.issues.push(Issue::warning(
                    "W103",
                    format!(
                        "Cast-on {cast_on} is not a multiple of motif \"{}\" width {w}, so its last repeat is cut off. {advice}",
                        motif.id
                    ),
                    Location {
                        band: Some(b),
                        motif: Some(motif.id.clone()),
                        ..Location::default()
                    },
                ));
            }
        }
    }

    /// W105: low L* contrast between background and foreground or accent,
    /// for the slots the motif row uses.
    fn contrast(&mut self) {
        let doc = self.doc;
        let min = doc.settings.min_contrast;
        if !min.is_finite() {
            return;
        }
        let lightness_of = |id: &str| -> Option<f64> {
            let c = &doc.palette[*self.r.palette.get(id)?];
            parse_hex(&c.hex).map(lightness)
        };
        for (m, motif) in doc.motifs.iter().enumerate() {
            for (p, mapping) in motif.mappings.iter().enumerate() {
                if !self.r.mapping_ok[m][p] {
                    continue;
                }
                for (r, row) in mapping.rows.iter().enumerate() {
                    let Some(digits) = row_digits(row) else { continue };
                    let motif_row = &motif.rows[r];
                    let bg = &mapping.colors[digits[0]];
                    let Some(l_bg) = lightness_of(bg) else { continue };
                    let mut low = Vec::new();
                    for (role, symbol, slot) in [("foreground", '1', 1), ("accent", '2', 2)] {
                        let Some(d) = digits.get(slot) else { continue };
                        if *d == digits[0] || !motif_row.contains(symbol) {
                            // The background itself (such as a solid row), or a
                            // slot this row does not use.
                            continue;
                        }
                        let id = &mapping.colors[*d];
                        let Some(l) = lightness_of(id) else { continue };
                        let diff = (l_bg - l).abs();
                        if diff < min {
                            low.push(format!("{role} {id} differs from background {bg} by {diff:.1} L*"));
                        }
                    }
                    if !low.is_empty() {
                        self.issues.push(Issue::notice(
                            "W105",
                            format!(
                                "Low contrast in mapping \"{}\" of motif \"{}\" row {}: {} (minimum {})",
                                mapping.id,
                                motif.id,
                                r + 1,
                                low.join("; "),
                                crate::write::number(min)
                            ),
                            Location {
                                motif: Some(motif.id.clone()),
                                mapping: Some(mapping.id.clone()),
                                mapping_row: Some(r + 1),
                                ..Location::default()
                            },
                        ));
                    }
                }
            }
        }
    }
}

/// Widths of the usable motifs used by bands.
pub fn band_widths(doc: &Document, r: &Resolved) -> Vec<usize> {
    doc.bands
        .iter()
        .filter_map(|band| r.motif(&band.motif))
        .filter(|m| r.motif_ok[*m])
        .map(|m| motif_width(&doc.motifs[m]))
        .collect()
}
