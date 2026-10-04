import { canon } from '../model/ids.js';
import { refId } from '../model/value.js';
import type { Dataset, Mode } from '../model/types.js';

export type ResolveError = 'missing' | 'nomode' | 'cycle';

// `chain` is the path of token ids followed, starting at the requested token.
export type Resolution =
  | { value: string; chain: string[] }
  | { composite: unknown; chain: string[] }
  | { error: ResolveError; chain: string[] };

// Nesting deeper than this is treated as a loop. Real token graphs are far shallower, and it bounds
// the recursion that composite refs and embedded var() can start.
const MAX_DEPTH = 8;

function resolveComposite(ds: Dataset, c: unknown, mode: Mode, depth: number): unknown {
  if (depth > MAX_DEPTH) return c;
  if (typeof c === 'string') {
    const m = c.match(/^\{([^}]+)\}$/);
    if (m?.[1] === undefined) return c;
    const r = resolve(ds, refId(m[1]), mode, depth + 1);
    if ('value' in r) return r.value;
    if ('composite' in r) return r.composite;
    return c;
  }
  if (Array.isArray(c)) return c.map((x) => resolveComposite(ds, x, mode, depth + 1));
  if (c && typeof c === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(c)) out[k] = resolveComposite(ds, (c as Record<string, unknown>)[k], mode, depth + 1);
    return out;
  }
  return c;
}

export function resolve(ds: Dataset, id: string, mode: Mode, depth = 0): Resolution {
  const chain = [id];
  if (depth > MAX_DEPTH) return { error: 'cycle', chain };
  let token = ds.tokens.get(id);
  if (!token) return { error: 'missing', chain };
  let hop = 0;
  for (;;) {
    let v = token.modes[mode];
    // Primitives are usually mode-less, so once we are past the first token a missing mode falls back to light.
    if (v === undefined && hop > 0) v = token.modes.light;
    if (v === undefined) return { error: 'nomode', chain };
    if ('comp' in v && v.comp !== undefined) return { composite: resolveComposite(ds, v.comp, mode, depth), chain };
    if ('lit' in v && v.lit !== undefined) {
      let lit = v.lit;
      if (/var\(\s*--/.test(lit)) {
        // A var() that cannot be resolved falls back to its own fallback, or stays as written.
        lit = lit.replace(/var\(\s*--([\w-]+)\s*(?:,\s*([^)]*))?\)/g, (whole, name: string, fallback: string | undefined) => {
          const r = resolve(ds, canon(name), mode, depth + 1);
          if ('value' in r) return r.value;
          return fallback !== undefined ? fallback.trim() : whole;
        });
      }
      return { value: lit, chain };
    }
    if (!('ref' in v)) return { error: 'nomode', chain };
    if (chain.includes(v.ref)) return { error: 'cycle', chain: chain.concat(v.ref) };
    chain.push(v.ref);
    const next = ds.tokens.get(v.ref);
    if (!next) return { error: 'missing', chain };
    token = next;
    hop++;
  }
}
