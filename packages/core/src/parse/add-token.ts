import type { Dataset, Kind, Mode, Token, TokenValue } from '../model/types.js';
import { canon } from '../model/ids.js';

export interface AddTokenExtra {
  type?: Kind | '';
  source?: string;
  format?: Token['format'];
  declared?: boolean;
  description?: string;
  collection?: string;
  // The authored name as segments. Defaults to the label split on "/", without a leading "--".
  path?: string[];
}

const defaultPath = (label: string): string[] => label.replace(/^--/, '').split('/');

// Two different authored names can derive one id ("a/b-c" and "a-b/c"). Within one format that is two
// different tokens, and neither may overwrite the other. Across formats it is the same token described
// twice (a CSS --color-brand and a DTCG color.brand), which is meant to merge. The same name in two
// Figma collections is also two tokens.
function collides(t: Token, label: string, extra: AddTokenExtra): boolean {
  if (t.label !== label) return (t.format ?? '') === (extra.format ?? '');
  return !!extra.collection && !!t.collection && extra.collection !== t.collection;
}

// The warning a parser raises when addToken returned null, so every format words it the same way.
export function collisionWarning(ds: Dataset, label: string): string {
  const existing = ds.tokens.get(canon(label));
  return `'${label}' has the same id as '${existing?.label ?? label}' (${canon(label)}) and was not merged.`;
}

// Tokens are keyed by canonical id. A token that collides with an existing one is not added: it is recorded
// on the token that holds the id, and null is returned so the caller can warn and skip its extra fields.
export function addToken(ds: Dataset, label: string, mode: Mode, value: TokenValue, extra: AddTokenExtra = {}): Token | null {
  const id = canon(label);
  const path = extra.path ?? defaultPath(label);
  let t = ds.tokens.get(id);
  if (!t) {
    t = { id, label, path, modes: {}, type: extra.type || '', source: extra.source || '', collection: extra.collection || '' };
    ds.tokens.set(id, t);
  } else if (collides(t, label, extra)) {
    (t.collisions ??= []).push({ label, path, source: extra.source ?? '', mode, ...(extra.collection ? { collection: extra.collection } : {}) });
    if (t.label !== label && t.label.toLowerCase() === label.toLowerCase() && !(t.caseVariants ?? []).includes(label)) {
      (t.caseVariants ??= []).push(label);
    }
    return null;
  }
  t.modes[mode] = value;
  if (extra.format && !t.format) t.format = extra.format;
  if (extra.declared) t.declaredType = true;
  if (extra.type && !t.type) t.type = extra.type;
  if (extra.description) t.description = extra.description;
  if (extra.collection && !t.collection) t.collection = extra.collection;
  return t;
}
