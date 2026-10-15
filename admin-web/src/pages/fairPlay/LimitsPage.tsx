import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ErrorNote } from '@/components/bits';
import { fetchLimits, fetchSettings, updateLimit, updateSetting, type FairPlayLimit } from '@/api/fairPlay';
import { useFairPlayInvalidate } from './parts';

const SETTING_LABEL: Record<string, string> = {
  jump_pct: 'Jump: new best above own best by more than (%)',
  jump_min: 'Jump: ignore while the previous best is below',
  strength_jump_pct: 'Strength jump: trial faster than own best by more than (%)',
  strength_floor_margin_pct: 'Strength: within this % of the tier minimum',
  burst_per_hour: 'Burst: more results than this in one hour',
  weekly_min_entries: 'Weekly: compare only with at least this many entries',
  weekly_reps_median_x: 'Weekly reps: above this × the median',
  weekly_time_median_frac: 'Weekly time: below this fraction of the median',
  inactive_days: 'Inactive: days without activity',
};

const AREA_TITLE: Record<FairPlayLimit['area'], string> = { static: 'Static (seconds)', endurance: 'Endurance (reps in 60 s)', power: 'Power (1RM)' };

/** Thresholds used to flag results (review only). Changes apply to new results. */
export function LimitsPage() {
  const invalidate = useFairPlayInvalidate();
  const limitsQ = useQuery({ queryKey: ['fair-play', 'limits'], queryFn: fetchLimits });
  const settingsQ = useQuery({ queryKey: ['fair-play', 'settings'], queryFn: fetchSettings });
  const saveLimit = useMutation({
    mutationFn: (p: { area: string; movement: string; patch: Parameters<typeof updateLimit>[2] }) => updateLimit(p.area, p.movement, p.patch),
    onSuccess: invalidate,
  });
  const saveSetting = useMutation({ mutationFn: (p: { key: string; value: number }) => updateSetting(p.key, p.value), onSuccess: invalidate });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Fair Play · Limits</h1>
          <div className="sub">
            A result above <b>Flag</b> is queued for review; at <b>Strong</b> it's marked strong. Nobody is hidden automatically. Changes apply to
            new results. Values save when you leave the field.
          </div>
        </div>
      </div>
      {(limitsQ.error || settingsQ.error || saveLimit.error || saveSetting.error) && (
        <ErrorNote error={limitsQ.error ?? settingsQ.error ?? saveLimit.error ?? saveSetting.error} />
      )}

      <section className="panel">
        <div className="panel-head"><span style={{ fontWeight: 700 }}>Rules for every area</span></div>
        <div className="panel-body" style={{ display: 'grid', gap: 8 }}>
          {(settingsQ.data ?? []).map((s) => (
            <div key={s.key} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{SETTING_LABEL[s.key] ?? s.key}</span>
              <NumberCell value={s.value} onSave={(v) => saveSetting.mutate({ key: s.key, value: v })} />
            </div>
          ))}
        </div>
      </section>

      {(['static', 'endurance', 'power'] as const).map((area) => (
        <section key={area} className="panel">
          <div className="panel-head"><span style={{ fontWeight: 700 }}>{AREA_TITLE[area]}</span></div>
          <div className="panel-body">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Movement</th>
                    <th>Flag above</th>
                    <th>Strong at</th>
                    {area === 'power' && <th>Flag (kg, no bodyweight)</th>}
                    {area === 'power' && <th>Strong (kg, no bodyweight)</th>}
                  </tr>
                </thead>
                <tbody>
                  {(limitsQ.data ?? []).filter((l) => l.area === area).map((l) => (
                    <tr key={l.movement_id}>
                      <td>
                        {l.movement_id === '*' ? 'Any other movement' : l.movement_id.replace(/_1rm$/, '').replace(/_/g, ' ')}
                        <span className="label" style={{ marginLeft: 6 }}>
                          {l.kind === 'ceiling_fraction' ? '(fraction of its ceiling)' : l.kind === 'bw_ratio' ? '(× bodyweight)' : ''}
                        </span>
                      </td>
                      <td><NumberCell value={l.flag_value} onSave={(v) => saveLimit.mutate({ area, movement: l.movement_id, patch: { flag_value: v } })} /></td>
                      <td><NumberCell value={l.strong_value} onSave={(v) => saveLimit.mutate({ area, movement: l.movement_id, patch: { strong_value: v } })} /></td>
                      {area === 'power' && <td><NumberCell value={l.flag_kg ?? 0} onSave={(v) => saveLimit.mutate({ area, movement: l.movement_id, patch: { flag_kg: v } })} /></td>}
                      {area === 'power' && <td><NumberCell value={l.strong_kg ?? 0} onSave={(v) => saveLimit.mutate({ area, movement: l.movement_id, patch: { strong_kg: v } })} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function NumberCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  return (
    <input
      className="field"
      style={{ width: 96, textAlign: 'right' }}
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = Number(draft);
        if (Number.isFinite(v) && v >= 0 && v !== Number(value)) onSave(v);
        else setDraft(String(value));
      }}
    />
  );
}
