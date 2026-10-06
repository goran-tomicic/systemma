// A small glob matcher, enough for token names and file paths: `*` matches within one path segment, `**`
// across segments, `?` one character other than "/". As in other globs, `**/` also matches no directory at
// all, so `tokens/**/*.json` matches `tokens/a.json` as well as `tokens/x/a.json`. Matching ignores case, since ids are lowercased and labels are not.
// Written here instead of pulled in as a dependency: core has none, and this is a dozen lines.
export function compileGlob(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i] ?? '';
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          source += '(?:.*/)?';
          i += 2;
        } else {
          source += '.*';
          i++;
        }
      } else source += '[^/]*';
    } else if (c === '?') source += '[^/]';
    else source += c.replace(/[.+^${}()|[\]\\/]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'i');
}

export const matchesAny = (patterns: readonly RegExp[], ...candidates: string[]): boolean =>
  patterns.some((p) => candidates.some((c) => p.test(c)));
