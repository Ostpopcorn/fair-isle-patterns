//! Canonical serialization (section 4).
//!
//! One canonical text per document keeps git diffs minimal:
//! - 2-space indent, LF line endings, trailing newline;
//! - known keys in the fixed order of the format reference, then unknown
//!   fields sorted by key;
//! - small objects (meta, gauge, settings, palette entries, bands) on one line;
//! - one motif row and one mapping row per line, a motif's mappings nested
//!   after its rows;
//! - whole numbers without a decimal point;
//! - a band's `times` only when it is not 1; `offset` always.

use serde_json::Value;

use crate::model::*;

fn quote(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into())
}

pub fn number(n: f64) -> String {
    match as_int(n) {
        Some(i) => i.to_string(),
        None => match serde_json::Number::from_f64(n) {
            Some(num) => num.to_string(),
            None => "null".into(),
        },
    }
}

/// Any JSON value on one line: `{ "a": 1, "b": [1, 2] }`.
fn inline_value(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => {
            if n.is_i64() || n.is_u64() {
                n.to_string()
            } else {
                number(n.as_f64().unwrap_or(0.0))
            }
        }
        Value::String(s) => quote(s),
        Value::Array(items) => {
            let parts: Vec<String> = items.iter().map(inline_value).collect();
            format!("[{}]", parts.join(", "))
        }
        Value::Object(map) => {
            let fields: Vec<(String, String)> = map.iter().map(|(k, v)| (k.clone(), inline_value(v))).collect();
            inline_object(&fields)
        }
    }
}

fn inline_object(fields: &[(String, String)]) -> String {
    if fields.is_empty() {
        return "{}".into();
    }
    let parts: Vec<String> = fields.iter().map(|(k, v)| format!("{}: {}", quote(k), v)).collect();
    format!("{{ {} }}", parts.join(", "))
}

struct Fields(Vec<(String, String)>);

impl Fields {
    fn new() -> Self {
        Fields(Vec::new())
    }
    fn str(&mut self, key: &str, value: &str) -> &mut Self {
        self.0.push((key.into(), quote(value)));
        self
    }
    fn opt(&mut self, key: &str, value: &Option<String>) -> &mut Self {
        if let Some(v) = value {
            self.str(key, v);
        }
        self
    }
    fn raw(&mut self, key: &str, value: String) -> &mut Self {
        self.0.push((key.into(), value));
        self
    }
    fn num(&mut self, key: &str, value: f64) -> &mut Self {
        self.0.push((key.into(), number(value)));
        self
    }
    fn extra(&mut self, extra: &Extra) -> &mut Self {
        for (k, v) in extra {
            self.0.push((k.clone(), inline_value(v)));
        }
        self
    }
    fn inline(&self) -> String {
        inline_object(&self.0)
    }
}

/// An array of items, one per line at the given indent.
fn block_array(items: &[String], indent: &str) -> String {
    if items.is_empty() {
        return "[]".into();
    }
    let inner = format!("{indent}  ");
    let lines: Vec<String> = items.iter().map(|item| format!("{inner}{item}")).collect();
    format!("[\n{}\n{indent}]", lines.join(",\n"))
}

/// `{ "id": "x", "name": "y", "rows": [` + rows + `] }`: the head fields
/// on the first line, then each block array with one item per line.
fn entry_with_blocks(head: &Fields, blocks: &[(&str, String)], extra: &Extra) -> String {
    let mut parts: Vec<String> = head.0.iter().map(|(k, v)| format!("{}: {}", quote(k), v)).collect();
    parts.extend(blocks.iter().map(|(k, v)| format!("{}: {v}", quote(k))));
    parts.extend(extra.iter().map(|(k, v)| format!("{}: {}", quote(k), inline_value(v))));
    format!("{{ {} }}", parts.join(", "))
}

fn quoted_rows(rows: &[String], indent: &str) -> String {
    let rows: Vec<String> = rows.iter().map(|r| quote(r)).collect();
    block_array(&rows, indent)
}

