import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { useMountedRef } from '../hooks/useMountedRef';
import {
  getMyCoachingReview,
  isComplete,
  submitCoachingReview,
  type ContinueChoice,
  type OpenCoachingReview,
  type Progress,
} from '../lib/coachingReview';
import { kt } from '../components/worlds/kit';
import { LeapLogo } from '../components/LeapLogo';
import { FLIP_X, isArabic, ltr, t } from '../i18n';

// The athlete's coaching review, in the Journey achievement card's style
// (the same shell: glowing coral border, top light, medallion hero, panels,
// LEAP ARENA pill, big coral button under the card). Opened from the push
// ("Review") or the Journey card. Everything is a tap; the comment is optional.
//   check-in  mood (5 faces) + seeing progress?
//   final     journey stars + continue + recommend (0-10)

const CORAL = '#FC5454';
const FACES = ['😫', '😕', '😐', '🙂', '🤩'] as const;
const PROGRESS: Progress[] = ['not_yet', 'little', 'clear'];
const CONTINUES: ContinueChoice[] = ['yes', 'break', 'no'];

type Step = 'loading' | 'form' | 'sending' | 'thanks' | 'closed';

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Same values as the achievement card (AchievementCelebration palette). */
function palette(light: boolean) {
  return light
    ? { screen: '#f6f3f2', card: '#ffffff', t1: '#141010', t2: '#3a3434', t3: '#5e5858', t5: '#7a7474',
        panel: '#faf8f7', panelBorder: '#efe9e7', option: '#ffffff', optionBorder: '#e8e1df', pill: 'rgba(252,84,84,0.22)',
        input: '#ffffff', borderA: 0.6, radialA: 0.1, glowA: 0.4 }
    : { screen: '#060507', card: '#0c0b0d', t1: '#ffffff', t2: '#d0d0d0', t3: '#a0a0a0', t5: '#6a6a6a',
        panel: 'rgba(255,255,255,0.025)', panelBorder: '#1d1b1e', option: 'rgba(255,255,255,0.03)', optionBorder: '#2a272b', pill: 'rgba(252,84,84,0.28)',
        input: 'rgba(255,255,255,0.03)', borderA: 0.5, radialA: 0.16, glowA: 0.55 };
}
type Palette = ReturnType<typeof palette>;

const tap = () => {
  Haptics.selectionAsync().catch(() => {});
};

