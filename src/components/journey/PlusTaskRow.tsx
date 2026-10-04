import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { LeapLoop } from './LeapLoop';
import { JourneyTask, TaskTick } from '../../lib/journeyPoints';
import { measureInWindow } from '../../lib/measureView';
import { t, isRTL } from '../../i18n';

// Handoff "+" daily-task row: sits on the Journey line right after today's
// program card. Tap "+" → a tray reveals three pills (Book / Run / Meal);
// Book and Run open a 1–10 picker in the same tray, Meal logs at once.
// Tapping a done pill undoes it. When today's card (and its side quest)
// is done the "+" ignites: fire disc + a spinning Leap loop behind it.

export const PLUS_ROW_HEIGHT = 78;
const NODE = 42;
const RAIL = 38; // NodeRow's left column (NODE_SIZE)
const ACCENT = '#FF5A55';

export type TrayMode = null | 'menu' | 'book' | 'run';

/** Window coordinates of whatever was tapped (the reward burst's origin). */
export interface TapOrigin {
  x: number;
  y: number;
}

type Measurable = unknown;

/** Measures a tapped view's centre, then calls back (null if unmeasurable). */
function withOrigin(node: Measurable, then: (origin: TapOrigin | null) => void) {
  measureInWindow(node).then((r) => then(r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null));
}

const TASK_ICON: Record<JourneyTask, keyof typeof MaterialCommunityIcons.glyphMap> = {
  book: 'book-open-variant',
  run: 'run',
  meal: 'silverware-fork-knife',
};

interface PlusTaskRowProps {
  ticks: TaskTick[];
  values: Record<string, number>;
  /** Today's card (and its side quest, if any) done → the "+" ignites. */
  ignited: boolean;
  mode: TrayMode;
  onModeChange: (mode: TrayMode) => void;
  onLog: (task: JourneyTask, amount: number | null, origin: TapOrigin | null) => void;
  onUndo: (task: JourneyTask) => void;
  busyTask: JourneyTask | null;
  isLight: boolean;
  /** Dev builds only: toggle the lit "+" preview. */
  onLongPressNode?: () => void;
}

function Pill({
  task,
  tick,
  points,
  index,
  open,
  isLight,
  disabled,
  onPress,
}: {
  task: JourneyTask;
  tick: TaskTick | undefined;
  points: number;
  index: number;
  open: boolean;
  isLight: boolean;
  disabled: boolean;
  onPress: (node: Measurable) => void;
}) {
  const on = !!tick;
  const ref = useRef<View>(null);
  // Staggered fade + slide in from -24pt (.08 / .14 / .20s).
  const appear = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(appear, {
      toValue: open ? 1 : 0,
      duration: open ? 380 : 150,
      delay: open ? 80 + index * 60 : 0,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, index, appear]);

  // Flash ring when it turns done.
  const flash = useRef(new Animated.Value(0)).current;
  const wasOn = useRef(on);
  useEffect(() => {
    if (on && !wasOn.current) {
      flash.setValue(1);
      Animated.timing(flash, { toValue: 0, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
    wasOn.current = on;
  }, [on, flash]);

  const doneSub =
    task === 'book'
      ? t('journeyPoints.pillBookDone', { count: tick?.amount ?? 0 })
      : task === 'run'
      ? t('journeyPoints.pillRunDone', { count: tick?.amount ?? 0 })
      : t('journeyPoints.pillMealDone');

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: appear,
        transform: [{ translateX: appear.interpolate({ inputRange: [0, 1], outputRange: [isRTL ? 24 : -24, 0] }) }],
      }}
    >
      <TouchableOpacity
        ref={ref}
        onPress={() => onPress(ref.current)}
        disabled={disabled}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ checked: on }}
        style={[
          styles.pill,
          isLight && styles.pillLight,
          on && styles.pillOn,
        ]}
      >
        <View style={[styles.pillIcon, isLight && styles.pillIconLight, on && styles.pillIconOn]}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.flashRing,
              { opacity: flash, transform: [{ scale: flash.interpolate({ inputRange: [0, 1], outputRange: [1.9, 1] }) }] },
            ]}
          />
          <MaterialCommunityIcons
            name={on ? 'check' : TASK_ICON[task]}
            size={15}
            color={on ? '#FFFFFF' : isLight ? '#55555B' : '#C9CBD3'}
          />
        </View>
        <View style={styles.pillText}>
          <Text style={[styles.pillLabel, isLight && styles.inkLight]} numberOfLines={1}>
            {t(`journeyPoints.task.${task}`)}
          </Text>
          <Text
            style={[styles.pillSub, on && styles.pillSubOn]}
            numberOfLines={1}
          >
            {on ? doneSub : `+${points}`}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function Picker({
  task,
  isLight,
  onBack,
  onPick,
}: {
  task: 'book' | 'run';
  isLight: boolean;
  onBack: () => void;
  onPick: (n: number, node: Measurable) => void;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [fade]);
  return (
    <Animated.View style={[styles.picker, isLight && styles.pickerLight, { opacity: fade }]}>
      <TouchableOpacity
        onPress={onBack}
        style={[styles.pickerBack, isLight && styles.pickerBackLight]}
        accessibilityRole="button"
        accessibilityLabel={t('journeyPoints.back')}
      >
        <MaterialCommunityIcons name={isRTL ? 'chevron-right' : 'chevron-left'} size={20} color={isLight ? '#151515' : '#FFFFFF'} />
      </TouchableOpacity>
      <View>
        <Text style={[styles.pickerTitle, isLight && styles.inkLight]}>{t(`journeyPoints.task.${task}`)}</Text>
        <Text style={styles.pickerUnit}>{t(task === 'book' ? 'journeyPoints.unitChapters' : 'journeyPoints.unitKm')}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerNums}>
        {Array.from({ length: 10 }, (_, i) => (
          <PickerNumber key={i} n={i + 1} index={i} isLight={isLight} onPress={(node) => onPick(i + 1, node)} />
        ))}
      </ScrollView>
    </Animated.View>
  );
}

