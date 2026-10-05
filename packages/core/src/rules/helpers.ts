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
