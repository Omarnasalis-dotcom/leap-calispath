import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Keeps unsaved edits from being dropped by accident. While `dirty`:
 * - leaving the page in the app (menu, links, Back) asks first,
 * - closing or reloading the tab gets the browser's own warning,
 * - `confirmDiscard(action)` asks before an in-page action that would
 *   throw the edits away (closing an editor, switching week).
 * Render `dialog` once in the page.
 */
export function useUnsavedChanges(dirty: boolean, what = 'your changes'): {
  dialog: ReactNode;
  confirmDiscard: (action: () => void) => void;
} {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Some browsers still need returnValue set to show the prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const open = blocker.state === 'blocked' || pendingAction !== null;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  function stay() {
    if (blocker.state === 'blocked') blocker.reset();
    setPendingAction(null);
  }

  function leave() {
    const action = pendingAction;
    setPendingAction(null);
    if (blocker.state === 'blocked') blocker.proceed();
    action?.();
  }

  const dialog = (
    <dialog className="confirm" ref={ref} onCancel={(e) => { e.preventDefault(); stay(); }}>
      <h2 style={{ marginBottom: 8 }}>Leave without saving?</h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, margin: '0 0 16px' }}>
        You haven't saved {what}. If you leave now, they're lost.
      </p>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn small" onClick={stay} autoFocus>
          Keep editing
        </button>
        <button className="btn small danger" onClick={leave}>
          Leave without saving
        </button>
      </div>
    </dialog>
  );

  return {
    dialog,
    confirmDiscard: (action) => {
      if (!dirty) action();
      else setPendingAction(() => action);
    },
  };
}
