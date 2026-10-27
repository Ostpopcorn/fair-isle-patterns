//! Pattern compilation (section 5): bands → chart grid, plus the physical
//! stitch layout and cast-on suggestions.

use serde::Serialize;

use crate::model::*;
use crate::validate::{band_widths, motif_width, row_digits, Resolved, MAX_CAST_ON};

/// The compiled chart. Cells are row-major, bottom row first, columns from
/// the left; each cell is an index into `palette`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledChart {
    pub width: usize,
    pub height: usize,
    pub palette: Vec<String>,
    pub cells: Vec<u16>,
    pub symbols: Vec<u8>,
    pub row_band: Vec<u16>,
}

impl CompiledChart {
    pub fn row(&self, y: usize) -> &[u16] {
        &self.cells[y * self.width..(y + 1) * self.width]
    }
}

/// Builds the chart. Callers must have checked that the document has no
/// errors; anything unusable is skipped rather than panicking.
pub fn build(doc: &Document) -> CompiledChart {
    let r = Resolved::new(doc);
    let width = as_int(doc.cast_on)
        .filter(|n| (1..=MAX_CAST_ON).contains(n))
        .unwrap_or(0) as usize;
    let mut chart = CompiledChart {
        width,
        height: 0,
        palette: doc.palette.iter().map(|c| c.id.clone()).collect(),
        cells: Vec::new(),
        symbols: Vec::new(),
        row_band: Vec::new(),
    };

    for (b, band) in doc.bands.iter().enumerate() {
        let Some(height) = r.band_height(doc, band) else {
            continue;
        };
        let (motif_id, mapping_id, offset, flip_h, flip_v) = match &band.kind {
            BandKind::Motif {
                motif,
                mapping,
                offset,
                flip_horizontal,
                flip_vertical,
                ..
            } => (motif, mapping, *offset, *flip_horizontal, *flip_vertical),
            BandKind::Spacer { color, .. } => {
                let Some(&color) = r.palette.get(color.as_str()) else {
                    continue;
                };
                chart.cells.extend(std::iter::repeat_n(color as u16, height * width));
                chart.symbols.extend(std::iter::repeat_n(0, height * width));
                chart.row_band.extend(std::iter::repeat_n(b as u16, height));
                chart.height += height;
                continue;
            }
        };
        let Some(m) = r.motif(motif_id) else { continue };
        let Some(p) = r.mapping(m, mapping_id) else { continue };
        if !r.mapping_ok[m][p] {
            continue;
        }
        let motif = &doc.motifs[m];
        let w = motif_width(motif);
        let rows: Vec<&[u8]> = motif.rows.iter().map(|s| s.as_bytes()).collect();
        let source = &motif.mappings[p];
        // Palette index of background, foreground and accent, per motif row.
        let mapping: Vec<[u16; 3]> = source
            .rows
            .iter()
            .map(|row| {
                let digits = row_digits(row).unwrap_or_default();
                let idx = |slot: usize| {
                    digits
                        .get(slot)
                        .and_then(|d| source.colors.get(*d))
                        .and_then(|id| r.palette.get(id.as_str()))
                        .map_or(0, |v| *v as u16)
                };
                // Without an accent, E007 guarantees symbol 2 never appears.
                [idx(0), idx(1), if digits.len() > 2 { idx(2) } else { idx(1) }]
            })
            .collect();
        let h = rows.len();
        let shift = as_int(offset).unwrap_or(0).rem_euclid(w as i64) as usize;

        chart.cells.reserve(height * width);
        chart.symbols.reserve(height * width);
        for j in 0..height {
            // The mapping has one row per motif row, so both repeat together,
            // and a vertical flip turns the colours over with the shape.
            let r = if flip_v { h - 1 - j % h } else { j % h };
            let motif_row = rows[r];
            let colors = mapping[r];
            for c in 0..width {
                // A horizontal flip mirrors the motif; the offset then slides
                // the mirrored motif.
                let m = (c + shift) % w;
                let m = if flip_h { w - 1 - m } else { m };
                let symbol = motif_row.get(m).map_or(0, |ch| ch.wrapping_sub(b'0'));
                let symbol = if symbol > 2 { 0 } else { symbol };
                chart.symbols.push(symbol);
                chart.cells.push(colors[symbol as usize]);
            }
            chart.row_band.push(b as u16);
        }
        chart.height += height;
    }
    chart
}

