import { toRgba } from '../model/color.js';
import type { Category, Kind } from '../model/types.js';

// Typed as a Record so adding a Kind without listing it here fails to compile.
const KIND_SET: Record<Kind, true> = {
  color: true, dimension: true, fontFamily: true, fontWeight: true, duration: true, cubicBezier: true,
  number: true, typography: true, shadow: true, border: true, transition: true, strokeStyle: true, gradient: true, string: true,
};

export const isKind = (x: unknown): x is Kind => typeof x === 'string' && Object.hasOwn(KIND_SET, x);

const isColorString = (s: string): boolean =>
  !!toRgba(s) || /^(hsla?|hwb|oklch|oklab|lab|lch|color|color-mix)\(/i.test(s);

// CSS and Figma carry no explicit types, so the kind comes from the value's shape. Order matters:
// a duration like "150ms" must be tried before the bare-number rule, and a color before a shadow.
// `name` is the token id, used only for the two kinds a value alone cannot tell apart.
export function inferKind(value: string, name: string): Kind {
  const s = String(value).trim();
  if (isColorString(s)) return 'color';
  if (/^(cubic-bezier|steps|linear)\(|^ease(-in|-out|-in-out)?$/.test(s)) return 'cubicBezier';
  if (/^-?[\d.]+(ms|s)$/.test(s)) return 'duration';
  if (/^-?[\d.]+(px|rem|em|vw|vh|vmin|vmax|ch|%|pt)$/.test(s) || (/^calc\(/.test(s) && /(px|rem|em|%)/.test(s))) return 'dimension';
  if (/^(inset\s+)?(-?[\d.]+(?:px|rem|em)?\s+){2,4}\S/.test(s) && /(rgba?\(|hsla?\(|#[0-9a-f]{3,8}|oklch\()/i.test(s)) return 'shadow';
  if (/weight/.test(name) && /^(\d{3,4}|thin|light|normal|regular|medium|semi-?bold|bold|extra-?bold|black)$/i.test(s)) return 'fontWeight';
  if (/font|family/.test(name) && (/,/.test(s) || /^["']/.test(s) || /sans|serif|mono/i.test(s))) return 'fontFamily';
  if (/^-?[\d.]+$/.test(s)) return 'number';
  return 'string';
}

// Dimensions and numbers are the only kinds that say nothing about purpose, so the id decides.
export function categoryOf(kind: Kind, id: string): Category {
  if (kind === 'color' || kind === 'gradient') return 'color';
  if (kind === 'typography' || kind === 'fontFamily' || kind === 'fontWeight') return 'typography';
  if (kind === 'shadow') return 'shadow';
  if (kind === 'duration' || kind === 'cubicBezier' || kind === 'transition') return 'motion';
  if (kind === 'border' || kind === 'strokeStyle') return 'border';
  if (kind === 'dimension' || kind === 'number') {
    if (/font|text|type|line-?height|leading|letter|tracking|paragraph/.test(id)) return 'typography';
    if (/radius|radii|round|corner/.test(id)) return 'radius';
    if (/border|stroke|outline|ring/.test(id)) return 'border';
    if (/duration|delay|timing/.test(id)) return 'motion';
    if (/shadow|elevation|blur|spread/.test(id)) return 'shadow';
    return kind === 'dimension' ? 'spacing' : 'other';
  }
  return 'other';
}
