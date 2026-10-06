import { describe, expect, it } from 'vitest';
import { applyBaseline, buildBaseline, findingKey, parseBaseline, serializeBaseline } from '../src/baseline.js';
import type { Baseline } from '../src/baseline.js';
import { InputError } from '../src/errors.js';

const f = (rule: string, id: string | null, message: string, subject = id ?? 'S', severity = 'warn') => ({ rule, id, subject, message, severity });

describe('findingKey', () => {
  it('is the same for the same rule, token and message', () => {
    expect(findingKey(f('unused', 'a', 'm'))).toBe(findingKey(f('unused', 'a', 'm')));
  });

  it('ignores severity and the authored name of a token that has an id', () => {
    expect(findingKey(f('unused', 'a', 'm', 'Color/A', 'info'))).toBe(findingKey(f('unused', 'a', 'm', 'color/a', 'error')));
  });

  it('differs by rule, token or message', () => {
    const base = findingKey(f('unused', 'a', 'm'));
    expect(findingKey(f('cycle', 'a', 'm'))).not.toBe(base);
    expect(findingKey(f('unused', 'b', 'm'))).not.toBe(base);
    expect(findingKey(f('unused', 'a', 'm2'))).not.toBe(base);
  });

  it('uses the subject when the finding is not about a token', () => {
    expect(findingKey(f('broken-usage', null, 'm', 'Button'))).not.toBe(findingKey(f('broken-usage', null, 'm', 'Card')));
    expect(findingKey(f('broken-usage', null, 'm', 'Button'))).toBe(findingKey(f('broken-usage', null, 'm', 'Button', 'error')));
  });

  it('does not let one field run into the next', () => {
    expect(findingKey(f('a', 'b', 'c'))).not.toBe(findingKey(f('a', 'bc', '')));
  });
});

describe('buildBaseline', () => {
  it('lists each finding once, sorted by rule, then token, then message', () => {
    const b = buildBaseline([f('unused', 'b', 'm'), f('cycle', 'z', 'm'), f('unused', 'a', 'm2'), f('unused', 'a', 'm1')]);
    expect(b.findings.map((e) => [e.rule, e.id, e.message])).toEqual([['cycle', 'z', 'm'], ['unused', 'a', 'm1'], ['unused', 'a', 'm2'], ['unused', 'b', 'm']]);
  });

  it('counts identical findings, and leaves out the count when it is one', () => {
    const b = buildBaseline([f('unused', 'a', 'm'), f('unused', 'a', 'm'), f('unused', 'a', 'm'), f('cycle', 'b', 'm')]);
    expect(b.findings).toEqual([
      { rule: 'cycle', id: 'b', subject: 'b', message: 'm' },
      { rule: 'unused', id: 'a', subject: 'a', message: 'm', count: 3 },
    ]);
  });

  it('keeps no severity, so recoloring a rule does not change the file', () => {
    const entry = buildBaseline([f('unused', 'a', 'm', 'a', 'info')]).findings[0];
    expect(entry).not.toHaveProperty('severity');
  });

  it('is the same whatever order the findings arrive in', () => {
    const a = [f('x', '1', 'm'), f('y', '2', 'm'), f('x', '3', 'm')];
    expect(serializeBaseline(buildBaseline(a))).toBe(serializeBaseline(buildBaseline([...a].reverse())));
  });

  it('is empty for no findings', () => {
    expect(buildBaseline([])).toEqual({ version: 1, findings: [] });
  });

  it('serializes as readable JSON ending in a newline', () => {
    const text = serializeBaseline(buildBaseline([f('unused', 'a', 'm')]));
    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text)).toEqual({ version: 1, findings: [{ rule: 'unused', id: 'a', subject: 'a', message: 'm' }] });
    expect(text.split('\n').length).toBeGreaterThan(5);
  });
});

