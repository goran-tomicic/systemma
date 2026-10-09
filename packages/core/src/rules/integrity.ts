import { toRgba } from '../model/color.js';
import { toPx } from '../model/units.js';
import { refsOf } from '../model/value.js';
import { resolve } from '../resolve/resolve.js';
import type { Kind, Mode } from '../model/types.js';
import type { RuleFn } from './context.js';
import type { RuleId } from './types.js';

const MODES: readonly Mode[] = ['light', 'dark'];

// Two values are the same when they paint the same color or come to the same pixel length.
function literalKey(value: string): string | null {
  const c = toRgba(value);
  if (c) return `c:${c[0]},${c[1]},${c[2]},${(c[3] ?? 1).toFixed(2)}`;
  const px = toPx(value);
  return px === null ? null : `l:${px}`;
}

const brokenRef: RuleFn = ({ ds, tokens, add }) => {
  for (const t of tokens) {
    for (const [mode, value] of Object.entries(t.modes)) {
      for (const ref of refsOf(value)) {
        if (!ds.tokens.has(ref)) add('broken-ref', 'error', t.id, t.label, `${mode}: references ${ref}, which isn't defined`);
      }
    }
  }
};

const cycle: RuleFn = ({ ds, tokens, add, label }) => {
  for (const t of tokens) {
    for (const mode of MODES) {
      if (!t.modes[mode]) continue;
      const r = resolve(ds, t.id, mode);
      if ('error' in r && r.error === 'cycle') add('cycle', 'error', t.id, t.label, `${mode}: ${r.chain.map(label).join(' › ')}`);
    }
  }
};

const brokenUsage: RuleFn = ({ ds, add, label }) => {
  for (const u of ds.usage) {
    if (ds.tokens.has(u.token)) continue;
    const renamed = ds.renames && Object.hasOwn(ds.renames, u.token) ? ds.renames[u.token] : undefined;
    add('broken-usage', 'error', null, u.component,
      `uses ${u.token}${u.prop ? ' (' + u.prop + ')' : ''}, which isn't defined` + (renamed ? ` — renamed to ${label(renamed)}` : ''));
  }
};

// The first token holding an id is kept, so the finding sits on it and names what was left out. The same
// name in two Figma collections is reported with the collections, since the labels are equal.
const idCollision: RuleFn = ({ tokens, add }) => {
  for (const t of tokens) {
    const seen = new Set<string>();
    for (const c of t.collisions ?? []) {
      const key = c.label + '|' + (c.collection ?? '');
      if (seen.has(key)) continue;
      seen.add(key);
      const message = c.label === t.label
        ? `'${c.label}' in collection '${c.collection ?? ''}' has the same id (${t.id}) as the one in '${t.collection ?? ''}' and was not merged`
        : `has the same id (${t.id}) as '${t.label}' and was not merged`;
      add('id-collision', 'error', t.id, c.label, message);
    }
  }
};

// A kind is only checked once some token of that kind has a dark value; a light-only set is not "missing"
// them. This is decided per kind, so widening the list to dimensions does not flag every dimension in a
// system where only colors change between modes.
const DEFAULT_MODE_GAP_KINDS: readonly Kind[] = ['color'];

const modeGap: RuleFn = ({ tokens, analysis, options, add }) => {
  const { info } = analysis;
  const watched = new Set<Kind>(options.modeGapKinds ?? DEFAULT_MODE_GAP_KINDS);
  const kindsWithDark = new Set<Kind>();
  for (const t of tokens) {
    const kind = info.get(t.id)?.kind;
    if (kind && watched.has(kind) && t.modes.dark) kindsWithDark.add(kind);
  }
  for (const t of tokens) {
    const i = info.get(t.id);
    if (i && kindsWithDark.has(i.kind) && i.tier !== 'foundation' && !t.modes.dark) {
      add('mode-gap', 'warn', t.id, t.label, 'has a light value but no dark value');
    }
  }
};

// Without usage data every token would look unused, so the rule stays quiet.
const unused: RuleFn = ({ ds, tokens, analysis, add }) => {
  if (!ds.usage.length) return;
  for (const t of tokens) {
    const i = analysis.info.get(t.id);
    if (i && i.tier !== 'foundation' && !analysis.usageBy.has(t.id) && !analysis.dependents.has(t.id)) {
      add('unused', 'info', t.id, t.label, 'not referenced by usage data or other tokens');
    }
  }
};

// A raw value in code that a token already holds. Nothing is said when no token matches, since many raw values
// have no token yet. When several tokens match, a non-foundation one is suggested first.
const hardcodedValue: RuleFn = ({ ds, analysis, add }) => {
  if (!ds.literals?.length) return;
  const index = new Map<string, string[]>();
  for (const t of ds.tokens.values()) {
    for (const mode of MODES) {
      if (!t.modes[mode]) continue;
      const r = resolve(ds, t.id, mode);
      if (!('value' in r)) continue;
      const key = literalKey(r.value);
      if (!key) continue;
      const ids = index.get(key);
      if (!ids) index.set(key, [t.id]);
      else if (!ids.includes(t.id)) ids.push(t.id);
    }
  }
  const rank = (id: string): number => (analysis.info.get(id)?.tier === 'foundation' ? 1 : 0);
  for (const u of ds.literals) {
    const key = literalKey(u.value);
    const ids = key ? index.get(key) : undefined;
    if (!ids) continue;
    const best = [...ids].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))[0];
    if (!best) continue;
    const label = ds.tokens.get(best)?.label ?? best;
    add('hardcoded-value', 'warn', null, u.component, `${u.prop ? u.prop + ': ' : ''}${u.value} is the value of ${label}${ids.length > 1 ? ` (and ${ids.length - 1} more)` : ''}`);
  }
};

// A deprecated token that something still depends on. Tokens that are themselves deprecated may refer to it, since
// they are on their way out too. Without usage data only token references can show it.
const deprecatedInUse: RuleFn = ({ ds, tokens, analysis, add, label }) => {
  for (const t of tokens) {
    if (!t.deprecated) continue;
    const components = new Set((analysis.usageBy.get(t.id) ?? []).map((u) => u.component));
    const users = [...(analysis.dependents.get(t.id) ?? [])].filter((id) => !ds.tokens.get(id)?.deprecated);
    if (!components.size && !users.length) continue;
    const parts = [
      components.size ? `${components.size} ${components.size === 1 ? 'component' : 'components'} (${[...components].sort().slice(0, 3).join(', ')}${components.size > 3 ? ', …' : ''})` : '',
      users.length ? `${users.length} ${users.length === 1 ? 'token' : 'tokens'} (${users.sort().slice(0, 3).map(label).join(', ')}${users.length > 3 ? ', …' : ''})` : '',
    ].filter(Boolean);
    add('deprecated-in-use', 'warn', t.id, t.label, `is deprecated${typeof t.deprecated === 'string' ? ` (${t.deprecated})` : ''} but still used by ${parts.join(' and ')}`);
  }
};

export const INTEGRITY_RULES: Partial<Record<RuleId, RuleFn>> = {
  'broken-ref': brokenRef,
  cycle,
  'broken-usage': brokenUsage,
  'id-collision': idCollision,
  'mode-gap': modeGap,
  unused,
  'hardcoded-value': hardcodedValue,
  'deprecated-in-use': deprecatedInUse,
};
