import { canon } from './ids.js';
import type { TokenValue } from './types.js';

// DTCG lets a group carry its own value under DEFAULT or $root, so an alias to either means the group path.
const GROUP_VALUE_SUFFIX = /\.(DEFAULT|\$root)$/i;
const BRACE_REF = /\{([^}]+)\}/g;
const VAR_REF = /var\(\s*--([\w-]+)/g;

export const refId = (path: string): string => canon(path.replace(GROUP_VALUE_SUFFIX, ''));

export function parseValue(v: unknown): TokenValue {
  if (typeof v !== 'string') return { lit: String(v) };
  const s = v.trim();
  let m = s.match(/^\{([^}]+)\}$/);
  if (m?.[1] !== undefined) return { ref: refId(m[1]) };
  // A var() with a fallback still counts as an alias; the fallback is only used when resolving.
  m = s.match(/^var\(\s*--([\w-]+)\s*(?:,[^)]*)?\)$/);
  if (m?.[1] !== undefined) return { ref: canon(m[1]) };
  return { lit: s };
}

function walkStrings(x: unknown, fn: (s: string) => void): void {
  if (typeof x === 'string') fn(x);
  else if (Array.isArray(x)) x.forEach((y) => walkStrings(y, fn));
  else if (x && typeof x === 'object') Object.values(x).forEach((y) => walkStrings(y, fn));
}

// Every token id a value depends on: its alias, refs inside composites, and embedded var().
export function refsOf(v: TokenValue | null | undefined): string[] {
  if (!v) return [];
  if ('ref' in v) return v.ref ? [v.ref] : [];
  const out = new Set<string>();
  const scan = (s: string): void => {
    for (const m of s.matchAll(BRACE_REF)) if (m[1] !== undefined) out.add(refId(m[1]));
    for (const m of s.matchAll(VAR_REF)) if (m[1] !== undefined) out.add(canon(m[1]));
  };
  if ('lit' in v) scan(String(v.lit));
  if ('comp' in v) walkStrings(v.comp, scan);
  return [...out];
}
