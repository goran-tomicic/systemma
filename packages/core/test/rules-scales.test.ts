import { describe, expect, it } from 'vitest';
import { createDataset } from '../src/index.js';
import type { Dataset } from '../src/index.js';
import { addToken } from '../src/parse/add-token.js';
import { findings, literal } from './helpers/build.js';

const build = (rows: [string, string, string?][]): Dataset => {
  const ds = createDataset();
  for (const [label, light, dark] of rows) literal(ds, label, light, dark);
  return ds;
};

describe('base-unit', () => {
  const spacing = (values: string[]): Dataset => build(values.map((v, i): [string, string] => [`space/${i + 1}`, v]));

  it('fires for a value off the inferred 8px grid', () => {
    const f = findings(spacing(['8px', '16px', '24px', '32px', '40px', '13px']), 'base-unit');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'info', id: 'space-6', message: '13px is not a multiple of the 8px base unit' });
  });

  it('falls back to a 4px grid when 8px does not fit enough', () => {
    const f = findings(spacing(['4px', '12px', '20px', '28px', '36px', '10px']), 'base-unit');
    expect(f.map((x) => x.message)).toEqual(['10px is not a multiple of the 4px base unit']);
  });

  it('converts rem at 16px', () => {
    expect(findings(spacing(['0.5rem', '1rem', '1.5rem', '2rem', '2.5rem', '13px']), 'base-unit')).toHaveLength(1);
  });

  it('ignores values of 2px or less, and needs four measurable values', () => {
    expect(findings(spacing(['1px', '2px', '8px', '16px', '24px']), 'base-unit')).toEqual([]);
    expect(findings(spacing(['8px', '16px', '13px']), 'base-unit')).toEqual([]);
  });

  it('stays quiet when no grid reaches 80%', () => {
    expect(findings(spacing(['5px', '9px', '13px', '17px', '8px']), 'base-unit')).toEqual([]);
  });

  it('only looks at foundation spacing', () => {
    const ds = spacing(['8px', '16px', '24px', '32px']);
    addToken(ds, 'space/alias', 'light', { ref: 'space-1' });
    literal(ds, 'radius/1', '3px');
    expect(findings(ds, 'base-unit')).toEqual([]);
  });
});

describe('scale-order', () => {
  it('fires for a numbered step that is not larger than the previous one', () => {
    const f = findings(build([['space/1', '4px'], ['space/2', '8px'], ['space/3', '6px'], ['space/4', '16px']]), 'scale-order');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warn', id: 'space-3', message: '6 is not larger than space/2 (8)' });
  });

  it('orders by step number, not by definition order, and counts an equal value as a violation', () => {
    const f = findings(build([['space/3', '8px'], ['space/1', '4px'], ['space/2', '8px']]), 'scale-order');
    expect(f.map((x) => x.id)).toEqual(['space-3']);
  });

  it('works for numbers and durations, and skips values it cannot read', () => {
    expect(findings(build([['d/1', '300ms'], ['d/2', '100ms'], ['d/3', '400ms']]), 'scale-order')).toHaveLength(1);
    expect(findings(build([['n/1', '2'], ['n/2', '1'], ['n/3', '3']]), 'scale-order')).toHaveLength(1);
  });

  it('needs three numbered steps, and ignores non-numeric names', () => {
    expect(findings(build([['space/1', '8px'], ['space/2', '4px']]), 'scale-order')).toEqual([]);
    expect(findings(build([['space/a', '8px'], ['space/b', '4px'], ['space/c', '2px']]), 'scale-order')).toEqual([]);
  });

  it('stays quiet for an increasing scale', () => {
    expect(findings(build([['space/1', '4px'], ['space/2', '8px'], ['space/3', '16px']]), 'scale-order')).toEqual([]);
  });
});

describe('duplicate-semantic', () => {
  const role = (r: string, color: string): [string, string][] => ['solid', 'subtle', 'border'].map((v) => [`color/palette/${r}/${v}`, color + v.length]);

  it('fires when two palette roles resolve identically in three or more shared variants', () => {
    const ds = build([...role('brand', '#11'), ...role('accent', '#11')]);
    const f = findings(ds, 'duplicate-semantic');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'info', id: null, subject: 'palette/accent', message: 'resolves to the same colors as palette/brand in all 3 shared variants' });
  });

  it('stays quiet when one shared variant differs, or fewer than three are shared', () => {
    const ds = build([...role('brand', '#11'), ...role('accent', '#11')]);
    literal(ds, 'color/palette/accent/solid', '#999');
    expect(findings(ds, 'duplicate-semantic')).toEqual([]);
    expect(findings(build([['color/palette/a/solid', '#1'], ['color/palette/b/solid', '#1']]), 'duplicate-semantic')).toEqual([]);
  });

  it('fires for common colors in one group with the same value', () => {
    const f = findings(build([['color/fg/emphatic', '#111'], ['color/fg/strong', '#111']]), 'duplicate-semantic');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ id: 'color-fg-strong', message: 'same resolved value as color/fg/emphatic' });
  });

  it('tolerates -base, -muted, -subtle and -emphasis unless it is a pair', () => {
    const three = build([['color/fg/a', '#111'], ['color/fg/b-muted', '#111'], ['color/fg/c-base', '#111']]);
    expect(findings(three, 'duplicate-semantic')).toEqual([]);
    const pair = build([['color/fg/a', '#111'], ['color/fg/b-muted', '#111']]);
    expect(findings(pair, 'duplicate-semantic')).toHaveLength(1);
  });

  it('compares across modes, so different dark values are not duplicates', () => {
    expect(findings(build([['color/fg/a', '#111', '#fff'], ['color/fg/b', '#111', '#eee']]), 'duplicate-semantic')).toEqual([]);
  });

  it('compares values ignoring case and whitespace, and only within a group', () => {
    expect(findings(build([['color/fg/a', '#ABC'], ['color/fg/b', '#abc']]), 'duplicate-semantic')).toHaveLength(1);
    expect(findings(build([['color/fg/a', '#abc'], ['color/border/a', '#abc']]), 'duplicate-semantic')).toEqual([]);
  });
});
