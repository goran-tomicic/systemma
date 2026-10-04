import { describe, expect, it } from 'vitest';
import { createDataset, parseCss } from '../src/index.js';
import type { Dataset } from '../src/index.js';
import { fixturePath, readFixture, serializeDataset, toGolden } from './helpers/golden.js';

const parse = (css: string, source?: string): { ds: Dataset; count: number } => {
  const ds = createDataset('t');
  const { count } = parseCss(ds, css, source);
  return { ds, count };
};

describe('fixtures', () => {
  it('css-modes matches its golden file', async () => {
    const { ds, count } = parse(readFixture('css-modes', 'input.css'), 'tokens.css');
    await expect(toGolden({ count, ...(serializeDataset(ds) as object) })).toMatchFileSnapshot(fixturePath('css-modes', 'expected.json'));
  });
});

describe('declarations', () => {
  it('reads custom properties as css tokens labeled with their dashes', () => {
    const { ds, count } = parse(':root { --Color-A: #fff; --b: 4px }', 'a.css');
    expect(count).toBe(2);
    expect(ds.tokens.get('color-a')).toMatchObject({
      id: 'color-a', label: '--Color-A', format: 'css', source: 'a.css', type: '', modes: { light: { lit: '#fff' } },
    });
    expect(ds.tokens.get('b')?.modes.light).toEqual({ lit: '4px' });
  });

  it('defaults the source to CSS', () => {
    expect(parse(':root{--a:1}').ds.tokens.get('a')?.source).toBe('CSS');
  });

  it('ignores ordinary properties', () => {
    const { ds, count } = parse('.a { color: red; --x: 1; margin: 0 }');
    expect(count).toBe(1);
    expect([...ds.tokens.keys()]).toEqual(['x']);
  });

  it('turns a single var() into an alias and keeps embedded var() as a literal', () => {
    const { ds } = parse(':root { --a: var(--b); --c: var(--b, 1px); --d: 0 0 var(--b); }');
    expect(ds.tokens.get('a')?.modes.light).toEqual({ ref: 'b' });
    expect(ds.tokens.get('c')?.modes.light).toEqual({ ref: 'b' });
    expect(ds.tokens.get('d')?.modes.light).toEqual({ lit: '0 0 var(--b)' });
  });

  it('handles a declaration without a trailing semicolon', () => {
    expect(parse(':root{--a:1}').ds.tokens.get('a')?.modes.light).toEqual({ lit: '1' });
  });

  it('returns nothing for text without blocks', () => {
    expect(parse('').count).toBe(0);
    expect(parse('--a: 1;').count).toBe(0);
  });

  it('lets a later declaration win within a mode', () => {
    expect(parse(':root{--a:1} :root{--a:2}').ds.tokens.get('a')?.modes.light).toEqual({ lit: '2' });
  });
});

describe('dark mode detection', () => {
  const darkOf = (css: string): boolean => {
    const t = parse(css).ds.tokens.get('a');
    return t?.modes.dark !== undefined && t.modes.light === undefined;
  };

  it.each([
    '[data-theme="dark"]{--a:1}',
    '[data-theme=dark]{--a:1}',
    "[data-theme='dark']{--a:1}",
    ':root[data-mode="dark"]{--a:1}',
    '[data-color-mode=dark]{--a:1}',
    '.dark{--a:1}',
    '.dark .card{--a:1}',
    '.theme-dark{--a:1}',
    '.dark-mode{--a:1}',
    '@media (prefers-color-scheme: dark){:root{--a:1}}',
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--a:1}}',
    '@media screen{@media (prefers-color-scheme: dark){:root{--a:1}}}',
  ])('treats %j as dark', (css) => {
    expect(darkOf(css)).toBe(true);
  });

  it.each([
    ':root{--a:1}',
    '[data-theme="light"]{--a:1}',
    '@media (min-width: 40em){:root{--a:1}}',
    '@media (prefers-color-scheme: light){:root{--a:1}}',
    '.darkroom{--a:1}',
  ])('treats %j as light', (css) => {
    expect(darkOf(css)).toBe(false);
    expect(parse(css).ds.tokens.get('a')?.modes.light).toEqual({ lit: '1' });
  });

  it('keeps both modes on one token', () => {
    const t = parse(':root{--a:1} .dark{--a:2}').ds.tokens.get('a');
    expect(t?.modes).toEqual({ light: { lit: '1' }, dark: { lit: '2' } });
  });
});

describe('descriptions', () => {
  const descOf = (css: string): string | undefined => parse(css).ds.tokens.get('a')?.description;

  it('reads a trailing same-line comment', () => {
    expect(descOf(':root {\n  --a: 1; /* Darkest neutral */\n}')).toBe('Darkest neutral');
  });

  it('reads a long leading comment directly above', () => {
    expect(descOf(':root {\n  /* Page background behind every surface. */\n  --a: 1;\n}')).toBe('Page background behind every surface.');
  });

  it('joins a multi-line leading comment', () => {
    expect(descOf(':root {\n  /* First line of a long description\n     and the second line */\n  --a: 1;\n}')).toBe('First line of a long description and the second line');
  });

  it('ignores short leading comments, which are section headers', () => {
    expect(descOf(':root {\n  /* Colors */\n  --a: 1;\n}')).toBeUndefined();
  });

  it('ignores a long leading comment with no whitespace', () => {
    expect(descOf(`:root {\n  /* ${'x'.repeat(30)} */\n  --a: 1;\n}`)).toBeUndefined();
  });

  it('prefers the trailing comment over the leading one', () => {
    expect(descOf(':root {\n  /* A long leading comment about this token */\n  --a: 1; /* Short trailing */\n}')).toBe('Short trailing');
  });

  // A token has one description, shared by both modes; the last declaration that has one wins.
  it('lets the last description win when a token is declared in several blocks', () => {
    const { ds } = parse(':root { --a: 1; /* Light value */ }\n.dark { --a: 2; /* Dark value */ }');
    expect(ds.tokens.get('a')?.description).toBe('Dark value');
  });

  it('does not let comments hide or invent declarations', () => {
    const { ds, count } = parse(':root { /* --hidden: 1; */ --a: 1; }');
    expect(count).toBe(1);
    expect(ds.tokens.has('hidden')).toBe(false);
  });
});
