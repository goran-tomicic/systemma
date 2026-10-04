import type { RGB } from './types.js';

// 0.03928 is the threshold WCAG 2.x publishes (IEC 61966-2-1 says 0.04045). The difference is
// below one 8-bit step, and contrast results must match what WCAG tools report, so keep WCAG's value.
export const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

// Clamps first: simulation matrices can push channels slightly outside the gamut.
export const fromLinear = (value: number): number => {
  const x = Math.max(0, Math.min(1, value));
  return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
};

export const toLinearRgb = (rgb: RGB): [number, number, number] =>
  [toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2])];
