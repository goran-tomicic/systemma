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

const color = (v: string, extra: object = {}) => ({ $type: 'color', $value: v, ...extra });
const clean = { c: { a: color('#ffffff', { $description: 'Page background' }) } };
const broken = { c: { a: color('{missing}', { $description: 'Page background' }) } };
const warnOnly = { mystery: { $value: '#123456' } };

describe('exit codes', () => {
  it('is 0 when nothing is found', async () => {
    const dir = project({ 'a.json': tokens(clean) });
    const r = await call(dir, 'check', 'a.json');
    expect(r).toMatchObject({ code: 0, err: '' });
    expect(r.out).toBe('No findings across 1 token in 1 file.\n');
  });

  it('is 1 when a finding is an error', async () => {
    expect((await call(project({ 'a.json': tokens(broken) }), 'check', 'a.json')).code).toBe(1);
  });

  it('is 0 for warnings by default, and 1 with --fail-on warn', async () => {
    const dir = project({ 'a.json': tokens(warnOnly) });
    expect((await call(dir, 'check', 'a.json')).code).toBe(0);
    expect((await call(dir, 'check', 'a.json', '--fail-on', 'warn')).code).toBe(1);
  });

  it('is 0 for info findings, whatever --fail-on says', async () => {
    const dir = project({ 'a.css': ':root { --a: #fff; --b: var(--a); }' });
    const r = await call(dir, 'check', 'a.css', '--fail-on', 'warn', '--format', 'json');
    const report = JSON.parse(r.out) as Report;
    expect(report.summary).toMatchObject({ errors: 0, warnings: 0 });
    expect(r.code).toBe(0);
  });

  it.each([
    [['check', 'missing.json'], /missing\.json: no such file or directory/],
    [['check', '--format', 'xml', 'a.json'], /--format must be one of/],
    [['frobnicate'], /Unknown command/],
    [['check'], /No files to check/],
  ])('is 2 for %j', async (argv, message) => {
    const r = await call(project({ 'a.json': tokens(clean) }), ...argv);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(message);
    expect(r.out).toBe('');
  });

  it('adds a pointer to the help for a usage error, but not for a missing file', async () => {
    const dir = project({});
    expect((await call(dir, 'check', '--nope')).err).toContain('Run "systemma --help" for usage.');
    expect((await call(dir, 'check', 'gone.json')).err).not.toContain('--help');
  });

  it('is 2 when a named file is not a token file', async () => {
    const r = await call(project({ 'bad.json': '{nope' }), 'check', 'bad.json');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^systemma: bad\.json: Invalid JSON/);
  });
});

describe('help and version', () => {
  it('prints the help and exits 0', async () => {
    for (const argv of [['--help'], ['-h'], []]) {
      const r = await call(project({}), ...argv);
      expect(r.code).toBe(0);
      expect(r.out).toContain('Usage');
      expect(r.out).toContain('Exit codes');
    }
  });

  it('prints the version', async () => {
    const r = await call(project({}), '--version');
    expect(r).toMatchObject({ code: 0, out: '0.0.0\n' });
  });
});

describe('config', () => {
  const dir = (config: unknown, extra: Record<string, string> = {}): string =>
    project({ 'systemma.config.json': JSON.stringify(config), 'tokens/a.json': tokens(broken), ...extra });

  it('is found in the working directory, and supplies the sources', async () => {
    const r = await call(dir({ sources: ['tokens'] }), 'check', '--format', 'json');
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as Report).findings.some((f) => f.rule === 'broken-ref')).toBe(true);
  });

  it('can be named with --config, and its sources are relative to the config file', async () => {
    const d = project({ 'cfg/c.json': JSON.stringify({ sources: ['tokens'] }), 'cfg/tokens/a.json': tokens(broken) });
    const r = await call(d, 'check', '--config', 'cfg/c.json', '--format', 'json');
    expect((JSON.parse(r.out) as Report).findings[0]?.source).toBe('cfg/tokens/a.json');
  });

  it('is overridden by paths on the command line', async () => {
    const d = dir({ sources: ['tokens'] }, { 'other.json': tokens(clean) });
    expect((await call(d, 'check', 'other.json')).code).toBe(0);
  });

  it('applies severity overrides, ignores and rulesets', async () => {
    const off = await call(dir({ sources: ['tokens'], rules: { 'broken-ref': 'off' } }), 'check');
    expect(off.code).toBe(0);
    const ignored = await call(dir({ sources: ['tokens'], ignore: { 'broken-ref': ['c/*'] } }), 'check');
    expect(ignored.code).toBe(0);
    const recolored = await call(dir({ sources: ['tokens'], rules: { 'broken-ref': 'info' } }), 'check');
    expect(recolored.code).toBe(0);
    const unlisted = await call(dir({ sources: ['tokens'], rulesets: { integrity: false } }), 'check');
    expect(unlisted.code).toBe(0);
  });

  it('applies declared contrast pairs', async () => {
    const files = { 'tokens/a.json': tokens({ c: { t: color('#999999'), bg: color('#ffffff') } }) };
    const without = await call(dir({ sources: ['tokens'] }, files), 'check', '--format', 'json');
    expect((JSON.parse(without.out) as Report).findings.filter((f) => f.rule === 'contrast')).toEqual([]);
    const withPairs = await call(dir({ sources: ['tokens'], rules: { contrast: { pairs: [{ foreground: 'c/t', background: 'c/bg' }] } } }, files), 'check', '--format', 'json');
    expect((JSON.parse(withPairs.out) as Report).findings.filter((f) => f.rule === 'contrast')).toHaveLength(1);
  });

  it('is an error when it is invalid, listing every problem', async () => {
    const r = await call(dir({ colour: 1, rules: { nope: 'off' } }), 'check');
    expect(r.code).toBe(2);
    expect(r.err.split('\n').filter(Boolean)).toHaveLength(2);
    expect(r.err).toContain('systemma: config colour: unknown option.');
  });

  it('is an error when it is not valid JSON, or when a named config is missing', async () => {
    const bad = await call(project({ 'systemma.config.json': '{nope' }), 'check', 'x');
    expect(bad).toMatchObject({ code: 2 });
    expect(bad.err).toMatch(/config systemma\.config\.json: invalid JSON/);
    const missing = await call(project({ 'a.json': tokens(clean) }), 'check', 'a.json', '--config', 'nope.json');
    expect(missing).toMatchObject({ code: 2, err: 'systemma: config nope.json: cannot be read.\n' });
  });

  it('is optional when paths are given', async () => {
    expect((await call(project({ 'a.json': tokens(clean) }), 'check', 'a.json')).code).toBe(0);
  });

  it('refuses a baseline for now', async () => {
    expect((await call(dir({ sources: ['tokens'], baseline: 'b.json' }), 'check')).err).toContain('config baseline: not supported yet.');
  });
});