/// Physical stitch positions in centimetres, for the previews.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StitchLayout {
    /// Width of one stitch: per_cm / gauge.stitches.
    pub stitch_width: f64,
    /// Height of one row: per_cm / gauge.rows.
    pub row_height: f64,
    /// Centre line of each row, bottom row first; the bottom edge is y = 0.
    pub row_y: Vec<f64>,
    /// Index into `x` of each row's first stitch; `height + 1` entries, so
    /// row `i` spans `x[row_start[i]..row_start[i + 1]]`.
    pub row_start: Vec<u32>,
    /// Centre of each stitch, columns from the left, each row centred on 0.
    pub x: Vec<f64>,
}

pub fn layout(doc: &Document, chart: &CompiledChart) -> StitchLayout {
    let sw = doc.gauge.per_cm / doc.gauge.stitches;
    let rh = doc.gauge.per_cm / doc.gauge.rows;
    let mut out = StitchLayout {
        stitch_width: sw,
        row_height: rh,
        row_y: Vec::with_capacity(chart.height),
        row_start: Vec::with_capacity(chart.height + 1),
        x: Vec::with_capacity(chart.width * chart.height),
    };
    let n = chart.width as f64;
    for y in 0..chart.height {
        out.row_start.push(out.x.len() as u32);
        out.row_y.push((y as f64 + 0.5) * rh);
        // Version 1 has no shaping: every row has `width` stitches.
        for c in 0..chart.width {
            out.x.push((c as f64 + 0.5 - n / 2.0) * sw);
        }
    }
    out.row_start.push(out.x.len() as u32);
    out
}

fn gcd(a: u64, b: u64) -> u64 {
    if b == 0 {
        a
    } else {
        gcd(b, a % b)
    }
}

/// Up to two cast-on values (1–1000) that are multiples of every width: the
/// nearest at or below `cast_on`, then the nearest above. Empty when
/// `cast_on` already fits, or when no value up to 1000 does.
pub fn suggest(cast_on: i64, widths: &[usize]) -> Vec<u32> {
    let mut lcm: u64 = 1;
    for &w in widths {
        if w == 0 {
            continue;
        }
        let w = w as u64;
        lcm = lcm / gcd(lcm, w) * w;
        if lcm > MAX_CAST_ON as u64 {
            return Vec::new();
        }
    }
    let current = cast_on.clamp(0, MAX_CAST_ON) as u64;
    if current >= 1 && current.is_multiple_of(lcm) && cast_on == current as i64 {
        return Vec::new();
    }
    let below = current / lcm * lcm;
    let mut out = Vec::new();
    if below >= 1 {
        out.push(below as u32);
    }
    let above = below + lcm;
    if above <= MAX_CAST_ON as u64 {
        out.push(above as u32);
    }
    out
}

/// Suggestions for the document's current bands (`suggest_cast_on`).
pub fn suggest_for(doc: &Document) -> Vec<u32> {
    if doc.kind != Kind::Pattern {
        return Vec::new();
    }
    let r = Resolved::new(doc);
    let widths = band_widths(doc, &r);
    let cast_on = if doc.cast_on.is_finite() {
        doc.cast_on.round() as i64
    } else {
        0
    };
    suggest(cast_on, &widths)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suggestions() {
        assert_eq!(suggest(124, &[6, 8]), vec![120, 144]);
        assert_eq!(suggest(120, &[6, 8]), Vec::<u32>::new());
        assert_eq!(suggest(10, &[24]), vec![24]);
        assert_eq!(suggest(999, &[7, 11, 13]), Vec::<u32>::new());
        assert_eq!(suggest(990, &[100]), vec![900, 1000]);
        assert_eq!(suggest(1000, &[300]), vec![900]);
        assert_eq!(suggest(5000, &[3]), vec![999]);
    }
}
