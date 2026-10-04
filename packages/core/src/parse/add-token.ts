import type { Dataset, Kind, Mode, Token, TokenValue } from '../model/types.js';
import { canon } from '../model/ids.js';

export interface AddTokenExtra {
  type?: Kind | '';
  source?: string;
  format?: Token['format'];
  declared?: boolean;
  description?: string;
  collection?: string;
}

// Tokens are keyed by canonical id, so a second label for the same id merges into the first token
// and is recorded as a case variant when the labels differ only by case.
export function addToken(ds: Dataset, label: string, mode: Mode, value: TokenValue, extra: AddTokenExtra = {}): Token {
  const id = canon(label);
  let t = ds.tokens.get(id);
  if (!t) {
    t = { id, label, modes: {}, type: extra.type || '', source: extra.source || '', collection: extra.collection || '' };
    ds.tokens.set(id, t);
  } else if (t.label !== label && t.label.toLowerCase() === label.toLowerCase() && !(t.caseVariants ?? []).includes(label)) {
    (t.caseVariants ??= []).push(label);
  }
  t.modes[mode] = value;
  if (extra.format && !t.format) t.format = extra.format;
  if (extra.declared) t.declaredType = true;
  if (extra.type && !t.type) t.type = extra.type;
  if (extra.description) t.description = extra.description;
  if (extra.collection && !t.collection) t.collection = extra.collection;
  return t;
}
