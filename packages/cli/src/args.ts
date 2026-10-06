import { parseArgs } from 'node:util';
import { UsageError } from './errors.js';

export type Format = 'text' | 'json';
export type FailOn = 'error' | 'warn';

export type CliArgs =
  | { command: 'help' }
  | { command: 'version' }
  | { command: 'check'; paths: string[]; usage: string[]; config?: string; format: Format; failOn: FailOn };

const oneOf = <T extends string>(name: string, value: string, allowed: readonly T[]): T => {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new UsageError(`--${name} must be one of ${allowed.join(', ')}, not "${value}".`);
};

const OPTIONS = {
  config: { type: 'string', short: 'c' },
  format: { type: 'string', short: 'f' },
  'fail-on': { type: 'string' },
  usage: { type: 'string', multiple: true },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

function parse(argv: string[]) {
  try {
    return parseArgs({ args: argv, allowPositionals: true, strict: true, options: OPTIONS });
  } catch (e) {
    throw new UsageError(e instanceof Error ? e.message : String(e));
  }
}

export function parseCliArgs(argv: string[]): CliArgs {
  const { values, positionals } = parse(argv);
  if (values.help) return { command: 'help' };
  if (values.version) return { command: 'version' };
  const [command, ...paths] = positionals;
  if (command === undefined || command === 'help') return { command: 'help' };
  if (command !== 'check') throw new UsageError(`Unknown command "${command}". The only command is "check".`);
  const format = oneOf('format', values.format ?? 'text', ['text', 'json'] as const);
  const failOn = oneOf('fail-on', values['fail-on'] ?? 'error', ['error', 'warn'] as const);
  return { command: 'check', paths, usage: values.usage ?? [], ...(values.config !== undefined ? { config: values.config } : {}), format, failOn };
}
