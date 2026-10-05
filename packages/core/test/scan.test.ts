import { describe, expect, it } from 'vitest';
import { componentNameFromPath, createDataset, scanCandidates, scanUsage } from '../src/index.js';
import type { FileLike } from '../src/index.js';
import { fixturePath, readRepo, toGolden } from './helpers/golden.js';

const file = (path: string, text: string, size = text.length): FileLike => ({ path, size, text: () => Promise.resolve(text) });
const decls = (n: number): string => ':root {' + Array.from({ length: n }, (_, i) => ` --a${i}: ${i};`).join('') + ' }';
const paths = (c: Awaited<ReturnType<typeof scanCandidates>>): string[] => c.candidates.map((x) => x.path);

describe('repo-scan fixture', () => {
  it('matches its golden file', async () => {
    const scan = await scanCandidates(readRepo('repo-scan'));
    const ds = createDataset('repo');
    const summary = await scanUsage(scan, new Set(scan.candidates.filter((c) => c.checked).map((c) => c.path)), ds);
    await expect(toGolden({
      candidates: scan.candidates.map(({ path, kind, count, checked }) => ({ path, kind, count, checked })),
      declared: [...scan.declared].sort(),
      summary,
      tokens: [...ds.tokens.keys()],
      usage: ds.usage,
    })).toMatchFileSnapshot(fixturePath('repo-scan', 'expected.json'));
  });
});

describe('scanCandidates scope', () => {
  it.each([
    'node_modules/x/a.css', 'a/node_modules/x.css', '.git/a.css', 'dist/a.css', 'build/a.css', '.next/a.css', 'out/a.css',
    'coverage/a.css', '.turbo/a.css', '.cache/a.css', 'storybook-static/a.css', 'vendor/a.css', '.svelte-kit/a.css', '.nuxt/a.css',
    'a.min.css', 'types.d.ts', 'package-lock.json', 'yarn.lock', 'a-lock.css',
  ])('skips %s', async (path) => {
    expect((await scanCandidates([file(path, decls(10))])).usable).toEqual([]);
  });

  it('keeps names that merely contain a skipped word', async () => {
    const scan = await scanCandidates([file('src/outline/a.css', decls(10)), file('src/rebuild.css', decls(10)), file('src/distance.css', decls(10))]);
    expect(paths(scan).sort()).toEqual(['src/distance.css', 'src/outline/a.css', 'src/rebuild.css']);
  });

  it('skips files at or over 1.5 MB', async () => {
    const scan = await scanCandidates([file('a.css', decls(10), 1_499_999), file('b.css', decls(10), 1_500_000)]);
    expect(paths(scan)).toEqual(['a.css']);
    expect(scan.total).toBe(2);
  });
});

describe('scanCandidates style files', () => {
  it('counts custom properties, ignoring comments, and records them as declared ids', async () => {
    const scan = await scanCandidates([file('a.css', '/* --hidden: 1 */ :root { --Color-A: 1; --b: 2 }\n.x { margin: 0; --c:3 }')]);
    expect(scan.candidates[0]).toMatchObject({ path: 'a.css', kind: 'css', count: 3 });
    expect([...scan.declared].sort()).toEqual(['b', 'c', 'color-a']);
  });

  it('pre-checks 8 or more properties, or 3 or more when the path says tokens', async () => {
    const scan = await scanCandidates([
      file('plain.css', decls(8)), file('plain7.css', decls(7)), file('src/theme.css', decls(3)), file('src/theme2.css', decls(2)),
      file('src/Colors.scss', decls(3)), file('x/global.less', decls(3)),
    ]);
    const checked = Object.fromEntries(scan.candidates.map((c) => [c.path, c.checked]));
    expect(checked).toEqual({ 'plain.css': true, 'plain7.css': false, 'src/theme.css': true, 'src/theme2.css': false, 'src/Colors.scss': true, 'x/global.less': true });
  });

  it('ignores style files without custom properties', async () => {
    expect((await scanCandidates([file('a.css', '.a { color: red }')])).candidates).toEqual([]);
  });

  it('sorts by count, keeping file order for ties', async () => {
    const scan = await scanCandidates([file('b.css', decls(3)), file('a.css', decls(3)), file('c.css', decls(9))]);
    expect(paths(scan)).toEqual(['c.css', 'b.css', 'a.css']);
  });

  it('only treats .css, .scss and .less as style files', async () => {
    expect((await scanCandidates([file('a.sass', decls(9)), file('a.styl', decls(9)), file('a.txt', decls(9))])).candidates).toEqual([]);
  });
});

