import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';

const json = (v: unknown): string => JSON.stringify(v);
const color = (v: string, extra: object = {}) => ({ $type: 'color', $value: v, ...extra });

const TOKENS = {
  color: {
    gray: { 500: color('#6b7280'), 900: color('#111827') },
    surface: { base: color('{color.gray.900}', { $description: 'Page background' }) },
    fg: { base: color('{color.gray.500}', { $description: 'Body text' }) },
    accent: { base: color('{color.blue.500}', { $description: 'Accent' }) },
  },
  color2: { blue: { 500: color('#2563eb') } },
  space: { $type: 'dimension', 4: { $value: '4px' } },
};
const DARK = { color: { gray: { 900: color('#f3f4f6') } } };
const USAGE = [
  { component: 'Button', tokens: { background: 'color/surface/base', color: 'color/gray/500' } },
  { component: 'Card', token: 'color/ghost', prop: 'color' },
];

function paste(text: string, name: string): void {
  fireEvent.change(screen.getByPlaceholderText(/"\$value"/), { target: { value: text } });
  fireEvent.change(screen.getByLabelText('Name for the pasted text'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Add pasted text' }));
}
function setup(opts: { usage?: boolean } = {}) {
  render(<App />);
  paste(json(TOKENS), 'light.json');
  paste(json(DARK), 'dark.json');
  if (opts.usage) paste(json(USAGE), 'usage.json');
  fireEvent.click(screen.getByRole('tab', { name: 'Map' }));
  return { map: () => within(screen.getByRole('region', { name: 'Map' })) };
}
const node = (name: RegExp | string): SVGElement => screen.getByRole('button', { name }) as unknown as SVGElement;
const dimmed = (): string[] => Array.from(document.querySelectorAll('.node.dim')).map((n) => n.getAttribute('aria-label') ?? '');
const hotEdges = (): number => document.querySelectorAll('.edge.hot').length;

describe('the map tab', () => {
  it('is a tab, next to the list and the audit', () => {
    setup();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Map', expect.stringMatching(/^Tokens/), expect.stringMatching(/^Audit/), 'Compare']);
    expect(screen.getByRole('tab', { name: 'Map' }).getAttribute('aria-selected')).toBe('true');
  });

  it('draws a node for each group with how many tokens it holds, and names the columns', () => {
    setup();
    expect(node('gray, 2 tokens')).toBeTruthy();
    expect(node('surface, 1 tokens')).toBeTruthy();
    expect(screen.getByRole('group', { name: /Token groups and how they connect/ })).toBeTruthy();
    for (const title of ['Foundation', 'Semantic', 'Components']) expect(screen.getAllByText(title).length).toBeGreaterThan(0);
  });

  it('says when there is no usage data, and draws no components', () => {
    setup();
    expect(screen.getByText(/No usage data loaded/)).toBeTruthy();
    expect(document.querySelectorAll('.node.t-component')).toHaveLength(0);
  });

  it('draws components, and the undefined group, once usage is added', () => {
    setup({ usage: true });
    expect(screen.queryByText(/No usage data loaded/)).toBeNull();
    expect(node('Button, 1 components')).toBeTruthy();
    expect(node('undefined, 1 tokens')).toBeTruthy();
    expect(screen.getByText('Undefined')).toBeTruthy();
  });

  it('explains the dashed lines only when a component uses a foundation color directly', () => {
    setup();
    expect(screen.queryByText(/Dashed amber lines/)).toBeNull();
    paste(json(USAGE), 'usage.json');
    expect(screen.getByText(/Dashed amber lines/)).toBeTruthy();
    expect(document.querySelector('.edge.direct')).toBeTruthy();
  });

  it('paints a color group with a color, in the chosen mode', () => {
    const { map } = setup();
    const fill = (): string => ((node('gray, 2 tokens').querySelector('circle') as SVGCircleElement).style.fill);
    const light = fill();
    expect(light).not.toBe('');
    fireEvent.click(map().getByRole('button', { name: 'Dark' }));
    expect(fill()).not.toBe(light);
    expect(map().getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('selecting a group', () => {
  it('asks for a selection until there is one', () => {
    setup();
    expect(screen.getByText(/Select a group to see its tokens/)).toBeTruthy();
  });

  it('highlights the chain through it and dims the rest', () => {
    setup({ usage: true });
    expect(dimmed()).toEqual([]);
    expect(hotEdges()).toBe(0);
    fireEvent.click(node('surface, 1 tokens'));
    expect(node('surface, 1 tokens').getAttribute('aria-pressed')).toBe('true');
    expect(dimmed()).toEqual(expect.arrayContaining(['fg, 1 tokens', 'Card, 1 components']));
    expect(dimmed()).not.toContain('gray, 2 tokens');
    expect(dimmed()).not.toContain('Button, 1 components');
    expect(hotEdges()).toBe(2);
  });

  it('highlights everything downstream of a foundation group, not only its neighbours', () => {
    render(<App />);
    paste(json(TOKENS), 'light.json');
    // Button reaches gray only through surface, so it is two steps downstream
    paste(json([{ component: 'Button', token: 'color/surface/base' }, { component: 'Card', token: 'color/ghost' }]), 'usage.json');
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }));
    fireEvent.click(node('gray, 2 tokens'));
    expect(dimmed()).not.toContain('Button, 1 components');
    expect(dimmed()).not.toContain('surface, 1 tokens');
    expect(dimmed()).toEqual(expect.arrayContaining(['Card, 1 components', 'undefined, 1 tokens']));
  });

  it('shows the group\'s tokens, what feeds it and what it feeds', () => {
    setup({ usage: true });
    fireEvent.click(node('gray, 2 tokens'));
    const panel = document.querySelector('.gpanel') as HTMLElement;
    expect(within(panel).getByRole('heading').textContent).toContain('gray');
    expect(within(panel).getByRole('heading').textContent).toContain('foundation');
    expect(panel.textContent).toContain('Feeds surface, fg');
    expect(within(panel).getAllByRole('button').length).toBe(2);
  });

  it('says how far a change can reach beyond the groups it feeds directly', () => {
    render(<App />);
    paste(json(TOKENS), 'light.json');
    paste(json([{ component: 'Button', token: 'color/surface/base' }]), 'usage.json');
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }));
    fireEvent.click(node('gray, 2 tokens'));
    const panel = document.querySelector('.gpanel') as HTMLElement;
    expect(panel.textContent).toContain('Feeds surface, fg');
    expect(panel.textContent).toContain('A change here can also reach Button.');
  });

  it('does not repeat a group it already said it feeds', () => {
    setup({ usage: true }); // Button uses a gray token directly, so Button is one of the groups gray feeds
    fireEvent.click(node('gray, 2 tokens'));
    expect((document.querySelector('.gpanel') as HTMLElement).textContent).not.toContain('also reach');
  });

  it('shows what feeds a semantic group', () => {
    setup();
    fireEvent.click(node('surface, 1 tokens'));
    expect((document.querySelector('.gpanel') as HTMLElement).textContent).toContain('Fed by gray');
  });

  it('shows the components of a component group with the tokens they use and the properties', () => {
    setup({ usage: true });
    fireEvent.click(node('Button, 1 components'));
    const panel = document.querySelector('.gpanel') as HTMLElement;
    expect(panel.textContent).toContain('Button');
    expect(within(panel).getAllByRole('button')).toHaveLength(2);
    expect(panel.textContent).toContain('background');
    expect(panel.textContent).toContain('color');
  });

  it('shows the names nothing defines, as chips that are marked missing', () => {
    setup({ usage: true });
    fireEvent.click(node('undefined, 1 tokens'));
    const panel = document.querySelector('.gpanel') as HTMLElement;
    expect(panel.textContent).toContain('names nothing defines');
    expect(panel.querySelector('.chip.bad')).toBeTruthy();
  });

  it('deselects on a second click', () => {
    setup();
    fireEvent.click(node('gray, 2 tokens'));
    fireEvent.click(node('gray, 2 tokens'));
    expect(node('gray, 2 tokens').getAttribute('aria-pressed')).toBe('false');
    expect(dimmed()).toEqual([]);
    expect(screen.getByText(/Select a group/)).toBeTruthy();
  });

  it('works from the keyboard with Enter and Space', () => {
    setup();
    const gray = node('gray, 2 tokens');
    expect(gray.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(gray, { key: 'Enter' });
    expect(gray.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(gray, { key: ' ' });
    expect(gray.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(gray, { key: 'a' });
    expect(gray.getAttribute('aria-pressed')).toBe('false');
  });

  it('opens a token in the detail panel from a chip in the group panel', () => {
    setup();
    fireEvent.click(node('surface, 1 tokens'));
    fireEvent.click(within(document.querySelector('.gpanel') as HTMLElement).getByRole('button', { name: /surface\/base/ }));
    expect(within(screen.getByRole('complementary', { name: 'Token details' })).getByRole('heading', { name: 'color/surface/base' })).toBeTruthy();
  });

  it('forgets a selection when its tokens are removed', () => {
    setup();
    // surface is only in light.json; gray is also in dark.json, so it would survive the removal
    fireEvent.click(node('surface, 1 tokens'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove light.json' }));
    expect(document.querySelector('.node.sel')).toBeNull();
  });

  it('keeps a selection whose group is still there after a source is removed', () => {
    setup();
    fireEvent.click(node('gray, 2 tokens'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove dark.json' }));
    expect(document.querySelector('.node.sel')).toBeTruthy();
  });
});

describe('the connections list', () => {
  it('lists every line in words, with how many links it carries', () => {
    setup({ usage: true });
    const list = document.querySelector('details.connections') as HTMLElement;
    expect(list.textContent).toContain('gray → surface');
    expect(list.textContent).toMatch(/gray → surface · 1 link/);
    expect(list.textContent).toContain('used directly');
    expect(within(list).getAllByRole('listitem').length).toBe(Number(within(list).getByText(/^\d+$/).textContent));
  });

  it('says so when nothing refers across tiers', () => {
    render(<App />);
    paste(json({ space: { $type: 'dimension', 4: { $value: '4px' } } }), 'a.json');
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }));
    expect(screen.getByText('Nothing here refers to anything in another tier.')).toBeTruthy();
  });
});

describe('a large map', () => {
  it('says how many component groups it leaves off', () => {
    render(<App />);
    paste(json(TOKENS), 'light.json');
    paste(json(Array.from({ length: 45 }, (_, i) => ({ component: `C${i}`, token: 'color/fg/base' }))), 'usage.json');
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }));
    expect(screen.getByText(/5 more component groups are not drawn \(the map shows 40\)/)).toBeTruthy();
    expect(document.querySelectorAll('.node.t-component')).toHaveLength(40);
  });
});
