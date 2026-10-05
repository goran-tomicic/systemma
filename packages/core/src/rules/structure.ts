import type { Token } from '../model/types.js';
import type { RuleFn } from './context.js';
import { HUES, STATE_ALL, STATE_LIST, STATE_WORDS, TSHIRT, segmentsOf } from './helpers.js';
import type { RuleId } from './types.js';

// Only slash labels can say "this modifier is a path segment", so hyphen-only names are not compared.
const mixedSeparator: RuleFn = ({ tokens, add }) => {
  const paths = new Set(tokens.filter((t) => t.label.includes('/')).map((t) => t.label.toLowerCase()));
  for (const t of tokens) {
    if (!t.label.includes('/')) continue;
    const segs = t.label.split('/');
    const last = segs[segs.length - 1] ?? '';
    const m = last.match(/^(.+)-(fg|hover|hovered|active|pressed|disabled|focus|selected)$/i);
    if (!m) continue;
    const stem = segs.slice(0, -1).concat(m[1] ?? '').join('/').toLowerCase();
    const sibling = [...paths].find((p) => p.startsWith(stem + '/') && STATE_ALL.has(p.slice(stem.length + 1)));
    if (sibling) add('mixed-separator', 'warn', t.id, t.label, `fuses '${m[2]}' into the name, while a sibling uses '${sibling.split('/').slice(-2).join('/')}'`);
  }
};

// A state is expected last; a trailing "fg" is the one modifier allowed after it.
const statePosition: RuleFn = ({ tokens, add }) => {
  for (const t of tokens) {
    const words = t.id.split('-');
    let idx = -1;
    words.forEach((w, k) => { if (STATE_ALL.has(w)) idx = k; });
    if (idx >= 0 && words.slice(idx + 1).some((w) => w !== 'fg')) {
      add('state-position', 'info', t.id, t.label, `state '${words[idx]}' is followed by '${words.slice(idx + 1).join('-')}'`);
    }
  }
};

const stateVocab: RuleFn = ({ tokens, add }) => {
  // concept -> spelling -> tokens using it. A token that repeats a word is counted once per use.
  const used: Record<string, Record<string, Token[]>> = Object.create(null) as Record<string, Record<string, Token[]>>;
  for (const t of tokens) {
    for (const w of t.id.split('-')) {
      for (const [concept, forms] of Object.entries(STATE_WORDS)) {
        if (!forms.includes(w)) continue;
        const spellings = (used[concept] ??= Object.create(null) as Record<string, Token[]>);
        (spellings[w] ??= []).push(t);
      }
    }
  }
  for (const spellings of Object.values(used)) {
    const order = (w: string): number => STATE_LIST.indexOf(w);
    // The most used spelling is the standard; ties go to the spelling listed first.
    const entries = Object.entries(spellings).sort((a, b) => b[1].length - a[1].length || order(a[0]) - order(b[0]));
    if (entries.length < 2) continue;
    const [winner, rest] = [entries[0]!, entries.slice(1)];
    const n = winner[1].length;
    for (const [form, toks] of rest) {
      for (const t of toks) add('state-vocab', 'warn', t.id, t.label, `uses '${form}'; '${winner[0]}' is used by ${n} token${n === 1 ? '' : 's'}`);
    }
  }
};

const hueInSemantic: RuleFn = ({ tokens, analysis, add }) => {
  for (const t of tokens) {
    const i = analysis.info.get(t.id);
    if (!i || i.category !== 'color' || i.tier === 'foundation') continue;
    const hue = t.id.split('-').find((w) => HUES.has(w));
    if (hue) add('hue-in-semantic', 'warn', t.id, t.label, `names the hue '${hue}'`);
  }
};

// Roles are palette namespaces (color-palette-<role>-...). A variant most roles define, and one role
// lacks, is probably an omission. Needs three roles to have a majority at all.
const siblingGap: RuleFn = ({ tokens, add }) => {
  const roles: Record<string, Set<string>> = Object.create(null) as Record<string, Set<string>>;
  for (const t of tokens) {
    const m = t.id.match(/^color-palette-([a-z0-9]+)-(.+)$/);
    if (m?.[1] !== undefined && m[2] !== undefined) (roles[m[1]] ??= new Set()).add(m[2]);
  }
  const names = Object.keys(roles);
  if (names.length < 3) return;
  const count: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const r of names) for (const tail of roles[r]!) count[tail] = (count[tail] ?? 0) + 1;
  for (const r of names) {
    for (const tail of Object.keys(count)) {
      if (count[tail]! >= Math.ceil(names.length / 2) && !roles[r]!.has(tail)) {
        add('sibling-gap', 'warn', null, `palette/${r}`, `missing '${tail}' (defined for ${count[tail]} of ${names.length} roles)`);
      }
    }
  }
};

const sizeStyle: RuleFn = ({ tokens, analysis, add }) => {
  const groups = new Map<string, [Token, string][]>();
  for (const t of tokens) {
    const i = analysis.info.get(t.id);
    if (!i || i.tier !== 'foundation' || i.category === 'color') continue;
    if (!Object.values(t.modes).every((v) => 'lit' in v && v.lit !== undefined)) continue;
    const segs = segmentsOf(t);
    const key = segs.slice(0, -1).join('/');
    const list = groups.get(key);
    const entry: [Token, string] = [t, segs[segs.length - 1] ?? ''];
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }
  for (const [key, items] of groups) {
    if (items.length < 3) continue;
    const numeric = items.filter(([, l]) => /^\d+$/.test(l));
    const tshirt = items.filter(([, l]) => TSHIRT.test(l));
    if (!numeric.length || !tshirt.length) continue;
    const minority = numeric.length < tshirt.length ? numeric : tshirt;
    const isNumeric = minority === numeric;
    for (const [t] of minority) {
      add('size-style', 'warn', t.id, t.label, `${isNumeric ? 'numeric' : 't-shirt'} step in a group that mostly uses ${isNumeric ? 't-shirt sizes' : 'numbers'} (${key})`);
    }
  }
};

export const STRUCTURE_RULES: Partial<Record<RuleId, RuleFn>> = {
  'mixed-separator': mixedSeparator,
  'state-position': statePosition,
  'state-vocab': stateVocab,
  'hue-in-semantic': hueInSemantic,
  'sibling-gap': siblingGap,
  'size-style': sizeStyle,
};
