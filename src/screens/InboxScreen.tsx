import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { useMountedRef } from '../hooks/useMountedRef';
import { InboxService } from '../services/InboxService';
import { MessageCard } from '../components/inbox/MessageCard';
import { MessageRow } from '../components/inbox/MessageRow';
import { showsFullCard, visibleItems, type GiftClaim, type InboxItem } from '../lib/inbox';
import { track } from '../lib/analytics';
import { FLIP_X, t } from '../i18n';
import { TC_COLORS, TC_LAYOUT, TCPalette } from '../../constants/trainingCenterTokens';

// Messages from the Leap team (/notifications): news, discount codes and
// gifts to claim. Opened from the bell on Profile or by tapping a gift push.
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
      // The dots stay for this visit; the badge clears now (all of it, even
      // rows the list doesn't show, so the bell can't get stuck on a number).
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

  const claimFor = (item: InboxItem) => (item.claimId ? claims[item.claimId] : undefined);

  // New ones (and a gift still to claim) are full cards at the top; the ones
  // already opened fold into one-line rows below. A tapped row opens in place
  // as a full card, so the rows around it split into separate groups.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const { fresh, earlier } = useMemo(() => {
    const now = Date.now();
    const list = items ?? [];
    const full = list.filter((i) => showsFullCard(i, i.claimId ? claims[i.claimId] : undefined, now));
    return { fresh: full, earlier: list.filter((i) => !full.includes(i)) };
  }, [items, claims]);
  const earlierGroups = useMemo(() => {
    const groups: { expanded: boolean; items: InboxItem[] }[] = [];
    for (const item of earlier) {
      const open = expanded.has(item.id);
      const last = groups[groups.length - 1];
      if (!open && last && !last.expanded) last.items.push(item);
      else groups.push({ expanded: open, items: [item] });
    }
    return groups;
  }, [earlier, expanded]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    if (isMounted.current) setRefreshing(false);
  };

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
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{t('inbox.title')}</Text>
        </View>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.coral} />}
      >
        {items === null && !failed && <ActivityIndicator color={c.coral} style={{ marginTop: 40 }} />}

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

        {!failed && fresh.map((item) => (
          <MessageCard key={item.id} item={item} claim={claimFor(item)} source="inbox" />
        ))}

        {!failed && earlier.length > 0 && (
          <>
            {fresh.length > 0 && <Text style={styles.sectionLabel}>{t('inbox.earlier')}</Text>}
            {earlierGroups.map((group) =>
              group.expanded ? (
                <MessageCard
                  key={group.items[0].id}
                  item={group.items[0]}
                  claim={claimFor(group.items[0])}
                  source="inbox"
                  onCollapse={() => toggle(group.items[0].id)}
                />
              ) : (
                <View key={group.items[0].id} style={styles.group}>
                  {group.items.map((item, i) => (
                    <MessageRow
                      key={item.id}
                      item={item}
                      claim={claimFor(item)}
                      divider={i > 0}
                      onPress={() => toggle(item.id)}
                    />
                  ))}
                </View>
              ),
            )}
          </>
        )}
      </ScrollView>
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
    content: { padding: TC_LAYOUT.screenPadding, paddingBottom: 48, gap: 12 },
    sectionLabel: {
      color: c.textMuted,
      fontFamily: 'BarlowCondensed-Bold',
      fontSize: 13,
      letterSpacing: 1.4,
      marginTop: 8,
      marginBottom: -4,
    },
    group: {
      backgroundColor: c.cardRaised,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 16,
      overflow: 'hidden',
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
  });
}
