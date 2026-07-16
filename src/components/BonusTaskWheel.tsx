import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from './Button';
import { BonusTask, BonusTaskTier, getBonusTasksByTier, pickRandomBonusTask } from '../lib/beatTheLadder';

const WHEEL_SIZE = 280;
const RADIUS = 130;
const CENTER = WHEEL_SIZE / 2;
const MAX_REROLLS = 3;
const SPIN_DURATION = 2600;
const FULL_SPINS = 4;

const TIER_OPTIONS: { key: BonusTaskTier | 'random'; label: string }[] = [
  { key: 'easy', label: 'EASY' },
  { key: 'medium', label: 'MEDIUM' },
  { key: 'hard', label: 'HARD' },
  { key: 'random', label: 'RANDOM' },
];

// Same polar-coordinate approach as src/components/ProgressRing.tsx, extended
// from a stroked arc to a filled wedge (pie slice).
function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleInRadians), y: cy + r * Math.sin(angleInRadians) };
}

function describeWedge(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
}

interface BonusTaskWheelProps {
  visible: boolean;
  onDismiss: () => void;
}

// Deliberately NOT a <Modal> — this can appear on the same screen as
// CelebrationBanner's real <Modal> (the Share Result flow), and two
// simultaneously-open native Modals freeze the app on iOS. Same fix pattern
// as src/components/PBOverwriteConfirmModal.tsx: a plain absolute-fill
// overlay avoids the collision entirely.
export function BonusTaskWheel({ visible, onDismiss }: BonusTaskWheelProps) {
  const { theme } = useTheme();
  const rotation = useRef(new Animated.Value(0)).current;
  const totalRotation = useRef(0);
  const [tier, setTier] = useState<BonusTaskTier | 'random'>('random');
  const [task, setTask] = useState<BonusTask | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [rerollsLeft, setRerollsLeft] = useState(MAX_REROLLS);

  const pool = useMemo(() => getBonusTasksByTier(tier), [tier]);
  const segmentAngle = 360 / pool.length;

  useEffect(() => {
    if (!visible) {
      setTask(null);
      setRerollsLeft(MAX_REROLLS);
      setTier('random');
    }
  }, [visible]);

  function spin() {
    if (spinning) return;
    setSpinning(true);

    const next = pickRandomBonusTask(pool, task?.exerciseId);
    const index = pool.findIndex((t) => t.exerciseId === next.exerciseId);
    const centerAngle = index * segmentAngle + segmentAngle / 2;
    const targetVisualAngle = (360 - centerAngle) % 360;
    const currentVisualAngle = totalRotation.current % 360;
    const delta = (targetVisualAngle - currentVisualAngle + 360) % 360;
    const newTotal = totalRotation.current + FULL_SPINS * 360 + delta;

    Animated.timing(rotation, {
      toValue: newTotal,
      duration: SPIN_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      totalRotation.current = newTotal;
      setTask(next);
      setSpinning(false);
    });
  }

  function handleReroll() {
    if (rerollsLeft <= 0 || spinning) return;
    setRerollsLeft((n) => n - 1);
    spin();
  }

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={[styles.card, { backgroundColor: theme.background.primary, borderColor: theme.card.border }]}>
        <Text style={[styles.title, { color: theme.text.primary }]}>BONUS CHALLENGE</Text>
        <Text style={[styles.subtitle, { color: theme.text.tertiary }]}>Spin for a small extra to go do</Text>

        {!task && !spinning && (
          <View style={styles.tierRow}>
            {TIER_OPTIONS.map((opt) => {
              const active = tier === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setTier(opt.key)}
                  style={[
                    styles.tierChip,
                    { backgroundColor: active ? theme.accent : 'transparent', borderColor: active ? theme.accent : theme.card.border },
                  ]}
                >
                  <Text style={[styles.tierChipText, { color: active ? '#FFFFFF' : theme.text.secondary }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.wheelWrap}>
          <View style={styles.pointer}>
            <View style={[styles.pointerTriangle, { borderTopColor: theme.accent }]} />
          </View>
          <Animated.View
            style={{
              transform: [
                {
                  rotate: rotation.interpolate({
                    inputRange: [0, 360],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            }}
          >
            <Svg width={WHEEL_SIZE} height={WHEEL_SIZE} viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}>
              {pool.map((t, i) => {
                const start = i * segmentAngle;
                const end = start + segmentAngle;
                const mid = start + segmentAngle / 2;
                const labelPos = polarToCartesian(CENTER, CENTER, RADIUS * 0.6, mid);
                const isEven = i % 2 === 0;
                return (
                  <React.Fragment key={t.exerciseId}>
                    <Path
                      d={describeWedge(CENTER, CENTER, RADIUS, start, end)}
                      fill={isEven ? theme.accent : theme.card.background}
                      stroke={theme.background.primary}
                      strokeWidth={1.5}
                    />
                    <SvgText
                      x={labelPos.x}
                      y={labelPos.y}
                      fill={isEven ? '#FFFFFF' : theme.text.primary}
                      fontSize={8.5}
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      {t.exerciseName}
                    </SvgText>
                  </React.Fragment>
                );
              })}
            </Svg>
          </Animated.View>
        </View>

        {task ? (
          <>
            <View style={[styles.resultBox, { borderColor: theme.accent, backgroundColor: `${theme.accent}15` }]}>
              <Text style={[styles.resultLabel, { color: theme.text.tertiary }]}>YOUR TASK</Text>
              <Text style={[styles.resultValue, { color: theme.accent }]}>{task.label}</Text>
            </View>
            {rerollsLeft > 0 && (
              <Button
                title={`SPIN AGAIN (${rerollsLeft} LEFT)`}
                onPress={handleReroll}
                variant="secondary"
                disabled={spinning}
              />
            )}
            <Button title="DONE" onPress={onDismiss} disabled={spinning} />
          </>
        ) : (
          <>
            <Button title={spinning ? 'SPINNING…' : 'SPIN'} onPress={spin} disabled={spinning} />
            <Button title="SKIP" onPress={onDismiss} variant="secondary" disabled={spinning} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    elevation: 60,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Regular',
    marginBottom: 4,
    textAlign: 'center',
  },
  tierRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  tierChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  tierChipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  wheelWrap: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  pointer: {
    position: 'absolute',
    top: -6,
    zIndex: 2,
    alignItems: 'center',
  },
  pointerTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  resultBox: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 6,
  },
  resultValue: {
    fontSize: 20,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
});
