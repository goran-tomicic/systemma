import { toLinear } from './srgb.js';
import type { RGB, RGBA } from './types.js';

// Composite a translucent color over an opaque background.
export function flatten(color: RGBA, over: RGB): [number, number, number] {
  const a = color[3] ?? 1;
  if (a >= 1) return [color[0], color[1], color[2]];
  return [
    color[0] * a + over[0] * (1 - a),
    color[1] * a + over[1] * (1 - a),
    color[2] * a + over[2] * (1 - a),
  ];
}

// WCAG 2 relative luminance. The coefficients are rounded to four places on purpose: that is what
// the WCAG definition lists, and it differs slightly from the APCA luminance weights.
const luminance = (c: RGB): number =>
  0.2126 * toLinear(c[0]) + 0.7152 * toLinear(c[1]) + 0.0722 * toLinear(c[2]);

// Order-independent: the lighter color always goes in the numerator.
export function contrastRatio(fg: RGB, bg: RGB): number {
  const x = luminance(fg);
  const y = luminance(bg);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
