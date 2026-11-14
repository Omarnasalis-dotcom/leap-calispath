import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { getMyCoachingReview, type OpenCoachingReview } from '../../lib/coachingReview';
import { FLIP_X, t } from '../../i18n';
import { TC_COLORS, TCPalette } from '../../../constants/trainingCenterTokens';

// Journey tab: while the athlete has an open coaching review (asked by their
// coach's package: the 6-week check-in or the end-of-package review), a card
// that opens it. Hidden otherwise; re-checked whenever the tab is focused.
export function CoachingReviewCard() {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => getStyles(c), [c]);
  const router = useRouter();
  const [review, setReview] = useState<OpenCoachingReview | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getMyCoachingReview()
        .then((r) => alive && setReview(r))
        .catch(() => alive && setReview(null));
      return () => {
        alive = false;
      };
    }, []),
  );

  if (!review) return null;
  const isCheckin = review.kind === 'checkin';
  return (
    <TouchableOpacity
      accessibilityRole="button"
      style={styles.card}
      onPress={() => router.push(`/coaching-review?reviewId=${review.id}` as never)}
    >
      <View style={styles.icon}>
        <MaterialCommunityIcons name={isCheckin ? 'message-reply-text-outline' : 'star-outline'} size={22} color={c.coral} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>
          {isCheckin ? t('coachingReview.cardCheckin', { coach: review.coach_name }) : t('coachingReview.cardFinal')}
        </Text>
        <Text style={styles.cta}>{isCheckin ? t('coachingReview.cardCheckinCta') : t('coachingReview.cardFinalCta')}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={c.textMuted} style={FLIP_X} />
    </TouchableOpacity>
  );
}

function getStyles(c: TCPalette) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.coral,
      backgroundColor: c.inputBg,
    },
    icon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.iconWell,
    },
    title: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 15 },
    cta: { color: c.coralText, fontFamily: 'PlusJakartaSans-Bold', fontSize: 12, marginTop: 2 },
  });
}
