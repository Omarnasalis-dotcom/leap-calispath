import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Burst, BURST_LAND_MS, Toast } from '../components/journey/RewardFx';
import { JourneyPointsSummary, PointsEntry } from '../lib/journeyPoints';
import { t } from '../i18n';

// Turns what a points call newly awarded into the handoff's reward moment:
// earned points burst from where they were earned and fly into the
// counter (which holds its old value until they land), then any bonus
// (streak, Perfect day) follows as a toast. A catch-up of older progress
// (first sync, or points earned away from the Journey) plays as one burst.

const BONUS = new Set(['streak', 'perfect_day']);
const TOAST_AFTER_LAND_MS = 150;

export interface Point {
  x: number;
  y: number;
}

function labelFor(e: PointsEntry): string {
  switch (e.source) {
    case 'program_day':
      return (e.label ?? t('journeyPoints.fx.programDay')).toUpperCase();
    case 'side_quest':
      return t('journeyPoints.fx.sideQuest');
    case 'trial':
      return t('journeyPoints.fx.trial');
    case 'task_book':
      return t('journeyPoints.fx.book', { count: Number(e.label) || 0 });
    case 'task_run':
      return t('journeyPoints.fx.run', { count: Number(e.label) || 0 });
    case 'task_meal':
      return t('journeyPoints.fx.meal');
    default:
      return '';
  }
}

function toastFor(e: PointsEntry, id: number): Toast {
  return e.source === 'streak'
    ? {
        id,
        title: t('journeyPoints.fx.streakTitle', { count: Number(e.label) || 0 }),
        sub: t('journeyPoints.fx.streakSub'),
        points: e.points,
      }
    : { id, title: t('journeyPoints.fx.perfectTitle'), sub: t('journeyPoints.fx.perfectSub'), points: e.points };
}

const PRIORITY = ['program_day', 'trial', 'side_quest', 'task_run', 'task_book', 'task_meal'];

function hapticDouble() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), 48);
}

export function useRewardFx() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Counter value while a reward is in flight; null = show the real total.
  const [displayOverride, setDisplayOverride] = useState<number | null>(null);
  // Bumped whenever points land, so the counter pops.
  const [counterPop, setCounterPop] = useState(0);
  const nextId = useRef(1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  /**
   * origin/counter are FX-layer coordinates. Pass the summary the awards
   * came with; the counter ends on its total.
   */
  const play = useCallback(
    (awards: PointsEntry[], summary: JourneyPointsSummary, origin: Point, counter: Point | null) => {
      const earned = awards.filter((a) => !BONUS.has(a.source));
      const bonuses = awards.filter((a) => BONUS.has(a.source));
      const sum = (list: PointsEntry[]) => list.reduce((n, a) => n + a.points, 0);
      const finalTotal = summary.total;
      const afterEarned = finalTotal - sum(bonuses);

      const showBonuses = (delay: number) => {
        if (bonuses.length === 0) {
          later(delay, () => setDisplayOverride(null));
          return;
        }
        later(delay, () => {
          setToasts((q) => [...q, ...bonuses.map((b) => toastFor(b, nextId.current++))]);
          setDisplayOverride(null);
          setCounterPop((n) => n + 1);
          hapticDouble();
        });
      };

      if (earned.length === 0 || sum(earned) === 0) {
        setDisplayOverride(afterEarned);
        showBonuses(0);
        return;
      }

      const catchUp = earned.length > 3 || earned.some((a) => a.date < summary.today);
      const primary = [...earned].sort((a, b) => PRIORITY.indexOf(a.source) - PRIORITY.indexOf(b.source))[0];
      setDisplayOverride(finalTotal - sum(awards));
      setBursts((list) => [
        ...list,
        {
          id: nextId.current++,
          x: origin.x,
          y: origin.y,
          dx: counter ? counter.x - origin.x : 0,
          dy: counter ? counter.y - origin.y : -origin.y,
          amount: sum(earned),
          label: catchUp ? t('journeyPoints.fx.progress') : labelFor(primary),
        },
      ]);
      later(BURST_LAND_MS, () => {
        setDisplayOverride(afterEarned);
        setCounterPop((n) => n + 1);
        hapticDouble();
      });
      showBonuses(BURST_LAND_MS + TOAST_AFTER_LAND_MS);
    },
    []
  );

  /** Rings + sparks only, no number (the "+" igniting). */
  const sparkle = useCallback((origin: Point) => {
    setBursts((list) => [...list, { id: nextId.current++, x: origin.x, y: origin.y, dx: 0, dy: 0, amount: 0, label: '' }]);
  }, []);

  /**
   * Freeze the counter at its pre-award value right away -- play() runs
   * only after the origin is measured, a frame or two later.
   */
  const hold = useCallback((value: number) => setDisplayOverride(value), []);
  const removeBurst = useCallback((id: number) => setBursts((list) => list.filter((b) => b.id !== id)), []);
  const dismissToast = useCallback(() => setToasts((q) => q.slice(1)), []);

  return { bursts, toasts, displayOverride, counterPop, play, sparkle, hold, removeBurst, dismissToast };
}
