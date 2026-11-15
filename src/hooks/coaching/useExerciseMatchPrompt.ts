import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChooseExercises, ExerciseChoice, UnmatchedExercise } from '../../lib/ProgramImportParser';

/** Lets an import pause on the names the library doesn't have: pass `choose`
 * to resolveImportedExercises and render <ExerciseMatchModal {...modalProps} />.
 * `choose` resolves when the coach confirms (choices) or cancels (null). */
export function useExerciseMatchPrompt() {
  const [items, setItems] = useState<UnmatchedExercise[] | null>(null);
  const pending = useRef<((choices: ExerciseChoice[] | null) => void) | null>(null);

  const finish = useCallback((choices: ExerciseChoice[] | null) => {
    pending.current?.(choices);
    pending.current = null;
    setItems(null);
  }, []);

  const choose = useCallback<ChooseExercises>(
    (unmatched) =>
      new Promise((resolve) => {
        pending.current?.(null); // a second import replaces an open prompt
        pending.current = resolve;
        setItems(unmatched);
      }),
    []
  );

  // Leaving the screen mid-prompt cancels the import instead of leaving it
  // waiting forever.
  useEffect(() => () => pending.current?.(null), []);

  return {
    choose,
    modalProps: {
      items,
      onConfirm: (choices: ExerciseChoice[]) => finish(choices),
      onCancel: () => finish(null),
    },
  };
}