describe('parseBaseline', () => {
  const ok = (v: unknown): Baseline => parseBaseline(JSON.stringify(v), 'b.json');
  const msg = (text: string): string => {
    try {
      parseBaseline(text, 'b.json');
    } catch (e) {
      if (e instanceof InputError) return e.messages.join('\n');
      throw e;
    }
    return '';
  };

  it('round-trips what buildBaseline wrote', () => {
    const b = buildBaseline([f('unused', 'a', 'm'), f('unused', 'a', 'm'), f('broken-usage', null, 'x', 'Btn')]);
    expect(parseBaseline(serializeBaseline(b), 'b.json')).toEqual(b);
  });

  it('accepts an empty list', () => {
    expect(ok({ version: 1, findings: [] })).toEqual({ version: 1, findings: [] });
  });

  it.each([
    ['{nope', /^baseline b\.json: invalid JSON/],
    ['[]', /expected a JSON object/],
    ['null', /expected a JSON object/],
    ['{"findings":[]}', /unsupported version undefined\. This tool reads version 1/],
    ['{"version":2,"findings":[]}', /unsupported version 2/],
    ['{"version":1}', /expected a "findings" list/],
    ['{"version":1,"findings":{}}', /expected a "findings" list/],
    ['{"version":1,"findings":[4]}', /findings\[0\]: expected an object/],
    ['{"version":1,"findings":[{"rule":"r","subject":"s"}]}', /findings\[0\]: expected rule, subject and message as text/],
    ['{"version":1,"findings":[{"rule":"r","id":4,"subject":"s","message":"m"}]}', /findings\[0\]\.id: expected text or null/],
    ['{"version":1,"findings":[{"rule":"r","id":null,"subject":"s","message":"m","count":1}]}', /findings\[0\]\.count: expected a whole number of 2 or more/],
    ['{"version":1,"findings":[{"rule":"r","id":null,"subject":"s","message":"m","count":2.5}]}', /findings\[0\]\.count/],
  ])('rejects %s', (text, pattern) => {
    expect(msg(text)).toMatch(pattern);
  });
});

describe('applyBaseline', () => {
  const baseline = (...fs: ReturnType<typeof f>[]): Baseline => buildBaseline(fs);

  it('accepts findings the baseline lists and keeps the rest in order', () => {
    const found = [f('unused', 'a', 'm'), f('cycle', 'b', 'm'), f('unused', 'c', 'm')];
    const r = applyBaseline(found, baseline(f('cycle', 'b', 'm')));
    expect(r.fresh).toEqual([found[0], found[2]]);
    expect(r).toMatchObject({ accepted: 1, stale: 0 });
  });

  it('accepts everything when nothing changed', () => {
    const found = [f('unused', 'a', 'm'), f('cycle', 'b', 'm')];
    expect(applyBaseline(found, baseline(...found))).toEqual({ fresh: [], accepted: 2, stale: 0 });
  });

  it('counts entries that match nothing as stale', () => {
    const r = applyBaseline([f('unused', 'a', 'm')], baseline(f('unused', 'a', 'm'), f('cycle', 'gone', 'm'), f('cycle', 'also-gone', 'm')));
    expect(r).toMatchObject({ accepted: 1, stale: 2 });
  });

  it('reports the extra one when a finding occurs more often than the baseline recorded', () => {
    const found = [f('unused', 'a', 'm', 'a', 'info'), f('unused', 'a', 'm', 'a', 'info')];
    const r = applyBaseline(found, baseline(f('unused', 'a', 'm')));
    expect(r).toMatchObject({ accepted: 1, stale: 0 });
    expect(r.fresh).toHaveLength(1);
  });

  it('counts the unused part of a recorded repeat as stale when the finding occurs less often', () => {
    const r = applyBaseline([f('unused', 'a', 'm')], baseline(f('unused', 'a', 'm'), f('unused', 'a', 'm'), f('unused', 'a', 'm')));
    expect(r).toMatchObject({ accepted: 1, stale: 2 });
  });

  it('treats a finding with a changed message as new, and the old entry as stale', () => {
    const r = applyBaseline([f('contrast', 'fg', 'on bg · 2.90:1 (light)')], baseline(f('contrast', 'fg', 'on bg · 2.81:1 (light)')));
    expect(r).toMatchObject({ accepted: 0, stale: 1 });
    expect(r.fresh).toHaveLength(1);
  });

  it('still accepts a finding whose severity changed', () => {
    expect(applyBaseline([f('unused', 'a', 'm', 'a', 'error')], baseline(f('unused', 'a', 'm', 'a', 'info'))).fresh).toEqual([]);
  });

  it('does nothing to an empty baseline', () => {
    const found = [f('unused', 'a', 'm')];
    expect(applyBaseline(found, buildBaseline([]))).toEqual({ fresh: found, accepted: 0, stale: 0 });
  });
});
