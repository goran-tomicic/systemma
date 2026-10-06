import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { analyze } from '@systemma/core';
import { applyBaseline, buildBaseline, parseBaseline, serializeBaseline } from './baseline.js';
import { parseCliArgs } from './args.js';
import type { CliArgs } from './args.js';
import { parseConfig } from './config.js';
import type { Config } from './config.js';
import { InputError, UsageError } from './errors.js';
import { loadDataset } from './load.js';
import { buildReport, exitCodeFor, formatJson, formatText } from './report.js';
import type { Report } from './report.js';
import { expandSources } from './sources.js';
import { scanUsageInputs } from './usage.js';

export interface Env {
  cwd: string;
  stdout(text: string): void;
  stderr(text: string): void;
}

const DEFAULT_CONFIG = 'systemma.config.json';

const HELP = `systemma: audit design tokens against published standards.

Usage
  systemma check [paths...] [options]

Paths are token files (DTCG or Tokens Studio JSON, a Figma variables export, CSS custom properties,
usage JSON), directories, or globs. With none, "sources" from the config file is used.

Options
      --usage <path>       A directory or file of code to scan for where tokens are used. Repeatable.
                           With none, "usage" from the config file is used.
      --baseline <file>    Leave out the findings recorded in this file. Default: "baseline" from the config.
      --update-baseline    Record every current finding in the baseline file, then exit 0.
  -c, --config <file>      Config file. Default: ./${DEFAULT_CONFIG} if it exists.
  -f, --format <format>    text (default) or json.
      --fail-on <level>    error (default) or warn. Exit 1 when a finding reaches that level.
  -h, --help               Show this help.
  -v, --version            Show the version.

Exit codes
  0  no finding at or above --fail-on
  1  at least one finding at or above --fail-on
  2  usage or input error (a bad option, a missing file, an invalid config)
`;

async function readVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string };
  return pkg.version ?? '0.0.0';
}

async function readConfig(args: Extract<CliArgs, { command: 'check' }>, cwd: string): Promise<{ config: Config; base: string } | null> {
  const explicit = args.config !== undefined;
  const file = resolve(cwd, args.config ?? DEFAULT_CONFIG);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    if (explicit) throw new InputError([`config ${args.config}: cannot be read.`]);
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new InputError([`config ${args.config ?? DEFAULT_CONFIG}: invalid JSON (${e instanceof Error ? e.message : String(e)}).`]);
  }
  return { config: parseConfig(json), base: dirname(file) };
}

// Runs the command and returns its exit code. Output goes through `env` so the whole thing can be tested.
export async function run(argv: string[], env: Env): Promise<0 | 1 | 2> {
  try {
    const args = parseCliArgs(argv);
    if (args.command === 'help') { env.stdout(HELP); return 0; }
    if (args.command === 'version') { env.stdout(`${await readVersion()}\n`); return 0; }

    const loaded = await readConfig(args, env.cwd);
    const config: Config = loaded?.config ?? { sources: [], usage: [], stripSets: false, audit: {} };
    // Paths on the command line are relative to where you are; "sources" in a config file are relative to that file.
    const [patterns, base] = args.paths.length ? [args.paths, env.cwd] : [config.sources, loaded?.base ?? env.cwd];
    if (!patterns.length) throw new UsageError('No files to check. Pass paths, or set "sources" in the config file.');

    const files = await expandSources(patterns, base, env.cwd);
    const { ds, files: count, warnings } = await loadDataset(files, { stripSets: config.stripSets });

    // Like sources, usage paths on the command line replace the config's and are relative to where you are.
    const [usageInputs, usageBase] = args.usage.length ? [args.usage, env.cwd] : [config.usage, loaded?.base ?? env.cwd];
    if (usageInputs.length) {
      const scan = await scanUsageInputs(usageInputs, usageBase, env.cwd, ds, new Set(files.map((f) => f.abs)));
      warnings.push(...scan.warnings);
    }
    const found = analyze(ds, config.audit).findings;

    // A baseline path on the command line is relative to where you are; one in the config file, to that file.
    const baselineAbs = args.baseline !== undefined ? resolve(env.cwd, args.baseline)
      : config.baseline !== undefined ? resolve(loaded?.base ?? env.cwd, config.baseline) : undefined;
    const baselineName = baselineAbs === undefined ? '' : relative(env.cwd, baselineAbs).split(sep).join('/');
    if (args.updateBaseline) {
      if (baselineAbs === undefined) throw new UsageError('--update-baseline needs a baseline file: pass --baseline <file>, or set "baseline" in the config file.');
      const baseline = buildBaseline(found);
      try {
        await writeFile(baselineAbs, serializeBaseline(baseline));
      } catch (e) {
        throw new InputError([`baseline ${baselineName}: cannot be written (${e instanceof Error ? e.message : String(e)}).`]);
      }
      env.stdout(`Baseline written: ${found.length} ${found.length === 1 ? 'finding' : 'findings'} to ${baselineName}.\n`);
      return 0;
    }

    let fresh = found;
    let baselineInfo: Report['baseline'] = null;
    if (baselineAbs !== undefined) {
      let text: string;
      try {
        text = await readFile(baselineAbs, 'utf8');
      } catch {
        throw new InputError([`baseline ${baselineName}: cannot be read. Create it with --update-baseline.`]);
      }
      const applied = applyBaseline(found, parseBaseline(text, baselineName));
      fresh = applied.fresh;
      baselineInfo = { file: baselineName, accepted: applied.accepted, stale: applied.stale };
    }
    const report = buildReport(ds, fresh, count, warnings, args.failOn, baselineInfo);

    if (args.format === 'json') env.stdout(formatJson(report));
    else {
      for (const w of warnings) env.stderr(`warning: ${w}\n`);
      env.stdout(formatText(report));
    }
    return exitCodeFor(report);
  } catch (e) {
    if (e instanceof UsageError) {
      env.stderr(`systemma: ${e.message}\nRun "systemma --help" for usage.\n`);
      return 2;
    }
    if (e instanceof InputError) {
      for (const m of e.messages) env.stderr(`systemma: ${m}\n`);
      return 2;
    }
    throw e;
  }
}
