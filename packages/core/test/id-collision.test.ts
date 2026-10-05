import { describe, expect, it } from 'vitest';
import { analyze, createDataset, parseCss, parseFigmaVariables, parseTokensJson } from '../src/index.js';
import type { Dataset } from '../src/index.js';
import { fixturePath, readFixture, serializeDataset, toGolden } from './helpers/golden.js';
import { findings, fromJson, literal } from './helpers/build.js';

const fixture = (): { ds: Dataset; warnings: string[] } => {
  const ds = createDataset('t');
  const warnings: string[] = [];
  for (const [file, mode] of [['light.json', 'light'], ['dark.json', 'dark']] as const) {
    warnings.push(...parseTokensJson(ds, JSON.parse(readFixture('id-collision', file)), { mode, source: file }).warnings);
  }
  warnings.push(...parseCss(ds, readFixture('id-collision', 'theme.css'), 'theme.css').warnings);
  return { ds, warnings };
};

describe('id-collision fixture', () => {
  it('matches its golden file', async () => {
    const { ds, warnings } = fixture();
    const f = analyze(ds, { profile: 'generic', enabledRulesets: new Set(['integrity', 'dtcg'] as const) }).findings
      .filter((x) => x.rule === 'id-collision' || x.rule === 'dtcg-case').map((x) => `${x.rule}: ${x.id} | ${x.subject} | ${x.message}`);
    await expect(toGolden({ warnings, findings: f, ...(serializeDataset(ds) as object) })).toMatchFileSnapshot(fixturePath('id-collision', 'expected.json'));
  });
});

describe('parser warnings and paths', () => {
  it('warn when a DTCG token collides, and keep its authored path', () => {
    const ds = createDataset();
    const r = parseTokensJson(ds, { a: { 'b-c': { $value: '1' } }, 'a-b': { c: { $value: '2' } } }, { mode: 'light' });
    expect(r).toEqual({ count: 1, warnings: ["'a-b/c' has the same id as 'a/b-c' (a-b-c) and was not merged."] });
    expect(ds.tokens.get('a-b-c')).toMatchObject({ label: 'a/b-c', path: ['a', 'b-c'], modes: { light: { lit: '1' } } });
  });

  it('keep dotted DTCG names as separate path segments', () => {
    const ds = createDataset();
    parseTokensJson(ds, { space: { '1.5': { $value: '6px' } } }, { mode: 'light' });
    expect(ds.tokens.get('space-1-5')?.path).toEqual(['space', '1.5']);
  });

  it('warn about a colliding CSS custom property, and only count the ones added', () => {
    const ds = createDataset();
    const r = parseCss(ds, ':root { --Brand-X: #1; --brand-x: #2; --other: #3 }', 'a.css');
    expect(r.count).toBe(2);
    expect(r.warnings).toEqual(["'--brand-x' has the same id as '--Brand-X' (brand-x) and was not merged."]);
    expect(ds.tokens.get('brand-x')?.modes.light).toEqual({ lit: '#1' });
    expect(ds.tokens.get('other')?.path).toEqual(['other']);
  });

  it('merge a CSS token into a DTCG token of the same id instead of colliding', () => {
    const ds = createDataset();
    parseTokensJson(ds, { color: { brand: { $type: 'color', $value: '#fff' } } }, { mode: 'light' });
    const r = parseCss(ds, '[data-theme="dark"] { --color-brand: #000 }', 'a.css');
    expect(r.warnings).toEqual([]);
    expect(ds.tokens.get('color-brand')?.modes).toEqual({ light: { lit: '#fff' }, dark: { lit: '#000' } });
  });

  it('warn about the same Figma name in two collections, and skip its extra fields', () => {
    const ds = createDataset();
    const collection = (id: string, name: string) => ({ id, name, modes: [{ modeId: `${id}m`, name: 'Mode 1' }], defaultModeId: `${id}m` });
    const variable = (id: string, col: string, value: number, scopes: string[]) => ({ id, name: 'color/bg', variableCollectionId: col, resolvedType: 'COLOR', scopes, valuesByMode: { [`${col}m`]: { r: value, g: value, b: value, a: 1 } } });
    const r = parseFigmaVariables(ds, { meta: {
      variableCollections: { c1: collection('c1', 'Semantic'), c2: collection('c2', 'Legacy') },
      variables: { v1: variable('v1', 'c1', 1, ['FRAME_FILL']), v2: variable('v2', 'c2', 0, ['TEXT_FILL']) },
    } });
    expect(r.count).toBe(1);
    expect(r.warnings).toEqual(["'color/bg' has the same id as 'color/bg' (color-bg) and was not merged."]);
    expect(ds.tokens.get('color-bg')).toMatchObject({ collection: 'Semantic', scopes: ['FRAME_FILL'], path: ['color', 'bg'] });
    expect(ds.tokens.get('color-bg')?.collisions?.[0]).toMatchObject({ collection: 'Legacy' });
  });
});

