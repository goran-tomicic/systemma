import type { RuleFn } from './context.js';
import { pairsToCheck, requiredRatio } from './contrast-pairs.js';
import { MODES, pairRatio, roleOfToken } from './helpers.js';
import type { RuleId } from './types.js';

const SURFACE = 'color-surface-base';

// Text needs 4.5:1 (3:1 for large text). Below 3:1 is an error because even large text would fail. A
// declared pair at level AAA must reach the AAA ratio instead.
const contrast: RuleFn = ({ ds, options, add, label }) => {
  const { pairs, undefinedTokens } = pairsToCheck(ds, options.contrastPairs);
  for (const [pair, missing] of undefinedTokens) {
    add('contrast', 'warn', null, `${pair.foreground} on ${pair.background}`, `declared pair names ${missing}, which isn't defined`);
  }
  for (const { foreground, background, level, largeText, declared } of pairs) {
    const needed = requiredRatio(level, largeText);
    for (const mode of MODES) {
      const r = pairRatio(ds, foreground, background, mode);
      if (r === null || r >= needed) continue;
      const base = `on ${label(background)} · ${r.toFixed(2)}:1 (${mode})`;
      add('contrast', r < 3 ? 'error' : 'warn', foreground, label(foreground), declared ? `${base}, needs ${needed}:1` : base);
    }
  }
};

// Reports pairs that pass AA but not AAA. A declared AAA pair is already held to AAA by `contrast`.
const contrastAaa: RuleFn = ({ ds, options, add, label }) => {
  for (const { foreground, background, level, largeText, declared } of pairsToCheck(ds, options.contrastPairs).pairs) {
    if (level === 'AAA') continue;
    const aa = requiredRatio('AA', largeText);
    const aaa = requiredRatio('AAA', largeText);
    for (const mode of MODES) {
      const r = pairRatio(ds, foreground, background, mode);
      if (r !== null && r >= aa && r < aaa) {
        const base = `on ${label(background)} · ${r.toFixed(2)}:1 (${mode})`;
        add('contrast-aaa', 'info', foreground, label(foreground), declared ? `${base}, AAA needs ${aaa}:1` : base);
      }
    }
  }
};

// Borders are only checked against the base surface, and only reported as info: a decorative divider
// may legitimately be low contrast, while the border of a control must reach 3:1.
const contrastNonText: RuleFn = ({ ds, tokens, add, label }) => {
  if (!ds.tokens.has(SURFACE)) return;
  for (const t of tokens) {
    if (roleOfToken(t.id) !== 'border') continue;
    for (const mode of MODES) {
      const r = pairRatio(ds, t.id, SURFACE, mode);
      if (r !== null && r < 3) add('contrast-nontext', 'info', t.id, t.label, `${r.toFixed(2)}:1 against ${label(SURFACE)} (${mode})`);
    }
  }
};

// Looks at usage: a color used in a property whose name says "focus" is a focus indicator.
const contrastFocus: RuleFn = ({ ds, analysis, add, label }) => {
  if (!ds.tokens.has(SURFACE)) return;
  const seen = new Set<string>();
  for (const u of ds.usage) {
    if (!/focus/i.test(u.prop || '') || !ds.tokens.has(u.token) || analysis.info.get(u.token)?.kind !== 'color') continue;
    for (const mode of MODES) {
      const r = pairRatio(ds, u.token, SURFACE, mode);
      const key = u.component + u.token + mode;
      if (r !== null && r < 3 && !seen.has(key)) {
        seen.add(key);
        add('contrast-focus', 'warn', u.token, u.component, `focus indicator ${label(u.token)} is ${r.toFixed(2)}:1 against ${label(SURFACE)} (${mode})`);
      }
    }
  }
};

export const WCAG_RULES: Partial<Record<RuleId, RuleFn>> = {
  contrast,
  'contrast-aaa': contrastAaa,
  'contrast-nontext': contrastNonText,
  'contrast-focus': contrastFocus,
};
