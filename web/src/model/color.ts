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
