import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { loadSources } from '../src/lib/sources';
import type { SourceEntry } from '../src/lib/sources';
import { rootName, toFileLike } from '../src/lib/scan';

function repoFile(path: string, text: string): File {
  const f = new File([text], path.split('/').pop() ?? path);
  Object.defineProperty(f, 'webkitRelativePath', { value: path });
  return f;
}

const TOKENS = ':root { --color-brand: #2563eb; --color-fg: #111111; --space-4: 16px; --space-2: 8px; --radius: 4px; --a: 1; --b: 2; --c: 3; }';
const REPO = [
  repoFile('app/src/tokens.css', TOKENS),
  repoFile('app/src/Button.css', '.b { background: var(--color-brand); padding: 16px; color: #2563EB; margin: 7px }'),
  repoFile('app/src/Card.tsx', "export const s = { color: 'var(--color-fg)' };"),
  repoFile('app/node_modules/x/y.css', ':root { --junk: 1px }'),
];

describe('toFileLike and rootName', () => {
  it('drops the folder name from the path', () => {
    expect(toFileLike(repoFile('app/src/a.css', 'x')).path).toBe('src/a.css');
    expect(rootName([repoFile('app/src/a.css', 'x')])).toBe('app');
  });
  it('keeps a plain file name', () => {
    expect(toFileLike(new File(['x'], 'a.css')).path).toBe('a.css');
    expect(rootName([new File(['x'], 'a.css')])).toBe('folder');
  });
});

describe('loadSources with a scan entry', () => {
  const entry = (usage: number): SourceEntry => ({
    id: 1, set: 'base', name: 'Scan of app', text: '',
    scan: {
      usage: Array.from({ length: usage }, () => ({ component: 'C', file: 'c.css', prop: 'color', token: 'a' })),
      literals: [{ component: 'C', file: 'c.css', prop: 'color', value: '#fff', kind: 'color' }],
      summary: { defFiles: 1, defValues: 1, scanned: 2, filesWithUsage: 1, usages: usage },
    },
  });
  it('adds its usage and raw values to the dataset', () => {
    const { ds, sources } = loadSources([entry(2)], { stripSets: false });
    expect(ds.usage).toHaveLength(2);
    expect(ds.literals).toHaveLength(1);
    expect(sources[0]).toMatchObject({ kind: 'scan', count: 2, warnings: [], error: null });
  });
  it('warns when no use of a token was found', () => {
    expect(loadSources([entry(0)], { stripSets: false }).sources[0]?.warnings).toEqual(['No use of any token was found in the scanned code. Is it the right folder?']);
  });
});

describe('scanning a folder in the app', () => {
  async function scan() {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Choose a folder to scan'), { target: { files: REPO } });
    await screen.findByText(/Choose which files define tokens/);
  }

  it('offers the token files, leaves out node_modules, and pre-ticks the likely ones', async () => {
    await scan();
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes).toHaveLength(1);
    expect(boxes[0]?.checked).toBe(true);
    expect(screen.getByText('src/tokens.css')).toBeTruthy();
    expect(screen.getByText(/3 of 4 files in scope/)).toBeTruthy();
  });

  it('loads the token file and its usage, and shows the hardcoded values in the audit', async () => {
    await scan();
    fireEvent.click(screen.getByRole('button', { name: 'Scan usage and load' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /Audit/ })).toBeTruthy());
    const sources = within(screen.getByRole('region', { name: 'Sources' }));
    fireEvent.click(screen.getByText('Sources'));
    expect(sources.getByText('src/tokens.css')).toBeTruthy();
    expect(sources.getByText('Scan of app')).toBeTruthy();
    expect(sources.getByText(/1 token file read, 2 code files scanned, 2 files using tokens, 3 raw values\./)).toBeTruthy();
    const audit = screen.getByRole('tabpanel').textContent ?? '';
    expect(audit).toContain('hardcoded-value');
    expect(audit).toContain('color: #2563EB is the value of --color-brand');
    expect(audit).toContain('padding: 16px is the value of --space-4');
    expect(audit).not.toContain('7px');
  });

  it('scans only the files that stay ticked', async () => {
    await scan();
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Scan usage and load' }));
    await screen.findByText(/None of these sources contained tokens/);
  });

  it('says so when a folder has no token files', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Choose a folder to scan'), { target: { files: [repoFile('app/a.ts', 'export {}')] } });
    expect(await screen.findByText(/No token files found/)).toBeTruthy();
  });
});
