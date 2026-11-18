import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { useMountedRef } from '../hooks/useMountedRef';
import { InboxService } from '../services/InboxService';
import { ActionCard, HeroCoachCard, TimelineRow, TIMELINE_INSET } from '../components/inbox/feed/FeedParts';
import { visibleItems, type GiftClaim, type InboxItem } from '../lib/inbox';
import { buildFeed, groupByMonth } from '../lib/inboxFeed';
import { track } from '../lib/analytics';
import { FLIP_X, isArabic, t } from '../i18n';
import { TC_COLORS, TCPalette } from '../../constants/trainingCenterTokens';

/** Types the server can say are done (get_inbox_status). */
const STATUS_TYPES = new Set(['week_complete_nudge', 'weekly_challenge_started']);

// The Notifications screen (/notifications), "action-first": what still needs
// the person at the top ("Needs you": the AI Coach week to build, a challenge
// to join, a leaderboard to defend, a gift to claim, a code to use), then
// everything else as a month-by-month timeline. Opened from the bell on
// Profile or by tapping a gift push. Layout rules: src/lib/inboxFeed.ts.
export function InboxScreen() {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => getStyles(c), [c]);
  const isMounted = useMountedRef();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [claims, setClaims] = useState<Record<string, GiftClaim>>({});
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = visibleItems(await InboxService.fetchInbox(), Date.now());
      const claimIds = list.map((i) => i.claimId).filter((id): id is string => !!id);
      const statusIds = list.filter((i) => STATUS_TYPES.has(i.type)).map((i) => i.id);
      const [claimMap, statusMap] = await Promise.all([
        InboxService.fetchGiftClaims(claimIds).catch(() => ({})),
        InboxService.fetchStatus(statusIds),
      ]);
      if (!isMounted.current) return;
      setItems(list);
      setClaims(claimMap);
      setStatus(statusMap);
      setFailed(false);
      // The badge clears on open (all of it, even rows the list doesn't show,
      // so the bell can't get stuck on a number). "Needs you" stays until done.
      const unreadIds = list.filter((i) => i.unread).map((i) => i.id);
      void InboxService.markAllSeen(unreadIds);
    } catch {
      if (isMounted.current) setFailed(true);
    }
  }, [isMounted]);

  useFocusEffect(
    useCallback(() => {
      track('inbox_viewed');
      void load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    if (isMounted.current) setRefreshing(false);
  };

  // Tapped: out of "Needs you" right away (the server is told in the background).
  const onActed = useCallback((id: string) => {
    void InboxService.markActed(id);
    setItems((prev) => prev?.map((i) => (i.id === id && !i.actedAt ? { ...i, actedAt: new Date().toISOString() } : i)) ?? prev);
    setStatus((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const feed = useMemo(() => buildFeed(items ?? [], claims, status, Date.now()), [items, claims, status]);
  const months = useMemo(() => groupByMonth(feed.activity, Date.now(), isArabic ? 'ar' : undefined), [feed.activity]);
  const needsCount = (feed.hero ? 1 : 0) + feed.cards.length;
  const hasItems = !!items && items.length > 0;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('inbox.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
          style={styles.headerBtn}
        >
          <MaterialCommunityIcons name="chevron-left" size={28} color={c.textPrimary} style={FLIP_X} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">{t('inbox.title')}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('inboxFeed.settings')}
          onPress={() => router.push('/notification-settings')}
          style={styles.headerBtn}
        >
          <MaterialCommunityIcons name="tune-variant" size={22} color={c.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.coral} />}
      >
        {items === null && !failed && <Skeleton styles={styles} />}

        {failed && (
          <View style={hasItems ? styles.errorInline : styles.empty}>
            <Text style={styles.emptyText}>{t('inbox.loadFailed')}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>{t('inbox.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {items !== null && !failed && items.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="trophy-outline" size={24} color={c.coral} />
            </View>
            <Text style={styles.emptyTitle}>{t('inbox.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('inbox.emptyBody')}</Text>
          </View>
        )}

        {hasItems && needsCount > 0 && (
          <View style={styles.needs}>
            <Text style={styles.sectionLabel} accessibilityRole="header">{t('inboxFeed.needsYou', { count: needsCount })}</Text>
            {feed.hero && <HeroCoachCard entry={feed.hero} onActed={onActed} />}
            {feed.cards.map((entry) => (
              <ActionCard
                key={entry.item.id}
                entry={entry}
                claim={entry.item.claimId ? claims[entry.item.claimId] : undefined}
                onActed={onActed}
              />
            ))}
          </View>
        )}

        {hasItems && months.length > 0 && (
          <View style={needsCount > 0 ? styles.activityAfterNeeds : null}>
            <Text style={[styles.sectionLabel, styles.activityLabel]} accessibilityRole="header">{t('inboxFeed.activity')}</Text>
            {months.map((month) => (
              <View key={month.key}>
                <Text style={styles.monthLabel}>{month.label}</Text>
                <View>
                  {/* From the first dot's centre to the last one's, inside this month only. */}
                  {month.items.length > 1 && (
                    <View
                      style={styles.timelineLine}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      pointerEvents="none"
                    />
                  )}
                  {month.items.map((item) => (
                    <TimelineRow key={item.id} item={item} onActed={onActed} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {hasItems && <Text style={styles.footer}>{t('inboxFeed.caughtUp')}</Text>}
      </ScrollView>
    </View>
  );
}

/** Grey blocks in the screen's shape while it loads: the hero, two cards, four timeline rows. */
function Skeleton({ styles }: { styles: ReturnType<typeof getStyles> }) {
  return (
    <View accessibilityLabel={t('inbox.loading')} style={styles.needs}>
      <View style={[styles.skeletonBar, { width: 110, height: 13 }]} />
      <View style={[styles.skeletonBlock, { height: 196, borderRadius: 22 }]} />
      <View style={[styles.skeletonBlock, { height: 78 }]} />
      <View style={[styles.skeletonBlock, { height: 78 }]} />
      <View style={{ gap: 18, marginTop: 20 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonRow}>
            <View style={styles.skeletonDot} />
            <View style={[styles.skeletonBar, { flex: 1 }]} />
          </View>
        ))}
      </View>
    </View>
  );
}

const CARD_INSET = 16;
const LINE_START = TIMELINE_INSET + 18 - 0.75;

function getStyles(c: TCPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.screenBg },
    header: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 6,
    },
    headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 22, letterSpacing: 2 },
    content: { paddingTop: 8, paddingBottom: 40 },
    needs: { paddingHorizontal: CARD_INSET, gap: 12 },
    sectionLabel: {
      color: c.textBody,
      fontFamily: 'BarlowCondensed-Bold',
      fontSize: 16,
      letterSpacing: 1.5,
      paddingHorizontal: TIMELINE_INSET - CARD_INSET,
    },
    activityAfterNeeds: { marginTop: 28 },
    activityLabel: { paddingHorizontal: TIMELINE_INSET },
    monthLabel: {
      color: c.textMuted,
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 12,
      marginTop: 12,
      marginBottom: 6,
      paddingHorizontal: TIMELINE_INSET,
    },
    timelineLine: {
      position: 'absolute',
      start: LINE_START,
      top: 30,
      bottom: 30,
      width: 1.5,
      backgroundColor: c.dividerStrong,
    },
    footer: {
      color: c.textMuted,
      fontFamily: 'PlusJakartaSans-Medium',
      fontSize: 13,
      textAlign: 'center',
      marginTop: 24,
    },
    empty: { alignItems: 'center', gap: 10, paddingTop: 56, paddingHorizontal: 24 },
    errorInline: { alignItems: 'center', gap: 8, marginHorizontal: CARD_INSET, marginBottom: 16, padding: 14, borderRadius: 14, backgroundColor: c.inputBg },
    emptyIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.iconWell,
    },
    emptyTitle: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 17, textAlign: 'center' },
    emptyText: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 14, lineHeight: 21, textAlign: 'center' },
    retryBtn: { borderColor: c.borderStrong, borderWidth: 1, borderRadius: 12, minHeight: 44, justifyContent: 'center', paddingHorizontal: 28, marginTop: 6 },
    retryText: { color: c.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 1.4 },
    skeletonBlock: { backgroundColor: c.inputBg, borderRadius: 18 },
    skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: TIMELINE_INSET - CARD_INSET },
    skeletonDot: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.inputBg },
    skeletonBar: { height: 12, borderRadius: 6, backgroundColor: c.inputBg },
  });
}
