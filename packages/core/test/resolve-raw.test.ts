import { describe, expect, it } from 'vitest';
import { createDataset, parseTokensJson, resolve } from '../src/index.js';
import type { Dataset } from '../src/index.js';
import { fixturePath, readFixture, toGolden } from './helpers/golden.js';

const fixture = (): Dataset => {
  const ds = createDataset('t');
  parseTokensJson(ds, JSON.parse(readFixture('composite-alias', 'input.json')), { mode: 'light' });
  return ds;
};
const composite = (ds: Dataset, id: string): { composite: unknown; raw: unknown; chain: string[] } => {
  const r = resolve(ds, id, 'light');
  if (!('composite' in r)) throw new Error(`${id} did not resolve to a composite`);
  return r;
};

describe('composite fixture', () => {
  it('matches its golden file', async () => {
    const ds = fixture();
    const out: Record<string, unknown> = {};
    for (const id of ds.tokens.keys()) {
      const r = resolve(ds, id, 'light');
      if ('composite' in r) out[id] = { chain: r.chain, resolved: r.composite, raw: r.raw };
    }
    await expect(toGolden(out)).toMatchFileSnapshot(fixturePath('composite-alias', 'expected.json'));
  });
});

describe('raw composite', () => {
  it('keeps the references that the resolved composite has replaced', () => {
    const r = composite(fixture(), 'typography-heading');
    expect(r.raw).toMatchObject({ fontFamily: '{font.family.base}', fontSize: '{size.xl}' });
    expect(r.composite).toMatchObject({ fontFamily: 'Inter, sans-serif', fontSize: '32px' });
  });

  it('shows both sides of a layered shadow, and leaves a reference it cannot resolve in both', () => {
    const r = composite(fixture(), 'shadow-card');
    expect((r.raw as { color: string }[]).map((l) => l.color)).toEqual(['{color.shadow}', '{color.missing}']);
    expect((r.composite as { color: string }[]).map((l) => l.color)).toEqual(['#00000033', '{color.missing}']);
  });

  it('is the target composite when reached through an alias, with the whole chain', () => {
    const r = composite(fixture(), 'border-alias');
    expect(r.chain).toEqual(['border-alias', 'border-standard']);
    expect((r.raw as { color: string }).color).toBe('{color.border}');
    expect((r.composite as { color: string }).color).toBe('#d1d5db');
  });

  it('equals the resolved composite when there is nothing to resolve', () => {
    const r = composite(fixture(), 'plain-solid');
    expect(r.raw).toEqual(r.composite);
  });

  it('resolves per mode, with the raw side taken from that mode', () => {
    const ds = createDataset();
    parseTokensJson(ds, { c: { $type: 'color', a: { $value: '#fff' }, b: { $value: '#000' } }, s: { $type: 'border', x: { $value: { color: '{c.a}', width: '1px', style: 'solid' } } } }, { mode: 'light' });
    parseTokensJson(ds, { c: { $type: 'color', a: { $value: '#fff' }, b: { $value: '#000' } }, s: { $type: 'border', x: { $value: { color: '{c.b}', width: '1px', style: 'solid' } } } }, { mode: 'dark' });
    const dark = resolve(ds, 's-x', 'dark');
    expect('raw' in dark && dark.raw).toEqual({ color: '{c.b}', width: '1px', style: 'solid' });
    expect('composite' in dark && dark.composite).toEqual({ color: '#000', width: '1px', style: 'solid' });
  });

  it('is a copy, so editing it does not change the dataset', () => {
    const ds = fixture();
    const r = composite(ds, 'border-standard');
    (r.raw as { color: string }).color = 'tampered';
    (r.composite as { color: string }).color = 'tampered';
    expect((composite(ds, 'border-standard').raw as { color: string }).color).toBe('{color.border}');
    expect((composite(ds, 'border-standard').composite as { color: string }).color).toBe('#d1d5db');
  });

  it('is only present on composites', () => {
    const ds = fixture();
    const value = resolve(ds, 'color-border', 'light');
    expect('value' in value && 'raw' in value).toBe(false);
    expect('error' in resolve(ds, 'nope', 'light')).toBe(true);
  });
});
