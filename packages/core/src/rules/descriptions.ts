import type { Token } from '../model/types.js';
import type { RuleFn } from './context.js';
import { roleOfProp, roleOfToken } from './helpers.js';
import type { RuleId } from './types.js';

const ROLE_NAME = { bg: 'background', fg: 'text/icon', border: 'border' } as const;

// Words that say where a color goes. A description without one explains what the color is, not how to use it.
const INTENT_WORDS = /(background|text|icon|border|divider|fill|stroke|outline|overlay|backdrop|surface|container|card|panel|button|input|label|link|badge|banner|alert|toast|tooltip|modal|dialog|drawer|ring|shadow|dimming|cta)/i;

// Foundation tokens are raw values, so only semantic tokens are expected to explain themselves.
const descMissing: RuleFn = ({ tokens, analysis, add }) => {
  for (const t of tokens) {
    const i = analysis.info.get(t.id);
    if (i && i.tier !== 'foundation' && !t.description) add('desc-missing', 'info', t.id, t.label, 'no description');
  }
};

const descIntent: RuleFn = ({ tokens, analysis, add }) => {
  for (const t of tokens) {
    if (t.description && analysis.info.get(t.id)?.category === 'color' && !INTENT_WORDS.test(t.description)) {
      add('desc-intent', 'info', t.id, t.label, `“${t.description}” doesn't name where it's used`);
    }
  }
};

interface ScopeRule { need: readonly string[]; avoid: readonly string[] }

const COLOR_SCOPES: Record<'bg' | 'fg' | 'border', ScopeRule> = {
  bg: { need: ['FRAME_FILL', 'SHAPE_FILL'], avoid: ['TEXT_FILL', 'STROKE_COLOR'] },
  fg: { need: ['TEXT_FILL', 'SHAPE_FILL'], avoid: ['FRAME_FILL', 'STROKE_COLOR'] },
  border: { need: ['STROKE_COLOR'], avoid: ['TEXT_FILL', 'FRAME_FILL'] },
};

// Figma scopes decide which pickers offer a variable. Only tokens that came with scopes (Figma) are checked.
const scopeRole: RuleFn = ({ tokens, analysis, add }) => {
  for (const t of tokens) {
    if (!Array.isArray(t.scopes)) continue;
    const i = analysis.info.get(t.id);
    const scopes = t.scopes;
    if (!i || i.tier === 'foundation') continue;
    let rule: ScopeRule | undefined;
    let label = '';
    if (i.category === 'color') {
      const role = roleOfToken(t.id);
      if (role) { rule = COLOR_SCOPES[role]; label = ROLE_NAME[role]; }
    } else if (i.category === 'spacing') { rule = { need: ['GAP', 'WIDTH_HEIGHT'], avoid: [] }; label = 'spacing'; }
    else if (i.category === 'radius') { rule = { need: ['CORNER_RADIUS'], avoid: [] }; label = 'radius'; }
    else if (i.kind === 'fontFamily') { rule = { need: ['FONT_FAMILY'], avoid: [] }; label = 'font family'; }
    else if (i.kind === 'fontWeight') { rule = { need: ['FONT_WEIGHT'], avoid: [] }; label = 'font weight'; }
    if (!rule) continue;
    if (scopes.includes('ALL_SCOPES') || (i.category === 'color' && scopes.includes('ALL_FILLS'))) {
      add('scope-role', 'info', t.id, t.label, `scoped to ${scopes.includes('ALL_SCOPES') ? 'ALL_SCOPES' : 'ALL_FILLS'}, so it is offered in every picker`);
      continue;
    }
    if (!rule.need.some((n) => scopes.includes(n))) {
      add('scope-role', 'warn', t.id, t.label, `looks like a ${label} token but isn't offered in ${rule.need.join(' or ')} pickers (scopes: ${scopes.join(', ') || 'none'})`);
    }
    const bad = rule.avoid.filter((a) => scopes.includes(a));
    if (bad.length) add('scope-role', 'warn', t.id, t.label, `a ${label} token that is also offered in ${bad.join(', ')} pickers`);
  }
};

const usageRole: RuleFn = ({ ds, analysis, add }) => {
  for (const u of ds.usage) {
    const token: Token | undefined = ds.tokens.get(u.token);
    if (analysis.info.get(u.token)?.kind !== 'color' || !token) continue;
    const propRole = roleOfProp(u.prop);
    const tokenRole = roleOfToken(u.token);
    if (propRole && tokenRole && propRole !== tokenRole) {
      add('usage-role', 'warn', u.token, u.component, `${token.label} is a ${ROLE_NAME[tokenRole]} token, used as ${ROLE_NAME[propRole]} via '${u.prop}'`);
    }
  }
};

export const DESCRIPTION_RULES: Partial<Record<RuleId, RuleFn>> = {
  'desc-missing': descMissing,
  'desc-intent': descIntent,
  'scope-role': scopeRole,
  'usage-role': usageRole,
};
