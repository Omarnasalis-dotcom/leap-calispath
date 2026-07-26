export function StatCard({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: number | undefined;
  hint?: string;
  delta?: number;
}) {
  const hasDelta = delta !== undefined && delta !== null;
  const positive = hasDelta && delta! >= 0;

  return (
    <div className="stat-cell">
      <div className="dv-stat-head">
        <span className="label">{label}</span>
        {hasDelta && (
          <span className={`dv-delta ${positive ? 'dv-delta-pos' : 'dv-delta-neg'}`}>
            {positive ? '+' : ''}
            {delta}
          </span>
        )}
      </div>
      {value === undefined ? (
        <div className="skeleton" style={{ height: 30, width: 64 }} />
      ) : (
        <span className="value">{value.toLocaleString()}</span>
      )}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
