import { toRgba } from '../model/color.js';
import type { Dataset, Mode } from '../model/types.js';
import { resolve } from '../resolve/resolve.js';
import type { Resolution } from '../resolve/resolve.js';

export interface DiffChange {
  id: string;
  mode: Mode;
  a: string;
  b: string;
}

export interface DiffResult {
  onlyA: string[];
  onlyB: string[];
  changed: DiffChange[];
}

const MODES: readonly Mode[] = ['light', 'dark'];
const MISSING = '—';

const squash = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

// Colors compare by channel so "#FFF" equals "rgb(255, 255, 255)" and rounding noise is tolerated;
// everything else compares as text with whitespace and case ignored.
export function sameValue(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const x = toRgba(a);
  const y = toRgba(b);
  if (x && y) return x.every((v, i) => Math.abs(v - y[i]!) < (i === 3 ? 0.01 : 1.01));
  return squash(a) === squash(b);
}

// A composite is compared as its resolved JSON, so a change to anything it references shows up.
function textOf(r: Resolution): string | undefined {
  if ('value' in r) return r.value;
  if ('composite' in r) return JSON.stringify(r.composite);
  return undefined;
}

// Compares by canonical id, using values after alias resolution, per mode.
export function diff(a: Dataset, b: Dataset): DiffResult {
  const onlyA: string[] = [];
  const onlyB: string[] = [];
  const changed: DiffChange[] = [];
  for (const id of a.tokens.keys()) {
    if (!b.tokens.has(id)) { onlyA.push(id); continue; }
    for (const mode of MODES) {
      const va = textOf(resolve(a, id, mode));
      const vb = textOf(resolve(b, id, mode));
      if (va === undefined && vb === undefined) continue;
      if (!sameValue(va, vb)) changed.push({ id, mode, a: va ?? MISSING, b: vb ?? MISSING });
    }
  }
  for (const id of b.tokens.keys()) if (!a.tokens.has(id)) onlyB.push(id);
  return { onlyA, onlyB, changed };
}
