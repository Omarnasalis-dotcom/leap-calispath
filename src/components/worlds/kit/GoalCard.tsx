import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { WorldKitTokens } from '../../../../constants/worldKitTokens';
import { clamp01 } from '../../../lib/worldProgress';
import { KIT_EASE } from './AnimatedRing';
import { KitIcon, KitIconName } from './KitIcon';
import { kt } from './type';

interface Props {
  tokens: WorldKitTokens;
  icon: KitIconName;
  king: boolean;
  kicker: string;
  title: string;
  /** Omit for New and King states. */
  bar?: { progress: number; from: string; to: string };
  footer: string;
}

/** Goal card (handoff §0.6). */
export function GoalCard({ tokens: t, icon, king, kicker, title, bar, footer }: Props) {
  return (
    <View style={{
      borderRadius: 20, padding: 18, gap: 14,
      backgroundColor: king ? t.goldTintBg : t.goalBg,
      borderWidth: 1, borderColor: king ? t.goldBorder : t.tintBorder,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.mode === 'dark' ? `${t.accent}24` : t.buttonTint, alignItems: 'center', justifyContent: 'center' }}>
          <KitIcon name={king ? 'crown' : icon} size={18} color={king ? t.gold : t.accentText} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={kt('medium', 10.5, t.textMuted, 2)}>{kicker}</Text>
          <Text style={[kt('semibold', 18, t.text, 0.8, 21), { marginTop: 3 }]}>{title}</Text>
        </View>
      </View>
      {bar && <GoalBar tokens={t} {...bar} />}
      <View style={{ borderTopWidth: 1, borderTopColor: t.border, paddingTop: 12 }}>
        <Text style={kt('medium', 12, t.textFaint, 2.4)}>{footer}</Text>
      </View>
    </View>
  );
}

function GoalBar({ tokens: t, progress, from, to }: { tokens: WorldKitTokens; progress: number; from: string; to: string }) {
  const v = useRef(new Animated.Value(0)).current;
  // Handoff: bar never renders narrower than 4% once there's a real gap.
  const target = Math.max(0.04, clamp01(progress));
  useEffect(() => {
    const a = Animated.timing(v, { toValue: target, duration: 900, delay: 200, easing: KIT_EASE, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [target, v]);
  return (
    <View style={{ gap: 7 }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: t.track, overflow: 'hidden' }}>
        <Animated.View style={{ height: '100%', borderRadius: 2, backgroundColor: t.accent, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={kt('medium', 11.5, t.textMuted, 0.6)}>{from}</Text>
        <Text style={kt('medium', 11.5, t.textMuted, 0.6)}>{to}</Text>
      </View>
    </View>
  );
}

/** 4px progress bar (Power lift rows: 1RM / world best). */
export function KitBar({ tokens: t, progress, delay = 200 }: { tokens: WorldKitTokens; progress: number; delay?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  const target = clamp01(progress);
  useEffect(() => {
    const a = Animated.timing(v, { toValue: target, duration: 900, delay, easing: KIT_EASE, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [target, v, delay]);
  return (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: t.track, overflow: 'hidden' }}>
      <Animated.View style={{ height: '100%', borderRadius: 2, backgroundColor: t.accent, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}
