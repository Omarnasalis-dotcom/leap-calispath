import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { useMountedRef } from '../hooks/useMountedRef';
import { InboxService } from '../services/InboxService';
import { InboxRow } from '../components/inbox/InboxRow';
import { groupByDay, visibleItems, type DayGroup, type GiftClaim, type InboxItem } from '../lib/inbox';
import { track } from '../lib/analytics';
import { FLIP_X, t } from '../i18n';
import { TC_COLORS, TC_LAYOUT, TCPalette } from '../../constants/trainingCenterTokens';

const GROUP_LABEL = {
  today: 'inbox.today',
  week: 'inbox.thisWeek',
  earlier: 'inbox.earlier',
} as const satisfies Record<DayGroup, string>;

// The Notifications screen (/notifications): messages from the Leap team
// (news, discount codes, gifts to claim) and the app's own notifications, as
// one feed grouped Today / This week / Earlier. Opened from the bell on
// Profile or by tapping a gift push.
export function InboxScreen() {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = useMemo(() => getStyles(c), [c]);
  const isMounted = useMountedRef();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [claims, setClaims] = useState<Record<string, GiftClaim>>({});
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = visibleItems(await InboxService.fetchInbox(), Date.now());
      const claimIds = list.map((i) => i.claimId).filter((id): id is string => !!id);
      const claimMap = await InboxService.fetchGiftClaims(claimIds).catch(() => ({}));
      if (!isMounted.current) return;
      setItems(list);
      setClaims(claimMap);
      setFailed(false);
      // New ones stay marked for this visit; the badge clears now (all of it,
      // even rows the list doesn't show, so the bell can't get stuck on a number).
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

  const groups = useMemo(() => groupByDay(items ?? [], Date.now()), [items]);
  const newCount = useMemo(() => (items ?? []).filter((i) => i.unread).length, [items]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('inbox.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color={c.textPrimary} style={FLIP_X} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('inbox.title')}</Text>
          {newCount > 0 && (
            <Text style={styles.headerSub} accessibilityLiveRegion="polite">{t('inbox.newCount', { count: newCount })}</Text>
          )}
        </View>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.coral} />}
      >
        {items === null && !failed && <Skeleton styles={styles} />}

        {failed && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('inbox.loadFailed')}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>{t('inbox.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {items !== null && !failed && items.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="bell-outline" size={28} color={c.coral} />
            </View>
            <Text style={styles.emptyTitle}>{t('inbox.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('inbox.emptyBody')}</Text>
          </View>
        )}

        {!failed && groups.map(({ group, items: groupItems }) => (
          <View key={group} style={styles.group}>
            <Text style={styles.groupLabel} accessibilityRole="header">{t(GROUP_LABEL[group])}</Text>
            <View style={styles.groupList}>
              {groupItems.map((item, i) => (
                <InboxRow
                  key={item.id}
                  item={item}
                  claim={item.claimId ? claims[item.claimId] : undefined}
                  divider={i > 0}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** Grey rows in the list's shape while it loads. */
function Skeleton({ styles }: { styles: ReturnType<typeof getStyles> }) {
  return (
    <View style={styles.group} accessibilityLabel={t('inbox.loading')}>
      <View style={[styles.skeletonBar, { width: 64, marginHorizontal: 16 }]} />
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <View style={styles.skeletonIcon} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[styles.skeletonBar, { width: '60%' }]} />
            <View style={[styles.skeletonBar, { width: '90%' }]} />
          </View>
        </View>
      ))}
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
    headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
    headerTitle: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 19, letterSpacing: 1.9 },
    headerSub: { color: c.coralText, fontFamily: 'PlusJakartaSans-Bold', fontSize: 12 },
    // Rows run edge to edge; the groups carry the rhythm.
    content: { paddingTop: 4, paddingBottom: 48, gap: 22 },
    group: { gap: 8 },
    groupLabel: {
      color: c.textMuted,
      fontFamily: 'BarlowCondensed-Bold',
      fontSize: 14,
      letterSpacing: 1.4,
      paddingHorizontal: TC_LAYOUT.screenPadding,
    },
    groupList: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    empty: { alignItems: 'center', gap: 10, paddingTop: 56, paddingHorizontal: 24 },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.iconWell,
    },
    emptyTitle: { color: c.textPrimary, fontFamily: 'PlusJakartaSans-Bold', fontSize: 17, textAlign: 'center' },
    emptyText: { color: c.textMuted, fontFamily: 'PlusJakartaSans-Medium', fontSize: 14, lineHeight: 21, textAlign: 'center' },
    retryBtn: { borderColor: c.borderStrong, borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, marginTop: 6 },
    retryText: { color: c.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 1.4 },
    skeletonRow: { flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
    skeletonIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.inputBg },
    skeletonBar: { height: 11, borderRadius: 6, backgroundColor: c.inputBg },
  });
}
