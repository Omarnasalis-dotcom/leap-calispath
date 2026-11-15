import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChooseExercises, ExerciseChoice, ImportBlockPreview, UnmatchedExercise } from '@/shared/ProgramImportParser';
import { VideoModal, getYouTubeVideoId } from '@/components/VideoModal';

const CREATE = '__create__';
const REMOVE = '__remove__';

/** Lets an import pause on the exercise names the library doesn't have: pass
 * `choose` to resolveImportedExercises and render `dialog`. The coach can open
 * the full block(s) a name sits in, then pick a close library exercise, add
 * the name as new, or remove it from the block; cancelling stops the import
 * (resolveImportedExercises throws ImportCancelledError). Mirrors the app's
 * useExerciseMatchPrompt + ExerciseMatchModal. */
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
        pending.current?.(null);
        pending.current = resolve;
        setItems(unmatched);
      }),
    [],
  );

  useEffect(() => () => pending.current?.(null), []);

  const dialog = <ExerciseMatchDialog items={items} onConfirm={finish} onCancel={() => finish(null)} />;
  return { choose, dialog };
}

function ExerciseMatchDialog({
  items,
  onConfirm,
  onCancel,
}: {
  items: UnmatchedExercise[] | null;
  onConfirm: (choices: ExerciseChoice[]) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // A suggestion's demo video, opened on top of this dialog.
  const [video, setVideo] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (items) {
      // Names with no close match start on "Add as new"; the rest wait for a
      // pick so nothing is swapped in that the coach didn't see.
      const initial: Record<string, string> = {};
      for (const item of items) if (item.suggestions.length === 0) initial[item.name] = CREATE;
      setPicks(initial);
      setOpen({});
      setVideo(null);
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [items]);

  const allPicked = !!items && items.every((item) => picks[item.name]);

  return (
    <dialog
      className="confirm"
      ref={ref}
      style={{ maxWidth: 600 }}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      {items && (
        <>
          <h2 style={{ marginBottom: 8 }}>Check exercises</h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 13, margin: '0 0 12px' }}>
            {items.length === 1 ? '1 exercise in this file is' : `${items.length} exercises in this file are`} not in the
            library. Pick the right one, add it as a new exercise, or remove it from the block.
          </p>
          <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
            {items.map((item) => {
              const isOpen = !!open[item.name];
              const blockCount = item.blocks.length;
              const options = [
                ...item.suggestions.map((s) => ({ value: s.id, label: s.name, video: getYouTubeVideoId(s.youtube_url || '') ? s.youtube_url! : '' })),
                { value: CREATE, label: '+ Add as new', video: '' },
                { value: REMOVE, label: blockCount > 1 ? `Remove from ${blockCount} blocks` : 'Remove from block', video: '' },
              ];
              return (
                <div key={item.name} style={{ borderTop: '1px solid var(--hairline)', padding: '10px 0' }}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 2 }}>
                    <span style={{ fontWeight: 600 }}>{item.name}</span>
                    {blockCount > 0 && (
                      <button
                        type="button"
                        className="btn small ghost"
                        aria-expanded={isOpen}
                        onClick={() => setOpen((o) => ({ ...o, [item.name]: !isOpen }))}
                      >
                        {isOpen ? 'Hide block' : blockCount === 1 ? 'View block' : `View ${blockCount} blocks`}
                      </button>
                    )}
                  </div>
                  {isOpen && item.blocks.map((b, i) => <BlockPreview key={i} block={b} />)}
                  <div className="dim" style={{ fontSize: 12, margin: '6px 0' }}>
                    {item.suggestions.length > 0 ? 'Did you mean:' : 'No close match in the library.'}
                  </div>
                  <div className="seg" role="radiogroup" aria-label={`Choice for ${item.name}`}>
                    {options.map((opt) => (
                      <span key={opt.value} style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="seg-item"
                          aria-pressed={picks[item.name] === opt.value}
                          onClick={() => setPicks((p) => ({ ...p, [item.name]: opt.value }))}
                        >
                          {opt.label}
                        </button>
                        {opt.video && (
                          <button
                            type="button"
                            className="seg-item"
                            title={`Watch ${opt.label}`}
                            aria-label={`Watch ${opt.label} video`}
                            style={{ padding: '5px 8px' }}
                            onClick={() => setVideo({ url: opt.video, name: opt.label })}
                          >
                            ▶
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  {picks[item.name] === REMOVE && item.emptiesBlocks > 0 && (
                    <div role="alert" style={{ color: 'var(--danger, #b42318)', fontSize: 12, marginTop: 6 }}>
                      This leaves {item.emptiesBlocks === 1 ? '1 block' : `${item.emptiesBlocks} blocks`} with no exercises.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {video && <VideoModal url={video.url} name={video.name} onClose={() => setVideo(null)} />}
          <p className="dim" style={{ fontSize: 12, margin: '12px 0 16px' }}>
            New exercises are added without a category or video. Finish them in the Exercise Library.
          </p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn small" onClick={onCancel}>
              Cancel import
            </button>
            <button
              type="button"
              className="btn small primary"
              disabled={!allPicked}
              onClick={() =>
                onConfirm(
                  items.map((item): ExerciseChoice => {
                    const pick = picks[item.name];
                    if (pick === CREATE) return { name: item.name, create: true };
                    if (pick === REMOVE) return { name: item.name, remove: true };
                    return { name: item.name, exerciseId: pick };
                  }),
                )
              }
            >
              Continue
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}

/** One block from the import file, in full, with the unmatched exercise marked. */
function BlockPreview({ block }: { block: ImportBlockPreview }) {
  return (
    <div
      style={{
        border: '1px solid var(--hairline)',
        background: 'var(--tint-04, transparent)',
        borderRadius: 'var(--radius)',
        padding: '8px 10px',
        margin: '6px 0',
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 600 }}>{block.label}</div>
      <div className="dim" style={{ fontSize: 12, marginBottom: 4 }}>{block.kind}</div>
      <ol style={{ margin: 0, paddingInlineStart: 20 }}>
        {block.exercises.map((ex, i) => (
          <li key={i} style={{ padding: '2px 0' }}>
            <span style={ex.isThis ? { fontWeight: 700, color: 'var(--accent)' } : undefined}>{ex.name}</span>
            {ex.isThis && <span style={{ color: 'var(--accent)', fontSize: 12 }}> ← this one</span>}
            {ex.alsoUnmatched && <span className="dim" style={{ fontSize: 12 }}> (also not in library)</span>}
            {ex.detail && <span className="dim" style={{ fontSize: 12 }}> · {ex.detail}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
