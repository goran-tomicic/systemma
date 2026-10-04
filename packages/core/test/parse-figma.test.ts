import { describe, expect, it } from 'vitest';
import { createDataset, parseFigmaVariables } from '../src/index.js';
import type { Dataset } from '../src/index.js';
import { fixturePath, readFixture, serializeDataset, toGolden } from './helpers/golden.js';

const parse = (json: unknown): { ds: Dataset; count: number; warnings: string[] } => {
  const ds = createDataset('t');
  const { count, warnings } = parseFigmaVariables(ds, json);
  return { ds, count, warnings };
};

interface Spec { name: string; type: string; values: Record<string, unknown>; scopes?: string[]; description?: string; codeSyntax?: Record<string, string>; collection?: string }
const doc = (modes: { modeId: string; name: string }[], variables: Spec[], defaultModeId = modes[0]?.modeId): unknown => ({
  meta: {
    variableCollections: { c1: { id: 'c1', name: 'Col', modes, defaultModeId } },
    variables: Object.fromEntries(variables.map((v, i) => [`v${i}`, {
      id: `v${i}`, name: v.name, variableCollectionId: 'c1', resolvedType: v.type, valuesByMode: v.values,
      ...(v.scopes ? { scopes: v.scopes } : {}), ...(v.description ? { description: v.description } : {}),
      ...(v.codeSyntax ? { codeSyntax: v.codeSyntax } : {}),
    }])),
  },
});
const LIGHT_DARK = [{ modeId: 'l', name: 'Light' }, { modeId: 'd', name: 'Dark' }];

describe('fixtures', () => {
  it('figma-rest-basic matches its golden file', async () => {
    const { ds, count, warnings } = parse(JSON.parse(readFixture('figma-rest-basic', 'input.json')));
    await expect(toGolden({ count, warnings, ...(serializeDataset(ds) as object) })).toMatchFileSnapshot(fixturePath('figma-rest-basic', 'expected.json'));
  });
});

describe('input shapes', () => {
  const body = { variableCollections: { c: { id: 'c', name: 'C', modes: [{ modeId: 'm', name: 'Mode 1' }], defaultModeId: 'm' } }, variables: { v: { id: 'v', name: 'a/b', variableCollectionId: 'c', resolvedType: 'FLOAT', valuesByMode: { m: 4 } } } };

  it('accepts the full response and the bare meta object alike', () => {
    expect([...parse({ meta: body }).ds.tokens.keys()]).toEqual(['a-b']);
    expect([...parse(body).ds.tokens.keys()]).toEqual(['a-b']);
  });

  it.each([[null], [undefined], ['x'], [[]], [4]])('returns a warning and nothing for %j', (input) => {
    const { count, warnings } = parse(input);
    expect(count).toBe(0);
    expect(warnings).toHaveLength(1);
  });

  it('returns nothing for an object without variables', () => {
    expect(parse({ meta: {} })).toMatchObject({ count: 0, warnings: [] });
  });

  it('skips malformed variable entries instead of throwing', () => {
    expect(parse({ meta: { variables: { a: null, b: 'x', c: 4 } } }).count).toBe(0);
  });

  it('records source, format, collection, description, scopes and code syntax', () => {
    const { ds } = parse(doc([{ modeId: 'l', name: 'Light' }], [
      { name: 'Color/A', type: 'COLOR', values: { l: { r: 0, g: 0, b: 0, a: 1 } }, scopes: ['TEXT_FILL'], description: 'Why', codeSyntax: { WEB: 'var(--a)' } },
    ]));
    expect(ds.tokens.get('color-a')).toMatchObject({
      label: 'Color/A', source: 'Figma', format: 'figma', collection: 'Col', description: 'Why',
      scopes: ['TEXT_FILL'], codeSyntax: { WEB: 'var(--a)' }, type: 'color',
    });
  });

  it('defaults scopes to an empty list and omits missing code syntax', () => {
    const t = parse(doc([{ modeId: 'l', name: 'Light' }], [{ name: 'a', type: 'FLOAT', values: { l: 1 } }])).ds.tokens.get('a');
    expect(t?.scopes).toEqual([]);
    expect(t?.codeSyntax).toBeUndefined();
  });
});

