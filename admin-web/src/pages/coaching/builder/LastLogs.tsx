import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertCircle, X } from 'lucide-react';
import type { WarriorProgressLog, WarriorProgressSet } from '@/api/coaching';
import { formatDate } from '@/shared/constants';
import { SetChip, splitNote } from '../WeekLogs';

// Client programs (ClientProgramGrid) and week logs (ProgressDrawer) provide
// it: each block gets a small button with the last earlier log of the same
// day + block, so the coach sees what happened last time.

interface LastLogsState {
  find: (dayName: string, blockName: string) => { log: WarriorProgressLog; week: number } | null;
  /** "Open week logs →" in the card; null where the card already sits in them. */
  progressPath: string | null;
}

const Ctx = createContext<LastLogsState | null>(null);

const norm = (s: string) => s.trim().toLowerCase();
const FEEL: Record<string, string> = { hard: 'Hard', ok: 'OK', good: 'Good', strong: 'Strong', beast: 'Beast' };
const MISSED: Record<string, string> = { no_time: 'No time', too_tired: 'Too tired', injury: 'Injury', other: 'Other' };

export function LastLogsProvider({
  logs,
  activeWeek,
  progressPath,
  children,
}: {
  logs: WarriorProgressLog[];
  activeWeek: number;
  progressPath: string | null;
  children: ReactNode;
}) {
  // block_name is "<Day> | <Block>"; match on both, before the week shown.
  function find(dayName: string, blockName: string) {
    const target = `${norm(dayName)}|${norm(blockName || 'Workout Routine')}`;
    let best: WarriorProgressLog | null = null;
    for (const l of logs) {
      const week = l.week_number ?? 1;
      if (week >= activeWeek || !l.block_name) continue;
      const sep = l.block_name.indexOf(' | ');
      const k = sep === -1 ? `|${norm(l.block_name)}` : `${norm(l.block_name.slice(0, sep))}|${norm(l.block_name.slice(sep + 3))}`;
      if (k !== target) continue;
      const bw = best?.week_number ?? 1;
      if (!best || week > bw || (week === bw && l.completed_at > best.completed_at)) best = l;
    }
    return best ? { log: best, week: best.week_number ?? 1 } : null;
  }
  return <Ctx.Provider value={{ find, progressPath }}>{children}</Ctx.Provider>;
}

function groupSets(sets: WarriorProgressSet[]) {
  const m = new Map<string, WarriorProgressSet[]>();
  for (const s of [...sets].sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0))) {
    const k = s.exercise_name ?? 'Exercise';
    m.set(k, [...(m.get(k) ?? []), s]);
  }
  return [...m.entries()];
}

/** The (!) button for one block; renders nothing outside a client program. */
export function LastLogButton({ dayName, blockName }: { dayName: string; blockName: string }) {
  const ctx = useContext(Ctx);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const found = ctx?.find(dayName, blockName) ?? null;

  // Fixed position under the button, kept inside the window; the day
  // columns scroll sideways, so an in-flow popover would be clipped.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 24);
    setPos({ top: r.bottom + 6, left: Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (!cardRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  if (!ctx) return null;
  const log = found?.log;
  const { results, own } = splitNote(log?.notes ?? null);
  const missed = log?.status === 'missed';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`btn icon ghost last-log-btn${found ? (missed ? ' missed' : ' has-log') : ''}`}
        aria-label={found ? `Last time: ${blockName}` : `No earlier log for ${blockName}`}
        title={found ? `Last time (week ${found.week})` : 'No earlier log for this block'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <AlertCircle />
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={cardRef} className="last-log-card" role="dialog" aria-label="Last time" style={{ top: pos.top, left: pos.left }}>
            <div className="last-log-head">
              <span className="label">{found ? `Last time · week ${found.week}` : 'Last time'}</span>
              <button type="button" className="btn icon ghost" aria-label="Close" onClick={() => setOpen(false)}>
                <X />
              </button>
            </div>
            {!log ? (
              <p className="dim" style={{ margin: 0, fontSize: 13 }}>
                No earlier log for “{blockName}” on {dayName}.
              </p>
            ) : (
              <>
                <div className={`last-log-status ${missed ? 'missed' : 'done'}`}>
                  {missed ? `✕ Missed · ${log.missed_reason ? MISSED[log.missed_reason] ?? log.missed_reason : 'no reason'}` : '✓ Done'}
                  <span className="dim">
                    {' · '}
                    {[formatDate(log.completed_at), log.feel && `Feel ${FEEL[log.feel] ?? log.feel}`, log.rpe != null && `RPE ${log.rpe}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                {!missed && log.sets.length > 0 && (
                  <ul className="last-log-sets">
                    {groupSets(log.sets).map(([name, sets]) => (
                      <li key={name}>
                        <span className="last-log-ex">{name}</span>
                        <span className="set-chips">
                          {sets.map((s, i) => (
                            <SetChip key={i} s={s} targetReps={null} />
                          ))}
                        </span>
                        {log.exercise_rpe?.[name] != null && <span className="dim num">RPE {log.exercise_rpe[name]}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {!missed && log.sets.length === 0 && results.length === 0 && <p className="dim" style={{ margin: 0, fontSize: 13 }}>No sets entered.</p>}
                {results.map((r) => (
                  <div key={r} className="last-log-result">
                    {r}
                  </div>
                ))}
                {(own || log.missed_detail) && <div className="wl-note">“{own || log.missed_detail}”</div>}
              </>
            )}
            {ctx.progressPath && (
              <Link to={ctx.progressPath} className="last-log-link">
                Open week logs →
              </Link>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
