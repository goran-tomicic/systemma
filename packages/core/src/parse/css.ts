import { canon } from '../model/ids.js';
import { parseValue } from '../model/value.js';
import type { Dataset } from '../model/types.js';
import { addToken, collisionWarning } from './add-token.js';
import type { ParseResult } from './types.js';

const DARK_AT_RULE = /prefers-color-scheme\s*:\s*dark/;
const DARK_SELECTOR = /data-(theme|mode|color-mode)\s*=\s*["']?dark|\.dark\b|\.theme-dark|\.dark-mode/;

// Walks rule blocks, recursing into at-rules. A block is dark when it, or an enclosing at-rule,
// targets dark mode. Selectors are matched loosely on purpose: real stylesheets name dark mode many ways.
function parseBlocks(ds: Dataset, text: string, inDark: boolean, source: string, warnings: string[]): number {
  let i = 0;
  let n = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const selector = text.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
      j++;
    }
    const body = text.slice(open + 1, j - 1);
    i = j;
    if (selector.startsWith('@')) {
      n += parseBlocks(ds, body, inDark || DARK_AT_RULE.test(selector), source, warnings);
      continue;
    }
    const dark = inDark || DARK_SELECTOR.test(selector);
    const decl = /--([\w-]+)\s*:\s*([^;]+);?/g;
    let m: RegExpExecArray | null;
    while ((m = decl.exec(body))) {
      const label = '--' + (m[1] ?? '');
      const t = addToken(ds, label, dark ? 'dark' : 'light', parseValue((m[2] ?? '').trim()), { source, format: 'css', path: [m[1] ?? ''] });
      if (t) n++;
      else warnings.push(collisionWarning(ds, label));
    }
  }
  return n;
}

// Descriptions come from a trailing same-line comment, or a leading comment directly above that reads
// like a sentence. Short comments are section headers and are ignored.
function readDescriptions(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /(?:\/\*([\s\S]*?)\*\/[ \t]*\n[ \t]*)?--([\w-]+)\s*:[^;{}]+;[ \t]*(?:\/\*([\s\S]*?)\*\/)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lead = (m[1] ?? '').replace(/\s*\n\s*\*?\s*/g, ' ').trim();
    const trail = (m[3] ?? '').trim();
    const d = trail || (lead.length > 25 && /\s/.test(lead) ? lead : '');
    if (d) out.set(canon(m[2] ?? ''), d);
  }
  return out;
}

export function parseCss(ds: Dataset, text: string, source?: string): ParseResult {
  const descriptions = readDescriptions(text);
  const warnings: string[] = [];
  const count = parseBlocks(ds, text.replace(/\/\*[\s\S]*?\*\//g, ''), false, source || 'CSS', warnings);
  for (const [id, d] of descriptions) {
    const t = ds.tokens.get(id);
    if (t && !t.description) t.description = d;
  }
  return { count, warnings };
}
