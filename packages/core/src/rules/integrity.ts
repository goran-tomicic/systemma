import { refsOf } from '../model/value.js';
import { resolve } from '../resolve/resolve.js';
import type { Kind, Mode } from '../model/types.js';
import type { RuleFn } from './context.js';
import type { RuleId } from './types.js';

const MODES: readonly Mode[] = ['light', 'dark'];

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

export const INTEGRITY_RULES: Partial<Record<RuleId, RuleFn>> = {
  'broken-ref': brokenRef,
  cycle,
  'broken-usage': brokenUsage,
  'id-collision': idCollision,
  'mode-gap': modeGap,
  unused,
};
