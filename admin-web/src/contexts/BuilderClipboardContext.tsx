import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ConceptMetadata } from '@/shared/BlockConceptParser';

export interface ClipboardExercise {
  exercise_id: string;
  exercise_name?: string;
  sets: number | null;
  reps: number | null;
  rest_seconds: number | null;
  hold_seconds: number | null;
  is_weighted?: boolean;
  notes: string | null;
}

export interface ClipboardBlock {
  name: string;
  notes: string;
  metadata: ConceptMetadata;
  exercises: ClipboardExercise[];
}

export interface ClipboardDay {
  name: string;
  focus_tag?: ConceptMetadata['focus_tag'];
  blocks: ClipboardBlock[];
}

export interface ClipboardWeek {
  days: ClipboardDay[];
}

export type ClipboardEntry =
  | { type: 'block'; data: ClipboardBlock }
  | { type: 'day'; data: ClipboardDay }
  | { type: 'week'; data: ClipboardWeek };

interface ClipboardState {
  clipboard: ClipboardEntry | null;
  copyBlock: (block: ClipboardBlock) => void;
  cutBlock: (block: ClipboardBlock, onCut: () => void) => void;
  copyDay: (day: ClipboardDay) => void;
  cutDay: (day: ClipboardDay, onCut: () => void) => void;
  copyWeek: (week: ClipboardWeek) => void;
  clear: () => void;
}

const BuilderClipboardCtx = createContext<ClipboardState | null>(null);

// Kept in the browser, not only in this tab's memory (owner, 2026-11-20): a
// day copied on athlete A's program in one tab could not be pasted into
// athlete B's in another tab, and a refresh lost it. Every admin tab reads
// the same entry and hears changes through the storage event. Storage can
// be blocked (private window, cleared site data): the clipboard then works
// in this tab only, as it did before.
const STORAGE_KEY = 'leap-admin-builder-clipboard';

function isEntry(value: unknown): value is ClipboardEntry {
  if (!value || typeof value !== 'object') return false;
  const { type, data } = value as { type?: unknown; data?: unknown };
  if (!data || typeof data !== 'object') return false;
  if (type === 'block' || type === 'day') return Array.isArray((data as { exercises?: unknown; blocks?: unknown })[type === 'block' ? 'exercises' : 'blocks']);
  if (type === 'week') return Array.isArray((data as { days?: unknown }).days);
  return false;
}

function readStored(): ClipboardEntry | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isEntry(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(entry: ClipboardEntry | null) {
  try {
    if (entry) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Full or blocked storage: this tab still has it.
  }
}

// Mounted once, high in the tree, so a copy made in the master-template
// list editor can be pasted into a client's grid editor (and vice versa) —
// the two editors are different routes/components but share this one
// clipboard instance.
export function BuilderClipboardProvider({ children }: { children: ReactNode }) {
  const [clipboard, setClipboardState] = useState<ClipboardEntry | null>(readStored);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) setClipboardState(readStored());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setClipboard = (entry: ClipboardEntry | null) => {
    setClipboardState(entry);
    writeStored(entry);
  };

  const value: ClipboardState = {
    clipboard,
    copyBlock: (block) => setClipboard({ type: 'block', data: block }),
    cutBlock: (block, onCut) => {
      setClipboard({ type: 'block', data: block });
      onCut();
    },
    copyDay: (day) => setClipboard({ type: 'day', data: day }),
    cutDay: (day, onCut) => {
      setClipboard({ type: 'day', data: day });
      onCut();
    },
    copyWeek: (week) => setClipboard({ type: 'week', data: week }),
    clear: () => setClipboard(null),
  };

  return <BuilderClipboardCtx.Provider value={value}>{children}</BuilderClipboardCtx.Provider>;
}

export function useBuilderClipboard(): ClipboardState {
  const ctx = useContext(BuilderClipboardCtx);
  if (!ctx) throw new Error('useBuilderClipboard outside BuilderClipboardProvider');
  return ctx;
}
