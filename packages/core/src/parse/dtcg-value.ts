import { toRgba, unitRgbToHex } from '../model/color.js';
import { parseValue } from '../model/value.js';
import type { Kind, TokenValue } from '../model/types.js';

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => !!x && typeof x === 'object' && !Array.isArray(x);

const COMPOSITE = new Set<Kind | ''>(['typography', 'shadow', 'border', 'transition', 'gradient', 'strokeStyle']);

// DTCG, Tokens Studio and legacy type names, lowercased, to the canonical kind.
const TYPE_MAP: Readonly<Record<string, Kind>> = {
  color: 'color', dimension: 'dimension', spacing: 'dimension', sizing: 'dimension', borderradius: 'dimension',
  borderwidth: 'dimension', fontsizes: 'dimension', letterspacing: 'dimension', paragraphspacing: 'dimension',
  paragraphindent: 'dimension', lineheights: 'number', number: 'number', opacity: 'number',
  fontfamilies: 'fontFamily', fontfamily: 'fontFamily', fontweights: 'fontWeight', fontweight: 'fontWeight',
  boxshadow: 'shadow', shadow: 'shadow', typography: 'typography', border: 'border', transition: 'transition',
  strokestyle: 'strokeStyle', gradient: 'gradient', duration: 'duration', cubicbezier: 'cubicBezier',
  string: 'string', text: 'string',
};

// Unknown type names leave the kind empty so it is inferred from the value later.
export function kindOfType(type: unknown): Kind | '' {
  if (!type) return '';
  const key = String(type).toLowerCase();
  return Object.hasOwn(TYPE_MAP, key) ? (TYPE_MAP[key] ?? '') : '';
}

// Tokens Studio stores bare numbers for these keys; they only make sense as pixels.
const PX_KEYS = new Set(['fontSize', 'letterSpacing', 'offsetX', 'offsetY', 'blur', 'spread', 'width', 'x', 'y', 'paragraphSpacing']);

const isColorObj = (o: unknown): o is Rec => isRec(o) && ('colorSpace' in o || 'components' in o);
const isDimObj = (o: unknown): o is Rec => isRec(o) && 'value' in o && 'unit' in o && Object.keys(o).length <= 3;

function colorObjToString(c: Rec): string {
  const comps = Array.isArray(c['components']) ? (c['components'] as unknown[]) : [];
  const space = typeof c['colorSpace'] === 'string' && c['colorSpace'] ? c['colorSpace'] : 'srgb';
  const a = typeof c['alpha'] === 'number' ? c['alpha'] : 1;
  const hex = c['hex'];
  if (typeof hex === 'string' && /^#[0-9a-f]{3,8}$/i.test(hex)) {
    if (a >= 0.999) return hex.toUpperCase();
    const x = toRgba(hex);
    if (x) return `rgba(${x[0]}, ${x[1]}, ${x[2]}, ${+a.toFixed(3)})`;
  }
  if (space === 'srgb' && comps.length >= 3 && comps.every((n) => typeof n === 'number')) {
    return unitRgbToHex({ r: comps[0] as number, g: comps[1] as number, b: comps[2] as number, a });
  }
  const nums = comps.map((n) => (n === null || n === 'none' ? 'none' : n));
  const alpha = a < 0.999 ? ` / ${a}` : '';
  if (space === 'hsl' || space === 'hwb') return `${space}(${nums[0]} ${nums[1]}% ${nums[2]}%${alpha})`;
  if (['oklch', 'oklab', 'lab', 'lch'].includes(space)) return `${space}(${nums.join(' ')}${alpha})`;
  return `color(${space} ${nums.join(' ')}${alpha})`;
}