function PickerNumber({ n, index, isLight, onPress }: { n: number; index: number; isLight: boolean; onPress: (node: Measurable) => void }) {
  const ref = useRef<View>(null);
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 300, delay: index * 30, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [index, appear]);
  return (
    <Animated.View
      style={{ opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}
    >
      <TouchableOpacity
        ref={ref}
        onPress={() => onPress(ref.current)}
        style={[styles.num, isLight && styles.numLight]}
        accessibilityRole="button"
        accessibilityLabel={String(n)}
      >
        <Text style={[styles.numText, isLight && styles.inkLight]}>{n}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function PlusNode({
  ignited,
  open,
  isLight,
  onPress,
  onLongPress,
}: {
  ignited: boolean;
  open: boolean;
  isLight: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const rotate = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(rotate, { toValue: open ? 1 : 0, friction: 6, tension: 120, useNativeDriver: true }).start();
  }, [open, rotate]);

  // Lit: pulsing glow (1.6s loop).
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!ignited) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [ignited, pulse]);

  const plusColor = ignited || open ? '#FFFFFF' : ACCENT;
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={t('journeyPoints.plusA11y')}
      accessibilityState={{ expanded: open }}
      style={styles.nodeHit}
    >
      {ignited && (
        <View pointerEvents="none" style={styles.nodeLoop}>
          <LeapLoop size={60} variant="lit" strokeWidth={3} spinMs={2400} glow={10} />
        </View>
      )}
      {!ignited && <View style={[styles.nodeHalo, isLight && styles.nodeHaloLight]} />}
      <Animated.View
        style={[
          styles.node,
          !ignited && { borderWidth: 2, borderColor: ACCENT, backgroundColor: open ? ACCENT : isLight ? '#FFF1F0' : '#140C0C' },
          ignited && styles.nodeIgnited,
          ignited && { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] },
        ]}
      >
        {ignited && (
          <Svg style={StyleSheet.absoluteFill} width={NODE} height={NODE}>
            <Defs>
              <RadialGradient id="plusFire" cx="50%" cy="35%" r="65%">
                <Stop offset="0" stopColor="#FF9A4A" />
                <Stop offset="0.6" stopColor="#FF5A55" />
                <Stop offset="1" stopColor="#D8322C" />
              </RadialGradient>
            </Defs>
            <Circle cx={NODE / 2} cy={NODE / 2} r={NODE / 2} fill="url(#plusFire)" />
          </Svg>
        )}
        <Animated.View
          style={{ transform: [{ rotate: rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] }) }] }}
        >
          <MaterialCommunityIcons name="plus" size={22} color={plusColor} />
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

