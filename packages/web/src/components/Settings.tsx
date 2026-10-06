export type ProfileChoice = 'auto' | 'tiered' | 'generic';

export function Settings({ profile, stripSets, onProfile, onStripSets }: {
  profile: ProfileChoice;
  stripSets: boolean;
  onProfile(p: ProfileChoice): void;
  onStripSets(on: boolean): void;
}) {
  return (
    <details className="settings">
      <summary>Settings</summary>
      <div className="settings-body">
        <label className="inline">
          <span>How tokens are grouped</span>
          <select value={profile} onChange={(e) => onProfile(e.target.value as ProfileChoice)}>
            <option value="auto">Automatic</option>
            <option value="tiered">Foundation / common / palette naming</option>
            <option value="generic">No naming assumptions</option>
          </select>
        </label>
        <p className="hint">Automatic uses the foundation / common / palette scheme when the names follow it, and no assumptions otherwise.</p>
        <label className="check">
          <input type="checkbox" checked={stripSets} onChange={(e) => onStripSets(e.target.checked)} />
          <span>Tokens Studio files: drop the top-level set names</span>
        </label>
      </div>
    </details>
  );
}
