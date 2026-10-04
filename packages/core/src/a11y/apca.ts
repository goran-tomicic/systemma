import type { RGB } from './types.js';

// APCA 0.0.98G-4g constants. Supplementary to WCAG 2 contrast, never a pass/fail rule.
const luminance = (c: RGB): number =>
  0.2126729 * Math.pow(c[0] / 255, 2.4) +
  0.7151522 * Math.pow(c[1] / 255, 2.4) +
  0.072175 * Math.pow(c[2] / 255, 2.4);

// Lifts near-black luminance so very dark colors don't produce runaway contrast.
const softClamp = (y: number): number => (y > 0.022 ? y : y + Math.pow(0.022 - y, 1.414));

// Lc is positive for dark text on a light background and negative for light text on dark.
export function apcaLc(text: RGB, bg: RGB): number {
  const yt = softClamp(luminance(text));
  const yb = softClamp(luminance(bg));
  if (Math.abs(yb - yt) < 0.0005) return 0;
  let out: number;
  if (yb > yt) {
    const s = (Math.pow(yb, 0.56) - Math.pow(yt, 0.57)) * 1.14;
    out = s < 0.1 ? 0 : s - 0.027;
  } else {
    const s = (Math.pow(yb, 0.65) - Math.pow(yt, 0.62)) * 1.14;
    out = s > -0.1 ? 0 : s + 0.027;
  }
  return out * 100;
}
