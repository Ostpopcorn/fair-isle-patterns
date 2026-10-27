//! Reading a JSON value into a [`Document`].
//!
//! The reader reports structural problems (E001: wrong envelope, missing
//! required fields, wrong JSON types) and unknown fields (W106). It never
//! stops at the first problem: it keeps going with fallback values so that
//! every problem is reported in one pass. Range checks belong to the
//! validator.

use serde_json::{Map, Value};

use crate::issue::{Issue, Location};
use crate::migrate::{migrate, CURRENT_VERSION};
use crate::model::*;

pub struct ReadOutcome {
    /// `None` when the envelope itself is unusable.
    pub doc: Option<Document>,
    pub issues: Vec<Issue>,
    /// The file has a newer format version than this reader supports.
    pub read_only: bool,
}

impl ReadOutcome {
    pub fn structurally_ok(&self) -> bool {
        self.doc.is_some() && !self.issues.iter().any(|i| i.code == "E001")
    }
}

pub fn read(value: &Value) -> ReadOutcome {
    let mut reader = Reader::default();
    let doc = reader.document(value);
    ReadOutcome {
        doc,
        issues: reader.issues,
        read_only: reader.read_only,
    }
}

enum Field<T> {
    Missing,
    Bad,
    Ok(T),
}

fn join(path: &str, key: &str) -> String {
    if path.is_empty() {
        key.to_string()
    } else {
        format!("{path}.{key}")
    }
}

fn type_name(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "a boolean",
        Value::Number(_) => "a number",
        Value::String(_) => "a string",
        Value::Array(_) => "an array",
        Value::Object(_) => "an object",
    }
}

#[derive(Default)]
struct Reader {
    issues: Vec<Issue>,
    read_only: bool,
}

impl Reader {
    fn e001(&mut self, message: String, location: Location) {
        self.issues.push(Issue::error("E001", message, location));
    }

    fn missing(&mut self, path: &str, key: &str, loc: &Location) {
        let p = join(path, key);
        self.e001(
            format!("Missing required field {p}"),
            Location {
                path: Some(p),
                ..loc.clone()
            },
        );
    }

    fn wrong_type(&mut self, path: String, expected: &str, found: &Value, loc: &Location) {
        self.e001(
            format!("{path} must be {expected}, not {}", type_name(found)),
            Location {
                path: Some(path),
                ..loc.clone()
            },
        );
    }

    fn string(&mut self, map: &Map<String, Value>, key: &str, path: &str, loc: &Location) -> Field<String> {
        match map.get(key) {
            None => Field::Missing,
            Some(Value::String(s)) => Field::Ok(s.clone()),
            Some(other) => {
                self.wrong_type(join(path, key), "a string", other, loc);
                Field::Bad
            }
        }
    }

    fn number(&mut self, map: &Map<String, Value>, key: &str, path: &str, loc: &Location) -> Field<f64> {
        match map.get(key) {
            None => Field::Missing,
            Some(Value::Number(n)) => match n.as_f64() {
                Some(f) => Field::Ok(f),
                None => {
                    self.wrong_type(join(path, key), "a number", &Value::Null, loc);
                    Field::Bad
                }
            },
            Some(other) => {
                self.wrong_type(join(path, key), "a number", other, loc);
                Field::Bad
            }
        }
    }

    /// Optional booleans treat `null` as absent.
    fn opt_bool(&mut self, map: &Map<String, Value>, key: &str, path: &str, loc: &Location) -> bool {
        match map.get(key) {
            None | Some(Value::Null) => false,
            Some(Value::Bool(b)) => *b,
            Some(other) => {
                self.wrong_type(join(path, key), "true or false", other, loc);
                false
            }
        }
    }

    fn req_string(&mut self, map: &Map<String, Value>, key: &str, path: &str, loc: &Location) -> String {
        match self.string(map, key, path, loc) {
            Field::Ok(s) => s,
            Field::Missing => {
                self.missing(path, key, loc);
                String::new()
            }
            Field::Bad => String::new(),
        }
    }

    /// Optional strings treat `null` as absent.
    fn opt_string(&mut self, map: &Map<String, Value>, key: &str, path: &str, loc: &Location) -> Option<String> {
        if matches!(map.get(key), Some(Value::Null)) {
            return None;
        }
        match self.string(map, key, path, loc) {
            Field::Ok(s) => Some(s),
            Field::Missing => None,
            Field::Bad => None,
        }
    }

