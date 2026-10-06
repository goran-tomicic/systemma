import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../src/args.js';
import { UsageError } from '../src/errors.js';

describe('parseCliArgs', () => {
  it('reads paths, with text output and an error threshold by default', () => {
    expect(parseCliArgs(['check', 'a.json', 'dir'])).toEqual({ command: 'check', paths: ['a.json', 'dir'], usage: [], updateBaseline: false, format: 'text', failOn: 'error' });
  });

  it('accepts no paths, so a config can supply them', () => {
    expect(parseCliArgs(['check'])).toMatchObject({ command: 'check', paths: [] });
  });

  it('reads every option, long and short', () => {
    expect(parseCliArgs(['check', 'x', '--config', 'c.json', '--format', 'json', '--fail-on', 'warn'])).toEqual({
      command: 'check', paths: ['x'], usage: [], config: 'c.json', updateBaseline: false, format: 'json', failOn: 'warn',
    });
    expect(parseCliArgs(['check', '-c', 'c.json', '-f', 'json'])).toMatchObject({ config: 'c.json', format: 'json' });
    expect(parseCliArgs(['--fail-on=warn', 'check'])).toMatchObject({ failOn: 'warn' });
  });

  it('reads --usage, once or several times', () => {
    expect(parseCliArgs(['check', 'tokens', '--usage', 'src'])).toMatchObject({ paths: ['tokens'], usage: ['src'] });
    expect(parseCliArgs(['check', '--usage', 'src', '--usage=lib', 'tokens'])).toMatchObject({ paths: ['tokens'], usage: ['src', 'lib'] });
  });

  it('reads --baseline and --update-baseline', () => {
    expect(parseCliArgs(['check', 'tokens', '--baseline', 'b.json'])).toMatchObject({ baseline: 'b.json', updateBaseline: false });
    expect(parseCliArgs(['check', 'tokens', '--baseline=b.json', '--update-baseline'])).toMatchObject({ baseline: 'b.json', updateBaseline: true });
    expect(parseCliArgs(['check', '--update-baseline'])).toMatchObject({ updateBaseline: true });
    expect(parseCliArgs(['check']).command === 'check' && 'baseline' in parseCliArgs(['check'])).toBe(false);
  });

  it('accepts options before or after the paths', () => {
    expect(parseCliArgs(['check', '--format', 'json', 'a.json'])).toMatchObject({ paths: ['a.json'], format: 'json' });
  });

  it.each([[['--help']], [['-h']], [['help']], [[]], [['check', '--help']]])('shows help for %j', (argv) => {
    expect(parseCliArgs(argv)).toEqual({ command: 'help' });
  });

  it.each([[['--version']], [['-v']]])('shows the version for %j', (argv) => {
    expect(parseCliArgs(argv)).toEqual({ command: 'version' });
  });

  it.each([
    [['frobnicate'], /Unknown command "frobnicate"/],
    [['check', '--format', 'xml'], /--format must be one of text, json, not "xml"/],
    [['check', '--fail-on', 'info'], /--fail-on must be one of error, warn, not "info"/],
    [['check', '--nope'], /Unknown option '--nope'/],
    [['check', '--config'], /argument missing|requires an argument|--config/i],
  ])('rejects %j', (argv, message) => {
    expect(() => parseCliArgs(argv)).toThrow(UsageError);
    expect(() => parseCliArgs(argv)).toThrow(message);
  });
});
