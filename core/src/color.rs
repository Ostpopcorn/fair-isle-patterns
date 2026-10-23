//! Colour helpers: hex parsing and CIELAB lightness.

/// Parses `#rrggbb` (either case) into its channels.
pub fn parse_hex(hex: &str) -> Option<[u8; 3]> {
    let digits = hex.strip_prefix('#')?;
    if digits.len() != 6 || !digits.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let channel = |i: usize| u8::from_str_radix(&digits[i..i + 2], 16).ok();
    Some([channel(0)?, channel(2)?, channel(4)?])
}

fn linear(channel: u8) -> f64 {
    let c = f64::from(channel) / 255.0;
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

/// CIELAB L* (D65 white point) of an sRGB colour, 0–100.
pub fn lightness(rgb: [u8; 3]) -> f64 {
    let y = 0.212_672_9 * linear(rgb[0]) + 0.715_152_2 * linear(rgb[1]) + 0.072_175_0 * linear(rgb[2]);
    let epsilon = 216.0 / 24389.0;
    let kappa = 24389.0 / 27.0;
    if y > epsilon {
        116.0 * y.cbrt() - 16.0
    } else {
        kappa * y
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex() {
        assert_eq!(parse_hex("#efe6d2"), Some([0xef, 0xe6, 0xd2]));
        assert_eq!(parse_hex("#EFE6D2"), Some([0xef, 0xe6, 0xd2]));
        assert_eq!(parse_hex("efe6d2"), None);
        assert_eq!(parse_hex("#efe6d"), None);
        assert_eq!(parse_hex("#efe6dz"), None);
        assert_eq!(parse_hex("#ééé"), None);
    }

    #[test]
    fn lightness_values() {
        assert!((lightness([0, 0, 0]) - 0.0).abs() < 1e-9);
        assert!((lightness([255, 255, 255]) - 100.0).abs() < 1e-3);
        assert!((lightness([0x77, 0x77, 0x77]) - 50.03).abs() < 0.05);
        // The hat-basic palette.
        assert!((lightness([0xef, 0xe6, 0xd2]) - 91.5).abs() < 0.2);
        assert!((lightness([0xd9, 0xa4, 0x41]) - 70.6).abs() < 0.3);
    }
}
