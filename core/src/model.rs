//! Typed view of a document (section 4).
//!
//! Values are kept as written, even when they are out of range, so that the
//! editor can show and fix them: integer fields are stored as `f64` and
//! checked by the validator. Unknown fields are kept in `extra` and written
//! back on save.

use serde_json::{Map, Value};

pub const PATTERN_FORMAT: &str = "fairisle-pattern";
pub const LIBRARY_FORMAT: &str = "fairisle-library";

pub const DEFAULT_PER_CM: f64 = 10.0;
pub const DEFAULT_FLOAT_NOTICE: f64 = 5.0;
pub const DEFAULT_FLOAT_WARNING: f64 = 8.0;
pub const DEFAULT_MAX_COLORS_PER_ROW: f64 = 2.0;
pub const DEFAULT_MIN_CONTRAST: f64 = 15.0;

pub type Extra = Map<String, Value>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Pattern,
    Library,
}

impl Kind {
    pub fn format(self) -> &'static str {
        match self {
            Kind::Pattern => PATTERN_FORMAT,
            Kind::Library => LIBRARY_FORMAT,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Meta {
    pub name: String,
    pub author: Option<String>,
    pub license: Option<String>,
    pub description: Option<String>,
    pub created: Option<String>,
    pub modified: Option<String>,
    pub extra: Extra,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Gauge {
    pub stitches: f64,
    pub rows: f64,
    pub per_cm: f64,
    pub extra: Extra,
}

impl Default for Gauge {
    fn default() -> Self {
        Gauge {
            stitches: 0.0,
            rows: 0.0,
            per_cm: DEFAULT_PER_CM,
            extra: Extra::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Settings {
    pub float_notice: f64,
    pub float_warning: f64,
    pub max_colors_per_row: f64,
    pub min_contrast: f64,
    pub extra: Extra,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            float_notice: DEFAULT_FLOAT_NOTICE,
            float_warning: DEFAULT_FLOAT_WARNING,
            max_colors_per_row: DEFAULT_MAX_COLORS_PER_ROW,
            min_contrast: DEFAULT_MIN_CONTRAST,
            extra: Extra::new(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Color {
    pub id: String,
    pub hex: String,
    pub name: Option<String>,
    pub yarn: Option<String>,
    pub extra: Extra,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Motif {
    pub id: String,
    pub name: Option<String>,
    /// `rows[0]` is the bottom row; character 0 is the leftmost column.
    pub rows: Vec<String>,
    /// The motif's colourways. Ids are unique within the motif.
    pub mappings: Vec<Mapping>,
    pub extra: Extra,
}

/// The most colours one mapping may list.
pub const MAX_MAPPING_COLORS: usize = 10;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Mapping {
    pub id: String,
    pub name: Option<String>,
    /// Palette ids; a row refers to them by position.
    pub colors: Vec<String>,
    /// One row per motif row, in the same order. Each row is 2 or 3 digits:
    /// the positions in `colors` of background, foreground and accent.
    pub rows: Vec<String>,
    pub extra: Extra,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Band {
    pub kind: BandKind,
    pub name: Option<String>,
    pub extra: Extra,
}

/// A band is a motif in one of its mappings, or a spacer: plain rows in one
/// palette colour. A band with a `color` field is a spacer.
#[derive(Clone, Debug, PartialEq)]
pub enum BandKind {
    Motif {
        motif: String,
        mapping: String,
        offset: f64,
        times: f64,
        /// Mirror the motif left to right.
        flip_horizontal: bool,
        /// Turn the motif upside down, with its mapping's colours.
        flip_vertical: bool,
    },
    Spacer {
        color: String,
        rows: f64,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub struct Document {
    pub kind: Kind,
    pub version: i64,
    pub meta: Meta,
    pub gauge: Gauge,
    pub cast_on: f64,
    pub settings: Settings,
    pub palette: Vec<Color>,
    pub motifs: Vec<Motif>,
    /// First element = bottom band.
    pub bands: Vec<Band>,
    pub extra: Extra,
}

/// Returns `n` as an integer if it is a whole number that a JavaScript
/// number can represent exactly.
pub fn as_int(n: f64) -> Option<i64> {
    const LIMIT: f64 = 9_007_199_254_740_992.0; // 2^53
    if n.is_finite() && n.fract() == 0.0 && n.abs() <= LIMIT {
        Some(n as i64)
    } else {
        None
    }
}

/// `^[a-z0-9][a-z0-9_-]{0,63}$`
pub fn is_valid_id(id: &str) -> bool {
    let bytes = id.as_bytes();
    if bytes.is_empty() || bytes.len() > 64 {
        return false;
    }
    let first_ok = bytes[0].is_ascii_lowercase() || bytes[0].is_ascii_digit();
    first_ok
        && bytes[1..]
            .iter()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'_' || *b == b'-')
}

fn num(n: f64) -> Value {
    match as_int(n) {
        Some(i) => Value::from(i),
        None => Value::from(n),
    }
}

fn put_opt(map: &mut Extra, key: &str, value: &Option<String>) {
    if let Some(v) = value {
        map.insert(key.to_string(), Value::from(v.clone()));
    }
}

fn with_extra(mut map: Extra, extra: &Extra) -> Value {
    for (k, v) in extra {
        map.insert(k.clone(), v.clone());
    }
    Value::Object(map)
}

impl Document {
    /// The normalized document as a JSON value: defaults filled in, unknown
    /// fields kept. This is what `parse` hands to the UI.
    pub fn to_value(&self) -> Value {
        let mut root = Extra::new();
        root.insert("format".into(), self.kind.format().into());
        root.insert("version".into(), self.version.into());

        let mut meta = Extra::new();
        meta.insert("name".into(), self.meta.name.clone().into());
        put_opt(&mut meta, "author", &self.meta.author);
        put_opt(&mut meta, "license", &self.meta.license);
        put_opt(&mut meta, "description", &self.meta.description);
        put_opt(&mut meta, "created", &self.meta.created);
        put_opt(&mut meta, "modified", &self.meta.modified);
        root.insert("meta".into(), with_extra(meta, &self.meta.extra));

        if self.kind == Kind::Pattern {
            let mut gauge = Extra::new();
            gauge.insert("stitches".into(), num(self.gauge.stitches));
            gauge.insert("rows".into(), num(self.gauge.rows));
            gauge.insert("per_cm".into(), num(self.gauge.per_cm));
            root.insert("gauge".into(), with_extra(gauge, &self.gauge.extra));
            root.insert("cast_on".into(), num(self.cast_on));

            let s = &self.settings;
            let mut settings = Extra::new();
            settings.insert("float_notice".into(), num(s.float_notice));
            settings.insert("float_warning".into(), num(s.float_warning));
            settings.insert("max_colors_per_row".into(), num(s.max_colors_per_row));
            settings.insert("min_contrast".into(), num(s.min_contrast));
            root.insert("settings".into(), with_extra(settings, &s.extra));
        }

        let palette = self
            .palette
            .iter()
            .map(|c| {
                let mut m = Extra::new();
                m.insert("id".into(), c.id.clone().into());
                m.insert("hex".into(), c.hex.clone().into());
                put_opt(&mut m, "name", &c.name);
                put_opt(&mut m, "yarn", &c.yarn);
                with_extra(m, &c.extra)
            })
            .collect();
        root.insert("palette".into(), Value::Array(palette));

        let motifs = self
            .motifs
            .iter()
            .map(|motif| {
                let mut m = Extra::new();
                m.insert("id".into(), motif.id.clone().into());
                put_opt(&mut m, "name", &motif.name);
                m.insert("rows".into(), motif.rows.clone().into());
                let mappings = motif
                    .mappings
                    .iter()
                    .map(|mapping| {
                        let mut p = Extra::new();
                        p.insert("id".into(), mapping.id.clone().into());
                        put_opt(&mut p, "name", &mapping.name);
                        p.insert("colors".into(), mapping.colors.clone().into());
                        p.insert("rows".into(), mapping.rows.clone().into());
                        with_extra(p, &mapping.extra)
                    })
                    .collect();
                m.insert("mappings".into(), Value::Array(mappings));
                with_extra(m, &motif.extra)
            })
            .collect();
        root.insert("motifs".into(), Value::Array(motifs));

        if self.kind == Kind::Pattern {
            let bands = self
                .bands
                .iter()
                .map(|band| {
                    let mut m = Extra::new();
                    match &band.kind {
                        BandKind::Motif {
                            motif,
                            mapping,
                            offset,
                            times,
                            flip_horizontal,
                            flip_vertical,
                        } => {
                            m.insert("motif".into(), motif.clone().into());
                            m.insert("mapping".into(), mapping.clone().into());
                            m.insert("offset".into(), num(*offset));
                            m.insert("times".into(), num(*times));
                            m.insert("flip_horizontal".into(), (*flip_horizontal).into());
                            m.insert("flip_vertical".into(), (*flip_vertical).into());
                        }
                        BandKind::Spacer { color, rows } => {
                            m.insert("color".into(), color.clone().into());
                            m.insert("rows".into(), num(*rows));
                        }
                    }
                    put_opt(&mut m, "name", &band.name);
                    with_extra(m, &band.extra)
                })
                .collect();
            root.insert("bands".into(), Value::Array(bands));
        }

        with_extra(root, &self.extra)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids() {
        assert!(is_valid_id("peerie-x"));
        assert!(is_valid_id("0"));
        assert!(is_valid_id("a_b-c9"));
        assert!(!is_valid_id(""));
        assert!(!is_valid_id("-a"));
        assert!(!is_valid_id("_a"));
        assert!(!is_valid_id("Peerie"));
        assert!(!is_valid_id("a b"));
        assert!(is_valid_id(&"a".repeat(64)));
        assert!(!is_valid_id(&"a".repeat(65)));
    }

    #[test]
    fn integers() {
        assert_eq!(as_int(3.0), Some(3));
        assert_eq!(as_int(-7.0), Some(-7));
        assert_eq!(as_int(1.5), None);
        assert_eq!(as_int(f64::NAN), None);
        assert_eq!(as_int(1e300), None);
    }
}
