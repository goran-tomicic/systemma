import { describe, expect, it } from 'vitest';
import { apcaLc, contrastRatio, deltaE76, flatten, simulate } from '../src/index.js';
import type { RGB, Simulation } from '../src/index.js';

const BLACK: RGB = [0, 0, 0];
const WHITE: RGB = [255, 255, 255];
const RED: RGB = [255, 0, 0];

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio(BLACK, WHITE)).toBe(21);
  });

  it('is 1 for identical colors', () => {
    expect(contrastRatio([12, 34, 56], [12, 34, 56])).toBe(1);
  });

  it('matches the published value for #767676 on white', () => {
    expect(contrastRatio([118, 118, 118], WHITE)).toBeCloseTo(4.54, 2);
  });

  it('does not depend on argument order', () => {
    expect(contrastRatio(WHITE, [118, 118, 118])).toBe(contrastRatio([118, 118, 118], WHITE));
  });

  // Pins the exact value so a change to the luminance weights or the 0.03928 threshold is deliberate.
  it('pins the unrounded #767676 result', () => {
    expect(contrastRatio([118, 118, 118], WHITE)).toBeCloseTo(4.542224959605253, 12);
  });
});

describe('flatten', () => {
  it('returns opaque colors unchanged', () => {
    expect(flatten([10, 20, 30], WHITE)).toEqual([10, 20, 30]);
    expect(flatten([10, 20, 30, 1], WHITE)).toEqual([10, 20, 30]);
  });

  it('composites over the background', () => {
    expect(flatten([255, 0, 0, 0.5], [0, 0, 255])).toEqual([127.5, 0, 127.5]);
  });

  it('is fully the background at alpha 0', () => {
    expect(flatten([255, 0, 0, 0], [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('treats a missing alpha as opaque', () => {
    expect(flatten([255, 0, 0, undefined], [0, 0, 255])).toEqual([255, 0, 0]);
  });
});

describe('apcaLc', () => {
  it('is about 106 for black on white', () => {
    expect(apcaLc(BLACK, WHITE)).toBeCloseTo(106.04, 2);
  });

  it('is negative for white on black', () => {
    expect(apcaLc(WHITE, BLACK)).toBeCloseTo(-107.88, 2);
  });

  it('is 0 when text and background match', () => {
    expect(apcaLc([90, 90, 90], [90, 90, 90])).toBe(0);
  });

  it('is 0 for a difference below the minimum', () => {
    expect(apcaLc([128, 128, 128], [128, 128, 129])).toBe(0);
  });

  it('is 0 when the scaled difference is under the clip threshold', () => {
    expect(apcaLc([120, 120, 120], [130, 130, 130])).toBe(0);
  });
});

describe('simulate', () => {
  const rounded = (rgb: RGB, type: Simulation, severity?: number): number[] =>
    simulate(rgb, type, severity).map(Math.round);

  it('converts red to gray by luminance', () => {
    expect(rounded(RED, 'grayscale')).toEqual([127, 127, 127]);
  });

  it.each([
    ['deuteranopia', [163, 144, 0]],
    ['protanopia', [109, 95, 0]],
    ['tritanopia', [255, 0, 15]],
  ] as const)('pins pure red under %s', (type, expected) => {
    expect(rounded(RED, type)).toEqual([...expected]);
  });

  it('leaves black and white alone', () => {
    for (const type of ['protanopia', 'deuteranopia', 'tritanopia', 'grayscale'] as const) {
      expect(rounded(BLACK, type)).toEqual([0, 0, 0]);
      expect(rounded(WHITE, type)).toEqual([255, 255, 255]);
    }
  });

  it('returns the original color at severity 0', () => {
    const out = simulate([200, 100, 50], 'protanopia', 0);
    expect(out.map(Math.round)).toEqual([200, 100, 50]);
  });

  it('defaults to full severity', () => {
    expect(simulate(RED, 'deuteranopia')).toEqual(simulate(RED, 'deuteranopia', 1));
  });

  it('blends between normal vision and the full simulation', () => {
    const half = simulate(RED, 'grayscale', 0.5);
    expect(half[0]).toBeGreaterThan(127);
    expect(half[0]).toBeLessThan(255);
    expect(half[1]).toBeGreaterThan(0);
  });

  it('keeps channels inside 0-255', () => {
    for (const type of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      for (const c of [RED, [0, 255, 0], [0, 0, 255], [255, 255, 0]] as RGB[]) {
        for (const v of simulate(c, type)) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it('passes the color through for an unknown type', () => {
    expect(simulate([1, 2, 3], 'nope' as Simulation)).toEqual([1, 2, 3]);
  });
});

describe('deltaE76', () => {
  it('is 0 for identical colors', () => {
    expect(deltaE76([10, 20, 30], [10, 20, 30])).toBe(0);
  });

  it('is about 100 between black and white', () => {
    expect(deltaE76(BLACK, WHITE)).toBeCloseTo(100, 4);
  });

  it('is symmetric', () => {
    expect(deltaE76(RED, [0, 128, 255])).toBe(deltaE76([0, 128, 255], RED));
  });

  it('is large for red against green and small for near-identical colors', () => {
    expect(deltaE76(RED, [0, 255, 0])).toBeGreaterThan(100);
    expect(deltaE76([100, 100, 100], [101, 100, 100])).toBeLessThan(1);
  });
});
