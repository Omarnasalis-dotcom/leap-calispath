import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { formatDate } from '@/shared/constants';
import type { BuilderBlock, BuilderExercise } from './types';

// Client programs only (ClientProgramGrid provides it; the template builder
// and Workout Content don't, so nothing there warns). A block the client
// already completed is history: swapping or removing one of its exercises,
// or changing its numbers, makes their finished workout show something they
// didn't do. The coach is asked once per block per load, then left alone.

interface LoggedBlocksState {
  athleteName: string;
  logged: Map<string, string>; // block db_id → latest completed_at
  savedExerciseKeys: Set<string>; // exercise rows as loaded — new rows aren't history
  acknowledged: Set<string>;
  acknowledge: (blockDbId: string) => void;
}

const LoggedBlocksCtx = createContext<LoggedBlocksState | null>(null);

export function LoggedBlocksProvider({
  athleteName,
  logged,
  savedExerciseKeys,
  acknowledged,
  onAcknowledge,
  children,
}: {
  athleteName: string;
  logged: Map<string, string>;
  savedExerciseKeys: Set<string>;
  acknowledged: Set<string>;
  onAcknowledge: (blockDbId: string) => void;
  children: ReactNode;
}) {
  return (
    <LoggedBlocksCtx.Provider value={{ athleteName, logged, savedExerciseKeys, acknowledged, acknowledge: onAcknowledge }}>
      {children}
    </LoggedBlocksCtx.Provider>
  );
}

// The exercise fields whose change rewrites a logged block's history.
const GUARDED_FIELDS: Array<keyof BuilderExercise> = ['exercise_id', 'sets', 'reps', 'rest_seconds', 'hold_seconds'];

export function touchesLoggedFields(patch: Partial<BuilderExercise>): boolean {
  return GUARDED_FIELDS.some((f) => f in patch);
}

type PendingChange = { headline: string; apply: () => void };

/** For one block: when it was logged (if it was), and `guard`, which runs a
 * change to one of its saved exercises straight away or holds it behind the
 * warning. Render `dialog`. */
export function useLoggedBlockGuard(block: BuilderBlock) {
  const ctx = useContext(LoggedBlocksCtx);
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);

  const loggedAt = ctx && block.db_id ? ctx.logged.get(block.db_id) : undefined;

  function guard(exerciseKey: string, headline: string, apply: () => void) {
    if (
      !ctx ||
      !block.db_id ||
      !loggedAt ||
      !ctx.savedExerciseKeys.has(exerciseKey) ||
      ctx.acknowledged.has(block.db_id)
    ) {
      apply();
      return;
    }
    setPending({ headline, apply });
    // Closing the dialog refocuses whatever had focus; for the exercise
    // picker that reopens its dropdown, empty, after Cancel.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    ref.current?.showModal();
  }

  function close() {
    ref.current?.close();
    setPending(null);
  }

  const athlete = ctx?.athleteName || 'This client';
  const dialog = (
    <dialog className="confirm" ref={ref} onClose={() => setPending(null)}>
      <h2 style={{ marginBottom: 8 }}>{pending?.headline}</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, margin: '0 0 10px' }}>
        {athlete} already logged “{block.name || 'this block'}” on {formatDate(loggedAt)}. Changing it now
        rewrites that finished workout: it will show the new exercise or numbers, not what {athlete} actually did.
        Their logged sets stay in their charts.
      </p>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, margin: '0 0 16px' }}>
        To keep the history as it is, make this change in next week instead.
      </p>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn small" onClick={close}>
          Cancel
        </button>
        <button
          className="btn small danger"
          onClick={() => {
            if (pending && block.db_id) {
              ctx?.acknowledge(block.db_id);
              pending.apply();
            }
            close();
          }}
        >
          Change anyway
        </button>
      </div>
    </dialog>
  );

  return { loggedAt, guard, dialog };
}
