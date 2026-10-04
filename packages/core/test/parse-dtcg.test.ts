import { describe, expect, it } from 'vitest';
import { createDataset, parseTokensJson } from '../src/index.js';
import type { Dataset, JsonOptions } from '../src/index.js';
import { fixturePath, readFixture, serializeDataset, toGolden } from './helpers/golden.js';

const parse = (json: unknown, opts: Partial<JsonOptions> = {}): { ds: Dataset; count: number; warnings: string[] } => {
  const ds = createDataset('t');
  const { count, warnings } = parseTokensJson(ds, json, { mode: 'light', source: 't.json', ...opts });
  return { ds, count, warnings };
};
const valueOf = (ds: Dataset, id: string, mode: 'light' | 'dark' = 'light'): unknown => ds.tokens.get(id)?.modes[mode];

describe('fixtures', () => {
  it.each([
    ['dtcg-values', {}],
    ['dtcg-composite', {}],
    ['tokens-studio', { stripSet: true }],
  ] as [string, Partial<JsonOptions>][])('%s matches its golden file', async (name, opts) => {
    const { ds, count, warnings } = parse(JSON.parse(readFixture(name, 'input.json')), opts);
    await expect(toGolden({ count, warnings, ...(serializeDataset(ds) as object) })).toMatchFileSnapshot(fixturePath(name, 'expected.json'));
  });
});

describe('walking', () => {
  it('detects tokens by $value, and inherits $type from groups', () => {
    const { ds, count } = parse({ g: { $type: 'color', a: { $value: '#fff' }, h: { i: { $value: '#000' } } } });
    expect(count).toBe(2);
    expect(ds.tokens.get('g-a')?.type).toBe('color');
    expect(ds.tokens.get('g-h-i')?.type).toBe('color');
  });

  it('treats legacy value as a token when it is not an object, or has a type', () => {
    const { ds } = parse({
      plain: { value: '4px' },
      comp: { value: { x: 0, y: 1, blur: 2 }, type: 'boxShadow' },
      group: { value: { nested: { $value: '#fff' } } },
    });
    expect([...ds.tokens.keys()].sort()).toEqual(['comp', 'group-value-nested', 'plain']);
  });

  it('gives $root and DEFAULT the path of their group', () => {
    const { ds } = parse({ brand: { $root: { $value: '#111' }, hover: { $value: '#222' } }, shade: { DEFAULT: { $value: '#333' } } });
    expect([...ds.tokens.keys()].sort()).toEqual(['brand', 'brand-hover', 'shade']);
    expect(ds.tokens.get('shade')?.label).toBe('shade');
  });

  it('skips tokens at the root (empty path) and undefined values', () => {
    const { count, ds } = parse({ $value: '#fff', a: { $value: undefined } });
    expect(count).toBe(0);
    expect(ds.tokens.size).toBe(0);
  });

  it('ignores $-prefixed keys such as $extensions', () => {
    const { ds } = parse({ a: { $value: '#fff', $extensions: { x: { $value: '#000' } } } });
    expect([...ds.tokens.keys()]).toEqual(['a']);
  });

  it('joins labels with slashes and records source, format and declared type', () => {
    const { ds } = parse({ a: { b: { $type: 'color', $value: '#fff', $description: 'Why' } } });
    expect(ds.tokens.get('a-b')).toMatchObject({
      label: 'a/b', source: 't.json', format: 'dtcg', declaredType: true, description: 'Why', type: 'color',
    });
  });

  it('uses the legacy description key and keeps it out of the walk', () => {
    const { ds } = parse({ a: { value: '1', type: 'number', description: 'Legacy' } });
    expect(ds.tokens.get('a')?.description).toBe('Legacy');
    expect(ds.tokens.size).toBe(1);
  });

  it('marks deprecated tokens', () => {
    const { ds } = parse({ a: { $value: '1', $deprecated: true }, b: { $value: '1', $deprecated: 'Use a' } });
    expect(ds.tokens.get('a')?.deprecated).toBe(true);
    expect(ds.tokens.get('b')?.deprecated).toBe('Use a');
  });

  it('does not mark declaredType when the type is unknown or absent', () => {
    const { ds } = parse({ a: { $value: '1' }, b: { $type: 'mystery', $value: '1' } });
    expect(ds.tokens.get('a')?.declaredType).toBeUndefined();
    expect(ds.tokens.get('b')?.declaredType).toBeUndefined();
    expect(ds.tokens.get('b')?.type).toBe('');
  });

  it('records the mode it is given', () => {
    const { ds } = parse({ a: { $value: '#000' } }, { mode: 'dark' });
    expect(valueOf(ds, 'a', 'dark')).toEqual({ lit: '#000' });
    expect(valueOf(ds, 'a', 'light')).toBeUndefined();
  });

  it('records labels that differ only by case', () => {
    const { ds } = parse({ Color: { Brand: { $value: '#1' } }, color: { brand: { $value: '#2' } } });
    expect(ds.tokens.size).toBe(1);
    expect(ds.tokens.get('color-brand')?.caseVariants).toEqual(['color/brand']);
  });
});

