import type { RuleFn } from './context.js';
import { MODES, pairRatio, roleOfToken, textPairs } from './helpers.js';
import type { RuleId } from './types.js';

const SURFACE = 'color-surface-base';

// Text needs 4.5:1. Below 3:1 is an error because even large text would fail.
const contrast: RuleFn = ({ ds, add, label }) => {
  for (const [fg, bg] of textPairs(ds)) {
    for (const mode of MODES) {
      const r = pairRatio(ds, fg, bg, mode);
      if (r !== null && r < 4.5) add('contrast', r < 3 ? 'error' : 'warn', fg, label(fg), `on ${label(bg)} · ${r.toFixed(2)}:1 (${mode})`);
    }
  }
};

const contrastAaa: RuleFn = ({ ds, add, label }) => {
  for (const [fg, bg] of textPairs(ds)) {
    for (const mode of MODES) {
      const r = pairRatio(ds, fg, bg, mode);
      if (r !== null && r >= 4.5 && r < 7) add('contrast-aaa', 'info', fg, label(fg), `on ${label(bg)} · ${r.toFixed(2)}:1 (${mode})`);
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
