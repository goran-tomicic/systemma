import type { CSSProperties } from 'react';
import { resolve, toMs, toPx } from '@systemma/core';
import type { Dataset, Mode, TokenInfo } from '@systemma/core';
import { LENGTH, cubicNumbers, isCssColor, isSafeCss, shadowString } from '../lib/values';

export type PreviewSize = 'sm' | 'md' | 'lg';

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');

function Curve({ n, size }: { n: [number, number, number, number]; size: number }) {
  const p = (x: number, y: number): string => `${(4 + 32 * x).toFixed(1)} ${(36 - 32 * y).toFixed(1)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M4 36H36" stroke="currentColor" opacity=".25" />
      <path d={`M4 36C${p(n[0], n[1])} ${p(n[2], n[3])} 36 4`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function typeStyle(c: Rec, cap: number): CSSProperties {
  const style: CSSProperties = {};
  const family = str(c['fontFamily']);
  if (family && isSafeCss(family)) style.fontFamily = family;
  const size = str(c['fontSize']);
  if (size && LENGTH.test(size)) style.fontSize = `${Math.min(toPx(size) ?? 16, cap)}px`;
  const weight = str(c['fontWeight']);
  if (weight && /^[\w-]{3,12}$/.test(weight)) style.fontWeight = weight;
  const line = str(c['lineHeight']);
  if (line && /^[\d.]+(px|%|em|rem)?$/.test(line)) style.lineHeight = line;
  const spacing = str(c['letterSpacing']);
  if (spacing && LENGTH.test(spacing)) style.letterSpacing = spacing;
  return style;
}

const Empty = ({ cell }: { cell?: string }) => <span className={cell} aria-hidden="true"><i className="sw none" /></span>;

// One picture for every kind of token: a swatch for a color, a bar for a space, a corner for a radius, a sample
// for type, and so on. It is decoration beside the value in words, so it is hidden from assistive technology.
export function Preview({ ds, id, mode, size, info }: { ds: Dataset; id: string; mode: Mode; size: PreviewSize; info: TokenInfo | undefined }) {
  const large = size === 'lg';
  const wide = size !== 'sm';
  const cell = `pvcell${wide ? ' w' : ''}${large ? ' lg' : ''}`;
  if (!info) return <Empty />;
  const r = resolve(ds, id, mode);
  const v = 'value' in r ? r.value : undefined;
  const c = 'composite' in r ? r.composite : undefined;
  if (v === undefined && c === undefined) return info.kind === 'color' ? <Empty /> : <Empty cell={cell} />;
  const cap = large ? 44 : wide ? 20 : 16;
  const full = large ? 200 : wide ? 52 : 20;
  const wrap = (child: React.ReactNode) => <span className={cell} aria-hidden="true">{child}</span>;

  switch (info.kind) {
    case 'color': {
      const swatch = v && isCssColor(v) ? <i className={`sw${large ? ' lg' : ''}`} style={{ '--c': v } as CSSProperties} /> : <i className="sw none" />;
      // In a list row every preview sits in the same cell, so the names beside them line up.
      return size === 'md' ? wrap(swatch) : <span aria-hidden="true">{swatch}</span>;
    }
    case 'dimension':
    case 'number': {
      const px = v === undefined ? null : toPx(v);
      if (info.category === 'typography') return wrap(px !== null ? <span className="pvt" style={{ fontSize: Math.min(px, cap) }}>Aa</span> : <span className="pvn">{v}</span>);
      if (px === null) return wrap(<span className="pvn">{v}</span>);
      if (info.category === 'radius') return wrap(<i className={`pvb${large ? ' lg' : ''}`} style={{ borderRadius: Math.min(px, large ? 28 : 11) }} />);
      if (info.category === 'border') return wrap(<i className="pvline" style={{ height: Math.max(1, Math.min(px, 8)) }} />);
      return wrap(<i className="pvbar" style={{ width: Math.max(2, Math.min(px, full)) }} />);
    }
    case 'fontFamily':
      return v && isSafeCss(v) ? wrap(<span className="pvt" style={{ fontFamily: v, fontSize: cap }}>Aa</span>) : <Empty cell={cell} />;
    case 'fontWeight':
      return v && /^[\w-]{3,12}$/.test(v) ? wrap(<span className="pvt" style={{ fontWeight: v, fontSize: cap }}>Aa</span>) : <Empty cell={cell} />;
    case 'typography':
      return isRec(c) ? wrap(<span className="pvt" style={typeStyle(c, cap)}>{large ? 'The quick brown fox' : 'Aa'}</span>) : <Empty cell={cell} />;
    case 'shadow': {
      const s = c !== undefined ? shadowString(c) : v ?? '';
      return s && isSafeCss(s) ? wrap(<i className={`pvb pvs${large ? ' lg' : ''}`} style={{ boxShadow: s }} />) : <Empty cell={cell} />;
    }
    case 'border': {
      if (!isRec(c)) return <Empty cell={cell} />;
      const s = [c['width'], c['style'], c['color']].map(str).filter(Boolean).join(' ');
      return isSafeCss(s) ? wrap(<i className={`pvb${large ? ' lg' : ''}`} style={{ border: s }} />) : <Empty cell={cell} />;
    }
    case 'strokeStyle':
      return v && /^(solid|dashed|dotted|double|groove|ridge|outset|inset)$/.test(v)
        ? wrap(<i className="pvline" style={{ height: 0, borderTop: `2px ${v} var(--ink2)` }} />)
        : <Empty cell={cell} />;
    case 'duration': {
      const ms = v === undefined ? null : toMs(v);
      return ms === null ? <Empty cell={cell} /> : wrap(<i className="pvbar mot" style={{ width: Math.max(2, Math.min(full, (ms / 1000) * full)) }} />);
    }
    case 'cubicBezier': {
      const n = cubicNumbers(v);
      return n ? wrap(<Curve n={n} size={large ? 64 : wide ? 36 : 22} />) : <Empty cell={cell} />;
    }
    case 'transition': {
      const n = isRec(c) ? cubicNumbers(c['timingFunction']) : null;
      return n ? wrap(<Curve n={n} size={large ? 64 : wide ? 36 : 22} />) : <Empty cell={cell} />;
    }
    default:
      return <Empty cell={cell} />;
  }
}
