import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { useMountedRef } from '../hooks/useMountedRef';
import { InboxService } from '../services/InboxService';
import { MessageCard } from '../components/inbox/MessageCard';
import type { GiftClaim, InboxItem } from '../lib/inbox';
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
      const list = await InboxService.fetchInbox();
      const claimIds = list.map((i) => i.claimId).filter((id): id is string => !!id);
      const claimMap = await InboxService.fetchGiftClaims(claimIds).catch(() => ({}));
      if (!isMounted.current) return;
      setItems(list);
      setClaims(claimMap);
      setFailed(false);
      // The dots stay for this visit; the badge clears now.
      const unreadIds = list.filter((i) => i.unread).map((i) => i.id);
      if (unreadIds.length > 0) void InboxService.markSeen(unreadIds);
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

        {!failed && items?.map((item) => (
          <MessageCard
            key={item.id}
            item={item}
            claim={item.claimId ? claims[item.claimId] : undefined}
            source="inbox"
          />
        ))}
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
