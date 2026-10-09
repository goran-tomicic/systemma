import { resolve } from '../resolve/resolve.js';
import type { RuleFn } from './context.js';
import type { RuleId } from './types.js';

// CSS custom properties follow CSS naming, so the DTCG name rule would only produce noise there.
const dtcgName: RuleFn = ({ tokens, add }) => {
  for (const t of tokens) {
    if (t.format === 'css') continue;
    const severity = t.format === 'dtcg' ? 'error' : 'warn';
    for (const seg of t.label.replace(/^--/, '').split('/')) {
      if (seg.startsWith('$')) add('dtcg-name', severity, t.id, t.label, `'${seg}' starts with $`);
      else if (/[{}.]/.test(seg)) add('dtcg-name', severity, t.id, t.label, `'${seg}' contains a { } or . character`);
    }
  }
};

const dtcgCase: RuleFn = ({ tokens, add }) => {
  for (const t of tokens) for (const v of t.caseVariants ?? []) add('dtcg-case', 'warn', t.id, t.label, `also defined as '${v}'`);
};

const dtcgUntyped: RuleFn = ({ tokens, add }) => {
  for (const t of tokens) {
    if (t.format !== 'dtcg' || t.declaredType) continue;
    // An alias takes the type of its target, so it needs none of its own.
    if (Object.values(t.modes).every((v) => 'ref' in v && v.ref)) continue;
    add('dtcg-untyped', 'warn', t.id, t.label, 'no $type on the token or a parent group');
  }
};

const COMPOSITE_KEYS: Record<string, readonly string[]> = {
  typography: ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight'],
  shadow: ['color', 'offsetX', 'offsetY', 'blur', 'spread'],
  border: ['color', 'width', 'style'],
  transition: ['duration', 'delay', 'timingFunction'],
};

const dtcgComposite: RuleFn = ({ tokens, analysis, add }) => {
  for (const t of tokens) {
    const kind = analysis.info.get(t.id)?.kind;
    const need = kind ? COMPOSITE_KEYS[kind] : undefined;
    if (!need) continue;
    for (const value of Object.values(t.modes)) {
      if (!('comp' in value) || value.comp === undefined) continue;
      const c = value.comp;
      (Array.isArray(c) ? c : [c]).forEach((o: unknown, k) => {
        if (!o || typeof o !== 'object') return;
        const missing = need.filter((key) => !(key in o));
        if (missing.length) add('dtcg-composite', 'error', t.id, t.label, `${Array.isArray(c) ? `layer ${k + 1} ` : ''}missing ${missing.join(', ')}`);
      });
    }
  }
};

// The format's named weights. It treats names as case-sensitive; this check lowercases first, as the
// original did, so "Bold" passes here although the format would reject it.
const WEIGHT_NAMES = new Set([
  'thin', 'hairline', 'extra-light', 'ultra-light', 'light', 'normal', 'regular', 'book', 'medium', 'semi-bold', 'demi-bold',
  'bold', 'extra-bold', 'ultra-bold', 'black', 'heavy', 'extra-black', 'ultra-black',
]);

// Checked in the light mode only, which is where the original looked.
const dtcgUnits: RuleFn = ({ ds, tokens, analysis, add }) => {
  for (const t of tokens) {
    const r = resolve(ds, t.id, 'light');
    if (!('value' in r)) continue;
    const v = String(r.value).trim();
    const kind = analysis.info.get(t.id)?.kind;
    // Dimensions and durations from CSS or Figma are only a hint; DTCG files are held to the format.
    const severity = t.format === 'dtcg' ? 'warn' : 'info';
    if (kind === 'dimension') {
      const m = v.match(/^-?[\d.]+([a-z%]+)$/i);
      if (m?.[1] !== undefined && !['px', 'rem'].includes(m[1])) add('dtcg-units', severity, t.id, t.label, `unit '${m[1]}' isn't representable (px and rem only)`);
    } else if (kind === 'duration') {
      const m = v.match(/^-?[\d.]+([a-z]+)$/i);
      if (m?.[1] !== undefined && !['ms', 's'].includes(m[1])) add('dtcg-units', severity, t.id, t.label, `unit '${m[1]}' isn't representable (ms and s only)`);
    } else if (kind === 'cubicBezier') {
      const m = v.match(/^cubic-bezier\(([^)]+)\)$/);
      if (m?.[1] !== undefined) {
        const n = m[1].split(',').map(Number);
        if (n.length === 4 && (n[0]! < 0 || n[0]! > 1 || n[2]! < 0 || n[2]! > 1)) add('dtcg-units', 'warn', t.id, t.label, 'x coordinates must be within 0–1');
      }
    } else if (kind === 'fontWeight') {
      const n = Number(v);
      if (!(n >= 1 && n <= 1000) && !WEIGHT_NAMES.has(v.toLowerCase())) add('dtcg-units', 'warn', t.id, t.label, `'${v}' is not a weight (1–1000 or a named weight)`);
    }
  }
};

// A fontWeight is a number or a name, and a number token is a fair target for one, so the pair is not a mismatch.
const COMPATIBLE: ReadonlySet<string> = new Set(['fontWeight|number', 'number|fontWeight']);

const aliasTypeMismatch: RuleFn = ({ ds, tokens, analysis, label, add }) => {
  for (const t of tokens) {
    if (t.format !== 'dtcg' || !t.declaredType || !t.type) continue;
    const seen = new Set<string>();
    for (const [mode, value] of Object.entries(t.modes)) {
      if (!('ref' in value) || !value.ref || seen.has(value.ref)) continue;
      seen.add(value.ref);
      // A target that is missing is broken-ref's to report. One whose type was only guessed from its value is not
      // trusted enough to call a mismatch.
      const target = ds.tokens.get(value.ref)?.declaredType ? analysis.info.get(value.ref)?.kind : undefined;
      if (!target || target === t.type || COMPATIBLE.has(`${t.type}|${target}`)) continue;
      add('alias-type-mismatch', 'warn', t.id, t.label, `${mode}: declares $type ${t.type} but refers to ${label(value.ref)}, which is ${target}`);
    }
  }
};

const deprecatedNoReason: RuleFn = ({ tokens, add }) => {
  for (const t of tokens) if (t.deprecated === true) add('deprecated-no-reason', 'info', t.id, t.label, 'is deprecated, with no explanation of why or what to use instead');
};

export const DTCG_RULES: Partial<Record<RuleId, RuleFn>> = {
  'dtcg-name': dtcgName,
  'dtcg-case': dtcgCase,
  'dtcg-untyped': dtcgUntyped,
  'dtcg-composite': dtcgComposite,
  'dtcg-units': dtcgUnits,
  'alias-type-mismatch': aliasTypeMismatch,
  'deprecated-no-reason': deprecatedNoReason,
};