/** The card's hero: a soft coral glow behind a ringed medallion. */
function Medallion({ children, size = 72, glowA }: { children: React.ReactNode; size?: number; glowA: number }) {
  const glow = size * 1.8;
  return (
    <View style={{ height: glow * 0.7, alignItems: 'center', justifyContent: 'center' }}>
      <View pointerEvents="none" style={{ position: 'absolute', width: glow, height: glow }}>
        <Svg width={glow} height={glow}>
          <Defs>
            <RadialGradient id="reviewGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={CORAL} stopOpacity={glowA} />
              <Stop offset="1" stopColor={CORAL} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={glow / 2} cy={glow / 2} r={glow / 2} fill="url(#reviewGlow)" />
        </Svg>
      </View>
      <Animated.View
        entering={ZoomIn.duration(420)}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: rgba(CORAL, 0.85),
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: rgba(CORAL, 0.1),
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

/** The achievement card shell. */
function Card({ p, label, icon, children }: { p: Palette; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; children: React.ReactNode }) {
  const date = new Date().toLocaleDateString(isArabic ? 'ar' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  return (
    <Animated.View
      entering={FadeInDown.duration(420)}
      style={{
        borderRadius: 24,
        paddingTop: 16,
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: p.card,
        borderWidth: 1,
        borderColor: rgba(CORAL, p.borderA),
        overflow: 'hidden',
        boxShadow: `0 0 50px 2px ${rgba(CORAL, 0.18)}`,
      }}
    >
      <LinearGradient pointerEvents="none" colors={[rgba(CORAL, p.radialA), 'transparent']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.5 }} style={StyleSheet.absoluteFill} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <MaterialCommunityIcons name={icon} size={15} color={CORAL} />
          <Text style={kt('semibold', isArabic ? 12 : 11, CORAL, 2.4)}>{label}</Text>
        </View>
        <Text style={kt('medium', 11, p.t5, 1.6)}>{ltr(date)}</Text>
      </View>
      {children}
    </Animated.View>
  );
}

/** A question in its own panel, like the achievement stats panel. */
function Panel({ p, title, children }: { p: Palette; title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: p.panelBorder, backgroundColor: p.panel, padding: 11, gap: 9 }}>
      <Text style={kt('semibold', isArabic ? 13 : 11, p.t1, isArabic ? 0 : 1.8)}>{isArabic ? title : title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Choice({ p, on, label, onPress, flex = 1 }: { p: Palette; on: boolean; label: string; onPress: () => void; flex?: number }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({
        flex,
        minHeight: 38,
        borderRadius: 10,
        borderWidth: on ? 2 : 1,
        borderColor: on ? CORAL : p.optionBorder,
        backgroundColor: on ? rgba(CORAL, 0.12) : p.option,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={[kt(on ? 'semibold' : 'medium', 13, on ? p.t1 : p.t2, 0.5), { textAlign: 'center' }]} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </Pressable>
  );
}

function BigButton({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        marginTop: 12,
        height: 50,
        borderRadius: 14,
        backgroundColor: CORAL,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: disabled ? undefined : `0 10px 30px ${rgba(CORAL, 0.3)}`,
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={kt('bold', 15, '#ffffff', 2.4)}>{label}</Text>}
    </Pressable>
  );
}

function BrandPill({ p }: { p: Palette }) {
  return (
    <View style={{ marginTop: 12, alignItems: 'center' }}>
      <View style={{ height: 26, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: p.pill, flexDirection: 'row', alignItems: 'center', gap: 8, direction: 'ltr' }}>
        <LeapLogo size={15} animated={false} />
        <Text style={kt('semibold', 10, p.t1, 2.2)}>LEAP ARENA</Text>
      </View>
    </View>
  );
}

export function CoachingReviewScreen() {
  const { mode } = useTheme();
  const p = useMemo(() => palette(mode === 'light'), [mode]);
  const isMounted = useMountedRef();
  const { reviewId, preview } = useLocalSearchParams<{ reviewId?: string; preview?: string }>();
  // Dev builds only (Settings → Preview…): sample data, nothing is saved.
  const previewKind = __DEV__ && (preview === 'checkin' || preview === 'final') ? preview : null;

  const [review, setReview] = useState<OpenCoachingReview | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState<string | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [continueChoice, setContinueChoice] = useState<ContinueChoice | null>(null);
  const [recommend, setRecommend] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (previewKind) {
      setReview({ id: 'preview', kind: previewKind, coach_name: 'Coach Omar', ends_on: '', weeks: 12, workouts: 41 });
      setStep('form');
      return;
    }
    getMyCoachingReview(reviewId ?? null)
      .then((r) => {
        if (!isMounted.current) return;
        setReview(r);
        setStep(r ? 'form' : 'closed');
      })
      .catch(() => {
        if (!isMounted.current) return;
        setStep('closed');
      });
  }, [reviewId, previewKind, isMounted]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/my-journey' as never));

  const complete = review ? isComplete(review.kind, { mood, progress, rating, continueChoice, recommend }) : false;

  async function send() {
    if (!review || !complete) return;
    setStep('sending');
    setError(null);
    if (previewKind) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setStep('thanks');
      return;
    }
    try {
      await submitCoachingReview(
        review.id,
        review.kind === 'checkin'
          ? { kind: 'checkin', mood: mood!, progress: progress!, comment }
          : { kind: 'final', rating: rating!, continueChoice: continueChoice!, recommend: recommend!, comment },
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (isMounted.current) setStep('thanks');
    } catch {
      if (!isMounted.current) return;
      setError(t('coachingReview.error'));
      setStep('form');
    }
  }

  const coach = review?.coach_name ?? '';
  const isCheckin = review?.kind === 'checkin';
  const label = isCheckin ? t('coachingReview.headerCheckin') : t('coachingReview.headerFinal');
  const icon = isCheckin ? 'message-reply-text-outline' : 'star-four-points-outline';

  return (
    <View style={{ flex: 1, backgroundColor: p.screen }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('coachingReview.back')}
          onPress={leave}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={28} color={p.t1} style={FLIP_X} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingTop: 4, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 'loading' && <ActivityIndicator color={CORAL} />}

          {step === 'closed' && (
            <>
              <Card p={p} label={t('coachingReview.headerCheckin')} icon="message-reply-text-outline">
                <Medallion glowA={p.glowA}>
                  <MaterialCommunityIcons name="check-all" size={32} color={CORAL} />
                </Medallion>
                <Text style={[kt('bold', 21, p.t1, 1, 25), { textAlign: 'center' }]}>{t('coachingReview.closedTitle')}</Text>
                <Text style={[kt('regular', 13, p.t3, 0, 18), { textAlign: 'center', marginTop: 8 }]}>{t('coachingReview.closedBody')}</Text>
                <BrandPill p={p} />
              </Card>
              <BigButton label={t('coachingReview.done')} onPress={leave} />
            </>
          )}

          {step === 'thanks' && (
            <>
              <Card p={p} label={label} icon={icon}>
                <Medallion glowA={p.glowA} size={80}>
                  {isCheckin && mood ? (
                    <Text style={{ fontSize: 38 }}>{FACES[mood - 1]}</Text>
                  ) : (
                    <MaterialCommunityIcons name="check-bold" size={38} color={CORAL} />
                  )}
                </Medallion>
                <Text style={[kt('bold', 24, p.t1, 1.6, 28), { textAlign: 'center' }]} numberOfLines={1} adjustsFontSizeToFit>
                  {t('coachingReview.thanksTitle')}
                </Text>
                <Text style={[kt('regular', 13, p.t3, 0, 18), { textAlign: 'center', marginTop: 8 }]}>
                  {t('coachingReview.thanksBody', { coach })}
                </Text>
                <BrandPill p={p} />
              </Card>
              <BigButton label={t('coachingReview.done')} onPress={leave} />
            </>
          )}

          {(step === 'form' || step === 'sending') && review && (
            <>
              <Card p={p} label={label} icon={icon}>
                {isCheckin ? (
                  <>
                    <Medallion glowA={p.glowA}>
                      <Text style={{ fontSize: 34, opacity: mood ? 1 : 0.35 }}>{FACES[(mood ?? 4) - 1]}</Text>
                    </Medallion>
                    <Text style={[kt('bold', 24, p.t1, 1.6, 28), { textAlign: 'center' }]} numberOfLines={1} adjustsFontSizeToFit>
                      {isArabic ? t('coachingReview.checkinTitle') : t('coachingReview.checkinTitle').toUpperCase()}
                    </Text>
                    <Text style={[kt('regular', 13, p.t3, 0, 18), { textAlign: 'center', marginTop: 6 }]}>
                      {t('coachingReview.checkinBody', { coach })}
                    </Text>

                    <Panel p={p} title={t('coachingReview.moodQ')}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {FACES.map((face, i) => {
                          const value = i + 1;
                          const on = mood === value;
                          return (
                            <Pressable
                              key={value}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: on }}
                              accessibilityLabel={t(`coachingReview.mood${value}` as 'coachingReview.mood1')}
                              onPress={() => {
                                tap();
                                setMood(value);
                              }}
                              style={{
                                flex: 1,
                                aspectRatio: 1,
                                maxHeight: 48,
                                borderRadius: 12,
                                borderWidth: on ? 2 : 1,
                                borderColor: on ? CORAL : p.optionBorder,
                                backgroundColor: on ? rgba(CORAL, 0.12) : p.option,
                                alignItems: 'center',
                                justifyContent: 'center',
                                transform: [{ scale: on ? 1.06 : 1 }],
                              }}
                            >
                              <Text style={{ fontSize: 22, opacity: mood && !on ? 0.55 : 1 }}>{face}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Panel>

                    <Panel p={p} title={t('coachingReview.progressQ')}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {PROGRESS.map((v) => (
                          <Choice
                            key={v}
                            p={p}
                            on={progress === v}
                            label={t(`coachingReview.progress_${v}` as 'coachingReview.progress_not_yet')}
                            onPress={() => setProgress(v)}
                          />
                        ))}
                      </View>
                    </Panel>
                  </>
                ) : (
                  <>
                    <Medallion glowA={p.glowA}>
                      <MaterialCommunityIcons name="trophy-outline" size={32} color={CORAL} />
                    </Medallion>
                    <Text style={[kt('bold', 22, p.t1, 1.4, 26), { textAlign: 'center' }]} numberOfLines={2} adjustsFontSizeToFit>
                      {isArabic ? t('coachingReview.finalTitle') : t('coachingReview.finalTitle').toUpperCase()}
                    </Text>

                    {/* Journey recap, like the achievement stats panel. */}
                    <View style={{ marginTop: 10, flexDirection: 'row', borderRadius: 14, borderWidth: 1, borderColor: p.panelBorder, backgroundColor: p.panel, paddingVertical: 8 }}>
                      {[
                        { n: review.weeks, label: t('coachingReview.statWeeks') },
                        { n: review.workouts, label: t('coachingReview.statWorkouts') },
                      ].map((s, i) => (
                        <View key={s.label} style={{ flex: 1, alignItems: 'center', borderLeftWidth: i ? 1 : 0, borderLeftColor: p.panelBorder }}>
                          <Text style={kt('bold', 24, p.t1, 0.5, 28)}>{ltr(String(s.n))}</Text>
                          <Text style={kt('semibold', 10, p.t5, 1.8)}>{s.label}</Text>
                        </View>
                      ))}
                    </View>

                    <Panel p={p} title={t('coachingReview.ratingQ')}>
                      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, direction: 'ltr' }}>
                        {[1, 2, 3, 4, 5].map((n) => {
                          const on = rating != null && n <= rating;
                          return (
                            <Pressable
                              key={n}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: rating === n }}
                              accessibilityLabel={t('coachingReview.starsA11y', { count: n })}
                              onPress={() => {
                                tap();
                                setRating(n);
                              }}
                              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                            >
                              <MaterialCommunityIcons name={on ? 'star' : 'star-outline'} size={32} color={on ? CORAL : p.t5} />
                            </Pressable>
                          );
                        })}
                      </View>
                    </Panel>

                    <Panel p={p} title={t('coachingReview.continueQ')}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {CONTINUES.map((v) => (
                          <Choice
                            key={v}
                            p={p}
                            on={continueChoice === v}
                            label={t(`coachingReview.continue_${v}` as 'coachingReview.continue_yes')}
                            onPress={() => setContinueChoice(v)}
                          />
                        ))}
                      </View>
                    </Panel>

                    <Panel p={p} title={t('coachingReview.recommendQ')}>
                      <View style={{ flexDirection: 'row', gap: 4, direction: 'ltr' }}>
                        {Array.from({ length: 11 }, (_, n) => {
                          const on = recommend === n;
                          return (
                            <Pressable
                              key={n}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: on }}
                              accessibilityLabel={t('coachingReview.recommendA11y', { value: n })}
                              onPress={() => {
                                tap();
                                setRecommend(n);
                              }}
                              style={{
                                flex: 1,
                                height: 32,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: on ? CORAL : p.optionBorder,
                                backgroundColor: on ? CORAL : p.option,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Text style={kt('semibold', 12, on ? '#ffffff' : p.t2)}>{n}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', direction: 'ltr' }}>
                        <Text style={kt('medium', 11, p.t5, 0.6)}>{t('coachingReview.recommendLow')}</Text>
                        <Text style={kt('medium', 11, p.t5, 0.6)}>{t('coachingReview.recommendHigh')}</Text>
                      </View>
                    </Panel>
                  </>
                )}

                <Panel p={p} title={t('coachingReview.commentQ')}>
                  <TextInput
                    style={[
                      kt('regular', 14, p.t1, 0, 19),
                      {
                        minHeight: 58,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: p.optionBorder,
                        backgroundColor: p.input,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        textAlignVertical: 'top',
                        textAlign: isArabic ? 'right' : 'left',
                      },
                    ]}
                    value={comment}
                    onChangeText={setComment}
                    placeholder={t('coachingReview.commentPlaceholder', { coach })}
                    placeholderTextColor={p.t5}
                    multiline
                    maxLength={1000}
                    accessibilityLabel={t('coachingReview.commentQ')}
                  />
                </Panel>

                {error && <Text style={[kt('medium', 13, CORAL), { textAlign: 'center', marginTop: 12 }]}>{error}</Text>}
                <BrandPill p={p} />
              </Card>
              <BigButton label={t('coachingReview.send')} onPress={send} disabled={!complete || step === 'sending'} busy={step === 'sending'} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