describe('tokens studio sets', () => {
  const doc = { global: { a: { value: '1', type: 'number' } }, other: { b: { value: '2', type: 'number' } }, $themes: [], $x: 1, n: null, s: 'text' };

  it('drops top-level set names when stripSet is on', () => {
    expect([...parse(doc, { stripSet: true }).ds.tokens.keys()].sort()).toEqual(['a', 'b']);
  });

  it('keeps set names otherwise', () => {
    expect([...parse(doc).ds.tokens.keys()].sort()).toEqual(['global-a', 'other-b']);
  });
});

describe('value normalization', () => {
  const lit = (json: unknown, id = 'a'): unknown => valueOf(parse(json).ds, id);
  const typed = (type: string, value: unknown): unknown => lit({ a: { $type: type, $value: value } });

  it.each([
    [{ colorSpace: 'srgb', components: [1, 1, 1], hex: '#ffffff' }, '#FFFFFF'],
    [{ colorSpace: 'srgb', components: [0, 0.4, 1] }, '#0066FF'],
    [{ colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.4 }, 'rgba(0, 0, 0, 0.4)'],
    [{ colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.5, hex: '#000000' }, 'rgba(0, 0, 0, 0.5)'],
    [{ colorSpace: 'hsl', components: [210, 50, 40], alpha: 0.5 }, 'hsl(210 50% 40% / 0.5)'],
    [{ colorSpace: 'hwb', components: [210, 10, 20] }, 'hwb(210 10% 20%)'],
    [{ colorSpace: 'oklch', components: [0.7, 0.15, 250] }, 'oklch(0.7 0.15 250)'],
    [{ colorSpace: 'oklch', components: [0.7, null, 'none'] }, 'oklch(0.7 none none)'],
    [{ colorSpace: 'display-p3', components: [1, 0, 0] }, 'color(display-p3 1 0 0)'],
    [{ colorSpace: 'srgb', components: [1, 0, 0], hex: 'nope' }, '#FF0000'],
  ])('color object %j -> %j', (value, expected) => {
    expect(typed('color', value)).toEqual({ lit: expected });
  });

  it.each([
    ['dimension', { value: 4, unit: 'px' }, '4px'],
    ['duration', { value: 150, unit: 'ms' }, '150ms'],
    ['dimension', '8', '8px'],
    ['dimension', '-0.5', '-0.5px'],
    ['dimension', '1.5rem', '1.5rem'],
    ['dimension', 8, '8'],
    ['cubicBezier', [0.4, 0, 0.2, 1], 'cubic-bezier(0.4, 0, 0.2, 1)'],
    ['fontFamily', ['Inter', 'Helvetica Neue', 'sans-serif'], 'Inter, "Helvetica Neue", sans-serif'],
    ['fontFamily', ['"Already Quoted"', '{font.fallback}'], '"Already Quoted", {font.fallback}'],
    ['fontWeight', 700, '700'],
  ])('%s %j -> %j', (type, value, expected) => {
    expect(typed(type, value)).toEqual({ lit: expected });
  });

  it('infers cubic-bezier and font stacks when no type is declared', () => {
    expect(lit({ a: { $value: [0.1, 0.2, 0.3, 0.4] } })).toEqual({ lit: 'cubic-bezier(0.1, 0.2, 0.3, 0.4)' });
    expect(lit({ a: { $value: ['Inter', 'sans-serif'] } })).toEqual({ lit: 'Inter, sans-serif' });
  });

  it('turns a $ref pointer into an alias', () => {
    expect(typed('color', { $ref: '#/color/white/$value' })).toEqual({ ref: 'color-white' });
  });

  it('turns brace and var() strings into aliases', () => {
    expect(lit({ a: { $value: '{b.c}' } })).toEqual({ ref: 'b-c' });
    expect(lit({ a: { $value: 'var(--b)' } })).toEqual({ ref: 'b' });
  });

  it('trims string values', () => {
    expect(lit({ a: { $value: '  #fff ' } })).toEqual({ lit: '#fff' });
  });

  it('stringifies booleans and numbers', () => {
    expect(lit({ a: { $value: 1.5 } })).toEqual({ lit: '1.5' });
    expect(lit({ a: { $value: true } })).toEqual({ lit: 'true' });
  });

  it.each([['color'], ['dimension'], ['fontFamily']])('uses the %s kind', (type) => {
    expect(parse({ a: { $type: type, $value: '1' } }).ds.tokens.get('a')?.type).toBe(type);
  });

  it.each([
    ['spacing', 'dimension'], ['sizing', 'dimension'], ['borderRadius', 'dimension'], ['borderWidth', 'dimension'],
    ['fontSizes', 'dimension'], ['letterSpacing', 'dimension'], ['paragraphSpacing', 'dimension'],
    ['paragraphIndent', 'dimension'], ['lineHeights', 'number'], ['opacity', 'number'], ['fontFamilies', 'fontFamily'],
    ['fontWeights', 'fontWeight'], ['boxShadow', 'shadow'], ['cubicBezier', 'cubicBezier'], ['text', 'string'],
    ['COLOR', 'color'],
  ])('maps type name %s to %s', (name, kind) => {
    expect(parse({ a: { $type: name, $value: '1' } }).ds.tokens.get('a')?.type).toBe(kind);
  });

  it('leaves inherited names like "constructor" as an unknown kind', () => {
    expect(parse({ a: { $type: 'constructor', $value: '1' } }).ds.tokens.get('a')?.type).toBe('');
  });
});

