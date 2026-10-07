import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';

const json = (v: unknown): string => JSON.stringify(v);
const color = (v: string, extra: object = {}) => ({ $type: 'color', $value: v, ...extra });

const LIGHT = {
  color: {
    white: color('#ffffff'),
    black: color('#000000'),
    surface: { base: color('{color.white}', { $description: 'Page background' }) },
    fg: { base: color('{color.black}', { $description: 'Body text' }) },
    broken: color('{color.nope}', { $description: 'Page background' }),
  },
  space: { $type: 'dimension', 4: { $value: '4px' } },
  size: { $type: 'dimension', md: { $value: '16px' } },
  font: { family: { $type: 'fontFamily', base: { $value: ['Inter', 'sans-serif'] } } },
  type: { $type: 'typography', body: { $value: { fontFamily: '{font.family.base}', fontSize: '{size.md}', fontWeight: 400, letterSpacing: '0px', lineHeight: 1.5 } } },
};
const DARK = { color: { surface: { base: color('#111111') } } };

function paste(text: string, name: string): void {
  fireEvent.change(screen.getByPlaceholderText(/"\$value"/), { target: { value: text } });
  fireEvent.change(screen.getByLabelText('Name for the pasted text'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Add pasted text' }));
}
function setup() {
  render(<App />);
  paste(json(LIGHT), 'light.json');
  paste(json(DARK), 'dark.json');
  fireEvent.click(screen.getByRole('tab', { name: /Tokens/ }));
  return { list: () => within(screen.getByRole('region', { name: 'Tokens' })), detail: () => within(screen.getByRole('complementary', { name: 'Token details' })) };
}
const rowNames = (): string[] => Array.from(document.querySelectorAll('.row .rname')).map((e) => e.textContent ?? '');
const row = (name: string): HTMLElement => Array.from(document.querySelectorAll<HTMLElement>('.row')).find((r) => r.querySelector('.rname')?.textContent === name) as HTMLElement;

describe('tabs', () => {
  it('start on the audit, with counts, and an error count that stands out', () => {
    render(<App />);
    paste(json(LIGHT), 'light.json');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Map', 'Tokens9', 'Audit1']);
    expect(screen.getByRole('tab', { name: /Audit/ }).getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('.tab .n.err')).toBeTruthy();
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('tab-audit');
  });

  it('switch between the token list and the audit', () => {
    setup();
    expect(screen.getByRole('tab', { name: /Tokens/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('region', { name: 'Tokens' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Audit' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Audit/ }));
    expect(screen.getByRole('region', { name: 'Audit' })).toBeTruthy();
  });

  it('are not shown until there are tokens', () => {
    render(<App />);
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('the token list', () => {
  it('lists every token by category and tier, with what each comes to', () => {
    setup();
    expect(rowNames()).toHaveLength(9);
    expect(rowNames()[0]).toBe('black');
    expect(row('surface/base').textContent).toContain('#ffffff');
    expect(row('space/4').textContent).toContain('4px');
    expect(screen.getByText('9 tokens')).toBeTruthy();
  });

  it('filters by tier, kind and text, and says how many are left', () => {
    const { list } = setup();
    fireEvent.click(list().getByRole('button', { name: 'Common' }));
    expect(rowNames()).toEqual(expect.arrayContaining(['surface/base', 'fg/base']));
    expect(rowNames()).not.toContain('white');
    fireEvent.click(list().getByRole('button', { name: 'All tiers' }));
    fireEvent.click(list().getByRole('button', { name: 'Spacing and size' }));
    expect(rowNames()).toEqual(['size/md', 'space/4']);
    fireEvent.click(list().getByRole('button', { name: 'All kinds' }));
    fireEvent.change(list().getByLabelText('Filter tokens'), { target: { value: 'body text' } });
    expect(rowNames()).toEqual(['fg/base']);
    expect(screen.getByText('1 of 9 tokens')).toBeTruthy();
    fireEvent.change(list().getByLabelText('Filter tokens'), { target: { value: 'zzz' } });
    expect(screen.getByText('No tokens match that filter.')).toBeTruthy();
  });

  it('only offers the kinds that are there', () => {
    const { list } = setup();
    expect(list().queryByRole('button', { name: 'Motion' })).toBeNull();
    expect(list().getByRole('button', { name: 'Typography' })).toBeTruthy();
  });

  it('shows the dark value in dark mode, and says when there is none', () => {
    const { list } = setup();
    fireEvent.click(list().getByRole('button', { name: 'Dark' }));
    expect(row('surface/base').textContent).toContain('#111111');
    expect(row('white').textContent).toContain('no dark value');
    expect(list().getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('marks a token that has errors or warnings', () => {
    setup();
    expect(row('broken').querySelector('.badge.err')).toBeTruthy();
    expect(row('white').querySelector('.badge')).toBeNull();
  });

  it('shows two hundred at a time', () => {
    render(<App />);
    paste(json(Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`t${String(i).padStart(3, '0')}`, { $type: 'dimension', $value: '4px' }]))), 'many.json');
    fireEvent.click(screen.getByRole('tab', { name: /Tokens/ }));
    expect(rowNames()).toHaveLength(200);
    fireEvent.click(screen.getByRole('button', { name: 'Show 50 more' }));
    expect(rowNames()).toHaveLength(250);
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull();
  });

  it('goes back to the first page when a filter changes', () => {
    render(<App />);
    paste(json(Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`t${String(i).padStart(3, '0')}`, { $type: 'dimension', $value: '4px' }]))), 'many.json');
    fireEvent.click(screen.getByRole('tab', { name: /Tokens/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Show 50 more' }));
    fireEvent.change(screen.getByLabelText('Filter tokens'), { target: { value: 't' } });
    expect(rowNames()).toHaveLength(200);
  });
});

describe('the detail panel', () => {
  it('asks for a selection until there is one', () => {
    const { detail } = setup();
    expect(detail().getByText(/Select a token/)).toBeTruthy();
  });

  it('shows the token, its tier and kind, its description and its value in each mode', () => {
    const { detail } = setup();
    fireEvent.click(row('surface/base'));
    expect(detail().getByRole('heading', { name: 'color/surface/base' })).toBeTruthy();
    expect(detail().getByText('color-surface-base')).toBeTruthy();
    expect(detail().getByText('Page background')).toBeTruthy();
    expect(row('surface/base').getAttribute('aria-pressed')).toBe('true');
    const values = Array.from(document.querySelectorAll('.valtext')).map((e) => e.textContent);
    expect(values).toEqual(['#ffffff', '#111111']);
  });

  it('shows the aliases a value passes through, and says when a mode has no value', () => {
    const { detail } = setup();
    fireEvent.click(row('fg/base'));
    expect(within(document.querySelector('.via') as HTMLElement).getByRole('button', { name: /black/ })).toBeTruthy();
    expect(detail().getByText('No dark value.')).toBeTruthy();
  });

  it('opens another token from a chip', () => {
    const { detail } = setup();
    fireEvent.click(row('fg/base'));
    fireEvent.click(within(document.querySelector('.via') as HTMLElement).getByRole('button', { name: /black/ }));
    expect(detail().getByRole('heading', { name: 'color/black' })).toBeTruthy();
    expect(detail().getByText('fg/base')).toBeTruthy();
  });

  it('closes', () => {
    const { detail } = setup();
    fireEvent.click(row('white'));
    fireEvent.click(detail().getByRole('button', { name: 'Close' }));
    expect(detail().getByText(/Select a token/)).toBeTruthy();
    expect(document.querySelector('#detail.open')).toBeNull();
  });

  it('lays a composite out as written beside what it comes to', () => {
    const { detail } = setup();
    fireEvent.click(row('type/body'));
    const table = document.querySelector('.kv') as HTMLElement;
    expect(within(table).getByRole('button', { name: /font\/family\/base/ })).toBeTruthy();
    expect(within(table).getByRole('button', { name: /size\/md/ })).toBeTruthy();
    expect(table.textContent).toContain('Inter, sans-serif');
    expect(table.textContent).toContain('16px');
    expect(table.textContent).toContain('1.5');
    expect(detail().getByRole('heading', { name: 'type/body' })).toBeTruthy();
  });

  it('lists the tokens that use it', () => {
    const { detail } = setup();
    fireEvent.click(row('white'));
    const used = detail().getByText('Used by tokens').nextElementSibling as HTMLElement;
    expect(within(used).getByRole('button', { name: /surface\/base/ })).toBeTruthy();
    fireEvent.click(row('space/4'));
    expect(detail().getByText('No other token refers to it.')).toBeTruthy();
  });

  it('lists the components that use it, with the properties, when usage was added', () => {
    const { detail } = setup();
    paste(json([{ component: 'Card', file: 'Card.tsx', tokens: { background: 'color/surface/base', 'border-color': 'color/surface/base' } }]), 'usage.json');
    fireEvent.click(row('surface/base'));
    const used = detail().getByText('Used in components').parentElement as HTMLElement;
    expect(within(used).getByText('Card')).toBeTruthy();
    expect(used.textContent).toContain('background');
    expect(used.textContent).toContain('border-color');
  });

  it('says there is no usage data when none was added, and when nothing uses the token', () => {
    const { detail } = setup();
    fireEvent.click(row('white'));
    expect(detail().getByText('No usage data was added.')).toBeTruthy();
    paste(json([{ component: 'Card', token: 'color/surface/base' }]), 'usage.json');
    fireEvent.click(row('space/4'));
    expect(detail().getByText('No component uses it.')).toBeTruthy();
  });

  it('lists its findings, and what is wrong with a broken alias, with the missing name openable', () => {
    const { detail } = setup();
    fireEvent.click(row('broken'));
    expect(detail().getByText(/References/).textContent).toContain('which is not defined');
    expect(detail().getAllByText(/broken-ref/).length).toBeGreaterThan(0);
    fireEvent.click(detail().getByRole('button', { name: /color-nope/ }));
    expect(detail().getByRole('heading', { name: 'color-nope' })).toBeTruthy();
    expect(detail().getByText(/No token has this name/)).toBeTruthy();
    expect(within(detail().getByText('Used by tokens').nextElementSibling as HTMLElement).getByRole('button', { name: /broken/ })).toBeTruthy();
  });

  it('says which source a token came from', () => {
    const { detail } = setup();
    fireEvent.click(row('white'));
    expect(detail().getByText('light.json')).toBeTruthy();
  });

  it('forgets a selection whose source was removed', () => {
    const { detail } = setup();
    // white is only in light.json; surface/base is also in dark.json, so it would survive the removal
    fireEvent.click(row('white'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove light.json' }));
    expect(detail().getByText(/Select a token/)).toBeTruthy();
  });
});

describe('opening a token from the audit', () => {
  it('shows it in the panel without leaving the audit', () => {
    render(<App />);
    paste(json(LIGHT), 'light.json');
    fireEvent.click(screen.getByRole('button', { name: 'color/broken' }));
    expect(screen.getByRole('region', { name: 'Audit' })).toBeTruthy();
    expect(within(screen.getByRole('complementary', { name: 'Token details' })).getByRole('heading', { name: 'color/broken' })).toBeTruthy();
  });

  it('shows a finding that is not about a token as plain text, not a button', () => {
    render(<App />);
    paste(json(LIGHT), 'light.json');
    paste(json([{ component: 'Card', token: 'color/ghost' }]), 'usage.json');
    expect(screen.queryByRole('button', { name: 'Card' })).toBeNull();
    expect(screen.getByText('Card')).toBeTruthy();
  });
});

describe('the sources list', () => {
  it('is closed when every source loaded cleanly, and open when one needs a look', () => {
    render(<App />);
    paste(json(LIGHT), 'light.json');
    expect((document.querySelector('details.sourcebox') as HTMLDetailsElement).open).toBe(false);
    paste('hello', 'notes.txt');
    expect((document.querySelector('details.sourcebox') as HTMLDetailsElement).open).toBe(true);
    expect(screen.getByText('1 to check')).toBeTruthy();
  });
});
