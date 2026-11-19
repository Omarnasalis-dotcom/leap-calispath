import React, { useCallback, useMemo, useState } from 'react';
import { AppState, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { useMountedRef } from '../hooks/useMountedRef';
import { InboxService } from '../services/InboxService';
import { ActionCard, ChallengeGroupRow, DOT, HeroCoachCard, ROW_MIN_HEIGHT, TimelineRow, TIMELINE_INSET } from '../components/inbox/feed/FeedParts';
import { INBOX_WINDOW_DAYS, type GiftClaim, type InboxItem } from '../lib/inbox';
import { buildFeed, foldChallenges, groupByMonth, type ActivityEntry } from '../lib/inboxFeed';
import { track } from '../lib/analytics';
import { FLIP_X, isArabic, t } from '../i18n';
import { TC_COLORS, TCPalette } from '../../constants/trainingCenterTokens';

// The Notifications screen (/notifications), "action-first": what still needs
// the person at the top ("Needs you": the AI Coach week to build, a challenge
// to join, a leaderboard to defend, a gift to claim, a code to use), then
// everything else as a timeline: what arrived since the last visit under
// "New", then month by month. Opened from the bell on Profile or by tapping
// a gift push. Layout rules: src/lib/inboxFeed.ts.
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
  // Unread when they arrived on screen: they stay under "New" until the
  // person leaves, even though opening the screen marks them read.
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    try {
      const data = await InboxService.fetchFeedData();
      if (!isMounted.current) return;
      setItems(data.items);
      setClaims(data.claims);
      setStatus(data.status);
      setFailed(false);
      const unreadIds = data.items.filter((i) => i.unread).map((i) => i.id);
      if (unreadIds.length > 0) setNewIds((prev) => new Set([...prev, ...unreadIds]));
      // What the person was shown up front, to measure how often it's acted on.
      const shown = buildFeed(data.items, data.claims, data.status, Date.now());
      const kinds = [shown.hero, ...shown.cards].filter(Boolean).map((e) => e!.kind);
      if (kinds.length > 0) track('inbox_needs_shown', { count: kinds.length, kinds: kinds.join(',') });
      // Opening reads everything (even rows the list doesn't show, so no
      // unread count gets stuck). The bell then counts only "Needs you".
      void InboxService.markAllSeen(unreadIds);
    } catch {
      if (isMounted.current) setFailed(true);
    }
  }, [isMounted]);

  useFocusEffect(
    useCallback(() => {
      track('inbox_viewed');
      void load();
      // While the screen is open: a push that lands, or coming back to the app, refreshes it.
      const appState = AppState.addEventListener('change', (state) => {
        if (state === 'active') void load();
      });
      const received = Platform.OS === 'web' ? null : Notifications.addNotificationReceivedListener(() => void load());
      return () => {
        appState.remove();
        received?.remove();
        setNewIds(new Set());
      };
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
  const fresh = useMemo(() => feed.activity.filter((i) => newIds.has(i.id)), [feed.activity, newIds]);
  const months = useMemo(
    () => groupByMonth(feed.activity.filter((i) => !newIds.has(i.id)), Date.now(), isArabic ? 'ar' : undefined)
      .map((m) => ({ ...m, entries: foldChallenges(m.items) })),
    [feed.activity, newIds],
  );
  const needsCount = (feed.hero ? 1 : 0) + feed.cards.length;
  const hasItems = !!items && items.length > 0;
  const hasActivity = fresh.length > 0 || months.length > 0;

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

        {/* Nothing waiting: say so first, instead of opening on old history. */}
        {hasItems && !failed && needsCount === 0 && (
          <View style={styles.caughtUp}>
            <View style={styles.caughtUpIcon}>
              <MaterialCommunityIcons name="check" size={18} color={c.coral} />
            </View>
            <View style={styles.caughtUpWords}>
              <Text style={styles.caughtUpTitle}>{t('inboxFeed.caughtUp')}</Text>
              <Text style={styles.caughtUpBody}>{t('inboxFeed.caughtUpBody')}</Text>
            </View>
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

        {hasItems && hasActivity && (
          <View style={styles.activity}>
            <Text style={[styles.sectionLabel, styles.activityLabel]} accessibilityRole="header">{t('inboxFeed.activity')}</Text>
            {fresh.length > 0 && (
              <TimelineGroup
                label={t('inboxFeed.newLabel')}
                accent
                entries={fresh.map((item) => ({ kind: 'item' as const, item }))}
                onActed={onActed}
                styles={styles}
              />
            )}
            {months.map((month) => (
              <TimelineGroup key={month.key} label={month.label} entries={month.entries} onActed={onActed} styles={styles} />
            ))}
          </View>
        )}

        {hasItems && hasActivity && <Text style={styles.footer}>{t('inboxFeed.endOfList', { days: INBOX_WINDOW_DAYS })}</Text>}
      </ScrollView>
    </View>
  );
}

/** One stretch of the timeline ("New", or a month) with its line from the first dot to the last. */
function TimelineGroup({
  label,
  accent,
  entries,
  onActed,
  styles,
}: {
  label: string;
  accent?: boolean;
  entries: ActivityEntry[];
  onActed: (id: string) => void;
  styles: ReturnType<typeof getStyles>;
}) {
  return (
    <View>
      <Text style={[styles.monthLabel, accent && styles.newLabel]} accessibilityRole="header">{label}</Text>
      <View>
        {entries.length > 1 && (
          <View
            style={styles.timelineLine}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
          />
        )}
        {entries.map((entry) =>
          entry.kind === 'item'
            ? <TimelineRow key={entry.item.id} item={entry.item} onActed={onActed} />
            : <ChallengeGroupRow key={entry.key} items={entry.items} onActed={onActed} />,
        )}
      </View>
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
const LINE_START = TIMELINE_INSET + DOT / 2 - 0.75;

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
    activity: { marginTop: 28 },
    caughtUp: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginHorizontal: CARD_INSET,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    caughtUpIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.iconWell },
    caughtUpWords: { flex: 1, gap: 2 },
    caughtUpTitle: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 15 },
    caughtUpBody: { color: c.textSecondary, fontFamily: 'PlusJakartaSans-Medium', fontSize: 13 },
    newLabel: { color: c.coralText },
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
      top: ROW_MIN_HEIGHT / 2,
      bottom: ROW_MIN_HEIGHT / 2,
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
    skeletonDot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: c.inputBg },
    skeletonBar: { height: 12, borderRadius: 6, backgroundColor: c.inputBg },
  });
}
