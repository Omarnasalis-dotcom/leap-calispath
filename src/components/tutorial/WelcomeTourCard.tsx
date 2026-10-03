import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { getWorldKitTokens } from '../../../constants/worldKitTokens';
import { kt } from '../worlds/kit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TierRingBadge } from '../profile/ProfileHeader';
import { tierName } from '../../lib/strengthClimb';
import { t, FLIP_X } from '../../i18n';

interface Props {
  visible: boolean;
  tier: number;
  name?: string | null;
  onStart: () => void;
  onSkip: () => void;
}

/**
 * Shown once on Profile after onboarding: your tier (the same ring as the
 * Profile header) and Show me around / Skip. Kept deliberately short.
 * Settings > Replay Tutorial replays the tour.
 */
export function WelcomeTourCard({ visible, tier, name, onStart, onSkip }: Props) {
  const { mode } = useTheme();
  const k = useMemo(() => getWorldKitTokens('strength', mode), [mode]);
  const firstName = name?.trim().split(/\s+/)[0];

  // Entrance: the sheet slides up from the bottom, then the ring pops. Native-driver
  // transforms/opacity on their own values.
  const insets = useSafeAreaInsets();
  const card = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    card.setValue(0);
    ring.setValue(0);
    const a = Animated.parallel([
      Animated.timing(card, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(ring, { toValue: 1, delay: 180, friction: 5, tension: 70, useNativeDriver: true }),
    ]);
    a.start();
    return () => a.stop();
  }, [visible, card, ring]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onSkip}>
      <View style={{ flex: 1, backgroundColor: k.mode === 'dark' ? 'rgba(0,0,0,0.78)' : 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <Animated.View style={{
          width: '100%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden',
          backgroundColor: k.mode === 'dark' ? '#0b0b0b' : '#FFFFFF', borderTopWidth: 1, borderColor: k.mode === 'dark' ? `${k.accent}66` : '#E6E6EA',
          paddingBottom: insets.bottom,
          transform: [{ translateY: card.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }],
        }}>
          {/* One panel: greeting, your tier, one question, two actions. */}
          <View style={{ alignItems: 'center', paddingTop: 10, paddingHorizontal: 22, paddingBottom: 14 }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: k.mode === 'dark' ? '#3A3A40' : '#D4D4DA', marginBottom: 18 }} />
            <Text style={kt('bold', 12, k.accentText, 2)}>
              {firstName ? t('tour.welcomeName', { name: firstName.toUpperCase() }) : t('tour.welcome')}
            </Text>
            <Animated.View style={{ marginTop: 18, opacity: ring, transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
              <TierRingBadge tierLevel={tier} />
            </Animated.View>
            <Text style={[kt('bold', 34, k.text, 1.4, 38), { marginTop: 12, textAlign: 'center' }]} numberOfLines={1}>
              {tierName(tier)}
            </Text>

            <Text style={[kt('bold', 19, k.text, 0.4, 24), { textAlign: 'center', marginTop: 22 }]}>{t('tour.question')}</Text>
            <Text style={[kt('regular', 13.5, k.textSecondary, 0.2, 19), { textAlign: 'center', marginTop: 4 }]}>{t('tour.questionSub')}</Text>

            {/* Primary: solid red, quiet type, a trailing arrow. */}
            <Pressable
              accessibilityRole="button"
              onPress={onStart}
              style={({ pressed }) => ({ alignSelf: 'stretch', marginTop: 24, opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
            >
              <View style={{ height: 52, borderRadius: 16, backgroundColor: '#FF3B3B', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Text style={kt('bold', 15, '#FFFFFF', 1.6)}>{t('tour.offerStart')}</Text>
                <MaterialCommunityIcons name="arrow-right" size={18} color="#FFFFFF" style={FLIP_X} />
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onSkip}
              hitSlop={8}
              style={({ pressed }) => ({ height: 44, marginTop: 6, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={kt('medium', 14, k.textMuted, 0.4)}>{t('tour.offerSkip')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