describe('id-collision rule', () => {
  it('fires on the kept token, naming the one that was left out', () => {
    const ds = fromJson({ a: { 'b-c': { $value: '1' } }, 'a-b': { c: { $value: '2' } } });
    const f = findings(ds, 'id-collision');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'error', set: 'integrity', id: 'a-b-c', subject: 'a-b/c', message: "has the same id (a-b-c) as 'a/b-c' and was not merged" });
  });

  it('reports a name that differs only by case, which dtcg-case also reports', () => {
    const ds = fromJson({ Color: { Brand: { $value: '#1' } }, color: { brand: { $value: '#2' } } });
    expect(findings(ds, 'id-collision')).toHaveLength(1);
    expect(findings(ds, 'dtcg-case')).toHaveLength(1);
  });

  it('reports each left-out name once, however many modes it appeared in', () => {
    const ds = fromJson({ a: { 'b-c': { $value: '1' } } });
    fromJson({ 'a-b': { c: { $value: '2' } } }, { ds });
    fromJson({ 'a-b': { c: { $value: '3' } } }, { ds, mode: 'dark' });
    expect(findings(ds, 'id-collision')).toHaveLength(1);
    expect(ds.tokens.get('a-b-c')?.collisions).toHaveLength(2);
  });

  it('reports two different left-out names separately', () => {
    const ds = createDataset();
    literal(ds, 'a/b-c', '1');
    literal(ds, 'a-b/c', '2');
    literal(ds, 'a.b.c', '3');
    expect(findings(ds, 'id-collision').map((f) => f.subject)).toEqual(['a-b/c', 'a.b.c']);
  });

  it('words the same-name-in-two-collections case with the collections', () => {
    const ds = createDataset();
    literal(ds, 'color/bg', '#fff', undefined, { format: 'figma', collection: 'Semantic' });
    literal(ds, 'color/bg', '#eee', undefined, { format: 'figma', collection: 'Legacy' });
    expect(findings(ds, 'id-collision')[0]?.message).toBe("'color/bg' in collection 'Legacy' has the same id (color-bg) as the one in 'Semantic' and was not merged");
  });

  it('stays quiet when nothing collides, and for tokens merged across formats', () => {
    const ds = fromJson({ a: { $value: '1' }, b: { $value: '2' } });
    parseCss(ds, ':root { --a: 3 }', 'a.css');
    expect(findings(ds, 'id-collision')).toEqual([]);
  });

  it('can be silenced or ignored for particular tokens', () => {
    const ds = fromJson({ a: { 'b-c': { $value: '1' } }, 'a-b': { c: { $value: '2' } } });
    expect(findings(ds, 'id-collision', { severityOverrides: { 'id-collision': 'off' } })).toEqual([]);
    expect(findings(ds, 'id-collision', { ignore: { 'id-collision': ['a/*'] } })).toEqual([]);
  });
});
