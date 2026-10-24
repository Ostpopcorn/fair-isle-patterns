//! The core must never panic on user input, and must be fast enough to run
//! after every edit.

use std::time::Instant;

use fairisle_core::{compile, layout, parse, serialize, suggest_cast_on, validate};
use serde_json::{json, Value};

/// A tiny deterministic generator, so failures are reproducible.
struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        self.0 >> 33
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

fn hat() -> Value {
    let text = include_str!("../../fixtures/hat-basic/input.fairisle.json");
    serde_json::from_str(text).unwrap()
}

fn odd_value(rng: &mut Lcg) -> Value {
    match rng.below(12) {
        0 => Value::Null,
        1 => json!(true),
        2 => json!(-1),
        3 => json!(0),
        4 => json!(1.5),
        5 => json!(1e300),
        6 => json!(""),
        7 => json!("."),
        8 => json!([]),
        9 => json!({}),
        10 => json!([[]]),
        _ => json!(9007199254740993u64),
    }
}

/// Replaces a random node of `v` with an odd value.
fn mutate(v: &mut Value, rng: &mut Lcg, depth: usize) {
    if depth > 0 && rng.below(4) == 0 {
        *v = odd_value(rng);
        return;
    }
    match v {
        Value::Object(map) if !map.is_empty() => {
            let i = rng.below(map.len() as u64) as usize;
            let key = map.keys().nth(i).unwrap().clone();
            mutate(map.get_mut(&key).unwrap(), rng, depth + 1);
        }
        Value::Array(items) if !items.is_empty() => {
            let i = rng.below(items.len() as u64) as usize;
            mutate(&mut items[i], rng, depth + 1);
        }
        Value::String(s) if rng.below(2) == 0 => {
            s.push_str(["2", ".", "x", "é", "-1"][rng.below(5) as usize]);
        }
        _ => *v = odd_value(rng),
    }
}

fn exercise(doc: &Value) {
    let _ = validate(doc);
    let _ = compile(doc);
    let _ = layout(doc);
    let _ = suggest_cast_on(doc);
    if let Ok(text) = serialize(doc) {
        let _ = parse(&text);
    }
}

#[test]
fn mutated_documents_never_panic() {
    let mut rng = Lcg(42);
    for _ in 0..3000 {
        let mut doc = hat();
        for _ in 0..=rng.below(3) {
            mutate(&mut doc, &mut rng, 0);
        }
        exercise(&doc);
    }
}

#[test]
fn odd_inputs_never_panic() {
    for text in [
        "",
        "null",
        "[]",
        "{}",
        "\"x\"",
        "{\"format\": 1}",
        "{",
        "\u{feff}{}",
        "1e999",
    ] {
        let _ = parse(text);
    }
    for doc in [
        Value::Null,
        json!([]),
        json!({"format": "fairisle-pattern", "version": 1}),
    ] {
        exercise(&doc);
    }
    let mut extreme = hat();
    extreme["cast_on"] = json!(1000);
    extreme["bands"][3]["times"] = json!(1e15);
    extreme["bands"][2]["offset"] = json!(-9007199254740991i64);
    exercise(&extreme);
}

#[test]
fn deep_nesting_is_rejected_not_overflowed() {
    let text = format!("{}{}", "[".repeat(100_000), "]".repeat(100_000));
    let parsed = parse(&text);
    assert!(parsed.doc.is_none());
    assert_eq!(parsed.issues[0].code, "E001");
}

/// Section 11: validate plus compile under 16 ms for a 400 × 300 chart
/// (checked in release builds; debug builds only report the time).
#[test]
fn performance_400_by_300() {
    let rows: Vec<String> = (0..60)
        .map(|r| {
            (0..40)
                .map(|c| {
                    if (r * 7 + c * 3) % 5 == 0 {
                        '1'
                    } else if (r + c) % 11 == 0 {
                        '2'
                    } else {
                        '0'
                    }
                })
                .collect()
        })
        .collect();
    // Three colour schemes cycling over the 60 motif rows.
    let mapping_rows: Vec<&str> = (0..60).map(|r| ["012", "032", "021"][r % 3]).collect();
    let doc = json!({
        "format": "fairisle-pattern", "version": 1, "meta": { "name": "Large" },
        "gauge": { "stitches": 28, "rows": 32 }, "cast_on": 400,
        "palette": [
            { "id": "a", "hex": "#efe6d2" }, { "id": "b", "hex": "#1f2a44" },
            { "id": "c", "hex": "#a4452c" }, { "id": "d", "hex": "#d9a441" }
        ],
        "motifs": [ { "id": "big", "rows": rows, "mappings": [
            { "id": "m", "colors": ["a", "b", "c", "d"], "rows": mapping_rows }
        ] } ],
        "bands": [ { "motif": "big", "mapping": "m", "times": 5 } ]
    });
    let chart = compile(&doc).expect("compiles");
    assert_eq!((chart.width, chart.height), (400, 300));

    let runs = 5;
    let start = Instant::now();
    for _ in 0..runs {
        let issues = validate(&doc);
        assert!(!issues.is_empty());
        let _ = compile(&doc).unwrap();
    }
    let per_run = start.elapsed().as_secs_f64() * 1000.0 / runs as f64;
    println!("validate + compile, 400 × 300: {per_run:.2} ms");
    if !cfg!(debug_assertions) {
        assert!(per_run < 16.0, "validate + compile took {per_run:.2} ms");
    }
}
