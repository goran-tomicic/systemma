import { describe, expect, it } from 'vitest';
import { analyze, impact } from '../src/index.js';
import { fromCss, fromJson, withUsage } from './helpers/build.js';

const color = (v: string) => ({ $type: 'color', $value: v });
const chain = () => fromJson({
  a: color('#111111'),
  b: color('{a}'),
  c: color('{b}'),
  d: color('{b}'),
  e: color('{c}'),
  lone: color('#222222'),
});
const ids = (i: ReturnType<typeof impact>): string[] => i.tokens.map((t) => t.id);

describe('impact tokens', () => {
  it('follows aliases to any depth, nearest first and by id inside a depth', () => {
    expect(impact(analyze(chain()), 'a').tokens).toEqual([
      { id: 'b', depth: 1, via: 'a' },
      { id: 'c', depth: 2, via: 'b' },
      { id: 'd', depth: 2, via: 'b' },
      { id: 'e', depth: 3, via: 'c' },
    ]);
  });
  it('has none for a token nothing refers to, and for one that is not defined', () => {
    expect(ids(impact(analyze(chain()), 'e'))).toEqual([]);
    expect(ids(impact(analyze(chain()), 'lone'))).toEqual([]);
    expect(impact(analyze(chain()), 'nope')).toEqual({ id: 'nope', tokens: [], components: [] });
  });
  it('finds a token that refers to it from inside a composite or a var()', () => {
    const ds = fromJson({ base: color('#ff0000'), edge: { $type: 'border', $value: { color: '{base}', width: '1px', style: 'solid' } } });
    fromCss(':root { --glow: 0 0 4px var(--base) }', ds);
    expect(ids(impact(analyze(ds), 'base'))).toEqual(['edge', 'glow']);
  });
  it('lists a token reached by two routes once, at its nearest depth', () => {
    const ds = fromJson({ a: color('#111111'), b: color('{a}'), c: color('{b}'), d: color('{a}') });
    ds.tokens.get('d')!.modes.dark = { ref: 'c' };
    expect(impact(analyze(ds), 'a').tokens.find((t) => t.id === 'd')).toMatchObject({ depth: 1, via: 'a' });
    expect(ids(impact(analyze(ds), 'a')).filter((i) => i === 'd')).toHaveLength(1);
  });
  it('stops at a cycle and does not list the token itself', () => {
    const ds = fromJson({ a: color('{b}'), b: color('{a}'), c: color('{a}') });
    expect(impact(analyze(ds), 'a').tokens).toEqual([{ id: 'b', depth: 1, via: 'a' }, { id: 'c', depth: 1, via: 'a' }]);
  });
  it('does not depend on the order tokens were loaded in', () => {
    const forward = fromJson({ a: color('#111111'), z: color('{a}'), m: color('{a}') });
    const backward = fromJson({ m: color('{a}'), z: color('{a}'), a: color('#111111') });
    expect(ids(impact(analyze(forward), 'a'))).toEqual(['m', 'z']);
    expect(ids(impact(analyze(backward), 'a'))).toEqual(['m', 'z']);
  });
});

describe('impact components', () => {
  const ds = () => withUsage(chain(), [
    { component: 'Button', file: 'Button.tsx', prop: 'background', token: 'b' },
    { component: 'Button', file: 'Button.tsx', prop: 'color', token: 'e' },
    { component: 'Card', file: 'Card.tsx', prop: 'border-color', token: 'a' },
    { component: 'Card', file: 'Card.tsx', prop: 'border-color', token: 'a' },
    { component: 'Menu', file: 'Menu.tsx', prop: '', token: 'lone' },
  ]);
  it('includes components that use the token or anything that depends on it', () => {
    expect(impact(analyze(ds()), 'a').components).toEqual([
      { component: 'Button', file: 'Button.tsx', props: ['background', 'color'], tokens: ['b', 'e'] },
      { component: 'Card', file: 'Card.tsx', props: ['border-color'], tokens: ['a'] },
    ]);
  });
  it('puts the changed token first when a component uses it itself', () => {
    const data = withUsage(chain(), [
      { component: 'X', prop: 'color', token: 'c' },
      { component: 'X', prop: 'color', token: 'a' },
    ]);
    expect(impact(analyze(data), 'a').components[0]?.tokens).toEqual(['a', 'c']);
  });
  it('leaves out components that use only unrelated tokens', () => {
    expect(impact(analyze(ds()), 'a').components.map((c) => c.component)).not.toContain('Menu');
  });
  it('is empty without usage data', () => {
    expect(impact(analyze(chain()), 'a').components).toEqual([]);
  });
});
