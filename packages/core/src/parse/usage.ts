import { toTokenId } from '../model/value.js';
import type { Dataset } from '../model/types.js';
import type { ParseResult } from './types.js';

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => !!x && typeof x === 'object' && !Array.isArray(x);

// Accepts an array of records, each `{ component | name | file, token | tokens, prop?, file? }`, where
// `tokens` is a list of strings, a list of `{ token, prop }`, or an object of prop to token.
export function parseUsage(ds: Dataset, json: unknown): ParseResult {
  if (!Array.isArray(json)) return { count: 0, warnings: ['Expected a JSON array of usage records.'] };
  let count = 0;
  for (const r of json) {
    if (!isRec(r)) continue;
    const comp = r['component'] || r['name'] || r['file'];
    if (!comp) continue;
    const file = r['file'] ? String(r['file']) : '';
    const list: [string, unknown][] = [];
    if (r['token']) list.push([r['prop'] ? String(r['prop']) : '', r['token']]);
    const tokens = r['tokens'];
    if (Array.isArray(tokens)) {
      for (const x of tokens) {
        if (typeof x === 'string') list.push(['', x]);
        else if (isRec(x) && x['token']) list.push([x['prop'] ? String(x['prop']) : '', x['token']]);
      }
    } else if (isRec(tokens)) {
      for (const [prop, x] of Object.entries(tokens)) list.push([prop, x]);
    }
    for (const [prop, token] of list) {
      ds.usage.push({ component: String(comp), file, prop, token: toTokenId(token) });
      count++;
    }
  }
  return { count, warnings: [] };
}
