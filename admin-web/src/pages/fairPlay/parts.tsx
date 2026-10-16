import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, ConfirmButton, ErrorNote } from '@/components/bits';
import { formatDateTime } from '@/shared/constants';
import {
  AREA_LABEL, dismissFlags, formatEvidence, formatFlagValue, formatMovement, holdAthlete, liftHold, RULE_LABEL,
  type FairPlayArea, type FairPlayFlag, type HoldScope, type LeaderboardHold,
} from '@/api/fairPlay';
import { HOLD_NOTE_PRESETS, noteLabel, TEMPLATE_PREFIX, type NotePreset } from '@/shared/fairPlayNotes';

/** Invalidate every Fair Play view after an action. */
export function useFairPlayInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['fair-play'] });
}

export function SeverityBadge({ severity }: { severity: FairPlayFlag['severity'] }) {
  return severity === 'strong' ? <Badge tone="warn">Strong flag</Badge> : <Badge>Flag</Badge>;
}

/** Flags with a checkbox each (selection drives the actions). */
export function FlagTable({ flags, selected, onToggle, showStatus }: {
  flags: FairPlayFlag[];
  selected?: Set<number>;
  onToggle?: (id: number) => void;
  showStatus?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {onToggle && <th style={{ width: 28 }} />}
            <th>Area</th>
            <th>Result</th>
            <th>Rule</th>
            <th>Evidence</th>
            <th>Level</th>
            {showStatus && <th>Status</th>}
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.id}>
              {onToggle && (
                <td>
                  <input type="checkbox" checked={selected?.has(f.id) ?? false} onChange={() => onToggle(f.id)} aria-label={`Select flag ${f.id}`} />
                </td>
              )}
              <td>{AREA_LABEL[f.area]}</td>
              <td style={{ fontWeight: 600 }}>
                {formatMovement(f)} {formatFlagValue(f) && <span style={{ color: 'var(--ink-2)' }}>· {formatFlagValue(f)}</span>}
              </td>
              <td>{RULE_LABEL[f.rule]}</td>
              <td style={{ color: 'var(--ink-2)', fontSize: 13 }}>{formatEvidence(f)}</td>
              <td><SeverityBadge severity={f.severity} /></td>
              {showStatus && <td>{f.status}</td>}
              <td className="label">{formatDateTime(f.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Decide on selected flags: dismiss (looks real), hide from one area, hide
 * from all boards, or permanent ban. Strike and note apply to the hold.
 * Nothing changes for the athlete until one of these is pressed.
 */
export function ActionsBar({ userId, flags, selected }: { userId: string; flags: FairPlayFlag[]; selected: Set<number> }) {
  const invalidate = useFairPlayInvalidate();
  const [note, setNote] = useState('');
  const [strike, setStrike] = useState(false);
  const ids = flags.filter((f) => selected.has(f.id)).map((f) => f.id);
  const areas = Array.from(new Set(flags.filter((f) => selected.has(f.id)).map((f) => f.area))) as FairPlayArea[];

  const dismiss = useMutation({ mutationFn: () => dismissFlags(ids, note), onSuccess: invalidate });
  const hold = useMutation({
    mutationFn: (p: { scope: HoldScope; permanent: boolean }) =>
      holdAthlete({ userId, scope: p.scope, flagIds: ids, strike, permanent: p.permanent, note }),
    onSuccess: invalidate,
  });
  const busy = dismiss.isPending || hold.isPending;
  const none = ids.length === 0;

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      {(dismiss.error || hold.error) && <ErrorNote error={dismiss.error ?? hold.error} />}
      <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
        <NotePicker presets={HOLD_NOTE_PRESETS} value={note} onChange={setNote} placeholder="Note to the athlete (shown in the app)" />
        <label className="row" style={{ gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={strike} onChange={(e) => setStrike(e.target.checked)} /> Counts as a strike
        </label>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button className="btn small" disabled={busy || none} onClick={() => dismiss.mutate()}>Dismiss (looks real)</button>
        {areas.map((a) => (
          <ConfirmButton
            key={a}
            label={`Hide from ${AREA_LABEL[a]}`}
            title={`Hide from ${AREA_LABEL[a]} leaderboards?`}
            body={`Others stop seeing this athlete on ${AREA_LABEL[a]} boards${a === 'static' || a === 'power' || a === 'endurance' ? ' and Well-Rounded' : ''}. They can accept a reset of the ${ids.length} flagged result(s) or appeal.${strike ? ' Counts as a strike.' : ''}`}
            confirmLabel="Hide"
            disabled={busy || none}
            onConfirm={async () => { await hold.mutateAsync({ scope: a, permanent: false }); }}
          />
        ))}
        <ConfirmButton
          label="Hide from all leaderboards"
          title="Hide from all leaderboards?"
          body={`Others stop seeing this athlete on every board. They can accept a reset of the ${ids.length} flagged result(s) or appeal.${strike ? ' Counts as a strike.' : ''}`}
          confirmLabel="Hide everywhere"
          disabled={busy || none}
          onConfirm={async () => { await hold.mutateAsync({ scope: 'all', permanent: false }); }}
        />
        <ConfirmButton
          label="Permanent ban"
          danger
          title="Ban from leaderboards permanently?"
          body="Hidden from every board forever. A reset can't undo it; the athlete can appeal once. The app stays usable."
          confirmLabel="Ban permanently"
          disabled={busy}
          onConfirm={async () => { await hold.mutateAsync({ scope: 'all', permanent: true }); }}
        />
      </div>
    </div>
  );
}

/**
 * A note to the athlete: a preset (stored as tpl:<id>, shown in the athlete's
 * own language) or a custom note (shown exactly as typed).
 */
export function NotePicker({ presets, value, onChange, placeholder }: {
  presets: NotePreset[]; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  const [custom, setCustom] = useState(false);
  const preset = value.startsWith(TEMPLATE_PREFIX) ? presets.find((p) => TEMPLATE_PREFIX + p.id === value) : undefined;
  const choice = preset ? preset.id : custom ? 'custom' : '';
  return (
    <div style={{ display: 'grid', gap: 6, flex: 1, minWidth: 220 }}>
      <select
        className="field"
        value={choice}
        onChange={(e) => {
          const v = e.target.value;
          setCustom(v === 'custom');
          onChange(v === '' || v === 'custom' ? '' : TEMPLATE_PREFIX + v);
        }}
      >
        <option value="">No note</option>
        {presets.map((p) => <option key={p.id} value={p.id}>{p.en}</option>)}
        <option value="custom">Custom note…</option>
      </select>
      {choice === 'custom' && (
        <input className="field" placeholder={`${placeholder} — shown exactly as typed`} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      {preset && (
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', display: 'grid', gap: 2 }}>
          <span>The athlete sees it in their app language:</span>
          <span dir="rtl" style={{ textAlign: 'right' }}>{preset.ar}</span>
        </div>
      )}
    </div>
  );
}

export function HoldRow({ hold, showName }: { hold: LeaderboardHold; showName?: boolean }) {
  const invalidate = useFairPlayInvalidate();
  const lift = useMutation({ mutationFn: () => liftHold(hold.id), onSuccess: invalidate });
  const tone = hold.status === 'permanent' ? 'warn' : hold.status === 'active' ? 'accent' : undefined;
  return (
    <div className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {showName && <span style={{ fontWeight: 600 }}>{hold.profiles?.display_name ?? hold.user_id}</span>}
        <Badge tone={tone}>{hold.status}</Badge>
        <span>{AREA_LABEL[hold.scope]}</span>
        <span className="label">{hold.reason === 'inactive' ? 'inactive' : `${hold.flag_ids.length} flagged`}</span>
        {hold.counts_as_strike && <Badge tone="warn">strike</Badge>}
        {hold.admin_note && <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>“{noteLabel(hold.admin_note)}”</span>}
        {hold.lifted_reason && <span className="label">lifted: {hold.lifted_reason}</span>}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <span className="label">{formatDateTime(hold.created_at)}</span>
        {hold.status !== 'lifted' && (
          <ConfirmButton
            label="Lift"
            title="Lift this hold?"
            body="The athlete becomes visible again on these boards. No results are changed."
            confirmLabel="Lift"
            disabled={lift.isPending}
            onConfirm={() => lift.mutateAsync()}
          />
        )}
      </div>
    </div>
  );
}