describe('output', () => {
  it('puts input warnings on stderr in text mode, and in the JSON in json mode', async () => {
    const files = { 'tokens/ok.json': tokens(clean), 'tokens/bad.json': '{nope' };
    const text = await call(project(files), 'check', 'tokens');
    expect(text.err).toMatch(/^warning: tokens\/bad\.json: skipped\./);
    expect(text.out).not.toContain('skipped');
    const json = await call(project(files), 'check', 'tokens', '--format', 'json');
    expect(json.err).toBe('');
    expect((JSON.parse(json.out) as Report).inputWarnings).toHaveLength(1);
  });

  it('gives JSON a stable shape', async () => {
    const r = await call(project({ 'a.json': tokens(broken) }), 'check', 'a.json', '--format', 'json');
    const report = JSON.parse(r.out) as Report;
    expect(Object.keys(report)).toEqual(['version', 'summary', 'failOn', 'findings', 'inputWarnings']);
    expect(report).toMatchObject({ version: 1, failOn: 'error', summary: { files: 1, tokens: 1, errors: 1 } });
    expect(Object.keys(report.findings[0] ?? {})).toEqual(['rule', 'set', 'severity', 'id', 'subject', 'message', 'source']);
  });

  it('lists the most severe findings first', async () => {
    const dir = project({ 'a.json': tokens({ c: { a: color('{missing}'), b: color('#fff') }, mystery: { $value: '#123' } }) });
    const report = JSON.parse((await call(dir, 'check', 'a.json', '--format', 'json')).out) as Report;
    const order = report.findings.map((f) => f.severity);
    expect(order).toEqual([...order].sort((a, b) => ['error', 'warn', 'info'].indexOf(a) - ['error', 'warn', 'info'].indexOf(b)));
  });

  it('groups text findings by file, and findings that are not about a token apart', async () => {
    const dir = project({ 'a.json': tokens(broken), 'usage.json': tokens([{ component: 'X', token: 'nope' }]) });
    const r = await call(dir, 'check', 'a.json', 'usage.json');
    expect(r.out).toMatch(/^a\.json\n {2}error {2}broken-ref/);
    expect(r.out).toContain('\n(not tied to a file)\n  error  broken-usage');
  });
});

describe('cli-basic fixture', () => {
  it('gives the same text report as the golden file', async () => {
    const r = await call(fixtureDir('cli-basic'), 'check');
    expect(r.code).toBe(1);
    await expect(r.out).toMatchFileSnapshot(`${fixtureDir('cli-basic')}/expected.txt`);
    expect(r.err).toBe('warning: tokens/broken.json: skipped. Invalid JSON: Expected property name or \'}\' in JSON at position 1 (line 1 column 2)\n');
  });

  it('gives the same JSON report as the golden file', async () => {
    const r = await call(fixtureDir('cli-basic'), 'check', '--format', 'json');
    expect(r.code).toBe(1);
    await expect(r.out).toMatchFileSnapshot(`${fixtureDir('cli-basic')}/expected.json`);
  });

  // The config is still read when paths are given; only its "sources" is replaced by them.
  it('gives the same findings when the paths are given instead of the config sources', async () => {
    const viaConfig = JSON.parse((await call(fixtureDir('cli-basic'), 'check', '--format', 'json')).out) as Report;
    const viaPaths = JSON.parse((await call(fixtureDir('cli-basic'), 'check', 'tokens', 'styles', 'usage.json', '--format', 'json')).out) as Report;
    expect(viaPaths.findings).toEqual(viaConfig.findings);
  });
});
