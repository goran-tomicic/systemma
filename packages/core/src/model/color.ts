// Parses the sRGB color forms that tokens commonly hold: hex (3, 4, 6, 8 digits), rgb()/rgba() with
// commas, spaces or a slash, and "transparent". Returns null for anything else (display-p3, oklch, named
// colors), so callers can skip colors they cannot do sRGB math on.
export function toRgba(input: string): [number, number, number, number] | null {
  const s = String(input).trim().toLowerCase();
  if (s === 'transparent') return [0, 0, 0, 0];

  const hexMatch = s.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch?.[1] !== undefined) {
    let h = hexMatch[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const channel = (i: number): number => parseInt(h.slice(i, i + 2), 16);
    return [channel(0), channel(2), channel(4), h.length === 8 ? +(channel(6) / 255).toFixed(3) : 1];
  }

  const fnMatch = s.match(/^rgba?\(([^)]+)\)$/);
  if (fnMatch?.[1] !== undefined) {
    const p = fnMatch[1].split(/[\s,/]+/).filter(Boolean);
    if (p.length < 3) return null;
    const channel = (x: string): number => (x.endsWith('%') ? parseFloat(x) * 2.55 : parseFloat(x));
    const rgb = [channel(p[0] ?? ''), channel(p[1] ?? ''), channel(p[2] ?? '')] as const;
    let a = 1;
    const alpha = p[3];
    if (alpha !== undefined) a = alpha.endsWith('%') ? parseFloat(alpha) / 100 : parseFloat(alpha);
    if (rgb.some(Number.isNaN) || Number.isNaN(a)) return null;
    return [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2]), a];
  }
  return null;
}

// Channels here are 0-1 floats, the shape Figma exports. Near-opaque colors become hex; others rgba().
export function unitRgbToHex(c: { r: number; g: number; b: number; a?: number }): string {
  const h = (x: number): string => Math.round(x * 255).toString(16).padStart(2, '0');
  if (c.a === undefined || c.a >= 0.999) return ('#' + h(c.r) + h(c.g) + h(c.b)).toUpperCase();
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${+c.a.toFixed(2)})`;
}
