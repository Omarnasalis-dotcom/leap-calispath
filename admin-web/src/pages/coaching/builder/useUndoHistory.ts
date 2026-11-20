import { useCallback, useEffect, useRef, useState } from 'react';

// Undo for the program builders (owner, 2026-11-20). Unsaved edits only:
// the history starts again whenever the program is loaded or saved, since a
// saved change is already in the athlete's program.
//
// record() is called just before a change, with the state as it is now.
// Changes that arrive as a burst under one key (typing reps into a field
// fires an edit per keystroke) collapse into one step, so Undo takes back
// the whole edit, not one character.
const MAX_STEPS = 50;
const BURST_MS = 1000;

function isTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function useUndoHistory<T>(current: T, restore: (snapshot: T) => void, opts: { disabled?: boolean } = {}) {
  const latest = useRef(current);
  latest.current = current;
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const stack = useRef<T[]>([]);
  const burst = useRef<{ key: string; at: number } | null>(null);
  const [steps, setSteps] = useState(0);

  const record = useCallback((burstKey?: string) => {
    const now = Date.now();
    const last = burst.current;
    burst.current = burstKey ? { key: burstKey, at: now } : null;
    if (burstKey && last && last.key === burstKey && now - last.at < BURST_MS) return;
    stack.current = [...stack.current, latest.current].slice(-MAX_STEPS);
    setSteps(stack.current.length);
  }, []);

  const undo = useCallback(() => {
    const previous = stack.current[stack.current.length - 1];
    if (previous === undefined) return;
    stack.current = stack.current.slice(0, -1);
    burst.current = null;
    setSteps(stack.current.length);
    restoreRef.current(previous);
  }, []);

  const reset = useCallback(() => {
    stack.current = [];
    burst.current = null;
    setSteps(0);
  }, []);

  // Ctrl+Z / Cmd+Z, except inside a text field, where the browser's own
  // undo for that field still works.
  const disabled = !!opts.disabled;
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
      if (isTextField(e.target) || stack.current.length === 0) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, undo]);

  return { canUndo: steps > 0, record, undo, reset };
}
