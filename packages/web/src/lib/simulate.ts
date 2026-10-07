import { apcaLc, contrastRatio, deltaE76, flatten, resolve, roleOfToken, simulate, toRgba } from '@systemma/core';
import type { Dataset, Mode, RGB, Simulation } from '@systemma/core';
import { labelOf } from './compare';

// The conditions the matrices cover, then two that only a browser filter can approximate.
export type Condition = Simulation | 'lowvision' | 'washed';

export const CONDITIONS: readonly { id: Condition; label: string }[] = [
  { id: 'protanopia', label: 'Protanopia' },
  { id: 'deuteranopia', label: 'Deuteranopia' },
  { id: 'tritanopia', label: 'Tritanopia' },
  { id: 'grayscale', label: 'Grayscale' },
  { id: 'lowvision', label: 'Low vision' },
  { id: 'washed', label: 'Washed out' },
];

// Only the three dichromacies have a severity.
export const hasSeverity = (c: Condition): boolean => c === 'protanopia' || c === 'deuteranopia' || c === 'tritanopia';
export const isMatrix = (c: Condition): c is Simulation => c !== 'lowvision' && c !== 'washed';

export const FILTERS: Record<'lowvision' | 'washed', string> = {
  lowvision: 'blur(1.4px) contrast(0.85)',
  washed: 'contrast(0.5) brightness(1.2)',
};

const BLACK: RGB = [0, 0, 0];
const WHITE: RGB = [255, 255, 255];

export function rgbHex(c: RGB): string {
  const h = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

// Black or white text, whichever reads better on the color.
export const inkOn = (c: RGB): string => (contrastRatio(BLACK, c) >= contrastRatio(WHITE, c) ? '#111111' : '#ffffff');

// What a token resolves to as a color in a mode, or null if it is not one.
export function colorOf(ds: Dataset, id: string, mode: Mode): [number, number, number, number] | null {
  const r = resolve(ds, id, mode);
  if (!('value' in r)) return null;
  const c = toRgba(r.value);
  return c ? [c[0], c[1], c[2], c[3] ?? 1] : null;
}

// The opaque color a translucent one is judged over: the base surface, or white when there is none.
export function surfaceRgb(ds: Dataset, mode: Mode): RGB {
  const c = colorOf(ds, 'color-surface-base', mode);
  return c && c[3] >= 1 ? [c[0], c[1], c[2]] : WHITE;
}

// The tokens a color is most likely to be mistaken for: the same step in another palette, or another status text.
export function peerTokens(ds: Dataset, id: string): string[] {
  const palette = /^color-palette-([a-z0-9]+)-(.+)$/;
  const own = id.match(palette);
  if (own) return [...ds.tokens.keys()].filter((k) => { const n = k.match(palette); return n && n[2] === own[2] && n[1] !== own[1]; });
  const status = id.match(/^color-fg-(brand|danger|success|warning|info)$/);
  if (!status) return [];
  return ['brand', 'danger', 'success', 'warning', 'info'].filter((r) => r !== status[1]).map((r) => `color-fg-${r}`).filter((k) => ds.tokens.has(k));
}

export type Verdict = 'hard' | 'close' | '';
// CIE76 is coarse: under about 10 reads as nearly the same color.
export const verdictOf = (deltaE: number): Verdict => (deltaE < 10 ? 'hard' : deltaE < 20 ? 'close' : '');

export interface PeerRow {
  id: string;
  label: string;
  normal: number;
  simulated: number;
  verdict: Verdict;
}

export function peerRows(ds: Dataset, id: string, mode: Mode, rgb: RGB, type: Simulation, severity: number): PeerRow[] {
  const base = surfaceRgb(ds, mode);
  const out: PeerRow[] = [];
  for (const p of peerTokens(ds, id)) {
    const c = colorOf(ds, p, mode);
    if (!c) continue;
    const prgb = flatten(c, base);
    const simulated = deltaE76(simulate(rgb, type, severity), simulate(prgb, type, severity));
    out.push({ id: p, label: labelOf(ds, p), normal: deltaE76(rgb, prgb), simulated, verdict: verdictOf(simulated) });
  }
  return out;
}

export interface ContrastRow {
  label: string;
  // The token it is, or null for plain white and black.
  id: string | null;
  ratio: number;
  lc: number;
}

// A background is read with the texts that sit on it, anything else against the surfaces it sits on.
export function contrastRows(ds: Dataset, id: string, mode: Mode, rgb: RGB): ContrastRow[] {
  const isBg = roleOfToken(id) === 'bg';
  const refs: { label: string; id: string | null; c: [number, number, number, number] }[] = [];
  const add = (t: string): void => {
    const c = t !== id && ds.tokens.has(t) ? colorOf(ds, t, mode) : null;
    if (c && (isBg || c[3] >= 1)) refs.push({ label: labelOf(ds, t), id: t, c });
  };
  if (isBg) {
    add(id.replace(/^(color-palette-[a-z0-9]+-(solid|subtle)).*$/, '$1-fg'));
    ['color-fg-base', 'color-fg-muted', 'color-fg-subtle', 'color-fg-on-emphasis'].forEach(add);
  } else {
    ['color-surface-canvas', 'color-surface-base', 'color-surface-elevated', 'color-surface-emphasis'].forEach(add);
  }
  refs.push({ label: 'White', id: null, c: [255, 255, 255, 1] }, { label: 'Black', id: null, c: [0, 0, 0, 1] });
  return refs.map((r) => {
    const fg = isBg ? flatten(r.c, rgb) : rgb;
    const bg: RGB = isBg ? rgb : [r.c[0], r.c[1], r.c[2]];
    return { label: r.label, id: r.id, ratio: contrastRatio(fg, bg), lc: Math.abs(apcaLc(fg, bg)) };
  });
}
