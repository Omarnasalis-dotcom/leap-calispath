import { CalendarPlus, ClipboardPaste, Copy } from 'lucide-react';
import { useBuilderClipboard } from '@/contexts/BuilderClipboardContext';
import { useToast } from '@/components/Toast';
import { fromClipboardWeek, toClipboardWeek } from './clipboardConvert';
import { newDay, type BuilderDay } from './types';

/** Week buttons next to "+ Duplicate week" (owner, 2026-11-20): an empty
 * new week without duplicating one, and copying a whole week to paste into
 * another program (another athlete, another tab: the clipboard is shared).
 * Small icon buttons like a day's copy/cut/paste, named on hover.
 * `onAddWeek` appends the given days as the next week and opens it. */
export function WeekClipboardButtons({
  days,
  weekNum,
  readOnly,
  onAddWeek,
}: {
  days: BuilderDay[];
  weekNum: number;
  readOnly?: boolean;
  onAddWeek: (days: BuilderDay[]) => void;
}) {
  const clipboard = useBuilderClipboard();
  const toast = useToast();
  const copied = clipboard.clipboard?.type === 'week' ? clipboard.clipboard.data : null;
  const pasteLabel = copied ? 'Paste week (adds it as the next week)' : 'Paste week (copy a week first)';

  return (
    <>
      <button
        className="btn icon"
        disabled={readOnly}
        title="Add an empty week"
        aria-label="Add an empty week"
        onClick={() => onAddWeek([newDay('Day 1')])}
      >
        <CalendarPlus />
      </button>
      <button
        className="btn icon"
        disabled={days.length === 0}
        title={`Copy week ${weekNum}`}
        aria-label={`Copy week ${weekNum}`}
        onClick={() => {
          clipboard.copyWeek(toClipboardWeek(days));
          toast(`Week ${weekNum} copied. Open any program and paste it as a new week.`);
        }}
      >
        <Copy />
      </button>
      <button
        className="btn icon"
        disabled={readOnly || !copied}
        title={pasteLabel}
        aria-label={pasteLabel}
        onClick={() => {
          if (copied) onAddWeek(fromClipboardWeek(copied));
        }}
      >
        <ClipboardPaste />
      </button>
    </>
  );
}