describe('scanCandidates json files', () => {
  const tokens = (n: number): string => JSON.stringify(Object.fromEntries(Array.from({ length: n }, (_, i) => [`t${i}`, { $type: 'color', $value: '#abc' }])));

  it('adds a DTCG file with five or more tokens whose path suggests tokens', async () => {
    const scan = await scanCandidates([file('tokens/design-tokens.json', tokens(5))]);
    expect(scan.candidates[0]).toMatchObject({ kind: 'json', count: 5, checked: true });
  });

  it('skips small files, wrong paths, other formats and invalid JSON', async () => {
    const scan = await scanCandidates([
      file('tokens/small.json', tokens(4)), file('data/other.json', tokens(9)), file('tokens/array.json', '[1,2,3]'),
      file('tokens/bad.json', '{nope'), file('tokens/figma.json', '{"meta":{"variables":{"a":{}}}}'),
    ]);
    expect(scan.candidates).toEqual([]);
  });

  it.each(['theme', 'colors', 'colour', 'design', 'variables', 'palette', 'brand', 'TOKEN'])('accepts the path hint %s', async (hint) => {
    expect(paths(await scanCandidates([file(`x/${hint}.json`, tokens(5))]))).toHaveLength(1);
  });
});

describe('scanCandidates reading', () => {
  it('reports progress per batch of 40 style files', async () => {
    const calls: [number, number][] = [];
    await scanCandidates(Array.from({ length: 85 }, (_, i) => file(`s${i}.css`, decls(1))), (d, t) => calls.push([d, t]));
    expect(calls).toEqual([[40, 85], [80, 85], [85, 85]]);
  });

  it('skips a file that cannot be read', async () => {
    const bad: FileLike = { path: 'bad.css', size: 1, text: () => Promise.reject(new Error('nope')) };
    expect(paths(await scanCandidates([bad, file('ok.css', decls(9))]))).toEqual(['ok.css']);
  });

  it('keeps file order when reads finish out of order', async () => {
    const slow = (path: string, ms: number): FileLike => ({ path, size: 1, text: () => new Promise((r) => setTimeout(() => r(decls(3)), ms)) });
    expect(paths(await scanCandidates([slow('a.css', 20), slow('b.css', 0), slow('c.css', 10)]))).toEqual(['a.css', 'b.css', 'c.css']);
  });
});

