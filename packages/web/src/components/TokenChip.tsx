import type { Analysis, Dataset, Mode } from '@systemma/core';
import { shortLabel } from '../lib/tokens';
import { Preview } from './Preview';

// A token named in a sentence: its swatch and name, a button that selects it. A name that no token has is marked.
export function TokenChip({ ds, analysis, id, mode, onSelect, extra }: {
  ds: Dataset;
  analysis: Analysis;
  id: string;
  mode: Mode;
  onSelect(id: string): void;
  extra?: string;
}) {
  const token = ds.tokens.get(id);
  return (
    <button type="button" className={`chip${token ? '' : ' bad'}`} onClick={() => onSelect(id)} title={token?.label ?? `${id} is not defined`}>
      <Preview ds={ds} id={id} mode={mode} size="sm" info={analysis.info.get(id)} />
      <span>{token ? shortLabel(token) : id}</span>
      {extra && <em>{extra}</em>}
    </button>
  );
}
