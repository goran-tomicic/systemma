import { describe, expect, it } from 'vitest';
import { analyze, createDataset, parseTokensJson, parseUsage } from '@systemma/core';
import type { Dataset } from '@systemma/core';
import { MAX_COMPONENT_NODES, buildGraph, onChain, reach } from '../src/lib/graph';

const color = (v: string) => ({ $type: 'color', $value: v });

function build(light: unknown, opts: { dark?: unknown; usage?: unknown[] } = {}) {
  const ds: Dataset = createDataset();
  parseTokensJson(ds, light, { mode: 'light' });
  if (opts.dark) parseTokensJson(ds, opts.dark, { mode: 'dark' });
  if (opts.usage) parseUsage(ds, opts.usage);
  // Generic grouping: a literal is a foundation token, an alias is semantic, and the group is the first name part.
  return { ds, graph: buildGraph(ds, analyze(ds, { profile: 'generic' })) };
}

const TOKENS = {
  color: {
    gray: { 500: color('#6b7280'), 900: color('#111827') },
    surface: { base: color('{color.gray.900}'), raised: color('{color.gray.900}') },
    fg: { base: color('{color.gray.500}') },
  },
  space: { $type: 'dimension', 4: { $value: '4px' } },
};

describe('buildGraph groups', () => {
  const { graph } = build(TOKENS);

  it('makes one node per tier and group, in the column of its tier', () => {
    expect([...graph.nodes.keys()].sort()).toEqual(['common:fg', 'common:surface', 'foundation:gray', 'foundation:spacing']);
    expect(graph.nodes.get('foundation:gray')).toMatchObject({ col: 0, tier: 'foundation', ids: ['color-gray-500', 'color-gray-900'] });
    expect(graph.nodes.get('common:surface')).toMatchObject({ col: 1, tier: 'common', ids: ['color-surface-base', 'color-surface-raised'] });
  });

  it('names a color group by its group and any other group by its kind', () => {
    expect(graph.nodes.get('foundation:gray')?.label).toBe('gray');
    expect(graph.nodes.get('foundation:spacing')?.label).toBe('Spacing and size');
  });

  it('puts the foundation groups in the first column and the rest in the second', () => {
    expect(graph.cols[0].map((n) => n.key).sort()).toEqual(['foundation:gray', 'foundation:spacing']);
    expect(graph.cols[1].map((n) => n.key).sort()).toEqual(['common:fg', 'common:surface']);
    expect(graph.cols[2]).toEqual([]);
  });
});

describe('buildGraph edges', () => {
  it('connects a group to the groups that refer to it, weighted by how many references run between them', () => {
    const { graph } = build(TOKENS);
    const find = (a: string, b: string) => graph.edges.find((e) => e.from === a && e.to === b);
    expect(find('foundation:gray', 'common:surface')).toMatchObject({ weight: 2, direct: false });
    expect(find('foundation:gray', 'common:fg')).toMatchObject({ weight: 1 });
    expect(graph.edges).toHaveLength(2);
  });

  it('counts a reference once even when light and dark both make it', () => {
    const { graph } = build({ color: { gray: { 900: color('#111') }, surface: { base: color('{color.gray.900}') } } }, { dark: { color: { surface: { base: color('{color.gray.900}') } } } });
    expect(graph.edges.find((e) => e.to === 'common:surface')?.weight).toBe(1);
  });

  it('counts the same reference from two tokens twice, and two references from one token to two targets separately', () => {
    const { graph } = build({
      color: { gray: { 100: color('#eee'), 900: color('#111') }, surface: { a: color('{color.gray.100}'), b: color('{color.gray.100}'), c: color('{color.gray.900}') } },
    });
    expect(graph.edges.find((e) => e.to === 'common:surface')?.weight).toBe(3);
  });

  it('draws no line for a reference inside one column, or to a token that is not defined', () => {
    const { graph } = build({ color: { surface: { a: color('{color.fg.a}') }, fg: { a: color('{color.nope}') } } });
    expect(graph.edges).toEqual([]);
  });

  it('sees a reference inside a composite as a reference', () => {
    const { graph } = build({
      color: { gray: { 900: color('#111') } },
      border: { $type: 'border', default: { $value: { color: '{color.gray.900}', width: '1px', style: 'solid' } } },
    });
    expect(graph.edges.find((e) => e.from === 'foundation:gray')).toBeTruthy();
  });
});

