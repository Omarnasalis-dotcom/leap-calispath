import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { JourneyPointsBar, POINTS_BAR_HEIGHT } from './JourneyPointsBar';
import { RewardBurst, RewardToast } from './RewardFx';
import { useRewardFx, Point } from '../../hooks/useRewardFx';
import { JourneyPointsSummary, PointsEntry } from '../../lib/journeyPoints';
import { measureInWindow } from '../../lib/measureView';

// The Journey top bar plus the reward FX layer, as one component that owns
// the FX state. Every step of a reward (counter hold, burst, land, pop,
// toasts) only re-renders this overlay -- never the long lane under it,
// which made scrolling stutter on accounts 20+ cards deep.

export interface JourneyPointsOverlayHandle {
  /** Freeze the counter at this value until the next play lands. */
  hold: (value: number) => void;
  /** origin: window coordinates, or null for mid-screen. */
  play: (awards: PointsEntry[], summary: JourneyPointsSummary, origin: Point | null) => void;
  /** Rings + sparks only, at window coordinates. */
  sparkle: (origin: Point) => void;
}

interface JourneyPointsOverlayProps {
  summary: JourneyPointsSummary;
  segments: boolean[];
  isLight: boolean;
  onOpenHistory: () => void;
  onOpenTasks: () => void;
  onLongPressMedallion?: () => void;
}

export const JourneyPointsOverlay = forwardRef<JourneyPointsOverlayHandle, JourneyPointsOverlayProps>(
  function JourneyPointsOverlay({ summary, segments, isLight, onOpenHistory, onOpenTasks, onLongPressMedallion }, ref) {
    const fx = useRewardFx();
    const layerRef = useRef<View>(null);
    const counterRef = useRef<View>(null);

    useImperativeHandle(
      ref,
      () => ({
        hold: fx.hold,
        play: (awards, next, origin) => {
          Promise.all([measureInWindow(layerRef.current), measureInWindow(counterRef.current)]).then(
            ([layer, counter]) => {
              const lx = layer?.x ?? 0;
              const ly = layer?.y ?? 0;
              const from: Point = origin
                ? { x: origin.x - lx, y: origin.y - ly }
                : { x: (layer?.w ?? Dimensions.get('window').width) / 2, y: (layer?.h ?? Dimensions.get('window').height) / 2 };
              const to: Point | null = counter ? { x: counter.x + counter.w / 2 - lx, y: counter.y + counter.h * 0.65 - ly } : null;
              fx.play(awards, next, from, to);
            }
          );
        },
        sparkle: (origin) => {
          measureInWindow(layerRef.current).then((layer) =>
            fx.sparkle({ x: origin.x - (layer?.x ?? 0), y: origin.y - (layer?.y ?? 0) })
          );
        },
      }),
      [fx.hold, fx.play, fx.sparkle]
    );

    return (
      <>
        <JourneyPointsBar
          summary={summary}
          displayTotal={fx.displayOverride ?? summary.total}
          segments={segments}
          isLight={isLight}
          onOpenHistory={onOpenHistory}
          onOpenTasks={onOpenTasks}
          counterRef={counterRef}
          popSignal={fx.counterPop}
          onLongPressMedallion={onLongPressMedallion}
        />
        <View ref={layerRef} collapsable={false} pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 60 }]}>
          {fx.bursts.map((b) => (
            <RewardBurst key={b.id} burst={b} isLight={isLight} onDone={fx.removeBurst} />
          ))}
          {fx.toasts[0] && (
            <RewardToast
              key={fx.toasts[0].id}
              toast={fx.toasts[0]}
              top={POINTS_BAR_HEIGHT + 22}
              isLight={isLight}
              onDismiss={fx.dismissToast}
            />
          )}
        </View>
      </>
    );
  }
);