// A JSON pointer such as "#/color/white/$value" becomes the alias "{color.white}".
const pointerToRef = (p: unknown): string =>
  '{' + String(p).replace(/^#\//, '').replace(/\/\$value.*$/, '').split('/').join('.') + '}';

// Only names that need quoting are quoted; aliases and already-quoted names pass through.
const quoteFont = (n: unknown): string =>
  typeof n !== 'string' || /^\{/.test(n) || /^["']/.test(n) || /^[\w-]+$/.test(n) ? String(n) : `"${n}"`;

const allNumbers = (x: unknown[]): x is number[] => x.every((n) => typeof n === 'number');

// Normalizes every leaf inside a composite value. `assumePx` is on for composites, where a bare
// number under a PX_KEY is a pixel length.
function deepNorm(x: unknown, key: string, assumePx: boolean): unknown {
  if (x === null || x === undefined) return '';
  if (typeof x === 'number') return assumePx && PX_KEYS.has(key) ? x + 'px' : String(x);
  if (typeof x === 'string') return assumePx && PX_KEYS.has(key) && /^-?\d*\.?\d+$/.test(x.trim()) ? x.trim() + 'px' : x;
  if (typeof x === 'boolean') return x;
  if (Array.isArray(x)) {
    if (key === 'timingFunction' && x.length === 4 && allNumbers(x)) return `cubic-bezier(${x.join(', ')})`;
    if (key === 'fontFamily') return x.map(quoteFont).join(', ');
    if (key === 'dashArray') return x.map((v) => deepNorm(v, 'width', assumePx));
    return x.map((v) => deepNorm(v, key, assumePx));
  }
  if (isRec(x)) {
    if (isColorObj(x)) return colorObjToString(x);
    if (isDimObj(x)) return `${String(x['value'])}${String(x['unit'])}`;
    if ('$ref' in x) return pointerToRef(x['$ref']);
    const o: Rec = {};
    for (const k of Object.keys(x)) if (!k.startsWith('$')) o[k] = deepNorm(x[k], k, assumePx);
    return o;
  }
  return String(x);
}

// Returns null when the value is an object or array that has to stay composite.
function normLeaf(v: unknown, kind: Kind | ''): string | null {
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    const s = v.trim();
    return kind === 'dimension' && /^-?\d*\.?\d+$/.test(s) ? s + 'px' : s;
  }
  if (Array.isArray(v)) {
    if (v.length === 4 && allNumbers(v) && (kind === 'cubicBezier' || !kind)) return `cubic-bezier(${v.join(', ')})`;
    if (kind === 'fontFamily' || (!kind && v.every((x) => typeof x === 'string'))) return v.map(quoteFont).join(', ');
    return null;
  }
  if (isRec(v)) {
    if (isColorObj(v)) return colorObjToString(v);
    if (isDimObj(v)) return `${String(v['value'])}${String(v['unit'])}`;
    if ('$ref' in v) return pointerToRef(v['$ref']);
    return null;
  }
  return String(v);
}

// Tokens Studio boxShadow {x, y, ...} becomes the DTCG-style keys.
function fromStudioShadow(o: unknown): unknown {
  if (Array.isArray(o)) return o.map(fromStudioShadow);
  if (!isRec(o) || (!('x' in o) && !('y' in o))) return o;
  return { offsetX: o['x'], offsetY: o['y'], blur: o['blur'], spread: o['spread'], color: o['color'], inset: o['type'] === 'innerShadow' || o['inset'] === true };
}

export function inferCompositeKind(c: unknown): Kind | '' {
  const first = Array.isArray(c) ? (c[0] ?? {}) : (c ?? {});
  const keys = Object.keys(typeof first === 'object' ? (first as object) : {});
  if (keys.includes('fontSize') || keys.includes('fontFamily')) return 'typography';
  if (keys.includes('offsetX') || keys.includes('blur')) return 'shadow';
  if (keys.includes('duration') || keys.includes('timingFunction')) return 'transition';
  if (keys.includes('width') && keys.includes('style')) return 'border';
  return '';
}

const hasObjectItem = (v: unknown): boolean => Array.isArray(v) && v.some((x) => x && typeof x === 'object');

export function toValue(val: unknown, typeName: unknown): { kind: Kind | ''; v: TokenValue } {
  const kind = kindOfType(typeName);
  const pre = kind === 'shadow' ? fromStudioShadow(val) : val;
  const plainObj = isRec(val) && !isColorObj(val) && !isDimObj(val) && !('$ref' in val);
  if (COMPOSITE.has(kind) && (plainObj || hasObjectItem(val))) return { kind, v: { comp: deepNorm(pre, '', true) } };
  if (hasObjectItem(val)) {
    const c = deepNorm(fromStudioShadow(val), '', true);
    return { kind: kind || inferCompositeKind(c), v: { comp: c } };
  }
  const n = normLeaf(val, kind);
  if (n === null) {
    const c = deepNorm(val, '', true);
    return { kind: kind || inferCompositeKind(c), v: { comp: c } };
  }
  return { kind, v: parseValue(n) };
}
