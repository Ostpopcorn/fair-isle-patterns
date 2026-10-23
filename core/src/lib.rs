//! Stateless core of the Fair Isle Pattern Builder.
//!
//! Six pure functions make up the API (section 11 of the specification):
//! [`parse`], [`serialize`], [`validate`], [`compile`], [`layout`] and
//! [`suggest_cast_on`]. Documents are JSON values; nothing here touches the
//! page, storage or global state, and no input makes it panic.

pub mod color;
pub mod compile;
pub mod issue;
pub mod migrate;
pub mod model;
pub mod read;
pub mod rows;
pub mod validate;
pub mod write;

#[cfg(target_arch = "wasm32")]
mod wasm;

use serde_json::Value;

pub use compile::{CompiledChart, StitchLayout};
pub use issue::{Issue, Location, Run, Severity};
pub use model::{Document, Kind};

/// Result of [`parse`].
#[derive(Debug)]
pub struct Parsed {
    /// The normalized, migrated document; `None` when it is not
    /// structurally readable (E001).
    pub doc: Option<Value>,
    /// E001–E008 and W106.
    pub issues: Vec<Issue>,
    /// The file has a newer format version: show it, but do not save over it.
    pub read_only: bool,
}

/// Everything known about a document after one pass.
struct Analysis {
    doc: Option<Document>,
    issues: Vec<Issue>,
    chart: Option<CompiledChart>,
    read_only: bool,
    structurally_ok: bool,
}

fn analyze(value: &Value, with_rows: bool) -> Analysis {
    let outcome = read::read(value);
    let structurally_ok = outcome.structurally_ok();
    let mut issues = outcome.issues;
    let mut chart = None;
    // Semantic checks need a structurally sound document; on a broken one
    // they would only repeat the E001 issues in other words.
    if let (Some(doc), true) = (&outcome.doc, structurally_ok) {
        issues.extend(validate::check(doc));
        if doc.kind == Kind::Pattern && !issues.iter().any(Issue::is_error) {
            let compiled = compile::build(doc);
            if with_rows {
                issues.extend(rows::row_issues(doc, &compiled));
            }
            chart = Some(compiled);
        }
    }
    Analysis {
        doc: outcome.doc,
        issues,
        chart,
        read_only: outcome.read_only,
        structurally_ok,
    }
}

/// Parses file contents. Malformed JSON gives E001 with the position.
pub fn parse(text: &str) -> Parsed {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let value: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(e) => {
            return Parsed {
                doc: None,
                issues: vec![Issue::error(
                    "E001",
                    format!(
                        "The file is not valid JSON (line {}, column {}): {e}",
                        e.line(),
                        e.column()
                    ),
                    Location::default(),
                )],
                read_only: false,
            }
        }
    };
    let analysis = analyze(&value, false);
    let doc = if analysis.structurally_ok {
        analysis.doc.as_ref().map(Document::to_value)
    } else {
        None
    };
    Parsed {
        doc,
        issues: analysis
            .issues
            .into_iter()
            .filter(|i| i.is_error() || i.code == "W106")
            .collect(),
        read_only: analysis.read_only,
    }
}

/// Writes the document in canonical form. Fails only when the document is
/// not structurally readable (it has E001 issues).
pub fn serialize(doc: &Value) -> Result<String, String> {
    let outcome = read::read(doc);
    if !outcome.structurally_ok() {
        let reason = outcome
            .issues
            .iter()
            .find(|i| i.code == "E001")
            .map_or_else(|| "unreadable document".to_string(), |i| i.message.clone());
        return Err(format!("Cannot serialize: {reason}"));
    }
    match outcome.doc {
        Some(d) => Ok(write::write_document(&d)),
        None => Err("Cannot serialize: unreadable document".into()),
    }
}

/// All errors, warnings and notices.
pub fn validate(doc: &Value) -> Vec<Issue> {
    analyze(doc, true).issues
}

/// The chart, or `None` if the document has errors (or is a library).
pub fn compile(doc: &Value) -> Option<CompiledChart> {
    analyze(doc, false).chart
}

/// Physical stitch positions, or `None` if the document has errors.
pub fn layout(doc: &Value) -> Option<StitchLayout> {
    let a = analyze(doc, false);
    match (a.doc, a.chart) {
        (Some(d), Some(c)) => Some(compile::layout(&d, &c)),
        _ => None,
    }
}

/// Up to two cast-on values that fit every band (see W103).
pub fn suggest_cast_on(doc: &Value) -> Vec<u32> {
    match read::read(doc).doc {
        Some(d) => compile::suggest_for(&d),
        None => Vec::new(),
    }
}
