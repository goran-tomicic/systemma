import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
const json = async (cwd: string, ...argv: string[]) => {
  const r = await call(cwd, ...argv, '--format', 'json');
  return { ...r, report: JSON.parse(r.out) as Report };
};
const color = (v: string, extra: object = {}) => ({ $type: 'color', $value: v, ...extra });
const described = { $description: 'Page background' };

// Two problems: a broken alias (an error) and an untyped token (a warning).
const twoProblems = tokens({ c: { a: color('{missing}', described) }, mystery: { $value: '#123456' } });

describe('--update-baseline', () => {
  it('records every finding and exits 0, even though the run would have failed', async () => {
    const dir = project({ 'a.json': twoProblems });
    expect((await call(dir, 'check', 'a.json')).code).toBe(1);
    const r = await call(dir, 'check', 'a.json', '--baseline', 'b.json', '--update-baseline');
    expect(r).toMatchObject({ code: 0, out: 'Baseline written: 2 findings to b.json.\n', err: '' });
    const file = JSON.parse(readFileSync(join(dir, 'b.json'), 'utf8')) as { version: number; findings: { rule: string }[] };
    expect(file.version).toBe(1);
    expect(file.findings.map((e) => e.rule)).toEqual(['broken-ref', 'dtcg-untyped']);
  });

  it('writes the baseline named in the config, relative to the config file', async () => {
    const dir = project({ 'cfg/systemma.config.json': JSON.stringify({ sources: ['../a.json'], baseline: 'b.json' }), 'a.json': twoProblems });
    const r = await call(dir, 'check', '--config', 'cfg/systemma.config.json', '--update-baseline');
    expect(r.out).toBe('Baseline written: 2 findings to cfg/b.json.\n');
    expect(() => readFileSync(join(dir, 'cfg/b.json'), 'utf8')).not.toThrow();
  });

  it('says "finding" for one', async () => {
    const dir = project({ 'a.json': tokens({ mystery: { $value: '#123456' } }) });
    expect((await call(dir, 'check', 'a.json', '--baseline', 'b.json', '--update-baseline')).out).toBe('Baseline written: 1 finding to b.json.\n');
  });

  it('writes an empty baseline for a clean project', async () => {
    const dir = project({ 'a.json': tokens({ c: { a: color('#fff', described) } }) });
    await call(dir, 'check', 'a.json', '--baseline', 'b.json', '--update-baseline');
    expect(JSON.parse(readFileSync(join(dir, 'b.json'), 'utf8'))).toEqual({ version: 1, findings: [] });
  });

  it('replaces what was there, so it also removes entries that no longer match', async () => {
    const dir = project({ 'a.json': twoProblems });
    await call(dir, 'check', 'a.json', '--baseline', 'b.json', '--update-baseline');
    await call(dir, 'check', 'a.json', '--baseline', 'b.json', '--update-baseline');
    const again = JSON.parse(readFileSync(join(dir, 'b.json'), 'utf8')) as { findings: unknown[] };
    expect(again.findings).toHaveLength(2);
  });

  it('is a usage error without a baseline file to write', async () => {
    const r = await call(project({ 'a.json': twoProblems }), 'check', 'a.json', '--update-baseline');
    expect(r.code).toBe(2);
    expect(r.err).toContain('--update-baseline needs a baseline file');
  });

  it('is an input error when the file cannot be written', async () => {
    const r = await call(project({ 'a.json': twoProblems }), 'check', 'a.json', '--baseline', 'nodir/b.json', '--update-baseline');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^systemma: baseline nodir\/b\.json: cannot be written/);
  });
});

