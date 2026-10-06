import { resolve } from '@systemma/core';
import type { Analysis, Dataset, Mode, Severity, Token } from '@systemma/core';
import { SEVERITY_LABEL } from '../lib/findings';
import { TIER_LABEL } from '../lib/tiers';
import { CATEGORY_LABEL } from '../lib/tokens';
import { aliasIn, displayValue, flatten } from '../lib/values';
import { Preview } from './Preview';
import { TokenChip } from './TokenChip';

type Props = { ds: Dataset; analysis: Analysis; mode: Mode; onSelect(id: string): void };

// A composite as written next to what it comes to: each reference shown as a token you can open, with its value.
function CompositeTable({ raw, resolved, ...p }: Props & { raw: unknown; resolved: unknown }) {
  const resolvedAt = new Map(flatten(resolved));
  return (
    <div className="kv">
      {flatten(raw).map(([path, value]) => {
        const alias = aliasIn(value);
        const now = resolvedAt.get(path);
        return (
          <span key={path} className="kvrow">
            <span className="dim2 mono">{path}</span>
            <span>
              {alias ? <TokenChip {...p} id={alias} /> : <span className="mono">{String(value)}</span>}
              {alias && now !== undefined && typeof now !== 'object' && now !== value && <span className="dim2 mono"> {String(now)}</span>}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function ModeValue({ id, label, mode, ...p }: Props & { id: string; label: string }) {
  const { ds, analysis } = p;
  const info = analysis.info.get(id);
  const r = resolve(ds, id, mode);
  const via = r.chain.slice(1);
  return (
    <div className="modeval">
      <h3>{label}</h3>
      {'error' in r ? (
        <p className="dim">
          {r.error === 'nomode' && `No ${mode} value.`}
          {r.error === 'missing' && <>References <TokenChip {...p} mode={mode} id={r.chain[r.chain.length - 1] ?? id} />, which is not defined.</>}
          {r.error === 'cycle' && <>Loops: {r.chain.join(' → ')}</>}
        </p>
      ) : (
        <>
          <div className="pvbig">
            <Preview ds={ds} id={id} mode={mode} size="lg" info={info} />
            {'value' in r
              ? <code className="valtext">{r.value}</code>
              : <code className="valtext">{displayValue(ds, id, mode, info?.kind ?? '').text}</code>}
          </div>
          {via.length > 0 && (
            <p className="via">
              <span className="dim2">via</span> {via.map((v) => <TokenChip key={v} {...p} mode={mode} id={v} />)}
            </p>
          )}
          {'composite' in r && <CompositeTable {...p} mode={mode} raw={r.raw} resolved={r.composite} />}
        </>
      )}
    </div>
  );
}

const sevOrder: Severity[] = ['error', 'warn', 'info'];

function Used({ id, ...p }: Props & { id: string }) {
  const { analysis } = p;
  const dependents = [...(analysis.dependents.get(id) ?? [])];
  const usage = analysis.usageBy.get(id) ?? [];
  const byComponent = new Map<string, { file: string; props: string[] }>();
  for (const u of usage) {
    const entry = byComponent.get(u.component) ?? { file: u.file, props: [] };
    if (u.prop && !entry.props.includes(u.prop)) entry.props.push(u.prop);
    byComponent.set(u.component, entry);
  }
  return (
    <>
      <h3>Used by tokens</h3>
      {dependents.length ? <div className="chips">{dependents.slice(0, 30).map((d) => <TokenChip key={d} {...p} id={d} />)}{dependents.length > 30 && <span className="dim2"> and {dependents.length - 30} more</span>}</div> : <p className="dim">No other token refers to it.</p>}
      <h3>Used in components</h3>
      {byComponent.size ? [...byComponent].map(([component, { file, props }]) => (
        <div className="comp" key={component}>
          <div title={file || undefined}>{component}{props.map((pr) => <span className="prop" key={pr}> {pr}</span>)}</div>
        </div>
      )) : <p className="dim">{p.ds.usage.length ? 'No component uses it.' : 'No usage data was added.'}</p>}
    </>
  );
}

function Facts({ token }: { token: Token }) {
  const facts: [string, string][] = [['Source', token.source || '—']];
  if (token.collection) facts.push(['Collection', token.collection]);
  if (token.scopes?.length) facts.push(['Figma scopes', token.scopes.join(', ')]);
  for (const [k, v] of Object.entries(token.codeSyntax ?? {})) facts.push([`Code (${k})`, v]);
  return (
    <>
      <div className="kv facts">{facts.map(([k, v]) => <span className="kvrow" key={k}><span className="dim2">{k}</span><span className="mono">{v}</span></span>)}</div>
      {token.collisions?.map((c) => (
        <p className="note" key={`${c.label}|${c.mode}`}>
          <b>{c.label}</b> has the same id and was not merged{c.collection ? ` (collection ${c.collection})` : ''}. Rename one of them.
        </p>
      ))}
    </>
  );
}

export function Detail({ id, onClose, ...p }: Props & { id: string; onClose(): void }) {
  const { ds, analysis } = p;
  const token = ds.tokens.get(id);
  const info = analysis.info.get(id);
  const findings = analysis.byId.get(id) ?? [];

  if (!token || !info) {
    return (
      <div className="detail-body">
        <button type="button" className="btn sm sheet-x" onClick={onClose}>Close</button>
        <h2>{id}</h2>
        <p className="note">No token has this name. Something refers to it, so it is missing.</p>
        <Used id={id} {...p} />
      </div>
    );
  }
  return (
    <div className="detail-body">
      <button type="button" className="btn sm sheet-x" onClick={onClose}>Close</button>
      <h2>{token.label}</h2>
      <p className="ids"><code>{token.id}</code></p>
      <p className="badges">
        <span className={`badge tier t-${info.tier}`}>{TIER_LABEL[info.tier]}</span>
        <span className="badge">{info.kind}</span>
        <span className="badge">{CATEGORY_LABEL[info.category]}</span>
        <span className="badge">{info.group}</span>
      </p>
      {token.deprecated && <p className="note">Deprecated{typeof token.deprecated === 'string' ? `: ${token.deprecated}` : '.'}</p>}
      {token.description && <p className="desc">{token.description}</p>}
      <ModeValue {...p} id={id} mode="light" label="Light" />
      <ModeValue {...p} id={id} mode="dark" label="Dark" />
      <Used id={id} {...p} />
      <h3>Findings</h3>
      {findings.length ? (
        <ul className="finds">
          {sevOrder.flatMap((s) => findings.filter((f) => f.severity === s)).map((f, i) => (
            <li key={i}><span className={`sev ${f.severity}`} role="img" aria-label={SEVERITY_LABEL[f.severity]} /><span className="fmsg"><code className="rid">{f.rule}</code> {f.message}</span></li>
          ))}
        </ul>
      ) : <p className="dim">None.</p>}
      <h3>Details</h3>
      <Facts token={token} />
      {token.caseVariants?.length ? <p className="dim">Also written as {token.caseVariants.map((c) => <code key={c}>{c} </code>)}</p> : null}
    </div>
  );
}
