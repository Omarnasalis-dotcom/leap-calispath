import React from 'react';
import { Redirect, router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { JourneyBadge, BadgePart } from '../src/components/journey/badges/JourneyBadge';
import { ACHIEVEMENTS } from '../src/lib/journeyAchievements';
import { t } from '../src/i18n';

/**
 * Development builds only (long-press the Journey points counter): every
 * Journey achievement badge at 160 / 40 / 20 px on dark and light, the
 * DETERMINED forge palette, and the layered badges reassembled from their
 * parts (they must line up exactly with the whole badge).
 */
const LEVELS = [0, ...ACHIEVEMENTS.map(a => a.level)];
const LAYERS: readonly BadgePart[] = ['rays', 'wingL', 'wingR', 'body', 'gem'];

function Row({ level, light }: { level: number; light: boolean }) {
  const name = level === 0 ? t('journeyAchievements.noBadge') : t(`journeyAchievements.${ACHIEVEMENTS[level - 1].key}` as 'journeyAchievements.rising');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 10 }}>
      <JourneyBadge level={level} size={160} slotColor={light ? '#a8a2a0' : '#5a5a5a'} />
      <View style={{ gap: 12, alignItems: 'center' }}>
        <JourneyBadge level={level} size={40} simple slotColor={light ? '#a8a2a0' : '#5a5a5a'} />
        <JourneyBadge level={level} size={20} simple slotColor={light ? '#a8a2a0' : '#5a5a5a'} />
      </View>
      <Text style={{ color: light ? '#141010' : '#fff', fontFamily: 'Oswald-SemiBold', fontSize: 13, letterSpacing: 1.6, flexShrink: 1 }}>{name}</Text>
    </View>
  );
}

function Stacked({ level }: { level: number }) {
  return (
    <View style={{ width: 160, height: 160 }}>
      {LAYERS.map(p => (
        <View key={p} style={{ position: 'absolute', left: 0, top: 0 }}>
          <JourneyBadge level={level} size={160} parts={[p]} />
        </View>
      ))}
    </View>
  );
}

export default function DevBadges() {
  const insets = useSafeAreaInsets();
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#000' }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}>
      <Pressable onPress={() => router.back()} style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <Text style={{ color: '#FC5454', fontFamily: 'Oswald-SemiBold', fontSize: 14, letterSpacing: 1.6 }}>‹ BACK · BADGE GALLERY (DEV)</Text>
      </Pressable>
      {[false, true].map(light => (
        <View key={String(light)} style={{ backgroundColor: light ? '#f3f1ef' : '#0c0b0d', paddingHorizontal: 20, paddingVertical: 8 }}>
          <Text style={{ color: light ? '#5e5858' : '#8a8a8a', fontFamily: 'Oswald-Medium', fontSize: 11, letterSpacing: 2, paddingVertical: 8 }}>{light ? 'LIGHT' : 'DARK'}</Text>
          {LEVELS.map(l => <Row key={l} level={l} light={light} />)}
        </View>
      ))}
      <View style={{ backgroundColor: '#0c0b0d', padding: 20, gap: 16 }}>
        <Text style={{ color: '#8a8a8a', fontFamily: 'Oswald-Medium', fontSize: 11, letterSpacing: 2 }}>DETERMINED · FORGE (HOT) PALETTE</Text>
        <JourneyBadge level={4} size={160} hot />
        <Text style={{ color: '#8a8a8a', fontFamily: 'Oswald-Medium', fontSize: 11, letterSpacing: 2 }}>LAYERS REASSEMBLED (must match the whole badge)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {[6, 7, 8].map(l => <Stacked key={l} level={l} />)}
        </View>
      </View>
    </ScrollView>
  );
}
