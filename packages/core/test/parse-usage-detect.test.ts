import { describe, expect, it } from 'vitest';
import { createDataset, detectFormat, parseUsage } from '../src/index.js';
import type { Dataset } from '../src/index.js';
import { fixturePath, readFixture, serializeDataset, toGolden } from './helpers/golden.js';

const parse = (json: unknown): { ds: Dataset; count: number; warnings: string[] } => {
  const ds = createDataset('t');
  const { count, warnings } = parseUsage(ds, json);
  return { ds, count, warnings };
};

describe('parseUsage fixture', () => {
  it('usage-json matches its golden file', async () => {
    const { ds, count, warnings } = parse(JSON.parse(readFixture('usage-json', 'input.json')));
    await expect(toGolden({ count, warnings, usage: (serializeDataset(ds) as { usage: unknown }).usage })).toMatchFileSnapshot(fixturePath('usage-json', 'expected.json'));
  });
});

describe('parseUsage shapes', () => {
  it('reads tokens as an object of prop to token', () => {
    const { ds, count } = parse([{ component: 'Btn', file: 'b.tsx', tokens: { background: 'color/a', color: 'var(--color-b)' } }]);
    expect(count).toBe(2);
    expect(ds.usage).toEqual([
      { component: 'Btn', file: 'b.tsx', prop: 'background', token: 'color-a' },
      { component: 'Btn', file: 'b.tsx', prop: 'color', token: 'color-b' },
    ]);
  });

  it('reads tokens as a list of strings, with an empty prop', () => {
    expect(parse([{ component: 'X', tokens: ['a.b', 'c/d'] }]).ds.usage.map((u) => [u.prop, u.token])).toEqual([['', 'a-b'], ['', 'c-d']]);
  });

  it('reads tokens as a list of {token, prop} and skips entries without a token', () => {
    const { ds } = parse([{ component: 'X', tokens: [{ token: 'a', prop: 'p' }, { prop: 'q' }, null, 4, { token: 'b' }] }]);
    expect(ds.usage.map((u) => [u.prop, u.token])).toEqual([['p', 'a'], ['', 'b']]);
  });

  it('reads a single token with an optional prop', () => {
    const { ds } = parse([{ component: 'X', token: 'a', prop: 'background' }, { component: 'Y', token: 'b' }]);
    expect(ds.usage.map((u) => [u.component, u.prop, u.token])).toEqual([['X', 'background', 'a'], ['Y', '', 'b']]);
  });

  it('reads both token and tokens from one record, token first', () => {
    const { ds } = parse([{ component: 'X', token: 'a', tokens: { p: 'b' } }]);
    expect(ds.usage.map((u) => u.token)).toEqual(['a', 'b']);
  });

  it.each([
    ['color/palette/brand', 'color-palette-brand'],
    ['color.palette.brand', 'color-palette-brand'],
    ['--color-palette-brand', 'color-palette-brand'],
    ['{color.palette.brand}', 'color-palette-brand'],
    ['{color.brand.DEFAULT}', 'color-brand'],
    ['var(--color-palette-brand)', 'color-palette-brand'],
    ['var(--space-4, 16px)', 'space-4'],
    ['Color.Gray.50', 'color-gray-50'],
    ['{ }', '{-}'],
  ])('canonicalizes token %j to %j', (token, id) => {
    expect(parse([{ component: 'X', token }]).ds.usage[0]?.token).toBe(id);
  });
});

describe('parseUsage component names', () => {
  it('falls back from component to name to file', () => {
    const { ds } = parse([{ component: 'A', name: 'B', file: 'f', token: 't' }, { name: 'B', file: 'f', token: 't' }, { file: 'f.tsx', token: 't' }]);
    expect(ds.usage.map((u) => u.component)).toEqual(['A', 'B', 'f.tsx']);
  });

  it('skips records with no component, name or file', () => {
    expect(parse([{ tokens: ['a'] }, { token: 'a' }]).count).toBe(0);
  });

  it('keeps the file separately from the component', () => {
    expect(parse([{ component: 'A', file: 'a.tsx', token: 't' }]).ds.usage[0]?.file).toBe('a.tsx');
    expect(parse([{ component: 'A', token: 't' }]).ds.usage[0]?.file).toBe('');
  });
});

describe('parseUsage input handling', () => {
  it.each([[null], [undefined], [{}], ['x'], [4]])('returns a warning for non-array %j', (input) => {
    const { count, warnings, ds } = parse(input);
    expect(count).toBe(0);
    expect(ds.usage).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it('skips non-object entries without throwing', () => {
    expect(parse([null, 'x', 4, [], { component: 'A', token: 't' }]).count).toBe(1);
  });

  it('appends to existing usage', () => {
    const ds = createDataset();
    parseUsage(ds, [{ component: 'A', token: 'a' }]);
    parseUsage(ds, [{ component: 'B', token: 'b' }]);
    expect(ds.usage.map((u) => u.component)).toEqual(['A', 'B']);
  });
});

describe('detectFormat', () => {
  it.each([
    ['{"a":{"$value":"#fff"}}', 'dtcg'],
    ['{"a":1}', 'dtcg'],
    ['{}', 'dtcg'],
    ['  \n {"a":1}  ', 'dtcg'],
    ['{"meta":{"variables":{}}}', 'figma'],
    ['{"meta":{"variables":{"a":{}}}}', 'figma'],
    ['{"variableCollections":{"c":{}}}', 'figma'],
    ['[]', 'usage'],
    ['[{"component":"A","token":"b"}]', 'usage'],
    [':root{--a:1}', 'css'],
    ['/* c */ :root { --a : 1 }', 'css'],
    ['--a:1', 'css'],
  ])('%j is %s', (text, kind) => {
    expect(detectFormat(text).kind).toBe(kind);
  });

  it('returns the parsed JSON with JSON kinds only', () => {
    expect(detectFormat('[1]')).toEqual({ kind: 'usage', json: [1] });
    expect(detectFormat('{"a":1}')).toEqual({ kind: 'dtcg', json: { a: 1 } });
    expect(detectFormat(':root{--a:1}')).toEqual({ kind: 'css' });
  });

  // Pins today's behavior: the Figma check is a truthiness test, so an empty variables object still
  // counts as Figma, while a missing or null meta falls through to DTCG.
  it('detects Figma by the presence of variables, not by their content', () => {
    expect(detectFormat('{"meta":{"variables":{}}}').kind).toBe('figma');
    expect(detectFormat('{"meta":{}}').kind).toBe('dtcg');
    expect(detectFormat('{"meta":null}').kind).toBe('dtcg');
  });

  it.each([
    ['', 'Empty input.'],
    ['   \n ', 'Empty input.'],
    ['hello', 'Unrecognized format.'],
    ['a: 1', 'Unrecognized format.'],
    ['.a { color: red }', 'Unrecognized format.'],
  ])('reports %j as an error', (text, prefix) => {
    const d = detectFormat(text);
    expect(d.kind).toBe('error');
    expect(d.kind === 'error' && d.message.startsWith(prefix)).toBe(true);
  });

  it.each(['{bad', '[1,', '{"a":}'])('reports invalid JSON %j without throwing', (text) => {
    const d = detectFormat(text);
    expect(d.kind).toBe('error');
    expect(d.kind === 'error' && d.message.startsWith('Invalid JSON: ')).toBe(true);
  });
});