describe('modes', () => {
  const two = (values: Record<string, unknown>) => parse(doc(LIGHT_DARK, [{ name: 'a', type: 'FLOAT', values }])).ds.tokens.get('a');

  it('maps a mode named dark to dark and the other to light', () => {
    expect(two({ l: 1, d: 2 })?.modes).toEqual({ light: { lit: '1px' }, dark: { lit: '2px' } });
  });

  it('matches the dark name case-insensitively and as a substring', () => {
    const t = parse(doc([{ modeId: 'a', name: 'Default' }, { modeId: 'b', name: 'Night (DARK)' }], [{ name: 'x', type: 'FLOAT', values: { a: 1, b: 2 } }])).ds.tokens.get('x');
    expect(t?.modes).toEqual({ light: { lit: '1px' }, dark: { lit: '2px' } });
  });

  it('reads only the default mode when a multi-mode collection has no dark mode', () => {
    const modes = [{ modeId: 'a', name: 'Desktop' }, { modeId: 'b', name: 'Mobile' }];
    const { ds, count } = parse(doc(modes, [{ name: 'x', type: 'FLOAT', values: { a: 16, b: 12 } }], 'b'));
    expect(count).toBe(1);
    expect(ds.tokens.get('x')?.modes).toEqual({ light: { lit: '12px' } });
  });

  it('reads every mode as light for a single-mode collection', () => {
    const { ds } = parse(doc([{ modeId: 'a', name: 'Only' }], [{ name: 'x', type: 'FLOAT', values: { a: 1 } }]));
    expect(ds.tokens.get('x')?.modes).toEqual({ light: { lit: '1px' } });
  });

  // Pins today's behavior: two non-dark modes both land on light and the later one wins.
  it('lets the later of two non-dark modes win when a dark mode also exists', () => {
    const modes = [{ modeId: 'a', name: 'Light' }, { modeId: 'b', name: 'Brand' }, { modeId: 'c', name: 'Dark' }];
    const t = parse(doc(modes, [{ name: 'x', type: 'FLOAT', values: { a: 1, b: 2, c: 3 } }])).ds.tokens.get('x');
    expect(t?.modes).toEqual({ light: { lit: '2px' }, dark: { lit: '3px' } });
  });

  it('treats a variable with an unknown collection as single-mode light', () => {
    const json = { meta: { variables: { v: { id: 'v', name: 'x', variableCollectionId: 'gone', resolvedType: 'FLOAT', valuesByMode: { a: 1 } } } } };
    const t = parse(json).ds.tokens.get('x');
    expect(t).toMatchObject({ collection: '', modes: { light: { lit: '1px' } } });
  });
});

describe('values', () => {
  const one = (type: string, value: unknown, scopes?: string[]) =>
    parse(doc([{ modeId: 'l', name: 'Light' }], [{ name: 'a', type, values: { l: value }, ...(scopes ? { scopes } : {}) }])).ds.tokens.get('a');

  it.each([
    [{ r: 1, g: 1, b: 1, a: 1 }, '#FFFFFF'],
    [{ r: 0, g: 0.4, b: 1 }, '#0066FF'],
    [{ r: 0, g: 0, b: 0, a: 0.4 }, 'rgba(0, 0, 0, 0.4)'],
  ])('converts color %j to %j', (value, expected) => {
    expect(one('COLOR', value)?.modes.light).toEqual({ lit: expected });
  });

  it.each([
    ['COLOR', undefined, 'color'],
    ['FLOAT', undefined, 'dimension'],
    ['FLOAT', ['FONT_WEIGHT'], 'fontWeight'],
    ['FLOAT', ['OPACITY'], 'number'],
    ['FLOAT', ['GAP', 'OPACITY'], 'number'],
    ['FLOAT', ['FONT_WEIGHT', 'OPACITY'], 'fontWeight'],
    ['STRING', undefined, 'string'],
    ['STRING', ['FONT_FAMILY'], 'fontFamily'],
    ['STRING', ['TEXT_CONTENT'], 'string'],
    ['BOOLEAN', undefined, 'string'],
  ] as const)('maps %s with scopes %j to %s', (type, scopes, kind) => {
    expect(one(type, 1, scopes ? [...scopes] : undefined)?.type).toBe(kind);
  });

  it('adds px only to plain dimensions', () => {
    expect(one('FLOAT', 16)?.modes.light).toEqual({ lit: '16px' });
    expect(one('FLOAT', 700, ['FONT_WEIGHT'])?.modes.light).toEqual({ lit: '700' });
    expect(one('FLOAT', 0.4, ['OPACITY'])?.modes.light).toEqual({ lit: '0.4' });
    expect(one('STRING', 'Inter')?.modes.light).toEqual({ lit: 'Inter' });
    expect(one('BOOLEAN', true)?.modes.light).toEqual({ lit: 'true' });
  });

  it('resolves an alias to the target name as a canonical id', () => {
    const json = doc([{ modeId: 'l', name: 'Light' }], [
      { name: 'Color/White', type: 'COLOR', values: { l: { r: 1, g: 1, b: 1, a: 1 } } },
      { name: 'surface', type: 'COLOR', values: { l: { type: 'VARIABLE_ALIAS', id: 'v0' } } },
    ]);
    expect(parse(json).ds.tokens.get('surface')?.modes.light).toEqual({ ref: 'color-white' });
  });

  it('keeps an alias to an unknown variable as a figma- placeholder', () => {
    expect(one('COLOR', { type: 'VARIABLE_ALIAS', id: 'VariableID:9:9' })?.modes.light).toEqual({ ref: 'figma-VariableID:9:9' });
  });
});
