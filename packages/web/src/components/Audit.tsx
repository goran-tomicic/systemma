import { useMemo, useState } from 'react';
import { RULESETS, activeRulesets } from '@systemma/core';
import type { Analysis, Dataset, Finding, RulesetId, Severity } from '@systemma/core';
import { SEVERITY_LABEL, countBySeverity, filterFindings, groupByRule } from '../lib/findings';
import type { RuleGroup, SeverityFilter } from '../lib/findings';

const PAGE = 50;

function FindingRow({ f, ds, onSelect }: { f: Finding; ds: Dataset; onSelect(id: string): void }) {
  const token = f.id ? ds.tokens.get(f.id) : undefined;
  const source = token?.source;
  return (
    <li>
      <span className={`sev ${f.severity}`} role="img" aria-label={SEVERITY_LABEL[f.severity]} />
      {f.id && token
        ? <button type="button" className="fbtn" onClick={() => onSelect(f.id as string)}>{f.subject}</button>
        : <span className="fsubj">{f.subject}</span>}
      <span className="fmsg">{f.message}</span>
      {source && <span className="fsrc">{source}</span>}
    </li>
  );
}

function Group({ group, ds, open, onSelect }: { group: RuleGroup; ds: Dataset; open: boolean; onSelect(id: string): void }) {
  const [shown, setShown] = useState(PAGE);
  const { meta } = group;
  const counts = (['error', 'warn', 'info'] as Severity[]).filter((s) => group.counts[s]);
  return (
    <details className="rule" open={open}>
      <summary>
        <span className="rt">{meta.title}</span>
        <code className="rid">{group.rule}</code>
        {counts.map((s) => <span key={s} className={`badge ${s}`}>{group.counts[s]} {SEVERITY_LABEL[s]}</span>)}
        <span className="rd">
          {meta.description}{' '}
          <span className="rsrc">
            Source: {meta.source.url ? <a href={meta.source.url} target="_blank" rel="noreferrer noopener">{meta.source.name}</a> : meta.source.name}
            {' · '}confidence {meta.confidence}
          </span>
        </span>
      </summary>
      <ul className="finds">
        {group.findings.slice(0, shown).map((f, i) => <FindingRow key={`${f.id ?? f.subject}-${i}`} f={f} ds={ds} onSelect={onSelect} />)}
      </ul>
      {group.findings.length > shown && (
        <p className="more">
          <button className="btn sm" type="button" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, group.findings.length - shown)} more</button>
          {' '}of {group.findings.length - shown} not shown
        </p>
      )}
    </details>
  );
}

function Rulesets({ ds, enabled, findings, onToggle }: { ds: Dataset; enabled: ReadonlySet<RulesetId> | null; findings: readonly Finding[]; onToggle(id: RulesetId, on: boolean): void }) {
  const running = new Set(activeRulesets(ds, enabled ? { enabledRulesets: enabled } : {}).map((s) => s.id));
  return (
    <details className="rulesets">
      <summary>Rulesets <span className="badge">{running.size} of {RULESETS.length} running</span></summary>
      <ul>
        {RULESETS.map((s) => {
          const on = enabled ? enabled.has(s.id) : s.defaultOn;
          const applies = !s.applies || s.applies(ds);
          const n = findings.filter((f) => f.set === s.id).length;
          return (
            <li key={s.id} className="rs">
              <label>
                <input type="checkbox" checked={on} onChange={(e) => onToggle(s.id, e.target.checked)} />
                <b>{s.name}</b>
                <span className="badge">{s.rules.length} rules</span>
                {on && !applies && <span className="badge warn">does not apply to this data</span>}
                {on && applies && n > 0 && <span className="badge">{n} {n === 1 ? 'finding' : 'findings'}</span>}
              </label>
              <p className="rd">{s.description}</p>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function Audit({ analysis, ds, enabled, onToggleRuleset, onSelect }: { analysis: Analysis; ds: Dataset; enabled: ReadonlySet<RulesetId> | null; onToggleRuleset(id: RulesetId, on: boolean): void; onSelect(id: string): void }) {
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [query, setQuery] = useState('');
  const totals = useMemo(() => countBySeverity(analysis.findings), [analysis]);
  const shown = useMemo(() => filterFindings(analysis.findings, severity, query), [analysis, severity, query]);
  const groups = useMemo(() => groupByRule(shown), [shown]);
  const filtering = severity !== 'all' || query.trim() !== '';

  return (
    <section aria-label="Audit">
      <h2>Audit</h2>
      <Rulesets ds={ds} enabled={enabled} findings={analysis.findings} onToggle={onToggleRuleset} />
      <div className="sum">
        <span className="badge err">{totals.error} {totals.error === 1 ? 'error' : 'errors'}</span>
        <span className="badge warn">{totals.warn} {totals.warn === 1 ? 'warning' : 'warnings'}</span>
        <span className="badge">{totals.info} info</span>
      </div>
      <div className="tools">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by token, message or rule" aria-label="Filter findings" />
        {(['all', 'error', 'warn', 'info'] as SeverityFilter[]).map((s) => (
          <button key={s} type="button" className="pill" aria-pressed={severity === s} onClick={() => setSeverity(s)}>
            {s === 'all' ? 'All' : SEVERITY_LABEL[s]}
          </button>
        ))}
      </div>
      {analysis.findings.length === 0 && <p className="empty">No findings. Nothing in these tokens breaks a rule that is switched on.</p>}
      {analysis.findings.length > 0 && groups.length === 0 && filtering && <p className="empty">No findings match that filter.</p>}
      {groups.map((g, i) => <Group key={g.rule} group={g} ds={ds} onSelect={onSelect} open={!filtering ? i < 3 && g.counts.error + g.counts.warn > 0 : true} />)}
    </section>
  );
}
