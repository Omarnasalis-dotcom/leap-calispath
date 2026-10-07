import type { ChallengeMovement } from '@/api/challenges';

/** Movement rows (name, reps, points per rep): weekly and team challenges. */
export function MovementsEditor({
  movements,
  onChange,
}: {
  movements: ChallengeMovement[];
  onChange: (m: ChallengeMovement[]) => void;
}) {
  function update(i: number, patch: Partial<ChallengeMovement>) {
    onChange(movements.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="label">Movements</span>
      {movements.map((m, i) => (
        <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
          <input
            className="field"
            style={{ flex: 1 }}
            placeholder="Movement"
            value={m.name}
            onChange={(e) => update(i, { name: e.target.value })}
            aria-label={`Movement ${i + 1} name`}
          />
          <input
            className="field num"
            style={{ width: 64 }}
            type="number"
            min={0}
            placeholder="Reps"
            value={m.reps || ''}
            onChange={(e) => update(i, { reps: Number(e.target.value) })}
            aria-label={`Movement ${i + 1} reps`}
          />
          <input
            className="field num"
            style={{ width: 64 }}
            type="number"
            min={0}
            placeholder="Pts"
            value={m.points || ''}
            onChange={(e) => update(i, { points: Number(e.target.value) })}
            aria-label={`Movement ${i + 1} points`}
          />
          <button
            className="btn small"
            type="button"
            aria-label={`Remove movement ${i + 1}`}
            onClick={() => onChange(movements.filter((_, idx) => idx !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="btn small"
        type="button"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => onChange([...movements, { name: '', reps: 0, points: 0 }])}
      >
        + Add movement
      </button>
    </div>
  );
}
