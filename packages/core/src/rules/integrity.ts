import { refsOf } from '../model/value.js';
import { resolve } from '../resolve/resolve.js';
import type { Mode } from '../model/types.js';
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

// Only meaningful when the set has dark values at all; a light-only set is not "missing" them.
const modeGap: RuleFn = ({ tokens, analysis, add }) => {
  const { info } = analysis;
  const hasDark = tokens.some((t) => t.modes.dark && info.get(t.id)?.kind === 'color');
  if (!hasDark) return;
  for (const t of tokens) {
    const i = info.get(t.id);
    if (i && i.kind === 'color' && i.tier !== 'foundation' && !t.modes.dark) add('mode-gap', 'warn', t.id, t.label, 'has a light value but no dark value');
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
  'mode-gap': modeGap,
  unused,
};
