import React, { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { JourneyBadge, BadgePart } from '../src/components/journey/badges/JourneyBadge';
import { AchievementCelebration } from '../src/components/journey/achievements/AchievementCelebration';
import { CelebrationData } from '../src/lib/journeyCelebration';
import { ACHIEVEMENTS } from '../src/lib/journeyAchievements';
import { WelcomeTourCard } from '../src/components/tutorial/WelcomeTourCard';
import { PRCelebration } from '../src/components/celebration/PRCelebration';
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

/** Mock celebrations for every level (levels 4–8 use their final reveals once built). */
function mockCelebration(level: number, double = false): CelebrationData {
  const a = ACHIEVEMENTS[level - 1];
  const nextT = ACHIEVEMENTS[level]?.threshold ?? null;
  return {
    level,
    previousLevel: double ? Math.max(0, level - 2) : level - 1,
    skipped: double && level > 1 ? [level - 1] : [],
    fromPoints: Math.round(a.threshold * 0.9),
    toPoints: a.threshold + 120,
    nextThreshold: nextT,
  };
}

export default function DevBadges() {
  const insets = useSafeAreaInsets();
  const [playing, setPlaying] = useState<CelebrationData | null>(null);
  const [welcome, setWelcome] = useState<{ tier: number; name: string | null } | null>(null);
  const [strengthPR, setStrengthPR] = useState(false);
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#000' }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}>
      <Pressable onPress={() => router.back()} style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <Text style={{ color: '#FC5454', fontFamily: 'Oswald-SemiBold', fontSize: 14, letterSpacing: 1.6 }}>‹ BACK · BADGE GALLERY (DEV)</Text>
      </Pressable>
      <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 10 }}>
        <Text style={{ color: '#8a8a8a', fontFamily: 'Oswald-Medium', fontSize: 11, letterSpacing: 2 }}>PLAY A CELEBRATION</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ACHIEVEMENTS.map(a => (
            <Pressable key={a.level} onPress={() => setPlaying(mockCelebration(a.level))} style={{ paddingHorizontal: 12, height: 34, borderRadius: 10, borderWidth: 1, borderColor: a.tone, justifyContent: 'center' }}>
              <Text style={{ color: a.tone, fontFamily: 'Oswald-SemiBold', fontSize: 12, letterSpacing: 1.2 }}>{a.level} · {a.key.toUpperCase()}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setPlaying(mockCelebration(3, true))} style={{ paddingHorizontal: 12, height: 34, borderRadius: 10, borderWidth: 1, borderColor: '#FC5454', justifyContent: 'center' }}>
            <Text style={{ color: '#FC5454', fontFamily: 'Oswald-SemiBold', fontSize: 12, letterSpacing: 1.2 }}>DOUBLE JUMP → 3</Text>
          </Pressable>
        </View>
      </View>
      <AchievementCelebration data={playing} onDone={() => setPlaying(null)} />
      <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 10 }}>
        <Text style={{ color: '#8a8a8a', fontFamily: 'Oswald-Medium', fontSize: 11, letterSpacing: 2 }}>WELCOME TOUR CARD</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            { label: '0 · HELOT', tier: 0, name: 'Omar' },
            { label: '4 · SPARTAN', tier: 4, name: 'Omar Nasser' },
            { label: '8 · DEMIGOD', tier: 8, name: 'Omar' },
            { label: 'NO NAME', tier: 2, name: null },
            { label: 'LONG NAME', tier: 5, name: 'Abdulrahman-Maximilian Alexander' },
            { label: 'ARABIC NAME', tier: 3, name: 'عمر ناصر' },
          ].map(w => (
            <Pressable key={w.label} onPress={() => setWelcome(w)} style={{ paddingHorizontal: 12, height: 34, borderRadius: 10, borderWidth: 1, borderColor: '#FC5454', justifyContent: 'center' }}>
              <Text style={{ color: '#FC5454', fontFamily: 'Oswald-SemiBold', fontSize: 12, letterSpacing: 1.2 }}>{w.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 10 }}>
        <Text style={{ color: '#8a8a8a', fontFamily: 'Oswald-Medium', fontSize: 11, letterSpacing: 2 }}>STRENGTH TRIAL STEPS (YOUR TIER)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pressable onPress={() => setStrengthPR(true)} style={{ paddingHorizontal: 12, height: 34, borderRadius: 10, borderWidth: 1, borderColor: '#FC5454', justifyContent: 'center' }}>
            <Text style={{ color: '#FC5454', fontFamily: 'Oswald-SemiBold', fontSize: 12, letterSpacing: 1.2 }}>TRIAL NEW BEST</Text>
          </Pressable>
          {(['1', '2'] as const).map(step => (
            <Pressable key={step} onPress={() => router.push({ pathname: '/trial', params: { mode: 'step', step } })} style={{ paddingHorizontal: 12, height: 34, borderRadius: 10, borderWidth: 1, borderColor: '#FC5454', justifyContent: 'center' }}>
              <Text style={{ color: '#FC5454', fontFamily: 'Oswald-SemiBold', fontSize: 12, letterSpacing: 1.2 }}>STEP {step}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <PRCelebration visible={strengthPR} world="strength" movement="Hoplite Trial" value={192} previous={220} handle="you" onDismiss={() => setStrengthPR(false)} />
      <WelcomeTourCard visible={welcome != null} tier={welcome?.tier ?? 0} name={welcome?.name} onStart={() => setWelcome(null)} onSkip={() => setWelcome(null)} />
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
