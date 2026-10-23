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
    pub mappings: HashMap<&'a str, usize>,
    /// Motif shape is usable: rows present, rectangular, only 0/1/2, in range.
    pub motif_ok: Vec<bool>,
    /// Mapping is usable: rows present, each with 2–3 known palette ids.
    pub mapping_ok: Vec<bool>,
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

impl<'a> Resolved<'a> {
    pub fn new(doc: &'a Document) -> Self {
        let palette = first_index(&doc.palette, |c| c.id.as_str());
        let motif_ok = doc.motifs.iter().map(motif_shape_ok).collect();
        let mapping_ok = doc
            .mappings
            .iter()
            .map(|m| {
                !m.rows.is_empty()
                    && m.rows.iter().all(|row| {
                        (2..=3).contains(&row.len()) && row.iter().all(|id| palette.contains_key(id.as_str()))
                    })
            })
            .collect();
        Resolved {
            motifs: first_index(&doc.motifs, |m| m.id.as_str()),
            mappings: first_index(&doc.mappings, |m| m.id.as_str()),
            palette,
            motif_ok,
            mapping_ok,
        }
    }

    pub fn motif(&self, id: &str) -> Option<usize> {
        self.motifs.get(id).copied()
    }

    pub fn mapping(&self, id: &str) -> Option<usize> {
        self.mappings.get(id).copied()
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

    fn ids<'b>(&mut self, collection: &str, ids: impl Iterator<Item = &'b str>, loc: impl Fn(&str) -> Location) {
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
                    format!("Duplicate id \"{id}\" in {collection}"),
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
        self.ids("palette", doc.palette.iter().map(|c| c.id.as_str()), |id| Location {
            color: Some(id.into()),
            ..Location::default()
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
        self.ids("motifs", doc.motifs.iter().map(|m| m.id.as_str()), |id| Location {
            motif: Some(id.into()),
            ..Location::default()
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

    fn mappings(&mut self) {
        let doc = self.doc;
        self.ids("mappings", doc.mappings.iter().map(|m| m.id.as_str()), |id| Location {
            mapping: Some(id.into()),
            ..Location::default()
        });
        for (i, mapping) in doc.mappings.iter().enumerate() {
            let path = format!("mappings[{i}].rows");
            if mapping.rows.is_empty() {
                self.issues.push(Issue::error(
                    "E006",
                    format!("Mapping \"{}\" has no rows", mapping.id),
                    Location {
                        mapping: Some(mapping.id.clone()),
                        path: Some(path),
                        ..Location::default()
                    },
                ));
                continue;
            }
            for (r, row) in mapping.rows.iter().enumerate() {
                let loc = Location {
                    mapping: Some(mapping.id.clone()),
                    mapping_row: Some(r + 1),
                    path: Some(format!("{path}[{r}]")),
                    ..Location::default()
                };
                if !(2..=3).contains(&row.len()) {
                    self.issues.push(Issue::error(
                        "E006",
                        format!(
                            "Mapping \"{}\" row {} has {} {}; it needs [background, foreground] or [background, foreground, accent]",
                            mapping.id,
                            r + 1,
                            row.len(),
                            if row.len() == 1 { "entry" } else { "entries" }
                        ),
                        loc.clone(),
                    ));
                }
                for id in row {
                    if !self.r.palette.contains_key(id.as_str()) {
                        self.issues.push(Issue::error(
                            "E003",
                            format!("Mapping \"{}\" row {} uses unknown colour \"{id}\"", mapping.id, r + 1),
                            Location {
                                color: Some(id.clone()),
                                ..loc.clone()
                            },
                        ));
                    }
                }
            }
        }
    }

    fn bands(&mut self) {
        let doc = self.doc;
        // Chart row (0-based) where the current band starts, while known.
        let mut start: Option<usize> = Some(0);
        let mut total: usize = 0;
        for (b, band) in doc.bands.iter().enumerate() {
            let loc = || Location {
                band: Some(b),
                ..Location::default()
            };
            let motif = self.r.motif(&band.motif);
            let mapping = self.r.mapping(&band.mapping);
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
            if mapping.is_none() {
                self.issues.push(Issue::error(
                    "E003",
                    format!("Band {} uses unknown mapping \"{}\"", b + 1, band.mapping),
                    Location {
                        mapping: Some(band.mapping.clone()),
                        path: Some(format!("bands[{b}].mapping")),
                        ..loc()
                    },
                ));
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

            let height = self.r.band_height(doc, band);
            if let (Some(m), Some(p), Some(h)) = (motif, mapping, height) {
                if self.r.mapping_ok[p] {
                    self.missing_accent(b, &doc.motifs[m], &doc.mappings[p], h, start);
                }
            }
            match height {
                Some(h) => {
                    total = total.saturating_add(h);
                    start = start.and_then(|s| s.checked_add(h));
                }
                None => start = None,
            }
        }
        if total > MAX_CHART_ROWS {
            self.issues.push(range_error(
                "bands",
                format!("The bands add up to {total} chart rows; the limit is {MAX_CHART_ROWS}"),
            ));
        }
    }

    /// E007: a motif row uses the accent but the mapping row applied to it
    /// has none. Reported once per (motif row, mapping row) pair.
    fn missing_accent(&mut self, b: usize, motif: &Motif, mapping: &Mapping, height: usize, start: Option<usize>) {
        let h = motif.rows.len();
        let k = mapping.rows.len();
        let uses_accent: Vec<bool> = motif.rows.iter().map(|r| r.contains('2')).collect();
        if !uses_accent.iter().any(|u| *u) {
            return;
        }
        let mut seen = HashSet::new();
        // Every (j mod h, j mod k) pair occurs within the first h × k rows.
        for j in 0..height.min(h.saturating_mul(k)) {
            let r = j % h;
            let p = j % k;
            if uses_accent[r] && mapping.rows[p].len() < 3 && seen.insert((r, p)) {
                self.issues.push(Issue::error(
                    "E007",
                    format!(
                        "Band {}: motif \"{}\" row {} uses the accent, but mapping \"{}\" row {} has no accent colour",
                        b + 1,
                        motif.id,
                        r + 1,
                        mapping.id,
                        p + 1
                    ),
                    Location {
                        band: Some(b),
                        motif: Some(motif.id.clone()),
                        mapping: Some(mapping.id.clone()),
                        row: start.map(|s| s + j + 1),
                        motif_row: Some(r + 1),
                        mapping_row: Some(p + 1),
                        ..Location::default()
                    },
                ));
            }
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

    /// W105: low L* contrast between background and foreground or accent.
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
        for (i, mapping) in doc.mappings.iter().enumerate() {
            if !self.r.mapping_ok[i] {
                continue;
            }
            for (r, row) in mapping.rows.iter().enumerate() {
                let bg = &row[0];
                let Some(l_bg) = lightness_of(bg) else { continue };
                let mut low = Vec::new();
                for (role, id) in [("foreground", row.get(1)), ("accent", row.get(2))] {
                    let Some(id) = id else { continue };
                    if id == bg {
                        // Same colour on purpose, such as a solid row.
                        continue;
                    }
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
                            "Low contrast in mapping \"{}\" row {}: {} (minimum {})",
                            mapping.id,
                            r + 1,
                            low.join("; "),
                            crate::write::number(min)
                        ),
                        Location {
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

/// Widths of the usable motifs used by bands.
pub fn band_widths(doc: &Document, r: &Resolved) -> Vec<usize> {
    doc.bands
        .iter()
        .filter_map(|band| r.motif(&band.motif))
        .filter(|m| r.motif_ok[*m])
        .map(|m| motif_width(&doc.motifs[m]))
        .collect()
}
