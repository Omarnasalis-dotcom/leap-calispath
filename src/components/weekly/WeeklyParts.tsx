import React from 'react';
import { Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import { KitIcon, KitIconName, kt } from '../worlds/kit';
import { WeeklyTokens } from './weeklyTokens';
import { formatClock, ScoringType, timeUntilClose } from '../../lib/weeklyChallenge';
import { ltr, t as tr } from '../../i18n';

/** "4:05" for time challenges, "386 PTS" for AMRAP. */
export function formatScore(type: ScoringType, score: number): string {
  return type === 'time' ? ltr(formatClock(score)) : tr('weekly.ptsValue', { pts: Math.round(score) });
}

/** Bare value for tight stat cells: "4:05" or "386". */
export function formatScoreShort(type: ScoringType, score: number): string {
  return type === 'time' ? ltr(formatClock(score)) : String(Math.round(score));
}

/** "+0:25" behind on time, "−34 PTS" short on points. */
export function formatGap(type: ScoringType, gap: number, withUnit = true): string {
  if (type === 'time') return ltr(`+${formatClock(gap)}`);
  const n = `−${Math.round(gap)}`;
  return withUnit ? ltr(`${n} ${tr('weekly.ptsUnit')}`) : ltr(n);
}

/** "3D 14H", or "14H 20M" on the last day. */
export function closesInLabel(weekStart: string, now = new Date()): string {
  const { days, hours, minutes } = timeUntilClose(weekStart, now);
  return days > 0
    ? tr('weekly.endsDaysHours', { d: days, h: hours })
    : tr('weekly.endsHoursMinutes', { h: hours, m: minutes });
}

/** Standard label: 10.5–11 / 500, tracking 2, #8a8a8a. */
export function Label({ tokens: t, children, size = 10.5, color, style }: {
  tokens: WeeklyTokens; children: React.ReactNode; size?: number; color?: string; style?: object;
}) {
  return <Text style={[kt('medium', size, color ?? t.textMuted, 2), style]}>{children}</Text>;
}

/** Square icon button: 40/12 back & close, 36/11 week arrows. */
export function SquareButton({ tokens: t, icon, onPress, size = 40, disabled, label, iconColor }: {
  tokens: WeeklyTokens; icon: KitIconName; onPress: () => void; size?: number; disabled?: boolean; label: string; iconColor?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size, height: size, borderRadius: size === 40 ? 12 : 11,
        backgroundColor: disabled ? 'transparent' : t.control,
        borderWidth: 1, borderColor: disabled ? (t.mode === 'dark' ? '#141414' : t.border) : t.cardBorder,
        alignItems: 'center', justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <KitIcon
        name={icon}
        size={size === 40 ? 16 : 15}
        color={disabled ? t.textEmpty : iconColor ?? t.text}
        strokeWidth={size === 40 && icon !== 'close' ? 2.2 : 2.4}
      />
    </Pressable>
  );
}

/** Green "good news" or grey neutral outline pill (log + submitted screens). */
export function StatusPill({ tokens: t, text, good, style }: { tokens: WeeklyTokens; text: string; good: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{
      alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 10,
      borderWidth: 1, borderColor: good ? t.greenBorder : t.borderStrong,
    }, style]}>
      <Text style={kt('bold', 12, good ? t.green : t.textMuted, 1.6)}>{text}</Text>
    </View>
  );
}

/** −/+ stepper button. `primary` = coral fill. */
export function StepButton({ tokens: t, kind, size, onPress, disabled, label, primary }: {
  tokens: WeeklyTokens; kind: 'minus' | 'plus'; size: number; onPress: () => void; disabled?: boolean; label: string; primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size, height: size, borderRadius: size >= 52 ? 14 : 10,
        backgroundColor: primary ? (pressed ? t.accentHover : t.accent) : t.button,
        alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.35 : pressed && !primary ? 0.7 : 1,
      })}
    >
      <KitIcon name={kind} size={size >= 52 ? 20 : 16} color={primary ? t.onAccent : t.text} strokeWidth={2.4} />
    </Pressable>
  );
}

/** Two-column stat card (log + submitted screens). */
export function TwoStatCard({ tokens: t, left, right, style }: {
  tokens: WeeklyTokens;
  left: { label: string; value: string; sub?: string };
  right: { label: string; value: string; sub?: string; color?: string };
  style?: StyleProp<ViewStyle>;
}) {
  const cell = (c: { label: string; value: string; sub?: string; color?: string }, divider: boolean) => (
    <View style={{ flex: 1, paddingHorizontal: 20, borderStartWidth: divider ? 1 : 0, borderStartColor: t.cardBorder }}>
      <Label tokens={t}>{c.label}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 4 }}>
        <Text style={kt('semibold', 28, c.color ?? t.text)} numberOfLines={1} adjustsFontSizeToFit>{c.value}</Text>
        {c.sub ? <Text style={kt('regular', 12, t.textFaint)}>{c.sub}</Text> : null}
      </View>
    </View>
  );
  return (
    <View style={[{ flexDirection: 'row', borderRadius: 18, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder, paddingVertical: 18 }, style]}>
      {cell(left, false)}
      {cell(right, true)}
    </View>
  );
}

/** Centered text link (DISCARD / END & LOG SCORE). */
export function TextLink({ tokens: t, label, onPress }: { tokens: WeeklyTokens; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={10} style={({ pressed }) => ({ alignSelf: 'center', paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}>
      <Text style={kt('medium', 13, t.textMuted, 2)}>{label}</Text>
    </Pressable>
  );
}

/** Screen header: back, "LEAP ARENA / WEEKLY CHALLENGE", admin ⚙️ (Solo and Team tabs). */
export function WeeklyHeader({ tokens: t, onBack, onManage }: { tokens: WeeklyTokens; onBack: () => void; onManage?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 14 }}>
      <SquareButton tokens={t} icon="back" label={tr('common.close')} onPress={onBack} />
      <View style={{ flex: 1 }}>
        <Text style={kt('medium', 11, t.textMuted, 2.4)}>{tr('weekly.leapArena')}</Text>
        <Text style={[kt('bold', 24, t.text, 1.4, 27), { marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit>{tr('weekly.title')}</Text>
      </View>
      {onManage && (
        <Pressable accessibilityRole="button" accessibilityLabel={tr('weekly.manage')} onPress={onManage} hitSlop={6}
          style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text>⚙️</Text>
        </Pressable>
      )}
    </View>
  );
}
