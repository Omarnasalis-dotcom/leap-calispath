import type { ConceptMetadata } from '@/shared/BlockConceptParser';
import { BlockConceptParser } from '@/shared/BlockConceptParser';

// Mirrors src/components/coaching/BlockConfigWizard.tsx: timing system,
// structure, and tier-trial routing for one block, with the same live
// previews (Tabata round math, ladder rung sequence).

const TIMING_OPTIONS = [
  { value: 'straight_set', label: 'Straight sets' },
  { value: 'amrap', label: 'AMRAP' },
  { value: 'fortime', label: 'For time' },
  { value: 'tabata', label: 'Tabata' },
] as const;

const STRUCTURE_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'superset', label: 'Superset' },
  { value: 'circuit', label: 'Circuit' },
  { value: 'ladder', label: 'Ladder' },
] as const;

function num(v: string | number | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function ConceptWizard({
  metadata,
  onChange,
  exerciseCount,
}: {
  metadata: ConceptMetadata;
  onChange: (m: ConceptMetadata) => void;
  exerciseCount: number;
}) {
  const timing = metadata.timing_system ?? 'straight_set';
  const structure = timing === 'tabata' ? 'circuit' : (metadata.structure ?? 'single');

  function patch(p: Partial<ConceptMetadata>) {
    onChange({ ...metadata, ...p });
  }

  const warnStructure =
    structure === 'superset' && exerciseCount !== 2
      ? 'Superset expects exactly 2 exercises'
      : structure === 'circuit' && exerciseCount < 3
        ? 'Circuit expects 3+ exercises'
        : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <select
          className="field"
          style={{ flex: 1 }}
          value={timing}
          onChange={(e) => patch({ timing_system: e.target.value as ConceptMetadata['timing_system'] })}
          aria-label="Timing system"
        >
          {TIMING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {timing !== 'tabata' && (
          <select
            className="field"
            style={{ flex: 1 }}
            value={structure}
            onChange={(e) => patch({ structure: e.target.value as ConceptMetadata['structure'] })}
            aria-label="Structure"
          >
            {STRUCTURE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {(timing === 'amrap' || timing === 'fortime') && (
        <input
          className="field"
          type="number"
          min={0}
          placeholder="Time cap (min)"
          value={metadata.time_cap_min ?? ''}
          onChange={(e) => patch({ time_cap_min: e.target.value })}
          aria-label="Time cap minutes"
        />
      )}

      {timing === 'straight_set' && (
        <label className="row" style={{ gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={!!metadata.is_weighted}
            onChange={(e) => patch({ is_weighted: e.target.checked })}
          />
          Weighted block
        </label>
      )}

      {timing === 'tabata' && (
        <>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input
              className="field num"
              type="number"
              min={0}
              placeholder="Work (s)"
              value={metadata.tabata_work_seconds ?? ''}
              onChange={(e) => patch({ tabata_work_seconds: e.target.value })}
              aria-label="Tabata work seconds"
            />
            <input
              className="field num"
              type="number"
              min={0}
              placeholder="Rest (s)"
              value={metadata.tabata_rest_seconds ?? ''}
              onChange={(e) => patch({ tabata_rest_seconds: e.target.value })}
              aria-label="Tabata rest seconds"
            />
            <input
              className="field num"
              type="number"
              min={0}
              placeholder="Rounds"
              value={metadata.tabata_rounds ?? ''}
              onChange={(e) => patch({ tabata_rounds: e.target.value })}
              aria-label="Tabata rounds"
            />
          </div>
          <span className="label">
            Preview:{' '}
            {(() => {
              const w = num(metadata.tabata_work_seconds, 20);
              const r = num(metadata.tabata_rest_seconds, 10);
              const rounds = num(metadata.tabata_rounds, 8);
              const totalMin = Math.round(((w + r) * rounds) / 60);
              return `${rounds} ROUNDS × ${w}S WORK / ${r}S REST = ${totalMin} MIN TOTAL`;
            })()}
          </span>
        </>
      )}

      {(structure === 'superset' || structure === 'circuit' || structure === 'ladder') && (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input
            className="field num"
            type="number"
            min={0}
            placeholder="Rounds"
            value={metadata.rounds ?? ''}
            onChange={(e) => patch({ rounds: e.target.value })}
            aria-label="Rounds"
          />
          {timing === 'straight_set' && (
            <input
              className="field num"
              type="number"
              min={0}
              placeholder="Rest between rounds (s)"
              value={metadata.rest_after_round ?? ''}
              onChange={(e) => patch({ rest_after_round: e.target.value })}
              aria-label="Rest between rounds"
            />
          )}
        </div>
      )}

      {structure === 'ladder' && (
        <>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input
              className="field num"
              type="number"
              min={0}
              placeholder="Starting reps"
              value={metadata.ladder_start ?? ''}
              onChange={(e) => patch({ ladder_start: e.target.value })}
              aria-label="Ladder starting reps"
            />
            <input
              className="field num"
              type="number"
              min={0}
              placeholder="Step per round"
              value={metadata.ladder_sub ?? ''}
              onChange={(e) => patch({ ladder_sub: e.target.value })}
              aria-label="Ladder step"
            />
            <select
              className="field"
              value={metadata.ladder_direction ?? 'down'}
              onChange={(e) => patch({ ladder_direction: e.target.value as 'down' | 'up' })}
              aria-label="Ladder direction"
            >
              <option value="down">Drop ▼</option>
              <option value="up">Climb ▲</option>
            </select>
          </div>
          {metadata.rounds && metadata.ladder_start && (
            <span className="label">
              {BlockConceptParser.getLadderSequence(metadata) &&
                `${metadata.rounds} rounds: ${BlockConceptParser.getLadderSequence(metadata)}`}
            </span>
          )}
        </>
      )}

      {warnStructure && (
        <span style={{ color: 'var(--warn)', fontSize: 12 }}>{warnStructure}</span>
      )}

      <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 8 }}>
        <label className="row" style={{ gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={!!metadata.is_tier_trial}
            onChange={(e) => patch({ is_tier_trial: e.target.checked })}
          />
          Set as strength tier trial route
        </label>
        {metadata.is_tier_trial && (
          <select
            className="field"
            style={{ marginTop: 6 }}
            value={metadata.tier_trial_tier ?? ''}
            onChange={(e) =>
              patch({ tier_trial_tier: e.target.value === '' ? undefined : Number(e.target.value) })
            }
            aria-label="Tier trial tier"
          >
            <option value="">Auto (current tier)</option>
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i} value={i}>
                Tier {i}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
