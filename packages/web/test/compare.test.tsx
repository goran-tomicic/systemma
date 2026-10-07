import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createDataset, parseTokensJson } from '@systemma/core';
import type { DiffChange } from '@systemma/core';
import { App, initialState, reducer } from '../src/App';
import { filterChanges, labelOf } from '../src/lib/compare';
import { EXAMPLE_COMPARE_SOURCES, EXAMPLE_SOURCES } from '../src/lib/example';

const json = (v: unknown): string => JSON.stringify(v);
const color = (v: string) => ({ $type: 'color', $value: v });

const BASE = { c: { a: color('#111111'), b: color('#222222'), gone: color('#333333'), same: color('#444444') }, size: { $type: 'dimension', m: { $value: '8px' } } };
const NEXT = { c: { a: color('#aaaaaa'), b: color('#222222'), fresh: color('#555555'), same: color('#444444') }, size: { $type: 'dimension', m: { $value: '12px' } } };
const NEXT_DARK = { c: { a: color('#bbbbbb') } };

function paste(text: string, name: string): void {
  fireEvent.change(screen.getByPlaceholderText(/"\$value"/), { target: { value: text } });
  fireEvent.change(screen.getByLabelText('Name for the pasted text'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Add pasted text' }));
}
function setup() {
  render(<App />);
  paste(json(BASE), 'base.json');
  fireEvent.click(screen.getByLabelText('Compare against'));
  paste(json(NEXT), 'next.json');
  paste(json(NEXT_DARK), 'next.dark.json');
  return { compare: () => within(screen.getByRole('region', { name: 'Compare' })) };
}
const compareSection = (): HTMLElement => screen.getByRole('region', { name: 'Compare' });
// What follows a heading: the chips under it, or the "None." that stands in for them.
const section = (heading: string): HTMLElement => (within(compareSection()).getByRole('heading', { name: heading }).nextElementSibling as HTMLElement);
const changeRows = (): string[] => Array.from(document.querySelectorAll('.row.change .rname')).map((e) => e.textContent ?? '');

describe('filterChanges', () => {
  const ds = createDataset();
  parseTokensJson(ds, { c: { Brand: color('#fff'), other: color('#000') } }, { mode: 'light' });
  const changes: DiffChange[] = [
    { id: 'c-brand', mode: 'light', a: '#fff', b: '#eee' },
    { id: 'c-brand', mode: 'dark', a: '#000', b: '#111' },
    { id: 'c-other', mode: 'light', a: '8px', b: '12px' },
  ];
  it('filters by mode', () => {
    expect(filterChanges(changes, ds, 'dark', '')).toHaveLength(1);
    expect(filterChanges(changes, ds, 'all', '')).toHaveLength(3);
  });
  it('filters by name or either value, ignoring case', () => {
    expect(filterChanges(changes, ds, 'all', 'BRAND')).toHaveLength(2);
    expect(filterChanges(changes, ds, 'all', '12px')).toHaveLength(1);
    expect(filterChanges(changes, ds, 'all', '#eee')).toHaveLength(1);
    expect(filterChanges(changes, ds, 'all', 'c/brand')).toHaveLength(2);
  });
  it('combines both and can match nothing', () => {
    expect(filterChanges(changes, ds, 'light', 'brand')).toHaveLength(1);
    expect(filterChanges(changes, ds, 'dark', '12px')).toEqual([]);
  });
  it('names a token by its authored label, or by its id when it is not there', () => {
    expect(labelOf(ds, 'c-brand')).toBe('c/Brand');
    expect(labelOf(ds, 'nope')).toBe('nope');
  });
});

describe('adding to the compare set', () => {
  it('offers both sets when adding tokens, and starts on the base', () => {
    render(<App />);
    expect((screen.getByLabelText('These tokens') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Compare against') as HTMLInputElement).checked).toBe(false);
  });

  it('puts sources in the set that was chosen, in separate lists', () => {
    setup();
    const base = within(screen.getByRole('region', { name: 'Sources' }));
    const other = within(screen.getByRole('region', { name: 'Compare sources' }));
    expect(base.getByText('base.json')).toBeTruthy();
    expect(base.queryByText('next.json')).toBeNull();
    expect(other.getByText('next.json')).toBeTruthy();
    expect(other.getByText('next.dark.json')).toBeTruthy();
  });

  it('shows the compare tab when something is added to compare', () => {
    setup();
    expect(screen.getByRole('tab', { name: /Compare/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the tokens being looked at apart from the ones compared against', () => {
    setup();
    expect(screen.getByText('5 tokens from 1 source')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Tokens/ }));
    expect(document.querySelectorAll('.row')).toHaveLength(5);
  });

  it('loads an example with a changed copy to compare against', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Load an example to compare' }));
    expect(screen.getByRole('region', { name: 'Compare sources' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Compare/ }).getAttribute('aria-selected')).toBe('true');
    expect(compareSection().textContent).toContain('value changes');
  });
});

describe('the compare tab', () => {
  it('explains itself when there is nothing to compare against, and offers to add some', () => {
    render(<App />);
    paste(json(BASE), 'base.json');
    fireEvent.click(screen.getByRole('tab', { name: /Compare/ }));
    expect(screen.getByText(/Compare two sets of tokens/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add tokens to compare against' }));
    expect((screen.getByLabelText('Compare against') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('details.importer') as HTMLDetailsElement).open).toBe(true);
  });

  it('counts the differences, and shows the count on the tab', () => {
    setup();
    expect(screen.getByText('1 only in base')).toBeTruthy();
    expect(screen.getByText('1 only in compare')).toBeTruthy();
    expect(screen.getByText('3 value changes')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Compare/ }).textContent).toBe('Compare5');
  });

  it('lists what is only in the base and what is only in the compare set', () => {
    setup();
    expect(within(section('Only in base')).getByText(/gone/)).toBeTruthy();
    expect(within(section('Only in compare')).getByText(/fresh/)).toBeTruthy();
  });

  it('opens a base-only token in the detail panel, but does not pretend to open a compare-only one', () => {
    setup();
    fireEvent.click(within(section('Only in base')).getByRole('button', { name: /gone/ }));
    expect(within(screen.getByRole('complementary', { name: 'Token details' })).getByRole('heading', { name: 'c/gone' })).toBeTruthy();
    expect(within(section('Only in compare')).queryByRole('button')).toBeNull();
    expect(section('Only in compare').querySelector('.chip')).toBeTruthy();
  });

  it('lists each changed value with both sides, per mode, through aliases', () => {
    setup();
    // c/b is the same in both sets, so it is not listed
    expect(changeRows()).toEqual(['c/a', 'c/a', 'size/m']);
    const first = document.querySelector('.row.change') as HTMLElement;
    expect(first.textContent).toContain('light: #111111 → #aaaaaa');
    const dark = Array.from(document.querySelectorAll('.row.change')).find((r) => r.textContent?.includes('dark:')) as HTMLElement;
    expect(dark.textContent).toContain('dark: — → #bbbbbb');
  });

  it('shows a picture of each side of a change, and hides them from assistive technology', () => {
    setup();
    const pair = document.querySelector('.row.change .pair') as HTMLElement;
    expect(pair.getAttribute('aria-hidden')).toBe('true');
    expect(pair.querySelectorAll('.sw')).toHaveLength(2);
  });

  it('filters the changes by mode and by text', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Dark only' }));
    expect(changeRows()).toEqual(['c/a']);
    fireEvent.click(screen.getByRole('button', { name: 'Light only' }));
    expect(changeRows()).toEqual(['c/a', 'size/m']);
    fireEvent.click(screen.getByRole('button', { name: 'Both modes' }));
    fireEvent.change(screen.getByLabelText('Filter changes'), { target: { value: 'size' } });
    expect(changeRows()).toEqual(['size/m']);
    fireEvent.change(screen.getByLabelText('Filter changes'), { target: { value: 'zzzz' } });
    expect(screen.getByText('No changes match that filter.')).toBeTruthy();
  });

  it('does not give two buttons the same name: the mode filter is not the mode toggle', () => {
    setup();
    const names = within(compareSection()).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names.filter((n) => n === 'Dark')).toHaveLength(1);
    expect(names.filter((n) => n === 'Light')).toHaveLength(1);
  });

  it('opens the token behind a change', () => {
    setup();
    fireEvent.click(document.querySelector('.row.change') as HTMLElement);
    expect(within(screen.getByRole('complementary', { name: 'Token details' })).getByRole('heading', { name: 'c/a' })).toBeTruthy();
  });

  it('says so when the two sets match', () => {
    render(<App />);
    paste(json(BASE), 'base.json');
    fireEvent.click(screen.getByLabelText('Compare against'));
    paste(json(BASE), 'same.json');
    expect(screen.getByText(/No differences\./)).toBeTruthy();
    expect(screen.getByText('0 only in base')).toBeTruthy();
    expect(screen.getAllByText('None.')).toHaveLength(3);
  });

  it('clears the compare set, and goes back to explaining itself', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Clear compare' }));
    expect(screen.queryByRole('region', { name: 'Compare sources' })).toBeNull();
    expect(screen.getByText(/Compare two sets of tokens/)).toBeTruthy();
    expect(screen.getByText('5 tokens from 1 source')).toBeTruthy();
  });

  it('removes one compare source and recompares', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Remove next.dark.json' }));
    expect(screen.getByText('2 value changes')).toBeTruthy();
  });

  it('clears both sets with Clear all', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.queryByRole('region', { name: 'Compare sources' })).toBeNull();
    expect(screen.getByText('No tokens yet')).toBeTruthy();
  });
});

