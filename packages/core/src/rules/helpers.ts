import { contrastRatio, flatten } from '../a11y/contrast.js';
import type { RGB } from '../a11y/types.js';
import { toRgba } from '../model/color.js';
import { toMs, toPx } from '../model/units.js';
import type { Dataset, Mode, Token } from '../model/types.js';
import { resolve } from '../resolve/resolve.js';

export const MODES: readonly Mode[] = ['light', 'dark'];

// Interaction states, grouped by concept so spellings of one concept can be compared.
export const STATE_WORDS: Readonly<Record<string, readonly string[]>> = {
  hover: ['hover', 'hovered'],
  pressed: ['pressed', 'active', 'down'],
  focus: ['focus', 'focused'],
  selected: ['selected'],
  disabled: ['disabled'],
};
export const STATE_LIST: readonly string[] = Object.values(STATE_WORDS).flat();
export const STATE_ALL: ReadonlySet<string> = new Set(STATE_LIST);

export const HUES: ReadonlySet<string> = new Set([
  'gray', 'grey', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'teal', 'cyan', 'indigo', 'violet', 'amber', 'lime',
  'emerald', 'slate', 'zinc', 'stone', 'rose', 'sky', 'fuchsia', 'magenta',
]);

export const TSHIRT = /^(2xs|xxs|xs|sm|s|md|m|lg|l|xl|xxl|2xl|3xl|xxxl)$/;

// Path segments as authored: slash labels split on slashes, everything else on hyphens.
export const segmentsOf = (t: Token): string[] => {
  const label = t.label.replace(/^--/, '');
  return label.includes('/') ? label.split('/') : label.split('-');
};

// A plain number for a resolved light value: px for lengths, ms for times, else the leading number.
export function numericValue(ds: Dataset, id: string): number | null {
  const r = resolve(ds, id, 'light');
  if (!('value' in r)) return null;
  const px = toPx(r.value);
  const ms = toMs(r.value);
  if (px !== null) return px;
  if (ms !== null) return ms;
  const f = parseFloat(r.value);
  return Number.isNaN(f) ? null : f;
}

// The resolved value in every mode, normalized, so two tokens can be compared for sameness.
export const signatureOf = (ds: Dataset, id: string): string =>
  MODES.map((m) => {
    const r = resolve(ds, id, m);
    return 'value' in r ? String(r.value).replace(/\s+/g, '').toLowerCase() : '-';
  }).join('|');

// The role a color token plays, from its name: a background, a foreground or a border.
export function roleOfToken(id: string): 'bg' | 'fg' | 'border' | '' {
  if (/^color-(surface|bg)-/.test(id)) return 'bg';
  if (/^color-fg-/.test(id)) return 'fg';
  if (/^color-border-/.test(id)) return 'border';
  if (/^color-palette-[a-z0-9]+-(solid|subtle)(-(hover|hovered|active|pressed|disabled|focus|focused|selected))?$/.test(id)) return 'bg';
  if (/^color-palette-[a-z0-9]+-(solid|subtle)-fg$/.test(id)) return 'fg';
  if (/^color-palette-[a-z0-9]+-border(-(hover|hovered|active|pressed|disabled|focus|focused|selected))?$/.test(id)) return 'border';
  return '';
}

// The role of the CSS property a token is used in. Shadows, fills and gradients have no single role.
export function roleOfProp(prop: string): 'bg' | 'fg' | 'border' | '' {
  const p = String(prop || '').toLowerCase();
  if (!p || /shadow|fill|gradient/.test(p)) return '';
  if (/border|outline|stroke|ring|divider/.test(p)) return 'border';
  if (/^background/.test(p) || /(^|[-_])(bg|background|surface|backdrop|overlay)([-_]|$)/.test(p)) return 'bg';
  if (/(^|[-_])(text|color|heading|placeholder|label|icon|fg|foreground|link|font)([-_]|$)/.test(p)) return 'fg';
  return '';
}

// WCAG contrast of a foreground token on a background token in one mode. A translucent foreground is
// flattened over the background first; a translucent background cannot be judged, so it yields null,
// as does anything that is not an sRGB color.
export function pairRatio(ds: Dataset, fgId: string, bgId: string, mode: Mode): number | null {
  const f = resolve(ds, fgId, mode);
  const b = resolve(ds, bgId, mode);
  if (!('value' in f) || !f.value || !('value' in b) || !b.value) return null;
  const fa = toRgba(f.value);
  const ba = toRgba(b.value);
  if (!fa || !ba || ba[3] < 1) return null;
  const bg: RGB = [ba[0], ba[1], ba[2]];
  return contrastRatio(flatten(fa, bg), bg);
}

// Foreground and background pairs worth checking, inferred from the naming scheme: a palette role's
// -fg on its solid or subtle background, and every color-fg-* on the base surface (on-emphasis excepted).
export function textPairs(ds: Dataset): [string, string][] {
  const pairs: [string, string][] = [];
  for (const id of ds.tokens.keys()) {
    const m = id.match(/^(color-palette-[a-z0-9]+)-(solid|subtle)$/);
    if (m) pairs.push([`${m[1]}-${m[2]}-fg`, id]);
    if (/^color-fg-/.test(id)) pairs.push(id === 'color-fg-on-emphasis' ? [id, 'color-surface-emphasis'] : [id, 'color-surface-base']);
  }
  return pairs.filter(([a, b]) => ds.tokens.has(a) && ds.tokens.has(b));
}
