import { afterEach, describe, expect, it } from 'vitest';
import { run } from '../src/run.js';
import type { Report } from '../src/report.js';
import { capture, tempProject, tokens } from './helpers.js';

let cleanups: (() => void)[] = [];
afterEach(() => { for (const c of cleanups) c(); cleanups = []; });
const project = (files: Record<string, string>): string => {
  const p = tempProject(files);
  cleanups.push(p.cleanup);
  return p.dir;
};
const call = async (cwd: string, ...argv: string[]) => {
  const c = capture(cwd);
  const code = await run(argv, c.env);
  return { code, out: c.out(), err: c.err() };
};
const json = async (cwd: string, ...argv: string[]): Promise<{ code: number; report: Report; err: string }> => {
  const r = await call(cwd, ...argv, '--format', 'json');
  return { code: r.code, report: JSON.parse(r.out) as Report, err: r.err };
};

const color = (v: string) => ({ $type: 'color', $value: v, $description: 'x' });
const ref = (r: string) => ({ $ref: r });
// The dark theme is called night.json on purpose: read on its own it would be taken for a light file.
const files = {
  'systemma.config.json': JSON.stringify({ profile: 'tiered', rules: { 'desc-missing': 'off' } }),
  'design/tokens.resolver.json': JSON.stringify({
    version: '2025.10',
    sets: { foundation: { sources: [ref('base.json')] } },
    modifiers: { theme: { contexts: { light: [ref('themes/day.json')], dark: [ref('themes/night.json')] }, default: 'light' } },
    resolutionOrder: [ref('#/sets/foundation'), ref('#/modifiers/theme')],
  }),
  'design/base.json': tokens({ color: { white: color('#ffffff'), ink: color('#111111'), mute: color('#1a1a1a') } }),
  'design/themes/day.json': tokens({ color: { surface: { base: color('{color.white}') }, fg: { muted: color('{color.ink}') } } }),
  'design/themes/night.json': tokens({ color: { surface: { base: color('{color.ink}') }, fg: { muted: color('{color.mute}') } } }),
};

describe('a resolver file', () => {
  it('loads the files it references, with the theme modifier as light and dark', async () => {
    const { code, report, err } = await json(project(files), 'check', 'design');
    expect(err).toBe('');
    expect(code).toBe(1);
    // Four files: the resolver and the three it references. Read again on its own, night.json would be taken for a
    // light file and overwrite the light values.
    expect(report.summary).toMatchObject({ files: 4, tokens: 5 });
    // fg/muted is nearly the surface color in the dark theme only.
    const contrast = report.findings.filter((f) => f.rule === 'contrast');
    expect(contrast.map((f) => f.message)).toEqual([expect.stringMatching(/\(dark\)$/)]);
  });

  it('can be named outright, and the files it uses are not counted twice', async () => {
    const { report } = await json(project(files), 'check', 'design/tokens.resolver.json');
    expect(report.summary).toMatchObject({ files: 4, tokens: 5 });
  });

  it('groups findings under the file a token came from', async () => {
    const { report } = await json(project(files), 'check', 'design');
    expect(report.findings.filter((f) => f.rule === 'contrast')[0]?.source).toBe('design/themes/day.json');
  });

  it('is an error when named outright and invalid', async () => {
    const dir = project({ ...files, 'design/tokens.resolver.json': JSON.stringify({ version: '1', resolutionOrder: [] }) });
    const r = await call(dir, 'check', 'design/tokens.resolver.json');
    expect(r.code).toBe(2);
    expect(r.err).toContain('design/tokens.resolver.json: version must be "2025.10"');
    expect(r.err).toContain('resolutionOrder must be a non-empty array.');
  });

  it('is skipped with a warning when found in a directory and invalid', async () => {
    const dir = project({ ...files, 'design/tokens.resolver.json': JSON.stringify({ version: '1', resolutionOrder: [] }) });
    const { code, report } = await json(dir, 'check', 'design');
    expect(code).not.toBe(2);
    expect(report.inputWarnings.some((w) => /version must be "2025.10".*Skipped\./.test(w))).toBe(true);
  });

  it('names every file it cannot read', async () => {
    const dir = project({ 'design/tokens.resolver.json': files['design/tokens.resolver.json']! });
    const r = await call(dir, 'check', 'design/tokens.resolver.json');
    expect(r.code).toBe(2);
    expect(r.err).toContain('cannot read base.json');
    expect(r.err).toContain('cannot read themes/day.json');
    expect(r.err).toContain('cannot read themes/night.json');
  });

  it('refuses a remote reference', async () => {
    const doc = { version: '2025.10', resolutionOrder: [{ type: 'set', name: 's', sources: [ref('https://example.com/t.json')] }] };
    const r = await call(project({ 'a.resolver.json': JSON.stringify(doc) }), 'check', 'a.resolver.json');
    expect(r.code).toBe(2);
    expect(r.err).toContain('only local files are read');
  });

  it('warns about a modifier it could not apply, and says which file', async () => {
    const doc = JSON.parse(files['design/tokens.resolver.json']) as Record<string, unknown>;
    (doc['modifiers'] as Record<string, unknown>)['density'] = { contexts: { a: [], b: [] } };
    (doc['resolutionOrder'] as unknown[]).push(ref('#/modifiers/density'));
    const { report } = await json(project({ ...files, 'design/tokens.resolver.json': JSON.stringify(doc) }), 'check', 'design');
    expect(report.inputWarnings).toEqual(['design/tokens.resolver.json: modifier density has no default, so none of its contexts (a, b) were read.']);
  });
});
