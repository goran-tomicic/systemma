import { useMemo, useState } from 'react';
import { flatten, roleOfToken, simulate } from '@systemma/core';
import type { Analysis, Dataset, Mode, RGB } from '@systemma/core';
import { labelOf } from '../lib/compare';
import { CONDITIONS, FILTERS, colorOf, contrastRows, hasSeverity, inkOn, isMatrix, peerRows, rgbHex, surfaceRgb } from '../lib/simulate';
import type { Condition } from '../lib/simulate';
import { shortLabel } from '../lib/tokens';
import { TokenChip } from './TokenChip';

const PAGE = 100;

export function SimulateView({ ds, analysis, mode, onMode, selected, onSelect }: {
  ds: Dataset;
  analysis: Analysis;
  mode: Mode;
  onMode(m: Mode): void;
  selected: string | null;
  onSelect(id: string): void;
}) {
  const [type, setType] = useState<Condition>('deuteranopia');
  const [severity, setSeverity] = useState(100);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const sev = hasSeverity(type) ? severity / 100 : 1;

  const colors = useMemo(() => {
    const out: { id: string; label: string; rgb: RGB }[] = [];
    const base = surfaceRgb(ds, mode);
    for (const t of ds.tokens.values()) {
      const c = colorOf(ds, t.id, mode);
      if (c) out.push({ id: t.id, label: shortLabel(t), rgb: flatten(c, base) });
    }
    return out;
  }, [ds, mode]);
  const q = query.trim().toLowerCase();
  const shown = colors.filter((c) => !q || `${c.label} ${c.id}`.toLowerCase().includes(q));
  const current = selected ? colors.find((c) => c.id === selected) : undefined;

  return (
    <section aria-label="Color vision">
      <h2>Color vision</h2>
      <p className="dim2">See how a color token looks with a color-vision condition, which other colors it can be mistaken for, and how it does for contrast. Pick a token below.</p>
      <div className="sum">
        <div className="seg2 push" role="group" aria-label="Mode">
          {(['light', 'dark'] as Mode[]).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => onMode(m)}>{m === 'light' ? 'Light' : 'Dark'}</button>)}
        </div>
      </div>
      <div className="tools" role="group" aria-label="Condition">
        {CONDITIONS.map((c) => <button key={c.id} type="button" className="pill" aria-pressed={type === c.id} onClick={() => setType(c.id)}>{c.label}</button>)}
      </div>
      {hasSeverity(type) && (
        <label className="sev-row">Severity <input type="range" min={0} max={100} step={10} value={severity} onChange={(e) => setSeverity(Number(e.target.value))} aria-label="Severity" /> <span className="mono">{severity}%</span></label>
      )}

      {current ? <Output ds={ds} analysis={analysis} mode={mode} id={current.id} rgb={current.rgb} type={type} sev={sev} onSelect={onSelect} /> : (
        <p className="hint">{selected ? 'The selected token has no color in this mode.' : 'No token selected.'}</p>
      )}

      <h3>Colors <span className="dim2">{colors.length}</span></h3>
      {colors.length === 0 ? <p className="empty">No token resolves to a color in {mode} mode.</p> : (
        <>
          <div className="tools">
            <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="Filter by name" aria-label="Filter colors" />
          </div>
          {shown.length === 0 ? <p className="empty">No colors match that filter.</p> : (
            <div className="list">
              {shown.slice(0, limit).map((c) => {
                const sim = isMatrix(type) ? simulate(c.rgb, type, sev) : c.rgb;
                return (
                  <button key={c.id} type="button" className={`row${c.id === selected ? ' sel' : ''}`} onClick={() => onSelect(c.id)} title={labelOf(ds, c.id)}>
                    <span className="pair" aria-hidden="true">
                      <span className="sw sm" style={{ background: rgbHex(c.rgb) }} />
                      <span className="arrow">→</span>
                      <span className="sw sm" style={{ background: rgbHex(sim) }} />
                    </span>
                    <span className="rmain"><b>{c.label}</b> <span className="mono dim2">{rgbHex(c.rgb)}{isMatrix(type) ? ` → ${rgbHex(sim)}` : ''}</span></span>
                  </button>
                );
              })}
            </div>
          )}
          {shown.length > limit && <button type="button" className="btn sm" onClick={() => setLimit(limit + PAGE)}>Show more ({shown.length - limit} left)</button>}
        </>
      )}
    </section>
  );
}

