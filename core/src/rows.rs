//! Row checks on the compiled chart: long floats (W101) and colours per row
//! (W102).

use crate::compile::CompiledChart;
use crate::issue::{Issue, Location, Run};
use crate::model::*;

/// A float in one row: `length` stitches of other colours, starting at
/// column `start` (0-based from the left) and continuing rightwards around
/// the ring.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Float {
    pub color: u16,
    pub start: usize,
    pub length: usize,
}

/// Every float in a row knitted in the round. For each colour X, a float is
/// a maximal run of stitches that are not X with X on both sides, the row
/// being a ring. A colour that appears once has one float of length n − 1;
/// an absent colour has none.
pub fn floats(row: &[u16], palette_len: usize) -> Vec<Float> {
    let n = row.len();
    let mut first: Vec<Option<usize>> = vec![None; palette_len];
    let mut last: Vec<Option<usize>> = vec![None; palette_len];
    let mut out = Vec::new();
    for (i, &color) in row.iter().enumerate() {
        let x = color as usize;
        if x >= palette_len {
            continue;
        }
        if let Some(prev) = last[x] {
            if i - prev > 1 {
                out.push(Float {
                    color,
                    start: prev + 1,
                    length: i - prev - 1,
                });
            }
        } else {
            first[x] = Some(i);
        }
        last[x] = Some(i);
    }
    for x in 0..palette_len {
        if let (Some(f), Some(l)) = (first[x], last[x]) {
            let length = f + n - l - 1;
            if length > 0 {
                out.push(Float {
                    color: x as u16,
                    start: (l + 1) % n,
                    length,
                });
            }
        }
    }
    out
}

/// Converts a column run into knitter numbering (stitch 1 is the rightmost
/// column; stitches count leftwards).
pub fn to_run(float: &Float, n: usize) -> Run {
    let right = (float.start + float.length - 1) % n;
    Run {
        start: n - right,
        length: float.length,
    }
}

pub fn row_issues(doc: &Document, chart: &CompiledChart) -> Vec<Issue> {
    let s = &doc.settings;
    let notice = as_int(s.float_notice).unwrap_or(5).max(2) as usize;
    let warning = as_int(s.float_warning).unwrap_or(8).max(2) as usize;
    let max_colors = as_int(s.max_colors_per_row).unwrap_or(2).max(1) as usize;
    let palette_len = chart.palette.len();
    let n = chart.width;
    let mut issues = Vec::new();
    if n == 0 {
        return issues;
    }

    let mut longest = vec![0usize; palette_len];
    let mut runs: Vec<Vec<Run>> = vec![Vec::new(); palette_len];
    let mut present = vec![false; palette_len];

    for y in 0..chart.height {
        let row = chart.row(y);
        let band = chart.row_band.get(y).map(|b| *b as usize);
        longest.iter_mut().for_each(|l| *l = 0);
        runs.iter_mut().for_each(|r| r.clear());
        present.iter_mut().for_each(|p| *p = false);

        for f in floats(row, palette_len) {
            let x = f.color as usize;
            longest[x] = longest[x].max(f.length);
            if f.length >= notice {
                runs[x].push(to_run(&f, n));
            }
        }
        for x in 0..palette_len {
            if longest[x] < notice {
                continue;
            }
            let id = &chart.palette[x];
            let count = runs[x].len();
            let mut message = format!("{id} float of {} stitches in row {}", longest[x], y + 1);
            if count > 1 {
                message.push_str(&format!(" ({count} floats of {notice} or more)"));
            }
            let mut sorted = std::mem::take(&mut runs[x]);
            sorted.sort_by_key(|r| r.start);
            let location = Location {
                band,
                color: Some(id.clone()),
                row: Some(y + 1),
                runs: Some(sorted),
                ..Location::default()
            };
            issues.push(if longest[x] >= warning {
                Issue::warning("W101", format!("Long float: {message}"), location)
            } else {
                Issue::notice("W101", format!("Long float: {message}"), location)
            });
        }

        for &c in row {
            if let Some(p) = present.get_mut(c as usize) {
                *p = true;
            }
        }
        let used: Vec<&str> = (0..palette_len)
            .filter(|x| present[*x])
            .map(|x| chart.palette[x].as_str())
            .collect();
        if used.len() > max_colors {
            issues.push(Issue::warning(
                "W102",
                format!(
                    "Row {} uses {} colours ({}); the limit is {max_colors}",
                    y + 1,
                    used.len(),
                    used.join(", ")
                ),
                Location {
                    band,
                    row: Some(y + 1),
                    ..Location::default()
                },
            ));
        }
    }
    issues
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(s: &str) -> Vec<u16> {
        s.bytes().map(|b| (b - b'A') as u16).collect()
    }

    fn longest(s: &str, color: u16) -> usize {
        floats(&row(s), 3)
            .iter()
            .filter(|f| f.color == color)
            .map(|f| f.length)
            .max()
            .unwrap_or(0)
    }

    #[test]
    fn ring_floats() {
        assert_eq!(longest("ABABAB", 0), 1);
        assert_eq!(longest("AAAAAAAAAB", 1), 9);
        assert_eq!(longest("BBAAAAAABB", 0), 4);
        assert_eq!(longest("BBAAAAAABB", 1), 6);
        assert_eq!(longest("ABBBBA", 0), 4);
        assert_eq!(longest("AAAAAAAAAA", 1), 0);
        assert_eq!(longest("AAAAAAAAAA", 0), 0);
        assert_eq!(longest("ABBBBBBBBA", 0), 8);
    }

    #[test]
    fn wrapping_run_in_stitch_numbers() {
        // F3: A's float covers stitches 9, 10, 1, 2.
        let r = row("BBAAAAAABB");
        let f = floats(&r, 2).into_iter().find(|f| f.color == 0).unwrap();
        assert_eq!((f.start, f.length), (8, 4));
        assert_eq!(to_run(&f, 10), Run { start: 9, length: 4 });
    }
}
