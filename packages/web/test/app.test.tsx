import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App, initialState, reducer } from '../src/App';
import type { State } from '../src/App';

const tokens = (v: unknown): string => JSON.stringify(v);
const color = (v: string, extra: object = {}) => ({ $type: 'color', $value: v, ...extra });

function paste(text: string, name?: string): void {
  fireEvent.change(screen.getByPlaceholderText(/"\$value"/), { target: { value: text } });
  if (name !== undefined) fireEvent.change(screen.getByLabelText('Name for the pasted text'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Add pasted text' }));
}
const loadExample = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Load an example' })); };
const groupTitles = (): string[] => Array.from(document.querySelectorAll('details.rule .rt')).map((e) => e.textContent ?? '');

describe('the empty app', () => {
  it('invites you to add tokens and shows nothing else', () => {
    render(<App />);
    expect(screen.getByText('No tokens yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Audit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
    expect((document.querySelector('details.importer') as HTMLDetailsElement).open).toBe(true);
  });

  it('keeps "Add pasted text" off until there is text', () => {
    render(<App />);
    const button = screen.getByRole('button', { name: 'Add pasted text' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/"\$value"/), { target: { value: '{}' } });
    expect(button.disabled).toBe(false);
  });
});

describe('the example', () => {
  it('fills in the sources, the tier bar and an audit with errors first', () => {
    render(<App />);
    loadExample();
    expect(screen.getByText('30 tokens from 4 sources')).toBeTruthy();
    expect(screen.getAllByRole('listitem').some((li) => li.textContent?.includes('example/usage.json'))).toBe(true);
    expect(screen.getByRole('img', { name: /18 foundation, 7 common, 5 palette/ })).toBeTruthy();
    expect(groupTitles().slice(0, 3)).toEqual(['Broken alias', 'Undefined token in use', 'Low-contrast pair']);
    expect(screen.getByText('3 errors')).toBeTruthy();
  });

  it('collapses the add-tokens panel once there are sources', () => {
    render(<App />);
    loadExample();
    expect((document.querySelector('details.importer') as HTMLDetailsElement).open).toBe(false);
  });

  it('links each rule to its source and says how sure the source makes us', () => {
    render(<App />);
    loadExample();
    const link = screen.getByRole('link', { name: /WCAG 2\.2 SC 1\.4\.3/ }) as HTMLAnchorElement;
    expect(link.href).toBe('https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html');
    expect(link.rel).toContain('noopener');
    expect(screen.getAllByText(/confidence low/).length).toBeGreaterThan(0);
  });
});

describe('adding and removing sources', () => {
  it('adds pasted text as a source, recognizes it and audits it', () => {
    render(<App />);
    paste(tokens({ c: { a: color('{missing}', { $description: 'Page background' }) } }), 'mine.json');
    const sources = within(screen.getByRole('region', { name: 'Sources' }));
    expect(sources.getByText('mine.json')).toBeTruthy();
    expect(sources.getByText('DTCG / Tokens Studio JSON')).toBeTruthy();
    expect(screen.getByText('1 token from 1 source')).toBeTruthy();
    expect(groupTitles()).toContain('Broken alias');
  });

  it('empties the paste box after adding', () => {
    render(<App />);
    paste('{}');
    expect((screen.getByPlaceholderText(/"\$value"/) as HTMLTextAreaElement).value).toBe('');
  });

  it('shows text that is not tokens as an error on its source, and stays usable', () => {
    render(<App />);
    paste('hello world', 'notes.txt');
    expect(screen.getByRole('alert').textContent).toMatch(/Unrecognized format/);
    expect(screen.getByText('None of these sources contained tokens.')).toBeTruthy();
    paste(tokens({ c: color('#fff') }), 'ok.json');
    expect(screen.getByText('1 token from 2 sources')).toBeTruthy();
  });

  it('removes a source and re-runs the audit', () => {
    render(<App />);
    loadExample();
    fireEvent.click(screen.getByRole('button', { name: 'Remove example/usage.json' }));
    expect(groupTitles()).not.toContain('Undefined token in use');
    expect(screen.getByText('30 tokens from 3 sources')).toBeTruthy();
  });

  it('clears everything', () => {
    render(<App />);
    loadExample();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByText('No tokens yet')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Audit' })).toBeNull();
  });

  it('adds chosen files, reading them, and keeps one it cannot read as an error', async () => {
    render(<App />);
    const input = screen.getByLabelText('Choose token files') as HTMLInputElement;
    const good = new File([tokens({ c: color('#fff') })], 'chosen.json', { type: 'application/json' });
    const unreadable = new File(['x'], 'broken.json');
    Object.defineProperty(unreadable, 'text', { value: () => Promise.reject(new Error('denied')) });
    fireEvent.change(input, { target: { files: [good, unreadable] } });
    await waitFor(() => expect(screen.getByText('chosen.json')).toBeTruthy());
    expect(screen.getByText('broken.json')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Could not read this file (denied).');
    expect(screen.getByText('1 token from 2 sources')).toBeTruthy();
  });

  it('adds dropped files', async () => {
    render(<App />);
    const zone = document.querySelector('.drop') as HTMLElement;
    const file = new File([':root { --space-4: 4px; }'], 'dropped.css');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByText('dropped.css')).toBeTruthy());
    expect(screen.getByText('CSS custom properties')).toBeTruthy();
  });
});

describe('modes', () => {
  it('reads a JSON file as dark when its name says so, and lets you change that', () => {
    render(<App />);
    paste(tokens({ c: color('#fff') }), 'colors.json');
    paste(tokens({ c: color('#000') }), 'dark-colors.json');
    const selects = screen.getAllByLabelText('Read as') as HTMLSelectElement[];
    expect(selects.map((s) => s.value)).toEqual(['auto', 'auto']);
    fireEvent.change(selects[1] as HTMLSelectElement, { target: { value: 'light' } });
    expect((screen.getAllByLabelText('Read as')[1] as HTMLSelectElement).value).toBe('light');
    fireEvent.change(screen.getAllByLabelText('Read as')[1] as HTMLSelectElement, { target: { value: 'auto' } });
    expect((screen.getAllByLabelText('Read as')[1] as HTMLSelectElement).value).toBe('auto');
  });

  it('offers the mode only for DTCG files', () => {
    render(<App />);
    paste(':root { --a: 1px; }', 'a.css');
    expect(screen.queryByLabelText('Read as')).toBeNull();
  });
});

describe('the audit controls', () => {
  it('filters by severity', () => {
    render(<App />);
    loadExample();
    fireEvent.click(screen.getByRole('button', { name: 'error' }));
    expect(groupTitles()).toEqual(['Broken alias', 'Undefined token in use', 'Low-contrast pair']);
    expect(screen.getByRole('button', { name: 'error' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(groupTitles().length).toBeGreaterThan(3);
  });

  it('filters by text, and says when nothing matches', () => {
    render(<App />);
    loadExample();
    fireEvent.change(screen.getByLabelText('Filter findings'), { target: { value: 'color-fg-missing' } });
    expect(groupTitles()).toEqual(['Undefined token in use']);
    fireEvent.change(screen.getByLabelText('Filter findings'), { target: { value: 'zzzz-nothing' } });
    expect(screen.getByText('No findings match that filter.')).toBeTruthy();
  });

  it('opens the groups when filtering, so what matched is visible', () => {
    render(<App />);
    loadExample();
    fireEvent.change(screen.getByLabelText('Filter findings'), { target: { value: 'state' } });
    const groups = Array.from(document.querySelectorAll('details.rule')) as HTMLDetailsElement[];
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g) => g.open)).toBe(true);
  });

  it('says so when there are no findings', () => {
    render(<App />);
    paste(tokens({ c: { white: color('#ffffff'), black: color('#000000') } }));
    expect(screen.getByText(/No findings\./)).toBeTruthy();
  });

  it('lists the rulesets, with how many are running, and lets you switch one off', () => {
    render(<App />);
    loadExample();
    expect(screen.getByText('7 of 9 running')).toBeTruthy();
    expect(groupTitles()).toContain('Low-contrast pair');
    const wcag = screen.getByRole('checkbox', { name: /WCAG 2\.2 AA(?!A)/ });
    fireEvent.click(wcag);
    expect(screen.getByText('6 of 9 running')).toBeTruthy();
    expect(groupTitles()).not.toContain('Low-contrast pair');
    fireEvent.click(screen.getByRole('checkbox', { name: /WCAG 2\.2 AA(?!A)/ }));
    expect(groupTitles()).toContain('Low-contrast pair');
  });

  it('can switch on a ruleset that is off by default', () => {
    render(<App />);
    loadExample();
    fireEvent.click(screen.getByRole('checkbox', { name: /Material 3 naming/ }));
    expect(screen.getByText('8 of 9 running')).toBeTruthy();
  });

  it('says when a ruleset that is switched on does not apply to the data', () => {
    render(<App />);
    paste(tokens({ c: { a: color('#fff') } }));
    const tiered = screen.getByRole('checkbox', { name: /Tiered naming conventions/ });
    expect(within(tiered.closest('li') as HTMLElement).getByText('does not apply to this data')).toBeTruthy();
  });
});

describe('settings', () => {
  it('lets the grouping change, and the tiers with it', () => {
    render(<App />);
    loadExample();
    expect(screen.getByRole('img', { name: /18 foundation, 7 common, 5 palette/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('How tokens are grouped'), { target: { value: 'generic' } });
    expect(screen.queryByRole('img', { name: /18 foundation, 7 common, 5 palette/ })).toBeNull();
  });

  it('only shows settings once there is something to apply them to', () => {
    render(<App />);
    expect(screen.queryByText('Settings')).toBeNull();
    loadExample();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('drops Tokens Studio set names when asked', () => {
    render(<App />);
    paste(tokens({ global: { color: { p: { value: '#fff', type: 'color' } } } }), 'ts.json');
    fireEvent.click(screen.getByRole('checkbox', { name: /drop the top-level set names/ }));
    fireEvent.change(screen.getByLabelText('Filter findings'), { target: { value: 'color/p' } });
    expect(screen.getByText('1 token from 1 source')).toBeTruthy();
  });
});

describe('long lists', () => {
  it('shows fifty findings of a rule and the rest on request', () => {
    render(<App />);
    const many = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`t${i}`, { $value: '#123456' }]));
    paste(tokens(many));
    fireEvent.click(screen.getAllByText('No explicit type')[0] as HTMLElement);
    const group = document.querySelector('details.rule') as HTMLElement;
    expect(group.querySelectorAll('.finds li')).toHaveLength(50);
    fireEvent.click(within(group).getByRole('button', { name: 'Show 50 more' }));
    expect(group.querySelectorAll('.finds li')).toHaveLength(100);
    fireEvent.click(within(group).getByRole('button', { name: 'Show 20 more' }));
    expect(group.querySelectorAll('.finds li')).toHaveLength(120);
    expect(within(group).queryByRole('button', { name: /Show/ })).toBeNull();
  });
});

describe('reducer', () => {
  const add = (state: State, names: string[]): State => reducer(state, { type: 'add', items: names.map((name) => ({ name, text: '{}' })) });

  it('gives each source a new id, even after removals', () => {
    let s = add(initialState, ['a', 'b']);
    expect(s.entries.map((e) => e.id)).toEqual([1, 2]);
    s = reducer(s, { type: 'remove', id: 2 });
    s = add(s, ['c']);
    expect(s.entries.map((e) => [e.id, e.name])).toEqual([[1, 'a'], [3, 'c']]);
  });

  it('sets and clears a mode on one source only', () => {
    let s = add(initialState, ['a', 'b']);
    s = reducer(s, { type: 'mode', id: 1, mode: 'dark' });
    expect(s.entries.map((e) => e.mode)).toEqual(['dark', undefined]);
    s = reducer(s, { type: 'mode', id: 1, mode: undefined });
    expect('mode' in (s.entries[0] ?? {})).toBe(false);
  });

  it('starts a ruleset choice from the defaults, and keeps the original state untouched', () => {
    const s = reducer(initialState, { type: 'ruleset', id: 'm3', on: true });
    expect(initialState.enabled).toBeNull();
    expect(s.enabled?.has('m3')).toBe(true);
    expect(s.enabled?.has('integrity')).toBe(true);
    expect(s.enabled?.has('wcag-aaa')).toBe(false);
    expect(reducer(s, { type: 'ruleset', id: 'integrity', on: false }).enabled?.has('integrity')).toBe(false);
  });

  it('clears the sources but keeps the settings', () => {
    let s = reducer(initialState, { type: 'profile', profile: 'generic' });
    s = add(s, ['a']);
    s = reducer(s, { type: 'clear' });
    expect(s.entries).toEqual([]);
    expect(s.profile).toBe('generic');
  });
});
