import { refsOf } from '../model/value.js';
import type { Dataset, Mode, Tier, Token, TokenInfo } from '../model/types.js';
import { inferCompositeKind } from '../parse/dtcg-value.js';
import { categoryOf, inferKind, isKind } from './kinds.js';
import { chooseProfile } from './profile.js';
import type { Profile } from './profile.js';
import { resolve } from './resolve.js';
import type { Resolution } from './resolve.js';

const MODES: readonly Mode[] = ['light', 'dark'];

// The first mode that resolves to something. Used to infer a kind when none was declared.
function firstResolved(ds: Dataset, t: Token): Resolution | undefined {
  for (const m of MODES) {
    if (!t.modes[m]) continue;
    const r = resolve(ds, t.id, m);
    if ('value' in r || 'composite' in r) return r;
  }
  return undefined;
}

function tierOfCollection(collection: string): Tier | undefined {
  if (/foundation|primitive|core/i.test(collection)) return 'foundation';
  if (/palette/i.test(collection)) return 'palette';
  if (/common|semantic/i.test(collection)) return 'common';
  return undefined;
}

// The profile defaults to the one that fits the dataset; see chooseProfile().
export function classify(t: Token, ds: Dataset, profile: Profile = chooseProfile(ds)): TokenInfo {
  const id = t.id;
  let kind = isKind(t.type) ? t.type : undefined;
  if (!kind) {
    const r = firstResolved(ds, t);
    if (r && 'composite' in r) kind = inferCompositeKind(r.composite) || 'string';
    else if (r && 'value' in r) kind = inferKind(r.value, id);
    else kind = 'string';
  }
  const category = categoryOf(kind, id);

  // A token whose every mode is a plain literal is a raw value (foundation); anything that aliases
  // another token is semantic (common).
  const isRaw = Object.values(t.modes).every((v) => 'lit' in v && v.lit !== undefined && !refsOf(v).length);
  const tier = profile.tierOfId(id) ?? tierOfCollection(t.collection ?? '') ?? (isRaw ? 'foundation' : 'common');

  const group = category === 'color' ? profile.groupOfColor(tier, id.split('-')) : category;
  return { tier, group: group || 'other', kind, category };
}
