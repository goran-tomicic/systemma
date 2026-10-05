import { toTokenId } from '../model/value.js';
import type { Dataset } from '../model/types.js';
import { textPairs } from './helpers.js';
import type { ContrastPair } from './types.js';

export type ContrastLevel = 'AA' | 'AAA';

export interface CheckedPair {
  foreground: string;
  background: string;
  level: ContrastLevel;
  largeText: boolean;
  // Declared pairs say what they need in their messages; inferred ones keep the original wording.
  declared: boolean;
}

// WCAG 2.2 SC 1.4.3 (AA) and 1.4.6 (AAA): text needs 4.5:1 and 7:1, large text 3:1 and 4.5:1.
export function requiredRatio(level: ContrastLevel, largeText: boolean): number {
  if (level === 'AAA') return largeText ? 4.5 : 7;
  return largeText ? 3 : 4.5;
}

// Declared pairs replace inference entirely: someone who lists pairs has said which ones matter.
export function pairsToCheck(ds: Dataset, declared: readonly ContrastPair[] | undefined): { pairs: CheckedPair[]; undefinedTokens: [ContrastPair, string][] } {
  if (!declared) {
    return {
      pairs: textPairs(ds).map(([foreground, background]) => ({ foreground, background, level: 'AA', largeText: false, declared: false })),
      undefinedTokens: [],
    };
  }
  const pairs: CheckedPair[] = [];
  const undefinedTokens: [ContrastPair, string][] = [];
  for (const p of declared) {
    const foreground = toTokenId(p.foreground);
    const background = toTokenId(p.background);
    const missing = [foreground, background].find((id) => !ds.tokens.has(id));
    if (missing !== undefined) { undefinedTokens.push([p, missing]); continue; }
    pairs.push({ foreground, background, level: p.level ?? 'AA', largeText: p.largeText ?? false, declared: true });
  }
  return { pairs, undefinedTokens };
}
