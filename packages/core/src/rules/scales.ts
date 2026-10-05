import type { Token } from '../model/types.js';
import type { RuleFn } from './context.js';
import { numericValue, segmentsOf, signatureOf } from './helpers.js';
import type { RuleId } from './types.js';

// Spacing steps are expected on an 8px grid, or a 4px one. A grid is only assumed when four or more
// values are measurable and at least 80% of them already fit it; otherwise there is no grid to violate.
const baseUnit: RuleFn = ({ ds, tokens, analysis, add }) => {
  const items = tokens
    .filter((t) => {
      const i = analysis.info.get(t.id);
      return i?.tier === 'foundation' && i.category === 'spacing';
    })
    .map((t) => ({ t, px: numericValue(ds, t.id) }))
    .filter((x): x is { t: Token; px: number } => x.px !== null && x.px > 2);
  if (items.length < 4) return;
  const fits = (b: number): number => items.filter((x) => x.px % b === 0).length / items.length;
  const base = fits(8) >= 0.8 ? 8 : fits(4) >= 0.8 ? 4 : 0;
  if (!base) return;
  for (const x of items) if (x.px % base !== 0) add('base-unit', 'info', x.t.id, x.t.label, `${x.px}px is not a multiple of the ${base}px base unit`);
};

const scaleOrder: RuleFn = ({ ds, tokens, analysis, add }) => {
  const groups = new Map<string, { t: Token; n: number; v: number | null }[]>();
  for (const t of tokens) {
    const i = analysis.info.get(t.id);
    if (!i || i.tier !== 'foundation' || !['dimension', 'number', 'duration'].includes(i.kind)) continue;
    const segs = segmentsOf(t);
    const last = segs[segs.length - 1] ?? '';
    if (!/^\d+$/.test(last)) continue;
    const key = segs.slice(0, -1).join('/');
    const item = { t, n: +last, v: numericValue(ds, t.id) };
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  for (const items of groups.values()) {
    if (items.length < 3) continue;
    items.sort((a, b) => a.n - b.n);
    let prev: { t: Token; v: number } | null = null;
    for (const it of items) {
      if (it.v === null) continue;
      if (prev && it.v <= prev.v) add('scale-order', 'warn', it.t.id, it.t.label, `${it.v} is not larger than ${prev.t.label} (${prev.v})`);
      prev = { t: it.t, v: it.v };
    }
  }
};

const duplicateSemantic: RuleFn = ({ ds, tokens, analysis, add }) => {
  // Palette roles: two roles that share three or more variants and resolve identically in all of them.
  const roles: Record<string, Record<string, string>> = Object.create(null) as Record<string, Record<string, string>>;
  for (const t of tokens) {
    const m = t.id.match(/^color-palette-([a-z0-9]+)-(.+)$/);
    if (m?.[1] !== undefined && m[2] !== undefined) (roles[m[1]] ??= Object.create(null) as Record<string, string>)[m[2]] = signatureOf(ds, t.id);
  }
  const names = Object.keys(roles);
  for (let a = 0; a < names.length; a++) {
    for (let b = a + 1; b < names.length; b++) {
      const ra = roles[names[a]!]!;
      const rb = roles[names[b]!]!;
      const shared = Object.keys(ra).filter((k) => k in rb);
      if (shared.length >= 3 && shared.every((k) => ra[k] === rb[k])) {
        add('duplicate-semantic', 'info', null, `palette/${names[b]}`, `resolves to the same colors as palette/${names[a]} in all ${shared.length} shared variants`);
      }
    }
  }
  // Common colors: tokens in one group with the same resolved value. -base, -muted, -subtle and -emphasis
  // are expected to coincide with a sibling, so they are only reported when the pair is exactly two.
  const groups = new Map<string, Token[]>();
  for (const t of tokens) {
    const i = analysis.info.get(t.id);
    if (i?.tier !== 'common' || i.kind !== 'color') continue;
    const key = i.group + '|' + signatureOf(ds, t.id);
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }
  for (const list of groups.values()) {
    for (const t of list.slice(1)) {
      if (!/-(base|muted|subtle|emphasis)$/.test(t.id) || list.length === 2) add('duplicate-semantic', 'info', t.id, t.label, `same resolved value as ${list[0]!.label}`);
    }
  }
};

export const SCALES_RULES: Partial<Record<RuleId, RuleFn>> = {
  'base-unit': baseUnit,
  'scale-order': scaleOrder,
  'duplicate-semantic': duplicateSemantic,
};
