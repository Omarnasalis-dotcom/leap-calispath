import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { AnimatedRing } from '../worlds/kit/AnimatedRing';
import { CoachPalette } from './coachTokens';
import { CoachUsage, coachUsageLeft, coachUsageNear, coachUsageText } from '../../lib/coachUsage';
import { t } from '../../i18n';

const RING = 24;
const STROKE = 3;
/** The send button's height, so the ring lines up with it. */
const ROW = 46;
const OPEN_MS = 8000;
const PANEL_WIDTH = 240;

/**
 * What's left with the AI Coach, as a ring beside the message box. Tapping it
 * shows the details, which hide by themselves. The row holding it must stack
 * above the conversation for the panel to open over it.
 */
export function CoachUsageRing({ usage, c, accent, accentText }: {
  usage: CoachUsage;
  c: CoachPalette;
  accent: string;
  accentText: string;
}) {
  const [open, setOpen] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!open) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const timer = setTimeout(() => setOpen(false), OPEN_MS);
    return () => clearTimeout(timer);
  }, [open, opacity]);

  const text = coachUsageText(usage);
  if (!text) return null;
  const near = coachUsageNear(usage);
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[text.messages, text.budget].filter(Boolean).join('. ')}
        accessibilityState={{ expanded: open }}
        hitSlop={8}
        onPress={() => setOpen(v => !v)}
        style={styles.button}
      >
        <AnimatedRing
          size={RING}
          radius={(RING - STROKE) / 2}
          strokeWidth={STROKE}
          progress={coachUsageLeft(usage)}
          color={near ? accent : c.secondaryText}
          trackColor={c.track}
          duration={400}
        />
        <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.label, { color: c.secondaryText }]}>
          {t('coach.usageLabel')}
        </Text>
      </Pressable>
      {open && (
        <Animated.View
          accessibilityLiveRegion="polite"
          pointerEvents="none"
          style={[styles.panel, { opacity, backgroundColor: c.cardBg, borderColor: c.cardBorder }]}
        >
          <Text style={[styles.line, { color: c.bodyText }]}>{text.messages}</Text>
          {text.budget && (
            <Text style={[styles.line, text.budgetLow ? [styles.low, { color: accentText }] : { color: c.bodyText }]}>
              {text.budget}
            </Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minWidth: RING, height: ROW, justifyContent: 'center' },
  button: { alignItems: 'center', gap: 2 },
  label: { fontSize: 9.5, fontWeight: '500', letterSpacing: 0.2 },
  panel: {
    position: 'absolute',
    bottom: ROW + 8,
    left: 0,
    width: PANEL_WIDTH,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 3,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  line: { fontSize: 12.5, fontWeight: '500' },
  low: { fontWeight: '700' },
});
