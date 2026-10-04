import { toLinearRgb } from './srgb.js';
import type { RGB } from './types.js';

type Lab = readonly [l: number, a: number, b: number];

// sRGB to CIE Lab under D65.
function rgbToLab(rgb: RGB): Lab {
  const [r, g, b] = toLinearRgb(rgb);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// CIE76 color difference. Coarse: under about 10 reads as nearly the same color.
export function deltaE76(a: RGB, b: RGB): number {
  const x = rgbToLab(a);
  const y = rgbToLab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
