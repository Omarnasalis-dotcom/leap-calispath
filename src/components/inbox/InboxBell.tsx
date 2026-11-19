import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Notifications from 'expo-notifications';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { InboxService, onInboxChanged } from '../../services/InboxService';
import { useMountedRef } from '../../hooks/useMountedRef';
import { t } from '../../i18n';

// Bell on Profile that opens the Notifications screen, with the number of
// unread items plus what still needs the person on it ("9+" above nine).
export function InboxBell({ color, style }: { color: string; style?: StyleProp<ViewStyle> }) {
  const [unread, setUnread] = useState(0);
  const isMounted = useMountedRef();

  const refresh = useCallback(() => {
    InboxService.fetchBadgeCount()
      .then((n) => {
        if (isMounted.current) setUnread(n);
      })
      .catch(() => { });
  }, [isMounted]);

  useFocusEffect(refresh);
  useEffect(() => onInboxChanged(refresh), [refresh]);
  // A message that arrived while the app was in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    // A push that lands while the app is open.
    const received = Platform.OS === 'web' ? null : Notifications.addNotificationReceivedListener(() => refresh());
    return () => {
      sub.remove();
      received?.remove();
    };
  }, [refresh]);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? t('inbox.bellUnread', { count: unread }) : t('inbox.bell')}
      style={style}
      onPress={() => router.push('/notifications')}
    >
      <MaterialCommunityIcons name="bell-outline" size={18} color={color} />
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText} allowFontScaling={false}>{badgeLabel(unread)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function badgeLabel(unread: number): string {
  return unread > 9 ? '9+' : String(unread);
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 4,
    right: 3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FC5454',
  },
  // Digits only, so the same font in English and Arabic; white on coral in both themes.
  badgeText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
  },
});
