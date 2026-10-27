// Colour maths for rendering: hex parsing, CIELAB L* (the same formula as
// the core's W105 check) and grayscale.

export type RGB = [number, number, number];

export function parseHex(hex: string): RGB | null {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** CIELAB L* (D65), 0–100. */
export function lightness([r, g, b]: RGB): number {
  const y = 0.2126729 * linear(r) + 0.7151522 * linear(g) + 0.072175 * linear(b);
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

/** The sRGB gray with the given L*. */
export function grayForLightness(l: number): RGB {
  const fy = (l + 16) / 116;
  const y = l > 8 ? fy ** 3 : l / (24389 / 27);
  const c = y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055;
  const v = Math.round(Math.min(1, Math.max(0, c)) * 255);
  return [v, v, v];
}

export function toHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Hue 0–360, saturation and lightness 0–100, unrounded. */
export type HSL = [number, number, number];

/** HSL of an sRGB colour. Grays have hue 0. */
export function rgbToHsl([r, g, b]: RGB): HSL {
  const [rf, gf, bf] = [r / 255, g / 255, b / 255];
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  const sector = max === rf ? ((gf - bf) / d + 6) % 6 : max === gf ? (bf - rf) / d + 2 : (rf - gf) / d + 4;
  return [(sector * 60) % 360, s * 100, l * 100];
}

/** The sRGB colour of an HSL value, rounded to whole channels. */
export function hslToRgb([h, s, l]: HSL): RGB {
  const sf = Math.min(100, Math.max(0, s)) / 100;
  const lf = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * lf - 1)) * sf;
  const sector = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] = sector < 1 ? [c, x, 0] : sector < 2 ? [x, c, 0] : sector < 3 ? [0, c, x] : sector < 4 ? [0, x, c] : sector < 5 ? [x, 0, c] : [c, 0, x];
  const m = lf - c / 2;
  return [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v + m)) * 255)) as RGB;
}

const FALLBACK: RGB = [255, 0, 255];

/** The colour to draw for a palette hex, honouring the grayscale view. */
export function displayRgb(hex: string, grayscale: boolean): RGB {
  const rgb = parseHex(hex) ?? FALLBACK;
  return grayscale ? grayForLightness(lightness(rgb)) : rgb;
}

export function displayHex(hex: string, grayscale: boolean): string {
  return toHex(displayRgb(hex, grayscale));
}

/** Black or white, whichever reads better on the given colour. */
export function inkFor(rgb: RGB): string {
  return lightness(rgb) > 55 ? '#1b1b1b' : '#ffffff';
}