function Output({ ds, analysis, mode, id, rgb, type, sev, onSelect }: {
  ds: Dataset;
  analysis: Analysis;
  mode: Mode;
  id: string;
  rgb: RGB;
  type: Condition;
  sev: number;
  onSelect(id: string): void;
}) {
  const translucent = (colorOf(ds, id, mode)?.[3] ?? 1) < 1;
  const isBg = roleOfToken(id) === 'bg';
  const refs = contrastRows(ds, id, mode, rgb);
  const chip = (t: string) => <TokenChip ds={ds} analysis={analysis} id={t} mode={mode} onSelect={onSelect} />;
  const yesNo = (ok: boolean) => <span className={`badge ${ok ? 'ok' : 'fail'}`}>{ok ? 'pass' : 'fail'}</span>;

  let body;
  if (isMatrix(type)) {
    const sim = simulate(rgb, type, sev);
    const peers = peerRows(ds, id, mode, rgb, type, sev);
    const name = CONDITIONS.find((c) => c.id === type)?.label;
    body = (
      <>
        <div className="pairsw">
          <div className="sw2" style={{ background: rgbHex(rgb), color: inkOn(rgb) }}>Normal<br />{rgbHex(rgb)}</div>
          <div className="sw2" style={{ background: rgbHex(sim), color: inkOn(sim) }}>{name}<br />{rgbHex(sim)}</div>
        </div>
        {peers.length > 0 && (
          <>
            <h3>Against its role peers</h3>
            <table className="tbl">
              <thead><tr><th>Peer</th><th>ΔE normal</th><th>ΔE simulated</th><th /></tr></thead>
              <tbody>
                {peers.map((p) => (
                  <tr key={p.id}>
                    <td>{chip(p.id)}</td>
                    <td className="mono">{p.normal.toFixed(0)}</td>
                    <td className="mono">{p.simulated.toFixed(0)}</td>
                    <td>{p.verdict === 'hard' ? <span className="badge fail">hard to tell apart</span> : p.verdict === 'close' ? <span className="badge warn">close</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="dim2">ΔE is CIE76, a coarse heuristic: under about 10 reads as nearly the same color.</p>
          </>
        )}
      </>
    );
  } else {
    const on = isBg ? rgb : surfaceRgb(ds, mode);
    const text: RGB = isBg ? (inkOn(rgb) === '#111111' ? [17, 17, 17] : [255, 255, 255]) : rgb;
    body = (
      <>
        <div className="lvbox" style={{ background: rgbHex(on) }}>
          <span style={{ color: rgbHex(text), filter: FILTERS[type as 'lowvision' | 'washed'] }}>Aa — The quick brown fox jumps over the lazy dog</span>
        </div>
        <p className="dim2">An approximation with CSS filters, not a clinical simulation.</p>
      </>
    );
  }

  return (
    <div className="simout" aria-label="Simulation result">
      <h3>{labelOf(ds, id)}</h3>
      {translucent && <p className="dim2">Translucent: composited over {labelOf(ds, 'color-surface-base')} for this view.</p>}
      {body}
      <h3>Contrast {isBg ? 'of text on this color' : 'on each surface'}</h3>
      <table className="tbl">
        <thead><tr><th>{isBg ? 'Text' : 'Surface'}</th><th>Ratio</th><th>AA</th><th>AAA</th><th>UI</th><th>APCA</th></tr></thead>
        <tbody>
          {refs.map((r) => (
            <tr key={r.label}>
              <td>{r.id ? chip(r.id) : <span className="mono">{r.label}</span>}</td>
              <td className="mono">{r.ratio.toFixed(2)}</td>
              <td>{yesNo(r.ratio >= 4.5)}</td>
              <td>{yesNo(r.ratio >= 7)}</td>
              <td>{yesNo(r.ratio >= 3)}</td>
              <td className="mono">{r.lc.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dim2">AA text 4.5:1, AAA 7:1, UI components 3:1 (WCAG 2.2). APCA Lc is a supplementary perceptual score, not part of WCAG 2.</p>
    </div>
  );
}
