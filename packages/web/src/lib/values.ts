import { resolve, toRgba } from '@systemma/core';
import type { Dataset, Kind, Mode, ResolveError } from '@systemma/core';

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');

// Token values reach the page as inline styles. Only values made of ordinary CSS characters are applied, so
// a value cannot smuggle in anything (a url(), a semicolon that starts another declaration).
export const isSafeCss = (s: string): boolean => /^[\w\s.,#()%/+\-"']*$/.test(s);

// Whether the browser can paint this as a color. Unresolved var() is not a color yet.
export function isCssColor(v: string): boolean {
  if (/var\(/.test(v)) return false;
  if (toRgba(v)) return true;
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('color', v);
}

export const LENGTH = /^-?\d*\.?\d+(px|rem|em|%)$/;

export function cubicNumbers(s: unknown): [number, number, number, number] | null {
  const m = String(s ?? '').match(/^cubic-bezier\(([^)]+)\)$/);
  if (!m?.[1]) return null;
  const n = m[1].split(',').map(Number);
  return n.length === 4 && n.every((x) => !Number.isNaN(x)) ? (n as [number, number, number, number]) : null;
}

export function shadowLayers(c: unknown): Rec[] {
  return (Array.isArray(c) ? c : [c]).flat(2).filter(isRec);
}

const shadowCss = (o: Rec): string =>
  `${o['inset'] === true || o['inset'] === 'true' ? 'inset ' : ''}${str(o['offsetX']) || '0px'} ${str(o['offsetY']) || '0px'} ${str(o['blur']) || '0px'} ${str(o['spread']) || '0px'} ${str(o['color']) || 'transparent'}`;

export const shadowString = (c: unknown): string => shadowLayers(c).map(shadowCss).join(', ');

// A composite in a few words, for a list row.
export function summarizeComposite(kind: Kind | '', c: unknown): string {
  if (isRec(c)) {
    if (kind === 'typography') {
      const family = str(c['fontFamily']).split(',')[0]?.replace(/["']/g, '') ?? '';
      const size = (str(c['fontSize']) || '?') + (c['lineHeight'] !== undefined ? '/' + str(c['lineHeight']) : '');
      return [family, str(c['fontWeight']), size].filter(Boolean).join(' ');
    }
    if (kind === 'border') return [c['width'], c['style'], c['color']].map(str).filter(Boolean).join(' ');
    if (kind === 'transition') return [c['duration'], c['timingFunction']].map(str).filter(Boolean).join(' ');
  }
  if (kind === 'shadow') {
    const layers = shadowLayers(c);
    return (layers[0] ? shadowCss(layers[0]) : '') + (layers.length > 1 ? ` +${layers.length - 1}` : '');
  }
  return JSON.stringify(c).slice(0, 80);
}

export interface Shown {
  text: string;
  // How to read `text`: a value, a summarized composite, or why there is none.
  kind: 'value' | 'composite' | 'missing';
  error?: ResolveError;
}

// What a token comes to in a mode, as text.
export function displayValue(ds: Dataset, id: string, mode: Mode, kind: Kind | ''): Shown {
  const r = resolve(ds, id, mode);
  if ('value' in r) return { text: r.value, kind: 'value' };
  if ('composite' in r) return { text: summarizeComposite(kind, r.composite), kind: 'composite' };
  return { text: r.error === 'nomode' ? `no ${mode} value` : r.error, kind: 'missing', error: r.error };
}

// Every leaf of a composite with the path to it, so two composites can be laid side by side.
export function flatten(value: unknown, path = ''): [string, unknown][] {
  if (value === null || typeof value !== 'object') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((x, i) => flatten(x, `${path}[${i}]`));
  return Object.entries(value).flatMap(([k, v]) => flatten(v, path ? `${path}.${k}` : k));
}

// An alias written inside a composite as "{a.b}" is a reference to a token. Returns its canonical id.
export function aliasIn(value: unknown): string | null {
  const m = typeof value === 'string' ? value.match(/^\{([^}]+)\}$/) : null;
  return m?.[1] ? m[1].replace(/\.(DEFAULT|\$root)$/i, '').trim().replace(/^--/, '').replace(/[/.\s]+/g, '-').toLowerCase() : null;
}
