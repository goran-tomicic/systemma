import type { RuleFn } from './context.js';
import type { RuleId } from './types.js';

const TYPE_ROLES = /(display|headline|title|body|label)/;

const m3TypeRole: RuleFn = ({ tokens, analysis, add }) => {
  for (const t of tokens) {
    if (analysis.info.get(t.id)?.kind === 'typography' && !TYPE_ROLES.test(t.id)) {
      add('m3-type-role', 'info', t.id, t.label, 'no display, headline, title, body or label in the name');
    }
  }
};

const m3MotionNames: RuleFn = ({ tokens, analysis, add }) => {
  for (const t of tokens) {
    const kind = analysis.info.get(t.id)?.kind;
    if (kind === 'duration' && !/(short|medium|long)\d?/.test(t.id)) add('m3-motion-names', 'info', t.id, t.label, 'not a short/medium/long step');
    if (kind === 'cubicBezier' && !/(standard|emphasized|accelerate|decelerate|linear)/.test(t.id)) add('m3-motion-names', 'info', t.id, t.label, 'not a standard/emphasized easing name');
  }
};

export const M3_RULES: Partial<Record<RuleId, RuleFn>> = {
  'm3-type-role': m3TypeRole,
  'm3-motion-names': m3MotionNames,
};