describe('scanUsage', () => {
  const run = async (files: FileLike[], choose: string[]) => {
    const scan = await scanCandidates(files);
    const ds = createDataset();
    const summary = await scanUsage(scan, new Set(choose), ds);
    return { ds, summary };
  };
  const defs = file('src/tokens.css', ':root { --color-a: #fff; --space-4: 4px; --space-8: 8px; }');

  it('records var() usage of known tokens with the property and a component name', async () => {
    const { ds } = await run([defs, file('src/components/Button/Button.module.css', '.b { background: var(--color-a); padding: var(--space-4) var(--space-8); }')], ['src/tokens.css']);
    expect(ds.usage).toEqual([
      { component: 'components/Button', file: 'src/components/Button/Button.module.css', prop: 'background', token: 'color-a' },
      { component: 'components/Button', file: 'src/components/Button/Button.module.css', prop: 'padding', token: 'space-4' },
      { component: 'components/Button', file: 'src/components/Button/Button.module.css', prop: 'padding', token: 'space-8' },
    ]);
  });

  it('records a token-shaped name nobody declares, so a missing token shows up as broken usage', async () => {
    const { ds } = await run([defs, file('a.css', '.a { color: var(--color-gone); margin: var(--other-thing); fill: var(--color-a); }')], ['src/tokens.css']);
    expect(ds.usage.map((u) => u.token)).toEqual(['color-gone', 'color-a']);
  });

  it('does not record a name that is declared somewhere but not chosen as a definition', async () => {
    const { ds } = await run([defs, file('local.css', ':root { --color-local: red; --x: 1 }'), file('a.css', '.a { color: var(--color-local); }')], ['src/tokens.css']);
    expect(ds.usage).toEqual([]);
  });

  it('records quoted token paths in script files only', async () => {
    const code = "const a = 'space.4'; const b = `color/a`; const c = \"nothing.here\"; const d = 'space-8';";
    const { ds } = await run([defs, file('a.tsx', code), file('a.css', code), file('a.html', code)], ['src/tokens.css']);
    expect(ds.usage.map((u) => [u.file, u.token, u.prop])).toEqual([['a.tsx', 'space-4', ''], ['a.tsx', 'color-a', '']]);
  });

  it('reports each component, token and property once, however often it appears', async () => {
    const { ds } = await run([defs, file('a.css', '.a { color: var(--color-a); color: var(--color-a); } .b { color: var(--color-a); }')], ['src/tokens.css']);
    expect(ds.usage).toHaveLength(1);
  });

  it('takes the property from the nearest declaration, or leaves it empty', async () => {
    const { ds } = await run([defs, file('a.css', '.a { border: 1px solid var(--color-a); }\n.b { x: calc(1px + var(--space-4)); }\n@media (x) { var(--space-8) }')], ['src/tokens.css']);
    expect(ds.usage.map((u) => u.prop)).toEqual(['border', 'x', '']);
  });

  it('does not scan the chosen definition files, tests or specs', async () => {
    const { ds, summary } = await run([defs, file('a.test.tsx', 'var(--color-a)'), file('a.spec.ts', 'var(--color-a)'), file('b.css', '.b{color:var(--color-a)}')], ['src/tokens.css']);
    expect(ds.usage.map((u) => u.file)).toEqual(['b.css']);
    expect(summary.scanned).toBe(1);
  });

  it('parses the chosen definition files into the dataset and reports the counts', async () => {
    const { ds, summary } = await run([defs, file('b.css', '.b{color:var(--color-a)}')], ['src/tokens.css']);
    expect([...ds.tokens.keys()]).toEqual(['color-a', 'space-4', 'space-8']);
    expect(summary).toEqual({ defFiles: 1, defValues: 3, scanned: 1, filesWithUsage: 1, usages: 1 });
  });

  it('reads a chosen JSON file in dark mode when its path says dark', async () => {
    const json = JSON.stringify({ c: { $type: 'color', $value: '#000' }, d: { $type: 'color', $value: '#111' }, e: { $type: 'color', $value: '#222' }, f: { $type: 'color', $value: '#333' }, g: { $type: 'color', $value: '#444' } });
    const { ds } = await run([file('tokens/colors.dark.json', json), file('tokens/colors.json', json)], ['tokens/colors.dark.json']);
    expect(ds.tokens.get('c')?.modes).toEqual({ dark: { lit: '#000' } });
    const light = await run([file('tokens/colors.json', json)], ['tokens/colors.json']);
    expect(light.ds.tokens.get('c')?.modes).toEqual({ light: { lit: '#000' } });
  });

  it('replaces any usage the dataset already had', async () => {
    const scan = await scanCandidates([defs, file('b.css', '.b{color:var(--color-a)}')]);
    const ds = createDataset();
    ds.usage.push({ component: 'old', file: 'x', prop: '', token: 'old' });
    await scanUsage(scan, new Set(['src/tokens.css']), ds);
    expect(ds.usage.map((u) => u.token)).toEqual(['color-a']);
  });

  it('ignores chosen paths that are not candidates, and handles nothing chosen', async () => {
    const { ds, summary } = await run([defs, file('b.css', '.b{color:var(--color-a)}')], ['nope.css']);
    expect(ds.tokens.size).toBe(0);
    expect(summary).toMatchObject({ defFiles: 0, defValues: 0 });
  });

  it('counts files that had any usage', async () => {
    const { summary } = await run([defs, file('a.css', '.a{color:var(--color-a)}'), file('b.css', '.b{color:red}'), file('c.tsx', "const x = 'space.4'")], ['src/tokens.css']);
    expect(summary).toMatchObject({ scanned: 3, filesWithUsage: 2, usages: 2 });
  });
});

describe('componentNameFromPath', () => {
  it.each([
    ['src/components/Button/Button.module.css', 'components/Button'],
    ['src/components/Button/index.tsx', 'components/Button'],
    ['src/components/Button/Button.stories.tsx', 'components/Button'],
    ['Button.tsx', 'root/Button'],
    ['a/b/c/Card.styles.tsx', 'c/Card'],
    ['a/b/c/Card.style.css', 'c/Card'],
    ['x/index.js', 'root/x'],
    ['index.js', 'root/index'],
    ['a/Card/Card.tsx', 'a/Card'],
    ['a/Dot.name.tsx', 'a/Dot.name'],
    ['lib/Foo.test.tsx', 'lib/Foo.test'],
  ])('%s -> %s', (path, expected) => {
    expect(componentNameFromPath(path)).toBe(expected);
  });
});
