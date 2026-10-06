export interface TabSpec<T extends string> {
  id: T;
  label: string;
  // A count shown beside the label. `alert` paints it as an error count.
  badge?: number;
  alert?: boolean;
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: TabSpec<T>[]; active: T; onChange(id: T): void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={active === t.id} aria-controls={`panel-${t.id}`} className="tab" onClick={() => onChange(t.id)}>
          {t.label}
          {t.badge !== undefined && <span className={`n${t.alert ? ' err' : ''}`}>{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}
