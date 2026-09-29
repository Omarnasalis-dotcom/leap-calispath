import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { getWorldKitTokens, WorldKitTokens } from '../../../constants/worldKitTokens';
import { KitButton, kt } from '../worlds/kit';
import { TierRingBadge } from '../profile/ProfileHeader';
import { tierName, MAX_STRENGTH_TIER } from '../../lib/strengthClimb';
import { t } from '../../i18n';

interface Props {
  visible: boolean;
  tier: number;
  name?: string | null;
  onStart: () => void;
  onSkip: () => void;
}

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

// What the Profile tour walks through, so "take the tour" means something.
const TOUR_TOPICS: { icon: IconName; key: 'topicTrials' | 'topicWorlds' | 'topicRanks' | 'topicTrain' }[] = [
  { icon: 'arm-flex', key: 'topicTrials' },
  { icon: 'earth', key: 'topicWorlds' },
  { icon: 'podium', key: 'topicRanks' },
  { icon: 'dumbbell', key: 'topicTrain' },
];

/**
 * Shown once on Profile after onboarding: your tier (the same ring as the
 * Profile header), what the tour covers, and Show me around / Skip.
 * Settings > Replay Tutorial replays the tour.
 */
export function WelcomeTourCard({ visible, tier, name, onStart, onSkip }: Props) {
  const { mode } = useTheme();
  const k = useMemo(() => getWorldKitTokens('strength', mode), [mode]);
  const firstName = name?.trim().split(/\s+/)[0];

  // Entrance: the card rises in, then the ring pops and the topics follow.
  // All native-driver transforms/opacity on their own values.
  const card = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const topics = useRef(TOUR_TOPICS.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (!visible) return;
    card.setValue(0);
    ring.setValue(0);
    topics.forEach(v => v.setValue(0));
    const a = Animated.parallel([
      Animated.timing(card, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(ring, { toValue: 1, delay: 180, friction: 5, tension: 70, useNativeDriver: true }),
      Animated.stagger(70, topics.map(v =>
        Animated.timing(v, { toValue: 1, duration: 320, delay: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }))),
    ]);
    a.start();
    return () => a.stop();
  }, [visible, card, ring, topics]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onSkip}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
        <Animated.View style={{
          width: '100%', maxWidth: 380, borderRadius: 28, overflow: 'hidden',
          backgroundColor: k.mode === 'dark' ? '#0b0b0b' : '#FFFFFF', borderWidth: 1, borderColor: `${k.accent}66`,
          opacity: card,
          transform: [{ translateY: card.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
        }}>
          {/* Tier hero on a soft accent glow */}
          <View style={{ alignItems: 'center', paddingTop: 26, paddingBottom: 20, backgroundColor: `${k.accent}14` }}>
            <View style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: k.accent }}>
              <Text style={kt('bold', 11, k.onAccent, 1.8)}>
                {firstName ? t('tour.welcomeName', { name: firstName.toUpperCase() }) : t('tour.welcome')}
              </Text>
            </View>
            <Animated.View style={{ marginTop: 14, opacity: ring, transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
              <TierRingBadge tierLevel={tier} />
            </Animated.View>
            <Text style={[kt('medium', 11, k.textMuted, 2), { marginTop: 10 }]}>{t('tour.youStartAt')}</Text>
            <Text style={[kt('bold', 40, k.text, 1.4, 44), { marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit>
              {tierName(tier)}
            </Text>
            <Text style={[kt('semibold', 12, k.accentText, 1.6), { marginTop: 2 }]}>
              {t('strength.cardTier', { tier, max: MAX_STRENGTH_TIER })}
            </Text>
          </View>

          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }}>
            <Text style={[kt('bold', 20, k.text, 0.4, 26), { textAlign: 'center' }]}>{t('tour.question')}</Text>
            <Text style={[kt('regular', 13.5, k.textSecondary, 0.2, 20), { textAlign: 'center', marginTop: 6 }]}>{t('tour.questionSub')}</Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              {TOUR_TOPICS.map((topic, i) => (
                <TopicTile key={topic.key} tokens={k} icon={topic.icon} label={t(`tour.${topic.key}`)} anim={topics[i]} />
              ))}
            </View>

            <KitButton tokens={k} label={t('tour.offerStart')} icon="play" onPress={onStart} height={54} fontSize={15} style={{ marginTop: 18 }} />
            <Pressable
              accessibilityRole="button"
              onPress={onSkip}
              style={({ pressed }) => ({ height: 46, marginTop: 4, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={kt('semibold', 14, k.textMuted, 1.2)}>{t('tour.offerSkip')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function TopicTile({ tokens: k, icon, label, anim }: { tokens: WorldKitTokens; icon: IconName; label: string; anim: Animated.Value }) {
  return (
    <Animated.View style={{
      flexGrow: 1, flexBasis: '45%', flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14,
      backgroundColor: k.mode === 'dark' ? '#141414' : '#F4F4F6', borderWidth: 1, borderColor: k.mode === 'dark' ? '#1f1f1f' : '#E6E6EA',
      opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
    }}>
      <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: `${k.accent}24` }}>
        <MaterialCommunityIcons name={icon} size={17} color={k.accentText} />
      </View>
      <Text style={[kt('semibold', 12.5, k.text, 0.3, 16), { flex: 1 }]} numberOfLines={2}>{label}</Text>
    </Animated.View>
  );
}
