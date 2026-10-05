import type { UsageRecord } from '../model/types.js';
import type { RuleFn } from './context.js';
import { STATE_ALL } from './helpers.js';
import type { RuleId } from './types.js';

const PALETTE_RE = /^color-palette-(brand|danger|success|warning|info|accent|discovery|premium)-((solid|subtle|border)(-(hover|active|disabled))?|(solid|subtle)-fg)$/;
const COMMON_RE = /^color-(surface-(canvas|base|elevated|backdrop|emphasis)|fg-(base|muted|subtle|on-emphasis|brand|danger|success|warning|info)|border-(base|muted|emphasis)|bg-(subtle|muted|emphasis))$/;

const fortisPalette: RuleFn = ({ tokens, analysis, add }) => {
  for (const t of tokens) {
    if (analysis.info.get(t.id)?.tier === 'palette' && t.id.startsWith('color-palette-') && !PALETTE_RE.test(t.id)) {
      add('fortis-palette', 'warn', t.id, t.label, 'does not match palette/{role}/{variant}[/state]');
    }
  }
};

const fortisCommon: RuleFn = ({ ds, tokens, analysis, add, label }) => {
  for (const t of tokens) {
    if (analysis.info.get(t.id)?.tier !== 'common' || !/^color-(surface|fg|border|bg)-/.test(t.id) || COMMON_RE.test(t.id)) continue;
    const renamed = ds.renames && Object.hasOwn(ds.renames, t.id) ? ds.renames[t.id] : undefined;
    add('fortis-common', 'warn', t.id, t.label, 'not a documented surface, fg, border or bg variant' + (renamed ? ` (renamed to ${label(renamed)})` : ''));
  }
};

// default, light and dark describe intensity or mode, which the naming scheme keeps out of variant names.
const fortisVocab: RuleFn = ({ tokens, analysis, add }) => {
  for (const t of tokens) {
    const i = analysis.info.get(t.id);
    if (!i || i.category !== 'color' || i.tier === 'foundation') continue;
    const word = t.id.split('-').slice(2).find((x) => ['default', 'light', 'dark'].includes(x));
    if (word) add('fortis-vocab', 'warn', t.id, t.label, `uses '${word}' as a variant name`);
  }
};

const fortisCommonStates: RuleFn = ({ tokens, analysis, add }) => {
  for (const t of tokens) {
    const i = analysis.info.get(t.id);
    if (i?.tier !== 'common' || i.category !== 'color') continue;
    const word = t.id.split('-').find((x) => STATE_ALL.has(x));
    if (word) add('fortis-common-states', 'warn', t.id, t.label, `has the state '${word}'`);
  }
};

const foundationDirect: RuleFn = ({ ds, analysis, add }) => {
  for (const u of ds.usage) {
    const i = analysis.info.get(u.token);
    const token = ds.tokens.get(u.token);
    if (i && token && i.tier === 'foundation' && i.kind === 'color') {
      add('foundation-direct', 'warn', u.token, u.component, `uses foundation token ${token.label}${u.prop ? ' (' + u.prop + ')' : ''}`);
    }
  }
};

// A component should use a role's solid background with its solid foreground, subtle with subtle.
const pairing: RuleFn = ({ ds, add }) => {
  const byComponent = new Map<string, UsageRecord[]>();
  for (const u of ds.usage) {
    const list = byComponent.get(u.component);
    if (list) list.push(u);
    else byComponent.set(u.component, [u]);
  }
  for (const [component, list] of byComponent) {
    const roles: Record<string, Set<string>> = Object.create(null) as Record<string, Set<string>>;
    for (const u of list) {
      const m = u.token.match(/^color-palette-([a-z0-9]+)-(solid|subtle)(-fg)?$/);
      if (m?.[1] !== undefined && m[2] !== undefined) (roles[m[1]] ??= new Set()).add(m[2] + (m[3] ?? ''));
    }
    for (const [role, set] of Object.entries(roles)) {
      if (set.has('solid') && set.has('subtle-fg')) add('pairing', 'warn', null, component, `${role}: solid background paired with subtle-fg`);
      if (set.has('subtle') && set.has('solid-fg')) add('pairing', 'warn', null, component, `${role}: subtle background paired with solid-fg`);
    }
  }
};

const missingPair: RuleFn = ({ ds, tokens, add }) => {
  for (const t of tokens) {
    const m = t.id.match(/^(color-palette-[a-z0-9]+)-(solid|subtle)$/);
    if (m && !ds.tokens.has(`${m[1]}-${m[2]}-fg`)) add('missing-pair', 'warn', t.id, t.label, `no ${m[2]}-fg partner defined`);
  }
};

export const FORTIS_RULES: Partial<Record<RuleId, RuleFn>> = {
  'fortis-palette': fortisPalette,
  'fortis-common': fortisCommon,
  'fortis-vocab': fortisVocab,
  'fortis-common-states': fortisCommonStates,
  'foundation-direct': foundationDirect,
  pairing,
  'missing-pair': missingPair,
};