describe('buildGraph usage', () => {
  const usage = [
    { component: 'Button', tokens: { background: 'color/surface/base', color: 'color/gray/500', gap: 'space/4' } },
    { component: 'Card', tokens: { background: 'color/surface/raised', border: 'color/ghost' } },
    { component: 'forms/Input', token: 'color/fg/base' },
    { component: 'forms/Select', token: 'color/fg/base' },
  ];
  const { graph } = build(TOKENS, { usage });

  it('makes a node per component group, named by the first part of the component name', () => {
    expect(graph.nodes.get('component:Button')).toMatchObject({ col: 2, tier: 'component', ids: ['Button'] });
    expect(graph.nodes.get('component:forms')?.ids).toEqual(['forms/Input', 'forms/Select']);
  });

  it('connects each group to the components that use it', () => {
    expect(graph.edges.some((e) => e.from === 'common:surface' && e.to === 'component:Button')).toBe(true);
    expect(graph.edges.find((e) => e.from === 'common:fg' && e.to === 'component:forms')?.weight).toBe(1);
  });

  it('marks a component that uses a foundation color directly, but not a foundation space', () => {
    expect(graph.edges.find((e) => e.from === 'foundation:gray' && e.to === 'component:Button')?.direct).toBe(true);
    expect(graph.edges.find((e) => e.from === 'foundation:spacing' && e.to === 'component:Button')?.direct).toBe(false);
    expect(graph.edges.find((e) => e.from === 'common:surface' && e.to === 'component:Button')?.direct).toBe(false);
  });

  it('puts a token nothing defines in an undefined group in the semantic column', () => {
    expect(graph.nodes.get('missing:undefined')).toMatchObject({ col: 1, tier: 'missing', label: 'undefined', ids: ['color-ghost'] });
    expect(graph.edges.some((e) => e.from === 'missing:undefined' && e.to === 'component:Card')).toBe(true);
  });

  it('lists an undefined name once however often it is used', () => {
    const { graph: g } = build(TOKENS, { usage: [{ component: 'A', token: 'ghost' }, { component: 'B', token: 'ghost' }] });
    expect(g.nodes.get('missing:undefined')?.ids).toEqual(['ghost']);
  });
});

describe('buildGraph layout', () => {
  it('orders the semantic column common, then palette, then undefined, with a heading for each', () => {
    const { graph } = build({
      color: { gray: { 900: color('#111') }, 'palette-brand': { x: color('{color.gray.900}') }, surface: { base: color('{color.gray.900}') } },
    }, { usage: [{ component: 'A', token: 'ghost' }] });
    expect(graph.cols[1].map((n) => n.tier)).toEqual(['common', 'common', 'missing']);
    expect(graph.subs.map((s) => s.text)).toEqual(['Common', 'Undefined']);
  });

  it('gives every drawn node its own row, top to bottom, and a height that holds them', () => {
    const { graph } = build(TOKENS, { usage: [{ component: 'A', token: 'color/fg/base' }] });
    for (const col of graph.cols) {
      const ys = col.map((n) => n.y ?? -1);
      expect(ys.every((y) => y >= 0)).toBe(true);
      expect(ys).toEqual([...ys].sort((a, b) => a - b));
      expect(new Set(ys).size).toBe(ys.length);
      for (const y of ys) expect(graph.height).toBeGreaterThan(y + 28);
    }
  });

  it('draws at most forty component groups and says how many it left off', () => {
    const usage = Array.from({ length: 45 }, (_, i) => ({ component: `Comp${i}`, token: 'color/fg/base' }));
    const { graph } = build(TOKENS, { usage });
    expect(graph.cols[2]).toHaveLength(MAX_COMPONENT_NODES);
    expect(graph.hidden).toBe(5);
    expect(graph.nodes.get('component:Comp44')?.y).toBeUndefined();
    expect(graph.nodes.get('component:Comp0')?.y).toBeDefined();
  });

  it('is empty for no tokens', () => {
    const ds = createDataset();
    const g = buildGraph(ds, analyze(ds));
    expect([g.nodes.size, g.edges.length, g.hidden]).toEqual([0, 0, 0]);
  });
});

describe('reach', () => {
  const { graph } = build(TOKENS, { usage: [{ component: 'Button', tokens: { a: 'color/surface/base', b: 'color/fg/base' } }, { component: 'Card', token: 'color/surface/raised' }] });

  it('finds everything a group feeds, through the groups in between', () => {
    expect([...reach(graph, 'foundation:gray').downstream].sort()).toEqual(['common:fg', 'common:surface', 'component:Button', 'component:Card']);
  });

  it('finds everything that feeds a group, through the groups in between', () => {
    expect([...reach(graph, 'component:Button').upstream].sort()).toEqual(['common:fg', 'common:surface', 'foundation:gray']);
  });

  it('has nothing downstream of the end of a chain, and nothing upstream of the start of one', () => {
    expect(reach(graph, 'component:Card').downstream.size).toBe(0);
    expect(reach(graph, 'foundation:gray').upstream.size).toBe(0);
  });

  it('does not count a group as feeding itself', () => {
    expect(reach(graph, 'common:surface').downstream.has('common:surface')).toBe(false);
  });

  it('terminates on a graph with a loop', () => {
    const loop = { ...graph, edges: [...graph.edges, { from: 'component:Card', to: 'foundation:gray', weight: 1, direct: false }] };
    expect(reach(loop, 'foundation:gray').downstream.size).toBeGreaterThan(0);
  });

  it('knows which edges lie on a chain through the group', () => {
    const r = reach(graph, 'common:surface');
    const edge = (a: string, b: string) => graph.edges.find((e) => e.from === a && e.to === b);
    expect(onChain(edge('foundation:gray', 'common:surface')!, 'common:surface', r)).toBe(true);
    expect(onChain(edge('common:surface', 'component:Button')!, 'common:surface', r)).toBe(true);
    expect(onChain(edge('common:fg', 'component:Button')!, 'common:surface', r)).toBe(false);
    expect(onChain(edge('foundation:gray', 'common:fg')!, 'common:surface', r)).toBe(false);
  });
});
