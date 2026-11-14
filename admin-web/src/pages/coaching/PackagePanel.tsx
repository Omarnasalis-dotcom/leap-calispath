import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import {
  cancelCoachingPackage,
  fetchCoachingPackages,
  freezeCoachingPackage,
  setCoachingPackage,
  type CoachingPackage,
} from '@/api/coaching';
import { ConfirmButton, ErrorNote } from '@/components/bits';
import { useToast } from '@/components/Toast';

// The client's coaching package: the online coaching they pay the coach for
// directly. The coach enters it here; the hourly coach reminders use it
// (2 weeks left, 1 week left, the day it expires). An expired package is
// only flagged: the program keeps running.

const LENGTHS = [1, 2, 3, 6] as const;
const CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR', 'AED'] as const;

/** "3,000 EGP" */
export function formatAmount(amount: number | null, currency: string): string | null {
  if (amount == null) return null;
  return `${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

/** Today as YYYY-MM-DD in this browser's timezone. */
function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** start + n months, kept inside the month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(startIso: string, months: number): string {
  const s = parse(startIso);
  const target = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(s.getUTCDate(), lastDay));
  return iso(target);
}

const daysBetween = (fromIso: string, toIso: string) => Math.round((parse(toIso).getTime() - parse(fromIso).getTime()) / 86_400_000);

export function formatDay(isoDate: string): string {
  return parse(isoDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** "17 days left", "ends today", "expired 3 days ago", "starts in 5 days". */
export function packageState(p: { starts_on: string; ends_on: string }): { text: string; tone: 'ok' | 'warn' | 'expired' } {
  const today = todayIso();
  const left = daysBetween(today, p.ends_on);
  if (left < 0) return { text: `expired ${-left} day${left === -1 ? '' : 's'} ago`, tone: 'expired' };
  if (left === 0) return { text: 'expires today', tone: 'expired' };
  const toStart = daysBetween(today, p.starts_on);
  if (toStart > 0) return { text: `starts in ${toStart} day${toStart === 1 ? '' : 's'}`, tone: 'ok' };
  return { text: `${left} day${left === 1 ? '' : 's'} left`, tone: left <= 14 ? 'warn' : 'ok' };
}

type Mode =
  | { kind: 'new' }
  | { kind: 'renew'; after: CoachingPackage }
  | { kind: 'edit'; pkg: CoachingPackage }
  | { kind: 'freeze'; pkg: CoachingPackage };

const addDays = (startIso: string, days: number) => iso(new Date(parse(startIso).getTime() + days * 86_400_000));

/** A freeze running today: "frozen until 4 Dec 2026". */
function activeFreeze(p: CoachingPackage): string | null {
  const today = todayIso();
  for (const f of p.freezes ?? []) {
    const last = addDays(f.starts_on, f.weeks * 7 - 1);
    if (f.starts_on <= today && today <= last) return last;
  }
  return null;
}

const freezeSummary = (p: CoachingPackage) => {
  const weeks = (p.freezes ?? []).reduce((n, f) => n + f.weeks, 0);
  return weeks > 0 ? `incl. ${weeks}-week freeze${(p.freezes ?? []).length > 1 ? 's' : ''}` : null;
};

/** Freeze 1-4 weeks: the package end moves later by that many weeks. */
function FreezeForm({ pkg, onDone, onCancel }: { pkg: CoachingPackage; onDone: (message: string) => void; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const today = todayIso();
  const [start, setStart] = useState(today < pkg.starts_on ? pkg.starts_on : today > pkg.ends_on ? pkg.ends_on : today);
  const [weeks, setWeeks] = useState(1);
  const newEnd = addDays(pkg.ends_on, weeks * 7);
  const invalid = !start || start < pkg.starts_on || start > pkg.ends_on;

  const save = useMutation({
    mutationFn: () => freezeCoachingPackage(pkg.id, start, weeks),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['coaching-packages'] }),
        queryClient.invalidateQueries({ queryKey: ['coach-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['current-packages'] }),
      ]);
      onDone(`Frozen ${weeks} week${weeks === 1 ? '' : 's'}. Package now ends ${formatDay(newEnd)}.`);
    },
  });

  return (
    <form
      className="pkg-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) save.mutate();
      }}
    >
      {save.error && <ErrorNote error={save.error} />}
      <div className="pkg-form-row">
        <label className="pkg-field">
          <span className="label">Freeze from</span>
          <input
            type="date"
            className="field"
            value={start}
            min={pkg.starts_on}
            max={pkg.ends_on}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </label>
        <div className="pkg-field">
          <span className="label">For</span>
          <div className="seg" role="group" aria-label="Freeze length">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} type="button" className="seg-item" aria-pressed={weeks === n} onClick={() => setWeeks(n)}>
                {n} wk
              </button>
            ))}
          </div>
        </div>
      </div>
      {!invalid && (
        <p className="pkg-hint">
          Frozen {formatDay(start)} – {formatDay(addDays(start, weeks * 7 - 1))}. The package will end{' '}
          <strong>{formatDay(newEnd)}</strong> instead of {formatDay(pkg.ends_on)}, and its reminders move with it.
        </p>
      )}
      <div className="pkg-form-actions">
        <button type="submit" className="btn small primary" disabled={invalid || save.isPending}>
          {save.isPending ? 'Freezing…' : `Freeze ${weeks} week${weeks === 1 ? '' : 's'}`}
        </button>
        <button type="button" className="btn small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PackageForm({
  mode,
  coachId,
  warriorId,
  onDone,
  onCancel,
}: {
  mode: Mode;
  coachId: string;
  warriorId: string;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  // A renewal starts where the current one ends (or today if it's already over).
  const initialStart =
    mode.kind === 'edit'
      ? mode.pkg.starts_on
      : mode.kind === 'renew' && mode.after.ends_on > todayIso()
        ? mode.after.ends_on
        : todayIso();
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(mode.kind === 'edit' ? mode.pkg.ends_on : addMonths(initialStart, 1));
  const [months, setMonths] = useState<number | null>(mode.kind === 'edit' ? null : 1);
  const [note, setNote] = useState(mode.kind === 'edit' ? mode.pkg.note ?? '' : '');
  // A renewal suggests the same price and currency as the package before it.
  const prior = mode.kind === 'edit' ? mode.pkg : mode.kind === 'renew' ? mode.after : null;
  const [amount, setAmount] = useState(prior?.amount != null ? String(prior.amount) : '');
  const [currency, setCurrency] = useState(prior?.currency ?? 'EGP');
  const amountValue = amount.trim() === '' ? null : Number(amount.replace(/,/g, ''));
  const amountInvalid = amountValue != null && (!Number.isFinite(amountValue) || amountValue < 0);

  const save = useMutation({
    mutationFn: () =>
      setCoachingPackage({
        coachId,
        warriorId,
        startsOn: start,
        endsOn: end,
        note: note.trim() || null,
        packageId: mode.kind === 'edit' ? mode.pkg.id : null,
        amount: amountValue,
        currency,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['coaching-packages'] }),
        queryClient.invalidateQueries({ queryKey: ['coach-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['current-packages'] }),
      ]);
      onDone(mode.kind === 'edit' ? 'Package updated' : mode.kind === 'renew' ? 'Package renewed' : 'Package set');
    },
  });

  const invalid = !start || !end || end < start || amountInvalid;
  const pickLength = (n: number) => {
    setMonths(n);
    setEnd(addMonths(start, n));
  };

  return (
    <form
      className="pkg-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) save.mutate();
      }}
    >
      {save.error && <ErrorNote error={save.error} />}
      <div className="pkg-form-row">
        <label className="pkg-field">
          <span className="label">Starts</span>
          <input
            type="date"
            className="field"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (months && e.target.value) setEnd(addMonths(e.target.value, months));
            }}
            required
          />
        </label>
        <div className="pkg-field">
          <span className="label">Length</span>
          <div className="seg" role="group" aria-label="Package length">
            {LENGTHS.map((n) => (
              <button key={n} type="button" className="seg-item" aria-pressed={months === n} onClick={() => pickLength(n)}>
                {n} mo
              </button>
            ))}
          </div>
        </div>
        <label className="pkg-field">
          <span className="label">Ends</span>
          <input
            type="date"
            className="field"
            value={end}
            min={start}
            onChange={(e) => {
              setEnd(e.target.value);
              setMonths(null);
            }}
            required
          />
        </label>
      </div>
      <div className="pkg-form-row">
        <label className="pkg-field pkg-grow">
          <span className="label">Note (optional)</span>
          <input
            className="field"
            value={note}
            maxLength={300}
            placeholder="e.g. paid cash, 3 months"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label className="pkg-field">
          <span className="label">Paid (optional)</span>
          <span className="pkg-money">
            <input
              className="field num"
              inputMode="decimal"
              value={amount}
              placeholder="0"
              aria-invalid={amountInvalid || undefined}
              aria-label="Amount paid"
              onChange={(e) => setAmount(e.target.value)}
            />
            <select className="field" value={currency} aria-label="Currency" onChange={(e) => setCurrency(e.target.value)}>
              {(CURRENCIES as readonly string[]).includes(currency) ? null : <option value={currency}>{currency}</option>}
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>
      {amountInvalid && <p className="pkg-hint" style={{ color: 'var(--danger)' }}>Enter the amount as a number, e.g. 3000.</p>}
      {!invalid && (
        <p className="pkg-hint">
          {formatDay(start)} – {formatDay(end)} ({daysBetween(start, end)} days). You'll be reminded 2 weeks and 1 week before
          it ends, and on the day it expires.
        </p>
      )}
      <div className="pkg-form-actions">
        <button type="submit" className="btn small primary" disabled={invalid || save.isPending}>
          {save.isPending ? 'Saving…' : mode.kind === 'renew' ? 'Renew' : 'Save'}
        </button>
        <button type="button" className="btn small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** One line with the current package, and the form to set, renew or edit it. */
export function PackagePanel({
  coachId,
  warriorId,
  warriorName,
  canEdit,
}: {
  coachId: string;
  warriorId: string;
  warriorName: string | null;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<Mode | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const q = useQuery({
    queryKey: ['coaching-packages', coachId, warriorId],
    queryFn: () => fetchCoachingPackages(coachId, warriorId),
  });
  const packages = q.data ?? [];
  const current = packages[0];
  const earlier = packages.slice(1);
  const state = current ? packageState(current) : null;

  return (
    <section className="pkg" aria-label="Coaching package">
      <div className="pkg-line">
        <span className="label">Coaching package</span>
        {q.isLoading ? (
          <span className="pkg-dim">Loading…</span>
        ) : current ? (
          <>
            <span className="pkg-dates">
              {formatDay(current.starts_on)} – {formatDay(current.ends_on)}
            </span>
            <span className={`pkg-state ${state!.tone}`}>{state!.text}</span>
            {activeFreeze(current) && <span className="pkg-frozen">frozen until {formatDay(activeFreeze(current)!)}</span>}
            {freezeSummary(current) && <span className="pkg-dim">· {freezeSummary(current)}</span>}
            {current.amount != null && <span className="pkg-dim num">· {formatAmount(current.amount, current.currency)}</span>}
            {current.note && <span className="pkg-dim">· {current.note}</span>}
          </>
        ) : (
          <span className="pkg-dim">Not set for {warriorName ?? 'this client'}</span>
        )}
        <span className="pkg-spacer" />
        {canEdit && !mode && (
          <span className="pkg-actions">
            {current ? (
              <>
                <button type="button" className="btn small primary" onClick={() => setMode({ kind: 'renew', after: current })}>
                  Renew
                </button>
                <button type="button" className="btn small" onClick={() => setMode({ kind: 'freeze', pkg: current })}>
                  Freeze
                </button>
                <button type="button" className="btn small" onClick={() => setMode({ kind: 'edit', pkg: current })}>
                  Edit
                </button>
                <ConfirmButton
                  label="Remove"
                  title="Remove this package?"
                  body="Use this for a package entered by mistake. Its reminders stop. To end coaching, close the program instead."
                  confirmLabel="Remove"
                  onConfirm={async () => {
                    await cancelCoachingPackage(current.id);
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ['coaching-packages'] }),
                      queryClient.invalidateQueries({ queryKey: ['coach-dashboard'] }),
                      queryClient.invalidateQueries({ queryKey: ['current-packages'] }),
                    ]);
                    toast('Package removed');
                  }}
                />
              </>
            ) : (
              <button type="button" className="btn small primary" onClick={() => setMode({ kind: 'new' })}>
                Set package
              </button>
            )}
          </span>
        )}
      </div>
      {q.error && <ErrorNote error={q.error} />}
      {mode?.kind === 'freeze' && (
        <FreezeForm
          pkg={mode.pkg}
          onCancel={() => setMode(null)}
          onDone={(message) => {
            setMode(null);
            toast(message);
          }}
        />
      )}
      {mode && mode.kind !== 'freeze' && (
        <PackageForm
          key={mode.kind}
          mode={mode}
          coachId={coachId}
          warriorId={warriorId}
          onCancel={() => setMode(null)}
          onDone={(message) => {
            setMode(null);
            toast(message);
          }}
        />
      )}
      {earlier.length > 0 && (
        <div className="pkg-history">
          <button
            type="button"
            className="wl-notes-toggle"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((s) => !s)}
          >
            <ChevronDown className={showHistory ? 'open' : undefined} aria-hidden="true" />
            <span className="label">Earlier packages · {earlier.length}</span>
          </button>
          {showHistory && (
            <ul>
              {earlier.map((p) => (
                <li key={p.id}>
                  {formatDay(p.starts_on)} – {formatDay(p.ends_on)}
                  {p.amount != null ? <span className="pkg-dim num"> · {formatAmount(p.amount, p.currency)}</span> : null}
                  {freezeSummary(p) ? <span className="pkg-dim"> · {freezeSummary(p)}</span> : null}
                  {p.note ? <span className="pkg-dim"> · {p.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
