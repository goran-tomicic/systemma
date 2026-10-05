// A small glob matcher, enough for token names: `*` matches within one path segment, `**` across segments,
// `?` one character other than "/". Matching ignores case, since ids are lowercased and labels are not.
// Written here instead of pulled in as a dependency: core has none, and this is a dozen lines.
export function compileGlob(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i] ?? '';
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        source += '.*';
        i++;
      } else source += '[^/]*';
    } else if (c === '?') source += '[^/]';
    else source += c.replace(/[.+^${}()|[\]\\/]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'i');
}

export const matchesAny = (patterns: readonly RegExp[], ...candidates: string[]): boolean =>
  patterns.some((p) => candidates.some((c) => p.test(c)));