export function PlusTaskRow({
  ticks,
  values,
  ignited,
  mode,
  onModeChange,
  onLog,
  onUndo,
  busyTask,
  isLight,
  onLongPressNode,
}: PlusTaskRowProps) {
  const open = mode !== null;
  const tick = (task: JourneyTask) => ticks.find((x) => x.task === task);
  const allDone = (['book', 'run', 'meal'] as const).every((task) => !!tick(task));

  // Tray reveal from the node side (handoff clip-path .45s). Width is
  // layout, so this value is JS-driven and used for nothing else.
  const [trayWidth, setTrayWidth] = useState(0);
  const reveal = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(reveal, {
      toValue: open ? 1 : 0,
      duration: open ? 450 : 250,
      easing: Easing.bezier(0.2, 0.9, 0.2, 1),
      useNativeDriver: false,
    }).start();
  }, [open, reveal]);

  // All three done → close 1.7s later (handoff).
  useEffect(() => {
    if (!allDone || mode !== 'menu') return;
    const timer = setTimeout(() => onModeChange(null), 1700);
    return () => clearTimeout(timer);
  }, [allDone, mode, onModeChange]);

  const tapTask = (task: JourneyTask, node: Measurable) => {
    if (tick(task)) {
      onUndo(task);
    } else if (task === 'meal') {
      withOrigin(node, (origin) => onLog('meal', null, origin));
    } else {
      onModeChange(task);
    }
  };

  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View
          style={[
            styles.line,
            { backgroundColor: ignited ? ACCENT : isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' },
          ]}
        />
        <PlusNode
          ignited={ignited}
          open={open}
          isLight={isLight}
          onPress={() => onModeChange(open ? null : 'menu')}
          onLongPress={onLongPressNode}
        />
      </View>
      <View style={styles.trayArea} onLayout={(e) => setTrayWidth(e.nativeEvent.layout.width)} pointerEvents={open ? 'auto' : 'none'}>
        <Animated.View
          style={[
            styles.trayClip,
            { width: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, trayWidth] }) },
          ]}
        >
          <View style={[styles.trayInner, { width: trayWidth }]}>
            {mode === 'book' || mode === 'run' ? (
              <Picker
                task={mode}
                isLight={isLight}
                onBack={() => onModeChange('menu')}
                onPick={(n, node) => {
                  const task = mode;
                  withOrigin(node, (origin) => {
                    onModeChange('menu');
                    onLog(task, n, origin);
                  });
                }}
              />
            ) : (
              <View style={styles.pills}>
                {(['book', 'run', 'meal'] as const).map((task, i) => (
                  <Pill
                    key={task}
                    task={task}
                    tick={tick(task)}
                    points={values[`task_${task}`] ?? 0}
                    index={i}
                    open={open}
                    isLight={isLight}
                    disabled={busyTask !== null}
                    onPress={(node) => tapTask(task, node)}
                  />
                ))}
              </View>
            )}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 20, height: PLUS_ROW_HEIGHT },
  rail: { width: RAIL, alignItems: 'center', justifyContent: 'center' },
  line: { position: 'absolute', top: 0, bottom: 0, width: 2, alignSelf: 'center' },
  nodeHit: { width: NODE, height: NODE, alignItems: 'center', justifyContent: 'center' },
  nodeHalo: {
    position: 'absolute',
    width: NODE + 12,
    height: NODE + 12,
    borderRadius: (NODE + 12) / 2,
    backgroundColor: 'rgba(255,90,85,0.1)',
  },
  nodeHaloLight: { backgroundColor: 'rgba(255,90,85,0.12)' },
  nodeLoop: { position: 'absolute', width: 60, height: 60, top: -9, left: -9 },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  nodeIgnited:
    Platform.OS === 'ios'
      ? { shadowColor: '#FF7832', shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, overflow: 'visible' }
      : { elevation: 6 },
  trayArea: { flex: 1, justifyContent: 'center' },
  trayClip: { height: 52, overflow: 'hidden', alignSelf: 'flex-start' },
  trayInner: { height: 52, justifyContent: 'center' },
  pills: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pill: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2E2E30',
    backgroundColor: '#161616',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 8,
  },
  pillLight: { borderColor: '#E2E2E4', backgroundColor: '#FFFFFF' },
  pillOn: { borderColor: ACCENT, backgroundColor: 'rgba(255,90,85,0.16)' },
  pillIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#262626', alignItems: 'center', justifyContent: 'center' },
  pillIconLight: { backgroundColor: '#F0F0F2' },
  pillIconOn: { backgroundColor: ACCENT },
  flashRing: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: ACCENT,
  },
  pillText: { flex: 1, minWidth: 0 },
  pillLabel: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 13, textAlign: 'left' },
  pillSub: { color: '#8A8A8E', fontFamily: 'PlusJakartaSans-Bold', fontSize: 10, textAlign: 'left' },
  pillSubOn: { color: '#FF9A93' },
  inkLight: { color: '#151515' },
  picker: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingStart: 4,
    paddingEnd: 4,
    borderRadius: 26,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  pickerLight: { backgroundColor: '#FFFFFF', borderColor: '#E2E2E4' },
  pickerBack: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#232323', alignItems: 'center', justifyContent: 'center' },
  pickerBackLight: { backgroundColor: '#F0F0F2' },
  pickerTitle: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 12, textAlign: 'left' },
  pickerUnit: { color: '#8A8A8E', fontFamily: 'PlusJakartaSans-Bold', fontSize: 9, letterSpacing: 1.2, textAlign: 'left' },
  pickerNums: { gap: 6, paddingHorizontal: 2, alignItems: 'center' },
  num: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numLight: { borderColor: '#D8D8DC', backgroundColor: '#F7F7F8' },
  numText: { color: '#FFFFFF', fontFamily: 'BebasNeue-Regular', fontSize: 20, paddingTop: 3 },
});