describe('--baseline', () => {
  const accepted = async (): Promise<string> => {
    const dir = project({ 'a.json': twoProblems });
    await call(dir, 'check', 'a.json', '--baseline', 'b.json', '--update-baseline');
    return dir;
  };

  it('accepts what was recorded: nothing is reported and the run passes', async () => {
    const dir = await accepted();
    const r = await call(dir, 'check', 'a.json', '--baseline', 'b.json');
    expect(r).toMatchObject({ code: 0, err: '' });
    expect(r.out).toBe('No new findings across 2 tokens in 1 file.\n2 findings accepted by the baseline (b.json).\n');
  });

  it('reports only what is new, and fails on it', async () => {
    const dir = await accepted();
    const more = tokens({ c: { a: color('{missing}', described), b: color('{gone}', described) }, mystery: { $value: '#123456' } });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, 'a.json'), more);
    const { code, report } = await json(dir, 'check', 'a.json', '--baseline', 'b.json');
    expect(code).toBe(1);
    // c/b also draws duplicate-semantic: two aliases that both fail to resolve count as the same value.
    expect(report.findings.map((f) => `${f.rule}: ${f.id}`)).toEqual(['broken-ref: c-b', 'duplicate-semantic: c-b']);
    expect(report.baseline).toEqual({ file: 'b.json', accepted: 2, stale: 0 });
    expect(report.summary).toMatchObject({ errors: 1, warnings: 0, infos: 1 });
  });

  it('says how many entries no longer match when a problem was fixed, and does not fail on it', async () => {
    const dir = await accepted();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, 'a.json'), tokens({ c: { a: color('#fff', described) }, mystery: { $value: '#123456' } }));
    const r = await call(dir, 'check', 'a.json', '--baseline', 'b.json');
    expect(r.code).toBe(0);
    expect(r.out).toContain('1 finding accepted by the baseline (b.json).');
    expect(r.out).toContain('1 baseline entry no longer matches anything. Run with --update-baseline to remove it.');
  });

  it('uses the plural for several stale entries', async () => {
    const dir = await accepted();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, 'a.json'), tokens({ c: { a: color('#fff', described) }, ok: color('#000', described) }));
    expect((await call(dir, 'check', 'a.json', '--baseline', 'b.json')).out).toContain('2 baseline entries no longer match anything. Run with --update-baseline to remove them.');
  });

  it('is not tripped by a changed severity', async () => {
    const dir = await accepted();
    const strict = JSON.stringify({ sources: ['a.json'], baseline: 'b.json', rules: { 'dtcg-untyped': 'error', 'broken-ref': 'info' } });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, 'systemma.config.json'), strict);
    const r = await call(dir, 'check');
    expect(r.code).toBe(0);
    expect(r.out).toContain('2 findings accepted by the baseline');
  });

  it('applies --fail-on to the new findings only', async () => {
    const dir = project({ 'a.json': tokens({ mystery: { $value: '#123456' } }) });
    await call(dir, 'check', 'a.json', '--baseline', 'b.json', '--update-baseline');
    expect((await call(dir, 'check', 'a.json', '--baseline', 'b.json', '--fail-on', 'warn')).code).toBe(0);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, 'a.json'), tokens({ mystery: { $value: '#123456' }, other: { $value: '#654321' } }));
    expect((await call(dir, 'check', 'a.json', '--baseline', 'b.json', '--fail-on', 'warn')).code).toBe(1);
  });

  it('is taken from the config, and overridden by --baseline', async () => {
    const dir = project({ 'systemma.config.json': JSON.stringify({ sources: ['a.json'], baseline: 'config.json' }), 'a.json': twoProblems });
    await call(dir, 'check', '--update-baseline');
    expect((await call(dir, 'check')).code).toBe(0);
    await call(dir, 'check', '--baseline', 'empty.json', '--update-baseline');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, 'empty.json'), JSON.stringify({ version: 1, findings: [] }));
    expect((await call(dir, 'check', '--baseline', 'empty.json')).code).toBe(1);
  });

  it('leaves input warnings and every other part of the report alone', async () => {
    const dir = project({ 'tokens/a.json': twoProblems, 'tokens/bad.json': '{nope' });
    await call(dir, 'check', 'tokens', '--baseline', 'b.json', '--update-baseline');
    const { report } = await json(dir, 'check', 'tokens', '--baseline', 'b.json');
    expect(report.inputWarnings).toHaveLength(1);
    expect(report.summary).toMatchObject({ files: 1, tokens: 2, errors: 0 });
  });

  it('is an error when the file is missing, or is not a valid baseline', async () => {
    const dir = project({ 'a.json': twoProblems, 'bad.json': '{nope', 'old.json': '{"version":9,"findings":[]}' });
    expect((await call(dir, 'check', 'a.json', '--baseline', 'nope.json')).err).toBe('systemma: baseline nope.json: cannot be read. Create it with --update-baseline.\n');
    expect((await call(dir, 'check', 'a.json', '--baseline', 'bad.json')).err).toMatch(/^systemma: baseline bad\.json: invalid JSON/);
    expect((await call(dir, 'check', 'a.json', '--baseline', 'old.json')).err).toMatch(/unsupported version 9/);
    expect((await call(dir, 'check', 'a.json', '--baseline', 'nope.json')).code).toBe(2);
  });
});

describe('cli-baseline fixture', () => {
  it('gives the text report in the golden file', async () => {
    const r = await call(fixtureDir('cli-baseline'), 'check');
    expect(r.code).toBe(1);
    await expect(r.out).toMatchFileSnapshot(`${fixtureDir('cli-baseline')}/expected.txt`);
  });

  it('gives the JSON report in the golden file', async () => {
    const r = await call(fixtureDir('cli-baseline'), 'check', '--format', 'json');
    await expect(r.out).toMatchFileSnapshot(`${fixtureDir('cli-baseline')}/expected.json`);
  });

  it('reports far more without the baseline: the baseline is what hides the accepted findings', async () => {
    const withBaseline = (await json(fixtureDir('cli-baseline'), 'check')).report;
    const without = JSON.parse((await call(`${fixtureDir('cli-baseline')}/tokens`, 'check', '.', '--format', 'json')).out) as Report;
    expect(without.findings.length).toBeGreaterThan(withBaseline.findings.length);
    expect(withBaseline.baseline).toMatchObject({ accepted: 9, stale: 1 });
  });
});