fn mapping_entry(mapping: &Mapping, indent: &str) -> String {
    let colors: Vec<String> = mapping.colors.iter().map(|c| quote(c)).collect();
    let mut head = Fields::new();
    head.str("id", &mapping.id)
        .opt("name", &mapping.name)
        .raw("colors", format!("[{}]", colors.join(", ")));
    entry_with_blocks(&head, &[("rows", quoted_rows(&mapping.rows, indent))], &mapping.extra)
}

pub fn write_document(doc: &Document) -> String {
    let mut fields: Vec<(String, String)> = Vec::new();
    fields.push(("format".into(), quote(doc.kind.format())));
    fields.push(("version".into(), doc.version.to_string()));

    let m = &doc.meta;
    let mut meta = Fields::new();
    meta.str("name", &m.name)
        .opt("author", &m.author)
        .opt("license", &m.license)
        .opt("description", &m.description)
        .opt("created", &m.created)
        .opt("modified", &m.modified)
        .extra(&m.extra);
    fields.push(("meta".into(), meta.inline()));

    if doc.kind == Kind::Pattern {
        let g = &doc.gauge;
        let mut gauge = Fields::new();
        gauge
            .num("stitches", g.stitches)
            .num("rows", g.rows)
            .num("per_cm", g.per_cm)
            .extra(&g.extra);
        fields.push(("gauge".into(), gauge.inline()));
        fields.push(("cast_on".into(), number(doc.cast_on)));

        let s = &doc.settings;
        let mut settings = Fields::new();
        settings
            .num("float_notice", s.float_notice)
            .num("float_warning", s.float_warning)
            .num("max_colors_per_row", s.max_colors_per_row)
            .num("min_contrast", s.min_contrast)
            .extra(&s.extra);
        fields.push(("settings".into(), settings.inline()));
    }

    let indent = "  ";
    let item_indent = "    ";

    let palette: Vec<String> = doc
        .palette
        .iter()
        .map(|c| {
            let mut f = Fields::new();
            f.str("id", &c.id)
                .str("hex", &c.hex)
                .opt("name", &c.name)
                .opt("yarn", &c.yarn)
                .extra(&c.extra);
            f.inline()
        })
        .collect();
    fields.push(("palette".into(), block_array(&palette, indent)));

    let mapping_indent = "      ";
    let motifs: Vec<String> = doc
        .motifs
        .iter()
        .map(|motif| {
            let mut head = Fields::new();
            head.str("id", &motif.id).opt("name", &motif.name);
            let mappings: Vec<String> = motif
                .mappings
                .iter()
                .map(|m| mapping_entry(m, mapping_indent))
                .collect();
            let blocks = [
                ("rows", quoted_rows(&motif.rows, item_indent)),
                ("mappings", block_array(&mappings, item_indent)),
            ];
            entry_with_blocks(&head, &blocks, &motif.extra)
        })
        .collect();
    fields.push(("motifs".into(), block_array(&motifs, indent)));

    if doc.kind == Kind::Pattern {
        let bands: Vec<String> = doc
            .bands
            .iter()
            .map(|band| {
                let mut f = Fields::new();
                f.str("motif", &band.motif)
                    .str("mapping", &band.mapping)
                    .num("offset", band.offset);
                if band.times != 1.0 {
                    f.num("times", band.times);
                }
                f.opt("name", &band.name).extra(&band.extra);
                f.inline()
            })
            .collect();
        fields.push(("bands".into(), block_array(&bands, indent)));
    }

    for (k, v) in &doc.extra {
        fields.push((k.clone(), inline_value(v)));
    }

    let body: Vec<String> = fields
        .iter()
        .map(|(k, v)| format!("{indent}{}: {v}", quote(k)))
        .collect();
    format!("{{\n{}\n}}\n", body.join(",\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers() {
        assert_eq!(number(10.0), "10");
        assert_eq!(number(-3.0), "-3");
        assert_eq!(number(27.5), "27.5");
        assert_eq!(number(0.1), "0.1");
    }

    #[test]
    fn inline_values() {
        let v: Value = serde_json::from_str(r#"{"b":[1,2.5,"x"],"a":{},"c":[],"d":null}"#).unwrap();
        assert_eq!(
            inline_value(&v),
            r#"{ "a": {}, "b": [1, 2.5, "x"], "c": [], "d": null }"#
        );
    }
}
