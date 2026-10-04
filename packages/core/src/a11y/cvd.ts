import { fromLinear, toLinearRgb } from './srgb.js';
import type { RGB, Simulation } from './types.js';

type Matrix = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

// Machado, Oliveira and Fernandes (2009), severity 1.0, applied in linear RGB.
const MATRICES: Record<Exclude<Simulation, 'grayscale'>, Matrix> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

// Severity 0-1 blends from normal vision to the full matrix, an approximation of anomalous trichromacy.
export function simulate(rgb: RGB, type: Simulation, severity = 1): [number, number, number] {
  const l = toLinearRgb(rgb);
  let sim: [number, number, number];
  if (type === 'grayscale') {
    const y = 0.2126729 * l[0] + 0.7151522 * l[1] + 0.072175 * l[2];
    sim = [y, y, y];
  } else if (type in MATRICES) {
    const m = MATRICES[type];
    sim = [
      m[0][0] * l[0] + m[0][1] * l[1] + m[0][2] * l[2],
      m[1][0] * l[0] + m[1][1] * l[1] + m[1][2] * l[2],
      m[2][0] * l[0] + m[2][1] * l[1] + m[2][2] * l[2],
    ];
  } else {
    // Unknown types arrive from untyped callers (a UI select, JSON config); pass the color through.
    return [rgb[0], rgb[1], rgb[2]];
  }
  return [
    fromLinear(l[0] * (1 - severity) + sim[0] * severity),
    fromLinear(l[1] * (1 - severity) + sim[1] * severity),
    fromLinear(l[2] * (1 - severity) + sim[2] * severity),
  ];
}
