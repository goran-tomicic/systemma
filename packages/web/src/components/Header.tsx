import type { Analysis } from '@systemma/core';
import { TIERS, TIER_LABEL, tierCounts } from '../lib/tiers';

export function Header({ analysis, files, onClear }: { analysis: Analysis; files: number; onClear(): void }) {
  const counts = tierCounts(analysis);
  const total = analysis.info.size;
  return (
    <header className="top">
      <div>
        <h1>Systemma</h1>
        <p className="ds">
          {total ? `${total} ${total === 1 ? 'token' : 'tokens'} from ${files} ${files === 1 ? 'source' : 'sources'}` : 'No tokens yet'}
        </p>
      </div>
      {files > 0 && (
        <div className="actions">
          <button className="btn" type="button" onClick={onClear}>Clear all</button>
        </div>
      )}
      {total > 0 && (
        <div className="tierbar" role="img" aria-label={TIERS.map((t) => `${counts[t]} ${TIER_LABEL[t].toLowerCase()}`).join(', ')}>
          <div className="bar">
            {TIERS.filter((t) => counts[t]).map((t) => <span key={t} className={`seg t-${t}`} style={{ flexGrow: counts[t] }} />)}
          </div>
          <ul className="legend">
            {TIERS.map((t) => <li key={t} className={`t-${t}`}><i />{TIER_LABEL[t]} <b>{counts[t]}</b></li>)}
          </ul>
        </div>
      )}
    </header>
  );
}
