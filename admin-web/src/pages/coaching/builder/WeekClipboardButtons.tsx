import { useBuilderClipboard } from '@/contexts/BuilderClipboardContext';
import { useToast } from '@/components/Toast';
import { fromClipboardWeek, toClipboardWeek } from './clipboardConvert';
import { newDay, type BuilderDay } from './types';

/** Week buttons next to "+ Duplicate week" (owner, 2026-11-20): an empty
 * new week without duplicating one, and copying a whole week to paste into
 * another program (another athlete, another tab: the clipboard is shared).
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

  return (
    <>
      <button className="btn small" disabled={readOnly} onClick={() => onAddWeek([newDay('Day 1')])}>
        + Add week
      </button>
      <button
        className="btn small"
        disabled={days.length === 0}
        title={`Copy every day of week ${weekNum}, to paste as a new week in any program`}
        onClick={() => {
          clipboard.copyWeek(toClipboardWeek(days));
          toast(`Week ${weekNum} copied. Open any program and paste it as a new week.`);
        }}
      >
        Copy week
      </button>
      <button
        className="btn small"
        disabled={readOnly || !copied}
        title={copied ? 'Add the copied week as the next week' : 'Copy a week first'}
        onClick={() => {
          if (copied) onAddWeek(fromClipboardWeek(copied));
        }}
      >
        Paste week
      </button>
    </>
  );
}