describe('the compare example', () => {
  it('differs from the base in exactly the ways it says: a change, a drop and an addition', async () => {
    const { loadSources } = await import('../src/lib/sources');
    const { diff } = await import('@systemma/core');
    const entries = (list: { name: string; text: string }[], set: 'base' | 'compare') => list.map((s, i) => ({ id: i + 1, set, name: s.name, text: s.text }));
    const base = loadSources(entries(EXAMPLE_SOURCES, 'base'), { stripSets: false });
    const next = loadSources(entries(EXAMPLE_COMPARE_SOURCES, 'compare'), { stripSets: false });
    const d = diff(base.ds, next.ds);
    expect(d.onlyA).toEqual(['color-accent']);
    expect(d.onlyB.sort()).toEqual(['color-info-base', 'radius-lg']);
    expect(d.changed.map((c) => `${c.id}:${c.mode}`).sort()).toEqual(['color-fg-muted:light', 'color-palette-danger-solid:light', 'color-surface-base:dark', 'space-5:light']);
  });
});

describe('reducer, with two sets', () => {
  it('adds to the base unless told otherwise', () => {
    const s = reducer(initialState, { type: 'add', items: [{ name: 'a', text: '{}' }] });
    expect(s.entries[0]?.set).toBe('base');
    expect(reducer(s, { type: 'add', items: [{ name: 'b', text: '{}' }], target: 'compare' }).entries.map((e) => e.set)).toEqual(['base', 'compare']);
  });
  it('clears only the compare set, or everything', () => {
    let s = reducer(initialState, { type: 'add', items: [{ name: 'a', text: '{}' }] });
    s = reducer(s, { type: 'add', items: [{ name: 'b', text: '{}' }], target: 'compare' });
    expect(reducer(s, { type: 'clearCompare' }).entries.map((e) => e.name)).toEqual(['a']);
    expect(reducer(s, { type: 'clear' }).entries).toEqual([]);
  });
});