    fn req_number(&mut self, map: &Map<String, Value>, key: &str, path: &str, loc: &Location) -> f64 {
        match self.number(map, key, path, loc) {
            Field::Ok(n) => n,
            Field::Missing => {
                self.missing(path, key, loc);
                0.0
            }
            Field::Bad => 0.0,
        }
    }

    fn opt_number(&mut self, map: &Map<String, Value>, key: &str, default: f64, path: &str, loc: &Location) -> f64 {
        if matches!(map.get(key), Some(Value::Null)) {
            return default;
        }
        match self.number(map, key, path, loc) {
            Field::Ok(n) => n,
            Field::Missing => default,
            Field::Bad => default,
        }
    }

    fn object<'a>(
        &mut self,
        map: &'a Map<String, Value>,
        key: &str,
        path: &str,
        required: bool,
    ) -> Option<&'a Map<String, Value>> {
        let loc = Location::default();
        match map.get(key) {
            None => {
                if required {
                    self.missing(path, key, &loc);
                }
                None
            }
            Some(Value::Null) if !required => None,
            Some(Value::Object(m)) => Some(m),
            Some(other) => {
                self.wrong_type(join(path, key), "an object", other, &loc);
                None
            }
        }
    }

    fn array<'a>(&mut self, map: &'a Map<String, Value>, key: &str, required: bool) -> Option<&'a Vec<Value>> {
        let loc = Location::default();
        match map.get(key) {
            None => {
                if required {
                    self.missing("", key, &loc);
                }
                None
            }
            Some(Value::Array(a)) => Some(a),
            Some(other) => {
                self.wrong_type(key.to_string(), "an array", other, &loc);
                None
            }
        }
    }

    /// Collects unknown fields, reporting each one as W106.
    fn extras(&mut self, map: &Map<String, Value>, known: &[&str], path: &str, loc: &Location) -> Extra {
        let mut extra = Extra::new();
        for (key, value) in map {
            if !known.contains(&key.as_str()) {
                let p = join(path, key);
                self.issues.push(Issue::notice(
                    "W106",
                    format!("Unknown field {p} ignored; it is kept when saving"),
                    Location {
                        path: Some(p),
                        ..loc.clone()
                    },
                ));
                extra.insert(key.clone(), value.clone());
            }
        }
        extra
    }

    fn document(&mut self, value: &Value) -> Option<Document> {
        let Some(root) = value.as_object() else {
            self.e001(
                format!("The document must be a JSON object, not {}", type_name(value)),
                Location::default(),
            );
            return None;
        };

        let kind = match root.get("format") {
            Some(Value::String(s)) if s == PATTERN_FORMAT => Kind::Pattern,
            Some(Value::String(s)) if s == LIBRARY_FORMAT => Kind::Library,
            Some(other) => {
                let found = match other {
                    Value::String(s) => format!("\"{s}\""),
                    v => type_name(v).to_string(),
                };
                self.e001(
                    format!("format must be \"{PATTERN_FORMAT}\" (or \"{LIBRARY_FORMAT}\" for a library), not {found}"),
                    Location::at("format"),
                );
                return None;
            }
            None => {
                self.missing("", "format", &Location::default());
                return None;
            }
        };

        let version = match root.get("version") {
            None => {
                self.missing("", "version", &Location::default());
                return None;
            }
            Some(v) => match v.as_f64().and_then(as_int) {
                Some(n) => n,
                None => {
                    self.e001("version must be an integer".into(), Location::at("version"));
                    return None;
                }
            },
        };
        if version < 1 {
            self.e001(
                format!("Unsupported version {version}; the first format version is 1"),
                Location::at("version"),
            );
            return None;
        }
        if version > CURRENT_VERSION {
            self.read_only = true;
        }

        let migrated;
        let root = if version < CURRENT_VERSION {
            migrated = migrate(value.clone(), version);
            match migrated.as_object() {
                Some(m) => m,
                None => {
                    self.e001("Migration produced an invalid document".into(), Location::default());
                    return None;
                }
            }
        } else {
            root
        };

        let known: &[&str] = match kind {
            Kind::Pattern => &[
                "format", "version", "meta", "gauge", "cast_on", "settings", "palette", "motifs", "bands",
            ],
            Kind::Library => &["format", "version", "meta", "palette", "motifs"],
        };
        let is_pattern = kind == Kind::Pattern;

        let meta = self.meta(root);

        let (gauge, cast_on, settings) = if is_pattern {
            let gauge = self.gauge(root);
            let cast_on = self.req_number(root, "cast_on", "", &Location::default());
            let settings = self.settings(root);
            (gauge, cast_on, settings)
        } else {
            (Gauge::default(), 0.0, Settings::default())
        };

        let palette = self
            .array(root, "palette", is_pattern)
            .map(|items| {
                items
                    .iter()
                    .enumerate()
                    .filter_map(|(i, v)| self.color(v, format!("palette[{i}]")))
                    .collect()
            })
            .unwrap_or_default();
        let motifs = self
            .array(root, "motifs", is_pattern)
            .map(|items| {
                items
                    .iter()
                    .enumerate()
                    .filter_map(|(i, v)| self.motif(v, format!("motifs[{i}]")))
                    .collect()
            })
            .unwrap_or_default();
        let bands = if is_pattern {
            self.array(root, "bands", true)
                .map(|items| items.iter().enumerate().map(|(i, v)| self.band(v, i)).collect())
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        let extra = self.extras(root, known, "", &Location::default());

        Some(Document {
            kind,
            version,
            meta,
            gauge,
            cast_on,
            settings,
            palette,
            motifs,
            bands,
            extra,
        })
    }

    fn meta(&mut self, root: &Map<String, Value>) -> Meta {
        let Some(map) = self.object(root, "meta", "", true) else {
            return Meta::default();
        };
        let loc = Location::default();
        let p = "meta";
        Meta {
            name: self.req_string(map, "name", p, &loc),
            author: self.opt_string(map, "author", p, &loc),
            license: self.opt_string(map, "license", p, &loc),
            description: self.opt_string(map, "description", p, &loc),
            created: self.opt_string(map, "created", p, &loc),
            modified: self.opt_string(map, "modified", p, &loc),
            extra: self.extras(
                map,
                &["name", "author", "license", "description", "created", "modified"],
                p,
                &loc,
            ),
        }
    }

    fn gauge(&mut self, root: &Map<String, Value>) -> Gauge {
        let Some(map) = self.object(root, "gauge", "", true) else {
            return Gauge::default();
        };
        let loc = Location::default();
        let p = "gauge";
        Gauge {
            stitches: self.req_number(map, "stitches", p, &loc),
            rows: self.req_number(map, "rows", p, &loc),
            per_cm: self.opt_number(map, "per_cm", DEFAULT_PER_CM, p, &loc),
            extra: self.extras(map, &["stitches", "rows", "per_cm"], p, &loc),
        }
    }

    fn settings(&mut self, root: &Map<String, Value>) -> Settings {
        let Some(map) = self.object(root, "settings", "", false) else {
            return Settings::default();
        };
        let loc = Location::default();
        let p = "settings";
        Settings {
            float_notice: self.opt_number(map, "float_notice", DEFAULT_FLOAT_NOTICE, p, &loc),
            float_warning: self.opt_number(map, "float_warning", DEFAULT_FLOAT_WARNING, p, &loc),
            max_colors_per_row: self.opt_number(map, "max_colors_per_row", DEFAULT_MAX_COLORS_PER_ROW, p, &loc),
            min_contrast: self.opt_number(map, "min_contrast", DEFAULT_MIN_CONTRAST, p, &loc),
            extra: self.extras(
                map,
                &["float_notice", "float_warning", "max_colors_per_row", "min_contrast"],
                p,
                &loc,
            ),
        }
    }

    /// Reads an entry's `id`. Entries without a usable id are dropped.
    fn entry_id<'a>(&mut self, v: &'a Value, path: &str) -> Option<(String, &'a Map<String, Value>)> {
        let Some(map) = v.as_object() else {
            self.wrong_type(path.to_string(), "an object", v, &Location::default());
            return None;
        };
        match self.string(map, "id", path, &Location::at(path)) {
            Field::Ok(id) => Some((id, map)),
            Field::Missing => {
                self.missing(path, "id", &Location::default());
                None
            }
            Field::Bad => None,
        }
    }

    fn color(&mut self, v: &Value, path: String) -> Option<Color> {
        let (id, map) = self.entry_id(v, &path)?;
        let loc = Location {
            color: Some(id.clone()),
            ..Location::default()
        };
        Some(Color {
            hex: self.req_string(map, "hex", &path, &loc),
            name: self.opt_string(map, "name", &path, &loc),
            yarn: self.opt_string(map, "yarn", &path, &loc),
            extra: self.extras(map, &["id", "hex", "name", "yarn"], &path, &loc),
            id,
        })
    }

    fn motif(&mut self, v: &Value, path: String) -> Option<Motif> {
        let (id, map) = self.entry_id(v, &path)?;
        let loc = Location {
            motif: Some(id.clone()),
            ..Location::default()
        };
        let name = self.opt_string(map, "name", &path, &loc);
        let rows = self.strings(map, "rows", &path, &loc);
        let mut mappings = Vec::new();
        match map.get("mappings") {
            None => {
                self.missing(&path, "mappings", &loc);
            }
            Some(Value::Array(items)) => {
                for (i, item) in items.iter().enumerate() {
                    if let Some(m) = self.mapping(item, format!("{path}.mappings[{i}]"), &id) {
                        mappings.push(m);
                    }
                }
            }
            Some(other) => {
                self.wrong_type(join(&path, "mappings"), "an array", other, &loc);
            }
        }
        Some(Motif {
            name,
            rows,
            mappings,
            extra: self.extras(map, &["id", "name", "rows", "mappings"], &path, &loc),
            id,
        })
    }

    /// An array of strings at `map[key]`; wrong entries are reported and
    /// skipped.
    fn strings(&mut self, map: &Map<String, Value>, key: &str, path: &str, loc: &Location) -> Vec<String> {
        let mut out = Vec::new();
        match map.get(key) {
            None => {
                self.missing(path, key, loc);
            }
            Some(Value::Array(items)) => {
                for (i, item) in items.iter().enumerate() {
                    match item {
                        Value::String(s) => out.push(s.clone()),
                        other => {
                            self.wrong_type(format!("{path}.{key}[{i}]"), "a string", other, loc);
                        }
                    }
                }
            }
            Some(other) => {
                self.wrong_type(join(path, key), "an array of strings", other, loc);
            }
        }
        out
    }

    fn mapping(&mut self, v: &Value, path: String, motif: &str) -> Option<Mapping> {
        let (id, map) = self.entry_id(v, &path)?;
        let loc = Location {
            motif: Some(motif.to_string()),
            mapping: Some(id.clone()),
            ..Location::default()
        };
        Some(Mapping {
            name: self.opt_string(map, "name", &path, &loc),
            colors: self.strings(map, "colors", &path, &loc),
            rows: self.strings(map, "rows", &path, &loc),
            extra: self.extras(map, &["id", "name", "colors", "rows"], &path, &loc),
            id,
        })
    }

    fn band(&mut self, v: &Value, index: usize) -> Band {
        let path = format!("bands[{index}]");
        let loc = Location {
            band: Some(index),
            ..Location::default()
        };
        // Stands in for a band that cannot be read.
        let unreadable = || Band {
            kind: BandKind::Motif {
                motif: String::new(),
                mapping: String::new(),
                offset: 0.0,
                times: 1.0,
                flip_horizontal: false,
                flip_vertical: false,
            },
            name: None,
            extra: Extra::new(),
        };
        let Some(map) = v.as_object() else {
            self.wrong_type(path, "an object", v, &loc);
            return unreadable();
        };
        if !map.contains_key("color") {
            return Band {
                kind: BandKind::Motif {
                    motif: self.req_string(map, "motif", &path, &loc),
                    mapping: self.req_string(map, "mapping", &path, &loc),
                    offset: self.opt_number(map, "offset", 0.0, &path, &loc),
                    times: self.opt_number(map, "times", 1.0, &path, &loc),
                    flip_horizontal: self.opt_bool(map, "flip_horizontal", &path, &loc),
                    flip_vertical: self.opt_bool(map, "flip_vertical", &path, &loc),
                },
                name: self.opt_string(map, "name", &path, &loc),
                extra: self.extras(
                    map,
                    &[
                        "motif",
                        "mapping",
                        "offset",
                        "times",
                        "flip_horizontal",
                        "flip_vertical",
                        "name",
                    ],
                    &path,
                    &loc,
                ),
            };
        }
        if map.contains_key("motif") || map.contains_key("mapping") {
            self.e001(
                format!("{path} has both a motif and a color: a band is either a motif band (motif and mapping) or a spacer (color and rows)"),
                Location {
                    path: Some(path),
                    ..loc
                },
            );
            return unreadable();
        }
        Band {
            kind: BandKind::Spacer {
                color: self.req_string(map, "color", &path, &loc),
                rows: self.opt_number(map, "rows", 1.0, &path, &loc),
            },
            name: self.opt_string(map, "name", &path, &loc),
            extra: self.extras(map, &["color", "rows", "name"], &path, &loc),
        }
    }
}
