import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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
  type Workload,
} from '../lib/coachingReview';
import { FLIP_X, t } from '../i18n';
import { TC_COLORS, TC_LAYOUT, TCPalette } from '../../constants/trainingCenterTokens';

// The athlete's coaching review: opened from the push ("Review") or the
// Journey card. Everything is a tap; the comment is optional.
//   check-in  mood (5 faces) + workload
//   final     journey stars + continue + recommend (0-10)

const FACES = ['😫', '😕', '😐', '🙂', '🤩'] as const;
const WORKLOADS: Workload[] = ['easy', 'right', 'hard'];
const CONTINUES: ContinueChoice[] = ['yes', 'break', 'no'];

type Step = 'loading' | 'form' | 'sending' | 'thanks' | 'closed';

export function CoachingReviewScreen() {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => getStyles(c), [c]);
  const isMounted = useMountedRef();
  const { reviewId } = useLocalSearchParams<{ reviewId?: string }>();

  const [review, setReview] = useState<OpenCoachingReview | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState<string | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [workload, setWorkload] = useState<Workload | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [continueChoice, setContinueChoice] = useState<ContinueChoice | null>(null);
  const [recommend, setRecommend] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
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
  }, [reviewId, isMounted]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/my-journey' as never));

  const complete = review ? isComplete(review.kind, { mood, workload, rating, continueChoice, recommend }) : false;

  async function send() {
    if (!review || !complete) return;
    setStep('sending');
    setError(null);
    try {
      await submitCoachingReview(
        review.id,
        review.kind === 'checkin'
          ? { kind: 'checkin', mood: mood!, workload: workload!, comment }
          : { kind: 'final', rating: rating!, continueChoice: continueChoice!, recommend: recommend!, comment },
      );
      if (isMounted.current) setStep('thanks');
    } catch {
      if (!isMounted.current) return;
      setError(t('coachingReview.error'));
      setStep('form');
    }
  }

  const coach = review?.coach_name ?? '';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('coachingReview.back')}
          onPress={leave}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color={c.textPrimary} style={FLIP_X} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>
            {review?.kind === 'final' ? t('coachingReview.headerFinal') : t('coachingReview.headerCheckin')}
          </Text>
        </View>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 'loading' && <ActivityIndicator color={c.coral} style={{ marginTop: 40 }} />}

          {step === 'closed' && (
            <>
              <Text style={styles.title}>{t('coachingReview.closedTitle')}</Text>
              <Text style={styles.body}>{t('coachingReview.closedBody')}</Text>
              <TouchableOpacity accessibilityRole="button" style={styles.primaryBtn} onPress={leave}>
                <Text style={styles.primaryBtnText}>{t('coachingReview.done')}</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'thanks' && (
            <>
              <View style={styles.iconWell}>
                <MaterialCommunityIcons name="check" size={30} color={c.coral} />
              </View>
              <Text style={styles.title}>{t('coachingReview.thanksTitle')}</Text>
              <Text style={styles.body}>{t('coachingReview.thanksBody', { coach })}</Text>
              <TouchableOpacity accessibilityRole="button" style={styles.primaryBtn} onPress={leave}>
                <Text style={styles.primaryBtnText}>{t('coachingReview.done')}</Text>
              </TouchableOpacity>
            </>
          )}

          {(step === 'form' || step === 'sending') && review && (
            <>
              {review.kind === 'checkin' ? (
                <>
                  <Text style={styles.title}>{t('coachingReview.checkinTitle')}</Text>
                  <Text style={styles.body}>{t('coachingReview.checkinBody', { coach })}</Text>

                  <Text style={styles.question}>{t('coachingReview.moodQ')}</Text>
                  <View style={styles.row}>
                    {FACES.map((face, i) => {
                      const value = i + 1;
                      const on = mood === value;
                      return (
                        <TouchableOpacity
                          key={value}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={t(`coachingReview.mood${value}` as 'coachingReview.mood1')}
                          style={[styles.face, on && styles.optionOn]}
                          onPress={() => setMood(value)}
                        >
                          <Text style={styles.faceText}>{face}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.question}>{t('coachingReview.workloadQ')}</Text>
                  <View style={styles.row}>
                    {WORKLOADS.map((w) => {
                      const on = workload === w;
                      return (
                        <TouchableOpacity
                          key={w}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          style={[styles.pill, on && styles.optionOn]}
                          onPress={() => setWorkload(w)}
                        >
                          <Text style={[styles.pillText, on && styles.pillTextOn]}>
                            {t(`coachingReview.workload_${w}` as 'coachingReview.workload_easy')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.title}>{t('coachingReview.finalTitle')}</Text>
                  <View style={styles.recap}>
                    <Text style={styles.recapText}>
                      {t('coachingReview.recapWeeks', { count: review.weeks })}
                      {'  ·  '}
                      {t('coachingReview.recapWorkouts', { count: review.workouts })}
                    </Text>
                  </View>

                  <Text style={styles.question}>{t('coachingReview.ratingQ')}</Text>
                  <View style={[styles.row, { justifyContent: 'center', gap: 6 }]}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: rating === n }}
                        accessibilityLabel={t('coachingReview.starsA11y', { count: n })}
                        onPress={() => setRating(n)}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        <MaterialCommunityIcons
                          name={rating != null && n <= rating ? 'star' : 'star-outline'}
                          size={40}
                          color={rating != null && n <= rating ? c.coral : c.textFaint}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.question}>{t('coachingReview.continueQ')}</Text>
                  <View style={styles.row}>
                    {CONTINUES.map((v) => {
                      const on = continueChoice === v;
                      return (
                        <TouchableOpacity
                          key={v}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          style={[styles.pill, on && styles.optionOn]}
                          onPress={() => setContinueChoice(v)}
                        >
                          <Text style={[styles.pillText, on && styles.pillTextOn]}>
                            {t(`coachingReview.continue_${v}` as 'coachingReview.continue_yes')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.question}>{t('coachingReview.recommendQ')}</Text>
                  <View style={styles.scale}>
                    {Array.from({ length: 11 }, (_, n) => {
                      const on = recommend === n;
                      return (
                        <TouchableOpacity
                          key={n}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={t('coachingReview.recommendA11y', { value: n })}
                          style={[styles.scaleCell, on && styles.scaleCellOn]}
                          onPress={() => setRecommend(n)}
                        >
                          <Text style={[styles.scaleText, on && styles.pillTextOn]}>{n}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.scaleEnds}>
                    <Text style={styles.note}>{t('coachingReview.recommendLow')}</Text>
                    <Text style={styles.note}>{t('coachingReview.recommendHigh')}</Text>
                  </View>
                </>
              )}

              <Text style={styles.question}>{t('coachingReview.commentQ')}</Text>
              <TextInput
                style={styles.input}
                value={comment}
                onChangeText={setComment}
                placeholder={t('coachingReview.commentPlaceholder', { coach })}
                placeholderTextColor={c.textFaint}
                multiline
                maxLength={1000}
                accessibilityLabel={t('coachingReview.commentQ')}
              />

              {error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.primaryBtn, (!complete || step === 'sending') && styles.disabled]}
                disabled={!complete || step === 'sending'}
                onPress={send}
              >
                {step === 'sending' ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.primaryBtnText}>{t('coachingReview.send')}</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function getStyles(c: TCPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.screenBg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: TC_LAYOUT.screenPadding,
      paddingTop: 14,
      paddingBottom: 10,
    },
    headerTitle: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 19, letterSpacing: 1.9 },
    content: { padding: TC_LAYOUT.screenPadding, paddingTop: 20, paddingBottom: 48, gap: 14 },
    iconWell: {
      alignSelf: 'center',
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.iconWell,
    },
    title: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 24, letterSpacing: 1, textAlign: 'center' },
    body: { color: c.textBody, fontFamily: 'PlusJakartaSans-Medium', fontSize: 15, lineHeight: 22, textAlign: 'center' },
    question: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 15, marginTop: 10 },
    note: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 12 },
    row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    face: {
      flex: 1,
      minWidth: 52,
      aspectRatio: 1,
      maxHeight: 64,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.inputBg,
    },
    faceText: { fontSize: 28 },
    optionOn: { borderColor: c.coral, borderWidth: 2 },
    pill: {
      flex: 1,
      minHeight: 46,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      backgroundColor: c.inputBg,
    },
    pillText: { color: c.textSecondary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 14, textAlign: 'center' },
    pillTextOn: { color: c.textPrimary },
    recap: {
      alignSelf: 'center',
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 6,
      backgroundColor: c.iconWell,
    },
    recapText: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 13 },
    scale: { flexDirection: 'row', gap: 4 },
    scaleCell: {
      flex: 1,
      height: 40,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.inputBg,
    },
    scaleCellOn: { backgroundColor: c.coral, borderColor: c.coral },
    scaleText: { color: c.textSecondary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 13 },
    scaleEnds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
    input: {
      backgroundColor: c.inputBg,
      borderColor: c.inputBorder,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 84,
      color: c.textPrimary,
      fontFamily: 'PlusJakartaSans-Medium',
      fontSize: 15,
      textAlignVertical: 'top',
    },
    error: { color: c.coralText, fontFamily: 'PlusJakartaSans-Medium', fontSize: 13, textAlign: 'center' },
    primaryBtn: { backgroundColor: c.coral, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 6 },
    primaryBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 15, letterSpacing: 1.6 },
    disabled: { opacity: 0.4 },
  });
}
