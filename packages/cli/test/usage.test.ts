import { afterEach, describe, expect, it } from 'vitest';
import { run } from '../src/run.js';
import type { Report } from '../src/report.js';
import { capture, fixtureDir, tempProject, tokens } from './helpers.js';

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
const rules = (r: Report, rule: string): string[] => r.findings.filter((f) => f.rule === rule).map((f) => `${f.subject}: ${f.message}`);

const tokenFiles = {
  'tokens/colors.json': tokens({ color: { $type: 'color', base: { $value: '#ffffff', $description: 'x' }, alias: { $value: '{color.base}', $description: 'x' } } }),
  'tokens/space.css': ':root { --space-4: 4px; --gap: var(--space-4); }',
};

describe('--usage', () => {
  it('finds where tokens are used in code, and so what is unused', async () => {
    const dir = project({
      ...tokenFiles,
      'src/components/Button/Button.module.css': '.b { background: var(--color-base); padding: var(--space-4); }',
    });
    const { report } = await json(dir, 'check', 'tokens', '--usage', 'src');
    expect(report.summary.usages).toBe(2);
    expect(rules(report, 'unused')).toEqual(['color/alias: not referenced by usage data or other tokens', '--gap: not referenced by usage data or other tokens']);
  });

  it('does not count a token file as usage of its own aliases', async () => {
    const dir = project(tokenFiles);
    const { report } = await json(dir, 'check', 'tokens', '--usage', '.');
    expect(report.summary.usages).toBe(0);
  });

  it('keeps the token files out of the scan only when they were loaded', async () => {
    const dir = project({ ...tokenFiles, 'other.css': '.x { padding: var(--space-4); }' });
    const { report } = await json(dir, 'check', 'tokens/colors.json', '--usage', '.');
    // tokens/space.css was not loaded, so --space-4 is not a known token and its use is not recorded
    expect(report.summary.usages).toBe(0);
  });

  it('records a token-shaped name that nothing declares as a broken use, but not a local custom property', async () => {
    const dir = project({
      ...tokenFiles,
      'src/a.css': '.a { --local-pad: 2px; padding: var(--local-pad); color: var(--color-gone); margin: var(--space-4); }',
    });
    const { report } = await json(dir, 'check', 'tokens', '--usage', 'src');
    expect(rules(report, 'broken-usage')).toEqual(["src/a: uses color-gone (color), which isn't defined"]);
  });

  it('records quoted token paths in script files, and ignores test and spec files', async () => {
    const dir = project({
      ...tokenFiles,
      'src/Page.tsx': "export const g = 'space.4';",
      'src/Page.test.tsx': "export const g = 'color.base';",
      'src/Page.spec.ts': "export const g = 'color.alias';",
    });
    const { report } = await json(dir, 'check', 'tokens', '--usage', 'src');
    expect(report.summary.usages).toBe(1);
  });

  it('skips node_modules and build output inside the scanned directory', async () => {
    const dir = project({
      ...tokenFiles,
      'src/a.css': '.a { padding: var(--space-4); }',
      'src/node_modules/lib/b.css': '.b { padding: var(--space-4); color: var(--color-base); }',
      'src/dist/c.css': '.c { color: var(--color-base); }',
    });
    expect((await json(dir, 'check', 'tokens', '--usage', 'src')).report.summary.usages).toBe(1);
  });

  it('adds to usage that came from a usage JSON file instead of replacing it', async () => {
    const dir = project({
      ...tokenFiles,
      'usage.json': tokens([{ component: 'FromJson', token: 'color/base', prop: 'background' }]),
      'src/a.css': '.a { padding: var(--space-4); }',
    });
    const { report } = await json(dir, 'check', 'tokens', 'usage.json', '--usage', 'src');
    expect(report.summary.usages).toBe(2);
    expect(rules(report, 'unused').join('|')).not.toContain('color/base');
  });

  it('takes a file as well as a directory, and several inputs', async () => {
    const dir = project({ ...tokenFiles, 'one/a.css': '.a { padding: var(--space-4); }', 'two/b.css': '.b { color: var(--color-base); }', 'three/c.css': '.c { color: var(--color-alias); }' });
    const r = await json(dir, 'check', 'tokens', '--usage', 'one', '--usage', 'two/b.css');
    expect(r.report.summary.usages).toBe(2);
  });

  it('uses component names and files relative to where it was run', async () => {
    const dir = project({ ...tokenFiles, 'src/components/Card/Card.module.css': '.c { padding: var(--space-4); }' });
    const { report } = await json(dir, 'check', 'tokens', '--usage', 'src');
    expect(report.summary.usages).toBe(1);
  });

  it('warns when no use of any token is found, in text and in JSON', async () => {
    const dir = project({ ...tokenFiles, 'src/a.css': '.a { color: red; }' });
    const text = await call(dir, 'check', 'tokens', '--usage', 'src');
    expect(text.err).toBe('warning: usage: no use of any token was found in src. Is that the right place?\n');
    const j = await json(dir, 'check', 'tokens', '--usage', 'src');
    expect(j.report.inputWarnings).toEqual(['usage: no use of any token was found in src. Is that the right place?']);
    expect(j.err).toBe('');
  });

  it('does not warn when usage came from elsewhere or when something was found', async () => {
    const dir = project({ ...tokenFiles, 'src/a.css': '.a { padding: var(--space-4); }' });
    expect((await json(dir, 'check', 'tokens', '--usage', 'src')).report.inputWarnings).toEqual([]);
  });

  it('is an error for a path that does not exist', async () => {
    const dir = project(tokenFiles);
    const r = await call(dir, 'check', 'tokens', '--usage', 'nope', '--usage', 'gone');
    expect(r.code).toBe(2);
    expect(r.err).toBe('systemma: usage nope: no such file or directory.\nsystemma: usage gone: no such file or directory.\n');
  });

  it('reports no usage at all when the option is not given', async () => {
    const dir = project({ ...tokenFiles, 'src/a.css': '.a { padding: var(--space-4); }' });
    expect((await json(dir, 'check', 'tokens')).report.summary.usages).toBe(0);
  });
});

