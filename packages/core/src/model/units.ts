// rem and em are taken as 16px: there is no font size to resolve them against here, and 16px is the
// browser default, so the result is only used for comparing values, never reported as a computed size.
export function toPx(s: string): number | null {
  const m = String(s).trim().match(/^(-?\d*\.?\d+)(px|rem|em)$/);
  if (!m) return null;
  return m[2] === 'px' ? +m[1]! : +m[1]! * 16;
}

export function toMs(s: string): number | null {
  const m = String(s).trim().match(/^(-?\d*\.?\d+)(ms|s)$/);
  if (!m) return null;
  return m[2] === 'ms' ? +m[1]! : +m[1]! * 1000;
}
