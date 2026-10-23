//! Issues: everything the core reports about a document (section 6).

use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
    Notice,
}

/// A float run in knitter numbering: `length` stitches starting at stitch
/// `start` (1-based from the right) and continuing leftwards, wrapping from
/// stitch `cast_on` back to stitch 1.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct Run {
    pub start: usize,
    pub length: usize,
}

/// Where an issue applies. Every field is optional.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    /// 0-based index into `bands`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub band: Option<usize>,
    /// Motif id.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub motif: Option<String>,
    /// Mapping id.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mapping: Option<String>,
    /// Palette colour id.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Chart row, 1-based from the bottom.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub row: Option<usize>,
    /// Stitch, 1-based from the right.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stitch: Option<usize>,
    /// W101 float runs, in stitch numbers.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runs: Option<Vec<Run>>,
    /// Motif row, 1-based from the bottom (`rows[0]` is row 1).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub motif_row: Option<usize>,
    /// Mapping row, 1-based (`rows[0]` is row 1).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mapping_row: Option<usize>,
    /// Path of the offending field in the document, such as `bands[2].offset`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

impl Location {
    pub fn at(path: impl Into<String>) -> Self {
        Location {
            path: Some(path.into()),
            ..Location::default()
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Issue {
    pub code: &'static str,
    pub severity: Severity,
    pub message: String,
    pub location: Location,
}

impl Issue {
    pub fn error(code: &'static str, message: impl Into<String>, location: Location) -> Self {
        Issue {
            code,
            severity: Severity::Error,
            message: message.into(),
            location,
        }
    }

    pub fn warning(code: &'static str, message: impl Into<String>, location: Location) -> Self {
        Issue {
            code,
            severity: Severity::Warning,
            message: message.into(),
            location,
        }
    }

    pub fn notice(code: &'static str, message: impl Into<String>, location: Location) -> Self {
        Issue {
            code,
            severity: Severity::Notice,
            message: message.into(),
            location,
        }
    }

    pub fn is_error(&self) -> bool {
        self.severity == Severity::Error
    }
}