describe('"usage" in the config file', () => {
  const files = { ...tokenFiles, 'src/a.css': '.a { padding: var(--space-4); }', 'lib/b.css': '.b { color: var(--color-base); }' };

  it('is scanned, relative to the config file', async () => {
    const dir = project({ ...files, 'cfg/systemma.config.json': JSON.stringify({ sources: ['../tokens'], usage: ['../src'] }) });
    const { report } = await json(dir, 'check', '--config', 'cfg/systemma.config.json');
    expect(report.summary.usages).toBe(1);
  });

  it('is replaced by --usage, as paths replace sources', async () => {
    const dir = project({ ...files, 'systemma.config.json': JSON.stringify({ sources: ['tokens'], usage: ['src'] }) });
    expect((await json(dir, 'check')).report.summary.usages).toBe(1);
    expect((await json(dir, 'check', '--usage', 'lib')).report.summary.usages).toBe(1);
    expect(rules((await json(dir, 'check', '--usage', 'lib')).report, 'unused').join('|')).not.toContain('color/base');
  });

  it('must be a list', async () => {
    const dir = project({ ...files, 'systemma.config.json': JSON.stringify({ sources: ['tokens'], usage: 'src' }) });
    const r = await call(dir, 'check');
    expect(r).toMatchObject({ code: 2, err: 'systemma: config usage: expected a list of directories or files to scan.\n' });
  });
});

describe('cli-usage fixture', () => {
  it('gives the text report in the golden file', async () => {
    const r = await call(fixtureDir('cli-usage'), 'check');
    expect(r.code).toBe(1);
    expect(r.err).toBe('');
    await expect(r.out).toMatchFileSnapshot(`${fixtureDir('cli-usage')}/expected.txt`);
  });

  it('gives the JSON report in the golden file', async () => {
    const r = await call(fixtureDir('cli-usage'), 'check', '--format', 'json');
    expect(r.code).toBe(1);
    await expect(r.out).toMatchFileSnapshot(`${fixtureDir('cli-usage')}/expected.json`);
  });

  it('shows the rules that need usage data, which stay quiet without it', async () => {
    const withUsage = (await json(fixtureDir('cli-usage'), 'check')).report;
    // From inside tokens/ there is no config file, so no usage is scanned.
    const without = (await json(`${fixtureDir('cli-usage')}/tokens`, 'check', '.')).report;
    for (const rule of ['broken-usage', 'usage-role', 'contrast-focus']) {
      expect(rules(withUsage, rule).length).toBeGreaterThan(0);
      expect(rules(without, rule)).toEqual([]);
    }
  });
});

describe('hardcoded values', () => {
  const files = {
    ...tokenFiles,
    'src/Card.module.css': '.card { background: #FFFFFF; padding: 4px; margin: 7px; color: var(--color-base, #fff); --local: #ffffff; }',
  };

  // The alias is suggested before the foundation token it points at, since code should use the semantic name.
  it('reports a raw value that a token holds, and only with --usage', async () => {
    const dir = project(files);
    const found = rules((await json(dir, 'check', 'tokens', '--usage', 'src')).report, 'hardcoded-value');
    expect(found).toEqual([
      'src/Card: background: #FFFFFF is the value of color/alias (and 1 more)',
      'src/Card: padding: 4px is the value of --gap (and 1 more)',
    ]);
    expect(rules((await json(dir, 'check', 'tokens')).report, 'hardcoded-value')).toEqual([]);
  });

  it('is a warning, so it fails a run only with --fail-on warn', async () => {
    const dir = project(files);
    expect((await call(dir, 'check', 'tokens', '--usage', 'src')).code).toBe(0);
    expect((await call(dir, 'check', 'tokens', '--usage', 'src', '--fail-on', 'warn')).code).toBe(1);
  });
});