describe('composites', () => {
  const comp = (json: unknown, id = 'a'): Record<string, unknown> => (valueOf(parse(json).ds, id) as { comp: Record<string, unknown> }).comp;

  it('keeps refs inside composites as raw strings', () => {
    const c = comp({ a: { $type: 'border', $value: { color: '{color.border}', width: '1px', style: 'solid' } } });
    expect(c).toEqual({ color: '{color.border}', width: '1px', style: 'solid' });
  });

  it('normalizes leaves and joins font families', () => {
    const c = comp({ a: { $type: 'typography', $value: { fontFamily: ['Inter', 'Open Sans'], fontSize: { value: 16, unit: 'px' }, lineHeight: 1.5 } } });
    expect(c).toEqual({ fontFamily: 'Inter, "Open Sans"', fontSize: '16px', lineHeight: '1.5' });
  });

  it('assumes pixels for bare numbers under length keys only', () => {
    const c = comp({ a: { $type: 'shadow', $value: { offsetX: 2, offsetY: '3', blur: 4, spread: 0, opacity: 5 } } });
    expect(c).toEqual({ offsetX: '2px', offsetY: '3px', blur: '4px', spread: '0px', opacity: '5' });
  });

  it('turns a four-number timingFunction into cubic-bezier', () => {
    const c = comp({ a: { $type: 'transition', $value: { timingFunction: [0.4, 0, 0.2, 1], duration: '150ms' } } });
    expect(c['timingFunction']).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
  });

  it('normalizes dash arrays as widths', () => {
    const c = comp({ a: { $type: 'strokeStyle', $value: { dashArray: [4, { value: 2, unit: 'px' }], lineCap: 'round' } } });
    expect(c['dashArray']).toEqual(['4px', '2px']);
  });

  it('drops $-prefixed keys inside composites and blanks nulls', () => {
    const c = comp({ a: { $type: 'border', $value: { color: '#000', $extensions: { x: 1 }, width: null } } });
    expect(c).toEqual({ color: '#000', width: '' });
  });

  it('infers a composite kind from its keys when no type is declared', () => {
    const cases: [string, unknown][] = [
      ['typography', { fontSize: '16px' }],
      ['shadow', [{ offsetX: '0px', blur: '1px' }]],
      ['transition', { duration: '1s' }],
      ['border', { width: '1px', style: 'solid' }],
    ];
    for (const [kind, value] of cases) {
      const t = parse({ a: { $value: value } }).ds.tokens.get('a');
      expect(t?.type).toBe(kind);
      expect(t?.declaredType).toBe(true);
    }
  });

  it('leaves the kind empty for an object it cannot classify', () => {
    const t = parse({ a: { $value: { mystery: 1 } } }).ds.tokens.get('a');
    expect(t?.type).toBe('');
    expect(t?.modes.light).toEqual({ comp: { mystery: '1' } });
  });

  it('converts Tokens Studio shadows, single and layered', () => {
    const { ds } = parse({
      one: { value: { x: '0', y: '2', blur: '8', spread: '0', color: '#000', type: 'dropShadow' }, type: 'boxShadow' },
      many: { value: [{ x: 0, y: 1, blur: 2, spread: 0, color: '#111', type: 'innerShadow' }], type: 'boxShadow' },
    });
    expect(valueOf(ds, 'one')).toEqual({ comp: { offsetX: '0px', offsetY: '2px', blur: '8px', spread: '0px', color: '#000', inset: false } });
    expect(valueOf(ds, 'many')).toEqual({ comp: [{ offsetX: '0px', offsetY: '1px', blur: '2px', spread: '0px', color: '#111', inset: true }] });
  });
});

describe('bad input', () => {
  it.each([[null], [undefined], ['text'], [4], [[]]])('returns a warning and no tokens for %j', (input) => {
    const { count, warnings, ds } = parse(input);
    expect(count).toBe(0);
    expect(ds.tokens.size).toBe(0);
    expect(warnings).toHaveLength(1);
  });

  it('does not throw with stripSet on a non-object', () => {
    expect(() => parse(null, { stripSet: true })).not.toThrow();
  });

  it('defaults the source to an empty string', () => {
    const ds = createDataset();
    parseTokensJson(ds, { a: { $value: '1' } }, { mode: 'light' });
    expect(ds.tokens.get('a')?.source).toBe('');
  });
});
