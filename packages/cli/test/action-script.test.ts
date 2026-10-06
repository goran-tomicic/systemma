import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tempProject } from './helpers.js';

let cleanups: (() => void)[] = [];
afterEach(() => { for (const c of cleanups) c(); cleanups = []; });

const script = resolve(process.cwd(), '../../scripts/run-action.sh');

// A stand-in for the compiled CLI: it records the arguments it was given and exits with a chosen code, so
// the script's own work (building the argument list, passing the exit code on) can be tested without a build.
function setup(opts: { exit?: number; output?: string } = {}) {
  const p = tempProject({});
  cleanups.push(p.cleanup);
  const bin = join(p.dir, 'fake-bin.js');
  writeFileSync(bin, `
    require('node:fs').writeFileSync(${JSON.stringify(join(p.dir, 'argv.json'))}, JSON.stringify(process.argv.slice(2)));
    process.stdout.write(${JSON.stringify(opts.output ?? 'REPORT\n')});
    process.exit(${opts.exit ?? 0});
  `);
  const summary = join(p.dir, 'summary.md');
  const run = (env: Record<string, string>) => {
    const r = spawnSync('bash', [script], { cwd: p.dir, encoding: 'utf8', env: { PATH: process.env['PATH'] ?? '', SYSTEMMA_BIN: bin, GITHUB_STEP_SUMMARY: summary, ...env } });
    let argv: string[] | null = null;
    try { argv = JSON.parse(readFileSync(join(p.dir, 'argv.json'), 'utf8')) as string[]; } catch { /* the CLI was never run */ }
    let sum = '';
    try { sum = readFileSync(summary, 'utf8'); } catch { /* no summary written */ }
    return { code: r.status, out: r.stdout, err: r.stderr, argv, summary: sum, dir: p.dir };
  };
  return { run, dir: p.dir };
}

describe('run-action.sh', () => {
  it('runs check with a text report and an error threshold when given nothing', () => {
    expect(setup().run({}).argv).toEqual(['check', '--format', 'text', '--fail-on', 'error']);
  });

  it('puts paths first, then usage, config and baseline, then the format and threshold', () => {
    const r = setup().run({ INPUT_PATHS: 'tokens\nstyles', INPUT_USAGE: 'src\nlib', INPUT_CONFIG: 'c.json', INPUT_BASELINE: 'b.json', INPUT_FORMAT: 'json', INPUT_FAIL_ON: 'warn' });
    expect(r.argv).toEqual(['check', 'tokens', 'styles', '--usage', 'src', '--usage', 'lib', '--config', 'c.json', '--baseline', 'b.json', '--format', 'json', '--fail-on', 'warn']);
  });

  it('keeps a path with spaces as one argument', () => {
    expect(setup().run({ INPUT_PATHS: 'design tokens/colors file.json' }).argv?.slice(0, 2)).toEqual(['check', 'design tokens/colors file.json']);
  });

  it('ignores blank lines and trims each entry', () => {
    const r = setup().run({ INPUT_PATHS: '\n  tokens  \n\n\tstyles\t\n   \n', INPUT_USAGE: '\n src \n' });
    expect(r.argv).toEqual(['check', 'tokens', 'styles', '--usage', 'src', '--format', 'text', '--fail-on', 'error']);
  });

  it('does not expand globs, even when files match', () => {
    const s = setup();
    mkdirSync(join(s.dir, 'tokens'), { recursive: true });
    writeFileSync(join(s.dir, 'tokens', 'a.json'), '{}');
    expect(s.run({ INPUT_PATHS: 'tokens/*.json\n**/*.css' }).argv?.slice(0, 3)).toEqual(['check', 'tokens/*.json', '**/*.css']);
  });

  it('does not treat a value as a command', () => {
    const s = setup();
    const r = s.run({ INPUT_PATHS: '$(touch pwned); echo `touch pwned2`', INPUT_CONFIG: '"; touch pwned3; "' });
    expect(r.argv).toContain('$(touch pwned); echo `touch pwned2`');
    expect(r.argv).toContain('"; touch pwned3; "');
    for (const f of ['pwned', 'pwned2', 'pwned3']) expect(() => readFileSync(join(s.dir, f))).toThrow();
  });

  it('passes the CLI exit code on, and still prints the report', () => {
    for (const code of [0, 1, 2]) {
      const r = setup({ exit: code, output: `report for ${code}\n` }).run({});
      expect(r.code).toBe(code);
      expect(r.out).toBe(`report for ${code}\n`);
    }
  });

  it('adds a text report to the job summary, and leaves a JSON report out of it', () => {
    const text = setup({ output: 'findings here\n' }).run({});
    expect(text.summary).toBe('### systemma check\n\n```\nfindings here\n```\n');
    expect(setup({ output: '{}\n' }).run({ INPUT_FORMAT: 'json' }).summary).toBe('');
  });

  it('adds the summary even when the CLI fails, so the findings are readable on the run page', () => {
    const r = setup({ exit: 1, output: 'bad\n' }).run({});
    expect(r.code).toBe(1);
    expect(r.summary).toContain('bad');
  });

  it('works without a job summary', () => {
    const s = setup();
    const r = s.run({ GITHUB_STEP_SUMMARY: '' });
    expect(r).toMatchObject({ code: 0, summary: '' });
  });

  it('refuses to run without knowing where the CLI is', () => {
    const r = spawnSync('bash', [script], { encoding: 'utf8', env: { PATH: process.env['PATH'] ?? '' } });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('GITHUB_ACTION_PATH is not set');
  });
});

describe('run-action.sh with the built CLI', () => {
  it('runs the real binary when it has been built', () => {
    const bin = resolve(process.cwd(), 'dist/bin.js');
    let built = true;
    try { readFileSync(bin); } catch { built = false; }
    if (!built) return; // `pnpm build` has not run; CI builds before this matters
    const r = spawnSync('bash', [script], {
      cwd: resolve(process.cwd(), '../../fixtures/cli-usage'), encoding: 'utf8',
      env: { PATH: process.env['PATH'] ?? '', SYSTEMMA_BIN: bin },
    });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('broken-usage');
  });
});
