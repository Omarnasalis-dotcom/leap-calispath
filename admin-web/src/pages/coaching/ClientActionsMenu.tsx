import { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

// The "⋯" menu on a Coaching dashboard client: unassign (close the program,
// workouts kept), pause (hidden from the athlete's app until activated
// again) or delete the program and its logs. Each asks first, in the same
// native <dialog> as ConfirmButton.

type ActionKey = 'unassign' | 'pause' | 'delete';

interface Action {
  key: ActionKey;
  label: string;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  run: () => Promise<void>;
}

export function ClientActionsMenu({
  name,
  canEdit,
  canDelete,
  onUnassign,
  onPause,
  onDelete,
}: {
  /** The athlete's name, for the menu label and the confirm text. */
  name: string;
  canEdit: boolean;
  /** Delete: the program's own coach or an admin (delete_coach_client_data). */
  canDelete: boolean;
  onUnassign: () => Promise<void>;
  onPause: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuId = useId();

  // Close on a click outside or Escape (focus back on the ⋯ button).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // First item gets focus, like a native menu.
    wrapRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const actions: Action[] = [
    {
      key: 'unassign',
      label: 'Unassign client',
      title: `Unassign ${name}?`,
      body: `Their program moves to Completed: it leaves this dashboard and ${name}'s app, and every workout they logged is kept. You can switch it back on from Clients.`,
      confirmLabel: 'Unassign',
      disabled: !canEdit,
      run: onUnassign,
    },
    {
      key: 'pause',
      label: 'Pause program',
      title: `Pause ${name}'s program?`,
      body: `${name} won't see it in the app until you activate it again from Clients. It leaves this dashboard while paused, and every workout they logged is kept.`,
      confirmLabel: 'Pause',
      disabled: !canEdit,
      run: onPause,
    },
    {
      key: 'delete',
      label: 'Delete program',
      title: `Delete ${name}'s program?`,
      body: `Removes the assignment, their copy of the program and every workout they logged on it. This cannot be undone.`,
      confirmLabel: 'Delete program',
      danger: true,
      disabled: !canEdit || !canDelete,
      disabledReason: canEdit && !canDelete ? "Only the program's coach or an admin can delete it" : undefined,
      run: onDelete,
    },
  ];

  const choose = (a: Action) => {
    setOpen(false);
    setError(null);
    setPending(a);
    // After the menu has closed.
    window.requestAnimationFrame(() => dialogRef.current?.showModal());
  };

  return (
    <div className="cam" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="btn icon cam-trigger"
        aria-label={`More actions for ${name}`}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal aria-hidden="true" />
      </button>
      {open && (
        <div className="cam-menu" role="menu" id={menuId} aria-label={`Actions for ${name}`}>
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              className={`cam-item${a.danger ? ' danger' : ''}`}
              disabled={a.disabled}
              title={a.disabledReason}
              onClick={() => choose(a)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      <dialog className="confirm" ref={dialogRef} onClose={() => setPending(null)}>
        {pending && (
          <>
            <h2 style={{ marginBottom: 8 }}>{pending.title}</h2>
            <p style={{ color: 'var(--ink-2)', fontSize: 13, margin: '0 0 16px' }}>{pending.body}</p>
            {error && (
              <p role="alert" style={{ color: 'var(--danger, #b42318)', fontSize: 13, margin: '0 0 16px' }}>
                {error}
              </p>
            )}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn small" onClick={() => dialogRef.current?.close()} disabled={busy}>
                Cancel
              </button>
              <button
                className={`btn small ${pending.danger ? 'danger' : 'primary'}`}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await pending.run();
                    dialogRef.current?.close();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Action failed. Please try again.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Working…' : pending.confirmLabel}
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
