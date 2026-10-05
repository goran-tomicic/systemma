import type { Dataset, Mode } from '../model/types.js';
import { addToken, collisionWarning } from './add-token.js';
import { toValue } from './dtcg-value.js';
import type { ParseResult } from './types.js';

export interface JsonOptions {
  mode: Mode;
  // Tokens Studio nests tokens under set names; drop the top-level set key from every path.
  stripSet?: boolean;
  source?: string;
}

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => !!x && typeof x === 'object' && !Array.isArray(x);
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

type Visit = (path: string[], value: unknown, type: unknown, node: Rec) => void;

// A node is a token when it has $value, or a legacy `value` that is either not an object or is
// accompanied by a `type` (Tokens Studio composites are objects).
function walk(node: unknown, path: string[], visit: Visit, inheritedType?: unknown): void {
  if (!isRec(node)) return;
  const isToken = has(node, '$value') || (has(node, 'value') && (typeof node['value'] !== 'object' || has(node, 'type')));
  const type = node['$type'] || (isToken ? node['type'] : undefined) || inheritedType;
  if (isToken) visit(path, has(node, '$value') ? node['$value'] : node['value'], type, node);
  for (const k of Object.keys(node)) {
    if (k === '$root') { walk(node[k], path, visit, type); continue; }
    if (k.startsWith('$')) continue;
    if (isToken && (k === 'value' || k === 'type' || k === 'description')) continue;
    // A DEFAULT child is the group's own value, so it shares the group's path.
    walk(node[k], k === 'DEFAULT' ? path : path.concat(k), visit, type);
  }
}

export function parseTokensJson(ds: Dataset, json: unknown, opts: JsonOptions): ParseResult {
  const warnings: string[] = [];
  let count = 0;
  if (!isRec(json)) return { count, warnings: ['Expected a JSON object at the top level.'] };

  const visit: Visit = (path, val, type, node) => {
    if (!path.length || val === undefined) return;
    const { kind, v } = toValue(val, type);
    const d = node['$description'] || node['description'];
    const label = path.join('/');
    const t = addToken(ds, label, opts.mode, v, {
      type: kind, source: opts.source ?? '', format: 'dtcg', declared: !!kind, description: typeof d === 'string' ? d : '', path: [...path],
    });
    if (!t) { warnings.push(collisionWarning(ds, label)); return; }
    if (node['$deprecated']) t.deprecated = node['$deprecated'] as boolean | string;
    count++;
  };

  if (opts.stripSet) {
    for (const k of Object.keys(json)) {
      const set = json[k];
      if (k.startsWith('$') || set === null || typeof set !== 'object') continue;
      walk(set, [], visit);
    }
  } else walk(json, [], visit);
  return { count, warnings };
}
