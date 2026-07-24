import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ConceptMetadata } from '@/shared/BlockConceptParser';

export interface ClipboardExercise {
  exercise_id: string;
  exercise_name?: string;
  sets: number | null;
  reps: number | null;
  rest_seconds: number | null;
  hold_seconds: number | null;
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

export type ClipboardEntry =
  | { type: 'block'; data: ClipboardBlock }
  | { type: 'day'; data: ClipboardDay };

interface ClipboardState {
  clipboard: ClipboardEntry | null;
  copyBlock: (block: ClipboardBlock) => void;
  cutBlock: (block: ClipboardBlock, onCut: () => void) => void;
  copyDay: (day: ClipboardDay) => void;
  cutDay: (day: ClipboardDay, onCut: () => void) => void;
  clear: () => void;
}

const BuilderClipboardCtx = createContext<ClipboardState | null>(null);

// Mounted once, high in the tree, so a copy made in the master-template
// list editor can be pasted into a client's grid editor (and vice versa) —
// the two editors are different routes/components but share this one
// clipboard instance.
export function BuilderClipboardProvider({ children }: { children: ReactNode }) {
  const [clipboard, setClipboard] = useState<ClipboardEntry | null>(null);

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
    clear: () => setClipboard(null),
  };

  return <BuilderClipboardCtx.Provider value={value}>{children}</BuilderClipboardCtx.Provider>;
}

export function useBuilderClipboard(): ClipboardState {
  const ctx = useContext(BuilderClipboardCtx);
  if (!ctx) throw new Error('useBuilderClipboard outside BuilderClipboardProvider');
  return ctx;
}
