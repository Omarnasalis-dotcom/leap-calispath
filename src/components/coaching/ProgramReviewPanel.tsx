import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getMyProgramReviews,
  markProgramReviewSeen,
  ProgramReview,
  reviewChangeLine,
  reviewForWeek,
  reviewReasonText,
  revertProgramReview,
} from '../../lib/programReview';
import { ProgramReviewSheet } from './ProgramReviewSheet';
import { t } from '../../i18n';

/**
 * The Leap team review of one week of an AI Coach program: the button to ask,
 * its progress, then the result. Reviews never load in the way of the workout:
 * until they do, or if they can't, this shows nothing.
 */
export function ProgramReviewPanel({ warriorProgramId, week, weekDone, onReverted }: {
  warriorProgramId: string;
  week: number;
  /** Every block is logged, so there's nothing left a review could change. */
  weekDone: boolean;
  onReverted: () => void;
}) {
  const { theme } = useTheme();
  const [reviews, setReviews] = useState<ProgramReview[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [open, setOpen] = useState(false);
  const [reverting, setReverting] = useState(false);

  const load = useCallback(async () => {
    try {
      setReviews(await getMyProgramReviews(warriorProgramId));
    } catch {
      setReviews(null);
    }
  }, [warriorProgramId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const review = reviews ? reviewForWeek(reviews, week) : null;
  const firstLook = review?.status === 'closed' && !review.seen_at;

  useEffect(() => setOpen(false), [review?.id]);
  // Stays open once shown, so reloading after a revert doesn't hide its result.
  useEffect(() => {
    if (!firstLook || !review) return;
    setOpen(true);
    markProgramReviewSeen(review.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review?.id, firstLook]);

  if (!reviews) return null;

  const box = { backgroundColor: theme.card.background, borderColor: theme.card.border };

  if (!review) {
    if (weekDone || reviews.some(r => r.status === 'open')) return null;
    return (
      <>
        <TouchableOpacity accessibilityRole="button" onPress={() => setAsking(true)} style={styles.ask} hitSlop={6}>
          <MaterialCommunityIcons name="shield-check-outline" size={15} color={theme.accentText} />
          <Text style={[styles.askText, { color: theme.accentText }]}>{t('programReview.ask')}</Text>
        </TouchableOpacity>
        <ProgramReviewSheet
          visible={asking}
          warriorProgramId={warriorProgramId}
          week={week}
          onClose={() => setAsking(false)}
          onSent={() => { setAsking(false); load(); }}
        />
      </>
    );
  }

  if (review.status === 'open') {
    return (
      <View style={[styles.row, box]}>
        <MaterialCommunityIcons name="shield-search" size={16} color={theme.accentText} />
        <Text style={[styles.rowText, { color: theme.text.primary }]}>{t('programReview.inReview')}</Text>
      </View>
    );
  }

  // Seen before: one quiet line, the full result on tap.
  if (!firstLook && !open) {
    return (
      <TouchableOpacity accessibilityRole="button" onPress={() => setOpen(true)} style={[styles.row, box]}>
        <MaterialCommunityIcons name="shield-check" size={16} color={theme.accentText} />
        <Text style={[styles.rowText, { color: theme.text.primary }]}>{t('programReview.reviewed')}</Text>
        <MaterialCommunityIcons name="chevron-down" size={18} color={theme.text.secondary} />
      </TouchableOpacity>
    );
  }

  const changed = review.outcome === 'changed';
  const reverted = !!review.reverted_at;

  const confirmRevert = () => {
    Alert.alert(t('programReview.revertTitle'), t('programReview.revertBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('programReview.revert'),
        style: 'destructive',
        onPress: async () => {
          setReverting(true);
          try {
            await revertProgramReview(review.id);
            await load();
            onReverted();
          } catch {
            Alert.alert(t('programReview.errDefault'));
          } finally {
            setReverting(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.card, box]}>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="shield-check" size={18} color={theme.accentText} />
        <Text style={[styles.title, { color: theme.text.primary }]}>
          {t(changed ? 'programReview.changedTitle' : 'programReview.accurateTitle')}
        </Text>
      </View>

      {review.changes.map((change, i) => (
        <View key={i} style={styles.change}>
          <Text style={[styles.changeLine, { color: theme.text.primary }]}>{reviewChangeLine(change)}</Text>
          <Text style={[styles.body, { color: theme.text.secondary }]}>{reviewReasonText(change.reason)}</Text>
        </View>
      ))}

      {!!review.message && <Text style={[styles.body, { color: theme.text.primary }]}>{review.message}</Text>}

      {reverted ? (
        <Text style={[styles.body, { color: theme.text.secondary }]}>
          {t('programReview.reverted')}
          {review.revert_skipped ? ` ${t('programReview.revertSkipped', { count: review.revert_skipped })}` : ''}
        </Text>
      ) : (
        <Text style={[styles.body, { color: theme.text.secondary }]}>
          {t(changed ? 'programReview.changedBody' : 'programReview.accurateBody')}
        </Text>
      )}

      <View style={styles.actions}>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/coach')} style={[styles.action, { backgroundColor: theme.accent }]}>
          <Text style={styles.actionText}>{t('programReview.askCoach')}</Text>
        </TouchableOpacity>
        {review.can_revert && (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={reverting}
            onPress={confirmRevert}
            style={[styles.action, styles.ghost, { borderColor: theme.card.border }]}
          >
            {reverting
              ? <ActivityIndicator color={theme.text.primary} />
              : <Text style={[styles.ghostText, { color: theme.text.primary }]}>{t('programReview.revert')}</Text>}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ask: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  askText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12 },
  rowText: { flex: 1, fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 15 },
  change: { gap: 2 },
  changeLine: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 13.5 },
  body: { fontFamily: 'PlusJakartaSans-Regular', fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  action: { flexGrow: 1, minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  actionText: { color: '#000', fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 12.5, letterSpacing: 0.4 },
  ghost: { borderWidth: 1 },
  ghostText: { fontFamily: 'PlusJakartaSans-Bold', fontSize: 12.5, letterSpacing: 0.4 },
});
