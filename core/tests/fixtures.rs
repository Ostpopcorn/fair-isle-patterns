//! Runs every case in `fixtures/` (shared with the TypeScript tests).
//!
//! Each case is a directory with an `input.*` file and `expected.json`:
//! - `issues`: exactly the issues `validate` returns (or `parse`, when the
//!   input does not parse). Order does not matter. Each expected issue
//!   matches on code, severity, the location fields it lists, and `detail`
//!   as a substring of the message.
//! - `parse_ok` (default true): whether `parse` returns a document.
//! - `read_only` (default false).
//! - `roundtrip`: `serialize(parse(input).doc)` reproduces the input byte
//!   for byte.
//! - `canonical`: a file `serialize` must produce instead.
//! - `chart`: the compiled chart as ASCII art, top row first, one letter per
//!   palette colour as declared in `letters`.
//! - `suggest_cast_on`: the expected suggestions.

use std::fs;
use std::path::{Path, PathBuf};

use fairisle_core::{compile, parse, serialize, suggest_cast_on, validate};
use serde_json::Value;

fn fixtures_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures")
}

fn match_issues(expected: &[Value], actual: &[Value]) -> Result<(), String> {
    let mut remaining: Vec<&Value> = actual.iter().collect();
    for exp in expected {
        let pos = remaining.iter().position(|act| {
            act["code"] == exp["code"]
                && act["severity"] == exp["severity"]
                && exp["location"]
                    .as_object()
                    .is_none_or(|loc| loc.iter().all(|(k, v)| &act["location"][k] == v))
                && exp["detail"]
                    .as_str()
                    .is_none_or(|d| act["message"].as_str().unwrap_or("").contains(d))
        });
        match pos {
            Some(i) => {
                remaining.remove(i);
            }
            None => {
                return Err(format!(
                    "expected issue not found: {exp}\nactual issues:\n{}",
                    actual.iter().map(|a| format!("  {a}")).collect::<Vec<_>>().join("\n")
                ))
            }
        }
    }
    if remaining.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "unexpected issues:\n{}",
            remaining
                .iter()
                .map(|a| format!("  {a}"))
                .collect::<Vec<_>>()
                .join("\n")
        ))
    }
}

fn chart_ascii(doc: &Value, letters: &serde_json::Map<String, Value>) -> Result<Vec<String>, String> {
    let chart = compile(doc).ok_or("compile returned no chart")?;
    let letter_of = |id: &str| -> char {
        letters
            .iter()
            .find(|(_, v)| v.as_str() == Some(id))
            .and_then(|(k, _)| k.chars().next())
            .unwrap_or('?')
    };
    let symbols: Vec<char> = chart.palette.iter().map(|id| letter_of(id)).collect();
    Ok((0..chart.height)
        .rev()
        .map(|y| chart.row(y).iter().map(|&c| symbols[c as usize]).collect())
        .collect())
}

fn run(dir: &Path) -> Result<(), String> {
    let expected: Value =
        serde_json::from_str(&fs::read_to_string(dir.join("expected.json")).map_err(|e| e.to_string())?)
            .map_err(|e| format!("expected.json: {e}"))?;
    let input = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .find(|p| p.file_name().is_some_and(|n| n.to_string_lossy().starts_with("input.")))
        .ok_or("no input file")?;
    let text = fs::read_to_string(&input).map_err(|e| e.to_string())?;

    let parsed = parse(&text);
    let parse_ok = expected["parse_ok"].as_bool().unwrap_or(true);
    if parsed.doc.is_some() != parse_ok {
        return Err(format!(
            "parse returned a document: {}, expected {parse_ok}; issues: {:?}",
            parsed.doc.is_some(),
            parsed.issues
        ));
    }
    let read_only = expected["read_only"].as_bool().unwrap_or(false);
    if parsed.read_only != read_only {
        return Err(format!("read_only is {}, expected {read_only}", parsed.read_only));
    }

    let actual: Vec<Value> = match &parsed.doc {
        Some(doc) => validate(doc),
        None => parsed.issues.clone(),
    }
    .iter()
    .map(|i| serde_json::to_value(i).unwrap())
    .collect();
    let expected_issues = expected["issues"].as_array().cloned().unwrap_or_default();
    match_issues(&expected_issues, &actual)?;

    // parse reports the same errors and W106 notices that validate does.
    if let Some(doc) = &parsed.doc {
        let from_validate: Vec<_> = validate(doc)
            .into_iter()
            .filter(|i| i.is_error() || i.code == "W106")
            .collect();
        if from_validate != parsed.issues {
            return Err(format!(
                "parse and validate disagree:\n  parse: {:?}\n  validate: {from_validate:?}",
                parsed.issues
            ));
        }
    }

    let Some(doc) = parsed.doc else {
        return Ok(());
    };
    let written = serialize(&doc)?;
    if expected["roundtrip"].as_bool() == Some(true) && written != text {
        return Err(format!(
            "round trip differs:\n--- input\n{text}\n--- serialized\n{written}"
        ));
    }
    if let Some(name) = expected["canonical"].as_str() {
        let canonical = fs::read_to_string(dir.join(name)).map_err(|e| e.to_string())?;
        if written != canonical {
            return Err(format!(
                "canonical form differs:\n--- expected\n{canonical}\n--- serialized\n{written}"
            ));
        }
        if serialize(&parse(&canonical).doc.ok_or("canonical file does not parse")?)? != canonical {
            return Err("canonical file does not round-trip".into());
        }
    }
    // Serializing is idempotent.
    let reparsed = parse(&written).doc.ok_or("serialized text does not parse")?;
    if serialize(&reparsed)? != written {
        return Err("serialize is not idempotent".into());
    }

    if let Some(chart) = expected.get("chart") {
        let letters = chart["letters"].as_object().ok_or("chart.letters missing")?;
        let rows: Vec<String> = chart["rows"]
            .as_array()
            .ok_or("chart.rows missing")?
            .iter()
            .map(|r| r.as_str().unwrap_or("").to_string())
            .collect();
        let actual = chart_ascii(&doc, letters)?;
        if actual != rows {
            return Err(format!(
                "chart differs:\n--- expected\n{}\n--- actual\n{}",
                rows.join("\n"),
                actual.join("\n")
            ));
        }
    }

    if let Some(s) = expected.get("suggest_cast_on") {
        let want: Vec<u32> = serde_json::from_value(s.clone()).map_err(|e| e.to_string())?;
        let got = suggest_cast_on(&doc);
        if got != want {
            return Err(format!("suggest_cast_on is {got:?}, expected {want:?}"));
        }
    }
    Ok(())
}

#[test]
fn fixtures() {
    let mut dirs: Vec<PathBuf> = fs::read_dir(fixtures_dir())
        .expect("fixtures directory")
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    assert!(dirs.len() >= 30, "expected the full fixture set, found {}", dirs.len());
    let failures: Vec<String> = dirs
        .iter()
        .filter_map(|d| {
            run(d)
                .err()
                .map(|e| format!("{}: {e}", d.file_name().unwrap().to_string_lossy()))
        })
        .collect();
    assert!(
        failures.is_empty(),
        "{} fixture(s) failed:\n\n{}",
        failures.len(),
        failures.join("\n\n")
    );
}
