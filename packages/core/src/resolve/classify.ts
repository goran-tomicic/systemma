import { refsOf } from '../model/value.js';
import type { Dataset, Mode, Tier, Token, TokenInfo } from '../model/types.js';
import { inferCompositeKind } from '../parse/dtcg-value.js';
import { categoryOf, inferKind, isKind } from './kinds.js';
import { resolve } from './resolve.js';
import type { Resolution } from './resolve.js';

// Tier and group depend on how a team names its tokens. A profile carries those naming rules; the
// collection-name and literal-versus-alias fallbacks are shared by every profile.
export interface Profile {
  id: string;
  // Decide a tier from the id alone. Return undefined to fall through to collection names and values.
  tierOfId(id: string): Tier | undefined;
  // Name the group within a tier, from the id segments. Empty or undefined becomes 'other'.
  groupOfColor(tier: Tier, segments: string[]): string | undefined;
}

export const FORTIS_PROFILE: Profile = {
  id: 'fortis',
  tierOfId(id) {
    if (/^color-(white|black|transparent)$/.test(id) || /^color-[a-z]+-\d+$/.test(id)) return 'foundation';
    if (id.startsWith('color-palette-')) return 'palette';
    if (/^color-(surface|fg|border|bg)-/.test(id)) return 'common';
    return undefined;
  },
  groupOfColor(tier, seg) {
    if (tier === 'foundation') return seg.length > 2 ? seg[1] : 'utility';
    if (tier === 'palette') return seg[0] === 'color' && seg[1] === 'palette' ? seg[2] : seg[1] || seg[0];
    return seg.length > 1 ? seg[1] : seg[0];
  },
};

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

export function classify(t: Token, ds: Dataset, profile: Profile = FORTIS_PROFILE): TokenInfo {
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
